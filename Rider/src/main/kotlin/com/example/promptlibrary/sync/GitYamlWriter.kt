package com.example.promptlibrary.sync

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.settings.LibraryConfig
import com.example.promptlibrary.yaml.GroupYaml
import com.example.promptlibrary.yaml.PromptYaml
import java.io.File

/** Writes Shared groups to the repo tree.
 * Structure per group (flat - prompts directly in group folder, no nested groups):
 *   <root>/<groupName>/
 *     _group.yaml   (meta only: prompts omitted)
 *     p-<id>.yaml   (public prompts only, directly in group folder)
 */
object GitYamlWriter {
    private const val GITIGNORE_CONTENT = """# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.idea/
*.iml
.vscode/
"""

    // Returns triple of (added, updated, deleted) file counts across the Shared tree
    fun writeSharedGroups(rootDir: File, groups: List<Group>): Triple<Int, Int, Int> {
        val before = snapshotFiles(rootDir)

        // Preserve _library.yaml content if it exists (we'll recreate it after the clean rewrite)
        val libraryYamlFile = File(rootDir, "_library.yaml")
        val libraryYamlContent: String = if (libraryYamlFile.exists()) {
            libraryYamlFile.readText()
        } else {
            // Create a default one based on folder name
            "name: ${rootDir.name}\ndescription: \n"
        }

        // Clean rewrite to reflect current Shared state (removes stale groups like prior synthetic ones)
        if (rootDir.exists()) rootDir.deleteRecursively()
        rootDir.mkdirs()

        // Restore/create _library.yaml (required marker file for library detection)
        libraryYamlFile.writeText(libraryYamlContent)

        // Ensure .gitignore exists in the parent (repo root)
        ensureGitignore(rootDir.parentFile ?: rootDir)

        groups.forEach { writeGroupDir(rootDir, it) }
        val after = snapshotFiles(rootDir)

        val added = after.keys.count { it !in before.keys }
        val deleted = before.keys.count { it !in after.keys }
        val updated = after.keys.intersect(before.keys).count { k -> before[k] != after[k] }
        return Triple(added, updated, deleted)
    }

    private fun snapshotFiles(root: File): Map<String, String> {
        if (!root.exists() || !root.isDirectory) return emptyMap()
        val map = mutableMapOf<String, String>()
        root.walkTopDown().filter { it.isFile }.forEach { f ->
            val rel = root.toPath().relativize(f.toPath()).toString().replace('\\', '/')
            map[rel] = sha256(f)
        }
        return map
    }

