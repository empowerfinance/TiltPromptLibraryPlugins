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
        val git = Git.getInstance()
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot)
            ?: run {
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Repo path not found: ${repoRoot}", NotificationType.WARNING))
                return false
            }

        var committed = false
        val latch = java.util.concurrent.CountDownLatch(1)
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                // STEP 1: Stage all changes FIRST (before pull, to avoid "unstaged changes" error)
                git.runCommand(GitLineHandler(project, vf, GitCommand.ADD).apply {
                    addParameters("--all")
                    endOptions()
                })

                // STEP 2: Commit local changes (or initialize if unborn)
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
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Initialized empty repo", NotificationType.INFORMATION))
                    }
                }

                // If nothing to commit, we still need to check if we're behind remote
                val hasLocalCommit = commitResult.success()

                // STEP 3: Pull with rebase (now safe because local changes are committed)
                val currentBranch = GitUtils.currentBranch(project, repoRoot) ?: "main"

                // Fetch first
                git.runCommand(GitLineHandler(project, vf, GitCommand.FETCH).apply {
                    addParameters("origin")
                    endOptions()
                })

                // Pull with rebase
                val pullHandler = GitLineHandler(project, vf, GitCommand.PULL).apply {
                    addParameters("--rebase", "origin", currentBranch)
                    endOptions()
                }
                val pullResult = git.runCommand(pullHandler)
                if (!pullResult.success()) {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Pull failed: ${pullResult.errorOutputAsJoinedString}. Please resolve conflicts manually.", NotificationType.ERROR))
                    latch.countDown(); return@executeOnPooledThread
                }

                // STEP 4: Push to remote (if we had local changes)
                if (hasLocalCommit) {
                    val pushResult = git.runCommand(GitLineHandler(project, vf, GitCommand.PUSH))
                    committed = pushResult.success()
                    if (pushResult.success()) Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Pushed changes", NotificationType.INFORMATION))
                    else Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Push failed: ${pushResult.errorOutputAsJoinedString}", NotificationType.ERROR))
                } else {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "No changes to sync", NotificationType.INFORMATION))
                    committed = true // No changes needed, consider it success
                }
            } catch (e: Exception) {
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Error: ${e.message}", NotificationType.ERROR))
            } finally { latch.countDown() }
        }
        latch.await()
        return committed
    }

    private fun branchAndCommit(project: Project, repoRoot: File): Boolean {
        val git = Git.getInstance()
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot)
            ?: run {
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Repo path not found: ${repoRoot}", NotificationType.WARNING))
                return false
            }

        var committed = false
        val latch = java.util.concurrent.CountDownLatch(1)
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val currentBranch = GitUtils.currentBranch(project, repoRoot) ?: "main"

                // STEP 1: Stage all changes FIRST (before pull, to avoid "unstaged changes" error)
                git.runCommand(GitLineHandler(project, vf, GitCommand.ADD).apply {
                    addParameters("--all")
                    endOptions()
                })

                // STEP 2: Commit local changes on current branch first (if any)
                val preCommit = git.runCommand(GitLineHandler(project, vf, GitCommand.COMMIT).apply {
                    addParameters("-m", "feat(prompts): sync prompt library (pre-branch)")
                    endOptions()
                })
                val hadLocalChanges = preCommit.success()

                // STEP 3: Fetch and pull with rebase (now safe because local changes are committed)
                git.runCommand(GitLineHandler(project, vf, GitCommand.FETCH).apply {
                    addParameters("origin")
                    endOptions()
                })

                val pullResult = git.runCommand(GitLineHandler(project, vf, GitCommand.PULL).apply {
                    addParameters("--rebase", "origin", currentBranch)
                    endOptions()
                })
                if (!pullResult.success()) {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Pull failed: ${pullResult.errorOutputAsJoinedString}. Please resolve conflicts manually.", NotificationType.ERROR))
                    latch.countDown(); return@executeOnPooledThread
                }

                // STEP 4: Create new branch
                val name = "prompts/sync/" + java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmm").format(java.time.LocalDateTime.now())
                val coRes = git.runCommand(GitLineHandler(project, vf, GitCommand.CHECKOUT).apply {
                    addParameters("-b", name)
                    endOptions()
                })
                if (!coRes.success()) {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Branch create failed: ${coRes.errorOutputAsJoinedString}", NotificationType.ERROR))
                    latch.countDown(); return@executeOnPooledThread
                }

                // If we had local changes, they're already committed, just push
                if (!hadLocalChanges) {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Nothing to commit", NotificationType.INFORMATION))
                    latch.countDown(); return@executeOnPooledThread
                }

                // STEP 5: Push to remote
                val pushResult = git.runCommand(GitLineHandler(project, vf, GitCommand.PUSH).apply {
                    addParameters("-u", "origin", name)
                    endOptions()
                })
                committed = pushResult.success()
                if (pushResult.success()) Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Pushed branch ${name}", NotificationType.INFORMATION))
                else Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Push failed: ${pushResult.errorOutputAsJoinedString}", NotificationType.ERROR))

                // Try to open compare URL if remote looks like GitHub SSH
                val remoteUrl = PluginSettingsService.instance().data.remoteRepoUrl
                val m = Regex("git@github.com:([^/]+)/([^.]+)(?:.git)?").find(remoteUrl)
                if (pushResult.success() && m != null) {
                    val (owner, repoName) = m.destructured
                    PRActions.openCompare(owner, repoName, currentBranch, name)
                }
            } catch (e: Exception) {
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Error: ${e.message}", NotificationType.ERROR))
            } finally { latch.countDown() }
        }
        latch.await()
        return committed
    }
}

