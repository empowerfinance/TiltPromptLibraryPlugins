package com.example.promptlibrary.ui

import com.example.promptlibrary.events.LibraryEvents
import com.example.promptlibrary.repository.PromptRepository
import com.example.promptlibrary.settings.PluginSettingsService
import com.example.promptlibrary.settings.titleCase
import com.example.promptlibrary.sync.*
import com.example.promptlibrary.ui.dialogs.ExportDialog
import com.example.promptlibrary.ui.dialogs.ImportDialog
import com.example.promptlibrary.ui.dialogs.ImportResult
import com.intellij.icons.AllIcons
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.JBColor
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.*
import javax.swing.*

/**
 * Sync Operations Panel - similar to VS Code's Sync Ops panel.
 * Provides Git sync actions, tools, settings display, and logs.
 */
class SyncOpsPanel(private val project: Project) : JPanel(BorderLayout()) {
    private val repository = PromptRepository()
    private val logArea = JTextPane()
    private val settingsLabels = mutableMapOf<String, JLabel>()
    
    private val logListener: () -> Unit = { updateLogDisplay() }

    init {
        border = JBUI.Borders.empty(12)
        
        // Main content with vertical layout
        val mainPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
        }
        
        // Actions Card
        mainPanel.add(createActionsCard())
        mainPanel.add(Box.createVerticalStrut(12))
        
        // Settings Display Card
        mainPanel.add(createSettingsCard())
        mainPanel.add(Box.createVerticalStrut(12))
        
        // Logs Card (takes remaining space)
        val logsCard = createLogsCard()
        
        // Use a split: top for actions/settings, bottom for logs
        val topPanel = JPanel(BorderLayout()).apply {
            add(mainPanel, BorderLayout.NORTH)
        }
        
        val splitPane = JSplitPane(JSplitPane.VERTICAL_SPLIT, topPanel, logsCard).apply {
            resizeWeight = 0.3
            dividerSize = 6
            border = null
        }
        
        add(splitPane, BorderLayout.CENTER)
        
