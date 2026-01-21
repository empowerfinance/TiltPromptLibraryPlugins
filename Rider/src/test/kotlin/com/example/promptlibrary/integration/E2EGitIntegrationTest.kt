package com.example.promptlibrary.integration

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.settings.discoverLibraries
import com.example.promptlibrary.sync.GitYamlLoader
import com.example.promptlibrary.sync.GitYamlWriter
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.*
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * End-to-end integration tests that verify the Rider plugin works correctly
 * with a real Git repository: git@github.com:empowerfinance/TiltPromptLibraryE2ETestRepo.git
 * 
 * These tests:
 * 1. Clone the E2E test repository
 * 2. Perform plugin operations (create groups, prompts, etc.)
 * 3. Verify file system state
 * 4. Verify git state (commits, push status)
 * 5. Clean up by resetting the repo
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
class E2EGitIntegrationTest {

    companion object {
        private const val E2E_REPO_URL = "git@github.com:empowerfinance/TiltPromptLibraryE2ETestRepo.git"
        private const val TEST_LIBRARY = "TestLibrary"
    }

    private lateinit var tempDir: File
    private lateinit var repoDir: File
    private lateinit var libraryDir: File

    @BeforeAll
    fun setup() {
        // Create a temp directory for the test
        tempDir = File(System.getProperty("java.io.tmpdir"), "e2e-test-${System.currentTimeMillis()}")
        tempDir.mkdirs()

        // Clone the E2E test repository
        repoDir = File(tempDir, "e2e-repo")
        val cloneResult = runGit(tempDir, "clone", E2E_REPO_URL, repoDir.name)
        assertThat(cloneResult.exitCode).withFailMessage("Clone failed: ${cloneResult.stderr}").isEqualTo(0)

        libraryDir = File(repoDir, TEST_LIBRARY)
        assertThat(libraryDir).exists()
        assertThat(File(libraryDir, "_library.yaml")).exists()
    }

    @AfterAll
    fun cleanup() {
        // Reset the repo to clean state (remove any test artifacts)
        if (::repoDir.isInitialized && repoDir.exists()) {
            runGit(repoDir, "checkout", "main")
            runGit(repoDir, "reset", "--hard", "origin/main")
            runGit(repoDir, "clean", "-fd")
        }
        // Clean up temp directory
        if (::tempDir.isInitialized && tempDir.exists()) {
            tempDir.deleteRecursively()
        }
    }

    // ============================================================
    // Test 1: Library Detection
    // ============================================================

    @Test
    @Order(1)
    fun `should detect library via _library_yaml marker file`() {
        val libraries = discoverLibraries(repoDir.absolutePath)

        assertThat(libraries).isNotEmpty()
        assertThat(libraries.map { it.id }).contains(TEST_LIBRARY)
    }

    @Test
    @Order(2)
    fun `should load existing library structure correctly`() {
        val groups = GitYamlLoader.loadFromRoot(libraryDir)

        assertThat(groups).isNotEmpty()
        assertThat(groups.map { it.name }).contains("SampleGroup")

        val sampleGroup = groups.first { it.name == "SampleGroup" }
        assertThat(sampleGroup.prompts).isNotEmpty()
    }

    // ============================================================
    // Test 2: Group Creation - Write to Disk Immediately
    // ============================================================

    @Test
    @Order(10)
    fun `should write new group to disk immediately`() {
        val testGroupName = "E2E-Test-Group-${UUID.randomUUID().toString().take(8)}"
        val newGroup = Group(
            id = UUID.randomUUID().toString(),
            name = testGroupName,
            tags = listOf("shared")
        )
        
        // Write the group to disk using the same method the plugin uses
        GitYamlWriter.ensureGroupOnDisk(repoDir, TEST_LIBRARY, listOf(testGroupName), newGroup)
        
        // Verify it exists on disk immediately
        val groupDir = File(libraryDir, testGroupName)
        assertThat(groupDir).exists()
        assertThat(File(groupDir, "_group.yaml")).exists()
        
        // Clean up
        groupDir.deleteRecursively()
    }

    // ============================================================
    // Test 3: Prompt Creation - Write to Disk Immediately
    // ============================================================
    
    @Test
    @Order(20)
    fun `should write new prompt to disk immediately`() {
        val testGroupName = "E2E-Prompt-Test-${UUID.randomUUID().toString().take(8)}"
        val promptId = "p-${UUID.randomUUID()}"
        
        val newGroup = Group(
            id = UUID.randomUUID().toString(),
            name = testGroupName,
            tags = listOf("shared")
        )
        val newPrompt = Prompt(
            id = promptId,
            text = "Test prompt content for E2E testing"
        )
        
        // Create group first
        GitYamlWriter.ensureGroupOnDisk(repoDir, TEST_LIBRARY, listOf(testGroupName), newGroup)
        
        // Write prompt
        GitYamlWriter.writeSinglePrompt(repoDir, TEST_LIBRARY, listOf(testGroupName), newPrompt)
        
        // Verify prompt exists on disk
        val promptFile = File(libraryDir, "$testGroupName/p-$promptId.yaml")
        assertThat(promptFile).exists()

        // Clean up
        File(libraryDir, testGroupName).deleteRecursively()
    }

