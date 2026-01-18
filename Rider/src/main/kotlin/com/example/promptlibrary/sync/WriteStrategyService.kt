package com.example.promptlibrary.sync

import com.example.promptlibrary.repository.PromptRepository
import com.example.promptlibrary.settings.PluginSettingsService
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import git4idea.commands.Git
import git4idea.commands.GitCommand
import git4idea.commands.GitLineHandler
import java.io.File

object WriteStrategyService {
    // Public entry: rewrite files from repository first, then commit/push
    fun write(project: Project, repository: PromptRepository) {
        val repoRoot = workingCopy(project) ?: return
        val settings = PluginSettingsService.instance().data
        val yamlRoot = File(repoRoot, settings.promptsSubdir)
        val shared = repository.getSharedGroups()
        GitYamlWriter.writeSharedGroups(yamlRoot, shared)
        commitUsingStrategy(project, repoRoot)
    }

    // Public entry for SyncOrchestrator: assume files are already written; just commit/push
    fun commitUsingStrategy(project: Project, repoRoot: File): Boolean {
        return when (PluginSettingsService.instance().data.writeStrategy) {
            PluginSettingsService.WriteStrategy.DIRECT -> directCommit(project, repoRoot)
            PluginSettingsService.WriteStrategy.BRANCH_PR -> branchAndCommit(project, repoRoot)
        }
    }

    // Public entry for SyncOpsPanel: write YAML files and direct commit
    fun directCommit(project: Project, repository: PromptRepository) {
        val repoRoot = workingCopy(project) ?: return
        val settings = PluginSettingsService.instance().data
        val yamlRoot = File(repoRoot, settings.promptsSubdir)
        val shared = repository.getSharedGroups()
        GitYamlWriter.writeSharedGroups(yamlRoot, shared)
        directCommit(project, repoRoot)
    }

    // Public entry for SyncOpsPanel: write YAML files and create branch + PR
    fun branchAndCommit(project: Project, repository: PromptRepository) {
        val repoRoot = workingCopy(project) ?: return
        val settings = PluginSettingsService.instance().data
        val yamlRoot = File(repoRoot, settings.promptsSubdir)
        val shared = repository.getSharedGroups()
        GitYamlWriter.writeSharedGroups(yamlRoot, shared)
        branchAndCommit(project, repoRoot)
    }