    private fun sha256(file: File): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        file.inputStream().use { ins ->
            val buf = ByteArray(8192)
            while (true) {
                val r = ins.read(buf)
                if (r <= 0) break
                md.update(buf, 0, r)
            }
        }
        return md.digest().joinToString("") { b -> "%02x".format(b) }
    }

    private fun writeGroupDir(parent: File, g: Group) {
        val dir = File(parent, sanitize(g.name))
        dir.mkdirs()
        // Write meta without prompts to keep files clean
        val meta = File(dir, "_group.yaml")
        GroupYaml.writeGroup(g.copy(children = emptyList(), prompts = emptyList()), meta)

        // Write prompts directly in the group folder (no prompts/ subdirectory)
        g.prompts.forEach { p ->
            val file = File(dir, "p-${p.id}.yaml")
            PromptYaml.writePrompt(stripPrivateFields(p), file)
        }
        // No nested child groups - groups are flat (only at library root level)
    }

    private fun stripPrivateFields(p: Prompt): Prompt {
        // Ensure we never write private prompts
        return if (!p.isPrivate) p else p.copy(isPrivate = false)
    }

    private fun sanitize(name: String): String = name.replace(Regex("[^A-Za-z0-9._-]"), "-")

    private fun ensureGitignore(repoRoot: File) {
        val gitignore = File(repoRoot, ".gitignore")
        if (!gitignore.exists()) {
            gitignore.writeText(GITIGNORE_CONTENT)
        }
    }

    // ============================================================================
    // Incremental Write Functions (for immediate disk writes)
    // ============================================================================

    /**
     * Writes a single prompt to disk in its group's folder.
     * Used for immediate disk sync when adding/updating prompts.
     *
     * @param repoRoot - The root directory of the Git repository
     * @param libraryPath - The library folder name (e.g., "platform")
     * @param groupPath - List of group folder names from root to the target group
     * @param prompt - The prompt to write
     */
    fun writeSinglePrompt(repoRoot: File, libraryPath: String, groupPath: List<String>, prompt: Prompt) {
        // Build the full path: repoRoot/libraryPath/group1/group2/.../p-{id}.yaml
        var dir = File(repoRoot, libraryPath)
        for (groupFolder in groupPath) {
            dir = File(dir, sanitize(groupFolder))
        }

        // Ensure group directory exists
        dir.mkdirs()

        // Write the prompt file directly in the group folder (no prompts/ subdirectory)
        val file = File(dir, "p-${prompt.id}.yaml")
        PromptYaml.writePrompt(stripPrivateFields(prompt), file)
    }

    /**
     * Deletes a single prompt file from disk.
     *
     * @param repoRoot - The root directory of the Git repository
     * @param libraryPath - The library folder name
     * @param groupPath - List of group folder names from root to the target group
     * @param promptId - The ID of the prompt to delete
     */
    fun deleteSinglePrompt(repoRoot: File, libraryPath: String, groupPath: List<String>, promptId: String) {
        var dir = File(repoRoot, libraryPath)
        for (groupFolder in groupPath) {
            dir = File(dir, sanitize(groupFolder))
        }

        // Delete prompt file directly from group folder (no prompts/ subdirectory)
        val file = File(dir, "p-$promptId.yaml")

        if (file.exists()) {
            file.delete()
        }
    }

    /**
     * Ensures a group folder exists on disk with its _group.yaml metadata.
     *
     * @param repoRoot - The root directory of the Git repository
     * @param libraryPath - The library folder name
     * @param groupPath - List of group folder names from root to the target group
     * @param group - The group metadata to write
     */
    fun ensureGroupOnDisk(repoRoot: File, libraryPath: String, groupPath: List<String>, group: Group) {
        var dir = File(repoRoot, libraryPath)
        for (groupFolder in groupPath) {
            dir = File(dir, sanitize(groupFolder))
        }

        dir.mkdirs()

        val meta = File(dir, "_group.yaml")
        GroupYaml.writeGroup(group.copy(children = emptyList(), prompts = emptyList()), meta)
    }

    // ============================================================================
    // Multi-Library Support Functions
    // ============================================================================

    /**
     * Writes groups to a specific library within a repository.
     *
     * @param repoRoot - The root directory of the Git repository
     * @param library - The library configuration specifying where to write
     * @param groups - The groups to write
     * @return Triple of (added, updated, deleted) file counts
     *
     * Example:
     *   repoRoot = ~/PromptLibrary
     *   library.path = "platform"
     *   Result: groups written to ~/PromptLibrary/platform/
     */
    fun writeToLibrary(repoRoot: File, library: LibraryConfig, groups: List<Group>): Triple<Int, Int, Int> {
        val libraryDir = File(repoRoot, library.path)
        return writeSharedGroups(libraryDir, groups)
    }

    /**
     * Writes groups to multiple libraries.
     *
     * @param repoRoot - The root directory of the Git repository
     * @param libraryGroups - Map of library ID to groups to write
     * @param libraries - List of library configurations
     * @return Map of library ID to write results (Triple of added, updated, deleted)
     */
    fun writeToLibraries(
        repoRoot: File,
        libraryGroups: Map<String, List<Group>>,
        libraries: List<LibraryConfig>
    ): Map<String, Triple<Int, Int, Int>> {
        val results = mutableMapOf<String, Triple<Int, Int, Int>>()

        // Only write to libraries that are represented in libraryGroups
        // This prevents accidentally wiping libraries that:
        // 1. Failed to load (and thus aren't in libraryGroups)
        // 2. Have groups without libraryId (which are skipped during partitioning)
        // 3. Are enabled but have no content in the current sync
        for (library in libraries.filter { it.enabled }) {
            if (!libraryGroups.containsKey(library.id)) {
                // Skip libraries not in libraryGroups to avoid wiping their content
                continue
            }
            val groups = libraryGroups[library.id]!!
            try {
                val result = writeToLibrary(repoRoot, library, groups)
                results[library.id] = result
            } catch (e: Exception) {
                results[library.id] = Triple(0, 0, 0)
            }
        }

        return results
    }
}

