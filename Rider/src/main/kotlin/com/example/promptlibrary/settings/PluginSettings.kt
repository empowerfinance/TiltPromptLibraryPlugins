package com.example.promptlibrary.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.util.xmlb.XmlSerializerUtil
import java.io.File

@State(name = "PromptLibrarySettings", storages = [Storage("PromptLibrarySettings.xml")])
class PluginSettingsService : PersistentStateComponent<PluginSettingsService.State> {
    /**
     * State class for persisting plugin settings.
     * Uses simple types and collections that XmlSerializer handles well.
     * Note: For list properties, use ArrayList instead of MutableList for better serialization.
     */
    class State {
        var remoteRepoUrl: String = ""
        var repoPath: String = "~/PromptLibrary"  // Match VS Code default
        var promptsSubdir: String = DEFAULT_LIBRARY_NAME  // Active library for writing
        var hiddenLibraries: ArrayList<String> = ArrayList()  // Use ArrayList for proper XML serialization
        var branchName: String = ""
        var writeStrategy: WriteStrategy = WriteStrategy.DIRECT
        var autoFetchEnabled: Boolean = false
        var autoFetchMinutes: Int = 5
    }

    enum class WriteStrategy { DIRECT, BRANCH_PR }

    private var myState = State()
    val data: State get() = myState

    override fun getState(): State = myState
    override fun loadState(state: State) {
        XmlSerializerUtil.copyBean(state, this.myState)
        // Migration: ensure promptsSubdir is never empty
        if (this.myState.promptsSubdir.isBlank()) {
            this.myState.promptsSubdir = DEFAULT_LIBRARY_NAME
        }
    }

    companion object {
        fun instance(): PluginSettingsService = service()

        /**
         * Expands tilde (~) in paths to the user's home directory.
         * Matches VS Code's expandPath() function behavior.
         */
        fun expandPath(filePath: String): String {
            if (filePath.startsWith("~/") || filePath == "~") {
                val homeDir = System.getProperty("user.home")
                return if (filePath == "~") {
                    homeDir
                } else {
                    File(homeDir, filePath.substring(2)).absolutePath
                }
            }
            return filePath
        }

        /**
         * Gets the effective repo path with tilde expansion applied.
         * Returns empty string if repoPath is blank.
         */
        fun getEffectiveRepoPath(): String {
            val rawPath = instance().data.repoPath.trim()
            return if (rawPath.isNotEmpty()) expandPath(rawPath) else ""
        }

        /**
         * Gets the effective promptsSubdir (library folder), never empty.
         */
        fun getEffectiveLibraryPath(): String {
            val subdir = instance().data.promptsSubdir.trim()
            return if (subdir.isNotEmpty()) subdir else DEFAULT_LIBRARY_NAME
        }

        /**
         * Gets all enabled (non-hidden) libraries from the configuration.
         * Uses opt-out approach: all libraries are shown by default, except those in hiddenLibraries.
         */
        fun getEnabledLibraries(): List<LibraryConfig> {
            return getRepoConfig().libraries.filter { it.enabled }
        }

        /**
         * Converts current settings into a RepoConfig with all enabled libraries.
         * Uses opt-out approach matching VS Code:
         * - All discovered libraries are shown by default
         * - Libraries in hiddenLibraries setting are hidden
         * - Any library can be hidden, including the active library
         */
        fun getRepoConfig(): RepoConfig {
            val settings = instance().data
            val repoPath = getEffectiveRepoPath()
            val activeLibraryPath = getEffectiveLibraryPath()
            val hiddenLibraries = settings.hiddenLibraries

            // Auto-discover all libraries from the repository
            var libraries = discoverLibraries(repoPath)

            // Apply enabled/disabled status based on hidden list (opt-out)
            // All libraries are enabled by default, except those in the hidden list
            libraries = libraries.map { lib ->
                lib.copy(enabled = !hiddenLibraries.contains(lib.id))
            }

            // Ensure active library is always included in the list (even if not yet discovered)
            // but respect hidden setting
            val activeExists = libraries.any { it.path == activeLibraryPath }
            if (!activeExists) {
                libraries = listOf(
                    LibraryConfig(
                        id = activeLibraryPath,
                        path = activeLibraryPath,
                        displayName = titleCase(activeLibraryPath),
                        enabled = !hiddenLibraries.contains(activeLibraryPath)
                    )
                ) + libraries
            }

            return RepoConfig(
                url = settings.remoteRepoUrl,
                localPath = repoPath,
                branch = settings.branchName,
                libraries = libraries
            )
        }

        /**
         * Gets the currently active library (used for writing).
         * This is the library where new prompts will be saved.
         */
        fun getActiveLibrary(): LibraryConfig {
            val libraryPath = getEffectiveLibraryPath()
            return LibraryConfig(
                id = libraryPath,
                path = libraryPath,
                displayName = titleCase(libraryPath),
                enabled = true
            )
        }

        /**
         * Computes the full file system path to a library's root directory.
         */
        fun getLibraryPath(repoPath: String, library: LibraryConfig): String {
            return File(repoPath, library.path).absolutePath
        }

        /**
         * Gets the full file system path to the active library's root directory.
         */
        fun getActiveLibraryPath(): String {
            val repoPath = getEffectiveRepoPath()
            val library = getActiveLibrary()
            return getLibraryPath(repoPath, library)
        }
    }
}

