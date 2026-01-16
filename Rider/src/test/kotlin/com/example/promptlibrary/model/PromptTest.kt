package com.example.promptlibrary.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Nested
import java.time.Instant

class PromptTest {

    @Nested
    inner class NormalizedTextTests {

        @Test
        fun `should trim leading and trailing whitespace`() {
            val prompt = Prompt(text = "  Hello World  ")
            assertThat(prompt.normalizedText()).isEqualTo("hello world")
        }

        @Test
        fun `should collapse multiple spaces to single space`() {
            val prompt = Prompt(text = "Hello    World")
            assertThat(prompt.normalizedText()).isEqualTo("hello world")
        }

        @Test
        fun `should convert to lowercase`() {
            val prompt = Prompt(text = "HELLO World")
            assertThat(prompt.normalizedText()).isEqualTo("hello world")
        }

        @Test
        fun `should normalize Windows line endings to Unix`() {
            val prompt = Prompt(text = "Line1\r\nLine2\r\nLine3")
            assertThat(prompt.normalizedText()).isEqualTo("line1\nline2\nline3")
        }

        @Test
        fun `should normalize Mac line endings to Unix`() {
            val prompt = Prompt(text = "Line1\rLine2\rLine3")
            assertThat(prompt.normalizedText()).isEqualTo("line1\nline2\nline3")
        }

        @Test
        fun `should remove trailing spaces on each line`() {
            val prompt = Prompt(text = "Line1  \nLine2   \nLine3 ")
            assertThat(prompt.normalizedText()).isEqualTo("line1\nline2\nline3")
        }

        @Test
        fun `should handle empty text`() {
            val prompt = Prompt(text = "")
            assertThat(prompt.normalizedText()).isEmpty()
        }

        @Test
        fun `should handle whitespace-only text`() {
            val prompt = Prompt(text = "   \n  \n   ")
            assertThat(prompt.normalizedText()).isEmpty()
        }

        @Test
        fun `should handle complex multiline text with mixed whitespace`() {
            val prompt = Prompt(text = """
                First   Line  
                  Second    Line   
                Third Line
            """.trimIndent())
            
            assertThat(prompt.normalizedText()).isEqualTo("first line\nsecond line\nthird line")
        }

        @Test
        fun `should collapse tabs and spaces`() {
            val prompt = Prompt(text = "Hello\t\tWorld  \tTest")
            assertThat(prompt.normalizedText()).isEqualTo("hello world test")
        }
    }

    @Nested
    inner class DisplayTitleTests {

        @Test
        fun `should use explicit title when provided`() {
            val prompt = Prompt(text = "Long text here", title = "My Title")
            assertThat(prompt.displayTitle()).isEqualTo("My Title")
        }

        @Test
        fun `should trim explicit title`() {
            val prompt = Prompt(text = "Text", title = "  My Title  ")
            assertThat(prompt.displayTitle()).isEqualTo("My Title")
        }

        @Test
        fun `should use first line of text when no title provided`() {
            val prompt = Prompt(text = "First Line\nSecond Line")
            assertThat(prompt.displayTitle()).isEqualTo("First Line")
        }

        @Test
        fun `should truncate long text to maxLen with ellipsis`() {
            val longText = "This is a very long text that should be truncated"
            val prompt = Prompt(text = longText)

            val result = prompt.displayTitle(maxLen = 20)

            // The ellipsis "…" is a single character, so total length is maxLen + 1
            assertThat(result).hasSizeLessThanOrEqualTo(21)
            assertThat(result).endsWith("…")
            assertThat(result).startsWith("This is a very long")
        }

        @Test
        fun `should not add ellipsis when text fits within maxLen`() {
            val prompt = Prompt(text = "Short text")
            assertThat(prompt.displayTitle(maxLen = 50)).isEqualTo("Short text")
        }

        @Test
        fun `should handle empty text`() {
            val prompt = Prompt(text = "")
            assertThat(prompt.displayTitle()).isEmpty()
        }

        @Test
        fun `should handle whitespace-only text`() {
            val prompt = Prompt(text = "   \n  \n   ")
            assertThat(prompt.displayTitle()).isEmpty()
        }

        @Test
        fun `should normalize line endings before extracting first line`() {
            val prompt = Prompt(text = "First Line\r\nSecond Line")
            assertThat(prompt.displayTitle()).isEqualTo("First Line")
        }

        @Test
        fun `should prefer explicit title over text even if title is short`() {
            val prompt = Prompt(text = "Very long text here", title = "T")
            assertThat(prompt.displayTitle()).isEqualTo("T")
        }

        @Test
        fun `should ignore blank explicit title and use text`() {
            val prompt = Prompt(text = "Text content", title = "   ")
            assertThat(prompt.displayTitle()).isEqualTo("Text content")
        }
    }

