package com.example.promptlibrary.settings

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.io.File

class PluginSettingsTest {
    
    @Test
    fun `expandPath should expand tilde to home directory`() {
        // Given
        val homeDir = System.getProperty("user.home")
        
        // When
        val result = PluginSettingsService.expandPath("~/my-repo")
        
        // Then
        assertThat(result).isEqualTo(File(homeDir, "my-repo").absolutePath)
    }
    
    @Test
    fun `expandPath should expand tilde with subdirectory`() {
        // Given
        val homeDir = System.getProperty("user.home")
        
        // When
        val result = PluginSettingsService.expandPath("~/projects/my-repo")
        
        // Then
        assertThat(result).isEqualTo(File(homeDir, "projects/my-repo").absolutePath)
    }
    
    @Test
    fun `expandPath should expand tilde alone to home directory`() {
        // Given
        val homeDir = System.getProperty("user.home")
        
        // When
        val result = PluginSettingsService.expandPath("~")
        
        // Then
        assertThat(result).isEqualTo(homeDir)
    }
    
    @Test
    fun `expandPath should not expand tilde in middle of path`() {
        // Given
        val path = "/path/to/~/repo"
        
        // When
        val result = PluginSettingsService.expandPath(path)
        
        // Then
        assertThat(result).isEqualTo(path)
    }
    
    @Test
    fun `expandPath should not modify absolute paths`() {
        // Given
        val path = "/absolute/path/to/repo"
        
        // When
        val result = PluginSettingsService.expandPath(path)
        
        // Then
        assertThat(result).isEqualTo(path)
    }
    
    @Test
    fun `expandPath should not modify relative paths`() {
        // Given
        val path = "relative/path/to/repo"
        
        // When
        val result = PluginSettingsService.expandPath(path)
        
        // Then
        assertThat(result).isEqualTo(path)
    }
    
    @Test
    fun `expandPath should handle empty string`() {
        // Given
        val path = ""
        
        // When
        val result = PluginSettingsService.expandPath(path)
        
        // Then
        assertThat(result).isEqualTo("")
    }
    
    @Test
    fun `default settings should match VS Code defaults`() {
        // Given
        val state = PluginSettingsService.State()

        // Then - Match VS Code package.json defaults
        assertThat(state.remoteRepoUrl).isEqualTo("")
        assertThat(state.repoPath).isEqualTo("~/PromptLibrary")
        assertThat(state.promptsSubdir).isEqualTo("general") // Changed from "prompts" to "general"
        assertThat(state.branchName).isEqualTo("")
        assertThat(state.writeStrategy).isEqualTo(PluginSettingsService.WriteStrategy.DIRECT)
        assertThat(state.autoFetchEnabled).isEqualTo(false)
        assertThat(state.autoFetchMinutes).isEqualTo(5)
    }
    
    @Test
    fun `effective repo path logic should expand tilde`() {
        // Given
        val rawPath = "~/test-repo"
        val homeDir = System.getProperty("user.home")

        // When - Simulate the logic from getEffectiveRepoPath
        val trimmed = rawPath.trim()
        val result = if (trimmed.isNotEmpty()) PluginSettingsService.expandPath(trimmed) else ""

        // Then
        assertThat(result).isEqualTo(File(homeDir, "test-repo").absolutePath)
    }

    @Test
    fun `effective repo path logic should return empty string for blank path`() {
        // Given
        val rawPath = ""

        // When - Simulate the logic from getEffectiveRepoPath
        val trimmed = rawPath.trim()
        val result = if (trimmed.isNotEmpty()) PluginSettingsService.expandPath(trimmed) else ""

        // Then
        assertThat(result).isEqualTo("")
    }

    @Test
    fun `effective repo path logic should trim whitespace`() {
        // Given
        val rawPath = "  ~/test-repo  "
        val homeDir = System.getProperty("user.home")

        // When - Simulate the logic from getEffectiveRepoPath
        val trimmed = rawPath.trim()
        val result = if (trimmed.isNotEmpty()) PluginSettingsService.expandPath(trimmed) else ""

        // Then
        assertThat(result).isEqualTo(File(homeDir, "test-repo").absolutePath)
    }
    
    @Test
    fun `WriteStrategy enum should match VS Code values`() {
        // VS Code uses 'direct' and 'branchPR'
        // Rider uses DIRECT and BRANCH_PR (enum naming convention)
        assertThat(PluginSettingsService.WriteStrategy.DIRECT.name).isEqualTo("DIRECT")
        assertThat(PluginSettingsService.WriteStrategy.BRANCH_PR.name).isEqualTo("BRANCH_PR")
    }

    @Test
    fun `default settings should have empty hiddenLibraries list`() {
        // Given
        val state = PluginSettingsService.State()

        // Then - hiddenLibraries should be empty by default (opt-out approach)
        assertThat(state.hiddenLibraries).isEmpty()
    }

    @Test
    fun `hiddenLibraries should be mutable`() {
        // Given
        val state = PluginSettingsService.State()

        // When
        state.hiddenLibraries.add("library1")
        state.hiddenLibraries.add("library2")

        // Then
        assertThat(state.hiddenLibraries).containsExactly("library1", "library2")
    }

    @Test
    fun `hiddenLibraries can be replaced`() {
        // Given
        val state = PluginSettingsService.State()
        state.hiddenLibraries = mutableListOf("old-library")

        // When
        state.hiddenLibraries = mutableListOf("new-library1", "new-library2")

        // Then
        assertThat(state.hiddenLibraries).containsExactly("new-library1", "new-library2")
    }
}

