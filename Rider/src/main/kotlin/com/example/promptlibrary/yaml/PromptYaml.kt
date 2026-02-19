package com.example.promptlibrary.yaml

import com.charleskorn.kaml.Yaml
import com.charleskorn.kaml.YamlConfiguration
import com.example.promptlibrary.model.Prompt
import java.io.File

/**
 * YAML read/write helpers for Prompt using kotlinx.serialization via KAML.
 * Deterministic output with defaults encoded to produce stable diffs.
 */
object PromptYaml {
    private val yaml = Yaml(
        configuration = YamlConfiguration(
            encodeDefaults = true
        )
    )

    /**
     * Normalizes text for YAML output by:
     * - Normalizing line endings to \n
     * - Removing trailing whitespace from each line
     * - Removing trailing empty lines
     */
    private fun normalizeTextForYaml(text: String): String {
        return text
            .replace("\r\n", "\n")
            .replace("\r", "\n")
            .lines()
            .map { it.trimEnd() }  // Remove trailing whitespace from each line
            .joinToString("\n")
            .trimEnd()  // Remove trailing empty lines
    }

    fun writePrompt(prompt: Prompt, file: File) {
        // Normalize the text to remove trailing whitespace before serialization
        val normalizedPrompt = prompt.copy(text = normalizeTextForYaml(prompt.text))
        val text = yaml.encodeToString(Prompt.serializer(), normalizedPrompt)
        file.parentFile?.mkdirs()
        file.writeText(text)
    }

    fun readPrompt(file: File): Prompt {
        val text = file.readText()
        return yaml.decodeFromString(Prompt.serializer(), text)
    }
}

