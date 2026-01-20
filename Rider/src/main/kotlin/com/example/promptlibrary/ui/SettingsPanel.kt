package com.example.promptlibrary.ui

import com.example.promptlibrary.events.LibraryEvents
import com.example.promptlibrary.settings.DEFAULT_LIBRARY_NAME
import com.example.promptlibrary.settings.LibraryConfig
import com.example.promptlibrary.settings.PluginSettingsService
import com.example.promptlibrary.settings.discoverLibraries
import com.example.promptlibrary.settings.getHiddenLibraryPaths
import com.example.promptlibrary.settings.titleCase
import com.example.promptlibrary.ui.dialogs.SetupWizardDialog
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.*
import javax.swing.*

/**
 * Settings Panel - embedded directly in the tool window as a tab.
 * Replaces the need to open the separate Settings dialog.
 */
class SettingsPanel(private val project: Project) : JPanel(BorderLayout()) {
    
    // Note: remoteRepoUrl is now internal-only (hidden from UI, auto-detected from git)
    // Note: writeStrategy is removed from UI (both buttons available in Sync Ops panel)
    // Note: libraryCombo and libraryFolderField removed - libraries are auto-discovered from disk
    private lateinit var repoField: JTextField
    private lateinit var hiddenLibrariesPanel: JPanel
    private lateinit var branchField: JTextField
    private lateinit var autoFetchCheckbox: JCheckBox
    private lateinit var autoFetchMinutesField: JSpinner

    private var isDirty = false
    private var availableLibraries = mutableListOf<LibraryConfig>()
    private val libraryCheckboxes = mutableMapOf<String, JCheckBox>()

    init {
        border = JBUI.Borders.empty(12)
        try {
            buildUI()
        } catch (e: Exception) {
            // Show error message if UI fails to build
            add(JBLabel("Error initializing settings: ${e.message}").apply {
                foreground = JBColor.RED
            }, java.awt.BorderLayout.CENTER)
            e.printStackTrace()
        }
    }

    private fun buildUI() {
        val mainPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
        }
        
        // Settings Form Card
        mainPanel.add(createSettingsFormCard())
        mainPanel.add(Box.createVerticalStrut(12))
        
        // Info Card
        mainPanel.add(createInfoCard())
        mainPanel.add(Box.createVerticalStrut(12))
        
        // Action Buttons
        mainPanel.add(createButtonPanel())
        
        // Wrap in scroll pane
        val scrollPane = JScrollPane(mainPanel).apply {
            border = null
            verticalScrollBarPolicy = JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED
            horizontalScrollBarPolicy = JScrollPane.HORIZONTAL_SCROLLBAR_NEVER
        }
        
