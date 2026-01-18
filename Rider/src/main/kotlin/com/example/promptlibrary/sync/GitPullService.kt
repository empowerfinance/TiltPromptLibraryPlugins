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
import java.util.concurrent.CountDownLatch

data class PullResult(val success: Boolean, val error: String? = null)

object GitPullService {
    fun fetch(project: Project, repoRoot: File) {
        SyncLog.info("Fetching from all remotes...")
        val git = Git.getInstance()
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot)
        if (vf == null) {
            val msg = "Repo path not found: ${repoRoot}"
            SyncLog.error(msg)
            Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", msg, NotificationType.WARNING))
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
                    SyncLog.info("Fetched remotes successfully")
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Fetched remotes", NotificationType.INFORMATION))
                } else {
                    val errMsg = "Fetch failed: ${fetchResult.errorOutputAsJoinedString}"
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                }
            } catch (e: Exception) {
                val errMsg = "Error: ${e.message}"
                SyncLog.error(errMsg)
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
            }
        }
    }

    fun pull(project: Project, repoRoot: File, branchName: String?) {
        SyncLog.info("Pulling from remote...")
        val git = Git.getInstance()
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot)
        if (vf == null) {
            val msg = "Repo path not found: ${repoRoot}"
            SyncLog.error(msg)
            Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", msg, NotificationType.WARNING))
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
                    SyncLog.info("Pulled successfully")
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Pulled", NotificationType.INFORMATION))
                } else {
                    val errMsg = "Pull failed: ${result.errorOutputAsJoinedString}"
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                }
            } catch (e: Exception) {
                val errMsg = "Error: ${e.message}"
                SyncLog.error(errMsg)
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
            }
        }
    }

    /**
     * Synchronous pull that returns a result. Use this before push operations.
     * Returns success=true if pull succeeded, or success=false with error message if failed.
     */
    fun pullSync(project: Project, repoRoot: File): PullResult {
        SyncLog.info("Pulling (sync) from remote...")
        val git = Git.getInstance()
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot)
            ?: run {
                val msg = "Repo path not found: $repoRoot"
                SyncLog.error(msg)
                return PullResult(false, msg)
            }

        var result = PullResult(false, "Unknown error")
        val latch = CountDownLatch(1)

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                // Get current branch name
                val currentBranch = GitUtils.currentBranch(project, repoRoot) ?: "main"

                // Fetch from origin first
                SyncLog.info("Fetching from origin...")
                val fetchHandler = GitLineHandler(project, vf, GitCommand.FETCH).apply {
                    addParameters("origin")
                    endOptions()
                }
                git.runCommand(fetchHandler)

                // Then pull with rebase, explicitly specifying origin and branch
                SyncLog.info("Pulling with rebase from origin/$currentBranch...")
                val pullHandler = GitLineHandler(project, vf, GitCommand.PULL).apply {
                    addParameters("--rebase", "origin", currentBranch)
                    endOptions()
                }
                val pullResult = git.runCommand(pullHandler)
                result = if (pullResult.success()) {
                    SyncLog.info("Pull successful")
                    PullResult(true)
                } else {
                    val errMsg = pullResult.errorOutputAsJoinedString
                    SyncLog.error("Pull failed: $errMsg")
                    PullResult(false, errMsg)
                }
            } catch (e: Exception) {
                val errMsg = e.message ?: "Unknown error"
                SyncLog.error("Pull error: $errMsg")
                result = PullResult(false, errMsg)
            } finally {
                latch.countDown()
            }
        }
        latch.await()
        return result
    }
}

