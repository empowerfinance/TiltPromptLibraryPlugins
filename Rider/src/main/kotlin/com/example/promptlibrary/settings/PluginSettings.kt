package com.example.promptlibrary.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.util.xmlb.XmlSerializerUtil
import java.io.File

@State(name = "PromptLibrarySettings", storages = [Storage("PromptLibrarySettings.xml")])
class PluginSettingsService : PersistentStateComponent<PluginSettingsService.State> {
    data class State(
        var remoteRepoUrl: String = "",
        var repoPath: String = "~/PromptLibrary",  // Match VS Code default
        var promptsSubdir: String = DEFAULT_LIBRARY_NAME,  // Active library for writing
        var enabledLibraries: MutableList<String> = mutableListOf(),  // Libraries to read from
        var branchName: String = "",
        var writeStrategy: WriteStrategy = WriteStrategy.DIRECT,
        var autoFetchEnabled: Boolean = false,
        var autoFetchMinutes: Int = 5
    )

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
         * Gets the raw list of enabled library paths (for UI display).
         */
        fun getEnabledLibraryPaths(): List<String> {
            return instance().data.enabledLibraries.toList()
        }

        /**
         * Sets the enabled libraries list.
         */
        fun setEnabledLibraries(libraryPaths: List<String>) {
            instance().data.enabledLibraries = libraryPaths.toMutableList()
        }

        /**
         * Converts current settings into a RepoConfig with all enabled libraries.
         * Supports both single-library (legacy) and multi-library modes.
         */
        fun getRepoConfig(): RepoConfig {
            val settings = instance().data
            val activeLibraryPath = getEffectiveLibraryPath()

            // Build library list from enabled libraries, or just the active one
            val enabledLibs = settings.enabledLibraries.ifEmpty { emptyList() }
            val libraryPaths = if (enabledLibs.isNotEmpty()) {
                enabledLibs.toMutableList()
            } else {
                mutableListOf(activeLibraryPath)
            }

            // Ensure active library is always included
            if (!libraryPaths.contains(activeLibraryPath)) {
                libraryPaths.add(0, activeLibraryPath)
            }

            val libraries = libraryPaths.map { libPath ->
                LibraryConfig(
                    id = libPath,
                    path = libPath,
                    displayName = titleCase(libPath),
                    enabled = true
                )
            }

            return RepoConfig(
                url = settings.remoteRepoUrl,
                localPath = getEffectiveRepoPath(),
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
         * Gets all enabled libraries from the configuration.
         * Returns multiple libraries when enabledLibraries is configured.
         */
        fun getEnabledLibraries(): List<LibraryConfig> {
            return getRepoConfig().libraries.filter { it.enabled }
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

