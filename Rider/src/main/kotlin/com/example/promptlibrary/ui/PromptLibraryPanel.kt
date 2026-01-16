package com.example.promptlibrary.ui

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.repository.PromptRepository
import com.example.promptlibrary.ui.components.PromptCard
import com.example.promptlibrary.ui.components.PromptComposer
import com.example.promptlibrary.ui.components.SaveResult
import com.example.promptlibrary.ui.components.GroupTreePanel
import com.example.promptlibrary.ui.components.SharedRoot
import com.example.promptlibrary.ui.components.PrivateRoot
import com.example.promptlibrary.ui.dialogs.EditPromptDialog
import com.example.promptlibrary.ui.dialogs.EditResult
import com.example.promptlibrary.ui.dialogs.ExportDialog
import com.example.promptlibrary.ui.dialogs.ImportDialog
import com.example.promptlibrary.ui.dialogs.ImportResult
import com.example.promptlibrary.ui.services.GitSyncService
import com.intellij.icons.AllIcons
import com.intellij.ide.CopyPasteManagerEx
import com.intellij.notification.Notification
import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.ui.JBColor
import com.intellij.ui.ScrollPaneFactory
import com.intellij.util.ui.JBUI
import kotlinx.serialization.json.*
import java.awt.*
import java.awt.datatransfer.StringSelection
import java.io.File
import javax.swing.*
import javax.swing.filechooser.FileNameExtensionFilter
import com.example.promptlibrary.sync.GitYamlLoader
import com.example.promptlibrary.settings.PluginSettingsConfigurable
import com.example.promptlibrary.settings.PluginSettingsService
import com.intellij.openapi.options.ShowSettingsUtil

class PromptLibraryPanel(private val project: com.intellij.openapi.project.Project) : JPanel(BorderLayout()) {
    private val repository = PromptRepository()
    private var prompts: List<Prompt> = emptyList()
    private val listPanel = JPanel()
    private val searchField = JTextField()

    // Group tree component
    private val groupTreePanel = GroupTreePanel(repository) { groupId ->
        selectedGroupId = groupId
        updateComposerState()
        refreshList()
    }
    private var selectedGroupId: String? = null

    private lateinit var promptComposer: PromptComposer
    private var lastDeletedPrompt: Prompt? = null

    // Git sync service
    private val gitSyncService = GitSyncService(project, repository)

    private val maxCardHeight = 180
    // UI layout components
    private lateinit var split: JSplitPane
    private lateinit var leftContainer: JPanel
    private val props: PropertiesComponent = PropertiesComponent.getInstance()
    private var showGroupTree: Boolean
        get() = props.getBoolean("promptlib.ui.showGroupTree", true)
        set(value) { props.setValue("promptlib.ui.showGroupTree", value, true) }
    private val defaultDividerSize = 8
    private var expandedPromptId: String? = null
    private val collapsedRowHeight = 24

    // Small, borderless icon button helper
    private fun iconButton(icon: javax.swing.Icon, tooltip: String, onClick: () -> Unit): JButton {
        return JButton(icon).apply {
            toolTipText = tooltip
            isContentAreaFilled = false
            isOpaque = false
            isBorderPainted = false
            isFocusPainted = false
            addActionListener { onClick() }
        }
    }

