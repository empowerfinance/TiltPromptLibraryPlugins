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
    fun sync(project: Project, repo: PromptRepository) {
        val (rootDir, _) = GitRepoManager.ensureWorkingCopy(project)
        if (rootDir == null) return
        val settings = PluginSettingsService.instance().data

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Prompt Library: Sync", false) {
            override fun run(indicator: com.intellij.openapi.progress.ProgressIndicator) {
                try {
                    indicator.text = "Saving edits..."
                    // Flush any in-flight editor changes by reloading from repository source of truth
                    // (UI handlers already persist on Save and on editor close; this is a defensive step)
                    // No-op here since repository writes immediately on UI actions

                    indicator.text = "Pulling latest..."
                    GitPullService.pull(project, rootDir, settings.branchName)

                    indicator.text = "Loading remote YAML..."
                    val remoteShared = GitYamlLoader.loadFromRoot(File(rootDir, settings.promptsSubdir))

                    indicator.text = "Merging... (remote wins)"
                    val (mergedShared, keptLocal) = mergeRemoteWins(remoteShared, repo)

                    indicator.text = "Writing YAML..."
                    val yamlRoot = File(rootDir, settings.promptsSubdir)
                    val (added, updated, deleted) = GitYamlWriter.writeSharedGroups(yamlRoot, mergedShared)
                    // Summary toast for file-level changes
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Shared changes: +${added} ~${updated} -${deleted}", NotificationType.INFORMATION))

                    indicator.text = "Committing & pushing..."
                    val success = WriteStrategyService.commitUsingStrategy(project, rootDir)
                    if (success) {
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Sync completed", NotificationType.INFORMATION))
                    } else {
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "No changes to sync", NotificationType.INFORMATION))
                    }
                    if (keptLocal > 0) {
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Kept ${keptLocal} local prompt(s) in Private/Unfiled (not on remote).", NotificationType.INFORMATION))
                    }
                } catch (e: Exception) {
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Sync error: ${e.message}", NotificationType.ERROR))
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

