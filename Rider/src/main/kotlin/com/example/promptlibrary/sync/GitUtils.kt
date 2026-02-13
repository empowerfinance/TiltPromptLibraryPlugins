package com.example.promptlibrary.sync

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import git4idea.commands.Git
import git4idea.commands.GitCommand
import git4idea.commands.GitLineHandler
import java.io.File

object GitUtils {
    fun isUnborn(project: Project, repoRoot: File): Boolean {
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot) ?: return true
        val git = Git.getInstance()
        // rev-parse --verify HEAD returns non-zero on unborn
        val handler = GitLineHandler(project, vf, GitCommand.REV_PARSE).apply {
            addParameters("--verify", "HEAD")
            endOptions()
        }
        val result = git.runCommand(handler)
        return !result.success()
    }

    fun currentBranch(project: Project, repoRoot: File): String? {
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot) ?: return null
        val git = Git.getInstance()
        val handler = GitLineHandler(project, vf, GitCommand.BRANCH).apply {
            addParameters("--show-current")
            endOptions()
        }
        val result = git.runCommand(handler)
        return if (result.success()) result.outputAsJoinedString.trim().ifEmpty { null } else null
    }

    /**
     * Check if we're in detached HEAD state (not on a branch)
     */
    fun isDetachedHead(project: Project, repoRoot: File): Boolean {
        return currentBranch(project, repoRoot) == null && !isUnborn(project, repoRoot)
    }

    /**
     * Get the default branch name (main or master) by checking what exists on origin
     */
    fun getDefaultBranch(project: Project, repoRoot: File): String {
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot) ?: return "main"
        val git = Git.getInstance()

        // Check if origin/main exists
        val checkMain = GitLineHandler(project, vf, GitCommand.REV_PARSE).apply {
            addParameters("--verify", "origin/main")
            endOptions()
        }
        if (git.runCommand(checkMain).success()) return "main"

        // Check if origin/master exists
        val checkMaster = GitLineHandler(project, vf, GitCommand.REV_PARSE).apply {
            addParameters("--verify", "origin/master")
            endOptions()
        }
        if (git.runCommand(checkMaster).success()) return "master"

        return "main" // Default fallback
    }

    /**
     * Checkout a branch. Returns true if successful.
     */
    fun checkout(project: Project, repoRoot: File, branchName: String): Boolean {
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot) ?: return false
        val git = Git.getInstance()
        val handler = GitLineHandler(project, vf, GitCommand.CHECKOUT).apply {
            addParameters(branchName)
            endOptions()
        }
        return git.runCommand(handler).success()
    }

    /**
     * Ensure we're on a branch (not in detached HEAD state).
     * If in detached HEAD, checkout the default branch (main/master).
     * Returns the branch name we're now on, or null if we couldn't fix it.
     */
    fun ensureOnBranch(project: Project, repoRoot: File): String? {
        // First check current branch
        val current = currentBranch(project, repoRoot)
        if (current != null) return current

        // If repo is unborn (no commits), just return "main" - git will figure it out
        if (isUnborn(project, repoRoot)) return "main"

        // We're in detached HEAD state - try to checkout default branch
        val defaultBranch = getDefaultBranch(project, repoRoot)
        SyncLog.warn("Detached HEAD detected, checking out $defaultBranch...")

        return if (checkout(project, repoRoot, defaultBranch)) {
            SyncLog.info("Checked out $defaultBranch")
            defaultBranch
        } else {
            SyncLog.error("Failed to checkout $defaultBranch")
            null
        }
    }

    /**
     * Check if there's a rebase in progress (leftover rebase-merge or rebase-apply directory)
     */
    fun isRebaseInProgress(repoRoot: File): Boolean {
        val rebaseMerge = File(repoRoot, ".git/rebase-merge")
        val rebaseApply = File(repoRoot, ".git/rebase-apply")
        return rebaseMerge.exists() || rebaseApply.exists()
    }

    /**
     * Abort any in-progress rebase. Returns true if successful or no rebase was in progress.
     */
    fun abortRebaseIfNeeded(project: Project, repoRoot: File): Boolean {
        if (!isRebaseInProgress(repoRoot)) return true

        SyncLog.warn("Rebase in progress detected, aborting...")
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot) ?: return false
        val git = Git.getInstance()
        val handler = GitLineHandler(project, vf, GitCommand.REBASE).apply {
            addParameters("--abort")
            // Don't call endOptions() - it adds "--" which breaks this command
        }
        val result = git.runCommand(handler)
        return if (result.success()) {
            SyncLog.info("Rebase aborted successfully")
            true
        } else {
            // If abort fails, try to manually remove the rebase directory as a fallback
            SyncLog.warn("git rebase --abort failed, trying manual cleanup...")
            val rebaseMerge = File(repoRoot, ".git/rebase-merge")
            val rebaseApply = File(repoRoot, ".git/rebase-apply")
            try {
                if (rebaseMerge.exists()) rebaseMerge.deleteRecursively()
                if (rebaseApply.exists()) rebaseApply.deleteRecursively()
                SyncLog.info("Manually cleaned up rebase state")
                true
            } catch (e: Exception) {
                SyncLog.error("Failed to cleanup rebase state: ${e.message}")
                false
            }
        }
    }

    /**
     * Clean up any broken git state (abort rebase, etc.) and ensure we're on a branch.
     * Use this before any sync operation.
     */
    fun cleanupAndEnsureOnBranch(project: Project, repoRoot: File): String? {
        // First, abort any in-progress rebase
        abortRebaseIfNeeded(project, repoRoot)

        // Then ensure we're on a branch
        return ensureOnBranch(project, repoRoot)
    }

    /**
     * Get the git user name from git config.
     * Returns the user.name if configured, or null if not set.
     */
    fun getGitUserName(project: Project, repoRoot: File): String? {
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot) ?: return null
        val git = Git.getInstance()
        val handler = GitLineHandler(project, vf, GitCommand.CONFIG).apply {
            addParameters("user.name")
            endOptions()
        }
        val result = git.runCommand(handler)
        return if (result.success()) result.outputAsJoinedString.trim().ifEmpty { null } else null
    }

    /**
     * Generate a unique branch name using the git user name and a random suffix.
     * Format: prompts/sync/{user-name}-{random6chars}
     * Falls back to timestamp if user name is not available.
     */
    fun generateBranchName(userName: String?): String {
        val randomSuffix = java.util.UUID.randomUUID().toString().take(6)

        if (!userName.isNullOrBlank()) {
            // Sanitize the user name for git branch naming:
            // - Convert to lowercase
            // - Replace spaces and special chars with hyphens
            // - Remove consecutive hyphens
            // - Trim hyphens from start/end
            val sanitized = userName
                .lowercase()
                .replace(Regex("[^a-z0-9-]"), "-")
                .replace(Regex("-+"), "-")
                .trim('-')

            if (sanitized.isNotEmpty()) {
                return "prompts/sync/$sanitized-$randomSuffix"
            }
        }

        // Fallback to timestamp if no valid user name
        val timestamp = java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmm")
            .format(java.time.LocalDateTime.now())
        return "prompts/sync/$timestamp-$randomSuffix"
    }
}

