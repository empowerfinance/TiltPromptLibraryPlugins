package com.example.promptlibrary.ui.dialogs

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ImportDialogTest {
    
    @Test
    fun `dialog should be created`() {
        // Given/When
        val dialog = ImportDialog(
            parent = null,
            onImport = { ImportResult.Success(0, 0) }
        )
        
        // Then
        assertThat(dialog).isNotNull
    }
    
    @Test
    fun `ImportResult Success should be created`() {
        // Given/When
        val result = ImportResult.Success(importedCount = 5, duplicatesSkipped = 2)
        
        // Then
        assertThat(result).isNotNull
        assertThat(result.importedCount).isEqualTo(5)
        assertThat(result.duplicatesSkipped).isEqualTo(2)
    }
    
    @Test
    fun `ImportResult Error should be created with message`() {
        // Given
        val errorMessage = "Test error message"
        
        // When
        val result = ImportResult.Error(errorMessage)
        
        // Then
        assertThat(result).isNotNull
        assertThat(result.message).isEqualTo(errorMessage)
    }
}

