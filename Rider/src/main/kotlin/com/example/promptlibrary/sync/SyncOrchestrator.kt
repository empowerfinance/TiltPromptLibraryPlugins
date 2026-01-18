package com.example.promptlibrary.sync

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.repository.PromptRepository
import com.example.promptlibrary.settings.PluginSettingsService
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import java.io.File

object SyncOrchestrator {
    /**
     * Full sync: pull from remote, merge, write YAML, commit & push
     */
    fun sync(project: Project, repo: PromptRepository) {
        SyncLog.info("Starting sync...")
        val (rootDir, _) = GitRepoManager.ensureWorkingCopy(project)
        if (rootDir == null) {
            SyncLog.error("No working copy available")
            return
        }
        val settings = PluginSettingsService.instance().data

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Prompt Library: Sync", false) {
            override fun run(indicator: com.intellij.openapi.progress.ProgressIndicator) {
                try {
                    indicator.text = "Saving edits..."
                    SyncLog.info("Saving edits...")

                    indicator.text = "Pulling latest..."
                    SyncLog.info("Pulling latest from remote...")
                    GitPullService.pull(project, rootDir, settings.branchName)

                    indicator.text = "Loading remote YAML..."
                    SyncLog.info("Loading remote YAML...")
                    val remoteShared = GitYamlLoader.loadFromRoot(File(rootDir, settings.promptsSubdir))

                    indicator.text = "Merging... (remote wins)"
                    SyncLog.info("Merging (remote wins)...")
                    val (mergedShared, keptLocal) = mergeRemoteWins(remoteShared, repo)

                    indicator.text = "Writing YAML..."
                    SyncLog.info("Writing YAML files...")
                    val yamlRoot = File(rootDir, settings.promptsSubdir)
                    val (added, updated, deleted) = GitYamlWriter.writeSharedGroups(yamlRoot, mergedShared)
                    val changeMsg = "Shared changes: +${added} ~${updated} -${deleted}"
                    SyncLog.info(changeMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", changeMsg, NotificationType.INFORMATION))

                    indicator.text = "Committing & pushing..."
                    SyncLog.info("Committing & pushing...")
                    val success = WriteStrategyService.commitUsingStrategy(project, rootDir)
                    if (success) {
                        SyncLog.info("Sync completed successfully")
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Sync completed", NotificationType.INFORMATION))
                    } else {
                        SyncLog.info("No changes to sync")
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "No changes to sync", NotificationType.INFORMATION))
                    }
                    if (keptLocal > 0) {
                        val keptMsg = "Kept ${keptLocal} local prompt(s) in Private/Unfiled (not on remote)"
                        SyncLog.info(keptMsg)
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", keptMsg, NotificationType.INFORMATION))
                    }
                } catch (e: Exception) {
                    val errMsg = "Sync error: ${e.message}"
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                }
            }
        })
    }

    /**
     * Force pull: hard reset to remote, discard all local changes, load into memory.
     * NO commit/push - this is a one-way "get remote" operation.
     */
    fun forcePull(project: Project, repo: PromptRepository) {
        SyncLog.info("Starting force pull (hard reset to remote)...")
        val (rootDir, _) = GitRepoManager.ensureWorkingCopy(project)
        if (rootDir == null) {
            SyncLog.error("No working copy available")
            return
        }
        val settings = PluginSettingsService.instance().data

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Prompt Library: Force Pull", false) {
            override fun run(indicator: com.intellij.openapi.progress.ProgressIndicator) {
                try {
                    indicator.text = "Fetching from remote..."
                    SyncLog.info("Fetching from origin...")
                    GitPullService.fetchOnly(project, rootDir)

                    // Use configured branch or detect default from remote
                    val branchName = settings.branchName.ifBlank {
                        GitUtils.getDefaultBranch(project, rootDir)
                    }

                    indicator.text = "Hard reset to origin..."
                    SyncLog.info("Hard resetting to origin/$branchName...")
                    val success = GitPullService.hardResetToOrigin(project, rootDir, branchName)
                    if (!success) {
                        SyncLog.error("Failed to reset to origin")
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Failed to reset to origin", NotificationType.ERROR))
                        return
                    }

                    indicator.text = "Loading YAML..."
                    SyncLog.info("Loading YAML from disk...")
                    val remoteShared = GitYamlLoader.loadFromRoot(File(rootDir, settings.promptsSubdir))

                    indicator.text = "Updating library..."
                    SyncLog.info("Updating library with ${remoteShared.size} groups...")
                    // Replace shared groups entirely with what's from remote
                    repo.replaceSharedGroups(remoteShared)

                    val msg = "Force pull complete: ${remoteShared.size} groups loaded"
                    SyncLog.info(msg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", msg, NotificationType.INFORMATION))
                } catch (e: Exception) {
                    val errMsg = "Force pull error: ${e.message}"
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                }
            }
        })
    }

    private fun collectPromptsById(groups: List<Group>): Map<String, Prompt> {
        val map = mutableMapOf<String, Prompt>()
        fun walk(g: Group) {
            g.prompts.forEach { map[it.id] = it }
            g.children.forEach { walk(it) }
        }
        groups.forEach { walk(it) }
        return map
    }

    private fun mergeRemoteWins(remoteShared: List<Group>, repo: PromptRepository): Pair<List<Group>, Int> {
        val localShared = repo.getSharedGroups()
        val localById = collectPromptsById(localShared)
        val remoteById = collectPromptsById(remoteShared)
        var movedCount = 0
        localById.forEach { (id, lp) ->
            if (!remoteById.containsKey(id) && !lp.isPrivate) {
                repo.movePromptToPrivate(id)
                movedCount++
            }
        }
        return remoteShared to movedCount
    }
}

