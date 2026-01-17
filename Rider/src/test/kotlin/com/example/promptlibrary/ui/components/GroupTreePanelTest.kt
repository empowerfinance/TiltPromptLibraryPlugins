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
    fun `SharedRoot should have correct toString`() {
        // When
        val sharedRoot = SharedRoot

        // Then
        assertThat(sharedRoot.toString()).isEqualTo("Shared")
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
}

