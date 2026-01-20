package com.example.promptlibrary.ui.components

import com.example.promptlibrary.repository.PromptRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.awt.event.MouseEvent
import java.io.File
import javax.swing.JScrollPane
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.TreePath

/**
 * Integration tests for inline "+" button functionality in GroupTreePanel.
 */
class GroupTreePanelInlineButtonTest {
    
    @TempDir
    lateinit var tempDir: File
    
    private lateinit var repository: PromptRepository
    
    @BeforeEach
    fun setup() {
        System.setProperty("promptlib.storage.dir", tempDir.absolutePath)
        repository = PromptRepository()
    }
    
    @Test
    @Disabled("Mouse event simulation needs proper UI environment setup")
    fun `should invoke onAddGroupToShared when callback is triggered`() {
        // Given
        var sharedCallbackInvoked = false
        var privateCallbackInvoked = false
        
        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { },
            onPromptSelected = { _, _ -> },
            onAddGroupToShared = { sharedCallbackInvoked = true },
            onAddGroupToPrivate = { privateCallbackInvoked = true }
        )
        
        panel.rebuildTree()
        
        // When - directly invoke the callback (simulating button click)
        val tree = getTreeFromPanel(panel)
        val sharedPath = findLibraryRootPath(tree)
        
        // Simulate clicking on the button area (right side of the tree)
        if (sharedPath != null) {
            val bounds = tree.getPathBounds(sharedPath)
            if (bounds != null) {
                // Set a reasonable tree size for testing
                tree.setSize(400, 300)

                // Click on the right side where "+ Add Group" appears
                // Use tree width - 40 to ensure we're in the button area (last 80 pixels)
                val treeWidth = tree.visibleRect.width.coerceAtLeast(400)
                val clickX = treeWidth - 40

                val mouseEvent = MouseEvent(
                    tree,
                    MouseEvent.MOUSE_CLICKED,
                    System.currentTimeMillis(),
                    0,
                    clickX, // Absolute X position on right side
                    bounds.y + bounds.height / 2,
                    1,
                    false
                )

                // Trigger mouse listeners
                tree.mouseListeners.forEach { it.mouseClicked(mouseEvent) }
            }
        }
        
        // Then
        assertThat(sharedCallbackInvoked).isTrue()
        assertThat(privateCallbackInvoked).isFalse()
    }
    
    @Test
    @Disabled("Mouse event simulation needs proper UI environment setup")
    fun `should invoke onAddGroupToPrivate when callback is triggered`() {
        // Given
        var sharedCallbackInvoked = false
        var privateCallbackInvoked = false
        
        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { },
            onPromptSelected = { _, _ -> },
            onAddGroupToShared = { sharedCallbackInvoked = true },
            onAddGroupToPrivate = { privateCallbackInvoked = true }
        )
        
        panel.rebuildTree()
        
        // When - simulate clicking on Private's button
        val tree = getTreeFromPanel(panel)
        val privatePath = findNodePath(tree, PrivateRoot)

        if (privatePath != null) {
            val bounds = tree.getPathBounds(privatePath)
            if (bounds != null) {
                // Set a reasonable tree size for testing
                tree.setSize(400, 300)

                // Click on the right side where "+ Add Group" appears
                val treeWidth = tree.visibleRect.width.coerceAtLeast(400)
                val clickX = treeWidth - 40

                val mouseEvent = MouseEvent(
                    tree,
                    MouseEvent.MOUSE_CLICKED,
                    System.currentTimeMillis(),
                    0,
                    clickX, // Absolute X position on right side
                    bounds.y + bounds.height / 2,
                    1,
                    false
                )

                tree.mouseListeners.forEach { it.mouseClicked(mouseEvent) }
            }
        }
        
        // Then
        assertThat(sharedCallbackInvoked).isFalse()
        assertThat(privateCallbackInvoked).isTrue()
    }
    
    @Test
    @Disabled("Mouse event simulation needs proper UI environment setup")
    fun `should not invoke callbacks when clicking on label area`() {
        // Given
        var sharedCallbackInvoked = false
        
        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { },
            onPromptSelected = { _, _ -> },
            onAddGroupToShared = { sharedCallbackInvoked = true }
        )
        
        panel.rebuildTree()
        
        // When - click on label area (left side, not button)
        val tree = getTreeFromPanel(panel)
        val sharedPath = findLibraryRootPath(tree)

        if (sharedPath != null) {
            val bounds = tree.getPathBounds(sharedPath)
            if (bounds != null) {
                // Click at absolute position 50 (well before the right side button area)
                val mouseEvent = MouseEvent(
                    tree,
                    MouseEvent.MOUSE_CLICKED,
                    System.currentTimeMillis(),
                    0,
                    50, // Absolute X position - clearly in label area
                    bounds.y + bounds.height / 2,
                    1,
                    false
                )

                tree.mouseListeners.forEach { it.mouseClicked(mouseEvent) }
            }
        }

        // Then - callback should NOT be invoked
        assertThat(sharedCallbackInvoked).isFalse()
    }
    
    // Helper methods
    
    private fun getTreeFromPanel(panel: GroupTreePanel): JTree {
        val scrollPane = panel.components.firstOrNull { it is JScrollPane } as? JScrollPane
        return scrollPane?.viewport?.view as JTree
    }
    
    private fun findNodePath(tree: JTree, target: Any): TreePath? {
        val root = tree.model.root as? DefaultMutableTreeNode ?: return null
        return findNodePathRecursive(root, target, TreePath(root))
    }

    private fun findNodePathRecursive(node: DefaultMutableTreeNode, target: Any, path: TreePath): TreePath? {
        if (node.userObject == target) return path
        // Also match LibraryRoot by type (for tests that search for SharedRoot)
        if (target is String && target == "LibraryRoot" && node.userObject is LibraryRoot) return path

        for (i in 0 until node.childCount) {
            val child = node.getChildAt(i) as DefaultMutableTreeNode
            val childPath = path.pathByAddingChild(child)
            val result = findNodePathRecursive(child, target, childPath)
            if (result != null) return result
        }

        return null
    }

    /**
     * Finds the first LibraryRoot node in the tree.
     */
    private fun findLibraryRootPath(tree: JTree): TreePath? {
        val root = tree.model.root as? DefaultMutableTreeNode ?: return null
        return findLibraryRootRecursive(root, TreePath(root))
    }

    private fun findLibraryRootRecursive(node: DefaultMutableTreeNode, path: TreePath): TreePath? {
        if (node.userObject is LibraryRoot) return path

        for (i in 0 until node.childCount) {
            val child = node.getChildAt(i) as DefaultMutableTreeNode
            val childPath = path.pathByAddingChild(child)
            val result = findLibraryRootRecursive(child, childPath)
            if (result != null) return result
        }

        return null
    }
}

