package com.example.promptlibrary

import com.example.promptlibrary.ui.PromptLibraryPanel
import com.example.promptlibrary.ui.SyncOpsPanel
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class PromptLibraryToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val contentFactory = ContentFactory.getInstance()

        // Library tab (main panel)
        val libraryPanel = PromptLibraryPanel(project)
        val libraryContent = contentFactory.createContent(libraryPanel, "Library", false)
        toolWindow.contentManager.addContent(libraryContent)

        // Sync Ops tab
        val syncOpsPanel = SyncOpsPanel(project)
        val syncOpsContent = contentFactory.createContent(syncOpsPanel, "Sync Ops", false)
        toolWindow.contentManager.addContent(syncOpsContent)

        // Register disposable for SyncOpsPanel cleanup
        Disposer.register(syncOpsContent, Disposable { syncOpsPanel.dispose() })

        // Start background fetch scheduler (can be disabled later via settings)
        com.example.promptlibrary.sync.GitFetchScheduler(project).start()
    }
}