    // ============================================================
    // Test 4: Git Operations - Stage, Commit, Status
    // ============================================================

    @Test
    @Order(30)
    fun `should stage and commit new files`() {
        val testGroupName = "E2E-Commit-Test-${UUID.randomUUID().toString().take(8)}"
        val newGroup = Group(id = UUID.randomUUID().toString(), name = testGroupName, tags = listOf("shared"))

        // Create a group
        GitYamlWriter.ensureGroupOnDisk(repoDir, TEST_LIBRARY, listOf(testGroupName), newGroup)

        // Stage all changes
        val stageResult = runGit(repoDir, "add", "--all")
        assertThat(stageResult.exitCode).isEqualTo(0)

        // Commit
        val commitResult = runGit(repoDir, "commit", "-m", "test: E2E commit test")
        assertThat(commitResult.exitCode).isEqualTo(0)

        // Verify we're ahead of origin
        runGit(repoDir, "fetch", "origin")
        val statusResult = runGit(repoDir, "status", "-sb")
        assertThat(statusResult.stdout).contains("ahead")

        // Reset without pushing (don't pollute the remote)
        runGit(repoDir, "reset", "--hard", "origin/main")
    }

    @Test
    @Order(40)
    fun `should detect when ahead of origin`() {
        // Create a local commit
        val testFile = File(repoDir, "test-ahead-check.txt")
        testFile.writeText("test content")
        runGit(repoDir, "add", "--all")
        runGit(repoDir, "commit", "-m", "test: ahead check")

        // Check status
        runGit(repoDir, "fetch", "origin")
        val statusResult = runGit(repoDir, "status", "-sb")

        val isAhead = statusResult.stdout.contains("ahead")
        assertThat(isAhead).isTrue()

        // Reset
        runGit(repoDir, "reset", "--hard", "origin/main")
    }

    // ============================================================
    // Test 5: Single Library Auto-Detection
    // ============================================================

    @Test
    @Order(50)
    fun `should auto-detect single library when only one exists`() {
        val libraries = discoverLibraries(repoDir.absolutePath)

        // Should find exactly one library (TestLibrary)
        assertThat(libraries).hasSize(1)
        assertThat(libraries.first().id).isEqualTo(TEST_LIBRARY)
    }

    @Test
    @Order(51)
    fun `should not create general folder when library exists`() {
        // The "general" folder should not exist
        val generalDir = File(repoDir, "general")
        assertThat(generalDir).doesNotExist()
    }

    // ============================================================
    // Test 6: Round-trip - Write and Read
    // ============================================================

    @Test
    @Order(60)
    fun `should round-trip group and prompt correctly`() {
        val testGroupName = "E2E-Roundtrip-${UUID.randomUUID().toString().take(8)}"
        val promptId = UUID.randomUUID().toString()
        val promptText = "This is the prompt content\nWith multiple lines"

        val newGroup = Group(
            id = UUID.randomUUID().toString(),
            name = testGroupName,
            description = "Test group description",
            tags = listOf("shared", "test")
        )
        val newPrompt = Prompt(
            id = promptId,
            title = "Test Prompt",
            text = promptText,
            tags = listOf("e2e", "roundtrip")
        )

        // Write
        GitYamlWriter.ensureGroupOnDisk(repoDir, TEST_LIBRARY, listOf(testGroupName), newGroup)
        GitYamlWriter.writeSinglePrompt(repoDir, TEST_LIBRARY, listOf(testGroupName), newPrompt)

        // Read back
        val loadedGroups = GitYamlLoader.loadFromRoot(libraryDir)
        val loadedGroup = loadedGroups.firstOrNull { it.name == testGroupName }

        assertThat(loadedGroup).isNotNull()
        assertThat(loadedGroup!!.prompts).hasSize(1)

        val loadedPrompt = loadedGroup.prompts.first()
        assertThat(loadedPrompt.text).isEqualTo(promptText)

        // Clean up
        File(libraryDir, testGroupName).deleteRecursively()
    }

    // ============================================================
    // Helper Methods
    // ============================================================

    private data class GitResult(val exitCode: Int, val stdout: String, val stderr: String)

    private fun runGit(workDir: File, vararg args: String): GitResult {
        val command = listOf("git") + args.toList()
        val process = ProcessBuilder(command)
            .directory(workDir)
            .redirectErrorStream(false)
            .start()

        val stdout = process.inputStream.bufferedReader().readText()
        val stderr = process.errorStream.bufferedReader().readText()
        val exitCode = process.waitFor(30, TimeUnit.SECONDS)

        return GitResult(
            exitCode = if (exitCode) process.exitValue() else -1,
            stdout = stdout,
            stderr = stderr
        )
    }
}

