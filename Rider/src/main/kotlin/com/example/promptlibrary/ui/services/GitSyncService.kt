package com.example.promptlibrary.ui.services

import com.example.promptlibrary.repository.PromptRepository
import com.example.promptlibrary.settings.PluginSettingsService
import com.example.promptlibrary.sync.GitRepoManager
import com.example.promptlibrary.sync.GitPullService
import com.example.promptlibrary.sync.WriteStrategyService
import com.example.promptlibrary.sync.SyncOrchestrator
import com.example.promptlibrary.sync.GitYamlLoader
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.project.Project
import java.io.File

/**
 * Service for handling Git synchronization operations.
 *
 * Provides methods for pulling, pushing, and syncing prompts with a Git repository.
 */
class GitSyncService(
    private val project: Project?,
    private val repository: PromptRepository
) {
    
    /**
     * Result of a Git sync operation.
     */
    sealed class SyncResult {
        object Success : SyncResult()
        data class Error(val message: String) : SyncResult()
        data class Warning(val message: String) : SyncResult()
    }
    
    /**
     * Loads prompts from the Git repository into Shared groups.
     *
     * @return Result of the operation
     */
    fun loadRepoIntoShared(): SyncResult {
        if (project == null) {
            return SyncResult.Warning("No project available.")
        }

        val repoDir = GitRepoManager.ensureWorkingCopy(project).first

        if (repoDir == null) {
            return SyncResult.Warning("No working copy available. Set remote URL in settings.")
        }

        if (!repoDir.exists() || !repoDir.isDirectory) {
            return SyncResult.Warning("Invalid repository directory.")
        }

        return try {
            // Load groups from all enabled libraries with proper libraryId tagging
            val enabledLibraries = PluginSettingsService.getEnabledLibraries()
            if (enabledLibraries.isEmpty()) {
                return SyncResult.Warning("No libraries enabled. Configure libraries in settings.")
            }

            val libraryGroupsMap = GitYamlLoader.loadFromLibraries(repoDir, enabledLibraries)
            val allGroups = mutableListOf<com.example.promptlibrary.model.Group>()
            var totalPrompts = 0

            for ((libraryId, groups) in libraryGroupsMap) {
                allGroups.addAll(groups)
                totalPrompts += groups.sumOf { it.prompts.size }
            }

            repository.replaceSharedGroups(allGroups)

            Notifications.Bus.notify(
                Notification(
                    "PromptLibrary",
                    "Git Sync",
                    "Imported ${allGroups.size} Shared group(s), $totalPrompts prompt(s) from ${enabledLibraries.size} library(ies).",
                    NotificationType.INFORMATION
                )
            )

            SyncResult.Success
        } catch (e: Exception) {
            SyncResult.Error("Error loading YAML: ${e.message}")
        }
    }
    
    /**
     * Pulls changes from the Git repository.
     */
    fun pullFromGit(): SyncResult {
        if (project == null) {
            return SyncResult.Warning("No project available.")
        }

        val settings = PluginSettingsService.instance().data
        val working = GitRepoManager.ensureWorkingCopy(project).first
        
        if (working == null) {
            return SyncResult.Warning("No working copy available.")
        }
        
        return try {
            GitPullService.pull(project, working, null)  // Auto-detect branch from remote
            SyncResult.Success
        } catch (e: Exception) {
            SyncResult.Error("Error pulling from Git: ${e.message}")
        }
    }
    
    /**
     * Writes prompts to Git (commit and push).
     */
    fun writeToGit(): SyncResult {
        if (project == null) {
            return SyncResult.Warning("No project available.")
        }

        return try {
            WriteStrategyService.write(project, repository)
            SyncResult.Success
        } catch (e: Exception) {
            SyncResult.Error("Error writing to Git: ${e.message}")
        }
    }
    
    /**
     * Runs a pull & sync: pull from remote with rebase, load YAML into memory.
     * NO writing, NO committing, NO pushing - this is a read-only operation.
     */
    fun runFullSync(): SyncResult {
        if (project == null) {
            return SyncResult.Warning("No project available.")
        }

        return try {
            SyncOrchestrator.sync(project, repository)
            SyncResult.Success
        } catch (e: Exception) {
            SyncResult.Error("Error during pull & sync: ${e.message}")
        }
    }

    /**
     * Nukes the local working copy and re-syncs (pull only, no push).
     */
    fun nukeRepoAndResync(): SyncResult {
        if (project == null) {
            return SyncResult.Warning("No project available.")
        }

        return try {
            GitRepoManager.nukeWorkingCopy(project)
            runFullSync()
        } catch (e: Exception) {
            SyncResult.Error("Error nuking and resyncing: ${e.message}")
        }
    }
}

