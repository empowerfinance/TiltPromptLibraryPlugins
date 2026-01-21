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

class GitYamlWriterTest {

    @TempDir
    lateinit var tempDir: Path

    @Test
    fun `should write empty groups list`() {
        val rootDir = tempDir.resolve("repo").toFile()

        val (added, updated, deleted) = GitYamlWriter.writeSharedGroups(rootDir, emptyList())

        assertThat(rootDir).exists()
        // Should contain only _library.yaml marker file
        val files = rootDir.listFiles()?.filter { it.name != "_library.yaml" } ?: emptyList()
        assertThat(files).isEmpty()
        // _library.yaml is created, so 1 file added
        assertThat(added).isEqualTo(1)
        assertThat(updated).isEqualTo(0)
        assertThat(deleted).isEqualTo(0)
        // Verify _library.yaml was created
        assertThat(File(rootDir, "_library.yaml")).exists()
    }

    @Test
    fun `should create _library_yaml marker file when it does not exist`() {
        val rootDir = tempDir.resolve("repo").toFile()
        val group = Group(id = "g1", name = "Test Group")

        GitYamlWriter.writeSharedGroups(rootDir, listOf(group))

        // _library.yaml should be created in the root directory
        val libraryYaml = File(rootDir, "_library.yaml")
        assertThat(libraryYaml).exists()
        // Should contain sensible default content
        val content = libraryYaml.readText()
        assertThat(content).contains("name:")
    }

    @Test
    fun `should preserve existing _library_yaml content after write`() {
        val rootDir = tempDir.resolve("repo").toFile()
        rootDir.mkdirs()
        // First, create a _library.yaml with custom content
        val customContent = "name: MyCustomLibrary\ndescription: Custom description\n"
        File(rootDir, "_library.yaml").writeText(customContent)

        val group = Group(id = "g1", name = "Test Group")
        GitYamlWriter.writeSharedGroups(rootDir, listOf(group))

        // _library.yaml should still exist
        val libraryYaml = File(rootDir, "_library.yaml")
        assertThat(libraryYaml).exists()
        // Should preserve the original content
        assertThat(libraryYaml.readText()).isEqualTo(customContent)
    }

    @Test
    fun `should write single group with no prompts`() {
        val rootDir = tempDir.resolve("repo").toFile()
        val group = Group(id = "g1", name = "Test Group")

        val (added, updated, deleted) = GitYamlWriter.writeSharedGroups(rootDir, listOf(group))

        val groupDir = File(rootDir, "Test-Group")
        assertThat(groupDir).exists()
        assertThat(File(groupDir, "_group.yaml")).exists()
        // prompts/ subdirectory should NOT exist (flat structure)
        assertThat(File(groupDir, "prompts")).doesNotExist()
        assertThat(added).isGreaterThan(0)
    }

    @Test
    fun `should sanitize group names`() {
        val rootDir = tempDir.resolve("repo").toFile()
        val group = Group(id = "g1", name = "Test: Group / With Special!")
        
        GitYamlWriter.writeSharedGroups(rootDir, listOf(group))
        
        val groupDir = File(rootDir, "Test--Group---With-Special-")
        assertThat(groupDir).exists()
    }

    @Test
    fun `should write group with prompts`() {
        val rootDir = tempDir.resolve("repo").toFile()
        val prompt1 = Prompt(id = "p1", text = "Prompt 1")
        val prompt2 = Prompt(id = "p2", text = "Prompt 2")
        val group = Group(id = "g1", name = "Test", prompts = listOf(prompt1, prompt2))

        GitYamlWriter.writeSharedGroups(rootDir, listOf(group))

        // Prompts should be directly in group folder (no prompts/ subdirectory)
        val groupDir = File(rootDir, "Test")
        assertThat(File(groupDir, "p-p1.yaml")).exists()
        assertThat(File(groupDir, "p-p2.yaml")).exists()
    }

    @Test
    fun `should strip private flag from prompts`() {
        val rootDir = tempDir.resolve("repo").toFile()
        val privatePrompt = Prompt(id = "p1", text = "Private", isPrivate = true)
        val group = Group(id = "g1", name = "Test", prompts = listOf(privatePrompt))

        GitYamlWriter.writeSharedGroups(rootDir, listOf(group))

        // Prompt should be directly in group folder
        val promptFile = File(rootDir, "Test/p-p1.yaml")
        val loaded = PromptYaml.readPrompt(promptFile)
        assertThat(loaded.isPrivate).isFalse()
    }

    @Test
    fun `should NOT write nested child groups (groups are flat)`() {
        val rootDir = tempDir.resolve("repo").toFile()
        // Even if children are provided, they should be ignored - groups are flat
        val child = Group(id = "child", name = "Child")
        val parent = Group(id = "parent", name = "Parent", children = listOf(child))

        GitYamlWriter.writeSharedGroups(rootDir, listOf(parent))

        // Parent should exist
        assertThat(File(rootDir, "Parent/_group.yaml")).exists()
        // Child should NOT exist - nested groups are not supported
        assertThat(File(rootDir, "Parent/Child/_group.yaml")).doesNotExist()
    }

