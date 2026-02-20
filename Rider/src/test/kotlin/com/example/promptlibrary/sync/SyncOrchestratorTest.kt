package com.example.promptlibrary.sync

import com.example.promptlibrary.model.Group
import com.example.promptlibrary.model.GroupKind
import com.example.promptlibrary.model.Prompt
import com.example.promptlibrary.settings.LibraryConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import java.lang.reflect.Method

/**
 * Tests for SyncOrchestrator multi-library helper functions.
 * Uses reflection to test private methods.
 */
class SyncOrchestratorTest {

    private fun getPrivateMethod(name: String, vararg parameterTypes: Class<*>): Method {
        val method = SyncOrchestrator::class.java.getDeclaredMethod(name, *parameterTypes)
        method.isAccessible = true
        return method
    }

    @Nested
    inner class AddLibraryMetadataTests {

        private val addLibraryMetadataMethod = getPrivateMethod("addLibraryMetadata", Group::class.java, String::class.java)

        private fun addLibraryMetadata(group: Group, libraryId: String): Group {
            return addLibraryMetadataMethod.invoke(SyncOrchestrator, group, libraryId) as Group
        }

        @Test
        fun `should add libraryId to group`() {
            val group = Group(id = "g1", name = "Test Group")
            
            val result = addLibraryMetadata(group, "platform")
            
            assertThat(result.libraryId).isEqualTo("platform")
            assertThat(result.id).isEqualTo("g1")
            assertThat(result.name).isEqualTo("Test Group")
        }

        @Test
        fun `should add libraryId to all prompts in group`() {
            val prompts = listOf(
                Prompt(id = "p1", text = "Prompt 1"),
                Prompt(id = "p2", text = "Prompt 2")
            )
            val group = Group(id = "g1", name = "Test", prompts = prompts)
            
            val result = addLibraryMetadata(group, "analytics")
            
            assertThat(result.prompts).hasSize(2)
            assertThat(result.prompts.all { it.libraryId == "analytics" }).isTrue()
        }

        @Test
        fun `should recursively add libraryId to nested children`() {
            val grandchild = Group(id = "gc1", name = "Grandchild")
            val child = Group(id = "c1", name = "Child", children = listOf(grandchild))
            val parent = Group(id = "p1", name = "Parent", children = listOf(child))
            
            val result = addLibraryMetadata(parent, "platform")
            
            assertThat(result.libraryId).isEqualTo("platform")
            assertThat(result.children[0].libraryId).isEqualTo("platform")
            assertThat(result.children[0].children[0].libraryId).isEqualTo("platform")
        }

        @Test
        fun `should add libraryId to prompts in nested groups`() {
            val childPrompt = Prompt(id = "cp1", text = "Child Prompt")
            val child = Group(id = "c1", name = "Child", prompts = listOf(childPrompt))
            val parentPrompt = Prompt(id = "pp1", text = "Parent Prompt")
            val parent = Group(id = "p1", name = "Parent", prompts = listOf(parentPrompt), children = listOf(child))
            
            val result = addLibraryMetadata(parent, "shared")
            
            assertThat(result.prompts[0].libraryId).isEqualTo("shared")
            assertThat(result.children[0].prompts[0].libraryId).isEqualTo("shared")
        }

        @Test
        fun `should preserve all other group properties`() {
            val group = Group(
                id = "g1",
                name = "Test",
                kind = GroupKind.TEAM,
                description = "A test group",
                tags = listOf("tag1", "tag2")
            )
            
            val result = addLibraryMetadata(group, "lib1")
            
            assertThat(result.id).isEqualTo("g1")
            assertThat(result.name).isEqualTo("Test")
            assertThat(result.kind).isEqualTo(GroupKind.TEAM)
            assertThat(result.description).isEqualTo("A test group")
            assertThat(result.tags).containsExactly("tag1", "tag2")
            assertThat(result.libraryId).isEqualTo("lib1")
        }
    }

