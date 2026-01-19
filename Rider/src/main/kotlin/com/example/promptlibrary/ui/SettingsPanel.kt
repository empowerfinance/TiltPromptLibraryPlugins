package com.example.promptlibrary.ui

import com.example.promptlibrary.events.LibraryEvents
import com.example.promptlibrary.settings.DEFAULT_LIBRARY_NAME
import com.example.promptlibrary.settings.LibraryConfig
import com.example.promptlibrary.settings.PluginSettingsService
import com.example.promptlibrary.settings.discoverLibraries
import com.example.promptlibrary.settings.titleCase
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
    
    private lateinit var remoteUrlField: JTextField
    private lateinit var repoField: JTextField
    private lateinit var libraryCombo: JComboBox<LibraryConfig>
    private lateinit var libraryFolderField: JTextField
    private lateinit var enabledLibrariesPanel: JPanel
    private lateinit var branchField: JTextField
    private lateinit var strategyCombo: JComboBox<PluginSettingsService.WriteStrategy>
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
            
            // Remote URL
            remoteUrlField = JTextField(settings.remoteRepoUrl).apply {
                preferredSize = Dimension(0, fieldHeight)
                maximumSize = Dimension(Int.MAX_VALUE, fieldHeight)
                addCaretListener { markDirty() }
            }
            add(createLabeledField("Remote Git URL:", remoteUrlField))
            add(Box.createVerticalStrut(8))
            
            // Repo Path
            repoField = JTextField(settings.repoPath).apply {
                preferredSize = Dimension(0, fieldHeight)
                maximumSize = Dimension(Int.MAX_VALUE, fieldHeight)
                addCaretListener { markDirty() }
            }
            add(createLabeledField("Local Repository Path:", repoField))
            add(Box.createVerticalStrut(8))
            
            // Library Selection
            // First, discover available libraries
            refreshAvailableLibraries(settings.repoPath)

            // Library Folder (manual entry) - must be created BEFORE libraryCombo since combo references it
            libraryFolderField = JTextField(settings.promptsSubdir).apply {
                preferredSize = Dimension(0, fieldHeight)
                maximumSize = Dimension(Int.MAX_VALUE, fieldHeight)
                addCaretListener { markDirty() }
            }

            // Library dropdown
            libraryCombo = JComboBox<LibraryConfig>().apply {
                preferredSize = Dimension(0, fieldHeight)
                maximumSize = Dimension(Int.MAX_VALUE, fieldHeight)
                renderer = object : DefaultListCellRenderer() {
                    override fun getListCellRendererComponent(
                        list: JList<*>?, value: Any?, index: Int, isSelected: Boolean, cellHasFocus: Boolean
                    ): Component {
                        val c = super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus)
                        if (value is LibraryConfig) {
                            text = value.displayName
                        }
                        return c
                    }
                }
                addActionListener {
                    val selected = selectedItem as? LibraryConfig
                    if (selected != null && ::libraryFolderField.isInitialized) {
                        libraryFolderField.text = selected.path
                    }
                    markDirty()
                }
            }
            updateLibraryCombo(settings.promptsSubdir)
            add(createLabeledField("Select Library:", libraryCombo))
            add(Box.createVerticalStrut(4))

            add(createLabeledField("Library Folder (manual):", libraryFolderField))
            add(createHintLabel("Select from dropdown above or enter a custom folder name"))
            add(Box.createVerticalStrut(4))

            // Library action buttons
            add(JPanel(FlowLayout(FlowLayout.LEFT, 0, 0)).apply {
                isOpaque = false
                alignmentX = Component.LEFT_ALIGNMENT
                maximumSize = Dimension(Int.MAX_VALUE, 30)
                add(createStyledButton("Refresh Libraries", false) {
                    refreshAvailableLibraries(repoField.text.trim())
                    updateLibraryCombo(libraryFolderField.text)
                    updateEnabledLibrariesPanel()
                })
                add(Box.createHorizontalStrut(8))
                add(createStyledButton("+ New Library", false) {
                    createNewLibrary()
                })
            })
            add(Box.createVerticalStrut(12))

            // Enabled Libraries Section (Multi-Library Support)
            add(JBLabel("Enabled Libraries:").apply {
                font = font.deriveFont(Font.BOLD, 12f)
                alignmentX = Component.LEFT_ALIGNMENT
            })
            add(Box.createVerticalStrut(4))
            add(createHintLabel("Check libraries to include in the prompt tree. Active library is always included."))
            add(Box.createVerticalStrut(4))

            enabledLibrariesPanel = JPanel().apply {
                layout = BoxLayout(this, BoxLayout.Y_AXIS)
                alignmentX = Component.LEFT_ALIGNMENT
                isOpaque = false
            }
            add(enabledLibrariesPanel)
            updateEnabledLibrariesPanel()
            add(Box.createVerticalStrut(8))
            
            // Branch Name
            branchField = JTextField(settings.branchName).apply {
                preferredSize = Dimension(0, fieldHeight)
                maximumSize = Dimension(Int.MAX_VALUE, fieldHeight)
                addCaretListener { markDirty() }
            }
            add(createLabeledField("Branch Name:", branchField))
            add(createHintLabel("Leave blank to auto-detect, or specify for Branch+PR strategy"))
            add(Box.createVerticalStrut(8))
            
            // Write Strategy
            strategyCombo = JComboBox(PluginSettingsService.WriteStrategy.values()).apply {
                selectedItem = settings.writeStrategy
                maximumSize = Dimension(Int.MAX_VALUE, fieldHeight)
                addActionListener { markDirty() }
            }
            add(createLabeledField("Write Strategy:", strategyCombo))
            add(createHintLabel("DIRECT = commit to current branch, BRANCH_PR = create new branch"))
            add(Box.createVerticalStrut(12))
            
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
            add(JLabel("<html><b>Library Folder:</b> Different teams can use different folders</html>"))
            add(Box.createVerticalStrut(4))
            add(JLabel("<html><b>Write Strategy:</b></html>"))
            add(JLabel("<html>&nbsp;&nbsp;• DIRECT: Commits directly to current branch</html>"))
            add(JLabel("<html>&nbsp;&nbsp;• BRANCH_PR: Creates a new branch for changes</html>"))
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

    private fun updateLibraryCombo(currentLibraryPath: String) {
        libraryCombo.removeAllItems()
        for (lib in availableLibraries) {
            libraryCombo.addItem(lib)
        }
        // Select the current library
        val currentLib = availableLibraries.find { it.path == currentLibraryPath }
        if (currentLib != null) {
            libraryCombo.selectedItem = currentLib
        } else if (availableLibraries.isNotEmpty()) {
            libraryCombo.selectedIndex = 0
        }
    }

    private fun updateEnabledLibrariesPanel() {
        enabledLibrariesPanel.removeAll()
        libraryCheckboxes.clear()

        val currentlyEnabled = PluginSettingsService.getEnabledLibraryPaths().toSet()
        // Use safe access since this may be called before libraryFolderField is initialized
        val activeLibrary = if (::libraryFolderField.isInitialized) {
            libraryFolderField.text.trim().ifEmpty { DEFAULT_LIBRARY_NAME }
        } else {
            PluginSettingsService.instance().data.promptsSubdir.ifEmpty { DEFAULT_LIBRARY_NAME }
        }

        if (availableLibraries.isEmpty()) {
            enabledLibrariesPanel.add(JLabel("No libraries found. Set repo path and click Refresh.").apply {
                foreground = JBColor.GRAY
            })
        } else {
            for (lib in availableLibraries) {
                val isActive = lib.path == activeLibrary
                val isEnabled = currentlyEnabled.isEmpty() && isActive || currentlyEnabled.contains(lib.path)

                val checkbox = JCheckBox("${lib.displayName} [${lib.path}]").apply {
                    this.isSelected = isEnabled
                    this.isEnabled = !isActive  // Active library is always enabled
                    if (isActive) {
                        toolTipText = "Active library (always enabled)"
                    }
                    addActionListener { markDirty() }
                }
                libraryCheckboxes[lib.path] = checkbox
                enabledLibrariesPanel.add(checkbox)
            }
        }

        enabledLibrariesPanel.revalidate()
        enabledLibrariesPanel.repaint()
    }

    private fun getSelectedEnabledLibraries(): List<String> {
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

            // Refresh the libraries list
            refreshAvailableLibraries(repoPath)
            updateLibraryCombo(sanitizedName)
            updateEnabledLibrariesPanel()

            // Set the new library as active
            libraryFolderField.text = sanitizedName
            markDirty()

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

        data.remoteRepoUrl = remoteUrlField.text.trim()
        data.repoPath = repoField.text.trim()
        data.promptsSubdir = libraryFolderField.text.trim().ifEmpty { DEFAULT_LIBRARY_NAME }

        // Save enabled libraries
        val enabledLibs = getSelectedEnabledLibraries()
        data.enabledLibraries = enabledLibs.toMutableList()

        data.branchName = branchField.text.trim()
        data.writeStrategy = strategyCombo.selectedItem as PluginSettingsService.WriteStrategy
        data.autoFetchEnabled = autoFetchCheckbox.isSelected
        data.autoFetchMinutes = autoFetchMinutesField.value as Int

        isDirty = false

        // Show notification
        val libraryName = titleCase(data.promptsSubdir)
        val enabledCount = enabledLibs.size
        val message = if (enabledCount > 1) {
            "Settings applied. Active: $libraryName, $enabledCount libraries enabled."
        } else {
            "Settings applied. Active library: $libraryName"
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

        remoteUrlField.text = settings.remoteRepoUrl
        repoField.text = settings.repoPath
        libraryFolderField.text = settings.promptsSubdir
        branchField.text = settings.branchName
        strategyCombo.selectedItem = settings.writeStrategy
        autoFetchCheckbox.isSelected = settings.autoFetchEnabled
        autoFetchMinutesField.value = settings.autoFetchMinutes

        // Refresh enabled libraries panel
        refreshAvailableLibraries(settings.repoPath)
        updateLibraryCombo(settings.promptsSubdir)
        updateEnabledLibrariesPanel()

        isDirty = false
    }
}

