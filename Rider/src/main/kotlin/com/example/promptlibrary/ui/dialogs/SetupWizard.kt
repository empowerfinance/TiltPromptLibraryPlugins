package com.example.promptlibrary.ui.dialogs

import com.example.promptlibrary.settings.PluginSettingsService
import com.example.promptlibrary.sync.SyncLog
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBRadioButton
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.io.File
import javax.swing.*

/**
 * Validation utilities for the Setup Wizard.
 */
object SetupWizardValidator {
    /**
     * Validates a Git URL.
     * @return null if valid, error message if invalid
     */
    fun validateGitUrl(url: String): String? {
        val trimmed = url.trim()
        if (trimmed.isEmpty()) {
            return "Git URL is required"
        }
        // Accept SSH URLs (git@...) or HTTPS URLs (https://...)
        val sshPattern = Regex("^git@[\\w.-]+:[\\w./-]+(?:\\.git)?$")
        val httpsPattern = Regex("^https?://[\\w.-]+/[\\w./-]+(?:\\.git)?$")
        
        if (!sshPattern.matches(trimmed) && !httpsPattern.matches(trimmed)) {
            return "Please enter a valid Git URL (SSH or HTTPS)"
        }
        return null
    }

    /**
     * Validates a folder name.
     * @return null if valid, error message if invalid
     */
    fun validateFolderName(name: String): String? {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) {
            return "Folder name is required"
        }
        if (!Regex("^[a-zA-Z0-9_-]+$").matches(trimmed)) {
            return "Use only letters, numbers, hyphens, and underscores"
        }
        return null
    }
}

/**
 * Actions for the Setup Wizard.
 */
object SetupWizardActions {
    data class CreateResult(val success: Boolean, val error: String? = null)

    /**
     * Creates the default library folder structure at the given path.
     * Creates just the library folder with a _library.yaml marker file.
     * No nested folders - user will add groups themselves.
     */
    fun createDefaultLibraryStructure(libraryPath: File): CreateResult {
        return try {
            // Create the library folder with a _library.yaml marker file
            val defaultLibPath = File(libraryPath, "general")
            defaultLibPath.mkdirs()

            val libraryYaml = File(defaultLibPath, "_library.yaml")
            libraryYaml.writeText("name: general\ndescription: \n")

            CreateResult(success = true)
        } catch (e: Exception) {
            CreateResult(success = false, error = e.message)
        }
    }

    /**
     * Detects the git remote URL from a folder.
     * @return the remote URL if detected, null otherwise
     */
    fun detectGitRemote(folder: File): String? {
        val gitDir = File(folder, ".git")
        if (!gitDir.exists()) {
            return null
        }
        
        // Try to read the remote URL from .git/config
        val configFile = File(gitDir, "config")
        if (!configFile.exists()) {
            return null
        }
        
        try {
            val configText = configFile.readText()
            // Look for [remote "origin"] section and extract url
            val remotePattern = Regex("""\[remote "origin"\][^\[]*url\s*=\s*(.+)""", RegexOption.MULTILINE)
            val match = remotePattern.find(configText)
            return match?.groupValues?.get(1)?.trim()
        } catch (e: Exception) {
            return null
        }
    }

    /**
     * Checks if a folder is a git repository.
     */
    fun isGitRepo(folder: File): Boolean {
        return File(folder, ".git").exists()
    }
}

/**
 * Setup Wizard Dialog - provides three flows for configuring the prompt library:
 * 1. Clone from Git URL
 * 2. Use existing folder (auto-detects git remote)
 * 3. Create new folder
 */
