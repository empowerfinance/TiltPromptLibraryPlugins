package com.example.promptlibrary.sync

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Library
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.settings.LibraryConfig
import com.example.promptlibrary.yaml.GroupYaml
import com.example.promptlibrary.yaml.PromptYaml
import java.io.File

/**
 * Reads a YAML tree from a local folder into Group/Prompt models.
 * This is read-only and makes no Git calls. Structure (flat - prompts directly in group folder):
 *   <root>/
 *     <group>/
 *       _group.yaml
 *       p-<uuid>.yaml    (prompts directly in group folder)
 *       <child>/
 *         ...
 */
object GitYamlLoader {
    fun loadFromRoot(rootDir: File): List<Group> {
        if (!rootDir.exists() || !rootDir.isDirectory) return emptyList()
        return rootDir.listFiles()?.mapNotNull { readGroupDir(it) } ?: emptyList()
    }

    private fun readGroupDir(dir: File): Group? {
        if (!dir.isDirectory) return null
        val meta = File(dir, "_group.yaml")
        if (!meta.exists()) return null
        val group = GroupYaml.readGroup(meta)

        // Read prompts directly from the group folder (p-*.yaml files)
        val prompts = dir.listFiles { f ->
            f.isFile && (f.name.endsWith(".yaml") || f.name.endsWith(".yml")) && f.name != "_group.yaml" && f.name != "_group.yml"
        }?.map { PromptYaml.readPrompt(it) }
            ?.filter { !it.isPrivate } // never import private=true
            ?: emptyList()

        // No nested child groups - groups are flat (only at library root level)
        return group.copy(children = emptyList(), prompts = prompts)
    }

    // ============================================================================
    // Multi-Library Support Functions
    // ============================================================================

    /**
     * Reads groups from a specific library within a repository.
     *
     * @param repoRoot - The root directory of the Git repository
     * @param library - The library configuration specifying which library to read
     * @return List of groups found in the library
     *
     * Example folder structure:
     *   ~/PromptLibrary/           <- repoRoot
     *     platform/                <- library.path = "platform"
     *       API/_group.yaml
     *       API/prompts/p-xxx.yaml
     */
    fun loadFromLibrary(repoRoot: File, library: LibraryConfig): List<Group> {
        val libraryDir = File(repoRoot, library.path)
        return loadFromRoot(libraryDir)
    }

    /**
     * Reads groups from multiple libraries and returns a combined result with library metadata.
     * Tags all groups and prompts with libraryId so they can be written back to disk.
     *
     * @param repoRoot - The root directory of the Git repository
     * @param libraries - List of library configurations to read from
     * @return Map of library ID to list of groups
     */
    fun loadFromLibraries(repoRoot: File, libraries: List<LibraryConfig>): Map<String, List<Group>> {
        val result = mutableMapOf<String, List<Group>>()

        for (library in libraries.filter { it.enabled }) {
            try {
                val groups = loadFromLibrary(repoRoot, library)
                // Tag all groups and prompts with libraryId so they can be written back to disk
                val taggedGroups = tagWithLibraryId(groups, library.id)
                result[library.id] = taggedGroups
            } catch (e: Exception) {
                // If a library fails to load, we still continue with others
                result[library.id] = emptyList()
            }
        }

        return result
    }

    /**
     * Tags groups and their prompts with a libraryId.
     * Note: Groups are flat (no nested children), so no recursion needed.
     */
    private fun tagWithLibraryId(groups: List<Group>, libraryId: String): List<Group> {
        return groups.map { g ->
            g.copy(
                libraryId = libraryId,
                prompts = g.prompts.map { it.copy(libraryId = libraryId) }
                // No children recursion - groups are flat
            )
        }
    }
}