    @Nested
    inner class CountPromptsTests {

        private val countPromptsMethod = getPrivateMethod("countPrompts", List::class.java)

        @Suppress("UNCHECKED_CAST")
        private fun countPrompts(groups: List<Group>): Int {
            return countPromptsMethod.invoke(SyncOrchestrator, groups) as Int
        }

        @Test
        fun `should return 0 for empty groups list`() {
            val count = countPrompts(emptyList())
            assertThat(count).isEqualTo(0)
        }

        @Test
        fun `should count prompts in single group`() {
            val group = Group(
                id = "g1",
                name = "Test",
                prompts = listOf(
                    Prompt(id = "p1", text = "P1"),
                    Prompt(id = "p2", text = "P2"),
                    Prompt(id = "p3", text = "P3")
                )
            )
            
            val count = countPrompts(listOf(group))
            assertThat(count).isEqualTo(3)
        }

        @Test
        fun `should count prompts across multiple groups`() {
            val group1 = Group(id = "g1", name = "G1", prompts = listOf(Prompt(id = "p1", text = "P1")))
            val group2 = Group(id = "g2", name = "G2", prompts = listOf(Prompt(id = "p2", text = "P2"), Prompt(id = "p3", text = "P3")))
            
            val count = countPrompts(listOf(group1, group2))
            assertThat(count).isEqualTo(3)
        }

        @Test
        fun `should count prompts in nested groups`() {
            val child = Group(id = "c1", name = "Child", prompts = listOf(Prompt(id = "cp1", text = "CP1")))
            val parent = Group(id = "p1", name = "Parent", prompts = listOf(Prompt(id = "pp1", text = "PP1")), children = listOf(child))
            
            val count = countPrompts(listOf(parent))
            assertThat(count).isEqualTo(2)
        }

        @Test
        fun `should count prompts in deeply nested groups`() {
            val gc = Group(id = "gc", name = "GC", prompts = listOf(Prompt(id = "gcp", text = "GCP")))
            val child = Group(id = "c", name = "C", prompts = listOf(Prompt(id = "cp", text = "CP")), children = listOf(gc))
            val parent = Group(id = "p", name = "P", prompts = listOf(Prompt(id = "pp", text = "PP")), children = listOf(child))
            
            val count = countPrompts(listOf(parent))
            assertThat(count).isEqualTo(3)
        }

        @Test
        fun `should return 0 for groups with no prompts`() {
            val group = Group(id = "g1", name = "Empty Group")
            val count = countPrompts(listOf(group))
            assertThat(count).isEqualTo(0)
        }
    }

    @Nested
    inner class ValidateGroupsNotEmptyTests {

        private val validateMethod = getPrivateMethod(
            "validateGroupsNotEmpty",
            List::class.java,
            List::class.java
        )

        @Suppress("UNCHECKED_CAST")
        private fun validateGroupsNotEmpty(
            allGroups: List<Group>,
            enabledLibraries: List<LibraryConfig>
        ): Boolean {
            return validateMethod.invoke(SyncOrchestrator, allGroups, enabledLibraries) as Boolean
        }

        @Test
        fun `should return true when groups are not empty`() {
            val groups = listOf(
                Group(id = "g1", name = "Test Group", libraryId = "platform")
            )
            val libraries = listOf(
                LibraryConfig(
                    id = "platform",
                    path = "platform",
                    displayName = "Platform",
                    enabled = true
                )
            )

            val result = validateGroupsNotEmpty(groups, libraries)

            assertThat(result).isTrue()
        }

        @Test
        fun `should return false when groups are empty`() {
            val groups = emptyList<Group>()
            val libraries = listOf(
                LibraryConfig(
                    id = "platform",
                    path = "platform",
                    displayName = "Platform",
                    enabled = true
                )
            )

            val result = validateGroupsNotEmpty(groups, libraries)

            assertThat(result).isFalse()
        }

        @Test
        fun `should return true with multiple groups from multiple libraries`() {
            val groups = listOf(
                Group(id = "g1", name = "Platform Group", libraryId = "platform"),
                Group(id = "g2", name = "General Group", libraryId = "general"),
                Group(id = "g3", name = "Analytics Group", libraryId = "analytics")
            )
            val libraries = listOf(
                LibraryConfig(
                    id = "platform",
                    path = "platform",
                    displayName = "Platform",
                    enabled = true
                ),
                LibraryConfig(
                    id = "general",
                    path = "general",
                    displayName = "General",
                    enabled = true
                ),
                LibraryConfig(
                    id = "analytics",
                    path = "analytics",
                    displayName = "Analytics",
                    enabled = true
                )
            )

            val result = validateGroupsNotEmpty(groups, libraries)

            assertThat(result).isTrue()
        }

        @Test
        fun `should return false when groups are empty even with multiple libraries enabled`() {
            val groups = emptyList<Group>()
            val libraries = listOf(
                LibraryConfig(
                    id = "platform",
                    path = "platform",
                    displayName = "Platform",
                    enabled = true
                ),
                LibraryConfig(
                    id = "general",
                    path = "general",
                    displayName = "General",
                    enabled = true
                )
            )

            val result = validateGroupsNotEmpty(groups, libraries)

            assertThat(result).isFalse()
        }

        @Test
        fun `should return true with single group`() {
            val groups = listOf(
                Group(id = "g1", name = "Single Group", libraryId = "platform")
            )
            val libraries = listOf(
                LibraryConfig(
                    id = "platform",
                    path = "platform",
                    displayName = "Platform",
                    enabled = true
                )
            )

            val result = validateGroupsNotEmpty(groups, libraries)

            assertThat(result).isTrue()
        }

        @Test
        fun `should return true even when groups have null libraryId`() {
            // This tests the edge case where manually created groups might have null libraryId
            val groups = listOf(
                Group(id = "g1", name = "Group without library", libraryId = null)
            )
            val libraries = listOf(
                LibraryConfig(
                    id = "platform",
                    path = "platform",
                    displayName = "Platform",
                    enabled = true
                )
            )

            val result = validateGroupsNotEmpty(groups, libraries)

            assertThat(result).isTrue()
        }
    }
}

