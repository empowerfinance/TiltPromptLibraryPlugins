package com.example.promptlibrary.ui

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt

import com.example.promptlibrary.repository.PromptRepository
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
    // Group tree state
    private val groupTreeModel = javax.swing.tree.DefaultTreeModel(javax.swing.tree.DefaultMutableTreeNode("Library"))
    private val groupTree = JTree(groupTreeModel)
    private var selectedGroupId: String? = null // null => Private

    private object SharedRoot { override fun toString() = "Shared" }
    private object PrivateRoot { override fun toString() = "Private" }

    private val newPromptArea = JTextArea(5, 40)
    // Composer controls (initialized later)
    private lateinit var saveButton: JButton
    private val composerHint = JLabel("")

    private var lastDeletedPrompt: Prompt? = null
    init {
        // Ensure composer text area wraps by default
        newPromptArea.lineWrap = true
        newPromptArea.wrapStyleWord = true
    }

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
    private fun rebuildGroupTree() {
        val prevSelected = selectedGroupId
        val root = javax.swing.tree.DefaultMutableTreeNode("Root")
        // Two namespaces: Shared and Private
        val sharedNode = javax.swing.tree.DefaultMutableTreeNode(SharedRoot)
        val privateNode = javax.swing.tree.DefaultMutableTreeNode(PrivateRoot)
        root.add(sharedNode)
        root.add(privateNode)
        fun addNodes(parent: javax.swing.tree.DefaultMutableTreeNode, groups: List<Group>) {
            for (g in groups) {
                val node = javax.swing.tree.DefaultMutableTreeNode(g)
                parent.add(node)
                if (g.children.isNotEmpty()) addNodes(node, g.children)
            }
        }
        // Populate namespaces from repository per-namespace lists
        addNodes(sharedNode, repository.getSharedGroups())
        // Private: pin Unfiled at top
        val privGroups = repository.getPrivateGroups()
        val unfiled = privGroups.firstOrNull { it.name.trim().equals("Unfiled", ignoreCase = true) }
        if (unfiled != null) addNodes(privateNode, listOf(unfiled))
        addNodes(privateNode, privGroups.filter { it.id != unfiled?.id })
        groupTreeModel.setRoot(root)
        groupTreeModel.reload()
        groupTree.expandRow(0)
        // Try to restore previous selection (by group id)
        if (prevSelected != null) {
            val treeRoot = groupTreeModel.root as javax.swing.tree.DefaultMutableTreeNode
            fun find(node: javax.swing.tree.DefaultMutableTreeNode): javax.swing.tree.TreePath? {
                val uo = node.userObject
                if (uo is Group && uo.id == prevSelected) return javax.swing.tree.TreePath(node.path)
                for (i in 0 until node.childCount) {
                    val child = node.getChildAt(i) as javax.swing.tree.DefaultMutableTreeNode
                    val found = find(child)
                    if (found != null) return found
                }
                return null
            }
            find(treeRoot)?.let { groupTree.selectionPath = it }
        }
    }

    init {
        // Render group names and root labels nicely
        groupTree.cellRenderer = object : javax.swing.tree.DefaultTreeCellRenderer() {
            override fun getTreeCellRendererComponent(
                tree: JTree?, value: Any?, sel: Boolean, expanded: Boolean, leaf: Boolean, row: Int, hasFocus: Boolean
            ): java.awt.Component {
                val comp = super.getTreeCellRendererComponent(tree, value, sel, expanded, leaf, row, hasFocus)
                val node = value as? javax.swing.tree.DefaultMutableTreeNode
                val uo = node?.userObject
                text = when (uo) {
                    is SharedRoot -> "Shared"
                    is PrivateRoot -> "Private"
                    is Group -> uo.name
                    else -> uo?.toString() ?: ""
                }
                return comp
            }
        }
        // Show the root to display Shared and Private
        groupTree.isRootVisible = false
        // Veto collapsing Shared/Private by re-expanding on collapse
        groupTree.addTreeWillExpandListener(object : javax.swing.event.TreeWillExpandListener {
            override fun treeWillExpand(event: javax.swing.event.TreeExpansionEvent?) {}
            override fun treeWillCollapse(event: javax.swing.event.TreeExpansionEvent?) {
                // Re-expand the root immediately to prevent collapse
                javax.swing.SwingUtilities.invokeLater {
                    for (i in 0 until groupTree.rowCount) groupTree.expandRow(i)
                }
            }
        })
        for (i in 0 until groupTree.rowCount) groupTree.expandRow(i)
    }

    // Small, borderless icon button helper
    private fun iconButton(icon: javax.swing.Icon, tooltip: String, onClick: () -> Unit): JButton {
        // Right-click context menu on tree for rename/delete
        groupTree.componentPopupMenu = JPopupMenu().apply {
            add(JMenuItem("Rename Group").apply {
                isEnabled = {
                    val sel = groupTree.lastSelectedPathComponent as? javax.swing.tree.DefaultMutableTreeNode
                    val g = sel?.userObject as? Group
                    if (g == null) false else !g.name.trim().equals("Unfiled", ignoreCase = true)
                }()
                addActionListener {
                    val sel = groupTree.lastSelectedPathComponent as? javax.swing.tree.DefaultMutableTreeNode
                    val g = sel?.userObject as? Group ?: return@addActionListener
                    val name = JOptionPane.showInputDialog(this@PromptLibraryPanel, "Rename group:", g.name)
                    val trimmed = name?.trim().orEmpty()
                    if (trimmed.isNotEmpty()) {
                        val ok = repository.renameGroup(g.id, trimmed)
                        if (!ok) Notifications.Bus.notify(Notification("PromptLibrary", "Duplicate group name", "A group with that name already exists in Private.", NotificationType.WARNING))
                        rebuildGroupTree(); refreshList()
                    }
                }
            })
            add(JMenuItem("Delete Group").apply {
                // Only allow delete for groups under Private (not Shared), and never allow deleting Unfiled
                isEnabled = {
                    val sel = groupTree.lastSelectedPathComponent as? javax.swing.tree.DefaultMutableTreeNode
                    val g = sel?.userObject as? Group
                    if (g == null) false else {
                        val isShared = g.tags.contains("ns:shared")
                        val isUnfiled = g.name.trim().equals("Unfiled", ignoreCase = true)
                        !isShared && !isUnfiled
                    }
                }()
                addActionListener {
                    val sel = groupTree.lastSelectedPathComponent as? javax.swing.tree.DefaultMutableTreeNode
                    val g = sel?.userObject as? Group ?: return@addActionListener
                    val res = JOptionPane.showConfirmDialog(this@PromptLibraryPanel, "Delete group '${g.name}'? Prompts will be moved to Private/Unfiled.", "Confirm Delete", JOptionPane.YES_NO_OPTION)
                    if (res == JOptionPane.YES_OPTION) {
                        val unfiled = repository.ensureUnfiledGroup()
                        repository.deleteGroupPreservePrompts(g.id)
                        Notifications.Bus.notify(Notification("PromptLibrary", "Group deleted", "Moved prompts to '${unfiled.name}'.", NotificationType.INFORMATION))
                        rebuildGroupTree(); refreshList()
                    }
                }
            })
        }

        return JButton(icon).apply {
            toolTipText = tooltip
            isContentAreaFilled = false
            isOpaque = false
            border = JBUI.Borders.empty()
            isBorderPainted = false
            isFocusPainted = false
            margin = Insets(0, 0, 0, 0)
            preferredSize = Dimension(16, 16)
            addActionListener { onClick() }
        }
    }

    init {
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
                val sel = groupTree.lastSelectedPathComponent as? javax.swing.tree.DefaultMutableTreeNode ?: return null
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
                            rebuildGroupTree(); refreshList()
                        }
                    }
                })
                add(JButton(AllIcons.Actions.Edit).apply {
                    toolTipText = "Rename Group"
                    addActionListener {
                        val sel = groupTree.lastSelectedPathComponent as? javax.swing.tree.DefaultMutableTreeNode
                        val g = sel?.userObject as? Group ?: return@addActionListener
                        val name = JOptionPane.showInputDialog(this@PromptLibraryPanel, "Rename group:", g.name)
                        val trimmed = name?.trim().orEmpty()
                        if (trimmed.isNotEmpty()) {
                            val ok = repository.renameGroup(g.id, trimmed)
                            if (!ok) {
                                Notifications.Bus.notify(Notification("PromptLibrary", "Duplicate group name", "A group with that name already exists.", NotificationType.WARNING))
                            }
                            rebuildGroupTree(); refreshList()
                        }
                    }
                })
                add(JButton(AllIcons.General.Remove).apply {
                    toolTipText = "Delete Group"
                    addActionListener {
                        val sel = groupTree.lastSelectedPathComponent as? javax.swing.tree.DefaultMutableTreeNode
                        val g = sel?.userObject as? Group ?: return@addActionListener
                        if (g.tags.contains("ns:shared")) {
                            Notifications.Bus.notify(Notification("PromptLibrary", "Not allowed", "Shared groups cannot be deleted", NotificationType.WARNING))
                        } else {
                            val res = JOptionPane.showConfirmDialog(this@PromptLibraryPanel, "Delete group '${g.name}'? Prompts will be moved to Private/Unfiled.", "Confirm Delete", JOptionPane.YES_NO_OPTION)
                            if (res == JOptionPane.YES_OPTION) {
                                repository.deleteGroupPreservePrompts(g.id)
                                rebuildGroupTree(); refreshList()
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
                add(JScrollPane(groupTree), BorderLayout.CENTER)
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

            // Tree selection changes which set of prompts are shown
            groupTree.addTreeSelectionListener {
                val node = groupTree.lastSelectedPathComponent as? javax.swing.tree.DefaultMutableTreeNode
                val uo = node?.userObject
                selectedGroupId = when (uo) {
                    is PrivateRoot -> null // selecting Private root => not a specific group
                    is SharedRoot -> null


                    is Group -> uo.id
                    else -> null
                }
                // Reflect selection in the composer controls
                updateComposerState()
                refreshList()
            }

            // Restore and persist divider location
            val lastDiv = props.getInt("promptlib.split.divider", -1)
            if (lastDiv > 0) split.dividerLocation = lastDiv
            split.addPropertyChangeListener(JSplitPane.DIVIDER_LOCATION_PROPERTY) {
                // Update composer state after changing selection
                updateComposerState()

                props.setValue("promptlib.split.divider", split.dividerLocation, -1)
            }

            rebuildGroupTree()

        add(toolbar, BorderLayout.NORTH)

        // List area (right side is already the listPanel scroll in the split)
        listPanel.layout = BoxLayout(listPanel, BoxLayout.Y_AXIS)
        listPanel.alignmentX = Component.LEFT_ALIGNMENT.toFloat()

        // New prompt composer
        val composer = JPanel(BorderLayout(8, 8)).apply {


            border = JBUI.Borders.emptyTop(8)
            add(JLabel("New Prompt:"), BorderLayout.NORTH)
            // Small hint under the editor (disabled on root selection)
            add(composerHint.apply { border = JBUI.Borders.empty(0, 8, 8, 8) }, BorderLayout.SOUTH)

            add(JScrollPane(newPromptArea), BorderLayout.CENTER)
            saveButton = JButton("Save").apply {
                addActionListener {
                    val text = newPromptArea.text.trim()
                    if (text.isNotEmpty()) {
                        val currentSelection = selectedGroupId
                        val addedPrompt = repository.addPrompt(text)
                        if (addedPrompt != null) {
                            val targetGid = currentSelection ?: repository.ensureUnfiledGroup().id
                            repository.movePromptToGroup(addedPrompt.id, targetGid)
                            newPromptArea.text = ""
                            loadPrompts();
                            // Restore focus to the group we just saved into
                            selectedGroupId = targetGid
                            rebuildGroupTree();
                            refreshList()
                        } else {
                            Notifications.Bus.notify(
                                Notification("PromptLibrary", "Duplicate prompt not added",
                                    "A similar prompt already exists", NotificationType.WARNING)
                            )
                        }
                    }
                }
            }
            add(saveButton, BorderLayout.EAST)
        }
        add(composer, BorderLayout.SOUTH)

        loadPrompts()
        // One-time migration: move any private-root prompts into Unfiled group so nothing sits on namespace roots
        val moved = repository.migratePrivateRootPromptsToUnfiled()
        if (moved > 0) {
            Notifications.Bus.notify(Notification("PromptLibrary", "Migrated prompts", "Moved ${moved} prompt(s) to Private/Unfiled", NotificationType.INFORMATION))
            rebuildGroupTree()
        }
        // Initialize composer state on load
        composerHint.text = "Select a group to enable Save"
        saveButton.isEnabled = false

        refreshList()
            // Rebuild tree in case groups changed from settings actions
            rebuildGroupTree()

    }

    private fun updateComposerState() {
        val isRootSelected = selectedGroupId == null
        // Save button
        if (this::saveButton.isInitialized) saveButton.isEnabled = !isRootSelected
        // Hint
        composerHint.text = if (isRootSelected) "Select a group to enable Save" else ""
        composerHint.foreground = JBColor.GRAY
        // Grey-out the editor area when on roots; enable when a group is selected
        newPromptArea.isEditable = !isRootSelected
        newPromptArea.background = if (isRootSelected) UIManager.getColor("Panel.background") else UIManager.getColor("TextArea.background")
        newPromptArea.foreground = if (isRootSelected) JBColor.GRAY else UIManager.getColor("TextArea.foreground")
    }

    private fun loadPrompts() {
        prompts = repository.loadPrompts()
        // Default selection: Private (null)
        groupTree.clearSelection()

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
        val expandButton = iconButton(
            if (isExpanded) AllIcons.General.ArrowDown else AllIcons.General.ArrowRight,
            if (isExpanded) "Collapse" else "Expand"
        ) {
            expandedPromptId = if (isExpanded) null else prompt.id
            refreshList()
        }
        val card = JPanel(BorderLayout()).apply {
            border = JBUI.Borders.customLine(JBColor.border(), 1)
            maximumSize = Dimension(Int.MAX_VALUE, if (isExpanded) maxCardHeight + 80 else collapsedRowHeight)
            preferredSize = Dimension(Int.MAX_VALUE, if (isExpanded) maxCardHeight + 80 else collapsedRowHeight)
        }

        // Title label (first 50 chars of text when title is blank)
        val titleLabel = JLabel(prompt.displayTitle()).apply {
            border = if (isExpanded) JBUI.Borders.empty(8, 8, 0, 8) else JBUI.Borders.empty(2, 8, 2, 8)
            font = font.deriveFont(font.style or java.awt.Font.BOLD)
            maximumSize = Dimension(Int.MAX_VALUE, collapsedRowHeight)
            addMouseListener(MouseClickAdapter { copyToClipboard(prompt.text) })
            toolTipText = "Click to copy"
        }
        // Header with expand button (left) and actions (right)
        val header = JPanel(BorderLayout()).apply {
            add(expandButton, BorderLayout.WEST)
            add(titleLabel, BorderLayout.CENTER)
            val headerActions = JPanel(FlowLayout(FlowLayout.RIGHT, 0, 0)).apply {
                val copyBtn = iconButton(AllIcons.Actions.Copy, "Copy") { copyToClipboard(prompt.text) }
                val editBtn = iconButton(AllIcons.Actions.Edit, "Edit") { openEditorDialog(prompt) }
                val delBtn = iconButton(AllIcons.General.Remove, "Delete") {
                    val res = JOptionPane.showConfirmDialog(this@PromptLibraryPanel, "Delete this prompt?", "Confirm Delete", JOptionPane.YES_NO_OPTION)
                    if (res == JOptionPane.YES_OPTION) {
                        val deletedPrompt = repository.deletePrompt(prompt.id)
                        if (deletedPrompt != null) {
                            lastDeletedPrompt = deletedPrompt
                            loadPrompts(); refreshList(); showUndoNotification(deletedPrompt)
                        }
                    }
                }
                add(copyBtn); add(editBtn); add(delBtn)
            }
            add(headerActions, BorderLayout.EAST)
        }
        card.add(header, BorderLayout.NORTH)
        // Attach popup to title as well
        attachPopup(titleLabel, createCardPopupMenu(prompt))

        // Text area that copies on click
        val textArea = JTextArea(prompt.text).apply {
            lineWrap = true
            wrapStyleWord = true
            isEditable = false
            border = JBUI.Borders.empty(8)
            background = UIManager.getColor("Panel.background")
            addMouseListener(MouseClickAdapter { copyToClipboard(prompt.text) })
            // Attach right-click menu to both text area and title
            val popup = createCardPopupMenu(prompt)
            attachPopup(this, popup)
        }
        if (isExpanded) {
            val centerScroll = JScrollPane(textArea).apply {
                preferredSize = Dimension(10, maxCardHeight)
                maximumSize = Dimension(Int.MAX_VALUE, maxCardHeight)
                verticalScrollBarPolicy = ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED
                horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
                border = JBUI.Borders.empty()
            }
            // Force wrapping and disable horizontal scroll inside the text
            textArea.lineWrap = true
            textArea.wrapStyleWord = true
            centerScroll.horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
            card.add(centerScroll, BorderLayout.CENTER)
        }



        return card
    }

    private fun copyToClipboard(text: String) {
        CopyPasteManagerEx.getInstance().setContents(StringSelection(text))
        Notifications.Bus.notify(Notification("PromptLibrary", "Prompt copied", "", NotificationType.INFORMATION))
    }

    private fun buildMoveMenu(forPrompt: Prompt): JMenu {
        val menu = JMenu("Move To…")
        // Remove ability to move to namespace roots; only groups are valid destinations
        fun addGroupItems(groups: List<Group>, prefix: String = "") {
            groups.forEach { g ->
                val label = if (prefix.isEmpty()) g.name else "$prefix/${'$'}{g.name}"
                menu.add(JMenuItem(label).apply {
                    addActionListener {
                        repository.movePromptToGroup(forPrompt.id, g.id)
                        loadPrompts(); refreshList()
                    }
                })
                if (g.children.isNotEmpty()) addGroupItems(g.children, label)
            }
        }
        addGroupItems(repository.getAllGroups())
        return menu
    }

    private fun createCardPopupMenu(prompt: Prompt): JPopupMenu {
        return JPopupMenu().apply {
            add(JMenuItem("Copy").apply { addActionListener { copyToClipboard(prompt.text) } })
            add(JMenuItem("Open in Editor").apply { addActionListener { openEditorDialog(prompt) } })
            addSeparator()
            add(buildMoveMenu(prompt))
            add(JMenuItem("Delete").apply {
                addActionListener {
                    val res = JOptionPane.showConfirmDialog(this@PromptLibraryPanel, "Delete this prompt?", "Confirm Delete", JOptionPane.YES_NO_OPTION)
                    if (res == JOptionPane.YES_OPTION) {
                        val deletedPrompt = repository.deletePrompt(prompt.id)
                        if (deletedPrompt != null) {
                            lastDeletedPrompt = deletedPrompt
                            loadPrompts()


                            refreshList()
                            showUndoNotification(deletedPrompt)
                        }
                    }
                }
            })
        }
    }

    private fun attachPopup(component: JComponent, popup: JPopupMenu) {
        component.addMouseListener(object : java.awt.event.MouseAdapter() {
            override fun mousePressed(e: java.awt.event.MouseEvent) { if (e.isPopupTrigger) popup.show(e.component, e.x, e.y) }
            override fun mouseReleased(e: java.awt.event.MouseEvent) { if (e.isPopupTrigger) popup.show(e.component, e.x, e.y) }
        })
    }

    private fun openEditorDialog(prompt: Prompt) {
        val dialog = JDialog().apply {
            title = "Edit Prompt"
            isModal = true
        }
        dialog.layout = BorderLayout()

        val editorArea = JTextArea(prompt.text, 20, 60).apply {
            lineWrap = true
            wrapStyleWord = true
        }
        dialog.add(JScrollPane(editorArea), BorderLayout.CENTER)

        val buttonPanel = JPanel(FlowLayout(FlowLayout.RIGHT)).apply {
            add(JButton("Cancel").apply { addActionListener { dialog.dispose() } })
            add(JButton("Save").apply {
                addActionListener {
                    val newText = editorArea.text.trim()
                    if (newText.isNotEmpty()) {
                        val updated = repository.updatePrompt(prompt.id, newText)
                        if (updated == null) {
                            Notifications.Bus.notify(
                                Notification("PromptLibrary", "Update failed", "A similar prompt already exists", NotificationType.WARNING)
                            )
                        } else {
                            loadPrompts(); refreshList()
                            dialog.dispose()
                        }
                    } else {
                        dialog.dispose()
                    }
                }
            })
        }
        dialog.add(buttonPanel, BorderLayout.SOUTH)

        // Autosave on close if content changed and not blank
        dialog.addWindowListener(object : java.awt.event.WindowAdapter() {
            override fun windowClosing(e: java.awt.event.WindowEvent) {
                val newText = editorArea.text.trim()
                if (newText.isNotEmpty() && newText != prompt.text) {
                    repository.updatePrompt(prompt.id, newText)
                    loadPrompts(); refreshList()
                }
            }
        })

        dialog.pack()
        dialog.setLocationRelativeTo(this)
        dialog.isVisible = true
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
        val node = groupTree.lastSelectedPathComponent as? javax.swing.tree.DefaultMutableTreeNode
        val uo = node?.userObject

        val exportPrompts: List<Prompt> = when (uo) {
            is Group -> repository.getGroupPrompts(uo.id)
            is SharedRoot, is PrivateRoot -> repository.getAllPromptsLibrary()
            else -> repository.getAllPromptsLibrary()
        }

        if (exportPrompts.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Nothing to export for current selection.", "Export", JOptionPane.INFORMATION_MESSAGE)
            return
        }

        // Build simple JSON array of strings (v1 format)
        val promptTexts = exportPrompts.map { it.text }
        val jsonData = promptTexts.joinToString(
            prefix = "[\n  ",
            separator = ",\n  ",
            postfix = "\n]"
        ) { text ->
            "\"${text.replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")}\""
        }

        val dialog = JDialog().apply {
            title = if (uo is Group) "Export Group: ${uo.name}" else "Export Library (v1 JSON)"
            isModal = true
        }
        dialog.layout = BorderLayout()

        val textArea = JTextArea(jsonData, 20, 60).apply {
            isEditable = false
            lineWrap = true
            wrapStyleWord = true
        }

        val scrollPane = JScrollPane(textArea).apply {
            horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
        }
        dialog.add(scrollPane, BorderLayout.CENTER)

        val labelCount = exportPrompts.size
        val buttonPanel = JPanel(FlowLayout()).apply {
            add(JButton("Copy to Clipboard").apply {
                addActionListener {
                    CopyPasteManagerEx.getInstance().setContents(StringSelection(jsonData))
                    Notifications.Bus.notify(
                        Notification("PromptLibrary", "Exported to clipboard",
                            "$labelCount prompts copied", NotificationType.INFORMATION)
                    )
                    dialog.dispose()
                }
            })
            add(JButton("Save to File").apply {
                addActionListener {
                    val defaultName = if (uo is Group) uo.name.replace(" ", "_").lowercase() + "-prompts.json" else "library-prompts.json"
                    val fileChooser = JFileChooser().apply {
                        fileFilter = FileNameExtensionFilter("JSON files", "json")
                        selectedFile = File(defaultName)
                    }

                    if (fileChooser.showSaveDialog(dialog) == JFileChooser.APPROVE_OPTION) {
                        try {
                            fileChooser.selectedFile.writeText(jsonData)
                            Notifications.Bus.notify(
                                Notification("PromptLibrary", "Exported to file",
                                    "Saved $labelCount prompts to ${fileChooser.selectedFile.name}",
                                    NotificationType.INFORMATION)
                            )
                            dialog.dispose()
                        } catch (e: Exception) {
                            JOptionPane.showMessageDialog(dialog, "Error saving file: ${e.message}",
                                "Export Error", JOptionPane.ERROR_MESSAGE)
                        }
                    }
                }
            })
            add(JButton("Close").apply {
                addActionListener { dialog.dispose() }
            })
        }
        dialog.add(buttonPanel, BorderLayout.SOUTH)

        dialog.pack()
        dialog.setLocationRelativeTo(this)
        dialog.isVisible = true
    }

    private fun showImportDialog() {
        val dialog = JDialog().apply {
            title = "Import Prompts"
            isModal = true
        }
        dialog.layout = BorderLayout()
        val header = JLabel("Import supports v1 arrays (strings or objects with 'text') and v2 Library JSON. v2 imports will be flattened into private prompts.")
        header.border = JBUI.Borders.empty(8)
        dialog.add(header, BorderLayout.NORTH)


        val textArea = JTextArea(15, 60).apply {
            lineWrap = true
            wrapStyleWord = true
            toolTipText = "Paste JSON data here or use 'Load from File' button"
        }

        val scrollPane = JScrollPane(textArea).apply {
            horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
        }
        dialog.add(scrollPane, BorderLayout.CENTER)

        val buttonPanel = JPanel(FlowLayout()).apply {
            add(JButton("Load from File").apply {
                addActionListener {
                    val fileChooser = JFileChooser().apply {
                        fileFilter = FileNameExtensionFilter("JSON files", "json")
                    }

                    if (fileChooser.showOpenDialog(dialog) == JFileChooser.APPROVE_OPTION) {
                        try {
                            val jsonData = fileChooser.selectedFile.readText()
                            textArea.text = jsonData
                        } catch (e: Exception) {
                            JOptionPane.showMessageDialog(dialog, "Error reading file: ${e.message}",
                                "Import Error", JOptionPane.ERROR_MESSAGE)
                        }
                    }
                }
            })
            add(JButton("Paste from Clipboard").apply {
                addActionListener {
                    try {
                        val clipboardData = CopyPasteManagerEx.getInstance().contents?.getTransferData(
                            java.awt.datatransfer.DataFlavor.stringFlavor) as? String
                        if (clipboardData != null) {
                            textArea.text = clipboardData
                        } else {
                            JOptionPane.showMessageDialog(dialog, "No text data in clipboard",
                                "Import Error", JOptionPane.WARNING_MESSAGE)
                        }
                    } catch (e: Exception) {
                        JOptionPane.showMessageDialog(dialog, "Error reading clipboard: ${e.message}",
                            "Import Error", JOptionPane.ERROR_MESSAGE)
                    }
                }
            })
            add(JButton("Import").apply {
                addActionListener {
                    val jsonData = textArea.text.trim()
                    if (jsonData.isEmpty()) {
                        JOptionPane.showMessageDialog(dialog, "Please enter JSON data to import",
                            "Import Error", JOptionPane.WARNING_MESSAGE)
                        return@addActionListener
                    }

                    try {
                        val json = Json { ignoreUnknownKeys = true }
                        val importedPrompts = parseImportData(jsonData, json)
                        val importedCount = repository.importPrompts(importedPrompts)

                        loadPrompts()
                        refreshList()

                        Notifications.Bus.notify(
                            Notification("PromptLibrary", "Import completed",
                                "Imported $importedCount new prompts (${importedPrompts.size - importedCount} duplicates skipped)",
                                NotificationType.INFORMATION)
                        )
                        dialog.dispose()
                    } catch (e: Exception) {
                        JOptionPane.showMessageDialog(dialog, "Error parsing JSON: ${e.message}",
                            "Import Error", JOptionPane.ERROR_MESSAGE)
                    }
                }
            })
            add(JButton("Close").apply {
                addActionListener { dialog.dispose() }
            })
        }
        dialog.add(buttonPanel, BorderLayout.SOUTH)

        dialog.pack()
        dialog.setLocationRelativeTo(this)
        dialog.isVisible = true
    }

    private fun parseImportData(jsonData: String, json: Json): List<Prompt> {
        val jsonElement = json.parseToJsonElement(jsonData)

        return when {
            // Handle array of strings: ["prompt1", "prompt2", ...]
            jsonElement is JsonArray && jsonElement.all { it is JsonPrimitive && it.isString } -> {
                jsonElement.map { element ->
                    val text = element.jsonPrimitive.content
                    Prompt(text = text)
                }
            }

            // Handle array of objects with flexible structure
            jsonElement is JsonArray -> {
                jsonElement.map { element ->
                    when (element) {
                        is JsonObject -> {
                            val text = element["text"]?.jsonPrimitive?.content
                                ?: throw IllegalArgumentException("Missing 'text' field in prompt object")

                            // Use existing id/timestamps if present, otherwise generate new ones
                            val id = element["id"]?.jsonPrimitive?.content ?: java.util.UUID.randomUUID().toString()
                            val createdAt = element["createdAt"]?.jsonPrimitive?.content ?: java.time.Instant.now().toString()
                            val updatedAt = element["updatedAt"]?.jsonPrimitive?.content ?: java.time.Instant.now().toString()

                            Prompt(id = id, text = text, createdAt = createdAt, updatedAt = updatedAt)
                        }
                        is JsonPrimitive -> {
                            if (element.isString) {
                                Prompt(text = element.content)
                            } else {
                                throw IllegalArgumentException("Array elements must be strings or objects with 'text' field")
                            }
                        }
                        else -> throw IllegalArgumentException("Invalid JSON structure")
                    }
                }
            }

            // Handle single object
            jsonElement is JsonObject -> {
                val text = jsonElement["text"]?.jsonPrimitive?.content
                    ?: throw IllegalArgumentException("Missing 'text' field in prompt object")

                val id = jsonElement["id"]?.jsonPrimitive?.content ?: java.util.UUID.randomUUID().toString()
                val createdAt = jsonElement["createdAt"]?.jsonPrimitive?.content ?: java.time.Instant.now().toString()
                val updatedAt = jsonElement["updatedAt"]?.jsonPrimitive?.content ?: java.time.Instant.now().toString()

                listOf(Prompt(id = id, text = text, createdAt = createdAt, updatedAt = updatedAt))
            }

            else -> throw IllegalArgumentException("JSON must be an array or object")
        }
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
            rebuildGroupTree(); refreshList()
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

private class MouseClickAdapter(val onClick: () -> Unit) : java.awt.event.MouseAdapter() {
    override fun mouseClicked(e: java.awt.event.MouseEvent?) = onClick()
}

