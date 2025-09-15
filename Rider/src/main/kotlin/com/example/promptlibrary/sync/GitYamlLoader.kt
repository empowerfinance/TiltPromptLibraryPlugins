package com.example.promptlibrary.sync

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Library
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.yaml.GroupYaml
import com.example.promptlibrary.yaml.PromptYaml
import java.io.File

/**
 * Reads a YAML tree from a local folder into Group/Prompt models.
 * This is read-only and makes no Git calls. Structure:
 *   <root>/
 *     <group>/
 *       _group.yaml
 *       prompts/
 *         p-<uuid>.yaml
 *       <child>/
 *         ...
 */
object GitYamlLoader {
    fun loadFromRoot(rootDir: File): List<Group> {
        if (!rootDir.exists() || !rootDir.isDirectory) return emptyList()
        return rootDir.listFiles()?.mapNotNull { readGroupDir(it) } ?: emptyList()
    }

    private fun readGroupDir(dir: File): Group? {
        if (!dir.isDirectory) return null
        val meta = File(dir, "_group.yaml")
        if (!meta.exists()) return null
        val group = GroupYaml.readGroup(meta)
        val promptsDir = File(dir, "prompts")
        val prompts = if (promptsDir.exists()) {
            promptsDir.listFiles { f -> f.isFile && f.name.endsWith(".yaml") }?.map { PromptYaml.readPrompt(it) }
                ?.filter { !it.isPrivate } // never import private=true
                ?: emptyList()
        } else emptyList()
        val children = dir.listFiles { f -> f.isDirectory && File(f, "_group.yaml").exists() }?.mapNotNull { readGroupDir(it) } ?: emptyList()
        return group.copy(children = children, prompts = prompts)
    }
}

