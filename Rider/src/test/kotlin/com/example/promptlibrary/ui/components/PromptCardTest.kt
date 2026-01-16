package com.example.promptlibrary.ui.components

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import javax.swing.JPanel

class PromptCardTest {
    
    @Test
    fun `create should return a JComponent`() {
        // Given
        val prompt = Prompt(text = "Test prompt")
        var copyCallbackInvoked = false
        var editCallbackInvoked = false
        var deleteCallbackInvoked = false
        var toggleCallbackInvoked = false
        
        val card = PromptCard(
            prompt = prompt,
            isExpanded = false,
            onToggleExpand = { toggleCallbackInvoked = true },
            onCopy = { copyCallbackInvoked = true },
            onEdit = { editCallbackInvoked = true },
            onDelete = { deleteCallbackInvoked = true },
            onMove = { _, _ -> },
            availableGroups = emptyList()
        )
        
        // When
        val component = card.create()
        
        // Then
        assertThat(component).isNotNull
        assertThat(component).isInstanceOf(JPanel::class.java)
    }
    
    @Test
    fun `create should use collapsed height when not expanded`() {
        // Given
        val prompt = Prompt(text = "Test prompt")
        val collapsedHeight = 24
        
        val card = PromptCard(
            prompt = prompt,
            isExpanded = false,
            collapsedRowHeight = collapsedHeight,
            onToggleExpand = { },
            onCopy = { },
            onEdit = { },
            onDelete = { },
            onMove = { _, _ -> },
            availableGroups = emptyList()
        )
        
        // When
        val component = card.create()
        
        // Then
        assertThat(component.preferredSize.height).isEqualTo(collapsedHeight)
    }
    
    @Test
    fun `create should use expanded height when expanded`() {
        // Given
        val prompt = Prompt(text = "Test prompt")
        val maxCardHeight = 180
        val expectedHeight = maxCardHeight + 80
        
        val card = PromptCard(
            prompt = prompt,
            isExpanded = true,
            maxCardHeight = maxCardHeight,
            onToggleExpand = { },
            onCopy = { },
            onEdit = { },
            onDelete = { },
            onMove = { _, _ -> },
            availableGroups = emptyList()
        )
        
        // When
        val component = card.create()
        
        // Then
        assertThat(component.preferredSize.height).isEqualTo(expectedHeight)
    }
    
    @Test
    fun `create should handle prompts with custom titles`() {
        // Given
        val prompt = Prompt(text = "Test prompt", title = "Custom Title")
        
        val card = PromptCard(
            prompt = prompt,
            isExpanded = false,
            onToggleExpand = { },
            onCopy = { },
            onEdit = { },
            onDelete = { },
            onMove = { _, _ -> },
            availableGroups = emptyList()
        )
        
        // When
        val component = card.create()
        
        // Then
        assertThat(component).isNotNull
        // The component should be created successfully with custom title
    }
    
    @Test
    fun `create should handle empty group list`() {
        // Given
        val prompt = Prompt(text = "Test prompt")
        
        val card = PromptCard(
            prompt = prompt,
            isExpanded = false,
            onToggleExpand = { },
            onCopy = { },
            onEdit = { },
            onDelete = { },
            onMove = { _, _ -> },
            availableGroups = emptyList()
        )
        
        // When
        val component = card.create()
        
        // Then
        assertThat(component).isNotNull
    }
    
    @Test
    fun `create should handle nested groups`() {
        // Given
        val prompt = Prompt(text = "Test prompt")
        val childGroup = Group(id = "child-1", name = "Child")
        val parentGroup = Group(id = "parent-1", name = "Parent", children = listOf(childGroup))

        val card = PromptCard(
            prompt = prompt,
            isExpanded = false,
            onToggleExpand = { },
            onCopy = { },
            onEdit = { },
            onDelete = { },
            onMove = { _, _ -> },
            availableGroups = listOf(parentGroup)
        )

        // When
        val component = card.create()

        // Then
        assertThat(component).isNotNull
    }
}

