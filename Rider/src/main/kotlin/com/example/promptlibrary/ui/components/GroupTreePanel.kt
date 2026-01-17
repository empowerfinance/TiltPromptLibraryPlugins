package com.example.promptlibrary.ui.components

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.repository.PromptRepository
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
object SharedRoot { override fun toString() = "Shared" }
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
    private val onAddGroupToPrivate: () -> Unit = {}
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
     * Sets up mouse listener to detect clicks on "+ Add Group" text.
     */
    private fun setupMouseListener() {
        groupTree.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                val path = groupTree.getPathForLocation(e.x, e.y) ?: return
                val node = path.lastPathComponent as? DefaultMutableTreeNode ?: return
                val userObject = node.userObject

                // Only handle Shared/Private root nodes
                if (userObject !is SharedRoot && userObject !is PrivateRoot) return

                val rowBounds = groupTree.getPathBounds(path) ?: return

                // Check if click is on the right side (where "+ Add Group" text is)
                // The text starts approximately at rowBounds.x + rowBounds.width - 80
                val clickableAreaStart = rowBounds.x + rowBounds.width - 80

                if (e.x >= clickableAreaStart) {
                    println("[GroupTreePanel] Clicked '+ Add Group' for $userObject")
                    when (userObject) {
                        is SharedRoot -> onAddGroupToShared()
                        is PrivateRoot -> onAddGroupToPrivate()
                    }
                }
            }
        })
    }

    /**
     * Sets up hover effect to show hand cursor over "+ Add Group" text.
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

                if (userObject !is SharedRoot && userObject !is PrivateRoot) {
                    groupTree.cursor = java.awt.Cursor.getDefaultCursor()
                    return
                }

                val rowBounds = groupTree.getPathBounds(path)
                if (rowBounds == null) {
                    groupTree.cursor = java.awt.Cursor.getDefaultCursor()
                    return
                }

                // Show hand cursor when over "+ Add Group" text area
                val clickableAreaStart = rowBounds.x + rowBounds.width - 80

                if (e.x >= clickableAreaStart) {
                    groupTree.cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)
                } else {
                    groupTree.cursor = java.awt.Cursor.getDefaultCursor()
                }
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

                // Only add "+ Add Group" text for Shared and Private root nodes
                if (userObject is SharedRoot || userObject is PrivateRoot) {
                    val panel = JPanel(BorderLayout()).apply {
                        isOpaque = false
                        background = if (sel) backgroundSelectionColor else backgroundNonSelectionColor

                        // Left side: default label with icon
                        val leftPanel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
                            isOpaque = false
                            add(JBLabel(userObject.toString()).apply {
                                icon = if (expanded) openIcon else closedIcon
                                foreground = if (sel) textSelectionColor else textNonSelectionColor
                            })
                        }

                        // Right side: "+ Add Group" text
                        val rightPanel = JPanel(FlowLayout(FlowLayout.RIGHT, 2, 0)).apply {
                            isOpaque = false
                            add(JBLabel("+ Add Group").apply {
                                font = font.deriveFont(9.5f)
                                foreground = JBColor(
                                    java.awt.Color(100, 100, 100),
                                    java.awt.Color(150, 150, 150)
                                )
                            })
                        }

                        add(leftPanel, BorderLayout.WEST)
                        add(rightPanel, BorderLayout.EAST)
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
                is SharedRoot, is PrivateRoot -> {
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
    
    /**
     * Rebuilds the tree from the repository data.
     */
    fun rebuildTree() {
        val prevSelected = selectedGroupId
        val root = DefaultMutableTreeNode("Root")
        
        // Two namespaces: Shared and Private
        val sharedNode = DefaultMutableTreeNode(SharedRoot)
        val privateNode = DefaultMutableTreeNode(PrivateRoot)
        root.add(sharedNode)
        root.add(privateNode)
        
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
            val treeRoot = groupTreeModel.root as DefaultMutableTreeNode
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
            find(treeRoot)?.let { groupTree.selectionPath = it }
        }
        
        // Expand all rows
        for (i in 0 until groupTree.rowCount) {
            groupTree.expandRow(i)
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

