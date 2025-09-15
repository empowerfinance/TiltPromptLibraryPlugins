package com.example.promptlibrary.model

import kotlinx.serialization.Serializable

@Serializable
data class Library(
    val groups: List<Group> = emptyList(),
    val privatePrompts: List<Prompt> = emptyList()
)

