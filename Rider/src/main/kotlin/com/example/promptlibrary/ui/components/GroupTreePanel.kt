package com.example.promptlibrary.ui.components

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.repository.PromptRepository
import com.example.promptlibrary.settings.PluginSettingsService
import com.example.promptlibrary.settings.titleCase
import com.intellij.icons.AllIcons
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.FlowLayout
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.*
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeCellRenderer
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.TreePath

// Root objects for the tree
data class LibraryRoot(val libraryId: String, val displayName: String, val isActive: Boolean) {
    override fun toString(): String {
        val activeIndicator = if (isActive) " ✏️" else ""
        return "📚 $displayName$activeIndicator"
    }
}
object PrivateRoot { override fun toString() = "Private" }

// Wrapper for Group to display name in tree
data class GroupNode(val group: Group) {
    override fun toString() = group.name
}

// Wrapper for Prompt to display in tree
data class PromptNode(val prompt: Prompt, val groupId: String) {
    override fun toString() = prompt.displayTitle(50)
}

/**
 * Panel containing the group tree view.
 *
 * Displays a hierarchical tree of Shared and Private groups with prompts.
 */
class GroupTreePanel(
    private val repository: PromptRepository,
    private val onGroupSelected: (String?) -> Unit,
    private val onPromptSelected: (Prompt, String) -> Unit,
    private val onAddGroupToShared: () -> Unit = {},
    private val onAddGroupToPrivate: () -> Unit = {},
    private val onEditGroup: (Group) -> Unit = {}
) : JPanel(BorderLayout()) {

    private val groupTreeModel = DefaultTreeModel(DefaultMutableTreeNode("Library"))
    private val groupTree = JTree(groupTreeModel)
    private var selectedGroupId: String? = null
    
    init {
        setupTree()
        setupCustomRenderer()
        setupMouseListener()
        setupHoverEffect()
        add(JScrollPane(groupTree), BorderLayout.CENTER)
    }

    /**
     * Sets up mouse listener to detect clicks on "+ Add Group" text and edit icons.
     */
    private fun setupMouseListener() {
        groupTree.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                val path = groupTree.getPathForLocation(e.x, e.y) ?: return
                val node = path.lastPathComponent as? DefaultMutableTreeNode ?: return
                val userObject = node.userObject
                val rowBounds = groupTree.getPathBounds(path) ?: return

                // Handle LibraryRoot/Private root nodes - "+ Add Group" text
                if (userObject is LibraryRoot || userObject is PrivateRoot) {
                    // Only show "+ Add Group" for active library or private
                    val showAddGroup = userObject is PrivateRoot || (userObject is LibraryRoot && userObject.isActive)
                    if (!showAddGroup) return

                    // Calculate label width based on actual text
                    val metrics = groupTree.getFontMetrics(groupTree.font)
                    val textWidth = metrics.stringWidth(userObject.toString())
                    val iconWidth = 20 // Icon width
                    val spacing = 8 // Spacing between icon and text
                    val labelWidth = iconWidth + spacing + textWidth
                    val addGroupTextWidth = 75 // Width of "+ Add Group" text
                    val clickableAreaStart = rowBounds.x + labelWidth
                    val clickableAreaEnd = rowBounds.x + labelWidth + addGroupTextWidth

                    if (e.x >= clickableAreaStart && e.x <= clickableAreaEnd) {
                        when (userObject) {
                            is LibraryRoot -> onAddGroupToShared()
                            is PrivateRoot -> onAddGroupToPrivate()
                        }
                    }
                    return
                }

                // Handle GroupNode - edit icon
                if (userObject is GroupNode) {
                    val isUnfiled = userObject.group.name.trim().equals("Unfiled", ignoreCase = true)
                    if (isUnfiled) return // No edit icon for Unfiled

                    // Calculate the actual width of the group name label
                    val metrics = groupTree.getFontMetrics(groupTree.font)
                    val textWidth = metrics.stringWidth(userObject.group.name)
                    val iconWidth = 20 // Folder icon width
                    val spacing = 8 // Spacing between icon and text
                    val labelWidth = iconWidth + spacing + textWidth
                    val editIconWidth = 20 // Width of edit icon
                    val clickableAreaStart = rowBounds.x + labelWidth
                    val clickableAreaEnd = rowBounds.x + labelWidth + editIconWidth

                    println("[GroupTreePanel] GroupNode click: x=${e.x}, rowBounds.x=${rowBounds.x}, labelWidth=$labelWidth, range=$clickableAreaStart-$clickableAreaEnd, group=${userObject.group.name}")

                    if (e.x >= clickableAreaStart && e.x <= clickableAreaEnd) {
                        println("[GroupTreePanel] Edit icon clicked for group: ${userObject.group.name}")
                        onEditGroup(userObject.group)
                    }
                }
            }
        })
    }

    /**
     * Sets up hover effect to show hand cursor over "+ Add Group" text and edit icons.
     */
    private fun setupHoverEffect() {
        groupTree.addMouseMotionListener(object : MouseAdapter() {
            override fun mouseMoved(e: MouseEvent) {
                val path = groupTree.getPathForLocation(e.x, e.y)
                if (path == null) {
                    groupTree.cursor = java.awt.Cursor.getDefaultCursor()
                    return
                }

                val node = path.lastPathComponent as? DefaultMutableTreeNode
                val userObject = node?.userObject
                val rowBounds = groupTree.getPathBounds(path)
                if (rowBounds == null) {
                    groupTree.cursor = java.awt.Cursor.getDefaultCursor()
                    return
                }

                // Handle LibraryRoot/Private root nodes - "+ Add Group" text
                if (userObject is LibraryRoot || userObject is PrivateRoot) {
                    // Only show hand cursor for active library or private
                    val showAddGroup = userObject is PrivateRoot || (userObject is LibraryRoot && userObject.isActive)
                    if (!showAddGroup) {
                        groupTree.cursor = java.awt.Cursor.getDefaultCursor()
                        return
                    }

                    // Calculate label width based on actual text
                    val metrics = groupTree.getFontMetrics(groupTree.font)
                    val textWidth = metrics.stringWidth(userObject.toString())
                    val iconWidth = 20 // Icon width
                    val spacing = 8 // Spacing between icon and text
                    val labelWidth = iconWidth + spacing + textWidth
                    val addGroupTextWidth = 75
                    val clickableAreaStart = rowBounds.x + labelWidth
                    val clickableAreaEnd = rowBounds.x + labelWidth + addGroupTextWidth

                    if (e.x >= clickableAreaStart && e.x <= clickableAreaEnd) {
                        groupTree.cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)
                    } else {
                        groupTree.cursor = java.awt.Cursor.getDefaultCursor()
                    }
                    return
                }

                // Handle GroupNode - edit icon
                if (userObject is GroupNode) {
                    val isUnfiled = userObject.group.name.trim().equals("Unfiled", ignoreCase = true)
                    if (isUnfiled) {
                        groupTree.cursor = java.awt.Cursor.getDefaultCursor()
                        return
                    }

                    // Calculate the actual width of the group name label
                    val metrics = groupTree.getFontMetrics(groupTree.font)
                    val textWidth = metrics.stringWidth(userObject.group.name)
                    val iconWidth = 20 // Folder icon width
                    val spacing = 8 // Spacing between icon and text
                    val labelWidth = iconWidth + spacing + textWidth
                    val editIconWidth = 20
                    val clickableAreaStart = rowBounds.x + labelWidth
                    val clickableAreaEnd = rowBounds.x + labelWidth + editIconWidth

                    if (e.x >= clickableAreaStart && e.x <= clickableAreaEnd) {
                        groupTree.cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)
                    } else {
                        groupTree.cursor = java.awt.Cursor.getDefaultCursor()
                    }
                    return
                }

                groupTree.cursor = java.awt.Cursor.getDefaultCursor()
            }
        })
    }

    /**
     * Sets up a custom cell renderer that shows "+ Add Group" text on Shared and Private root nodes.
     */
    private fun setupCustomRenderer() {
        groupTree.cellRenderer = object : DefaultTreeCellRenderer() {
            override fun getTreeCellRendererComponent(
                tree: JTree?,
                value: Any?,
                sel: Boolean,
                expanded: Boolean,
                leaf: Boolean,
                row: Int,
                hasFocus: Boolean
            ): Component {
                super.getTreeCellRendererComponent(tree, value, sel, expanded, leaf, row, hasFocus)

                val node = value as? DefaultMutableTreeNode
                val userObject = node?.userObject

                // Add "+ Add Group" text for LibraryRoot and Private root nodes
                if (userObject is LibraryRoot || userObject is PrivateRoot) {
                    val panel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
                        isOpaque = false
                        background = if (sel) backgroundSelectionColor else backgroundNonSelectionColor

                        // Label with appropriate icon (GitHub for library, lock for private)
                        add(JBLabel(userObject.toString()).apply {
                            icon = when (userObject) {
                                is LibraryRoot -> AllIcons.Vcs.Vendors.Github
                                is PrivateRoot -> AllIcons.Nodes.Padlock
                                else -> if (expanded) openIcon else closedIcon
                            }
                            foreground = if (sel) textSelectionColor else textNonSelectionColor
                        })

                        // For LibraryRoot, show active indicator tooltip
                        if (userObject is LibraryRoot) {
                            toolTipText = if (userObject.isActive) {
                                "${userObject.displayName} - Active library (new prompts are written here)"
                            } else {
                                "${userObject.displayName} - Read-only"
                            }
                        }

                        // "+ Add Group" text right after the label (only for active library or private)
                        val showAddGroup = userObject is PrivateRoot || (userObject is LibraryRoot && userObject.isActive)
                        if (showAddGroup) {
                            add(JBLabel("+ Add Group").apply {
                                font = font.deriveFont(9.5f)
                                foreground = JBColor(
                                    java.awt.Color(100, 100, 100),
                                    java.awt.Color(150, 150, 150)
                                )
                            })
                        }
                    }
                    return panel
                }

                // Add edit icon for GroupNode items (except Unfiled)
                if (userObject is GroupNode) {
                    val isUnfiled = userObject.group.name.trim().equals("Unfiled", ignoreCase = true)

                    val panel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
                        isOpaque = false
                        background = if (sel) backgroundSelectionColor else backgroundNonSelectionColor

                        // Label with folder icon
                        add(JBLabel(userObject.toString()).apply {
                            icon = if (expanded) openIcon else closedIcon
                            foreground = if (sel) textSelectionColor else textNonSelectionColor
                        })

                        // Edit icon (pencil) - only for non-Unfiled groups
                        if (!isUnfiled) {
                            add(JBLabel().apply {
                                icon = AllIcons.Actions.Edit
                                toolTipText = "Edit group"
                            })
                        }
                    }
                    return panel
                }

                // Render PromptNode items with text icon
                if (userObject is PromptNode) {
                    val panel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
                        isOpaque = false
                        background = if (sel) backgroundSelectionColor else backgroundNonSelectionColor

                        // Prompt title with icon
                        add(JBLabel(userObject.toString()).apply {
                            icon = AllIcons.FileTypes.Text
                            foreground = if (sel) textSelectionColor else textNonSelectionColor
                        })
                    }
                    return panel
                }

                return this
            }
        }
    }



    private fun setupTree() {
        groupTree.addTreeSelectionListener {
            val node = groupTree.lastSelectedPathComponent as? DefaultMutableTreeNode
            val userObject = node?.userObject

            when (userObject) {
                is PromptNode -> {
                    // Prompt selected - notify callback
                    onPromptSelected(userObject.prompt, userObject.groupId)
                    selectedGroupId = userObject.groupId
                }
                is GroupNode -> {
                    // Group selected
                    selectedGroupId = userObject.group.id
                    onGroupSelected(selectedGroupId)
                }
                is LibraryRoot, is PrivateRoot -> {
                    selectedGroupId = null
                    onGroupSelected(null)
                }
                else -> {
                    selectedGroupId = null
                    onGroupSelected(null)
                }
            }
        }
        
        // Show the root to display Shared and Private
        groupTree.isRootVisible = false

        // Only prevent collapsing root-level nodes (LibraryRoot and PrivateRoot), allow collapsing child groups
        groupTree.addTreeWillExpandListener(object : javax.swing.event.TreeWillExpandListener {
            override fun treeWillExpand(event: javax.swing.event.TreeExpansionEvent?) {}
            override fun treeWillCollapse(event: javax.swing.event.TreeExpansionEvent?) {
                val path = event?.path ?: return
                val node = path.lastPathComponent as? DefaultMutableTreeNode ?: return
                val userObject = node.userObject

                // Only prevent collapse for root-level nodes (LibraryRoot and PrivateRoot)
                if (userObject is LibraryRoot || userObject is PrivateRoot) {
                    // Re-expand only this specific root node
                    javax.swing.SwingUtilities.invokeLater {
                        groupTree.expandPath(path)
                    }
                }
                // Allow collapsing for all other nodes (GroupNode, etc.)
            }
        })

        for (i in 0 until groupTree.rowCount) groupTree.expandRow(i)
    }
    
    /**
     * Rebuilds the tree from the repository data.
     */
    fun rebuildTree() {
        val prevSelected = selectedGroupId

        // Save expansion state before rebuilding
        val expandedGroupIds = mutableSetOf<String>()
        val treeRoot = groupTreeModel.root as? DefaultMutableTreeNode
        if (treeRoot != null) {
            fun collectExpanded(node: DefaultMutableTreeNode) {
                val uo = node.userObject
                if (uo is GroupNode) {
                    val path = TreePath(node.path)
                    if (groupTree.isExpanded(path)) {
                        expandedGroupIds.add(uo.group.id)
                    }
                }
                for (i in 0 until node.childCount) {
                    val child = node.getChildAt(i) as DefaultMutableTreeNode
                    collectExpanded(child)
                }
            }
            collectExpanded(treeRoot)
        }

        val root = DefaultMutableTreeNode("Root")

        fun addNodes(parent: DefaultMutableTreeNode, groups: List<Group>) {
            for (g in groups) {
                val groupNode = DefaultMutableTreeNode(GroupNode(g))
                parent.add(groupNode)

                // Add prompts under this group
                for (prompt in g.prompts) {
                    val promptNode = DefaultMutableTreeNode(PromptNode(prompt, g.id))
                    groupNode.add(promptNode)
                }

                // Add child groups recursively
                if (g.children.isNotEmpty()) addNodes(groupNode, g.children)
            }
        }

        // Get enabled libraries and shared groups (defensive for tests)
        val enabledLibraries = try { PluginSettingsService.getEnabledLibraries() } catch (_: Exception) { emptyList() }
        val activeLibrary = try { PluginSettingsService.getActiveLibrary() } catch (_: Exception) { null }
        val sharedGroups = repository.getSharedGroups()

        // Only show shared library nodes if at least one library is enabled
        if (enabledLibraries.isNotEmpty()) {
            // Multi-library mode: show separate root for each library
            if (enabledLibraries.size > 1 && activeLibrary != null) {
                for (lib in enabledLibraries) {
                    val isActive = lib.id == activeLibrary.id
                    val libraryRoot = LibraryRoot(lib.id, lib.displayName, isActive)
                    val libraryNode = DefaultMutableTreeNode(libraryRoot)
                    root.add(libraryNode)

                    // Filter groups that belong to this library
                    val libraryGroups = sharedGroups.filter { it.libraryId == lib.id }
                    addNodes(libraryNode, libraryGroups)
                }
            } else {
                // Single-library mode: use the traditional "Shared" style display
                val singleLib = enabledLibraries.firstOrNull() ?: activeLibrary
                val displayName = singleLib?.displayName ?: "Shared"
                val libraryId = singleLib?.id ?: "shared"
                val libraryRoot = LibraryRoot(libraryId, displayName, true)
                val sharedNode = DefaultMutableTreeNode(libraryRoot)
                root.add(sharedNode)
                addNodes(sharedNode, sharedGroups)
            }
        }
        // When enabledLibraries is empty, no shared library nodes are added

        // Private namespace
        val privateNode = DefaultMutableTreeNode(PrivateRoot)
        root.add(privateNode)

        // Private: pin Unfiled at top
        val privGroups = repository.getPrivateGroups()
        val unfiled = privGroups.firstOrNull { it.name.trim().equals("Unfiled", ignoreCase = true) }
        if (unfiled != null) addNodes(privateNode, listOf(unfiled))
        addNodes(privateNode, privGroups.filter { it.id != unfiled?.id })

        groupTreeModel.setRoot(root)
        groupTreeModel.reload()

        val newTreeRoot = groupTreeModel.root as DefaultMutableTreeNode

        // Always expand Shared and Private root nodes
        groupTree.expandRow(0) // Expand the invisible root
        for (i in 0 until groupTreeModel.getChildCount(newTreeRoot)) {
            val child = groupTreeModel.getChild(newTreeRoot, i) as DefaultMutableTreeNode
            val childPath = TreePath(child.path)
            groupTree.expandPath(childPath)
        }

        // Restore expansion state for group nodes
        fun restoreExpansion(node: DefaultMutableTreeNode) {
            val uo = node.userObject
            if (uo is GroupNode && expandedGroupIds.contains(uo.group.id)) {
                val path = TreePath(node.path)
                groupTree.expandPath(path)
            }
            for (i in 0 until node.childCount) {
                val child = node.getChildAt(i) as DefaultMutableTreeNode
                restoreExpansion(child)
            }
        }
        restoreExpansion(newTreeRoot)

        // Try to restore previous selection (by group id)
        if (prevSelected != null) {
            fun find(node: DefaultMutableTreeNode): TreePath? {
                val uo = node.userObject
                if (uo is GroupNode && uo.group.id == prevSelected) return TreePath(node.path)
                for (i in 0 until node.childCount) {
                    val child = node.getChildAt(i) as DefaultMutableTreeNode
                    val found = find(child)
                    if (found != null) return found
                }
                return null
            }
            find(newTreeRoot)?.let { groupTree.selectionPath = it }
        }
    }
    
    /**
     * Clears the tree selection.
     */
    fun clearSelection() {
        groupTree.clearSelection()
        selectedGroupId = null
    }
    
    /**
     * Gets the currently selected group ID.
     */
    fun getSelectedGroupId(): String? = selectedGroupId
    
    /**
     * Gets the last selected tree node.
     */
    fun getLastSelectedNode(): DefaultMutableTreeNode? {
        return groupTree.lastSelectedPathComponent as? DefaultMutableTreeNode
    }
}

