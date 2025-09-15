package com.example.promptlibrary

import com.example.promptlibrary.ui.PromptLibraryPanel
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class PromptLibraryToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = PromptLibraryPanel(project)
        // Start background fetch scheduler (can be disabled later via settings)
        com.example.promptlibrary.sync.GitFetchScheduler(project).start()

        val content = ContentFactory.getInstance().createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)
    }
}

