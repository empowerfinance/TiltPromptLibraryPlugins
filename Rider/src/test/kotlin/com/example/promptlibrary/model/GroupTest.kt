package com.example.promptlibrary.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Nested

class GroupTest {

    @Nested
    inner class DataClassTests {

        @Test
        fun `should create group with required fields`() {
            val group = Group(id = "g1", name = "Test Group")
            
            assertThat(group.id).isEqualTo("g1")
            assertThat(group.name).isEqualTo("Test Group")
        }

        @Test
        fun `should default kind to GENERAL`() {
            val group = Group(id = "g1", name = "Test")
            assertThat(group.kind).isEqualTo(GroupKind.GENERAL)
        }

        @Test
        fun `should default description to null`() {
            val group = Group(id = "g1", name = "Test")
            assertThat(group.description).isNull()
        }

        @Test
        fun `should default tags to empty list`() {
            val group = Group(id = "g1", name = "Test")
            assertThat(group.tags).isEmpty()
        }

        @Test
        fun `should default children to empty list`() {
            val group = Group(id = "g1", name = "Test")
            assertThat(group.children).isEmpty()
        }

        @Test
        fun `should default prompts to empty list`() {
            val group = Group(id = "g1", name = "Test")
            assertThat(group.prompts).isEmpty()
        }

        @Test
        fun `should support all GroupKind values`() {
            val org = Group(id = "g1", name = "Org", kind = GroupKind.ORG)
            val team = Group(id = "g2", name = "Team", kind = GroupKind.TEAM)
            val pod = Group(id = "g3", name = "Pod", kind = GroupKind.POD)
            val collection = Group(id = "g4", name = "Collection", kind = GroupKind.COLLECTION)
            val general = Group(id = "g5", name = "General", kind = GroupKind.GENERAL)
            
            assertThat(org.kind).isEqualTo(GroupKind.ORG)
            assertThat(team.kind).isEqualTo(GroupKind.TEAM)
            assertThat(pod.kind).isEqualTo(GroupKind.POD)
            assertThat(collection.kind).isEqualTo(GroupKind.COLLECTION)
            assertThat(general.kind).isEqualTo(GroupKind.GENERAL)
        }

        @Test
        fun `should support custom description`() {
            val group = Group(id = "g1", name = "Test", description = "A test group")
            assertThat(group.description).isEqualTo("A test group")
        }

        @Test
        fun `should support tags`() {
            val group = Group(id = "g1", name = "Test", tags = listOf("shared", "important"))
            assertThat(group.tags).containsExactly("shared", "important")
        }
    }

    @Nested
    inner class HierarchyTests {

        @Test
        fun `should support nested children`() {
            val child1 = Group(id = "c1", name = "Child 1")
            val child2 = Group(id = "c2", name = "Child 2")
            val parent = Group(id = "p1", name = "Parent", children = listOf(child1, child2))
            
            assertThat(parent.children).hasSize(2)
            assertThat(parent.children).containsExactly(child1, child2)
        }

        @Test
        fun `should support deeply nested hierarchy`() {
            val grandchild = Group(id = "gc1", name = "Grandchild")
            val child = Group(id = "c1", name = "Child", children = listOf(grandchild))
            val parent = Group(id = "p1", name = "Parent", children = listOf(child))
            
            assertThat(parent.children).hasSize(1)
            assertThat(parent.children[0].children).hasSize(1)
            assertThat(parent.children[0].children[0].id).isEqualTo("gc1")
        }

        @Test
        fun `should support multiple children at each level`() {
            val gc1 = Group(id = "gc1", name = "GC1")
            val gc2 = Group(id = "gc2", name = "GC2")
            val child1 = Group(id = "c1", name = "C1", children = listOf(gc1, gc2))
            val child2 = Group(id = "c2", name = "C2")
            val parent = Group(id = "p1", name = "Parent", children = listOf(child1, child2))
            
            assertThat(parent.children).hasSize(2)
            assertThat(parent.children[0].children).hasSize(2)
            assertThat(parent.children[1].children).isEmpty()
        }
    }

    @Nested
    inner class PromptTests {

        @Test
        fun `should support prompts in group`() {
            val prompt1 = Prompt(text = "Prompt 1")
            val prompt2 = Prompt(text = "Prompt 2")
            val group = Group(id = "g1", name = "Test", prompts = listOf(prompt1, prompt2))
            
            assertThat(group.prompts).hasSize(2)
            assertThat(group.prompts).containsExactly(prompt1, prompt2)
        }

        @Test
        fun `should support prompts in nested groups`() {
            val childPrompt = Prompt(text = "Child Prompt")
            val child = Group(id = "c1", name = "Child", prompts = listOf(childPrompt))
            
            val parentPrompt = Prompt(text = "Parent Prompt")
            val parent = Group(id = "p1", name = "Parent", prompts = listOf(parentPrompt), children = listOf(child))
            
            assertThat(parent.prompts).hasSize(1)
            assertThat(parent.children[0].prompts).hasSize(1)
        }
    }

    @Nested
    inner class EqualityTests {

        @Test
        fun `should be equal when all fields match`() {
            val group1 = Group(id = "g1", name = "Test", kind = GroupKind.TEAM, tags = listOf("tag1"))
            val group2 = Group(id = "g1", name = "Test", kind = GroupKind.TEAM, tags = listOf("tag1"))
            
            assertThat(group1).isEqualTo(group2)
        }

        @Test
        fun `should not be equal when id differs`() {
            val group1 = Group(id = "g1", name = "Test")
            val group2 = Group(id = "g2", name = "Test")
            
            assertThat(group1).isNotEqualTo(group2)
        }

        @Test
        fun `should not be equal when name differs`() {
            val group1 = Group(id = "g1", name = "Test1")
            val group2 = Group(id = "g1", name = "Test2")

            assertThat(group1).isNotEqualTo(group2)
        }
    }

    @Nested
    inner class LibraryIdTests {

        @Test
        fun `should default libraryId to null`() {
            val group = Group(id = "g1", name = "Test")
            assertThat(group.libraryId).isNull()
        }

        @Test
        fun `should support custom libraryId`() {
            val group = Group(id = "g1", name = "Test", libraryId = "platform")
            assertThat(group.libraryId).isEqualTo("platform")
        }

        @Test
        fun `should preserve libraryId in copy`() {
            val original = Group(id = "g1", name = "Test", libraryId = "analytics")
            val copy = original.copy(name = "Modified")

            assertThat(copy.libraryId).isEqualTo("analytics")
        }

        @Test
        fun `should support nested groups with different libraryIds`() {
            val child = Group(id = "c1", name = "Child", libraryId = "lib-child")
            val parent = Group(id = "p1", name = "Parent", libraryId = "lib-parent", children = listOf(child))

            assertThat(parent.libraryId).isEqualTo("lib-parent")
            assertThat(parent.children[0].libraryId).isEqualTo("lib-child")
        }

        @Test
        fun `should be equal when libraryId matches`() {
            val group1 = Group(id = "g1", name = "Test", libraryId = "platform")
            val group2 = Group(id = "g1", name = "Test", libraryId = "platform")

            assertThat(group1).isEqualTo(group2)
        }

        @Test
        fun `should not be equal when libraryId differs`() {
            val group1 = Group(id = "g1", name = "Test", libraryId = "platform")
            val group2 = Group(id = "g1", name = "Test", libraryId = "analytics")

            assertThat(group1).isNotEqualTo(group2)
        }
    }
}

