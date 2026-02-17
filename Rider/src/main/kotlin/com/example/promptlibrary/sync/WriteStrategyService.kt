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
        val shared = repository.getSharedGroups()

        // Partition groups by libraryId and write to each library
        val enabledLibraries = PluginSettingsService.getEnabledLibraries()
        val libraryGroups = partitionGroupsByLibrary(shared)
        GitYamlWriter.writeToLibraries(repoRoot, libraryGroups, enabledLibraries)

        commitUsingStrategy(project, repoRoot)
    }

    /**
     * Partitions groups by their libraryId.
     * Returns a map from libraryId to the list of groups belonging to that library.
     * Groups without a libraryId are skipped.
     */
    private fun partitionGroupsByLibrary(groups: List<com.example.promptlibrary.model.Group>): Map<String, List<com.example.promptlibrary.model.Group>> {
        return groups.filter { it.libraryId != null }
            .groupBy { it.libraryId!! }
    }

    // Public entry for SyncOrchestrator: assume files are already written; just commit/push
    // Note: This runs asynchronously on a background thread and notifies the user via notifications.
    fun commitUsingStrategy(project: Project, repoRoot: File) {
        when (PluginSettingsService.instance().data.writeStrategy) {
            PluginSettingsService.WriteStrategy.DIRECT -> directCommit(project, repoRoot)
            PluginSettingsService.WriteStrategy.BRANCH_PR -> branchAndCommit(project, repoRoot)
        }
    }

    // Public entry for SyncOpsPanel: stage, commit, and push changes
    // Note: We do NOT call writeSharedGroups() here because prompts are already written to disk
    // when they are created/moved via writeSinglePrompt(). We just need to commit whatever is on disk.
    // This also avoids the issue where promptsSubdir might point to a different library than where
    // the user's prompts actually are (e.g., promptsSubdir="general" but prompt is in "TestLib").
    fun directCommit(project: Project, repository: PromptRepository) {
        val repoRoot = workingCopy(project) ?: return
        directCommit(project, repoRoot)
    }

    // Public entry for SyncOpsPanel: stage, commit, and create branch + PR
    // Note: Same as directCommit - we don't call writeSharedGroups() because prompts are already on disk.
    fun branchAndCommit(project: Project, repository: PromptRepository) {
        val repoRoot = workingCopy(project) ?: return
        branchAndCommit(project, repoRoot)
    }

    private fun workingCopy(project: Project): File? {
        val s = PluginSettingsService.instance().data
        // Use getEffectiveRepoPath() to expand tilde and get the actual path
        val repoPath = PluginSettingsService.getEffectiveRepoPath()
        return if (repoPath.isNotBlank()) File(repoPath) else GitRepoManager.ensureWorkingCopy(project).first
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

    private fun directCommit(project: Project, repoRoot: File) {
        SyncLog.info("Direct commit: starting...")
        val git = Git.getInstance()
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot)
            ?: run {
                val msg = "Repo path not found: ${repoRoot}"
                SyncLog.error(msg)
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", msg, NotificationType.WARNING))
                return
            }

        // Run git operations on a background thread to avoid blocking the UI
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
                SyncLog.info("Commit result: success=${commitResult.success()}, exitCode=${commitResult.exitCode}, output=${commitResult.output.take(300)}")
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
                    return@executeOnPooledThread
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
                SyncLog.info("Pull result: success=${pullResult.success()}, exitCode=${pullResult.exitCode}, output=${pullResult.output.take(500)}, errorOutput=${pullResult.errorOutput.take(500)}")
                if (!pullResult.success()) {
                    val errorOutput = pullResult.errorOutputAsJoinedString

                    // Check for specific error types
                    val errMsg = when {
                        errorOutput.contains("not a git repository") ->
                            "Not a git repository. Check your repo path in settings: $repoRoot"
                        GitUtils.isRebaseInProgress(repoRoot) -> {
                            SyncLog.warn("Rebase conflict detected, aborting to leave repo in clean state...")
                            GitUtils.abortRebaseIfNeeded(project, repoRoot)
                            "Pull failed due to conflicts. Your local changes conflict with remote. Use 'Force Pull & Sync' to discard local and get remote version."
                        }
                        else -> "Pull failed: $errorOutput"
                    }
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                    return@executeOnPooledThread
                }

                // STEP 4: Check if we're ahead of origin and need to push
                val statusResult = git.runCommand(GitLineHandler(project, vf, GitCommand.STATUS).apply {
                    addParameters("-sb")
                    endOptions()
                })
                val statusOutput = statusResult.output.joinToString(" ")
                val isAhead = statusOutput.contains("ahead")
                SyncLog.info("Status check: isAhead=$isAhead, hasLocalCommit=$hasLocalCommit, status=$statusOutput")

                // Push if we made a new commit OR if we're ahead of origin (have unpushed commits)
                if (hasLocalCommit || isAhead) {
                    SyncLog.info("Pushing to remote...")
                    val pushResult = git.runCommand(GitLineHandler(project, vf, GitCommand.PUSH))
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
                }
            } catch (e: Exception) {
                val errMsg = "Error: ${e.message}"
                SyncLog.error(errMsg)
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
            }
        }
    }

    private fun branchAndCommit(project: Project, repoRoot: File) {
        SyncLog.info("Branch & PR: starting...")
        val git = Git.getInstance()
        val vf = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(repoRoot)
            ?: run {
                val msg = "Repo path not found: ${repoRoot}"
                SyncLog.error(msg)
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", msg, NotificationType.WARNING))
                return
            }

        // Run git operations on a background thread to avoid blocking the UI
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                // Clean up git state and ensure we're on a branch first
                val currentBranch = GitUtils.cleanupAndEnsureOnBranch(project, repoRoot)
                if (currentBranch == null) {
                    val errMsg = "Not on a branch. Please checkout a branch manually in terminal."
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                    return@executeOnPooledThread
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
                val madeNewCommit = preCommit.success()

                // Check if we're ahead of origin (have unpushed commits, including any we just made)
                val statusResult = git.runCommand(GitLineHandler(project, vf, GitCommand.STATUS).apply {
                    addParameters("-sb")
                    endOptions()
                })
                val statusOutput = statusResult.output.joinToString(" ")
                val isAhead = statusOutput.contains("ahead")
                val hadLocalChanges = madeNewCommit || isAhead
                SyncLog.info("Status check: madeNewCommit=$madeNewCommit, isAhead=$isAhead, hadLocalChanges=$hadLocalChanges")

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
                    return@executeOnPooledThread
                }

                // STEP 4: Create new branch with optional prefix + user name + random suffix
                val settings = PluginSettingsService.instance().data
                val userName = GitUtils.getGitUserName(project, repoRoot)
                val prefix = settings.branchPrefix.takeIf { it.isNotBlank() }
                val name = GitUtils.generateBranchName(userName, prefix)
                SyncLog.info("Creating branch: $name${prefix?.let { " (prefix: $it)" } ?: ""}")
                val coRes = git.runCommand(GitLineHandler(project, vf, GitCommand.CHECKOUT).apply {
                    addParameters("-b", name)
                    endOptions()
                })
                if (!coRes.success()) {
                    val errMsg = "Branch create failed: ${coRes.errorOutputAsJoinedString}"
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                    return@executeOnPooledThread
                }

                // If we had local changes, they're already committed, just push
                if (!hadLocalChanges) {
                    SyncLog.info("Nothing to commit")
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Nothing to commit", NotificationType.INFORMATION))
                    return@executeOnPooledThread
                }

                // STEP 5: Push to remote
                SyncLog.info("Pushing branch $name to origin...")
                val pushResult = git.runCommand(GitLineHandler(project, vf, GitCommand.PUSH).apply {
                    addParameters("-u", "origin", name)
                    endOptions()
                })
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
                    val prTitle = "Prompt Library Sync - ${userName ?: "Unknown User"}"
                    SyncLog.info("Opening GitHub compare page with title: $prTitle")
                    PRActions.openCompare(owner, repoName, currentBranch, name, prTitle)
                }

                // Show dialog asking if user wants to return to main branch
                if (pushResult.success()) {
                    javax.swing.SwingUtilities.invokeLater {
                        showReturnToMainDialog(project, repoRoot, name)
                    }
                }
            } catch (e: Exception) {
                val errMsg = "Error: ${e.message}"
                SyncLog.error(errMsg)
                Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
            }
        }
    }

    private fun showReturnToMainDialog(project: Project, repoRoot: File, branchName: String) {
        val options = arrayOf("Return to Main", "Stay on Branch")
        val choice = javax.swing.JOptionPane.showOptionDialog(
            null,
            "PR branch '$branchName' pushed successfully!\nWould you like to return to main and pull latest changes?",
            "PR Created",
            javax.swing.JOptionPane.DEFAULT_OPTION,
            javax.swing.JOptionPane.QUESTION_MESSAGE,
            null,
            options,
            options[0]
        )

        if (choice == 0) {
            // Return to Main
            SyncLog.info("User chose to return to main branch")
            ApplicationManager.getApplication().executeOnPooledThread {
                // Try 'main' first, then 'master'
                var success = GitUtils.checkout(project, repoRoot, "main")
                if (!success) {
                    SyncLog.info("'main' branch not found, trying 'master'...")
                    success = GitUtils.checkout(project, repoRoot, "master")
                }

                if (!success) {
                    SyncLog.error("Failed to checkout main/master branch")
                    Notifications.Bus.notify(
                        Notification("PromptLibrary", "Branch Switch", "Failed to checkout main/master branch", NotificationType.ERROR)
                    )
                } else {
                    SyncLog.info("Switched to main branch, pulling latest...")

                    // Pull latest changes
                    val pullResult = GitPullService.pullSync(project, repoRoot)
                    if (pullResult.success) {
                        SyncLog.info("Successfully returned to main and pulled latest changes")
                        Notifications.Bus.notify(
                            Notification("PromptLibrary", "Branch Switch", "Returned to main and pulled latest changes", NotificationType.INFORMATION)
                        )
                    } else {
                        SyncLog.error("Pull failed: ${pullResult.error}")
                        Notifications.Bus.notify(
                            Notification("PromptLibrary", "Branch Switch", "Returned to main but pull failed: ${pullResult.error}", NotificationType.WARNING)
                        )
                    }
                }

                // Refresh the SyncOpsPanel to show updated branch
                javax.swing.SwingUtilities.invokeLater {
                    com.example.promptlibrary.ui.SyncOpsPanel.refreshCurrentInstance()
                }
            }
        } else {
            // Stay on Branch
            SyncLog.info("User chose to stay on PR branch")
            Notifications.Bus.notify(
                Notification("PromptLibrary", "Branch Switch", "Staying on PR branch. Use Sync Ops panel to return to main when ready.", NotificationType.INFORMATION)
            )

            // Still refresh the panel to show updated branch
            com.example.promptlibrary.ui.SyncOpsPanel.refreshCurrentInstance()
        }
    }
}

