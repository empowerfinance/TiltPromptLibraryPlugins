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

    fun writePrompt(prompt: Prompt, file: File) {
        val text = yaml.encodeToString(Prompt.serializer(), prompt)
        file.parentFile?.mkdirs()
        file.writeText(text)
    }

    fun readPrompt(file: File): Prompt {
        val text = file.readText()
        return yaml.decodeFromString(Prompt.serializer(), text)
    }
}

