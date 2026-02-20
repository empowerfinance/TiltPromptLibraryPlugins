package com.example.promptlibrary.sync

import com.example.promptlibrary.events.LibraryEvents
import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.repository.PromptRepository
import com.example.promptlibrary.settings.PluginSettingsService
import com.example.promptlibrary.settings.titleCase
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import java.io.File

object SyncOrchestrator {
    /**
     * Pull & Sync: pull from remote with rebase, load YAML into memory.
     * NO writing, NO committing, NO pushing - this is a read-only operation.
     */
    fun sync(project: Project, repo: PromptRepository) {
        SyncLog.info("Starting sync...")
        val (rootDir, _) = GitRepoManager.ensureWorkingCopy(project)
        if (rootDir == null) {
            SyncLog.error("No working copy available")
            return
        }

        // Get all enabled libraries for multi-library support
        val enabledLibraries = PluginSettingsService.getEnabledLibraries()
        val libraryNames = enabledLibraries.joinToString(", ") { it.displayName }
        SyncLog.info("Enabled libraries: $libraryNames")

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Prompt Library: Pull & Sync", false) {
            override fun run(indicator: com.intellij.openapi.progress.ProgressIndicator) {
                try {
                    indicator.text = "Pulling from remote..."
                    SyncLog.info("Pulling from remote...")
                    GitPullService.pull(project, rootDir, null)  // Auto-detect branch from remote

                    indicator.text = "Loading YAML from ${enabledLibraries.size} libraries..."
                    SyncLog.info("Loading YAML from ${enabledLibraries.size} libraries...")

                    // Load from all enabled libraries (use rootDir which is the ensured working copy)
                    val libraryGroupsMap = GitYamlLoader.loadFromLibraries(rootDir, enabledLibraries)

                    // Merge all groups with library metadata
                    val allGroups = mutableListOf<Group>()
                    var totalPrompts = 0

                    for ((libraryId, groups) in libraryGroupsMap) {
                        // Add library metadata to groups and prompts
                        val groupsWithMetadata = groups.map { g -> addLibraryMetadata(g, libraryId) }
                        allGroups.addAll(groupsWithMetadata)
                        val promptCount = countPrompts(groups)
                        totalPrompts += promptCount
                        SyncLog.info("Library '$libraryId': ${groups.size} groups, $promptCount prompts")
                    }

                    indicator.text = "Updating library..."
                    SyncLog.info("Updating library with ${allGroups.size} groups from ${enabledLibraries.size} libraries...")
                    // Replace shared groups entirely with what's from remote
                    repo.replaceSharedGroups(allGroups)

                    val msg = "Pull & Sync complete: ${allGroups.size} groups, $totalPrompts prompts from ${enabledLibraries.size} library(ies)"
                    SyncLog.info(msg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", msg, NotificationType.INFORMATION))

                    // Notify library listeners to refresh
                    LibraryEvents.fireChanged()
                } catch (e: Exception) {
                    val errMsg = "Sync error: ${e.message}"
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                }
            }
        })
    }

    /**
     * Force pull: hard reset to remote, discard all local changes, load into memory.
     * NO commit/push - this is a one-way "get remote" operation.
     * Reads from all enabled libraries and merges them.
     */
    fun forcePull(project: Project, repo: PromptRepository) {
        SyncLog.info("Starting force pull (hard reset to remote)...")
        val (rootDir, _) = GitRepoManager.ensureWorkingCopy(project)
        if (rootDir == null) {
            SyncLog.error("No working copy available")
            return
        }
        // Get all enabled libraries for multi-library support
        val enabledLibraries = PluginSettingsService.getEnabledLibraries()
        val libraryNames = enabledLibraries.joinToString(", ") { it.displayName }
        SyncLog.info("Enabled libraries: $libraryNames")
        // Use rootDir (the ensured working copy) instead of getEffectiveRepoPath() to avoid empty path issues

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Prompt Library: Force Pull", false) {
            override fun run(indicator: com.intellij.openapi.progress.ProgressIndicator) {
                try {
                    indicator.text = "Fetching from remote..."
                    SyncLog.info("Fetching from origin...")
                    GitPullService.fetchOnly(project, rootDir)

                    // Auto-detect default branch from remote
                    val targetBranch = GitUtils.getDefaultBranch(project, rootDir)

                    indicator.text = "Hard reset to origin..."
                    SyncLog.info("Hard resetting to origin/$targetBranch...")
                    val success = GitPullService.hardResetToOrigin(project, rootDir, targetBranch)
                    if (!success) {
                        SyncLog.error("Failed to reset to origin")
                        Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Failed to reset to origin", NotificationType.ERROR))
                        return
                    }

                    indicator.text = "Loading YAML from ${enabledLibraries.size} libraries..."
                    SyncLog.info("Loading YAML from ${enabledLibraries.size} libraries...")

                    // Load from all enabled libraries (use rootDir which is the ensured working copy)
                    val libraryGroupsMap = GitYamlLoader.loadFromLibraries(rootDir, enabledLibraries)

                    // Merge all groups with library metadata
                    val allGroups = mutableListOf<Group>()
                    var totalPrompts = 0

                    for ((libraryId, groups) in libraryGroupsMap) {
                        // Add library metadata to groups and prompts
                        val groupsWithMetadata = groups.map { g -> addLibraryMetadata(g, libraryId) }
                        allGroups.addAll(groupsWithMetadata)
                        val promptCount = countPrompts(groups)
                        totalPrompts += promptCount
                        SyncLog.info("Library '$libraryId': ${groups.size} groups, $promptCount prompts")
                    }

                    indicator.text = "Updating library..."
                    SyncLog.info("Updating library with ${allGroups.size} groups from ${enabledLibraries.size} libraries...")
                    // Replace shared groups entirely with what's from remote
                    repo.replaceSharedGroups(allGroups)

                    val msg = "Force pull complete: ${allGroups.size} groups, $totalPrompts prompts from ${enabledLibraries.size} library(ies)"
                    SyncLog.info(msg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", msg, NotificationType.INFORMATION))

                    // Notify library listeners to refresh
                    LibraryEvents.fireChanged()
                } catch (e: Exception) {
                    val errMsg = "Force pull error: ${e.message}"
                    SyncLog.error(errMsg)
                    Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", errMsg, NotificationType.ERROR))
                }
            }
        })
    }

    /**
     * Partitions groups by their libraryId.
     * Returns a map from libraryId to the list of groups belonging to that library.
     * Groups without a libraryId are skipped (with a warning logged).
     */
    private fun partitionGroupsByLibrary(groups: List<Group>): Map<String, List<Group>> {
        val (withLibraryId, withoutLibraryId) = groups.partition { it.libraryId != null }
        if (withoutLibraryId.isNotEmpty()) {
            // Log warning for groups without libraryId - these won't be written anywhere
            // This shouldn't happen in normal operation since all shared groups are tagged with libraryId when loaded
            val names = withoutLibraryId.take(5).joinToString(", ") { it.name }
            val suffix = if (withoutLibraryId.size > 5) " and ${withoutLibraryId.size - 5} more" else ""
            SyncLog.warn("Skipping ${withoutLibraryId.size} group(s) without libraryId: $names$suffix")
        }
        return withLibraryId.groupBy { it.libraryId!! }
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

    /**
     * Recursively adds library metadata to a group and all its children/prompts.
     */
    private fun addLibraryMetadata(group: Group, libraryId: String): Group {
        return group.copy(
            libraryId = libraryId,
            prompts = group.prompts.map { it.copy(libraryId = libraryId) },
            children = group.children.map { addLibraryMetadata(it, libraryId) }
        )
    }

    /**
     * Counts total prompts in a list of groups (including nested children).
     */
    private fun countPrompts(groups: List<Group>): Int {
        var count = 0
        fun walk(g: Group) {
            count += g.prompts.size
            g.children.forEach { walk(it) }
        }
        groups.forEach { walk(it) }
        return count
    }

    /**
     * Reload from disk without git operations.
     * Used when library visibility settings change (e.g., un-hiding a library).
     * This reads from all enabled libraries and updates the repository.
     */
    fun reloadFromDisk(repo: PromptRepository) {
        val enabledLibraries = PluginSettingsService.getEnabledLibraries()
        val repoPath = PluginSettingsService.getEffectiveRepoPath()

        if (repoPath.isBlank()) {
            SyncLog.info("No repo path configured, skipping reload")
            return
        }

        val repoDir = File(repoPath)
        if (!repoDir.exists() || !repoDir.isDirectory) {
            SyncLog.info("Repo path does not exist: $repoPath")
            return
        }

        SyncLog.info("Reloading from disk: ${enabledLibraries.size} libraries")

        // Load from all enabled libraries
        val libraryGroupsMap = GitYamlLoader.loadFromLibraries(repoDir, enabledLibraries)

        // Merge all groups with library metadata
        val allGroups = mutableListOf<Group>()
        var totalPrompts = 0

        for ((libraryId, groups) in libraryGroupsMap) {
            val groupsWithMetadata = groups.map { g -> addLibraryMetadata(g, libraryId) }
            allGroups.addAll(groupsWithMetadata)
            val promptCount = countPrompts(groups)
            totalPrompts += promptCount
            SyncLog.info("Library '$libraryId': ${groups.size} groups, $promptCount prompts")
        }

        // Replace shared groups with what's on disk
        repo.replaceSharedGroups(allGroups)

        SyncLog.info("Reload complete: ${allGroups.size} groups, $totalPrompts prompts from ${enabledLibraries.size} library(ies)")

        // Notify library listeners to refresh
        LibraryEvents.fireChanged()
    }
}

