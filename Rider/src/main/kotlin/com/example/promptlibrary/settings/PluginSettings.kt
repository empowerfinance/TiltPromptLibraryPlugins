package com.example.promptlibrary.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.util.xmlb.XmlSerializerUtil
import java.io.File

@State(name = "PromptLibrarySettings", storages = [Storage("PromptLibrarySettings.xml")])
class PluginSettingsService : PersistentStateComponent<PluginSettingsService.State> {
    data class State(
        var remoteRepoUrl: String = "",
        var repoPath: String = "~/PromptLibrary",  // Match VS Code default
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

        /**
         * Expands tilde (~) in paths to the user's home directory.
         * Matches VS Code's expandPath() function behavior.
         */
        fun expandPath(filePath: String): String {
            if (filePath.startsWith("~/") || filePath == "~") {
                val homeDir = System.getProperty("user.home")
                return if (filePath == "~") {
                    homeDir
                } else {
                    File(homeDir, filePath.substring(2)).absolutePath
                }
            }
            return filePath
        }

        /**
         * Gets the effective repo path with tilde expansion applied.
         * Returns empty string if repoPath is blank.
         */
        fun getEffectiveRepoPath(): String {
            val rawPath = instance().data.repoPath.trim()
            return if (rawPath.isNotEmpty()) expandPath(rawPath) else ""
        }
    }
}

