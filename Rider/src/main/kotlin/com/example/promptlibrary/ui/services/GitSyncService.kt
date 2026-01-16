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

        val settings = PluginSettingsService.instance().data
        val working = GitRepoManager.ensureWorkingCopy(project).first
        
        if (working == null) {
            return SyncResult.Warning("No working copy available. Set remote URL in settings.")
        }
        
        val root = File(working, settings.promptsSubdir)
        if (!root.exists() || !root.isDirectory) {
            return SyncResult.Warning("Invalid prompts subdir.")
        }
        
        return try {
            val groups = GitYamlLoader.loadFromRoot(root)
            repository.replaceSharedGroups(groups)
            
            Notifications.Bus.notify(
                Notification(
                    "PromptLibrary",
                    "Git Sync",
                    "Imported ${groups.size} Shared group(s) from Git (remote-wins).",
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
            GitPullService.pull(project, working, settings.branchName)
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
     * Runs a full sync: pull, merge (remote wins), write YAML, commit & push.
     */
    fun runFullSync(): SyncResult {
        if (project == null) {
            return SyncResult.Warning("No project available.")
        }

        return try {
            SyncOrchestrator.sync(project, repository)
            SyncResult.Success
        } catch (e: Exception) {
            SyncResult.Error("Error during full sync: ${e.message}")
        }
    }
    
    /**
     * Nukes the local working copy and re-syncs.
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

