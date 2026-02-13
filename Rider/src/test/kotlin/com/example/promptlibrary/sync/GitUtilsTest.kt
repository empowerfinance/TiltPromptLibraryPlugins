package com.example.promptlibrary.sync

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

class GitUtilsTest {

    @Nested
    inner class GenerateBranchNameTests {

        @Test
        fun `should generate branch name with sanitized user name`() {
            val branch = GitUtils.generateBranchName("John Doe")

            assertThat(branch).matches("^prompts/sync/john-doe-[a-z0-9]{6}$")
        }

        @Test
        fun `should handle user names with special characters`() {
            val branch = GitUtils.generateBranchName("John O'Brien-Smith")

            assertThat(branch).matches("^prompts/sync/john-o-brien-smith-[a-z0-9]{6}$")
        }

        @Test
        fun `should handle user names with multiple spaces`() {
            val branch = GitUtils.generateBranchName("John   Doe")

            assertThat(branch).matches("^prompts/sync/john-doe-[a-z0-9]{6}$")
        }

        @Test
        fun `should fallback to timestamp when user name is null`() {
            val branch = GitUtils.generateBranchName(null)

            // Should match format: prompts/sync/YYYYMMDD-HHMM-{random}
            assertThat(branch).matches("^prompts/sync/\\d{8}-\\d{4}-[a-z0-9]{6}$")
        }

        @Test
        fun `should fallback to timestamp when user name is empty`() {
            val branch = GitUtils.generateBranchName("")

            assertThat(branch).matches("^prompts/sync/\\d{8}-\\d{4}-[a-z0-9]{6}$")
        }

        @Test
        fun `should fallback to timestamp when user name is only whitespace`() {
            val branch = GitUtils.generateBranchName("   ")

            assertThat(branch).matches("^prompts/sync/\\d{8}-\\d{4}-[a-z0-9]{6}$")
        }

        @Test
        fun `should generate unique branch names on each call`() {
            val branch1 = GitUtils.generateBranchName("John Doe")
            val branch2 = GitUtils.generateBranchName("John Doe")

            assertThat(branch1).isNotEqualTo(branch2)
        }

        @Test
        fun `should handle unicode characters by replacing with hyphens`() {
            val branch = GitUtils.generateBranchName("José García")

            // Unicode chars get replaced with hyphens, then consecutive hyphens are collapsed
            assertThat(branch).matches("^prompts/sync/jos-garc-a-[a-z0-9]{6}$")
        }

        @Test
        fun `should handle names that become empty after sanitization`() {
            val branch = GitUtils.generateBranchName("日本語")

            // All chars are non-ASCII, so should fallback to timestamp
            assertThat(branch).matches("^prompts/sync/\\d{8}-\\d{4}-[a-z0-9]{6}$")
        }

        @Test
        fun `should handle names with leading and trailing special chars`() {
            val branch = GitUtils.generateBranchName("--John Doe--")

            assertThat(branch).matches("^prompts/sync/john-doe-[a-z0-9]{6}$")
        }

        @Test
        fun `should handle single word names`() {
            val branch = GitUtils.generateBranchName("Alice")

            assertThat(branch).matches("^prompts/sync/alice-[a-z0-9]{6}$")
        }

        @Test
        fun `should handle names with numbers`() {
            val branch = GitUtils.generateBranchName("User123")

            assertThat(branch).matches("^prompts/sync/user123-[a-z0-9]{6}$")
        }

        @Test
        fun `should handle email-like names`() {
            val branch = GitUtils.generateBranchName("john.doe@example.com")

            assertThat(branch).matches("^prompts/sync/john-doe-example-com-[a-z0-9]{6}$")
        }
    }
}