class SetupWizardDialog(
    private val project: Project,
    private val onComplete: (SetupResult) -> Unit
) : DialogWrapper(project) {

    data class SetupResult(
        val repoPath: String,
        val remoteUrl: String?,
        val flow: SetupFlow
    )

    enum class SetupFlow { CLONE, EXISTING, NEW }

    private val cloneRadio = JBRadioButton("Clone from Git URL")
    private val existingRadio = JBRadioButton("Use existing folder")
    private val newRadio = JBRadioButton("Create new folder")

    private val gitUrlField = JTextField(40)
    private val clonePathField = TextFieldWithBrowseButton()
    private val existingPathField = TextFieldWithBrowseButton()
    private val newParentPathField = TextFieldWithBrowseButton()
    private val newFolderNameField = JTextField("PromptLibrary", 20)

    private val clonePanel: JPanel
    private val existingPanel: JPanel
    private val newPanel: JPanel
    private val cardPanel: JPanel

    init {
        title = "Setup Prompt Library"

        // Setup radio button group
        val group = ButtonGroup()
        group.add(cloneRadio)
        group.add(existingRadio)
        group.add(newRadio)
        cloneRadio.isSelected = true

        // Setup file choosers
        clonePathField.addBrowseFolderListener(
            "Select Clone Destination",
            "Choose where to clone the repository",
            project,
            FileChooserDescriptorFactory.createSingleFolderDescriptor()
        )
        existingPathField.addBrowseFolderListener(
            "Select Existing Folder",
            "Choose an existing prompt library folder",
            project,
            FileChooserDescriptorFactory.createSingleFolderDescriptor()
        )
        newParentPathField.addBrowseFolderListener(
            "Select Parent Folder",
            "Choose where to create the new prompt library",
            project,
            FileChooserDescriptorFactory.createSingleFolderDescriptor()
        )

        // Create panels for each flow
        clonePanel = createClonePanel()
        existingPanel = createExistingPanel()
        newPanel = createNewPanel()

        // Card layout for switching between flows
        cardPanel = JPanel(java.awt.CardLayout()).apply {
            add(clonePanel, "clone")
            add(existingPanel, "existing")
            add(newPanel, "new")
        }

        // Radio button listeners
        cloneRadio.addActionListener { showCard("clone") }
        existingRadio.addActionListener { showCard("existing") }
        newRadio.addActionListener { showCard("new") }

        init()
    }

    private fun showCard(name: String) {
        (cardPanel.layout as java.awt.CardLayout).show(cardPanel, name)
    }

    private fun createClonePanel(): JPanel {
        return JPanel(GridBagLayout()).apply {
            border = JBUI.Borders.empty(8)
            val gbc = GridBagConstraints().apply {
                fill = GridBagConstraints.HORIZONTAL
                insets = JBUI.insets(4)
                gridx = 0
            }

            gbc.gridy = 0
            add(JBLabel("Git URL:"), gbc)
            gbc.gridy = 1
            add(gitUrlField, gbc)

            gbc.gridy = 2
            add(JBLabel("Clone to:"), gbc)
            gbc.gridy = 3
            add(clonePathField, gbc)
        }
    }

    private fun createExistingPanel(): JPanel {
        return JPanel(GridBagLayout()).apply {
            border = JBUI.Borders.empty(8)
            val gbc = GridBagConstraints().apply {
                fill = GridBagConstraints.HORIZONTAL
                insets = JBUI.insets(4)
                gridx = 0
            }

            gbc.gridy = 0
            add(JBLabel("Existing folder:"), gbc)
            gbc.gridy = 1
            add(existingPathField, gbc)
            gbc.gridy = 2
            add(JBLabel("(Git remote will be auto-detected if available)").apply {
                font = font.deriveFont(11f)
            }, gbc)
        }
    }

    private fun createNewPanel(): JPanel {
        return JPanel(GridBagLayout()).apply {
            border = JBUI.Borders.empty(8)
            val gbc = GridBagConstraints().apply {
                fill = GridBagConstraints.HORIZONTAL
                insets = JBUI.insets(4)
                gridx = 0
            }

            gbc.gridy = 0
            add(JBLabel("Parent folder:"), gbc)
            gbc.gridy = 1
            add(newParentPathField, gbc)

            gbc.gridy = 2
            add(JBLabel("Folder name:"), gbc)
            gbc.gridy = 3
            add(newFolderNameField, gbc)
        }
    }

    override fun createCenterPanel(): JComponent {
        val panel = JPanel(BorderLayout()).apply {
            border = JBUI.Borders.empty(12)
        }

        // Radio buttons panel
        val radioPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            border = JBUI.Borders.empty(0, 0, 12, 0)
            add(cloneRadio)
            add(existingRadio)
            add(newRadio)
        }

        panel.add(radioPanel, BorderLayout.NORTH)
        panel.add(cardPanel, BorderLayout.CENTER)

        return panel
    }

    override fun doOKAction() {
        when {
            cloneRadio.isSelected -> handleClone()
            existingRadio.isSelected -> handleExisting()
            newRadio.isSelected -> handleNew()
        }
    }

    private fun handleClone() {
        val gitUrl = gitUrlField.text.trim()
        val clonePath = clonePathField.text.trim()

        val urlError = SetupWizardValidator.validateGitUrl(gitUrl)
        if (urlError != null) {
            Messages.showErrorDialog(project, urlError, "Invalid Git URL")
            return
        }

        if (clonePath.isEmpty()) {
            Messages.showErrorDialog(project, "Please select a destination folder", "Clone Destination Required")
            return
        }

        // Clone would happen here (via GitRepoManager)
        onComplete(SetupResult(clonePath, gitUrl, SetupFlow.CLONE))
        super.doOKAction()
    }

    private fun handleExisting() {
        val existingPath = existingPathField.text.trim()

        if (existingPath.isEmpty()) {
            Messages.showErrorDialog(project, "Please select a folder", "Folder Required")
            return
        }

        val folder = File(existingPath)
        if (!folder.exists()) {
            Messages.showErrorDialog(project, "The selected folder does not exist", "Invalid Folder")
            return
        }

        // Auto-detect git remote
        val remoteUrl = SetupWizardActions.detectGitRemote(folder)

        onComplete(SetupResult(existingPath, remoteUrl, SetupFlow.EXISTING))
        super.doOKAction()
    }

    private fun handleNew() {
        val parentPath = newParentPathField.text.trim()
        val folderName = newFolderNameField.text.trim()

        if (parentPath.isEmpty()) {
            Messages.showErrorDialog(project, "Please select a parent folder", "Parent Folder Required")
            return
        }

        val nameError = SetupWizardValidator.validateFolderName(folderName)
        if (nameError != null) {
            Messages.showErrorDialog(project, nameError, "Invalid Folder Name")
            return
        }

        val newPath = File(parentPath, folderName)
        if (newPath.exists()) {
            Messages.showErrorDialog(project, "A folder with this name already exists", "Folder Exists")
            return
        }

        // Create the folder structure
        val result = SetupWizardActions.createDefaultLibraryStructure(newPath)
        if (!result.success) {
            Messages.showErrorDialog(project, "Failed to create folder: ${result.error}", "Error")
            return
        }

        onComplete(SetupResult(newPath.absolutePath, null, SetupFlow.NEW))
        super.doOKAction()
    }
}

