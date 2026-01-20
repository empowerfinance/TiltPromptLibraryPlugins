package com.example.promptlibrary

import com.example.promptlibrary.repository.PromptRepository
import com.example.promptlibrary.settings.PluginSettingsService
import com.example.promptlibrary.sync.GitYamlLoader
import com.example.promptlibrary.ui.PromptLibraryPanel
import com.example.promptlibrary.ui.SettingsPanel
import com.example.promptlibrary.ui.SyncOpsPanel
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import java.io.File

class PromptLibraryToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val contentFactory = ContentFactory.getInstance()

        // Create shared repository instance for all panels
        val repository = PromptRepository()

        // Auto-load shared groups from YAML files on startup
        autoLoadFromYaml(repository)

        // Library tab (main panel)
        val libraryPanel = PromptLibraryPanel(project, repository)
        val libraryContent = contentFactory.createContent(libraryPanel, "Library", false)
        toolWindow.contentManager.addContent(libraryContent)

        // Sync Ops tab
        val syncOpsPanel = SyncOpsPanel(project, repository)
        val syncOpsContent = contentFactory.createContent(syncOpsPanel, "Sync Ops", false)
        toolWindow.contentManager.addContent(syncOpsContent)

        // Settings tab (new embedded settings)
        try {
            val settingsPanel = SettingsPanel(project, repository)
            val settingsContent = contentFactory.createContent(settingsPanel, "Settings", false)
            toolWindow.contentManager.addContent(settingsContent)
        } catch (e: Exception) {
            // Log error if settings panel fails to initialize
            com.intellij.openapi.diagnostic.Logger.getInstance(PromptLibraryToolWindowFactory::class.java)
                .error("Failed to create Settings panel", e)
        }

        // Register disposable for SyncOpsPanel cleanup
        Disposer.register(syncOpsContent, Disposable { syncOpsPanel.dispose() })

        // Start background fetch scheduler (can be disabled later via settings)
        com.example.promptlibrary.sync.GitFetchScheduler(project).start()
    }

    /**
     * Auto-loads shared groups from YAML files on startup.
     * This reads from all enabled libraries and merges them into the repository.
     */
    private fun autoLoadFromYaml(repository: PromptRepository) {
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val repoPath = PluginSettingsService.getEffectiveRepoPath()
                if (repoPath.isEmpty() || !File(repoPath).exists()) return@executeOnPooledThread

                val enabledLibraries = PluginSettingsService.getEnabledLibraries()
                if (enabledLibraries.isEmpty()) return@executeOnPooledThread

                // Load groups from all enabled libraries with metadata
                val libraryGroupsMap = GitYamlLoader.loadFromLibraries(File(repoPath), enabledLibraries)
                val allGroups = mutableListOf<com.example.promptlibrary.model.Group>()

                for ((libraryId, groups) in libraryGroupsMap) {
                    // Add library metadata to each group
                    val groupsWithMetadata = groups.map { g -> addLibraryMetadata(g, libraryId) }
                    allGroups.addAll(groupsWithMetadata)
                }

                // Update repository with loaded groups
                repository.replaceSharedGroups(allGroups)

                // Fire library changed event to refresh UI
                ApplicationManager.getApplication().invokeLater {
                    ApplicationManager.getApplication().messageBus
                        .syncPublisher(com.example.promptlibrary.events.LibraryEvents.TOPIC)
                        .libraryChanged()
                }
            } catch (e: Exception) {
                // Silently ignore errors during auto-load - user can manually sync
                com.intellij.openapi.diagnostic.Logger.getInstance(PromptLibraryToolWindowFactory::class.java)
                    .info("Auto-load from YAML skipped: ${e.message}")
            }
        }
    }

    /**
     * Recursively adds library metadata to a group and all its children/prompts.
     */
    private fun addLibraryMetadata(group: com.example.promptlibrary.model.Group, libraryId: String): com.example.promptlibrary.model.Group {
        return group.copy(
            libraryId = libraryId,
            prompts = group.prompts.map { it.copy(libraryId = libraryId) },
            children = group.children.map { addLibraryMetadata(it, libraryId) }
        )
    }
}

