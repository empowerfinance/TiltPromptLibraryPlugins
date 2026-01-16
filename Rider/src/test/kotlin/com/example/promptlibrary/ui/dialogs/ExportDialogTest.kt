package com.example.promptlibrary.ui.dialogs

import com.example.promptlibrary.model.Prompt
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ExportDialogTest {
    
    @Test
    fun `dialog should be created with prompts`() {
        // Given
        val prompts = listOf(
            Prompt(text = "Prompt 1"),
            Prompt(text = "Prompt 2")
        )
        
        // When
        val dialog = ExportDialog(
            prompts = prompts,
            parent = null
        )
        
        // Then
        assertThat(dialog).isNotNull
    }
    
    @Test
    fun `dialog should handle empty prompts list`() {
        // Given
        val prompts = emptyList<Prompt>()
        
        // When
        val dialog = ExportDialog(
            prompts = prompts,
            parent = null
        )
        
        // Then
        assertThat(dialog).isNotNull
    }
    
    @Test
    fun `dialog should handle custom title`() {
        // Given
        val prompts = listOf(Prompt(text = "Test"))
        val customTitle = "Export Group: MyGroup"
        
        // When
        val dialog = ExportDialog(
            prompts = prompts,
            title = customTitle,
            parent = null
        )
        
        // Then
        assertThat(dialog).isNotNull
    }
    
    @Test
    fun `dialog should handle custom filename`() {
        // Given
        val prompts = listOf(Prompt(text = "Test"))
        val customFilename = "my-custom-export.json"
        
        // When
        val dialog = ExportDialog(
            prompts = prompts,
            defaultFileName = customFilename,
            parent = null
        )
        
        // Then
        assertThat(dialog).isNotNull
    }
}

