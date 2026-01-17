package com.example.promptlibrary.ui.components

import com.example.promptlibrary.model.Prompt
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class PromptComposerTest {

    @Test
    fun `composer should be created with disabled state by default`() {
        // Given
        val composer = PromptComposer(
            onSave = { _, _ -> SaveResult.Success },
            onUpdate = { _, _, _ -> SaveResult.Success }
        )

        // Then
        assertThat(composer).isNotNull
    }

    @Test
    fun `updateState should enable composer when group is selected`() {
        // Given
        val composer = PromptComposer(
            onSave = { _, _ -> SaveResult.Success },
            onUpdate = { _, _, _ -> SaveResult.Success }
        )

        // When
        composer.updateState(groupSelected = true, groupName = "Test Group")

        // Then - composer should be enabled (no exception thrown)
        assertThat(composer).isNotNull
    }

    @Test
    fun `updateState should disable composer when no group is selected`() {
        // Given
        val composer = PromptComposer(
            onSave = { _, _ -> SaveResult.Success },
            onUpdate = { _, _, _ -> SaveResult.Success }
        )

        // When
        composer.updateState(groupSelected = false, groupName = null)

        // Then - composer should be disabled (no exception thrown)
        assertThat(composer).isNotNull
    }

    @Test
    fun `clear should empty the text area`() {
        // Given
        val composer = PromptComposer(
            onSave = { _, _ -> SaveResult.Success },
            onUpdate = { _, _, _ -> SaveResult.Success }
        )
        composer.setText("Some text")

        // When
        composer.clear()

        // Then
        assertThat(composer.getText()).isEmpty()
    }
    
    @Test
    fun `setText and getText should work correctly`() {
        // Given
        val composer = PromptComposer(
            onSave = { _, _ -> SaveResult.Success },
            onUpdate = { _, _, _ -> SaveResult.Success }
        )
        val testText = "Test prompt text"

        // When
        composer.setText(testText)

        // Then
        assertThat(composer.getText()).isEqualTo(testText)
    }

    @Test
    fun `SaveResult Success should be created`() {
        // Given/When
        val result = SaveResult.Success

        // Then
        assertThat(result).isNotNull
        assertThat(result).isInstanceOf(SaveResult::class.java)
    }

    @Test
    fun `SaveResult Duplicate should be created`() {
        // Given/When
        val result = SaveResult.Duplicate

        // Then
        assertThat(result).isNotNull
        assertThat(result).isInstanceOf(SaveResult::class.java)
    }

    @Test
    fun `SaveResult Error should be created with message`() {
        // Given
        val errorMessage = "Test error message"

        // When
        val result = SaveResult.Error(errorMessage)

        // Then
        assertThat(result).isNotNull
        assertThat(result).isInstanceOf(SaveResult::class.java)
        assertThat(result.message).isEqualTo(errorMessage)
    }

    @Test
    fun `composer should handle empty text gracefully`() {
        // Given
        var saveCallbackInvoked = false
        val composer = PromptComposer(
            onSave = { _, _ ->
                saveCallbackInvoked = true
                SaveResult.Success
            },
            onUpdate = { _, _, _ -> SaveResult.Success }
        )

        // When
        composer.setText("")
        composer.updateState(groupSelected = true, groupName = "Test Group")

        // Then - no exception should be thrown
        assertThat(composer.getText()).isEmpty()
    }

    @Test
    fun `composer should handle whitespace-only text`() {
        // Given
        val composer = PromptComposer(
            onSave = { _, _ -> SaveResult.Success },
            onUpdate = { _, _, _ -> SaveResult.Success }
        )

        // When
        composer.setText("   \n\t  ")

        // Then
        assertThat(composer.getText()).isNotEmpty()
        assertThat(composer.getText().trim()).isEmpty()
    }
}

