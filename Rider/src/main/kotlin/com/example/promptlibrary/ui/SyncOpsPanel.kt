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
import java.io.File
import javax.swing.*

/**
 * Sync Operations Panel - similar to VS Code's Sync Ops panel.
 * Provides Git sync actions, tools, settings display, and logs.
 */
class SyncOpsPanel(
    private val project: Project,
    private val repository: PromptRepository
) : JPanel(BorderLayout()) {
    private val logArea = JTextPane()
    private var branchIndicatorPanel: JPanel? = null
    private var branchLabel: JLabel? = null
    private var returnToMainButton: JButton? = null

    private val logListener: () -> Unit = { updateLogDisplay() }

    companion object {
        // Static reference to allow refresh from WriteStrategyService
        private var currentInstance: SyncOpsPanel? = null

        fun refreshCurrentInstance() {
            currentInstance?.refresh()
        }
    }

    init {
        currentInstance = this
        border = JBUI.Borders.empty(12)

        // Main content with vertical layout
        val mainPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
        }

        // Actions Card
        mainPanel.add(createActionsCard())
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
        updateBranchIndicator()
    }

    fun dispose() {
        SyncLog.removeListener(logListener)
        if (currentInstance == this) {
            currentInstance = null
        }
    }

    /**
     * Refresh the panel UI to update branch status.
     * Can be called from outside after branch changes.
     */
    fun refresh() {
        updateBranchIndicator()
    }

    private fun getRepoRoot(): File? {
        val repoPath = PluginSettingsService.getEffectiveRepoPath()
        return if (repoPath.isNotBlank()) File(repoPath) else GitRepoManager.ensureWorkingCopy(project).first
    }

    /**
     * Updates the branch indicator UI. Runs git operations on a background thread
     * to avoid blocking the EDT.
     */
    private fun updateBranchIndicator() {
        // Run git operations on background thread to avoid freezing UI
        com.intellij.openapi.application.ApplicationManager.getApplication().executeOnPooledThread {
            val repoRoot = getRepoRoot()
            val currentBranch = if (repoRoot != null) GitUtils.currentBranch(project, repoRoot) else null
            val isOnMain = currentBranch == "main" || currentBranch == "master"

            // Update UI on EDT
            SwingUtilities.invokeLater {
                if (repoRoot == null) {
                    branchIndicatorPanel?.isVisible = false
                    return@invokeLater
                }

                branchLabel?.text = if (currentBranch != null) {
                    if (isOnMain) "✓ On branch: $currentBranch" else "⚠️ On branch: $currentBranch"
                } else {
                    "⚠️ Not on a branch"
                }

                // Update styling based on branch
                if (isOnMain) {
                    branchLabel?.foreground = JBColor.namedColor("Label.foreground", JBColor.foreground())
                    branchIndicatorPanel?.border = BorderFactory.createCompoundBorder(
                        BorderFactory.createLineBorder(JBColor.namedColor("Borders.color", JBColor.GRAY), 1, true),
                        JBUI.Borders.empty(6, 10)
                    )
                } else {
                    branchLabel?.foreground = JBColor.namedColor("Label.warningForeground", JBColor(0xB5740D, 0xBBB529))
                    branchIndicatorPanel?.border = BorderFactory.createCompoundBorder(
                        BorderFactory.createLineBorder(JBColor.namedColor("Label.warningForeground", JBColor(0xB5740D, 0xBBB529)), 1, true),
                        JBUI.Borders.empty(6, 10)
                    )
                }

                // Show/hide return to main button
                returnToMainButton?.isVisible = !isOnMain
                branchIndicatorPanel?.isVisible = true
            }
        }
    }

    private fun returnToMainAndPull() {
        val repoRoot = getRepoRoot() ?: return

        SyncLog.info("Returning to main branch and pulling...")

        // Run on background thread to avoid blocking UI
        com.intellij.openapi.application.ApplicationManager.getApplication().executeOnPooledThread {
            // Try 'main' first, then 'master'
            var success = GitUtils.checkout(project, repoRoot, "main")
            if (!success) {
                SyncLog.info("'main' branch not found, trying 'master'...")
                success = GitUtils.checkout(project, repoRoot, "master")
            }

            if (!success) {
                SyncLog.error("Failed to checkout main/master branch")
                SwingUtilities.invokeLater {
                    Notifications.Bus.notify(
                        Notification("PromptLibrary", "Branch Switch", "Failed to checkout main/master branch", NotificationType.ERROR)
                    )
                    updateBranchIndicator()
                }
                return@executeOnPooledThread
            }

            SyncLog.info("Switched to main branch, pulling latest...")

            // Pull latest changes using synchronous pull
            val pullResult = GitPullService.pullSync(project, repoRoot)

            SwingUtilities.invokeLater {
                if (pullResult.success) {
                    SyncLog.info("Successfully returned to main and pulled latest changes")
                    Notifications.Bus.notify(
                        Notification("PromptLibrary", "Branch Switch", "Returned to main and pulled latest changes", NotificationType.INFORMATION)
                    )
                    // Reload prompts from disk
                    SyncOrchestrator.reloadFromDisk(repository)
                } else {
                    SyncLog.error("Pull failed: ${pullResult.error}")
                    Notifications.Bus.notify(
                        Notification("PromptLibrary", "Branch Switch", "Returned to main but pull failed: ${pullResult.error}", NotificationType.WARNING)
                    )
                }
                updateBranchIndicator()
            }
        }
    }

    private fun createActionsCard(): JPanel {
        return createCard("Actions") {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)

            // Branch indicator at the top
            branchIndicatorPanel = JPanel(FlowLayout(FlowLayout.LEFT, 8, 0)).apply {
                alignmentX = Component.LEFT_ALIGNMENT
                isOpaque = false
                border = BorderFactory.createCompoundBorder(
                    BorderFactory.createLineBorder(JBColor.namedColor("Borders.color", JBColor.GRAY), 1, true),
                    JBUI.Borders.empty(6, 10)
                )

                branchLabel = JLabel("").apply {
                    font = font.deriveFont(12f)
                }
                add(branchLabel)

                returnToMainButton = JButton("↩ Return to Main & Pull").apply {
                    isVisible = false
                    isFocusPainted = false
                    cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
                    background = JBColor.namedColor("Button.startBackground", JBColor(0xB5740D, 0xBBB529))
                    addActionListener { returnToMainAndPull() }
                }
                add(returnToMainButton)
            }
            add(branchIndicatorPanel)
            add(Box.createVerticalStrut(12))

            // Get Latest from GitHub section
            add(createButtonGroup(
                "📥 Get Latest from GitHub",
                listOf(
                    ActionButton("Pull & Sync", true) { pullAndSync() },
                    ActionButton("Force Pull & Sync", false) { forcePullAndSync() }
                ),
                "<html><b>Pull & Sync:</b> Pulls remote changes and merges with local (local-only prompts move to Private).<br/><b>Force Pull & Sync:</b> Discards ALL local changes and resets to match GitHub exactly.</html>"
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

