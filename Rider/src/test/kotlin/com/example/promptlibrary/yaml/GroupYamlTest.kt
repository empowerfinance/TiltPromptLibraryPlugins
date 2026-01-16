package com.example.promptlibrary.yaml

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.GroupKind
import com.example.promptlibrary.model.Prompt
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Path

class GroupYamlTest {

    @TempDir
    lateinit var tempDir: Path

    @Test
    fun `should write and read group with all fields`() {
        val group = Group(
            id = "group-123",
            name = "Test Group",
            kind = GroupKind.TEAM,
            description = "A test group",
            tags = listOf("shared", "important"),
            children = emptyList(),
            prompts = emptyList()
        )
        
        val file = tempDir.resolve("group.yaml").toFile()
        
        GroupYaml.writeGroup(group, file)
        val loaded = GroupYaml.readGroup(file)
        
        assertThat(loaded).isEqualTo(group)
    }

    @Test
    fun `should write and read group with minimal fields`() {
        val group = Group(id = "minimal", name = "Minimal Group")
        val file = tempDir.resolve("minimal.yaml").toFile()
        
        GroupYaml.writeGroup(group, file)
        val loaded = GroupYaml.readGroup(file)
        
        assertThat(loaded.id).isEqualTo("minimal")
        assertThat(loaded.name).isEqualTo("Minimal Group")
        assertThat(loaded.kind).isEqualTo(GroupKind.GENERAL)
    }

    @Test
    fun `should handle all GroupKind values`() {
        val kinds = listOf(
            GroupKind.ORG,
            GroupKind.TEAM,
            GroupKind.POD,
            GroupKind.COLLECTION,
            GroupKind.GENERAL
        )
        
        kinds.forEachIndexed { index, kind ->
            val group = Group(id = "kind-$index", name = "Group $index", kind = kind)
            val file = tempDir.resolve("kind-$index.yaml").toFile()
            
            GroupYaml.writeGroup(group, file)
            val loaded = GroupYaml.readGroup(file)
            
            assertThat(loaded.kind).isEqualTo(kind)
        }
    }

    @Test
    fun `should handle null description`() {
        val group = Group(id = "no-desc", name = "No Description", description = null)
        val file = tempDir.resolve("no-desc.yaml").toFile()
        
        GroupYaml.writeGroup(group, file)
        val loaded = GroupYaml.readGroup(file)
        
        assertThat(loaded.description).isNull()
    }

    @Test
    fun `should handle empty tags`() {
        val group = Group(id = "no-tags", name = "No Tags", tags = emptyList())
        val file = tempDir.resolve("no-tags.yaml").toFile()
        
        GroupYaml.writeGroup(group, file)
        val loaded = GroupYaml.readGroup(file)
        
        assertThat(loaded.tags).isEmpty()
    }

    @Test
    fun `should handle multiple tags`() {
        val group = Group(
            id = "tagged",
            name = "Tagged Group",
            tags = listOf("tag1", "tag2", "tag3")
        )
        val file = tempDir.resolve("tagged.yaml").toFile()
        
        GroupYaml.writeGroup(group, file)
        val loaded = GroupYaml.readGroup(file)
        
        assertThat(loaded.tags).containsExactly("tag1", "tag2", "tag3")
    }

    @Test
    fun `should handle empty children list`() {
        val group = Group(id = "no-children", name = "No Children", children = emptyList())
        val file = tempDir.resolve("no-children.yaml").toFile()
        
        GroupYaml.writeGroup(group, file)
        val loaded = GroupYaml.readGroup(file)
        
        assertThat(loaded.children).isEmpty()
    }

    @Test
    fun `should handle empty prompts list`() {
        val group = Group(id = "no-prompts", name = "No Prompts", prompts = emptyList())
        val file = tempDir.resolve("no-prompts.yaml").toFile()
        
        GroupYaml.writeGroup(group, file)
        val loaded = GroupYaml.readGroup(file)
        
        assertThat(loaded.prompts).isEmpty()
    }

    @Test
    fun `should create parent directories if needed`() {
        val nestedFile = tempDir.resolve("nested/path/group.yaml").toFile()
        val group = Group(id = "nested", name = "Nested Group")
        
        GroupYaml.writeGroup(group, nestedFile)
        
        assertThat(nestedFile).exists()
        assertThat(GroupYaml.readGroup(nestedFile)).isEqualTo(group)
    }

    @Test
    fun `should produce deterministic output`() {
        val group = Group(id = "det", name = "Deterministic")
        val file1 = tempDir.resolve("det1.yaml").toFile()
        val file2 = tempDir.resolve("det2.yaml").toFile()
        
        GroupYaml.writeGroup(group, file1)
        GroupYaml.writeGroup(group, file2)
        
        assertThat(file1.readText()).isEqualTo(file2.readText())
    }

    @Test
    fun `should handle special characters in name and description`() {
        val group = Group(
            id = "special",
            name = "Group: With \"Quotes\" and 'Apostrophes'",
            description = "Description with: colons, \"quotes\", and more"
        )
        val file = tempDir.resolve("special.yaml").toFile()
        
        GroupYaml.writeGroup(group, file)
        val loaded = GroupYaml.readGroup(file)
        
        assertThat(loaded.name).isEqualTo(group.name)
        assertThat(loaded.description).isEqualTo(group.description)
    }
}

