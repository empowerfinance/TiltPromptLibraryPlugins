package com.example.promptlibrary.sync

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.GroupKind
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.settings.LibraryConfig
import com.example.promptlibrary.yaml.GroupYaml
import com.example.promptlibrary.yaml.PromptYaml
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Nested
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

    @Nested
    inner class LoadFromLibraryTests {

        @Test
        fun `should load from specific library`() {
            val rootDir = tempDir.toFile()
            val libraryDir = File(rootDir, "platform")
            val groupDir = File(libraryDir, "API")
            groupDir.mkdirs()

            GroupYaml.writeGroup(Group(id = "api", name = "API"), File(groupDir, "_group.yaml"))

            val library = LibraryConfig(id = "platform", path = "platform", displayName = "Platform")
            val loaded = GitYamlLoader.loadFromLibrary(rootDir, library)

            assertThat(loaded).hasSize(1)
            assertThat(loaded[0].id).isEqualTo("api")
        }

        @Test
        fun `should return empty list for non-existent library path`() {
            val rootDir = tempDir.toFile()
            val library = LibraryConfig(id = "missing", path = "missing", displayName = "Missing")

            val loaded = GitYamlLoader.loadFromLibrary(rootDir, library)

            assertThat(loaded).isEmpty()
        }
    }

    @Nested
    inner class LoadFromLibrariesTests {

        @Test
        fun `should load from multiple libraries`() {
            val rootDir = tempDir.toFile()

            // Create platform library
            val platformDir = File(rootDir, "platform")
            val platformGroup = File(platformDir, "API")
            platformGroup.mkdirs()
            GroupYaml.writeGroup(Group(id = "api", name = "API"), File(platformGroup, "_group.yaml"))

            // Create analytics library
            val analyticsDir = File(rootDir, "analytics")
            val analyticsGroup = File(analyticsDir, "Reports")
            analyticsGroup.mkdirs()
            GroupYaml.writeGroup(Group(id = "reports", name = "Reports"), File(analyticsGroup, "_group.yaml"))

            val libraries = listOf(
                LibraryConfig(id = "platform", path = "platform", displayName = "Platform", enabled = true),
                LibraryConfig(id = "analytics", path = "analytics", displayName = "Analytics", enabled = true)
            )

            val loaded = GitYamlLoader.loadFromLibraries(rootDir, libraries)

            assertThat(loaded).hasSize(2)
            assertThat(loaded["platform"]).hasSize(1)
            assertThat(loaded["platform"]!![0].id).isEqualTo("api")
            assertThat(loaded["analytics"]).hasSize(1)
            assertThat(loaded["analytics"]!![0].id).isEqualTo("reports")
        }

        @Test
        fun `should only load from enabled libraries`() {
            val rootDir = tempDir.toFile()

            // Create two libraries
            listOf("enabled-lib", "disabled-lib").forEach { libName ->
                val libDir = File(rootDir, libName)
                val groupDir = File(libDir, "TestGroup")
                groupDir.mkdirs()
                GroupYaml.writeGroup(Group(id = "$libName-group", name = "TestGroup"), File(groupDir, "_group.yaml"))
            }

            val libraries = listOf(
                LibraryConfig(id = "enabled-lib", path = "enabled-lib", displayName = "Enabled", enabled = true),
                LibraryConfig(id = "disabled-lib", path = "disabled-lib", displayName = "Disabled", enabled = false)
            )

            val loaded = GitYamlLoader.loadFromLibraries(rootDir, libraries)

            assertThat(loaded).hasSize(1)
            assertThat(loaded.keys).containsExactly("enabled-lib")
        }

        @Test
        fun `should return empty map when no libraries enabled`() {
            val rootDir = tempDir.toFile()

            val libraries = listOf(
                LibraryConfig(id = "lib1", path = "lib1", displayName = "Lib 1", enabled = false),
                LibraryConfig(id = "lib2", path = "lib2", displayName = "Lib 2", enabled = false)
            )

            val loaded = GitYamlLoader.loadFromLibraries(rootDir, libraries)

            assertThat(loaded).isEmpty()
        }

        @Test
        fun `should handle library load failures gracefully`() {
            val rootDir = tempDir.toFile()

            // Create one valid library
            val validDir = File(rootDir, "valid")
            val validGroup = File(validDir, "TestGroup")
            validGroup.mkdirs()
            GroupYaml.writeGroup(Group(id = "valid-group", name = "Valid"), File(validGroup, "_group.yaml"))

            // Don't create the "missing" library directory

            val libraries = listOf(
                LibraryConfig(id = "valid", path = "valid", displayName = "Valid", enabled = true),
                LibraryConfig(id = "missing", path = "missing", displayName = "Missing", enabled = true)
            )

            val loaded = GitYamlLoader.loadFromLibraries(rootDir, libraries)

            assertThat(loaded).hasSize(2)
            assertThat(loaded["valid"]).hasSize(1)
            assertThat(loaded["missing"]).isEmpty() // Empty list, not null
        }

        @Test
        fun `should return empty map for empty library list`() {
            val rootDir = tempDir.toFile()

            val loaded = GitYamlLoader.loadFromLibraries(rootDir, emptyList())

            assertThat(loaded).isEmpty()
        }
    }
}