        add(scrollPane, BorderLayout.CENTER)
    }

    private fun createSettingsFormCard(): JPanel {
        return createCard("Git Sync Settings") {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            
            val settings = PluginSettingsService.instance().data
            val fieldHeight = 28

            // Setup Wizard button
            add(JPanel(FlowLayout(FlowLayout.LEFT, 0, 0)).apply {
                isOpaque = false
                alignmentX = Component.LEFT_ALIGNMENT
                maximumSize = Dimension(Int.MAX_VALUE, 30)
                add(createStyledButton("Setup Wizard...", true) {
                    launchSetupWizard()
                })
                add(Box.createHorizontalStrut(8))
                add(JBLabel("Configure repository with guided setup").apply {
                    font = font.deriveFont(11f)
                    foreground = JBColor.namedColor("Label.disabledForeground", JBColor.GRAY)
                })
            })
            add(Box.createVerticalStrut(12))

            // Repo Path (primary setting - remoteRepoUrl is now internal/auto-detected)
            repoField = JTextField(settings.repoPath).apply {
                preferredSize = Dimension(0, fieldHeight)
                maximumSize = Dimension(Int.MAX_VALUE, fieldHeight)
                addCaretListener { markDirty() }
            }
            add(createLabeledField("Local Repository Path:", repoField))
            add(Box.createVerticalStrut(8))

            // Library discovery - libraries are auto-discovered from disk
            refreshAvailableLibraries(settings.repoPath)

            // Library action buttons
            add(JPanel(FlowLayout(FlowLayout.LEFT, 0, 0)).apply {
                isOpaque = false
                alignmentX = Component.LEFT_ALIGNMENT
                maximumSize = Dimension(Int.MAX_VALUE, 30)
                add(createStyledButton("Refresh Libraries", false) {
                    refreshAvailableLibraries(repoField.text.trim())
                    updateHiddenLibrariesPanel()
                })
                add(Box.createHorizontalStrut(8))
                add(createStyledButton("+ New Library", false) {
                    createNewLibrary()
                })
            })
            add(Box.createVerticalStrut(12))

            // Hidden Libraries Section (Multi-Library Support - opt-out approach)
            add(JBLabel("Hidden Libraries:").apply {
                font = font.deriveFont(Font.BOLD, 12f)
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(4))
            add(createHintLabel("Check libraries to HIDE from the prompt tree."))
            add(Box.createVerticalStrut(4))

            hiddenLibrariesPanel = JPanel().apply {
                layout = BoxLayout(this, BoxLayout.Y_AXIS)
                alignmentX = Component.LEFT_ALIGNMENT
                isOpaque = false
            }
            add(hiddenLibrariesPanel)
            updateHiddenLibrariesPanel()
            add(Box.createVerticalStrut(8))
            
            // Branch Name
            branchField = JTextField(settings.branchName).apply {
                preferredSize = Dimension(0, fieldHeight)
                maximumSize = Dimension(Int.MAX_VALUE, fieldHeight)
                addCaretListener { markDirty() }
            }
            add(createLabeledField("Branch Name:", branchField))
            add(createHintLabel("Leave blank to auto-detect (optional, for PR branches)"))
            add(Box.createVerticalStrut(12))

            // Note: writeStrategy removed from UI - both Direct Commit and PR buttons
            // are available in SyncOps panel, matching VSCode behavior

            // Auto-fetch checkbox
            autoFetchCheckbox = JCheckBox("Enable periodic auto-fetch", settings.autoFetchEnabled).apply {
                addActionListener { markDirty() }
            }
            add(autoFetchCheckbox)
            add(Box.createVerticalStrut(4))
            
            // Auto-fetch interval
            autoFetchMinutesField = JSpinner(SpinnerNumberModel(settings.autoFetchMinutes, 1, 120, 1)).apply {
                maximumSize = Dimension(80, fieldHeight)
                addChangeListener { markDirty() }
            }
            add(createLabeledField("Fetch interval (minutes):", autoFetchMinutesField))
        }
    }

    private fun createInfoCard(): JPanel {
        return createCard("Settings Guide") {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)

            add(JLabel("<html><b>Repository Path:</b> Supports ~ expansion (e.g., ~/PromptLibrary)</html>"))
            add(Box.createVerticalStrut(4))
            add(JLabel("<html><b>Libraries:</b> Auto-discovered from disk. Use + New Library to create.</html>"))
            add(Box.createVerticalStrut(4))
            add(JLabel("<html><b>Sync Options:</b> Use the Sync Ops tab for commit operations</html>"))
            add(JLabel("<html>&nbsp;&nbsp;• Quick Commit: Push directly to current branch</html>"))
            add(JLabel("<html>&nbsp;&nbsp;• Create Pull Request: Create a new branch for review</html>"))
        }
    }

    private fun createButtonPanel(): JPanel {
        return JPanel(FlowLayout(FlowLayout.LEFT, 8, 0)).apply {
            isOpaque = false
            maximumSize = Dimension(Int.MAX_VALUE, 40)
            alignmentX = Component.LEFT_ALIGNMENT

            add(createStyledButton("Apply", true) { applySettings() })
            add(createStyledButton("Reset", false) { resetSettings() })
        }
    }

    private fun createLabeledField(label: String, field: JComponent): JPanel {
        return JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.LEFT_ALIGNMENT
            isOpaque = false

            add(JBLabel(label).apply {
                font = font.deriveFont(Font.BOLD, 12f)
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(4))
            add(field.apply {
                alignmentX = Component.LEFT_ALIGNMENT
            })

            maximumSize = Dimension(Int.MAX_VALUE, 50)
        }
    }

    private fun createHintLabel(text: String): JLabel {
        return JLabel(text).apply {
            font = font.deriveFont(11f)
            foreground = JBColor.GRAY
            alignmentX = Component.LEFT_ALIGNMENT
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

    private fun createCard(title: String, contentBuilder: JPanel.() -> Unit): JPanel {
        return JPanel(BorderLayout()).apply {
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(JBColor.namedColor("Borders.color", JBColor.GRAY), 1),
                JBUI.Borders.empty()
            )
            background = JBColor.namedColor("EditorPane.background", background)
            alignmentX = Component.LEFT_ALIGNMENT

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

    private fun markDirty() {
        isDirty = true
    }

    private fun refreshAvailableLibraries(repoPath: String) {
        availableLibraries.clear()
        if (repoPath.isNotBlank()) {
            val expandedPath = expandTilde(repoPath)
            availableLibraries.addAll(discoverLibraries(expandedPath))
        } else {
            // Add default library if no repo path
            availableLibraries.add(
                LibraryConfig(
                    id = DEFAULT_LIBRARY_NAME,
                    path = DEFAULT_LIBRARY_NAME,
                    displayName = titleCase(DEFAULT_LIBRARY_NAME),
                    enabled = true
                )
            )
        }
    }

    private fun updateHiddenLibrariesPanel() {
        hiddenLibrariesPanel.removeAll()
        libraryCheckboxes.clear()

        // Opt-out approach: get currently hidden libraries
        val currentlyHidden = getHiddenLibraryPaths().toSet()

        if (availableLibraries.isEmpty()) {
            hiddenLibrariesPanel.add(JLabel("No libraries found. Set repo path and click Refresh.").apply {
                foreground = JBColor.GRAY
            })
        } else {
            for (lib in availableLibraries) {
                val isHidden = currentlyHidden.contains(lib.path)

                val checkbox = JCheckBox("${lib.displayName} [${lib.path}]").apply {
                    // Checkbox checked = library is HIDDEN
                    this.isSelected = isHidden
                    toolTipText = "Check to hide this library from the prompt tree"
                    addActionListener { markDirty() }
                }
                libraryCheckboxes[lib.path] = checkbox
                hiddenLibrariesPanel.add(checkbox)
            }
        }

        hiddenLibrariesPanel.revalidate()
        hiddenLibrariesPanel.repaint()
    }

    private fun getSelectedHiddenLibraries(): List<String> {
        // Return libraries that are checked (i.e., should be hidden)
        return libraryCheckboxes.filter { (_, checkbox) -> checkbox.isSelected }.map { it.key }
    }

    private fun expandTilde(path: String): String {
        return if (path.startsWith("~/") || path == "~") {
            System.getProperty("user.home") + path.substring(1)
        } else {
            path
        }
    }

    private fun createNewLibrary() {
        val repoPath = repoField.text.trim()
        if (repoPath.isBlank()) {
            Notifications.Bus.notify(
                Notification(
                    "PromptLibrary",
                    "Cannot Create Library",
                    "Please set the repository path first.",
                    NotificationType.WARNING
                )
            )
            return
        }

        // Show input dialog for library name
        val libraryName = javax.swing.JOptionPane.showInputDialog(
            this,
            "Enter a name for the new library folder:",
            "Create New Library",
            javax.swing.JOptionPane.PLAIN_MESSAGE
        )

        if (libraryName.isNullOrBlank()) {
            return
        }

        // Validate library name (no special characters, spaces become underscores)
        val sanitizedName = libraryName.trim()
            .lowercase()
            .replace(Regex("[^a-z0-9_-]"), "_")
            .replace(Regex("_+"), "_")
            .trim('_')

        if (sanitizedName.isBlank()) {
            Notifications.Bus.notify(
                Notification(
                    "PromptLibrary",
                    "Invalid Library Name",
                    "Library name must contain at least one alphanumeric character.",
                    NotificationType.WARNING
                )
            )
            return
        }

        // Check if library already exists
        val expandedRepoPath = expandTilde(repoPath)
        val libraryDir = java.io.File(expandedRepoPath, sanitizedName)
        if (libraryDir.exists()) {
            Notifications.Bus.notify(
                Notification(
                    "PromptLibrary",
                    "Library Already Exists",
                    "A library folder named '$sanitizedName' already exists.",
                    NotificationType.WARNING
                )
            )
            return
        }

        // Create the library folder with a prompts subdirectory
        try {
            val promptsDir = java.io.File(libraryDir, "prompts")
            promptsDir.mkdirs()

            // Create a placeholder README in the library folder
            java.io.File(libraryDir, "README.md").writeText(
                "# ${titleCase(sanitizedName)} Library\n\nThis library was created for organizing prompts.\n"
            )

            Notifications.Bus.notify(
                Notification(
                    "PromptLibrary",
                    "Library Created",
                    "Created new library: ${titleCase(sanitizedName)} at ${libraryDir.absolutePath}",
                    NotificationType.INFORMATION
                )
            )

            // Refresh the libraries list to show the new library
            refreshAvailableLibraries(repoPath)
            updateHiddenLibrariesPanel()

            // Notify listeners that library settings changed
            LibraryEvents.fireChanged()

        } catch (e: Exception) {
            Notifications.Bus.notify(
                Notification(
                    "PromptLibrary",
                    "Failed to Create Library",
                    "Error: ${e.message}",
                    NotificationType.ERROR
                )
            )
        }
    }

    private fun applySettings() {
        val svc = PluginSettingsService.instance()
        val data = svc.data

        // Note: remoteRepoUrl is now internal-only (auto-detected from git)
        // Note: promptsSubdir (active library) removed - libraries are contextual based on tree position
        data.repoPath = repoField.text.trim()

        // Save hidden libraries (opt-out approach matching VS Code)
        val hiddenLibs = getSelectedHiddenLibraries()
        data.hiddenLibraries = hiddenLibs.toMutableList()

        data.branchName = branchField.text.trim()
        // Note: writeStrategy removed from UI - both buttons available in SyncOps
        data.autoFetchEnabled = autoFetchCheckbox.isSelected
        data.autoFetchMinutes = autoFetchMinutesField.value as Int

        isDirty = false

        // Show notification
        val visibleCount = availableLibraries.size - hiddenLibs.size
        val message = if (hiddenLibs.isNotEmpty()) {
            "Settings applied. $visibleCount libraries visible, ${hiddenLibs.size} hidden."
        } else {
            "Settings applied. All ${availableLibraries.size} libraries visible."
        }
        Notifications.Bus.notify(
            Notification(
                "PromptLibrary",
                "Settings Saved",
                message,
                NotificationType.INFORMATION
            )
        )

        // Notify listeners that library settings changed
        LibraryEvents.fireChanged()
    }

    private fun resetSettings() {
        val settings = PluginSettingsService.instance().data

        // Note: remoteRepoUrl is now internal-only (auto-detected from git)
        // Note: promptsSubdir (active library) removed - libraries are contextual
        repoField.text = settings.repoPath
        branchField.text = settings.branchName
        // Note: writeStrategy removed from UI - both buttons available in SyncOps
        autoFetchCheckbox.isSelected = settings.autoFetchEnabled
        autoFetchMinutesField.value = settings.autoFetchMinutes

        // Refresh hidden libraries panel
        refreshAvailableLibraries(settings.repoPath)
        updateHiddenLibrariesPanel()

        isDirty = false
    }

    private fun launchSetupWizard() {
        val dialog = SetupWizardDialog(project) { result ->
            // Update settings from wizard result
            val settings = PluginSettingsService.instance().data
            settings.repoPath = result.repoPath
            if (result.remoteUrl != null) {
                settings.remoteRepoUrl = result.remoteUrl
            }

            // Update UI fields
            repoField.text = result.repoPath

            // Refresh libraries
            refreshAvailableLibraries(result.repoPath)
            updateHiddenLibrariesPanel()

            Notifications.Bus.notify(
                Notification(
                    "PromptLibrary",
                    "Setup Complete",
                    "Repository configured: ${result.repoPath}",
                    NotificationType.INFORMATION
                )
            )
        }
        dialog.show()
    }
}

