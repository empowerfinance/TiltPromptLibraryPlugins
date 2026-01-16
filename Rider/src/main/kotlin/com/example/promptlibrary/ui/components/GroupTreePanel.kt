package com.example.promptlibrary.ui.components

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.repository.PromptRepository
import java.awt.BorderLayout
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.TreePath

// Root objects for the tree
object SharedRoot { override fun toString() = "Shared" }
object PrivateRoot { override fun toString() = "Private" }

/**
 * Panel containing the group tree view.
 *
 * Displays a hierarchical tree of Shared and Private groups.
 */
class GroupTreePanel(
    private val repository: PromptRepository,
    private val onGroupSelected: (String?) -> Unit
) : JPanel(BorderLayout()) {

    private val groupTreeModel = DefaultTreeModel(DefaultMutableTreeNode("Library"))
    private val groupTree = JTree(groupTreeModel)
    private var selectedGroupId: String? = null
    
    init {
        setupTree()
        add(JScrollPane(groupTree), BorderLayout.CENTER)
    }
    
    private fun setupTree() {
        groupTree.addTreeSelectionListener {
            val node = groupTree.lastSelectedPathComponent as? DefaultMutableTreeNode
            val userObject = node?.userObject
            
            selectedGroupId = when (userObject) {
                is Group -> userObject.id
                is SharedRoot, is PrivateRoot -> null
                else -> null
            }
            
            onGroupSelected(selectedGroupId)
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
                val node = DefaultMutableTreeNode(g)
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
            val treeRoot = groupTreeModel.root as DefaultMutableTreeNode
            fun find(node: DefaultMutableTreeNode): TreePath? {
                val uo = node.userObject
                if (uo is Group && uo.id == prevSelected) return TreePath(node.path)
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

