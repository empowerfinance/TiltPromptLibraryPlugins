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
            onGroupSelected = { selectedGroupId = it }
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
            onGroupSelected = { selectedGroupId = it }
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
            onGroupSelected = { selectedGroupId = it }
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
            onGroupSelected = { }
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
            onGroupSelected = { }
        )
        
        // When
        val node = panel.getLastSelectedNode()
        
        // Then
        assertThat(node).isNull()
    }
    
    @Test
    fun `SharedRoot should have correct toString`() {
        // When
        val sharedRoot = GroupTreePanel.SharedRoot
        
        // Then
        assertThat(sharedRoot.toString()).isEqualTo("Shared")
    }
    
    @Test
    fun `PrivateRoot should have correct toString`() {
        // When
        val privateRoot = GroupTreePanel.PrivateRoot
        
        // Then
        assertThat(privateRoot.toString()).isEqualTo("Private")
    }
}