    init {
        // Right-click context menu on tree for rename/delete
        groupTreePanel.componentPopupMenu = JPopupMenu().apply {
            add(JMenuItem("Rename Group").apply {
                isEnabled = {
                    val sel = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
                    val g = sel?.userObject as? Group
                    if (g == null) false else !g.name.trim().equals("Unfiled", ignoreCase = true)
                }()
                addActionListener {
                    val sel = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
                    val g = sel?.userObject as? Group ?: return@addActionListener
                    val name = JOptionPane.showInputDialog(this@PromptLibraryPanel, "Rename group:", g.name)
                    val trimmed = name?.trim().orEmpty()
                    if (trimmed.isNotEmpty()) {
                        val ok = repository.renameGroup(g.id, trimmed)
                        if (!ok) Notifications.Bus.notify(Notification("PromptLibrary", "Duplicate group name", "A group with that name already exists in Private.", NotificationType.WARNING))
                        groupTreePanel.rebuildTree(); refreshList()
                    }
                }
            })
            add(JMenuItem("Delete Group").apply {
                // Only allow delete for groups under Private (not Shared), and never allow deleting Unfiled
                isEnabled = {
                    val sel = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
                    val g = sel?.userObject as? Group
                    if (g == null) false else {
                        val isShared = g.tags.contains("ns:shared")
                        val isUnfiled = g.name.trim().equals("Unfiled", ignoreCase = true)
                        !isShared && !isUnfiled
                    }
                }()
                addActionListener {
                    val sel = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
                    val g = sel?.userObject as? Group ?: return@addActionListener
                    val res = JOptionPane.showConfirmDialog(this@PromptLibraryPanel, "Delete group '${g.name}'? Prompts will be moved to Private/Unfiled.", "Confirm Delete", JOptionPane.YES_NO_OPTION)
                    if (res == JOptionPane.YES_OPTION) {
                        val unfiled = repository.ensureUnfiledGroup()
                        repository.deleteGroupPreservePrompts(g.id)
                        Notifications.Bus.notify(Notification("PromptLibrary", "Group deleted", "Moved prompts to '${unfiled.name}'.", NotificationType.INFORMATION))
                        groupTreePanel.rebuildTree(); refreshList()
                    }
                }
            })
        }

        border = JBUI.Borders.empty(8)


        // Compact toolbar: primary icons (Sync, Import, Export) + overflow menu (advanced + settings + view)
        val toolbar = JPanel(BorderLayout(8, 0)).apply {
            val actions = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
                // Primary: Sync
                add(JButton(AllIcons.Actions.Refresh).apply {
                    toolTipText = "Sync: Pull, merge (remote wins), write YAML, commit & push"
                    addActionListener { runFullSync() }
                })
                // Primary: Import
                add(JButton(AllIcons.ToolbarDecorator.Import).apply {
                    toolTipText = "Import prompts from JSON"
                    addActionListener { showImportDialog() }
                })
                // Primary: Export
                add(JButton(AllIcons.ToolbarDecorator.Export).apply {
                    toolTipText = "Export prompts to JSON"
                    addActionListener { showExportDialog() }
                })
            }

            // Helper: current selection (reserved for future context-aware actions)
            fun selectedGroupUnderPrivate(): Group? {
                val sel = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode ?: return null
                val uo = sel.userObject
                return if (uo is Group) uo else null
            }

            // Overflow menu consolidating view options, advanced git actions, and settings
            val overflowButton = JButton(AllIcons.Actions.More).apply {
                toolTipText = "More actions"
            }
            val overflowPopup = JPopupMenu().apply {
                // Advanced Git actions
                add(JMenuItem("Pull only").apply { addActionListener { pullFromGit() } })
                add(JMenuItem("Load from Repo (into Shared)").apply { addActionListener { loadRepoIntoShared() } })
                add(JMenuItem("Write to Git (commit & push)").apply { addActionListener { writeToGit() } })
                addSeparator()
                // View options
                add(JCheckBoxMenuItem("Show group tree", showGroupTree).apply {
                    addActionListener {
                        showGroupTree = isSelected
                        if (showGroupTree) {
                            split.leftComponent = leftContainer
                            split.dividerSize = defaultDividerSize
                        } else {
                            split.leftComponent = null
                            split.dividerSize = 0
                        }
                        split.revalidate(); split.repaint()
                    }
                })
                addSeparator()
                // Settings
                add(JMenuItem("Settings…").apply { addActionListener { openSettings() } })
                addSeparator()
                // Destructive action
                add(JMenuItem("Nuke local working copy…").apply {
                    addActionListener {
                        val res = JOptionPane.showConfirmDialog(
                            this@PromptLibraryPanel,
                            "Remove local working copy and re-sync?",
                            "Confirm",
                            JOptionPane.YES_NO_OPTION
                        )
                        if (res == JOptionPane.YES_OPTION) { nukeRepoAndResync() }
                    }
                })
            }
            overflowButton.addActionListener { overflowPopup.show(overflowButton, 0, overflowButton.height) }

            add(actions, BorderLayout.WEST)
            add(searchField.apply {
                toolTipText = "Search prompts…"
                document.addDocumentListener(SimpleDocumentListener { refreshList() })
            }, BorderLayout.CENTER)
            add(overflowButton, BorderLayout.EAST)
        }
            // Left: group tree with toolbar, Right: list
            // Left: group tree with toolbar, Right: list
            val treeToolbar = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
                add(JButton(AllIcons.General.Add).apply {
                    toolTipText = "Add Group"
                    addActionListener {
                        val options = arrayOf("Shared", "Private")
                        val target = JOptionPane.showInputDialog(this@PromptLibraryPanel, "Add group to:", "Add Group", JOptionPane.PLAIN_MESSAGE, null, options, options.last()) as? String
                        val name = JOptionPane.showInputDialog(this@PromptLibraryPanel, "New group name:", "Add Group", JOptionPane.PLAIN_MESSAGE)
                        val trimmed = name?.trim().orEmpty()
                        if (!trimmed.isNullOrEmpty()) {
                            val newGroup = if (target == "Shared") repository.addSharedGroup(trimmed) else repository.addPrivateGroup(trimmed)
                            // Focus the newly created group and rebuild
                            selectedGroupId = newGroup.id
                            groupTreePanel.rebuildTree(); refreshList()
                        }
                    }
                })
                add(JButton(AllIcons.Actions.Edit).apply {
                    toolTipText = "Rename Group"
                    addActionListener {
                        val sel = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
                        val g = sel?.userObject as? Group ?: return@addActionListener
                        val name = JOptionPane.showInputDialog(this@PromptLibraryPanel, "Rename group:", g.name)
                        val trimmed = name?.trim().orEmpty()
                        if (trimmed.isNotEmpty()) {
                            val ok = repository.renameGroup(g.id, trimmed)
                            if (!ok) {
                                Notifications.Bus.notify(Notification("PromptLibrary", "Duplicate group name", "A group with that name already exists.", NotificationType.WARNING))
                            }
                            groupTreePanel.rebuildTree(); refreshList()
                        }
                    }
                })
                add(JButton(AllIcons.General.Remove).apply {
                    toolTipText = "Delete Group"
                    addActionListener {
                        val sel = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
                        val g = sel?.userObject as? Group ?: return@addActionListener
                        if (g.tags.contains("ns:shared")) {
                            Notifications.Bus.notify(Notification("PromptLibrary", "Not allowed", "Shared groups cannot be deleted", NotificationType.WARNING))
                        } else {
                            val res = JOptionPane.showConfirmDialog(this@PromptLibraryPanel, "Delete group '${g.name}'? Prompts will be moved to Private/Unfiled.", "Confirm Delete", JOptionPane.YES_NO_OPTION)
                            if (res == JOptionPane.YES_OPTION) {
                                repository.deleteGroupPreservePrompts(g.id)
                                groupTreePanel.rebuildTree(); refreshList()
                            }
                        }
                    }
                })
            }


            split = JSplitPane(JSplitPane.HORIZONTAL_SPLIT).apply {
                dividerSize = defaultDividerSize
                resizeWeight = 0.25
            }
            // Build the left container with the group tree and toolbar
            leftContainer = JPanel(BorderLayout()).apply {
                add(treeToolbar, BorderLayout.NORTH)
                add(groupTreePanel, BorderLayout.CENTER)
            }
            // Attach components to split
            split.leftComponent = leftContainer
            split.rightComponent = ScrollPaneFactory.createScrollPane(listPanel, true).apply {
                horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
            }
            add(split, BorderLayout.CENTER)
            // Apply initial tree visibility
            fun applyTreeVisibility() {
                if (showGroupTree) {
                    split.leftComponent = leftContainer
                    split.dividerSize = defaultDividerSize
                } else {
                    split.leftComponent = null
                    split.dividerSize = 0


                }
                split.revalidate(); split.repaint()
            }
            applyTreeVisibility()

            // Tree selection is now handled by the GroupTreePanel callback

            // Restore and persist divider location
            val lastDiv = props.getInt("promptlib.split.divider", -1)
            if (lastDiv > 0) split.dividerLocation = lastDiv
            split.addPropertyChangeListener(JSplitPane.DIVIDER_LOCATION_PROPERTY) {
                // Update composer state after changing selection
                updateComposerState()

                props.setValue("promptlib.split.divider", split.dividerLocation, -1)
            }

            groupTreePanel.rebuildTree()

        add(toolbar, BorderLayout.NORTH)

        // List area (right side is already the listPanel scroll in the split)
        listPanel.layout = BoxLayout(listPanel, BoxLayout.Y_AXIS)
        listPanel.alignmentX = Component.LEFT_ALIGNMENT.toFloat()

        // New prompt composer
        promptComposer = PromptComposer { text ->
            val currentSelection = selectedGroupId
            val addedPrompt = repository.addPrompt(text)
            if (addedPrompt != null) {
                val targetGid = currentSelection ?: repository.ensureUnfiledGroup().id
                repository.movePromptToGroup(addedPrompt.id, targetGid)
                loadPrompts()
                // Restore focus to the group we just saved into
                selectedGroupId = targetGid
                groupTreePanel.rebuildTree()
                refreshList()
                SaveResult.Success
            } else {
                SaveResult.Duplicate
            }
        }
        add(promptComposer, BorderLayout.SOUTH)

        loadPrompts()
        // One-time migration: move any private-root prompts into Unfiled group so nothing sits on namespace roots
        val moved = repository.migratePrivateRootPromptsToUnfiled()
        if (moved > 0) {
            Notifications.Bus.notify(Notification("PromptLibrary", "Migrated prompts", "Moved ${moved} prompt(s) to Private/Unfiled", NotificationType.INFORMATION))
            groupTreePanel.rebuildTree()
        }
        // Initialize composer state on load
        promptComposer.updateState(groupSelected = false)

        refreshList()
            // Rebuild tree in case groups changed from settings actions
            groupTreePanel.rebuildTree()

    }

    private fun updateComposerState() {
        val isRootSelected = selectedGroupId == null
        promptComposer.updateState(groupSelected = !isRootSelected)
    }

    private fun loadPrompts() {
        prompts = repository.loadPrompts()
        // Default selection: Private (null)
        groupTreePanel.clearSelection()

    }

    private fun normalized(s: String): String = s
        .trim()
        .replace(Regex("\\s+"), " ")
        .replace("\r\n", "\n").replace("\r", "\n")
        .lines()
        .joinToString("\n") { it.trimEnd() }
        .lowercase()

    private fun matchesSearch(prompt: Prompt): Boolean {
        val q = searchField.text.trim()
        if (q.isEmpty()) return true
        return prompt.normalizedText().contains(normalized(q))
    }

    private fun refreshList() {
        listPanel.removeAll()
        // Do not show prompts when a namespace root (Shared/Private) is selected
        val base = when (val gid = selectedGroupId) {
            null -> emptyList()
            else -> repository.getGroupPrompts(gid)
        }
        val items = base.filter { matchesSearch(it) }
        items.forEach { prompt ->
            listPanel.add(createPromptCard(prompt))
            listPanel.add(Box.createVerticalStrut(8))
        }
        listPanel.revalidate()
        listPanel.repaint()
    }

    private fun createPromptCard(prompt: Prompt): JComponent {
        val isExpanded = expandedPromptId == prompt.id

        return PromptCard(
            prompt = prompt,
            isExpanded = isExpanded,
            maxCardHeight = maxCardHeight,
            collapsedRowHeight = collapsedRowHeight,
            onToggleExpand = { promptId ->
                expandedPromptId = if (isExpanded) null else promptId
                refreshList()
            },
            onCopy = { text -> copyToClipboard(text) },
            onEdit = { p -> openEditorDialog(p) },
            onDelete = { p ->
                val deletedPrompt = repository.deletePrompt(p.id)
                if (deletedPrompt != null) {
                    lastDeletedPrompt = deletedPrompt
                    loadPrompts()
                    refreshList()
                    showUndoNotification(deletedPrompt)
                }
            },
            onMove = { p, group ->
                repository.movePromptToGroup(p.id, group.id)
                loadPrompts()
                refreshList()
            },
            availableGroups = repository.getAllGroups()
        ).create()
    }

    private fun copyToClipboard(text: String) {
        CopyPasteManagerEx.getInstance().setContents(StringSelection(text))
        Notifications.Bus.notify(Notification("PromptLibrary", "Prompt copied", "", NotificationType.INFORMATION))
    }

    private fun openEditorDialog(prompt: Prompt) {
        EditPromptDialog(
            prompt = prompt,
            parent = this,
            onSave = { newText ->
                val updated = repository.updatePrompt(prompt.id, newText)
                if (updated == null) {
                    EditResult.Duplicate
                } else {
                    loadPrompts()
                    refreshList()
                    EditResult.Success
                }
            }
        ).show()
    }


    private fun showUndoNotification(deletedPrompt: Prompt) {
        val notification = Notification(
            "PromptLibrary",
            "Prompt deleted",
            "Click to undo",
            NotificationType.INFORMATION
        )

        notification.addAction(object : com.intellij.notification.NotificationAction("Undo") {
            override fun actionPerformed(e: com.intellij.openapi.actionSystem.AnActionEvent, notification: Notification) {

                // Restore the deleted prompt
                val restoredPrompts = repository.loadPrompts().toMutableList()
                restoredPrompts.add(deletedPrompt)
                repository.savePrompts(restoredPrompts)

                loadPrompts()
                refreshList()

                // Hide the notification
                notification.expire()

                // Show confirmation
                Notifications.Bus.notify(
                    Notification("PromptLibrary", "Prompt restored", "", NotificationType.INFORMATION)
                )
            }
        })

        Notifications.Bus.notify(notification)
    }

    private fun showExportDialog() {
        // Decide export scope based on tree selection
        val node = groupTreePanel.getLastSelectedNode() as? javax.swing.tree.DefaultMutableTreeNode
        val uo = node?.userObject

        val exportPrompts: List<Prompt> = when (uo) {
            is Group -> repository.getGroupPrompts(uo.id)
            is SharedRoot, is PrivateRoot -> repository.getAllPromptsLibrary()
            else -> repository.getAllPromptsLibrary()
        }

        val title = if (uo is Group) "Export Group: ${uo.name}" else "Export Library (v1 JSON)"
        val defaultName = if (uo is Group) {
            uo.name.replace(" ", "_").lowercase() + "-prompts.json"
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
                loadPrompts()
                refreshList()
                ImportResult.Success(
                    importedCount = importedCount,
                    duplicatesSkipped = importedPrompts.size - importedCount
                )
            }
        ).show()
    }

    // Git Sync helpers (methods must be inside class)
    private fun openSettings() {
        ShowSettingsUtil.getInstance().showSettingsDialog(null, PluginSettingsConfigurable::class.java)
    }

    private fun loadRepoIntoShared() {
        val settings = PluginSettingsService.instance().data
        val working = com.example.promptlibrary.sync.GitRepoManager.ensureWorkingCopy(project).first
        if (working == null) {
            JOptionPane.showMessageDialog(this@PromptLibraryPanel, "No working copy available. Set remote URL in settings.", "Git Sync", JOptionPane.WARNING_MESSAGE)
            return
        }
        val root = File(working, settings.promptsSubdir)
        if (!root.exists() || !root.isDirectory) {
            JOptionPane.showMessageDialog(this@PromptLibraryPanel, "Invalid prompts subdir.", "Git Sync", JOptionPane.WARNING_MESSAGE)
            return
        }
        try {
            val groups = GitYamlLoader.loadFromRoot(root)
            repository.replaceSharedGroups(groups)
            groupTreePanel.rebuildTree(); refreshList()
            Notifications.Bus.notify(Notification("PromptLibrary", "Git Sync", "Imported ${'$'}{groups.size} Shared group(s) from Git (remote-wins).", NotificationType.INFORMATION))
        } catch (e: Exception) {
            JOptionPane.showMessageDialog(this@PromptLibraryPanel, "Error loading YAML: ${'$'}{e.message}", "Git Sync", JOptionPane.ERROR_MESSAGE)
        }
    }

    private fun pullFromGit() {
        val settings = PluginSettingsService.instance().data
        val working = com.example.promptlibrary.sync.GitRepoManager.ensureWorkingCopy(project).first ?: return
        com.example.promptlibrary.sync.GitPullService.pull(project, working, settings.branchName)
    }

    private fun writeToGit() {
        com.example.promptlibrary.sync.WriteStrategyService.write(project, repository)
    }
    private fun runFullSync() {
        com.example.promptlibrary.sync.SyncOrchestrator.sync(project, repository)
    }

    private fun nukeRepoAndResync() {
        com.example.promptlibrary.sync.GitRepoManager.nukeWorkingCopy(project)
        runFullSync()
    }
}

// Helpers
private class SimpleDocumentListener(val onChange: () -> Unit) : javax.swing.event.DocumentListener {
    override fun insertUpdate(e: javax.swing.event.DocumentEvent?) = onChange()
    override fun removeUpdate(e: javax.swing.event.DocumentEvent?) = onChange()
    override fun changedUpdate(e: javax.swing.event.DocumentEvent?) = onChange()
}