    @Nested
    inner class WithUpdatedTextTests {

        @Test
        fun `should update text`() {
            val original = Prompt(text = "Original")
            val updated = original.withUpdatedText("Updated")
            
            assertThat(updated.text).isEqualTo("Updated")
        }

        @Test
        fun `should preserve id`() {
            val original = Prompt(id = "test-id", text = "Original")
            val updated = original.withUpdatedText("Updated")

            assertThat(updated.id).isEqualTo("test-id")
        }

        @Test
        fun `should preserve title`() {
            val original = Prompt(text = "Original", title = "My Title")
            val updated = original.withUpdatedText("Updated")

            assertThat(updated.title).isEqualTo("My Title")
        }

        @Test
        fun `should preserve tags`() {
            val original = Prompt(text = "Original", tags = listOf("tag1", "tag2"))
            val updated = original.withUpdatedText("Updated")

            assertThat(updated.tags).containsExactly("tag1", "tag2")
        }

        @Test
        fun `should preserve isPrivate flag`() {
            val original = Prompt(text = "Original", isPrivate = true)
            val updated = original.withUpdatedText("Updated")

            assertThat(updated.isPrivate).isTrue()
        }

        @Test
        fun `should preserve createdAt timestamp`() {
            val original = Prompt(text = "Original", createdAt = "2024-01-01T00:00:00Z")
            val updated = original.withUpdatedText("Updated")

            assertThat(updated.createdAt).isEqualTo("2024-01-01T00:00:00Z")
        }

        @Test
        fun `should update updatedAt timestamp`() {
            val original = Prompt(text = "Original", updatedAt = "2024-01-01T00:00:00Z")

            // Small delay to ensure timestamp changes
            Thread.sleep(10)

            val updated = original.withUpdatedText("Updated")

            assertThat(updated.updatedAt).isNotEqualTo("2024-01-01T00:00:00Z")
            assertThat(updated.updatedAt).isNotEqualTo(original.updatedAt)
        }
    }

    @Nested
    inner class DataClassTests {

        @Test
        fun `should generate unique IDs by default`() {
            val prompt1 = Prompt(text = "Text 1")
            val prompt2 = Prompt(text = "Text 2")

            assertThat(prompt1.id).isNotEqualTo(prompt2.id)
        }

        @Test
        fun `should allow custom ID`() {
            val prompt = Prompt(id = "custom-id", text = "Text")
            assertThat(prompt.id).isEqualTo("custom-id")
        }

        @Test
        fun `should default isPrivate to false`() {
            val prompt = Prompt(text = "Text")
            assertThat(prompt.isPrivate).isFalse()
        }

        @Test
        fun `should default tags to empty list`() {
            val prompt = Prompt(text = "Text")
            assertThat(prompt.tags).isEmpty()
        }

        @Test
        fun `should default title to null`() {
            val prompt = Prompt(text = "Text")
            assertThat(prompt.title).isNull()
        }

        @Test
        fun `should generate timestamps on creation`() {
            val before = Instant.now()
            val prompt = Prompt(text = "Text")
            val after = Instant.now()

            val createdAt = Instant.parse(prompt.createdAt)
            val updatedAt = Instant.parse(prompt.updatedAt)

            assertThat(createdAt).isBetween(before, after)
            assertThat(updatedAt).isBetween(before, after)
        }

        @Test
        fun `should support copy with modifications`() {
            val original = Prompt(text = "Original", title = "Title")
            val copy = original.copy(text = "Modified")

            assertThat(copy.text).isEqualTo("Modified")
            assertThat(copy.title).isEqualTo("Title")
            assertThat(copy.id).isEqualTo(original.id)
        }

        @Test
        fun `should support equality comparison`() {
            val prompt1 = Prompt(id = "same-id", text = "Text", createdAt = "2024-01-01T00:00:00Z", updatedAt = "2024-01-01T00:00:00Z")
            val prompt2 = Prompt(id = "same-id", text = "Text", createdAt = "2024-01-01T00:00:00Z", updatedAt = "2024-01-01T00:00:00Z")

            assertThat(prompt1).isEqualTo(prompt2)
        }

        @Test
        fun `should detect inequality when fields differ`() {
            val prompt1 = Prompt(id = "id1", text = "Text")
            val prompt2 = Prompt(id = "id2", text = "Text")

            assertThat(prompt1).isNotEqualTo(prompt2)
        }
    }
}

