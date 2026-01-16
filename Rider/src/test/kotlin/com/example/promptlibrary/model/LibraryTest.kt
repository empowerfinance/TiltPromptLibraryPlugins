package com.example.promptlibrary.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Nested

class LibraryTest {

    @Nested
    inner class DataClassTests {

        @Test
        fun `should create empty library by default`() {
            val library = Library()
            
            assertThat(library.groups).isEmpty()
            assertThat(library.privatePrompts).isEmpty()
        }

        @Test
        fun `should support groups`() {
            val group1 = Group(id = "g1", name = "Group 1")
            val group2 = Group(id = "g2", name = "Group 2")
            val library = Library(groups = listOf(group1, group2))
            
            assertThat(library.groups).hasSize(2)
            assertThat(library.groups).containsExactly(group1, group2)
        }

        @Test
        fun `should support private prompts`() {
            val prompt1 = Prompt(text = "Prompt 1", isPrivate = true)
            val prompt2 = Prompt(text = "Prompt 2", isPrivate = true)
            val library = Library(privatePrompts = listOf(prompt1, prompt2))
            
            assertThat(library.privatePrompts).hasSize(2)
            assertThat(library.privatePrompts).containsExactly(prompt1, prompt2)
        }

        @Test
        fun `should support both groups and private prompts`() {
            val group = Group(id = "g1", name = "Group")
            val prompt = Prompt(text = "Private Prompt", isPrivate = true)
            val library = Library(groups = listOf(group), privatePrompts = listOf(prompt))
            
            assertThat(library.groups).hasSize(1)
            assertThat(library.privatePrompts).hasSize(1)
        }
    }

    @Nested
    inner class HierarchyTests {

        @Test
        fun `should support nested group hierarchies`() {
            val child = Group(id = "c1", name = "Child")
            val parent = Group(id = "p1", name = "Parent", children = listOf(child))
            val library = Library(groups = listOf(parent))
            
            assertThat(library.groups).hasSize(1)
            assertThat(library.groups[0].children).hasSize(1)
        }

        @Test
        fun `should support prompts in groups`() {
            val prompt = Prompt(text = "Group Prompt")
            val group = Group(id = "g1", name = "Group", prompts = listOf(prompt))
            val library = Library(groups = listOf(group))
            
            assertThat(library.groups[0].prompts).hasSize(1)
        }

        @Test
        fun `should support complex library structure`() {
            // Create a complex structure:
            // - 2 top-level groups
            // - Each with child groups
            // - Each with prompts
            // - Plus private prompts
            
            val childPrompt1 = Prompt(text = "Child Prompt 1")
            val child1 = Group(id = "c1", name = "Child 1", prompts = listOf(childPrompt1))
            
            val parentPrompt1 = Prompt(text = "Parent Prompt 1")
            val parent1 = Group(id = "p1", name = "Parent 1", prompts = listOf(parentPrompt1), children = listOf(child1))
            
            val parent2 = Group(id = "p2", name = "Parent 2")
            
            val privatePrompt1 = Prompt(text = "Private 1", isPrivate = true)
            val privatePrompt2 = Prompt(text = "Private 2", isPrivate = true)
            
            val library = Library(
                groups = listOf(parent1, parent2),
                privatePrompts = listOf(privatePrompt1, privatePrompt2)
            )
            
            assertThat(library.groups).hasSize(2)
            assertThat(library.privatePrompts).hasSize(2)
            assertThat(library.groups[0].children).hasSize(1)
            assertThat(library.groups[0].prompts).hasSize(1)
            assertThat(library.groups[0].children[0].prompts).hasSize(1)
        }
    }

    @Nested
    inner class EqualityTests {

        @Test
        fun `should be equal when all fields match`() {
            val group = Group(id = "g1", name = "Group")
            val prompt = Prompt(text = "Prompt", isPrivate = true)
            
            val library1 = Library(groups = listOf(group), privatePrompts = listOf(prompt))
            val library2 = Library(groups = listOf(group), privatePrompts = listOf(prompt))
            
            assertThat(library1).isEqualTo(library2)
        }

        @Test
        fun `should not be equal when groups differ`() {
            val group1 = Group(id = "g1", name = "Group 1")
            val group2 = Group(id = "g2", name = "Group 2")
            
            val library1 = Library(groups = listOf(group1))
            val library2 = Library(groups = listOf(group2))
            
            assertThat(library1).isNotEqualTo(library2)
        }

        @Test
        fun `should not be equal when private prompts differ`() {
            val prompt1 = Prompt(text = "Prompt 1", isPrivate = true)
            val prompt2 = Prompt(text = "Prompt 2", isPrivate = true)
            
            val library1 = Library(privatePrompts = listOf(prompt1))
            val library2 = Library(privatePrompts = listOf(prompt2))
            
            assertThat(library1).isNotEqualTo(library2)
        }

        @Test
        fun `empty libraries should be equal`() {
            val library1 = Library()
            val library2 = Library()
            
            assertThat(library1).isEqualTo(library2)
        }
    }

    @Nested
    inner class CopyTests {

        @Test
        fun `should support copy with modified groups`() {
            val original = Library(groups = listOf(Group(id = "g1", name = "Original")))
            val modified = original.copy(groups = listOf(Group(id = "g2", name = "Modified")))
            
            assertThat(modified.groups[0].name).isEqualTo("Modified")
            assertThat(original.groups[0].name).isEqualTo("Original")
        }

        @Test
        fun `should support copy with modified private prompts`() {
            val original = Library(privatePrompts = listOf(Prompt(text = "Original", isPrivate = true)))
            val modified = original.copy(privatePrompts = listOf(Prompt(text = "Modified", isPrivate = true)))
            
            assertThat(modified.privatePrompts[0].text).isEqualTo("Modified")
            assertThat(original.privatePrompts[0].text).isEqualTo("Original")
        }
    }
}

