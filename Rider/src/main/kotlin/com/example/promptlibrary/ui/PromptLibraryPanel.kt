package com.example.promptlibrary.ui

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.repository.PromptRepository
import com.example.promptlibrary.ui.components.PromptComposer
import com.example.promptlibrary.ui.components.SaveResult
import com.example.promptlibrary.ui.components.GroupTreePanel
import com.example.promptlibrary.ui.components.GroupNode
import com.example.promptlibrary.ui.dialogs.ExportDialog
import com.example.promptlibrary.ui.dialogs.ImportDialog
import com.example.promptlibrary.ui.dialogs.ImportResult
import com.example.promptlibrary.ui.services.GitSyncService
import com.example.promptlibrary.settings.PluginSettingsConfigurable
import com.intellij.icons.AllIcons
import com.intellij.ide.CopyPasteManagerEx
import com.intellij.notification.Notification
import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.ui.JBColor
import com.intellij.ui.ScrollPaneFactory
import com.intellij.util.ui.JBUI
import kotlinx.serialization.json.*
import java.awt.*
import java.awt.datatransfer.StringSelection
import javax.swing.*
import javax.swing.filechooser.FileNameExtensionFilter

class PromptLibraryPanel(private val project: com.intellij.openapi.project.Project) : JPanel(BorderLayout()) {
    private val repository = PromptRepository()
    private var selectedGroupId: String? = null
    private var selectedGroupName: String? = null
    private var editingGroupId: String? = null



    // Group tree component
    private val groupTreePanel = GroupTreePanel(
        repository = repository,
        onGroupSelected = { groupId ->
            selectedGroupId = groupId
            selectedGroupName = getGroupName(groupId)
            updateComposerState()
            // Exit edit mode when selecting a different group
            if (::promptComposer.isInitialized) {
                promptComposer.exitEditMode()
            }
        },
        onPromptSelected = { prompt, groupId ->
            handlePromptSelected(prompt, groupId)
        },
        onAddGroupToShared = {
            addGroupToNamespace("Shared")
        },
        onAddGroupToPrivate = {
            addGroupToNamespace("Private")
        },
        onEditGroup = { group ->
            showEditGroupDialog(group)
        }
    )

    private lateinit var promptComposer: PromptComposer

    // Git sync service
    private val gitSyncService = GitSyncService(project, repository)