    private fun workingCopy(project: Project): File? {
        val s = PluginSettingsService.instance().data
        return if (s.repoPath.isNotBlank()) File(s.repoPath) else GitRepoManager.ensureWorkingCopy(project).first
            ?: run {
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "No working copy available", NotificationType.WARNING))
                null
            }
    }

    private fun hasStagedChanges(project: Project, vfRoot: com.intellij.openapi.vfs.VirtualFile, subdir: String): Boolean {
        val git = Git.getInstance()
        val status = GitLineHandler(project, vfRoot, GitCommand.STATUS).apply {
            addParameters("--porcelain")
            addParameters("--", subdir)
            endOptions()
        }
        val result = git.runCommand(status)
        return result.success() && result.output.isNotEmpty()
    }

    private fun directCommit(project: Project, repoRoot: File): Boolean {
        SyncLog.info("Direct commit: starting...")
        val git = Git.getInstance()
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot)
            ?: run {
                val msg = "Repo path not found: ${repoRoot}"
                SyncLog.error(msg)
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", msg, NotificationType.WARNING))
                return false
            }

        var committed = false
        val latch = java.util.concurrent.CountDownLatch(1)
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                // STEP 1: Stage all changes FIRST (before pull, to avoid "unstaged changes" error)
                SyncLog.info("Staging all changes...")
                git.runCommand(GitLineHandler(project, vf, GitCommand.ADD).apply {
                    addParameters("--all")
                    endOptions()
                })

                // STEP 2: Commit local changes (or initialize if unborn)
                SyncLog.info("Committing changes...")
                val commit = GitLineHandler(project, vf, GitCommand.COMMIT).apply {
                    addParameters("-m", "feat(prompts): sync prompt library")
                    endOptions()
                }
                var commitResult = git.runCommand(commit)
                if (!commitResult.success() && GitUtils.isUnborn(project, repoRoot)) {
                    val init = GitLineHandler(project, vf, GitCommand.COMMIT).apply {
                        addParameters("--allow-empty", "-m", "chore(repo): initialize prompt library")
                        endOptions()
                    }
                    commitResult = git.runCommand(init)
                    if (commitResult.success()) {
                        SyncLog.info("Initialized empty repo")
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Initialized empty repo", NotificationType.INFORMATION))
                    }
                }

                // If nothing to commit, we still need to check if we're behind remote
                val hasLocalCommit = commitResult.success()

                // STEP 3: Clean up git state and ensure we're on a branch, then pull with rebase
                val currentBranch = GitUtils.cleanupAndEnsureOnBranch(project, repoRoot)
                if (currentBranch == null) {
                    val errMsg = "Not on a branch. Please checkout a branch manually in terminal."
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                    latch.countDown(); return@executeOnPooledThread
                }
                SyncLog.info("Fetching from origin...")

                // Fetch first
                git.runCommand(GitLineHandler(project, vf, GitCommand.FETCH).apply {
                    addParameters("origin")
                    endOptions()
                })

                // Pull with rebase
                SyncLog.info("Pulling with rebase from origin/$currentBranch...")
                val pullHandler = GitLineHandler(project, vf, GitCommand.PULL).apply {
                    addParameters("--rebase", "origin", currentBranch)
                    endOptions()
                }
                val pullResult = git.runCommand(pullHandler)
                if (!pullResult.success()) {
                    // Check if we're in a conflict state and abort the rebase to leave repo clean
                    if (GitUtils.isRebaseInProgress(repoRoot)) {
                        SyncLog.warn("Rebase conflict detected, aborting to leave repo in clean state...")
                        GitUtils.abortRebaseIfNeeded(project, repoRoot)
                    }
                    val errMsg = "Pull failed due to conflicts. Your local changes conflict with remote. Use 'Force Pull & Sync' to discard local and get remote version."
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                    latch.countDown(); return@executeOnPooledThread
                }

                // STEP 4: Push to remote (if we had local changes)
                if (hasLocalCommit) {
                    SyncLog.info("Pushing to remote...")
                    val pushResult = git.runCommand(GitLineHandler(project, vf, GitCommand.PUSH))
                    committed = pushResult.success()
                    if (pushResult.success()) {
                        SyncLog.info("Pushed changes successfully")
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Pushed changes", NotificationType.INFORMATION))
                    } else {
                        val errMsg = "Push failed: ${pushResult.errorOutputAsJoinedString}"
                        SyncLog.error(errMsg)
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                    }
                } else {
                    SyncLog.info("No changes to sync")
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "No changes to sync", NotificationType.INFORMATION))
                    committed = true // No changes needed, consider it success
                }
            } catch (e: Exception) {
                val errMsg = "Error: ${e.message}"
                SyncLog.error(errMsg)
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
            } finally { latch.countDown() }
        }
        latch.await()
        return committed
    }

    private fun branchAndCommit(project: Project, repoRoot: File): Boolean {
        SyncLog.info("Branch & PR: starting...")
        val git = Git.getInstance()
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot)
            ?: run {
                val msg = "Repo path not found: ${repoRoot}"
                SyncLog.error(msg)
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", msg, NotificationType.WARNING))
                return false
            }

        var committed = false
        val latch = java.util.concurrent.CountDownLatch(1)
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                // Clean up git state and ensure we're on a branch first
                val currentBranch = GitUtils.cleanupAndEnsureOnBranch(project, repoRoot)
                if (currentBranch == null) {
                    val errMsg = "Not on a branch. Please checkout a branch manually in terminal."
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                    latch.countDown(); return@executeOnPooledThread
                }

                // STEP 1: Stage all changes FIRST (before pull, to avoid "unstaged changes" error)
                SyncLog.info("Staging all changes...")
                git.runCommand(GitLineHandler(project, vf, GitCommand.ADD).apply {
                    addParameters("--all")
                    endOptions()
                })

                // STEP 2: Commit local changes on current branch first (if any)
                SyncLog.info("Committing changes...")
                val preCommit = git.runCommand(GitLineHandler(project, vf, GitCommand.COMMIT).apply {
                    addParameters("-m", "feat(prompts): sync prompt library (pre-branch)")
                    endOptions()
                })
                val hadLocalChanges = preCommit.success()

                // STEP 3: Fetch and pull with rebase (now safe because local changes are committed)
                SyncLog.info("Fetching from origin...")
                git.runCommand(GitLineHandler(project, vf, GitCommand.FETCH).apply {
                    addParameters("origin")
                    endOptions()
                })

                SyncLog.info("Pulling with rebase from origin/$currentBranch...")
                val pullResult = git.runCommand(GitLineHandler(project, vf, GitCommand.PULL).apply {
                    addParameters("--rebase", "origin", currentBranch)
                    endOptions()
                })
                if (!pullResult.success()) {
                    // Check if we're in a conflict state and abort the rebase to leave repo clean
                    if (GitUtils.isRebaseInProgress(repoRoot)) {
                        SyncLog.warn("Rebase conflict detected, aborting to leave repo in clean state...")
                        GitUtils.abortRebaseIfNeeded(project, repoRoot)
                    }
                    val errMsg = "Pull failed due to conflicts. Your local changes conflict with remote. Use 'Force Pull & Sync' to discard local and get remote version."
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                    latch.countDown(); return@executeOnPooledThread
                }

                // STEP 4: Create new branch
                val name = "prompts/sync/" + java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmm").format(java.time.LocalDateTime.now())
                SyncLog.info("Creating branch: $name")
                val coRes = git.runCommand(GitLineHandler(project, vf, GitCommand.CHECKOUT).apply {
                    addParameters("-b", name)
                    endOptions()
                })
                if (!coRes.success()) {
                    val errMsg = "Branch create failed: ${coRes.errorOutputAsJoinedString}"
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                    latch.countDown(); return@executeOnPooledThread
                }

                // If we had local changes, they're already committed, just push
                if (!hadLocalChanges) {
                    SyncLog.info("Nothing to commit")
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Nothing to commit", NotificationType.INFORMATION))
                    latch.countDown(); return@executeOnPooledThread
                }

                // STEP 5: Push to remote
                SyncLog.info("Pushing branch $name to origin...")
                val pushResult = git.runCommand(GitLineHandler(project, vf, GitCommand.PUSH).apply {
                    addParameters("-u", "origin", name)
                    endOptions()
                })
                committed = pushResult.success()
                if (pushResult.success()) {
                    SyncLog.info("Pushed branch $name successfully")
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Pushed branch ${name}", NotificationType.INFORMATION))
                } else {
                    val errMsg = "Push failed: ${pushResult.errorOutputAsJoinedString}"
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                }

                // Try to open compare URL if remote looks like GitHub SSH
                val remoteUrl = PluginSettingsService.instance().data.remoteRepoUrl
                val m = Regex("git@github.com:([^/]+)/([^.]+)(?:.git)?").find(remoteUrl)
                if (pushResult.success() && m != null) {
                    val (owner, repoName) = m.destructured
                    SyncLog.info("Opening GitHub compare page...")
                    PRActions.openCompare(owner, repoName, currentBranch, name)
                }
            } catch (e: Exception) {
                val errMsg = "Error: ${e.message}"
                SyncLog.error(errMsg)
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
            } finally { latch.countDown() }
        }
        latch.await()
        return committed
    }
}

