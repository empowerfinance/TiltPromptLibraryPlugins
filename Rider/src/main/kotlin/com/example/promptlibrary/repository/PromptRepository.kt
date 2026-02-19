package com.example.promptlibrary.repository

import com.example.promptlibrary.model.Library
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.model.Group
import com.example.promptlibrary.settings.PluginSettingsService
import com.example.promptlibrary.sync.GitYamlWriter
import com.intellij.openapi.application.PathManager
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import kotlin.io.path.exists
import kotlin.io.path.readText
import kotlin.io.path.writeText

class PromptRepository {
    private val json = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
    }

    private val configDir: Path by lazy {
        val configPath = PathManager.getConfigPath()
        Paths.get(configPath, "prompt-library").also { path ->
            if (!path.exists()) {
                Files.createDirectories(path)
            }
        }
        }

    // v1 flat file and v2 grouped store
    private val v1File: Path by lazy { configDir.resolve("prompts.json") }
    private val v2File: Path by lazy { configDir.resolve("prompts.v2.json") }

    fun wipeAllLocalData() {
        try {
            // Remove both v2 and v1 stores if present
            if (v2File.exists()) Files.delete(v2File)
            if (v1File.exists()) Files.delete(v1File)
            // Also remove the directory if it is empty
            try {
                Files.delete(configDir)
            } catch (_: Exception) {
                // ignore if not empty or cannot delete
            }
        } catch (e: Exception) {
            println("Error wiping local data: ${e.message}")
            throw e
        }
        // Notify listeners
        com.example.promptlibrary.events.LibraryEvents.fireChanged()
    }

    private fun readLibrary(): Library? {
        return try {
            if (v2File.exists()) json.decodeFromString<Library>(v2File.readText()) else null
        } catch (_: Exception) { null }
    }

    private fun writeLibrary(library: Library) {
        val jsonContent = json.encodeToString(library)
        v2File.writeText(jsonContent)
    }

    // Library helpers
    fun getLibrary(): Library = readLibrary() ?: Library()
    fun saveLibrary(library: Library) = writeLibrary(library)

    fun getAllGroups(): List<Group> = getLibrary().groups

    fun getAllPrompts(): List<Prompt> = getLibrary().privatePrompts
    fun getAllPromptsLibrary(): List<Prompt> {
        val lib = getLibrary()
        val acc = mutableListOf<Prompt>()
        fun walk(g: Group) { acc.addAll(g.prompts); g.children.forEach { walk(it) } }
        lib.groups.forEach { walk(it) }
        acc.addAll(lib.privatePrompts)
        return acc
    }


    fun getGroupPrompts(groupId: String): List<Prompt> {
        fun findGroup(g: Group): Group? {
            if (g.id == groupId) return g
            g.children.forEach { child -> findGroup(child)?.let { return it } }
            return null
        }
        val found = getAllGroups().asSequence().mapNotNull { findGroup(it) }.firstOrNull()
        return found?.prompts ?: emptyList()
    }

    private val UNFILED_NAME = "Unfiled"
    private val TAG_SHARED = "ns:shared"
    private val TAG_PRIVATE = "ns:private"

    /** Ensures an "Unfiled" group exists; returns it. */
    fun ensureUnfiledGroup(): Group {
        val lib = getLibrary()
        val existing = flattenGroups(lib.groups).firstOrNull { normalizeName(it.name) == normalizeName(UNFILED_NAME) }
        if (existing != null) return existing
        val newGroup = Group(id = java.util.UUID.randomUUID().toString(), name = UNFILED_NAME)
        saveLibrary(lib.copy(groups = lib.groups + newGroup))
        return newGroup
    }

    private fun normalizeName(name: String): String = name.trim().lowercase()

    private fun flattenGroups(groups: List<Group>): List<Group> {
        val acc = mutableListOf<Group>()
        fun walk(g: Group) { acc += g; g.children.forEach { walk(it) } }
        groups.forEach { walk(it) }
        return acc
    }

    /**
     * Migration: move any prompts stored at the private root into the "Unfiled" group.
     * Returns the number of prompts moved.
     */
    fun migratePrivateRootPromptsToUnfiled(): Int {
        val lib = getLibrary()
        val toMove = lib.privatePrompts
        if (toMove.isEmpty()) return 0
        // Append to Unfiled group (create if absent)
        val unfiled = ensureUnfiledGroup()
        fun addInto(g: Group): Group = if (g.id == unfiled.id) {
            g.copy(prompts = g.prompts + toMove.map { it.copy(isPrivate = true) })
        } else g.copy(children = g.children.map { addInto(it) })
        val updatedGroups = getLibrary().groups.map { addInto(it) }
        saveLibrary(lib.copy(groups = updatedGroups, privatePrompts = emptyList()))
        return toMove.size
    }

    fun getPrivateGroups(): List<Group> = getAllGroups().filter { it.tags.contains(TAG_PRIVATE) || it.tags.isEmpty() }
    fun getSharedGroups(): List<Group> = getAllGroups().filter { it.tags.contains(TAG_SHARED) }

    /** Replace the Shared namespace groups with those provided (used by read-only Git import) */
    fun replaceSharedGroups(newShared: List<Group>) {
        val lib = getLibrary()
        val priv = getPrivateGroups()
        val updated = priv + newShared.map { it.copy(tags = (it.tags + TAG_SHARED).distinct()) }
        saveLibrary(lib.copy(groups = updated))
    }

    /**
     * Remove ALL Shared groups (local only). Private groups and private root prompts remain.
     */
    fun wipeSharedGroups() {
        val lib = getLibrary()
        val remaining = lib.groups.filter { !it.tags.contains(TAG_SHARED) }
        saveLibrary(lib.copy(groups = remaining))
    }

    /**
     * Remove ALL Private groups and private-root prompts (local only).
     */
    fun wipePrivateLibrary() {
        val lib = getLibrary()
        val sharedOnly = lib.groups.filter { it.tags.contains(TAG_SHARED) }
        saveLibrary(lib.copy(groups = sharedOnly, privatePrompts = emptyList()))
    }

    private fun addGroupInternal(name: String, tag: String): Group {
        val trimmed = name.trim()
        require(trimmed.isNotEmpty()) { "Group name cannot be blank" }
        val lib = getLibrary()
        val space = if (tag == TAG_PRIVATE) getPrivateGroups() else getSharedGroups()
        val exists = flattenGroups(space).any { normalizeName(it.name) == normalizeName(trimmed) }
        if (exists) {
            // return existing in that space
            return flattenGroups(space).first { normalizeName(it.name) == normalizeName(trimmed) }
        }

        // For shared groups, set the libraryId from the active library
        val libraryId = if (tag == TAG_SHARED) {
            try { PluginSettingsService.getEffectiveLibraryPath() } catch (_: Exception) { null }
        } else null

        val newGroup = Group(
            id = java.util.UUID.randomUUID().toString(),
            name = trimmed,
            tags = listOf(tag),
            libraryId = libraryId
        )
        saveLibrary(lib.copy(groups = lib.groups + newGroup))

        // Disk sync: write shared group to disk immediately
        if (tag == TAG_SHARED && libraryId != null) {
            writeGroupToDisk(newGroup)
        }

        return newGroup
    }

    fun addPrivateGroup(name: String): Group = addGroupInternal(name, TAG_PRIVATE)
    fun addSharedGroup(name: String): Group = addGroupInternal(name, TAG_SHARED)

    /**
     * Adds a new top-level group if its name is unique (case-insensitive across all groups and children).
     * If a duplicate exists, returns the existing group and does not modify storage.
     */
    @Deprecated("Use addPrivateGroup/addSharedGroup for namespaced groups")
    fun addGroup(name: String): Group {
        val trimmed = name.trim()
        require(trimmed.isNotEmpty()) { "Group name cannot be blank" }
        val lib = getLibrary()
        val all = flattenGroups(lib.groups)
        val existing = all.firstOrNull { normalizeName(it.name) == normalizeName(trimmed) }
        if (existing != null) return existing
        val newGroup = Group(id = java.util.UUID.randomUUID().toString(), name = trimmed)
        saveLibrary(lib.copy(groups = lib.groups + newGroup))
        return newGroup
    }

    /**
     * Renames an existing group if the new name is unique (case-insensitive) across all other groups.
     * If the name collides or is blank, the rename is ignored.
     */
    /**
     * Renames group; returns true if the name was changed, false if invalid or duplicate.
     */
    fun renameGroup(groupId: String, newName: String): Boolean {
        val trimmed = newName.trim()
        if (trimmed.isEmpty()) return false
        val lib = getLibrary()
        val all = flattenGroups(lib.groups)
        val normalized = normalizeName(trimmed)
        val collision = all.any { it.id != groupId && normalizeName(it.name) == normalized }
        if (collision) return false
        fun rename(g: Group): Group = if (g.id == groupId) g.copy(name = trimmed) else g.copy(children = g.children.map { rename(it) })
        saveLibrary(lib.copy(groups = lib.groups.map { rename(it) }))
        return true
    }

    /** Deletes a group by ID, preserving prompts by moving them to Private/Unfiled. */
    fun deleteGroupPreservePrompts(groupId: String) {
        deleteGroup(groupId)
    }


    fun deleteGroup(groupId: String) {
        val lib = getLibrary()
        fun collectAndRemove(list: List<Group>): Pair<List<Group>, List<Prompt>> {
            val kept = mutableListOf<Group>()
            var collected: List<Prompt> = emptyList()
            list.forEach { g ->
                if (g.id == groupId) {
                    collected = collected + g.prompts + g.children.flatMap { it.prompts }
                } else {
                    val (childKept, childCollected) = collectAndRemove(g.children)
                    kept += g.copy(children = childKept)
                    collected = collected + childCollected
                }
            }
            return kept to collected
        }
        val (keptGroups, collected) = collectAndRemove(lib.groups)

        // Append collected prompts to an "Unfiled" group (create if missing)
        fun appendToUnfiled(groups: List<Group>, toAdd: List<Prompt>): List<Group> {
            val normUnfiled = normalizeName(UNFILED_NAME)
            var added = false
            fun addInto(g: Group): Group {
                return if (normalizeName(g.name) == normUnfiled) {
                    added = true
                    g.copy(prompts = g.prompts + toAdd.map { it.copy(isPrivate = true) })
                } else {
                    g.copy(children = g.children.map { addInto(it) })
                }
            }
            val updated = groups.map { addInto(it) }
            return if (added) updated else updated + Group(id = java.util.UUID.randomUUID().toString(), name = UNFILED_NAME, prompts = toAdd.map { it.copy(isPrivate = true) })
        }
        val newGroups = appendToUnfiled(keptGroups, collected)
        // Clear any private-root prompts if leftover
        saveLibrary(lib.copy(groups = newGroups, privatePrompts = lib.privatePrompts))
    }

    fun movePromptToGroup(promptId: String, targetGroupId: String) {
        val lib = getLibrary()
        var moved: Prompt? = null
        var sourceGroup: Group? = null

        // Remove from private root, if present
        val remainingPrivate = lib.privatePrompts.filter { p ->
            if (p.id == promptId) { moved = p; false } else true
        }
        // Remove from any group it might be in
        fun removeFrom(g: Group): Group {
            val (keep, take) = g.prompts.partition { it.id != promptId }
            if (take.isNotEmpty()) {
                moved = take.first()
                sourceGroup = g
            }
            return g.copy(children = g.children.map { removeFrom(it) }, prompts = keep)
        }
        val strippedGroups = lib.groups.map { removeFrom(it) }

        // Find target group to get libraryId
        val targetGroup = findGroupById(lib, targetGroupId)

        // Insert into target group
        fun addInto(g: Group): Group {
            return if (g.id == targetGroupId) {
                val m = moved ?: return g
                // When moving into a shared group with libraryId, prefix the ID with the library namespace
                val newId = if (g.tags.contains(TAG_SHARED) && g.libraryId != null) {
                    // Strip any existing library prefix and add the new one
                    val baseId = m.id.substringAfter(":", m.id)
                    "${g.libraryId}:$baseId"
                } else {
                    m.id
                }
                // When moving into a group, mark as non-private and inherit libraryId
                g.copy(prompts = g.prompts + m.copy(id = newId, isPrivate = false, libraryId = g.libraryId))
            } else {
                g.copy(children = g.children.map { addInto(it) })
            }
        }
        val newGroups = strippedGroups.map { addInto(it) }
        saveLibrary(lib.copy(groups = newGroups, privatePrompts = remainingPrivate))

        // Disk sync: delete from old location if it was a shared group
        if (sourceGroup != null && sourceGroup!!.tags.contains(TAG_SHARED) && sourceGroup!!.libraryId != null) {
            deletePromptFromDisk(lib, sourceGroup!!, promptId)
        }

        // Disk sync: write to new location if target is a shared group
        if (moved != null && targetGroup != null && targetGroup.tags.contains(TAG_SHARED) && targetGroup.libraryId != null) {
            // Generate the new ID with library prefix for disk write
            val baseId = moved!!.id.substringAfter(":", moved!!.id)
            val newId = "${targetGroup.libraryId}:$baseId"
            val updatedPrompt = moved!!.copy(id = newId, isPrivate = false, libraryId = targetGroup.libraryId)
            writePromptToDisk(lib, targetGroup, updatedPrompt)
        }
    }

    fun movePromptToPrivate(promptId: String) {
        val lib = getLibrary()
        var extracted: Prompt? = null
        var sourceGroup: Group? = null

        fun removeFrom(g: Group): Group {
            val (keep, take) = g.prompts.partition { it.id != promptId }
            if (take.isNotEmpty()) {
                extracted = take.first()
                sourceGroup = g
            }
            return g.copy(prompts = keep, children = g.children.map { removeFrom(it) })
        }
        val newGroups = lib.groups.map { removeFrom(it) }
        val newPrivate = if (extracted != null) lib.privatePrompts + extracted!!.copy(isPrivate = true) else lib.privatePrompts
        saveLibrary(lib.copy(groups = newGroups, privatePrompts = newPrivate))

        // Disk sync: delete from old location if it was a shared group
        if (sourceGroup != null && sourceGroup!!.tags.contains(TAG_SHARED) && sourceGroup!!.libraryId != null) {
            deletePromptFromDisk(lib, sourceGroup!!, promptId)
        }
    }


    /**
     * Returns the current groups from the v2 library if present; otherwise empty list.
     */
    fun loadGroups(): List<Group> {
        return try {
            val lib = readLibrary()
            lib?.groups ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }

    /**
     * Load prompts from grouped store. If v2 doesn't exist, migrate from v1 if present.
     */
    fun loadPrompts(): List<Prompt> {
        return try {
            if (v2File.exists()) {
                val lib = json.decodeFromString<Library>(v2File.readText())
                lib.privatePrompts
            } else if (v1File.exists()) {
                val content = v1File.readText()
                val prompts = if (content.trim().isEmpty()) emptyList() else json.decodeFromString<List<Prompt>>(content)
                val priv = prompts.map { it.copy(isPrivate = true) }
                writeLibrary(Library(groups = emptyList(), privatePrompts = priv))
                priv
            } else {
                emptyList()
            }
        } catch (e: Exception) {
            println("Error loading prompts: ${e.message}")
            emptyList()
        }
    }

    /**
     * Saves all prompts to disk in v2 grouped library under privatePrompts.
     */
    fun savePrompts(prompts: List<Prompt>) {
        try {
            val priv = prompts.map { if (it.isPrivate) it else it.copy(isPrivate = true) }
            val existingGroups = readLibrary()?.groups ?: emptyList()
            writeLibrary(com.example.promptlibrary.model.Library(groups = existingGroups, privatePrompts = priv))
        } catch (e: Exception) {
            println("Error saving prompts: ${e.message}")
            throw e
        }
    }

    /**
     * Adds a new prompt, checking for duplicates based on normalized text.
     * Returns the added prompt, or null if a duplicate was found.
     */
    fun addPrompt(text: String, title: String? = null): Prompt? {
        val prompts = loadPrompts().toMutableList()
        val newPrompt = Prompt(text = text, title = title)

        // Check for duplicates using normalized text
        val normalizedNew = newPrompt.normalizedText()
        val isDuplicate = prompts.any { it.normalizedText() == normalizedNew }

        return if (isDuplicate) {
            null // Don't add duplicates
        } else {
            prompts.add(newPrompt)
            savePrompts(prompts)
            newPrompt
        }
    }

    /**
     * Updates an existing prompt by ID, regardless of whether it lives in Private or any Group.
     * Dedupes against ALL prompts (private + grouped). Returns updated prompt, or null if
     * not found or if the new text would create a duplicate.
     */
    fun updatePrompt(id: String, newText: String, newTitle: String? = null): Prompt? {
        val lib = getLibrary()

        // Helper: flatten group prompts
        fun flatten(groups: List<Group>): List<Prompt> = groups.flatMap { it.prompts + flatten(it.children) }

        val allPrompts = lib.privatePrompts + flatten(lib.groups)
        val current = allPrompts.firstOrNull { it.id == id } ?: return null
        val updated = current.copy(text = newText, title = newTitle)
        val normalizedNew = updated.normalizedText()

        val collision = allPrompts.any { it.id != id && it.normalizedText() == normalizedNew }
        if (collision) return null

        // Update in private if present
        if (lib.privatePrompts.any { it.id == id }) {
            val newPrivate = lib.privatePrompts.map { if (it.id == id) updated.copy(isPrivate = true) else it }
            saveLibrary(lib.copy(privatePrompts = newPrivate))
            return updated
        }

        // Otherwise update within groups
        var containingGroup: Group? = null
        fun replaceIn(g: Group): Group {
            val hasPrompt = g.prompts.any { it.id == id }
            if (hasPrompt) containingGroup = g
            val replacedPrompts = g.prompts.map { if (it.id == id) updated.copy(isPrivate = false) else it }
            return g.copy(prompts = replacedPrompts, children = g.children.map { replaceIn(it) })
        }
        val newGroups = lib.groups.map { replaceIn(it) }
        saveLibrary(lib.copy(groups = newGroups))

        // Disk sync: write to disk if it's in a shared group
        if (containingGroup != null && containingGroup!!.tags.contains(TAG_SHARED) && containingGroup!!.libraryId != null) {
            writePromptToDisk(lib, containingGroup!!, updated.copy(isPrivate = false))
        }

        return updated
    }

    /**
     * Deletes a prompt by ID from anywhere (private prompts or groups).
     * Returns the deleted prompt, or null if not found.
     */
    fun deletePrompt(id: String): Prompt? {
        val lib = getLibrary()

        // Check if in private prompts
        val privateIndex = lib.privatePrompts.indexOfFirst { it.id == id }
        if (privateIndex != -1) {
            val deletedPrompt = lib.privatePrompts[privateIndex]
            val newPrivate = lib.privatePrompts.filterNot { it.id == id }
            saveLibrary(lib.copy(privatePrompts = newPrivate))
            return deletedPrompt
        }

        // Otherwise look in groups
        var deletedPrompt: Prompt? = null
        var sourceGroup: Group? = null

        fun removeFrom(g: Group): Group {
            val found = g.prompts.firstOrNull { it.id == id }
            if (found != null) {
                deletedPrompt = found
                sourceGroup = g
            }
            val filtered = g.prompts.filterNot { it.id == id }
            return g.copy(prompts = filtered, children = g.children.map { removeFrom(it) })
        }

        val newGroups = lib.groups.map { removeFrom(it) }

        if (deletedPrompt != null) {
            saveLibrary(lib.copy(groups = newGroups))

            // Disk sync: delete from disk if it was in a shared group
            if (sourceGroup != null && sourceGroup!!.tags.contains(TAG_SHARED) && sourceGroup!!.libraryId != null) {
                deletePromptFromDisk(lib, sourceGroup!!, id)
            }
        }

        return deletedPrompt
    }

    /**
     * Imports prompts from a list, deduplicating based on normalized text.
     * Returns the number of prompts actually imported (excluding duplicates).
     */
    fun importPrompts(newPrompts: List<Prompt>): Int {
        val existingPrompts = loadPrompts().toMutableList()
        val existingNormalized = existingPrompts.map { it.normalizedText() }.toSet()

        var importedCount = 0
        for (newPrompt in newPrompts) {
            val normalizedNew = newPrompt.normalizedText()
            if (normalizedNew !in existingNormalized) {
                existingPrompts.add(newPrompt.copy(isPrivate = true))
                importedCount++
            }
        }

        if (importedCount > 0) {
            savePrompts(existingPrompts)
        }

        return importedCount
    }

    /**
     * Exports all prompts as a JSON string.
     */
    fun exportPrompts(): String {
        val prompts = loadPrompts()
        return json.encodeToString(prompts)
    }

    // ============================================================================
    // Disk Sync Helpers
    // ============================================================================

    /**
     * Writes a prompt to disk for a shared group.
     * Finds the group's path in the tree and writes to the appropriate library folder.
     */
    private fun writePromptToDisk(lib: Library, targetGroup: Group, prompt: Prompt) {
        val repoPath = PluginSettingsService.getEffectiveRepoPath()
        if (repoPath.isBlank() || targetGroup.libraryId == null) return

        try {
            val groupPath = findGroupPath(lib, targetGroup.id)
            if (groupPath.isEmpty()) {
                println("Could not find path for group ${targetGroup.id}")
                return
            }

            val folderPath = groupPath.map { it.name }
            GitYamlWriter.writeSinglePrompt(File(repoPath), targetGroup.libraryId!!, folderPath, prompt)
            println("Wrote prompt ${prompt.id} to disk: ${targetGroup.libraryId}/${folderPath.joinToString("/")}")
        } catch (e: Exception) {
            println("Failed to write prompt to disk: ${e.message}")
        }
    }

    /**
     * Deletes a prompt file from disk.
     */
    private fun deletePromptFromDisk(lib: Library, targetGroup: Group, promptId: String) {
        val repoPath = PluginSettingsService.getEffectiveRepoPath()
        if (repoPath.isBlank() || targetGroup.libraryId == null) return

        try {
            val groupPath = findGroupPath(lib, targetGroup.id)
            if (groupPath.isEmpty()) return

            val folderPath = groupPath.map { it.name }
            GitYamlWriter.deleteSinglePrompt(File(repoPath), targetGroup.libraryId!!, folderPath, promptId)
            println("Deleted prompt $promptId from disk: ${targetGroup.libraryId}/${folderPath.joinToString("/")}")
        } catch (e: Exception) {
            println("Failed to delete prompt from disk: ${e.message}")
        }
    }

    /**
     * Writes a group to disk for a shared group.
     * Creates the group folder and _group.yaml metadata file.
     */
    private fun writeGroupToDisk(group: Group) {
        val repoPath = PluginSettingsService.getEffectiveRepoPath()
        if (repoPath.isBlank() || group.libraryId == null) return

        try {
            // For a new top-level group, the folder path is just the group name
            val folderPath = listOf(group.name)
            GitYamlWriter.ensureGroupOnDisk(File(repoPath), group.libraryId!!, folderPath, group)
            println("Wrote group ${group.id} to disk: ${group.libraryId}/${folderPath.joinToString("/")}")
        } catch (e: Exception) {
            println("Failed to write group to disk: ${e.message}")
        }
    }

    /**
     * Finds the path of groups from the shared root to the target group.
     * Returns list of groups (including target).
     */
    private fun findGroupPath(lib: Library, targetId: String): List<Group> {
        val sharedGroups = lib.groups.filter { it.tags.contains(TAG_SHARED) }

        fun find(groups: List<Group>, path: List<Group>): List<Group>? {
            for (g in groups) {
                if (g.id == targetId) {
                    return path + g
                }
                val found = find(g.children, path + g)
                if (found != null) return found
            }
            return null
        }

        return find(sharedGroups, emptyList()) ?: emptyList()
    }

    /**
     * Finds a group by ID in the library.
     */
    private fun findGroupById(lib: Library, groupId: String): Group? {
        fun find(groups: List<Group>): Group? {
            for (g in groups) {
                if (g.id == groupId) return g
                val found = find(g.children)
                if (found != null) return found
            }
            return null
        }
        return find(lib.groups)
    }
}
