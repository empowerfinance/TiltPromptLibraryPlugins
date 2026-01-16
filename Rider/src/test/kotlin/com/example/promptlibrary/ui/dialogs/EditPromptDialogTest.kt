package com.example.promptlibrary.ui.dialogs

import com.example.promptlibrary.model.Prompt
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.DisabledIfSystemProperty

@DisabledIfSystemProperty(named = "java.awt.headless", matches = "true")
class EditPromptDialogTest {
    
    @Test
    fun `dialog should be created with prompt text`() {
        // Given
        val prompt = Prompt(text = "Original text")
        var saveCallbackInvoked = false
        
        // When
        val dialog = EditPromptDialog(
            prompt = prompt,
            parent = null,
            onSave = { 
                saveCallbackInvoked = true
                EditResult.Success 
            }
        )
        
        // Then
        assertThat(dialog).isNotNull
    }
    
    @Test
    fun `EditResult Success should be created`() {
        // Given/When
        val result = EditResult.Success
        
        // Then
        assertThat(result).isNotNull
        assertThat(result).isInstanceOf(EditResult::class.java)
    }
    
    @Test
    fun `EditResult Duplicate should be created`() {
        // Given/When
        val result = EditResult.Duplicate
        
        // Then
        assertThat(result).isNotNull
        assertThat(result).isInstanceOf(EditResult::class.java)
    }
    
    @Test
    fun `EditResult Error should be created with message`() {
        // Given
        val errorMessage = "Test error message"
        
        // When
        val result = EditResult.Error(errorMessage)
        
        // Then
        assertThat(result).isNotNull
        assertThat(result).isInstanceOf(EditResult::class.java)
        assertThat(result.message).isEqualTo(errorMessage)
    }
    
    @Test
    fun `dialog should handle different prompt texts`() {
        // Given
        val prompts = listOf(
            Prompt(text = "Short"),
            Prompt(text = "A much longer prompt text that spans multiple lines and contains various characters"),
            Prompt(text = "Text with\nnewlines\nand\ttabs")
        )
        
        // When/Then
        prompts.forEach { prompt ->
            val dialog = EditPromptDialog(
                prompt = prompt,
                parent = null,
                onSave = { EditResult.Success }
            )
            assertThat(dialog).isNotNull
        }
    }
    
    @Test
    fun `dialog should handle prompts with titles`() {
        // Given
        val prompt = Prompt(text = "Test text", title = "Test Title")
        
        // When
        val dialog = EditPromptDialog(
            prompt = prompt,
            parent = null,
            onSave = { EditResult.Success }
        )
        
        // Then
        assertThat(dialog).isNotNull
    }
}

