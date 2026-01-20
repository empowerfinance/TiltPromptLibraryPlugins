package com.example.promptlibrary.settings

/**
 * Configuration for a single library within a repository.
 * A library is a folder in the repo that contains prompt groups.
 */
data class LibraryConfig(
    /** Unique identifier for this library (e.g., "platform", "analytics") */
    val id: String,
    /** Subdirectory path within the repository (e.g., "platform", "analytics/reports") */
    val path: String,
    /** Human-readable display name */
    val displayName: String,
    /** Whether the user has this library enabled/subscribed */
    val enabled: Boolean = true,
    /** Optional color for UI distinction (hex string like "#FF5733") */
    val color: String? = null
)

/**
 * Configuration for a Git repository that contains one or more libraries.
 */
data class RepoConfig(
    /** Git remote URL */
    val url: String,
    /** Local file system path where the repo is cloned */
    val localPath: String,
    /** Branch to sync with (empty = auto-detect from origin) */
    val branch: String,
    /** Libraries available in this repository */
    val libraries: List<LibraryConfig>
)

/**
 * Default library name when none is configured.
 */
const val DEFAULT_LIBRARY_NAME = "general"

/**
 * Converts a string to Title Case.
 */
fun titleCase(str: String): String {
    return str.split(Regex("[-_\\s]+"))
        .joinToString(" ") { word ->
            word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        }
}

/**
 * Discovers available libraries in a repository by scanning for directories
 * that contain subdirectories with _group.yaml files.
 */
fun discoverLibraries(repoPath: String): List<LibraryConfig> {
    val libraries = mutableListOf<LibraryConfig>()
    val repoDir = java.io.File(repoPath)

    if (!repoDir.exists() || !repoDir.isDirectory) {
        return listOf(
            LibraryConfig(
                id = DEFAULT_LIBRARY_NAME,
                path = DEFAULT_LIBRARY_NAME,
                displayName = titleCase(DEFAULT_LIBRARY_NAME),
                enabled = true
            )
        )
    }

    try {
        repoDir.listFiles()?.filter {
            it.isDirectory && !it.name.startsWith(".") && it.name != "node_modules"
        }?.forEach { potentialLibDir ->
            // Check if this directory looks like a library (has subdirs with _group.yaml)
            val hasGroupYaml = potentialLibDir.listFiles()?.any { subDir ->
                subDir.isDirectory && java.io.File(subDir, "_group.yaml").exists()
            } ?: false

            if (hasGroupYaml) {
                libraries.add(
                    LibraryConfig(
                        id = potentialLibDir.name,
                        path = potentialLibDir.name,
                        displayName = titleCase(potentialLibDir.name),
                        enabled = true
                    )
                )
            }
        }
    } catch (e: Exception) {
        // Silently ignore errors during discovery
    }

    // If no libraries found, return the default
    if (libraries.isEmpty()) {
        libraries.add(
            LibraryConfig(
                id = DEFAULT_LIBRARY_NAME,
                path = DEFAULT_LIBRARY_NAME,
                displayName = titleCase(DEFAULT_LIBRARY_NAME),
                enabled = true
            )
        )
    }

    return libraries
}

/**
 * Gets the list of hidden library paths.
 */
fun getHiddenLibraryPaths(): List<String> {
    return PluginSettingsService.instance().data.hiddenLibraries
}

/**
 * Updates the list of hidden libraries.
 */
fun setHiddenLibraries(libraryPaths: List<String>) {
    PluginSettingsService.instance().data.hiddenLibraries = libraryPaths.toMutableList()
}

/**
 * Shows all libraries by clearing the hidden list.
 */
fun showAllLibraries() {
    setHiddenLibraries(emptyList())
}

/**
 * Hides all libraries except the active one.
 */
fun hideAllLibraries() {
    val settings = PluginSettingsService.instance().data
    val activeLibrary = settings.promptsSubdir.ifBlank { DEFAULT_LIBRARY_NAME }
    val allLibraries = discoverLibraries(PluginSettingsService.expandPath(settings.repoPath))

    // Hide all except the active library
    val toHide = allLibraries
        .filter { it.id != activeLibrary }
        .map { it.id }

    setHiddenLibraries(toHide)
}

