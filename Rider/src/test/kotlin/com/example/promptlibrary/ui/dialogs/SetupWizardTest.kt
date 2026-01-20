package com.example.promptlibrary.ui.dialogs

import com.example.promptlibrary.settings.PluginSettingsService
import com.example.promptlibrary.sync.GitUtils
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

/**
 * Tests for the Setup Wizard functionality.
 * The Setup Wizard provides three flows:
 * 1. Clone from Git URL - clones a remote repo to a local path
 * 2. Use existing folder - uses an existing local folder (auto-detects git remote)
 * 3. Create new folder - creates a new local folder with default library structure
 */
class SetupWizardTest {

    @TempDir
    lateinit var tempDir: File

    @Test
    fun `validateGitUrl should accept SSH git URLs`() {
        // Given
        val sshUrl = "git@github.com:org/repo.git"

        // When
        val result = SetupWizardValidator.validateGitUrl(sshUrl)

        // Then
        assertThat(result).isNull() // null means valid
    }

    @Test
    fun `validateGitUrl should accept HTTPS git URLs`() {
        // Given
        val httpsUrl = "https://github.com/org/repo.git"

        // When
        val result = SetupWizardValidator.validateGitUrl(httpsUrl)

        // Then
        assertThat(result).isNull()
    }

    @Test
    fun `validateGitUrl should accept SSH URLs without git extension`() {
        // Given
        val sshUrl = "git@github.com:org/repo"

        // When
        val result = SetupWizardValidator.validateGitUrl(sshUrl)

        // Then
        assertThat(result).isNull()
    }

    @Test
    fun `validateGitUrl should reject empty URL`() {
        // Given
        val emptyUrl = ""

        // When
        val result = SetupWizardValidator.validateGitUrl(emptyUrl)

        // Then
        assertThat(result).isNotNull()
        assertThat(result).contains("required")
    }

    @Test
    fun `validateGitUrl should reject invalid URL format`() {
        // Given
        val invalidUrl = "not-a-valid-url"

        // When
        val result = SetupWizardValidator.validateGitUrl(invalidUrl)

        // Then
        assertThat(result).isNotNull()
        assertThat(result).contains("valid")
    }

    @Test
    fun `validateFolderName should accept valid folder names`() {
        // Given
        val validName = "PromptLibrary"

        // When
        val result = SetupWizardValidator.validateFolderName(validName)

        // Then
        assertThat(result).isNull()
    }

    @Test
    fun `validateFolderName should accept names with hyphens and underscores`() {
        // Given
        val validName = "my-prompt_library"

        // When
        val result = SetupWizardValidator.validateFolderName(validName)

        // Then
        assertThat(result).isNull()
    }

    @Test
    fun `validateFolderName should reject empty names`() {
        // Given
        val emptyName = ""

        // When
        val result = SetupWizardValidator.validateFolderName(emptyName)

        // Then
        assertThat(result).isNotNull()
        assertThat(result).contains("required")
    }

    @Test
    fun `validateFolderName should reject names with special characters`() {
        // Given
        val invalidName = "my/folder*name"

        // When
        val result = SetupWizardValidator.validateFolderName(invalidName)

        // Then
        assertThat(result).isNotNull()
    }

    @Test
    fun `createDefaultLibraryStructure should create library folder with group yaml`() {
        // Given
        val libraryPath = File(tempDir, "MyLibrary")

        // When
        val result = SetupWizardActions.createDefaultLibraryStructure(libraryPath)

        // Then
        assertThat(result.success).isTrue()
        assertThat(libraryPath.exists()).isTrue()
        
        val generalDir = File(libraryPath, "general/General")
        assertThat(generalDir.exists()).isTrue()
        
        val groupYaml = File(generalDir, "_group.yaml")
        assertThat(groupYaml.exists()).isTrue()
        assertThat(groupYaml.readText()).contains("name: General")
    }

    @Test
    fun `detectGitRemote should return null for non-git folder`() {
        // Given
        val nonGitFolder = File(tempDir, "not-a-git-repo")
        nonGitFolder.mkdirs()

        // When
        val result = SetupWizardActions.detectGitRemote(nonGitFolder)

        // Then
        assertThat(result).isNull()
    }
}