    @Test
    fun `should write multiple top-level groups`() {
        val rootDir = tempDir.resolve("repo").toFile()
        val group1 = Group(id = "g1", name = "Group1")
        val group2 = Group(id = "g2", name = "Group2")
        
        GitYamlWriter.writeSharedGroups(rootDir, listOf(group1, group2))
        
        assertThat(File(rootDir, "Group1/_group.yaml")).exists()
        assertThat(File(rootDir, "Group2/_group.yaml")).exists()
    }

    @Test
    fun `should clean rewrite on subsequent calls`() {
        val rootDir = tempDir.resolve("repo").toFile()
        
        // First write
        val group1 = Group(id = "g1", name = "Group1")
        GitYamlWriter.writeSharedGroups(rootDir, listOf(group1))
        assertThat(File(rootDir, "Group1")).exists()
        
        // Second write with different group
        val group2 = Group(id = "g2", name = "Group2")
        GitYamlWriter.writeSharedGroups(rootDir, listOf(group2))
        
        assertThat(File(rootDir, "Group1")).doesNotExist()
        assertThat(File(rootDir, "Group2")).exists()
    }

    @Test
    fun `should track added files correctly`() {
        val rootDir = tempDir.resolve("repo").toFile()
        val group = Group(id = "g1", name = "Test", prompts = listOf(Prompt(id = "p1", text = "Text")))

        val (added, _, _) = GitYamlWriter.writeSharedGroups(rootDir, listOf(group))

        // Should have: _library.yaml + _group.yaml + p-p1.yaml = 3 files
        assertThat(added).isEqualTo(3)
    }

    @Test
    fun `should track updated files correctly`() {
        val rootDir = tempDir.resolve("repo").toFile()
        val prompt = Prompt(id = "p1", text = "Original")
        val group = Group(id = "g1", name = "Test", prompts = listOf(prompt))
        
        // First write
        GitYamlWriter.writeSharedGroups(rootDir, listOf(group))
        
        // Second write with updated prompt
        val updatedPrompt = prompt.copy(text = "Updated")
        val updatedGroup = group.copy(prompts = listOf(updatedPrompt))
        val (added, updated, deleted) = GitYamlWriter.writeSharedGroups(rootDir, listOf(updatedGroup))
        
        assertThat(added).isEqualTo(0)
        assertThat(updated).isEqualTo(1) // p-p1.yaml changed
        assertThat(deleted).isEqualTo(0)
    }

    @Test
    fun `should track deleted files correctly`() {
        val rootDir = tempDir.resolve("repo").toFile()
        val prompt = Prompt(id = "p1", text = "Text")
        val group = Group(id = "g1", name = "Test", prompts = listOf(prompt))
        
        // First write with prompt
        GitYamlWriter.writeSharedGroups(rootDir, listOf(group))
        
        // Second write without prompt
        val emptyGroup = group.copy(prompts = emptyList())
        val (added, updated, deleted) = GitYamlWriter.writeSharedGroups(rootDir, listOf(emptyGroup))
        
        assertThat(added).isEqualTo(0)
        assertThat(updated).isEqualTo(0)
        assertThat(deleted).isEqualTo(1) // p-p1.yaml removed
    }

    @Test
    fun `should not include prompts and children in group yaml`() {
        val rootDir = tempDir.resolve("repo").toFile()
        val child = Group(id = "child", name = "Child")
        val prompt = Prompt(id = "p1", text = "Text")
        val group = Group(id = "g1", name = "Test", children = listOf(child), prompts = listOf(prompt))
        
        GitYamlWriter.writeSharedGroups(rootDir, listOf(group))
        
        val groupFile = File(rootDir, "Test/_group.yaml")
        val loaded = GroupYaml.readGroup(groupFile)
        
        assertThat(loaded.children).isEmpty()
        assertThat(loaded.prompts).isEmpty()
    }

    @Test
    fun `should NOT write nested structure (groups are flat)`() {
        val rootDir = tempDir.resolve("repo").toFile()

        // Even with nested children provided, only top-level group should be written
        val grandchild = Group(id = "gc", name = "Grandchild", prompts = listOf(Prompt(id = "p3", text = "Text 3")))
        val child = Group(id = "c", name = "Child", children = listOf(grandchild), prompts = listOf(Prompt(id = "p2", text = "Text 2")))
        val parent = Group(id = "p", name = "Parent", children = listOf(child), prompts = listOf(Prompt(id = "p1", text = "Text 1")))

        GitYamlWriter.writeSharedGroups(rootDir, listOf(parent))

        // Only parent group should exist (with its prompts)
        assertThat(File(rootDir, "Parent/_group.yaml")).exists()
        assertThat(File(rootDir, "Parent/p-p1.yaml")).exists()
        // Nested groups should NOT exist - groups are flat
        assertThat(File(rootDir, "Parent/Child/_group.yaml")).doesNotExist()
        assertThat(File(rootDir, "Parent/Child/p-p2.yaml")).doesNotExist()
        assertThat(File(rootDir, "Parent/Child/Grandchild/_group.yaml")).doesNotExist()
        assertThat(File(rootDir, "Parent/Child/Grandchild/p-p3.yaml")).doesNotExist()
    }
}

