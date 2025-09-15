package com.example.promptlibrary.model

import kotlinx.serialization.Serializable

@Serializable
enum class GroupKind {
    ORG,
    TEAM,
    POD,
    COLLECTION,
    GENERAL
}

@Serializable
data class Group(
    val id: String,
    val name: String,
    val kind: GroupKind = GroupKind.GENERAL,
    val description: String? = null,
    val tags: List<String> = emptyList(),
    val children: List<Group> = emptyList(),
    val prompts: List<Prompt> = emptyList()
)

