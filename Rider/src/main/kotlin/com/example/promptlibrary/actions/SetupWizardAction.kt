package com.example.promptlibrary.actions

import com.example.promptlibrary.settings.PluginSettingsService
import com.example.promptlibrary.sync.GitRepoManager
import com.example.promptlibrary.sync.SyncLog
import com.example.promptlibrary.ui.dialogs.SetupWizardActions
import com.example.promptlibrary.ui.dialogs.SetupWizardDialog
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import git4idea.repo.GitRepositoryManager

/**
 * Action to launch the Setup Wizard dialog.
 * Provides three flows for configuring the prompt library:
 * 1. Clone from Git URL
 * 2. Use existing folder (auto-detects git remote)
 * 3. Create new folder
 */
class SetupWizardAction : AnAction("Setup Prompt Library...") {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

        val dialog = SetupWizardDialog(project) { result ->
            SyncLog.info("Setup Wizard completed: flow=${result.flow}, path=${result.repoPath}, remote=${result.remoteUrl}")

            // Update settings
            val settings = PluginSettingsService.instance().data
            settings.repoPath = result.repoPath
            if (result.remoteUrl != null) {
                settings.remoteRepoUrl = result.remoteUrl
            }

            when (result.flow) {
                SetupWizardDialog.SetupFlow.CLONE -> {
                    // Clone the repository
                    ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Cloning Repository", true) {
                        override fun run(indicator: ProgressIndicator) {
                            indicator.text = "Cloning ${result.remoteUrl}..."
                            try {
                                val (repoRoot, _) = GitRepoManager.ensureWorkingCopy(project)
                                if (repoRoot != null) {
                                    ApplicationManager.getApplication().invokeLater {
                                        Notifications.Bus.notify(
                                            Notification(
                                                "PromptLibrary",
                                                "Setup Complete",
                                                "Repository cloned successfully to ${result.repoPath}",
                                                NotificationType.INFORMATION
                                            )
                                        )
                                    }
                                }
                            } catch (ex: Exception) {
                                SyncLog.error("Clone failed: ${ex.message}")
                                ApplicationManager.getApplication().invokeLater {
                                    Notifications.Bus.notify(
                                        Notification(
                                            "PromptLibrary",
                                            "Clone Failed",
                                            "Failed to clone repository: ${ex.message}",
                                            NotificationType.ERROR
                                        )
                                    )
                                }
                            }
                        }
                    })
                }

                SetupWizardDialog.SetupFlow.EXISTING -> {
                    // Just update settings, auto-detect remote was already done
                    Notifications.Bus.notify(
                        Notification(
                            "PromptLibrary",
                            "Setup Complete",
                            "Using existing folder: ${result.repoPath}" +
                                    if (result.remoteUrl != null) " (remote: ${result.remoteUrl})" else "",
                            NotificationType.INFORMATION
                        )
                    )
                }

                SetupWizardDialog.SetupFlow.NEW -> {
                    // Folder was already created by the dialog
                    Notifications.Bus.notify(
                        Notification(
                            "PromptLibrary",
                            "Setup Complete",
                            "Created new library folder: ${result.repoPath}",
                            NotificationType.INFORMATION
                        )
                    )
                }
            }
        }

        dialog.show()
    }
}