        // Register log listener
        SyncLog.addListener(logListener)
        updateLogDisplay()
        updateSettingsDisplay()
    }
    
    fun dispose() {
        SyncLog.removeListener(logListener)
    }

    private fun createActionsCard(): JPanel {
        return createCard("Actions") {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            
            // Get Latest from GitHub section
            add(createButtonGroup(
                "📥 Get Latest from GitHub",
                listOf(
                    ActionButton("Pull & Sync", true) { pullAndSync() },
                    ActionButton("Force Pull & Sync", false) { forcePullAndSync() }
                ),
                "Pull latest changes from GitHub and sync to your local library. Use \"Force\" to discard any local changes."
            ))
            
            add(Box.createVerticalStrut(12))
            
            // Push to GitHub section
            add(createButtonGroup(
                "📤 Push to GitHub",
                listOf(
                    ActionButton("Quick Commit", true) { quickCommit() },
                    ActionButton("Create Pull Request", false) { createPullRequest() }
                ),
                "\"Quick Commit\" pushes directly to your current branch. \"Create Pull Request\" creates a new branch and opens a PR for review."
            ))
            
            add(Box.createVerticalStrut(12))

            // Tools section
            add(createButtonGroup(
                "🛠️ Tools",
                listOf(
                    ActionButton("Settings", false) { openSettings() },
                    ActionButton("Import JSON", false) { importJson() },
                    ActionButton("Export JSON", false) { exportJson() },
                    ActionButton("Clear Logs", false) { clearLogs() }
                ),
                "Manage your library settings, import/export data, and perform maintenance tasks."
            ))

            add(Box.createVerticalStrut(12))

            // Danger Zone section
            add(createDangerZone())
        }
    }

    private fun createDangerZone(): JPanel {
        return JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.LEFT_ALIGNMENT
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(JBColor.namedColor("ErrorColor", JBColor.RED), 1, true),
                JBUI.Borders.empty(8)
            )
            background = JBColor.namedColor("Panel.background", JBColor.background())

            // Title
            add(JBLabel("⚠️ Danger Zone").apply {
                font = font.deriveFont(Font.BOLD, 11f)
                foreground = JBColor.namedColor("ErrorColor", JBColor.RED)
            })
            add(Box.createVerticalStrut(4))
            add(JBLabel("These actions are destructive and cannot be undone.").apply {
                font = font.deriveFont(10f)
                foreground = JBColor.GRAY
            })
            add(Box.createVerticalStrut(8))

            // Buttons row
            val buttonsPanel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
                isOpaque = false
                alignmentX = Component.LEFT_ALIGNMENT

                add(JButton("Wipe Shared").apply {
                    toolTipText = "Remove all Shared groups locally. Use Sync to pull back from remote."
                    addActionListener { wipeSharedLibrary() }
                })
                add(JButton("Wipe Private").apply {
                    toolTipText = "Remove all Private groups and private prompts locally."
                    addActionListener { wipePrivateLibrary() }
                })
                add(JButton("Wipe ALL").apply {
                    toolTipText = "Delete local prompt files and the local Git working copy."
                    addActionListener { wipeAllData() }
                })
            }
            add(buttonsPanel)
        }
    }

    private data class ActionButton(val label: String, val primary: Boolean, val action: () -> Unit)

    private fun createButtonGroup(title: String, buttons: List<ActionButton>, helpText: String): JPanel {
        return JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.LEFT_ALIGNMENT
            isOpaque = false
            
            // Title
            add(JBLabel(title).apply {
                font = font.deriveFont(Font.BOLD, 11f)
                foreground = JBColor.namedColor("Label.disabledForeground", JBColor.GRAY)
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(6))
            
            // Buttons row
            add(JPanel(FlowLayout(FlowLayout.LEFT, 6, 0)).apply {
                isOpaque = false
                alignmentX = Component.LEFT_ALIGNMENT
                buttons.forEach { btn ->
                    add(createStyledButton(btn.label, btn.primary, btn.action))
                }
            })
            add(Box.createVerticalStrut(4))
            
            // Help text
            add(JBLabel("<html><body style='width: 400px'>${helpText}</body></html>").apply {
                font = font.deriveFont(11f)
                foreground = JBColor.namedColor("Label.disabledForeground", JBColor.GRAY)
                alignmentX = Component.LEFT_ALIGNMENT
            })
        }
    }

    private fun createStyledButton(text: String, primary: Boolean, action: () -> Unit): JButton {
        return JButton(text).apply {
            isFocusPainted = false
            cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
            if (primary) {
                background = JBColor.namedColor("Button.default.startBackground", JBColor(0x4A86C7, 0x365880))
                foreground = JBColor.namedColor("Button.default.foreground", JBColor.WHITE)
            }
            addActionListener { action() }
        }
    }

    private fun createSettingsCard(): JPanel {
        return createCard("Current Settings") {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)

            val settings = PluginSettingsService.instance().data
            val activeLibrary = PluginSettingsService.getActiveLibrary()
            val enabledLibraries = PluginSettingsService.getEnabledLibraries()

            // Active Library indicator - prominent display
            val libraryText = if (enabledLibraries.size > 1) {
                "📚 Active: ${activeLibrary.displayName} (+${enabledLibraries.size - 1} more)"
            } else {
                "📚 Active Library: ${activeLibrary.displayName}"
            }
            val libraryLabel = JLabel(libraryText).apply {
                font = font.deriveFont(Font.BOLD, 13f)
                foreground = JBColor.namedColor("Link.activeForeground", JBColor(0x2470B3, 0x589DF6))
                alignmentX = Component.LEFT_ALIGNMENT
                if (enabledLibraries.size > 1) {
                    toolTipText = "Enabled: ${enabledLibraries.joinToString(", ") { it.displayName }}"
                }
            }
            add(libraryLabel)
            add(Box.createVerticalStrut(8))

            // Other settings
            val settingsPanel = JPanel(GridLayout(0, 1, 2, 2)).apply {
                isOpaque = false
                alignmentX = Component.LEFT_ALIGNMENT
            }

            settingsLabels["repoPath"] = JLabel("Repository: ${settings.repoPath.ifEmpty { "(not set)" }}")
            settingsLabels["promptsSubdir"] = JLabel("Library Path: ${settings.promptsSubdir}")
            settingsLabels["writeStrategy"] = JLabel("Write Strategy: ${settings.writeStrategy}")

            settingsLabels.values.forEach { label ->
                label.font = label.font.deriveFont(12f)
                label.foreground = JBColor.namedColor("Label.disabledForeground", JBColor.GRAY)
                settingsPanel.add(label)
            }

            add(settingsPanel)
        }
    }

    private fun createLogsCard(): JPanel {
        return createCard("Logs") {
            layout = BorderLayout()

            logArea.apply {
                isEditable = false
                contentType = "text/html"
                background = JBColor.namedColor("EditorPane.background", background)
            }

            val scrollPane = JBScrollPane(logArea).apply {
                border = JBUI.Borders.empty()
                preferredSize = Dimension(400, 200)
            }

            add(scrollPane, BorderLayout.CENTER)
        }
    }

    private fun createCard(title: String, contentBuilder: JPanel.() -> Unit): JPanel {
        return JPanel(BorderLayout()).apply {
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(JBColor.namedColor("Borders.color", JBColor.GRAY), 1),
                JBUI.Borders.empty()
            )
            background = JBColor.namedColor("EditorPane.background", background)

            // Header
            add(JPanel(BorderLayout()).apply {
                border = BorderFactory.createCompoundBorder(
                    BorderFactory.createMatteBorder(0, 0, 1, 0, JBColor.namedColor("Borders.color", JBColor.GRAY)),
                    JBUI.Borders.empty(8, 12)
                )
                background = JBColor.namedColor("EditorPane.background", background)
                add(JBLabel(title).apply {
                    font = font.deriveFont(Font.BOLD, 13f)
                }, BorderLayout.WEST)
            }, BorderLayout.NORTH)

            // Body
            add(JPanel().apply {
                border = JBUI.Borders.empty(12)
                isOpaque = false
                contentBuilder()
            }, BorderLayout.CENTER)
        }
    }

    private fun updateLogDisplay() {
        val entries = SyncLog.entries
        val html = buildString {
            append("<html><body style='font-family: monospace; font-size: 11px; margin: 0; padding: 4px;'>")
            entries.forEach { entry ->
                val color = when (entry.level) {
                    LogLevel.INFO -> "#888888"
                    LogLevel.WARN -> "#c8a600"
                    LogLevel.ERROR -> "#cc241d"
                }
                append("<div style='margin-bottom: 2px;'>")
                append("<span style='color: #666666;'>[${entry.time}]</span> ")
                append("<span style='color: $color;'>${entry.message}</span>")
                append("</div>")
            }
            append("</body></html>")
        }
        SwingUtilities.invokeLater {
            logArea.text = html
            // Scroll to bottom
            logArea.caretPosition = logArea.document.length
        }
    }

    private fun updateSettingsDisplay() {
        val settings = PluginSettingsService.instance().data
        settingsLabels["repoPath"]?.text = "repoPath: ${settings.repoPath.ifEmpty { "(not set)" }}"
        settingsLabels["promptsSubdir"]?.text = "promptsSubdir: ${settings.promptsSubdir}"
        settingsLabels["writeStrategy"]?.text = "writeStrategy: ${settings.writeStrategy}"
    }

    // Action handlers
    private fun pullAndSync() {
        SyncLog.info("Starting Pull & Sync...")
        SyncOrchestrator.sync(project, repository)
    }

    private fun forcePullAndSync() {
        val res = JOptionPane.showConfirmDialog(
            this,
            "This will discard ALL local changes and hard reset to remote. Continue?",
            "Force Pull & Sync",
            JOptionPane.YES_NO_OPTION
        )
        if (res == JOptionPane.YES_OPTION) {
            SyncLog.info("Starting Force Pull (hard reset to origin)...")
            SyncOrchestrator.forcePull(project, repository)
        }
    }

    private fun quickCommit() {
        SyncLog.info("Starting Quick Commit...")
        WriteStrategyService.directCommit(project, repository)
    }

    private fun createPullRequest() {
        SyncLog.info("Starting Create Pull Request...")
        WriteStrategyService.branchAndCommit(project, repository)
    }

    private fun openSettings() {
        // Switch to the Settings tab in the tool window
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("Prompt Library")
        toolWindow?.contentManager?.let { cm ->
            cm.contents.find { it.displayName == "Settings" }?.let { settingsContent ->
                cm.setSelectedContent(settingsContent)
            }
        }
    }

    private fun importJson() {
        ImportDialog(
            parent = this,
            onImport = { importedPrompts ->
                val importedCount = repository.importPrompts(importedPrompts)
                SyncLog.info("Imported $importedCount prompt(s)")
                ImportResult.Success(
                    importedCount = importedCount,
                    duplicatesSkipped = importedPrompts.size - importedCount
                )
            }
        ).show()
    }

    private fun exportJson() {
        ExportDialog(
            prompts = repository.getAllPromptsLibrary(),
            title = "Export Library (v1 JSON)",
            defaultFileName = "library-prompts.json",
            parent = this
        ).show()
    }

    private fun clearLogs() {
        SyncLog.clear()
        SyncLog.info("Logs cleared")
    }

    private fun wipeSharedLibrary() {
        val res = JOptionPane.showConfirmDialog(
            this,
            "Remove all Shared groups locally? You can restore them by syncing from remote.",
            "Wipe Shared Library",
            JOptionPane.YES_NO_OPTION,
            JOptionPane.WARNING_MESSAGE
        )
        if (res == JOptionPane.YES_OPTION) {
            repository.wipeSharedGroups()
            SyncLog.info("Shared groups removed locally")
            Notifications.Bus.notify(
                Notification("PromptLibrary", "Wipe Shared", "Shared groups removed locally.", NotificationType.INFORMATION)
            )
            LibraryEvents.fireChanged()
        }
    }

    private fun wipePrivateLibrary() {
        val res = JOptionPane.showConfirmDialog(
            this,
            "Remove all Private groups and private prompts locally? This cannot be undone.",
            "Wipe Private Library",
            JOptionPane.YES_NO_OPTION,
            JOptionPane.WARNING_MESSAGE
        )
        if (res == JOptionPane.YES_OPTION) {
            repository.wipePrivateLibrary()
            SyncLog.info("Private library removed locally")
            Notifications.Bus.notify(
                Notification("PromptLibrary", "Wipe Private", "Private library removed locally.", NotificationType.INFORMATION)
            )
            LibraryEvents.fireChanged()
        }
    }

    private fun wipeAllData() {
        val res = JOptionPane.showConfirmDialog(
            this,
            "This will permanently delete your local prompt library files and remove the local Git working copy. You will need to sync from remote to restore. Continue?",
            "Wipe ALL Local Data",
            JOptionPane.YES_NO_OPTION,
            JOptionPane.WARNING_MESSAGE
        )
        if (res == JOptionPane.YES_OPTION) {
            try {
                repository.wipeAllLocalData()
                GitRepoManager.nukeWorkingCopy(project)
                SyncLog.info("All local data removed")
                Notifications.Bus.notify(
                    Notification("PromptLibrary", "Wipe All", "Local data removed. Use Sync to download from remote.", NotificationType.INFORMATION)
                )
                LibraryEvents.fireChanged()
            } catch (e: Exception) {
                SyncLog.error("Failed to wipe local data: ${e.message}")
                Notifications.Bus.notify(
                    Notification("PromptLibrary", "Error", "Failed to wipe local data: ${e.message}", NotificationType.ERROR)
                )
            }
        }
    }
}