    // Small, borderless icon button helper with modern hover effects
    private fun iconButton(icon: javax.swing.Icon, tooltip: String, onClick: () -> Unit): JButton {
        return JButton(icon).apply {
            toolTipText = tooltip
            isContentAreaFilled = false
            isOpaque = false
            isBorderPainted = false
            isFocusPainted = false
            cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)

            // Add modern hover effect
            addMouseListener(object : java.awt.event.MouseAdapter() {
                override fun mouseEntered(e: java.awt.event.MouseEvent?) {
                    isContentAreaFilled = true
                    background = JBColor.namedColor("Button.hoverBackground",
                        JBColor(java.awt.Color(0, 0, 0, 10), java.awt.Color(255, 255, 255, 10)))
                }
                override fun mouseExited(e: java.awt.event.MouseEvent?) {
                    isContentAreaFilled = false
                }
                override fun mousePressed(e: java.awt.event.MouseEvent?) {
                    background = JBColor.namedColor("Button.pressedBackground",
                        JBColor(java.awt.Color(0, 0, 0, 20), java.awt.Color(255, 255, 255, 20)))
                }
            })

            addActionListener { onClick() }
        }
    }

    init {
        // Right-click context menu on tree for rename/delete
        groupTreePanel.componentPopupMenu = JPopupMenu().apply {
            add(JMenuItem("Rename Group").apply {
                isEnabled = {
                    val sel = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
                    val groupNode = sel?.userObject as? GroupNode
                    if (groupNode == null) false else !groupNode.group.name.trim().equals("Unfiled", ignoreCase = true)
                }()
                addActionListener {
                    val sel = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
                    val groupNode = sel?.userObject as? GroupNode ?: return@addActionListener
                    val g = groupNode.group
                    val name = JOptionPane.showInputDialog(this@PromptLibraryPanel, "Rename group:", g.name)
                    val trimmed = name?.trim().orEmpty()
                    if (trimmed.isNotEmpty()) {
                        val ok = repository.renameGroup(g.id, trimmed)
                        if (!ok) Notifications.Bus.notify(Notification("PromptLibrary", "Duplicate group name", "A group with that name already exists.", NotificationType.WARNING))
                        groupTreePanel.rebuildTree()
                    }
                }
            })
            add(JMenuItem("Delete Group").apply {
                // Only allow delete for groups under Private (not Shared), and never allow deleting Unfiled
                isEnabled = {
                    val sel = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
                    val groupNode = sel?.userObject as? GroupNode
                    if (groupNode == null) false else {
                        val g = groupNode.group
                        val isShared = g.tags.contains("ns:shared")
                        val isUnfiled = g.name.trim().equals("Unfiled", ignoreCase = true)
                        !isShared && !isUnfiled
                    }
                }()
                addActionListener {
                    val sel = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
                    val groupNode = sel?.userObject as? GroupNode ?: return@addActionListener
                    val g = groupNode.group
                    val res = JOptionPane.showConfirmDialog(this@PromptLibraryPanel, "Delete group '${g.name}'? Prompts will be moved to Private/Unfiled.", "Confirm Delete", JOptionPane.YES_NO_OPTION)
                    if (res == JOptionPane.YES_OPTION) {
                        val unfiled = repository.ensureUnfiledGroup()
                        repository.deleteGroupPreservePrompts(g.id)
                        Notifications.Bus.notify(Notification("PromptLibrary", "Group deleted", "Moved prompts to '${unfiled.name}'.", NotificationType.INFORMATION))
                        groupTreePanel.rebuildTree()
                    }
                }
            })
        }

        border = JBUI.Borders.empty(4)


        // Compact toolbar: Import, Export + Settings button (Sync operations moved to Sync Ops tab)
        val toolbar = JPanel(BorderLayout(4, 0)).apply {
            border = JBUI.Borders.emptyBottom(4)

            val actions = JPanel(FlowLayout(FlowLayout.LEFT, 2, 0)).apply {
                // Primary: Import
                add(iconButton(AllIcons.ToolbarDecorator.Import, "Import prompts from JSON") {
                    showImportDialog()
                })
                // Primary: Export
                add(iconButton(AllIcons.ToolbarDecorator.Export, "Export prompts to JSON") {
                    showExportDialog()
                })
            }

            // Settings button
            val settingsButton = JButton(AllIcons.General.Settings).apply {
                toolTipText = "Settings"
                isContentAreaFilled = false
                isOpaque = false
                isBorderPainted = false
                isFocusPainted = false
                cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)

                addMouseListener(object : java.awt.event.MouseAdapter() {
                    override fun mouseEntered(e: java.awt.event.MouseEvent?) {
                        isContentAreaFilled = true
                        background = JBColor.namedColor("Button.hoverBackground",
                            JBColor(java.awt.Color(0, 0, 0, 10), java.awt.Color(255, 255, 255, 10)))
                    }
                    override fun mouseExited(e: java.awt.event.MouseEvent?) {
                        isContentAreaFilled = false
                    }
                    override fun mousePressed(e: java.awt.event.MouseEvent?) {
                        background = JBColor.namedColor("Button.pressedBackground",
                            JBColor(java.awt.Color(0, 0, 0, 20), java.awt.Color(255, 255, 255, 20)))
                    }
                })

                addActionListener { openSettings() }
            }

            add(actions, BorderLayout.WEST)
            add(settingsButton, BorderLayout.EAST)
        }

        // Tree toolbar (empty for now - group management is done via edit icons in tree)
        val treeToolbar = JPanel(FlowLayout(FlowLayout.LEFT, 2, 2)).apply {
            border = JBUI.Borders.emptyBottom(2)
        }

        // Prompt composer with both add and update callbacks
        promptComposer = PromptComposer(
            onSave = { text, title ->
                val currentSelection = selectedGroupId
                val addedPrompt = repository.addPrompt(text, title)
                if (addedPrompt != null) {
                    val targetGid = currentSelection ?: repository.ensureUnfiledGroup().id
                    repository.movePromptToGroup(addedPrompt.id, targetGid)
                    // Restore focus to the group we just saved into
                    selectedGroupId = targetGid
                    groupTreePanel.rebuildTree()
                    SaveResult.Success
                } else {
                    SaveResult.Duplicate
                }
            },
            onUpdate = { prompt, text, title ->
                val updated = repository.updatePrompt(prompt.id, text, title)
                if (updated != null) {
                    groupTreePanel.rebuildTree()
                    SaveResult.Success
                } else {
                    SaveResult.Duplicate
                }
            }
        )

        // Tree section with toolbar
        val treeSection = JPanel(BorderLayout()).apply {
            add(treeToolbar, BorderLayout.NORTH)
            add(ScrollPaneFactory.createScrollPane(groupTreePanel, true), BorderLayout.CENTER)
        }

        // Vertical split pane: tree (top) <-> composer (bottom)
        val splitPane = com.intellij.ui.JBSplitter(true).apply {
            firstComponent = treeSection
            secondComponent = promptComposer
            proportion = 0.5f // 50% tree, 50% composer initially
            setHonorComponentsMinimumSize(true)
        }

        add(toolbar, BorderLayout.NORTH)
        add(splitPane, BorderLayout.CENTER)

        // One-time migration: move any private-root prompts into Unfiled group
        val moved = repository.migratePrivateRootPromptsToUnfiled()
        if (moved > 0) {
            Notifications.Bus.notify(Notification("PromptLibrary", "Migrated prompts", "Moved ${moved} prompt(s) to Private/Unfiled", NotificationType.INFORMATION))
        }

        // Initialize composer state
        promptComposer.updateState(groupSelected = false, groupName = null)

        // Build initial tree
        groupTreePanel.rebuildTree()

    }

    private fun handlePromptSelected(prompt: Prompt, groupId: String) {
        // Copy to clipboard
        CopyPasteManagerEx.getInstance().setContents(StringSelection(prompt.text))
        Notifications.Bus.notify(Notification("PromptLibrary", "Prompt copied", "", NotificationType.INFORMATION))

        // Load prompt directly into composer for editing
        promptComposer.enterEditMode(prompt, groupId)

        // Update selected group for composer
        selectedGroupId = groupId
        selectedGroupName = getGroupName(groupId)
        updateComposerState()
    }

    private fun getGroupName(groupId: String?): String? {
        if (groupId == null) return null
        val group = findGroupById(groupId)
        return group?.name
    }



    private fun deletePrompt(prompt: Prompt, groupId: String) {
        val res = JOptionPane.showConfirmDialog(
            this,
            "Delete this prompt?",
            "Confirm Delete",
            JOptionPane.YES_NO_OPTION
        )
        if (res == JOptionPane.YES_OPTION) {
            repository.deletePrompt(prompt.id)
            groupTreePanel.rebuildTree()
            Notifications.Bus.notify(Notification("PromptLibrary", "Prompt deleted", "", NotificationType.INFORMATION))
        }
    }

    /**
     * Helper function to add a group to a specific namespace (Shared or Private).
     */
    private fun addGroupToNamespace(namespace: String) {
        val name = JOptionPane.showInputDialog(this, "New group name:", "Add Group to $namespace", JOptionPane.PLAIN_MESSAGE)
        val trimmed = name?.trim().orEmpty()
        if (trimmed.isNotEmpty()) {
            val newGroup = if (namespace == "Shared") {
                repository.addSharedGroup(trimmed)
            } else {
                repository.addPrivateGroup(trimmed)
            }
            selectedGroupId = newGroup.id
            selectedGroupName = newGroup.name
            groupTreePanel.rebuildTree()
            updateComposerState()
        }
    }

    private fun updateComposerState() {
        val groupId = selectedGroupId
        val group = if (groupId != null) findGroupById(groupId) else null
        val groupName = selectedGroupName ?: group?.name
        val isValidGroup = group != null && !isRootGroup(group)

        promptComposer.updateState(groupSelected = isValidGroup, groupName = groupName)
    }

    private fun findGroupById(groupId: String): Group? {
        fun search(g: Group): Group? {
            if (g.id == groupId) return g
            g.children.forEach { child ->
                search(child)?.let { return it }
            }
            return null
        }
        return repository.getAllGroups().firstNotNullOfOrNull { search(it) }
    }

    private fun isRootGroup(group: Group): Boolean {
        return group.id == "root-shared" || group.id == "root-private"
    }

    private fun showExportDialog() {
        // Decide export scope based on tree selection
        val node = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
        val uo = node?.userObject

        val exportPrompts: List<Prompt> = when (uo) {
            is GroupNode -> repository.getGroupPrompts(uo.group.id)
            else -> repository.getAllPromptsLibrary()
        }

        val title = if (uo is GroupNode) "Export Group: ${uo.group.name}" else "Export Library (v1 JSON)"
        val defaultName = if (uo is GroupNode) {
            uo.group.name.replace(" ", "_").lowercase() + "-prompts.json"
        } else {
            "library-prompts.json"
        }

        ExportDialog(
            prompts = exportPrompts,
            title = title,
            defaultFileName = defaultName,
            parent = this
        ).show()
    }

    private fun showImportDialog() {
        ImportDialog(
            parent = this,
            onImport = { importedPrompts ->
                val importedCount = repository.importPrompts(importedPrompts)
                groupTreePanel.rebuildTree()
                ImportResult.Success(
                    importedCount = importedCount,
                    duplicatesSkipped = importedPrompts.size - importedCount
                )
            }
        ).show()
    }

    private fun showEditGroupDialog(group: Group) {
        // Check if this is the Unfiled group
        if (group.name.trim().equals("Unfiled", ignoreCase = true)) {
            Notifications.Bus.notify(
                Notification(
                    "PromptLibrary",
                    "Cannot Edit",
                    "The 'Unfiled' group cannot be renamed or deleted.",
                    NotificationType.WARNING
                )
            )
            return
        }

        val isShared = group.tags.contains("ns:shared")

        // Show dialog with Rename and Delete options
        val options = if (isShared) {
            arrayOf("Rename", "Cancel")
        } else {
            arrayOf("Rename", "Delete", "Cancel")
        }

        val choice = JOptionPane.showOptionDialog(
            this,
            "Edit group: ${group.name}",
            "Edit Group",
            JOptionPane.DEFAULT_OPTION,
            JOptionPane.PLAIN_MESSAGE,
            null,
            options,
            options[0]
        )

        when (choice) {
            0 -> { // Rename
                val newName = JOptionPane.showInputDialog(this, "Rename group:", group.name)
                val trimmed = newName?.trim().orEmpty()
                if (trimmed.isNotEmpty()) {
                    val ok = repository.renameGroup(group.id, trimmed)
                    if (!ok) {
                        Notifications.Bus.notify(
                            Notification(
                                "PromptLibrary",
                                "Duplicate group name",
                                "A group with that name already exists.",
                                NotificationType.WARNING
                            )
                        )
                    }
                    groupTreePanel.rebuildTree()
                }
            }
            1 -> { // Delete (only for Private groups)
                if (!isShared) {
                    val res = JOptionPane.showConfirmDialog(
                        this,
                        "Delete group '${group.name}'? Prompts will be moved to Private/Unfiled.",
                        "Confirm Delete",
                        JOptionPane.YES_NO_OPTION
                    )
                    if (res == JOptionPane.YES_OPTION) {
                        val unfiled = repository.ensureUnfiledGroup()
                        repository.deleteGroupPreservePrompts(group.id)
                        Notifications.Bus.notify(
                            Notification(
                                "PromptLibrary",
                                "Group deleted",
                                "Moved prompts to '${unfiled.name}'.",
                                NotificationType.INFORMATION
                            )
                        )
                        groupTreePanel.rebuildTree()
                    }
                }
            }
        }
    }

    private fun openSettings() {
        ShowSettingsUtil.getInstance().showSettingsDialog(null, PluginSettingsConfigurable::class.java)
    }
}
