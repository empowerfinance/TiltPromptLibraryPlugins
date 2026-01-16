package com.example.promptlibrary.sync

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.GroupKind
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.yaml.GroupYaml
import com.example.promptlibrary.yaml.PromptYaml
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Path

class GitYamlLoaderTest {

    @TempDir
    lateinit var tempDir: Path

    @Test
    fun `should return empty list for non-existent directory`() {
        val nonExistent = tempDir.resolve("does-not-exist").toFile()
        val groups = GitYamlLoader.loadFromRoot(nonExistent)
        
        assertThat(groups).isEmpty()
    }

    @Test
    fun `should return empty list for file instead of directory`() {
        val file = tempDir.resolve("file.txt").toFile()
        file.writeText("not a directory")
        
        val groups = GitYamlLoader.loadFromRoot(file)
        
        assertThat(groups).isEmpty()
    }

    @Test
    fun `should return empty list for empty directory`() {
        val emptyDir = tempDir.resolve("empty").toFile()
        emptyDir.mkdirs()
        
        val groups = GitYamlLoader.loadFromRoot(emptyDir)
        
        assertThat(groups).isEmpty()
    }

    @Test
    fun `should load single group with no prompts`() {
        val rootDir = tempDir.toFile()
        val groupDir = File(rootDir, "test-group")
        groupDir.mkdirs()
        
        val group = Group(id = "g1", name = "Test Group")
        GroupYaml.writeGroup(group, File(groupDir, "_group.yaml"))
        
        val loaded = GitYamlLoader.loadFromRoot(rootDir)
        
        assertThat(loaded).hasSize(1)
        assertThat(loaded[0].id).isEqualTo("g1")
        assertThat(loaded[0].name).isEqualTo("Test Group")
        assertThat(loaded[0].prompts).isEmpty()
    }

    @Test
    fun `should load group with prompts`() {
        val rootDir = tempDir.toFile()
        val groupDir = File(rootDir, "test-group")
        val promptsDir = File(groupDir, "prompts")
        promptsDir.mkdirs()
        
        val group = Group(id = "g1", name = "Test Group")
        GroupYaml.writeGroup(group, File(groupDir, "_group.yaml"))
        
        val prompt1 = Prompt(id = "p1", text = "Prompt 1")
        val prompt2 = Prompt(id = "p2", text = "Prompt 2")
        PromptYaml.writePrompt(prompt1, File(promptsDir, "p-p1.yaml"))
        PromptYaml.writePrompt(prompt2, File(promptsDir, "p-p2.yaml"))
        
        val loaded = GitYamlLoader.loadFromRoot(rootDir)
        
        assertThat(loaded).hasSize(1)
        assertThat(loaded[0].prompts).hasSize(2)
        assertThat(loaded[0].prompts.map { it.id }).containsExactlyInAnyOrder("p1", "p2")
    }

    @Test
    fun `should filter out private prompts`() {
        val rootDir = tempDir.toFile()
        val groupDir = File(rootDir, "test-group")
        val promptsDir = File(groupDir, "prompts")
        promptsDir.mkdirs()
        
        val group = Group(id = "g1", name = "Test Group")
        GroupYaml.writeGroup(group, File(groupDir, "_group.yaml"))
        
        val publicPrompt = Prompt(id = "public", text = "Public", isPrivate = false)
        val privatePrompt = Prompt(id = "private", text = "Private", isPrivate = true)
        PromptYaml.writePrompt(publicPrompt, File(promptsDir, "p-public.yaml"))
        PromptYaml.writePrompt(privatePrompt, File(promptsDir, "p-private.yaml"))
        
        val loaded = GitYamlLoader.loadFromRoot(rootDir)
        
        assertThat(loaded[0].prompts).hasSize(1)
        assertThat(loaded[0].prompts[0].id).isEqualTo("public")
    }

    @Test
    fun `should load nested child groups`() {
        val rootDir = tempDir.toFile()
        
        // Parent group
        val parentDir = File(rootDir, "parent")
        parentDir.mkdirs()
        val parent = Group(id = "parent", name = "Parent Group")
        GroupYaml.writeGroup(parent, File(parentDir, "_group.yaml"))
        
        // Child group
        val childDir = File(parentDir, "child")
        childDir.mkdirs()
        val child = Group(id = "child", name = "Child Group")
        GroupYaml.writeGroup(child, File(childDir, "_group.yaml"))
        
        val loaded = GitYamlLoader.loadFromRoot(rootDir)
        
        assertThat(loaded).hasSize(1)
        assertThat(loaded[0].id).isEqualTo("parent")
        assertThat(loaded[0].children).hasSize(1)
        assertThat(loaded[0].children[0].id).isEqualTo("child")
    }

    @Test
    fun `should load multiple top-level groups`() {
        val rootDir = tempDir.toFile()
        
        val group1Dir = File(rootDir, "group1")
        group1Dir.mkdirs()
        GroupYaml.writeGroup(Group(id = "g1", name = "Group 1"), File(group1Dir, "_group.yaml"))
        
        val group2Dir = File(rootDir, "group2")
        group2Dir.mkdirs()
        GroupYaml.writeGroup(Group(id = "g2", name = "Group 2"), File(group2Dir, "_group.yaml"))
        
        val loaded = GitYamlLoader.loadFromRoot(rootDir)
        
        assertThat(loaded).hasSize(2)
        assertThat(loaded.map { it.id }).containsExactlyInAnyOrder("g1", "g2")
    }

    @Test
    fun `should skip directories without _group yaml`() {
        val rootDir = tempDir.toFile()
        
        val validDir = File(rootDir, "valid")
        validDir.mkdirs()
        GroupYaml.writeGroup(Group(id = "valid", name = "Valid"), File(validDir, "_group.yaml"))
        
        val invalidDir = File(rootDir, "invalid")
        invalidDir.mkdirs()
        // No _group.yaml file
        
        val loaded = GitYamlLoader.loadFromRoot(rootDir)
        
        assertThat(loaded).hasSize(1)
        assertThat(loaded[0].id).isEqualTo("valid")
    }

    @Test
    fun `should skip non-yaml files in prompts directory`() {
        val rootDir = tempDir.toFile()
        val groupDir = File(rootDir, "test-group")
        val promptsDir = File(groupDir, "prompts")
        promptsDir.mkdirs()
        
        GroupYaml.writeGroup(Group(id = "g1", name = "Test"), File(groupDir, "_group.yaml"))
        
        val validPrompt = Prompt(id = "valid", text = "Valid")
        PromptYaml.writePrompt(validPrompt, File(promptsDir, "p-valid.yaml"))
        
        // Create non-YAML files
        File(promptsDir, "readme.txt").writeText("Not a prompt")
        File(promptsDir, "data.json").writeText("{}")
        
        val loaded = GitYamlLoader.loadFromRoot(rootDir)
        
        assertThat(loaded[0].prompts).hasSize(1)
        assertThat(loaded[0].prompts[0].id).isEqualTo("valid")
    }
}

