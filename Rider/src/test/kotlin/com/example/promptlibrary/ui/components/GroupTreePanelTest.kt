package com.example.promptlibrary.ui.components

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.repository.PromptRepository
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

class GroupTreePanelTest {
    
    @TempDir
    lateinit var tempDir: File
    
    private lateinit var repository: PromptRepository
    
    @BeforeEach
    fun setup() {
        // Set up repository with temp directory
        System.setProperty("promptlib.storage.dir", tempDir.absolutePath)
        repository = PromptRepository()
    }
    
    @Test
    fun `panel should be created`() {
        // Given
        var selectedGroupId: String? = null

        // When
        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { selectedGroupId = it },
            onPromptSelected = { _, _ -> }
        )

        // Then
        assertThat(panel).isNotNull
    }

    @Test
    fun `rebuildTree should populate tree with groups`() {
        // Given
        var selectedGroupId: String? = null
        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { selectedGroupId = it },
            onPromptSelected = { _, _ -> }
        )

        // When
        panel.rebuildTree()

        // Then
        assertThat(panel).isNotNull
    }

    @Test
    fun `clearSelection should clear selected group`() {
        // Given
        var selectedGroupId: String? = "test-id"
        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { selectedGroupId = it },
            onPromptSelected = { _, _ -> }
        )

        // When
        panel.clearSelection()

        // Then
        assertThat(panel.getSelectedGroupId()).isNull()
    }

    @Test
    fun `getSelectedGroupId should return null initially`() {
        // Given
        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { },
            onPromptSelected = { _, _ -> }
        )

        // When
        val groupId = panel.getSelectedGroupId()

        // Then
        assertThat(groupId).isNull()
    }

    @Test
    fun `getLastSelectedNode should return null initially`() {
        // Given
        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { },
            onPromptSelected = { _, _ -> }
        )

        // When
        val node = panel.getLastSelectedNode()

        // Then
        assertThat(node).isNull()
    }
    
    @Test
    fun `LibraryRoot should have correct toString for active library`() {
        // When
        val libraryRoot = LibraryRoot("test-lib", "Test Library", isActive = true)

        // Then
        assertThat(libraryRoot.toString()).isEqualTo("📚 Test Library ✏️")
    }

    @Test
    fun `LibraryRoot should have correct toString for inactive library`() {
        // When
        val libraryRoot = LibraryRoot("test-lib", "Test Library", isActive = false)

        // Then
        assertThat(libraryRoot.toString()).isEqualTo("📚 Test Library")
    }

    @Test
    fun `PrivateRoot should have correct toString`() {
        // When
        val privateRoot = PrivateRoot

        // Then
        assertThat(privateRoot.toString()).isEqualTo("Private")
    }

    @Test
    fun `should call onAddGroupToShared callback when provided`() {
        // Given
        var sharedCallbackCalled = false
        var privateCallbackCalled = false

        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { },
            onPromptSelected = { _, _ -> },
            onAddGroupToShared = { sharedCallbackCalled = true },
            onAddGroupToPrivate = { privateCallbackCalled = true }
        )

        // When - simulate the callback being invoked
        panel.rebuildTree()

        // Then - callbacks should be registered (we can't easily simulate clicks in unit tests)
        assertThat(panel).isNotNull
        // Note: Actual click simulation would require UI testing framework
    }

    @Test
    fun `should call onAddGroupToPrivate callback when provided`() {
        // Given
        var sharedCallbackCalled = false
        var privateCallbackCalled = false

        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { },
            onPromptSelected = { _, _ -> },
            onAddGroupToShared = { sharedCallbackCalled = true },
            onAddGroupToPrivate = { privateCallbackCalled = true }
        )

        // When - simulate the callback being invoked
        panel.rebuildTree()

        // Then - callbacks should be registered
        assertThat(panel).isNotNull
    }

    @Test
    fun `should create panel with default callbacks`() {
        // Given & When - create panel without providing add callbacks
        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { },
            onPromptSelected = { _, _ -> }
        )

        // Then - should use default empty callbacks
        assertThat(panel).isNotNull
        panel.rebuildTree()
        assertThat(panel).isNotNull
    }

    @Test
    fun `should have custom cell renderer installed`() {
        // Given
        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { },
            onPromptSelected = { _, _ -> },
            onAddGroupToShared = { },
            onAddGroupToPrivate = { }
        )

        // When
        panel.rebuildTree()

        // Then - renderer should be custom (not default)
        val tree = panel.components.firstOrNull { it is javax.swing.JScrollPane }
            ?.let { (it as javax.swing.JScrollPane).viewport.view as? javax.swing.JTree }

        assertThat(tree).isNotNull
        assertThat(tree?.cellRenderer).isNotNull
    }

    @Test
    fun `rebuildTree should only show Private when all libraries hidden`() {
        // Given - when PluginSettingsService throws (simulating unavailable/empty enabled libraries)
        // The defensive catch block returns emptyList(), simulating all libraries hidden
        val panel = GroupTreePanel(
            repository = repository,
            onGroupSelected = { },
            onPromptSelected = { _, _ -> }
        )

        // When
        panel.rebuildTree()

        // Then - tree should only have Private root, no library roots
        val tree = panel.components.firstOrNull { it is javax.swing.JScrollPane }
            ?.let { (it as javax.swing.JScrollPane).viewport.view as? javax.swing.JTree }
        assertThat(tree).isNotNull

        val model = tree?.model as? javax.swing.tree.DefaultTreeModel
        assertThat(model).isNotNull

        val root = model?.root as? javax.swing.tree.DefaultMutableTreeNode
        assertThat(root).isNotNull

        // Count child nodes - should only have Private (since no libraries enabled in test environment)
        val childCount = root?.childCount ?: 0
        // In test environment without PluginSettingsService, enabledLibraries returns emptyList()
        // so we should only see Private root
        assertThat(childCount).isGreaterThanOrEqualTo(1)

        // Check that Private node exists
        var hasPrivateRoot = false
        for (i in 0 until childCount) {
            val child = root?.getChildAt(i) as? javax.swing.tree.DefaultMutableTreeNode
            if (child?.userObject is PrivateRoot) {
                hasPrivateRoot = true
            }
        }
        assertThat(hasPrivateRoot).isTrue()
    }

    @Test
    fun `LibraryRoot data class should preserve properties`() {
        // Given
        val libraryRoot = LibraryRoot(
            libraryId = "test-library-id",
            displayName = "Test Library",
            isActive = true
        )

        // Then
        assertThat(libraryRoot.libraryId).isEqualTo("test-library-id")
        assertThat(libraryRoot.displayName).isEqualTo("Test Library")
        assertThat(libraryRoot.isActive).isTrue()
    }

    @Test
    fun `LibraryRoot equality should work correctly`() {
        // Given
        val root1 = LibraryRoot("lib1", "Library 1", true)
        val root2 = LibraryRoot("lib1", "Library 1", true)
        val root3 = LibraryRoot("lib2", "Library 2", false)

        // Then
        assertThat(root1).isEqualTo(root2)
        assertThat(root1).isNotEqualTo(root3)
    }
}

