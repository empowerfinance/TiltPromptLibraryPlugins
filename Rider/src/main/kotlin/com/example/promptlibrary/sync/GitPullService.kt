package com.example.promptlibrary.sync

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

object GitPullService {
    fun fetch(project: Project, repoRoot: File) {
        val git = Git.getInstance()
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot)
        if (vf == null) {
            Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Repo path not found: ${repoRoot}", NotificationType.WARNING))
            return
        }
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val fetchHandler = GitLineHandler(project, vf, GitCommand.FETCH).apply {
                    addParameters("--all")
                    endOptions()
                }
                val fetchResult = git.runCommand(fetchHandler)
                if (fetchResult.success()) {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Fetched remotes", NotificationType.INFORMATION))
                } else {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Fetch failed: ${fetchResult.errorOutputAsJoinedString}", NotificationType.ERROR))
                }
            } catch (e: Exception) {
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Error: ${e.message}", NotificationType.ERROR))
            }
        }
    }

    fun pull(project: Project, repoRoot: File, branchName: String?) {
        val git = Git.getInstance()
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot)
        if (vf == null) {
            Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Repo path not found: ${repoRoot}", NotificationType.WARNING))
            return
        }
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val fetchHandler = GitLineHandler(project, vf, GitCommand.FETCH).apply {
                    addParameters("--all")
                    endOptions()
                }
                git.runCommand(fetchHandler)

                val pullHandler = GitLineHandler(project, vf, GitCommand.PULL).apply {
                    addParameters("--rebase")
                    endOptions()
                }
                val result = git.runCommand(pullHandler)
                if (result.success()) {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Pulled", NotificationType.INFORMATION))
                } else {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Pull failed: ${result.errorOutputAsJoinedString}", NotificationType.ERROR))
                }
            } catch (e: Exception) {
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Error: ${e.message}", NotificationType.ERROR))
            }
        }
    }
}

