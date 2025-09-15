package com.example.promptlibrary.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.util.xmlb.XmlSerializerUtil

@State(name = "PromptLibrarySettings", storages = [Storage("PromptLibrarySettings.xml")])
class PluginSettingsService : PersistentStateComponent<PluginSettingsService.State> {
    data class State(
        var remoteRepoUrl: String = "",
        var repoPath: String = "",
        var promptsSubdir: String = "prompts",
        var branchName: String = "",
        var writeStrategy: WriteStrategy = WriteStrategy.DIRECT,
        var autoFetchEnabled: Boolean = false,
        var autoFetchMinutes: Int = 5
    )

    enum class WriteStrategy { DIRECT, BRANCH_PR }

    private var myState = State()
    val data: State get() = myState

    override fun getState(): State = myState
    override fun loadState(state: State) {
        XmlSerializerUtil.copyBean(state, this.myState)
    }

    companion object {
        fun instance(): PluginSettingsService = service()
    }
}

