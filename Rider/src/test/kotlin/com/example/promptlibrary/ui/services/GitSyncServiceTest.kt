package com.example.promptlibrary.ui.services

import com.example.promptlibrary.repository.PromptRepository
import com.intellij.openapi.project.Project
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File

class GitSyncServiceTest {

    @TempDir
    lateinit var tempDir: File

    private lateinit var repository: PromptRepository
    private lateinit var service: GitSyncService

    @BeforeEach
    fun setup() {
        // Set up repository with temp directory
        System.setProperty("promptlib.storage.dir", tempDir.absolutePath)
        repository = PromptRepository()
        // Use null for project in tests - the service should handle it gracefully
        service = GitSyncService(null as Project?, repository)
    }
    
    @Test
    fun `service should be created`() {
        // Then
        assertThat(service).isNotNull
    }
    
    @Test
    fun `SyncResult Success should be created`() {
        // When
        val result = GitSyncService.SyncResult.Success
        
        // Then
        assertThat(result).isNotNull
        assertThat(result).isInstanceOf(GitSyncService.SyncResult::class.java)
    }
    
    @Test
    fun `SyncResult Error should be created with message`() {
        // Given
        val errorMessage = "Test error"
        
        // When
        val result = GitSyncService.SyncResult.Error(errorMessage)
        
        // Then
        assertThat(result).isNotNull
        assertThat(result.message).isEqualTo(errorMessage)
    }
    
    @Test
    fun `SyncResult Warning should be created with message`() {
        // Given
        val warningMessage = "Test warning"
        
        // When
        val result = GitSyncService.SyncResult.Warning(warningMessage)
        
        // Then
        assertThat(result).isNotNull
        assertThat(result.message).isEqualTo(warningMessage)
    }
    
    @Test
    fun `loadRepoIntoShared should return warning when no working copy`() {
        // When
        val result = service.loadRepoIntoShared()
        
        // Then
        assertThat(result).isInstanceOf(GitSyncService.SyncResult.Warning::class.java)
        if (result is GitSyncService.SyncResult.Warning) {
            assertThat(result.message).contains("No working copy")
        }
    }
    
    @Test
    fun `pullFromGit should return warning when no working copy`() {
        // When
        val result = service.pullFromGit()
        
        // Then
        assertThat(result).isInstanceOf(GitSyncService.SyncResult.Warning::class.java)
        if (result is GitSyncService.SyncResult.Warning) {
            assertThat(result.message).contains("No working copy")
        }
    }
}

