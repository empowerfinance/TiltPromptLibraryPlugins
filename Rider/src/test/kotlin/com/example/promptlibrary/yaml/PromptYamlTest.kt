package com.example.promptlibrary.yaml

import com.example.promptlibrary.model.Prompt
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Path

class PromptYamlTest {

    @TempDir
    lateinit var tempDir: Path

    @Test
    fun `should write and read prompt with all fields`() {
        val prompt = Prompt(
            id = "test-id-123",
            text = "Test prompt text",
            title = "Test Title",
            createdAt = "2024-01-01T00:00:00Z",
            updatedAt = "2024-01-02T00:00:00Z",
            tags = listOf("tag1", "tag2"),
            isPrivate = false
        )
        
        val file = tempDir.resolve("test-prompt.yaml").toFile()
        
        PromptYaml.writePrompt(prompt, file)
        val loaded = PromptYaml.readPrompt(file)
        
        assertThat(loaded).isEqualTo(prompt)
    }

    @Test
    fun `should write and read prompt with minimal fields`() {
        val prompt = Prompt(
            id = "minimal-id",
            text = "Minimal text"
        )
        
        val file = tempDir.resolve("minimal.yaml").toFile()
        
        PromptYaml.writePrompt(prompt, file)
        val loaded = PromptYaml.readPrompt(file)
        
        assertThat(loaded.id).isEqualTo("minimal-id")
        assertThat(loaded.text).isEqualTo("Minimal text")
    }

    @Test
    fun `should handle multiline text`() {
        val multilineText = """
            Line 1
            Line 2
            Line 3
        """.trimIndent()
        
        val prompt = Prompt(id = "multi", text = multilineText)
        val file = tempDir.resolve("multiline.yaml").toFile()
        
        PromptYaml.writePrompt(prompt, file)
        val loaded = PromptYaml.readPrompt(file)
        
        assertThat(loaded.text).isEqualTo(multilineText)
    }

    @Test
    fun `should handle special characters in text`() {
        val specialText = "Text with: colons, \"quotes\", and 'apostrophes'"
        val prompt = Prompt(id = "special", text = specialText)
        val file = tempDir.resolve("special.yaml").toFile()
        
        PromptYaml.writePrompt(prompt, file)
        val loaded = PromptYaml.readPrompt(file)
        
        assertThat(loaded.text).isEqualTo(specialText)
    }

    @Test
    fun `should handle empty tags list`() {
        val prompt = Prompt(id = "no-tags", text = "Text", tags = emptyList())
        val file = tempDir.resolve("no-tags.yaml").toFile()
        
        PromptYaml.writePrompt(prompt, file)
        val loaded = PromptYaml.readPrompt(file)
        
        assertThat(loaded.tags).isEmpty()
    }

    @Test
    fun `should handle multiple tags`() {
        val prompt = Prompt(
            id = "tagged",
            text = "Text",
            tags = listOf("important", "work", "shared")
        )
        val file = tempDir.resolve("tagged.yaml").toFile()
        
        PromptYaml.writePrompt(prompt, file)
        val loaded = PromptYaml.readPrompt(file)
        
        assertThat(loaded.tags).containsExactly("important", "work", "shared")
    }

    @Test
    fun `should preserve isPrivate flag`() {
        val privatePrompt = Prompt(id = "private", text = "Private text", isPrivate = true)
        val publicPrompt = Prompt(id = "public", text = "Public text", isPrivate = false)
        
        val privateFile = tempDir.resolve("private.yaml").toFile()
        val publicFile = tempDir.resolve("public.yaml").toFile()
        
        PromptYaml.writePrompt(privatePrompt, privateFile)
        PromptYaml.writePrompt(publicPrompt, publicFile)
        
        assertThat(PromptYaml.readPrompt(privateFile).isPrivate).isTrue()
        assertThat(PromptYaml.readPrompt(publicFile).isPrivate).isFalse()
    }

    @Test
    fun `should create parent directories if needed`() {
        val nestedFile = tempDir.resolve("nested/dir/prompt.yaml").toFile()
        val prompt = Prompt(id = "nested", text = "Nested prompt")
        
        PromptYaml.writePrompt(prompt, nestedFile)
        
        assertThat(nestedFile).exists()
        assertThat(PromptYaml.readPrompt(nestedFile)).isEqualTo(prompt)
    }

    @Test
    fun `should produce deterministic output with encodeDefaults`() {
        val prompt = Prompt(id = "deterministic", text = "Test")
        val file1 = tempDir.resolve("det1.yaml").toFile()
        val file2 = tempDir.resolve("det2.yaml").toFile()
        
        PromptYaml.writePrompt(prompt, file1)
        PromptYaml.writePrompt(prompt, file2)
        
        assertThat(file1.readText()).isEqualTo(file2.readText())
    }

    @Test
    fun `should handle null title`() {
        val prompt = Prompt(id = "no-title", text = "Text", title = null)
        val file = tempDir.resolve("no-title.yaml").toFile()
        
        PromptYaml.writePrompt(prompt, file)
        val loaded = PromptYaml.readPrompt(file)
        
        assertThat(loaded.title).isNull()
    }
}

