package com.example.promptlibrary.sync

import com.example.promptlibrary.settings.PluginSettingsService
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import git4idea.commands.Git
import git4idea.commands.GitCommand
import git4idea.commands.GitLineHandler
import java.io.File

object GitRepoManager {
    private fun computeTarget(remoteUrl: String): File {
        val baseDir = File(System.getProperty("java.io.tmpdir"), "promptlib-repos").apply { mkdirs() }
        val name = remoteUrl.substringAfterLast('/').removeSuffix(".git")
        return File(baseDir, name)
    }

    fun ensureWorkingCopy(project: Project): Pair<File?, File?> {
        val s = PluginSettingsService.instance().data
        val remoteUrl = s.remoteRepoUrl.trim()
        val git = Git.getInstance()

        // If user provided a local path, prefer it as the working copy
        // Use expandPath to handle tilde (~) expansion, matching VS Code behavior
        val rawRepoPath = s.repoPath.trim()
        if (rawRepoPath.isNotBlank()) {
            val expandedPath = PluginSettingsService.expandPath(rawRepoPath)
            val repoRoot = File(expandedPath)

            // If the path doesn't exist and we have a remote URL, try to clone
            if (!repoRoot.exists() && remoteUrl.isNotEmpty()) {
                // Create parent directory if needed
                repoRoot.parentFile?.mkdirs()

                val handler = GitLineHandler(project, LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot.parentFile)!!, GitCommand.CLONE).apply {
                    addParameters(remoteUrl)
                    addParameters(repoRoot.absolutePath)
                    endOptions()
                }
                val result = git.runCommand(handler)
                if (!result.success()) {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Clone failed: ${result.errorOutputAsJoinedString}", NotificationType.ERROR))
                    return null to null
                }
            }

            // Verify it's a valid git repository
            if (!repoRoot.exists() || !repoRoot.isDirectory || !File(repoRoot, ".git").exists()) {
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Local repo path is not a valid Git repository", NotificationType.ERROR))
                return null to null
            }
            return repoRoot to repoRoot
        }

        if (remoteUrl.isNotEmpty()) {
            val target = computeTarget(remoteUrl)
            // If target exists but is not a git repo, nuke and reclone
            if (target.exists() && !File(target, ".git").exists()) {
                target.deleteRecursively()
            }
            if (!target.exists()) {
                val handler = GitLineHandler(project, LocalFileSystem.getInstance().refreshAndFindFileByIoFile(target.parentFile)!!, GitCommand.CLONE).apply {
                    addParameters(remoteUrl)
                    addParameters(target.absolutePath)
                    endOptions()
                }
                val result = git.runCommand(handler)
                if (!result.success()) {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Clone failed: ${result.errorOutputAsJoinedString}", NotificationType.ERROR))
                    return null to null
                }
            }
            return target to target
        }
        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Set either a local path or a remote URL in settings.", NotificationType.WARNING))
        return null to null
    }

    fun nukeWorkingCopy(project: Project? = null) {
        val s = PluginSettingsService.instance().data
        val path = if (s.repoPath.isNotBlank()) s.repoPath else if (s.remoteRepoUrl.isNotBlank()) computeTarget(s.remoteRepoUrl).absolutePath else null
        if (path == null) {
            Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "No working copy configured", NotificationType.INFORMATION))
            return
        }
        val dir = File(path)
        if (!dir.exists()) {
            Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Working copy already removed", NotificationType.INFORMATION))
            return
        }
        val ok = dir.deleteRecursively()
        if (ok) Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Local working copy removed", NotificationType.INFORMATION))
        else Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Failed to remove local working copy", NotificationType.ERROR))
    }
}

