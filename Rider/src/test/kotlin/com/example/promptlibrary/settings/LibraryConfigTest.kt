package com.example.promptlibrary.settings

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Path

class LibraryConfigTest {

    @Test
    fun `DEFAULT_LIBRARY_NAME should be general`() {
        assertThat(DEFAULT_LIBRARY_NAME).isEqualTo("general")
    }

    @Test
    fun `titleCase should convert simple string`() {
        assertThat(titleCase("general")).isEqualTo("General")
    }

    @Test
    fun `titleCase should convert hyphenated string`() {
        assertThat(titleCase("my-custom-library")).isEqualTo("My Custom Library")
    }

    @Test
    fun `titleCase should convert underscored string`() {
        assertThat(titleCase("data_science_prompts")).isEqualTo("Data Science Prompts")
    }

    @Test
    fun `titleCase should handle mixed separators`() {
        assertThat(titleCase("my-data_library")).isEqualTo("My Data Library")
    }

    @Test
    fun `titleCase should handle already capitalized words`() {
        assertThat(titleCase("API")).isEqualTo("API")
    }

    @Test
    fun `LibraryConfig should have sensible defaults`() {
        val config = LibraryConfig(
            id = "test",
            path = "test",
            displayName = "Test"
        )
        
        assertThat(config.enabled).isTrue()
        assertThat(config.color).isNull()
    }

    @Test
    fun `LibraryConfig should allow custom enabled state`() {
        val config = LibraryConfig(
            id = "test",
            path = "test",
            displayName = "Test",
            enabled = false
        )
        
        assertThat(config.enabled).isFalse()
    }

    @Test
    fun `LibraryConfig should allow custom color`() {
        val config = LibraryConfig(
            id = "test",
            path = "test",
            displayName = "Test",
            color = "#FF5733"
        )
        
        assertThat(config.color).isEqualTo("#FF5733")
    }

    @Test
    fun `RepoConfig should hold list of libraries`() {
        val libraries = listOf(
            LibraryConfig("lib1", "lib1", "Library 1"),
            LibraryConfig("lib2", "lib2", "Library 2")
        )
        
        val repoConfig = RepoConfig(
            url = "https://github.com/user/repo.git",
            localPath = "/path/to/repo",
            branch = "main",
            libraries = libraries
        )
        
        assertThat(repoConfig.libraries).hasSize(2)
        assertThat(repoConfig.libraries[0].id).isEqualTo("lib1")
        assertThat(repoConfig.libraries[1].id).isEqualTo("lib2")
    }

    @Test
    fun `discoverLibraries should return default for non-existent path`() {
        val libraries = discoverLibraries("/non/existent/path")
        
        assertThat(libraries).hasSize(1)
        assertThat(libraries[0].id).isEqualTo("general")
        assertThat(libraries[0].displayName).isEqualTo("General")
    }

    @Test
    fun `discoverLibraries should return default for empty directory`(@TempDir tempDir: Path) {
        val libraries = discoverLibraries(tempDir.toString())
        
        assertThat(libraries).hasSize(1)
        assertThat(libraries[0].id).isEqualTo("general")
    }

    @Test
    fun `discoverLibraries should find library with group yaml`(@TempDir tempDir: Path) {
        // Create a library structure: platform/API/_group.yaml
        val platformDir = File(tempDir.toFile(), "platform")
        platformDir.mkdir()
        val apiDir = File(platformDir, "API")
        apiDir.mkdir()
        File(apiDir, "_group.yaml").writeText("name: API\n")
        
        val libraries = discoverLibraries(tempDir.toString())
        
        assertThat(libraries).hasSize(1)
        assertThat(libraries[0].id).isEqualTo("platform")
        assertThat(libraries[0].displayName).isEqualTo("Platform")
        assertThat(libraries[0].enabled).isTrue()
    }

    @Test
    fun `discoverLibraries should find multiple libraries`(@TempDir tempDir: Path) {
        // Create two library structures
        listOf("platform", "analytics").forEach { libName ->
            val libDir = File(tempDir.toFile(), libName)
            libDir.mkdir()
            val groupDir = File(libDir, "TestGroup")
            groupDir.mkdir()
            File(groupDir, "_group.yaml").writeText("name: TestGroup\n")
        }
        
        val libraries = discoverLibraries(tempDir.toString())
        
        assertThat(libraries).hasSize(2)
        val ids = libraries.map { it.id }
        assertThat(ids).contains("platform", "analytics")
    }

    @Test
    fun `discoverLibraries should ignore hidden directories`(@TempDir tempDir: Path) {
        // Create a hidden library (should be ignored)
        val hiddenDir = File(tempDir.toFile(), ".hidden")
        hiddenDir.mkdir()
        val groupDir = File(hiddenDir, "Group")
        groupDir.mkdir()
        File(groupDir, "_group.yaml").writeText("name: Group\n")
        
        val libraries = discoverLibraries(tempDir.toString())
        
        // Should return default since no valid libraries found
        assertThat(libraries).hasSize(1)
        assertThat(libraries[0].id).isEqualTo("general")
    }

    @Test
    fun `discoverLibraries should ignore node_modules directory`(@TempDir tempDir: Path) {
        // Create a node_modules library (should be ignored)
        val nodeModulesDir = File(tempDir.toFile(), "node_modules")
        nodeModulesDir.mkdir()
        val groupDir = File(nodeModulesDir, "Group")
        groupDir.mkdir()
        File(groupDir, "_group.yaml").writeText("name: Group\n")

        val libraries = discoverLibraries(tempDir.toString())

        // Should return default since no valid libraries found
        assertThat(libraries).hasSize(1)
        assertThat(libraries[0].id).isEqualTo("general")
    }

    @Test
    fun `RepoConfig should filter enabled libraries`() {
        val libraries = listOf(
            LibraryConfig("lib1", "lib1", "Library 1", enabled = true),
            LibraryConfig("lib2", "lib2", "Library 2", enabled = false),
            LibraryConfig("lib3", "lib3", "Library 3", enabled = true)
        )

        val repoConfig = RepoConfig(
            url = "https://github.com/user/repo.git",
            localPath = "/path/to/repo",
            branch = "main",
            libraries = libraries
        )

        val enabledLibraries = repoConfig.libraries.filter { it.enabled }
        assertThat(enabledLibraries).hasSize(2)
        assertThat(enabledLibraries.map { it.id }).containsExactly("lib1", "lib3")
    }

    @Test
    fun `LibraryConfig should support all fields in copy`() {
        val original = LibraryConfig(
            id = "original",
            path = "/original/path",
            displayName = "Original",
            enabled = true,
            color = "#FF0000"
        )

        val copy = original.copy(enabled = false)

        assertThat(copy.id).isEqualTo("original")
        assertThat(copy.path).isEqualTo("/original/path")
        assertThat(copy.displayName).isEqualTo("Original")
        assertThat(copy.enabled).isFalse()
        assertThat(copy.color).isEqualTo("#FF0000")
    }

    @Test
    fun `discoverLibraries should find all libraries regardless of order`(@TempDir tempDir: Path) {
        // Create multiple libraries
        listOf("zebra", "apple", "monkey").forEach { libName ->
            val libDir = File(tempDir.toFile(), libName)
            libDir.mkdir()
            val groupDir = File(libDir, "Group")
            groupDir.mkdir()
            File(groupDir, "_group.yaml").writeText("name: Group\n")
        }

        val libraries = discoverLibraries(tempDir.toString())

        assertThat(libraries).hasSize(3)
        assertThat(libraries.map { it.id }).containsExactlyInAnyOrder("apple", "monkey", "zebra")
    }
}

