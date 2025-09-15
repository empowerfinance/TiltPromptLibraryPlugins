package com.example.promptlibrary.yaml

import com.charleskorn.kaml.Yaml
import com.charleskorn.kaml.YamlConfiguration
import com.example.promptlibrary.model.Group
import java.io.File

/**
 * YAML read/write helpers for Group using kotlinx.serialization via KAML.
 * Deterministic output with defaults encoded to produce stable diffs.
 */
object GroupYaml {
    private val yaml = Yaml(
        configuration = YamlConfiguration(
            encodeDefaults = true
        )
    )

    fun writeGroup(group: Group, file: File) {
        val text = yaml.encodeToString(Group.serializer(), group)
        file.parentFile?.mkdirs()
        file.writeText(text)
    }

    fun readGroup(file: File): Group {
        val text = file.readText()
        return yaml.decodeFromString(Group.serializer(), text)
    }
}

