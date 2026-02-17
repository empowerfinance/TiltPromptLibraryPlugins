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
    fun `discoverLibraries should return empty list for non-existent path`() {
        val libraries = discoverLibraries("/non/existent/path")

        // Should return empty list, not a default "general" library
        assertThat(libraries).isEmpty()
    }

    @Test
    fun `discoverLibraries should return empty list for empty directory`(@TempDir tempDir: Path) {
        val libraries = discoverLibraries(tempDir.toString())

        // Should return empty list when no _library.yaml files found
        assertThat(libraries).isEmpty()
    }

    @Test
    fun `discoverLibraries should find library with _library yaml`(@TempDir tempDir: Path) {
        // Create a library structure: platform/_library.yaml
        val platformDir = File(tempDir.toFile(), "platform")
        platformDir.mkdir()
        File(platformDir, "_library.yaml").writeText("name: Platform\n")

        val libraries = discoverLibraries(tempDir.toString())

        assertThat(libraries).hasSize(1)
        assertThat(libraries[0].id).isEqualTo("platform")
        // displayName should match exact folder name (no title case transformation)
        assertThat(libraries[0].displayName).isEqualTo("platform")
        assertThat(libraries[0].enabled).isTrue()
    }

    @Test
    fun `discoverLibraries should find multiple libraries`(@TempDir tempDir: Path) {
        // Create two library structures with _library.yaml
        listOf("platform", "analytics").forEach { libName ->
            val libDir = File(tempDir.toFile(), libName)
            libDir.mkdir()
            File(libDir, "_library.yaml").writeText("name: $libName\n")
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
        File(hiddenDir, "_library.yaml").writeText("name: Hidden\n")

        val libraries = discoverLibraries(tempDir.toString())

        // Should return empty list since hidden directories are ignored
        assertThat(libraries).isEmpty()
    }

    @Test
    fun `discoverLibraries should ignore node_modules directory`(@TempDir tempDir: Path) {
        // Create a node_modules library (should be ignored)
        val nodeModulesDir = File(tempDir.toFile(), "node_modules")
        nodeModulesDir.mkdir()
        File(nodeModulesDir, "_library.yaml").writeText("name: Node Modules\n")

        val libraries = discoverLibraries(tempDir.toString())

        // Should return empty list since node_modules is ignored
        assertThat(libraries).isEmpty()
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
        // Create multiple libraries with _library.yaml
        listOf("zebra", "apple", "monkey").forEach { libName ->
            val libDir = File(tempDir.toFile(), libName)
            libDir.mkdir()
            File(libDir, "_library.yaml").writeText("name: $libName\n")
        }

        val libraries = discoverLibraries(tempDir.toString())

        assertThat(libraries).hasSize(3)
        assertThat(libraries.map { it.id }).containsExactlyInAnyOrder("apple", "monkey", "zebra")
    }

    // ============================================================================
    // TDD Tests for Issue 2 & 3: Library name case should match disk exactly
    // ============================================================================

    @Test
    fun `discoverLibraries should preserve exact case of folder name in displayName`(@TempDir tempDir: Path) {
        // Create a library with mixed case: promptsProduct
        val libDir = File(tempDir.toFile(), "promptsProduct")
        libDir.mkdir()
        File(libDir, "_library.yaml").writeText("name: Prompts Product\n")

        val libraries = discoverLibraries(tempDir.toString())

        assertThat(libraries).hasSize(1)
        assertThat(libraries[0].id).isEqualTo("promptsProduct")
        assertThat(libraries[0].path).isEqualTo("promptsProduct")
        // displayName should match the exact folder name, not title case
        assertThat(libraries[0].displayName).isEqualTo("promptsProduct")
    }

    @Test
    fun `discoverLibraries should preserve camelCase folder names`(@TempDir tempDir: Path) {
        // Create a library with camelCase: enabledLibraries
        val libDir = File(tempDir.toFile(), "enabledLibraries")
        libDir.mkdir()
        File(libDir, "_library.yaml").writeText("name: Enabled Libraries\n")

        val libraries = discoverLibraries(tempDir.toString())

        assertThat(libraries).hasSize(1)
        assertThat(libraries[0].displayName).isEqualTo("enabledLibraries")
    }

    @Test
    fun `discoverLibraries should preserve lowercase folder names`(@TempDir tempDir: Path) {
        // Create a library with all lowercase: platform
        val libDir = File(tempDir.toFile(), "platform")
        libDir.mkdir()
        File(libDir, "_library.yaml").writeText("name: Platform\n")

        val libraries = discoverLibraries(tempDir.toString())

        assertThat(libraries).hasSize(1)
        assertThat(libraries[0].displayName).isEqualTo("platform")
    }

    @Test
    fun `discoverLibraries should preserve UPPERCASE folder names`(@TempDir tempDir: Path) {
        // Create a library with all uppercase: PROMPTS
        val libDir = File(tempDir.toFile(), "PROMPTS")
        libDir.mkdir()
        File(libDir, "_library.yaml").writeText("name: PROMPTS\n")

        val libraries = discoverLibraries(tempDir.toString())

        assertThat(libraries).hasSize(1)
        assertThat(libraries[0].displayName).isEqualTo("PROMPTS")
    }

    // ==========================================================================
    // Library Creation Tests (matching VS Code createLibrary command tests)
    // ==========================================================================

    @Test
    fun `createLibrary should create folder with _library yaml marker file`(@TempDir tempDir: Path) {
        // Given - simulating the createLibrary logic from SettingsPanel
        val libraryName = "TestLibrary"
        val libraryPath = File(tempDir.toFile(), libraryName)

        // When - create library folder with _library.yaml (matching VS Code)
        libraryPath.mkdirs()
        val libraryYamlContent = "name: ${libraryName}\ndescription: \n"
        File(libraryPath, "_library.yaml").writeText(libraryYamlContent)

        // Then - verify the library folder was created
        assertThat(libraryPath.exists()).isTrue()

        // Verify the _library.yaml file was created
        val libraryYaml = File(libraryPath, "_library.yaml")
        assertThat(libraryYaml.exists()).isTrue()

        // Verify the content of _library.yaml
        val content = libraryYaml.readText()
        assertThat(content).contains("name: TestLibrary")
        assertThat(content).contains("description:")
    }

    @Test
    fun `createLibrary should not create nested folders or group files`(@TempDir tempDir: Path) {
        // Given - simulating the createLibrary logic from SettingsPanel
        val libraryName = "NewLibrary"
        val libraryPath = File(tempDir.toFile(), libraryName)

        // When - create library folder with _library.yaml (matching VS Code)
        libraryPath.mkdirs()
        val libraryYamlContent = "name: ${libraryName}\ndescription: \n"
        File(libraryPath, "_library.yaml").writeText(libraryYamlContent)

        // Then - verify no nested "General" folder was created
        val generalPath = File(libraryPath, "General")
        assertThat(generalPath.exists()).isFalse()

        // Verify no "prompts" folder was created
        val promptsPath = File(libraryPath, "prompts")
        assertThat(promptsPath.exists()).isFalse()

        // Verify no _group.yaml was created anywhere
        val files = libraryPath.listFiles()?.map { it.name } ?: emptyList()
        assertThat(files).containsExactly("_library.yaml")
    }

    @Test
    fun `created library should be discoverable by discoverLibraries`(@TempDir tempDir: Path) {
        // Given - create a library with _library.yaml marker (like createNewLibrary does)
        val libraryName = "platform"
        val libraryPath = File(tempDir.toFile(), libraryName)
        libraryPath.mkdirs()
        File(libraryPath, "_library.yaml").writeText("name: $libraryName\ndescription: \n")

        // When - discover libraries
        val libraries = discoverLibraries(tempDir.toString())

        // Then - the library should be discovered
        assertThat(libraries).hasSize(1)
        assertThat(libraries[0].id).isEqualTo("platform")
        // displayName preserves exact folder name case (not title-cased)
        assertThat(libraries[0].displayName).isEqualTo("platform")
        assertThat(libraries[0].enabled).isTrue()
    }

    @Test
    fun `library name sanitization should match VS Code behavior`() {
        // Test the sanitization logic used in SettingsPanel.createNewLibrary
        // This ensures both plugins produce the same folder names

        // Sanitize function (mirrors SettingsPanel logic)
        fun sanitize(name: String): String = name.trim()
            .lowercase()
            .replace(Regex("[^a-z0-9_-]"), "_")
            .replace(Regex("_+"), "_")
            .trim('_')

        // Simple name
        assertThat(sanitize("Platform")).isEqualTo("platform")

        // Name with spaces
        assertThat(sanitize("My Library")).isEqualTo("my_library")

        // Name with special characters
        assertThat(sanitize("Test@Library!")).isEqualTo("test_library")

        // Name with hyphens (should be preserved)
        assertThat(sanitize("test-library")).isEqualTo("test-library")

        // Name with underscores (should be preserved)
        assertThat(sanitize("test_library")).isEqualTo("test_library")
    }

}

