package com.example.promptlibrary.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName
import java.time.Instant
import java.util.UUID

@Serializable
data class Prompt(
    val id: String = UUID.randomUUID().toString(),
    val text: String,
    val title: String? = null,
    val createdAt: String = Instant.now().toString(),
    val updatedAt: String = Instant.now().toString(),
    val tags: List<String> = emptyList(),
    @SerialName("private")
    val isPrivate: Boolean = false
) {
    /**
     * Creates a copy of this prompt with updated text and timestamp
     */
    fun withUpdatedText(newText: String): Prompt {
        return copy(text = newText, updatedAt = Instant.now().toString())
    }

    /**
     * Returns a title for display. If an explicit title is provided and non-blank, use it.
     * Otherwise derive from the first 50 characters of the text, appending an ellipsis when truncated.
     */
    fun displayTitle(maxLen: Int = 50): String {
        val explicit = title?.trim()
        if (!explicit.isNullOrEmpty()) return explicit
        val base = text.trim().replace("\r\n", "\n").replace("\r", "\n")
        val singleLine = base.lines().firstOrNull()?.trim() ?: ""
        return if (singleLine.length <= maxLen) singleLine else singleLine.take(maxLen).trimEnd() + "…"
    }

    /**
     * Normalizes the prompt text for search and duplicate detection
     * - trim leading/trailing whitespace
     * - collapse repeated internal whitespace to a single space
     * - normalize line endings to "\n"
     * - lowercase for comparison
     * - remove trailing spaces on each line
     */
    fun normalizedText(): String {
        return text
            .trim()
            .replace(Regex("\\s+"), " ")
            .replace("\r\n", "\n").replace("\r", "\n")
            .lines()
            .joinToString("\n") { it.trimEnd() }
            .lowercase()
    }
}
