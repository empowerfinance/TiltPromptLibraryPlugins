package com.example.promptlibrary.settings

import com.intellij.openapi.options.Configurable
import javax.swing.*

class PluginSettingsConfigurable : Configurable {
    private var panel: JPanel? = null
    private lateinit var remoteUrlField: JTextField
    private lateinit var repoField: JTextField
    private lateinit var subdirField: JTextField
    private lateinit var branchField: JTextField
    private lateinit var strategyCombo: JComboBox<PluginSettingsService.WriteStrategy>
    private lateinit var autoFetchCheckbox: JCheckBox
    private lateinit var autoFetchMinutesField: JSpinner

    override fun getDisplayName(): String = "Prompt Library: Git Sync"

    override fun createComponent(): JComponent {
        val s = PluginSettingsService.instance().data
        remoteUrlField = JTextField(s.remoteRepoUrl)
        repoField = JTextField(s.repoPath)
        subdirField = JTextField(s.promptsSubdir)
        branchField = JTextField(s.branchName)
        strategyCombo = JComboBox(PluginSettingsService.WriteStrategy.values()).apply { selectedItem = s.writeStrategy }
        autoFetchCheckbox = JCheckBox("Enable auto-fetch (fetch only)", s.autoFetchEnabled)
        autoFetchMinutesField = JSpinner(SpinnerNumberModel(s.autoFetchMinutes, 1, 120, 1))

        panel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            val fieldHeight = 28
            listOf(remoteUrlField, repoField, subdirField, branchField).forEach { f ->
                f.preferredSize = java.awt.Dimension(0, fieldHeight)
                f.maximumSize = java.awt.Dimension(Int.MAX_VALUE, fieldHeight)
            }
            // Combo box height tweak
            strategyCombo.maximumSize = java.awt.Dimension(Int.MAX_VALUE, fieldHeight)
            autoFetchMinutesField.maximumSize = java.awt.Dimension(80, fieldHeight)

            add(labeled("Remote Git URL for the shared prompts repository (optional for local-only mode):", remoteUrlField))
            add(labeled("Local path to the repo root where shared prompts YAML will be written:", repoField))
            add(labeled("Subdirectory name for prompts under each group directory:", subdirField))
            add(labeled("Branch name to use when Write Strategy is 'branchPR':", branchField))
            add(labeled("Writing strategy for sync: direct commit vs dedicated branch and PR:", strategyCombo))
            add(autoFetchCheckbox.apply {
                text = "Enable periodic auto-fetch for the repo"
            })
            add(labeled("Fetch interval in minutes when auto-fetch is enabled:", autoFetchMinutesField))

            add(Box.createVerticalStrut(12))

            // Add helpful info text matching VS Code's descriptions
            val infoPanel = JPanel().apply {
                layout = BoxLayout(this, BoxLayout.Y_AXIS)
                border = BorderFactory.createCompoundBorder(
                    BorderFactory.createLineBorder(com.intellij.ui.JBColor.border(), 1, true),
                    com.intellij.util.ui.JBUI.Borders.empty(8)
                )
                background = com.intellij.ui.JBColor.namedColor("Panel.background", com.intellij.ui.JBColor.background())

                add(JLabel("<html><b>Settings Guide:</b></html>").apply {
                    font = font.deriveFont(java.awt.Font.BOLD)
                })
                add(Box.createVerticalStrut(4))
                add(JLabel("<html><b>repoPath</b>: Supports tilde (~) expansion. Default: ~/PromptLibrary</html>"))
                add(JLabel("<html><b>promptsSubdir</b>: Subdirectory for prompts. Default: prompts</html>"))
                add(JLabel("<html><b>branchName</b>: Leave blank to use current branch, or specify for Branch+PR strategy</html>"))
                add(JLabel("<html><b>writeStrategy</b>: 'direct' commits to current branch, 'branchPR' creates a new branch</html>"))

                maximumSize = java.awt.Dimension(Int.MAX_VALUE, 120)
            }
            add(infoPanel)

            add(Box.createVerticalStrut(12))

            // Note about destructive actions
            add(JLabel("<html><i>Tip: Destructive actions (wipe library, reset) are available in the Sync Ops tab.</i></html>").apply {
                foreground = com.intellij.ui.JBColor.GRAY
            })
        }
        return panel as JPanel
    }

    private fun labeled(label: String, field: JComponent): JPanel = JPanel().apply {
        layout = BoxLayout(this, BoxLayout.X_AXIS)
        add(JLabel(label))
        add(Box.createHorizontalStrut(8))
        add(field)
    }

    override fun isModified(): Boolean {
        val s = PluginSettingsService.instance().data
        return remoteUrlField.text != s.remoteRepoUrl ||
                repoField.text != s.repoPath ||
                subdirField.text != s.promptsSubdir ||
                branchField.text != s.branchName ||
                strategyCombo.selectedItem != s.writeStrategy ||
                autoFetchCheckbox.isSelected != s.autoFetchEnabled ||
                (autoFetchMinutesField.value as Int) != s.autoFetchMinutes
    }

    override fun apply() {
        val svc = PluginSettingsService.instance()
        val s = svc.data
        s.remoteRepoUrl = remoteUrlField.text.trim()
        s.repoPath = repoField.text.trim()
        s.promptsSubdir = subdirField.text.trim().ifEmpty { "prompts" }
        s.branchName = branchField.text.trim()
        s.writeStrategy = strategyCombo.selectedItem as PluginSettingsService.WriteStrategy
        s.autoFetchEnabled = autoFetchCheckbox.isSelected
        s.autoFetchMinutes = (autoFetchMinutesField.value as Int)
    }

    override fun reset() {
        val s = PluginSettingsService.instance().data
        remoteUrlField.text = s.remoteRepoUrl
        repoField.text = s.repoPath
        subdirField.text = s.promptsSubdir
        branchField.text = s.branchName
        strategyCombo.selectedItem = s.writeStrategy
        autoFetchCheckbox.isSelected = s.autoFetchEnabled
        autoFetchMinutesField.value = s.autoFetchMinutes
    }

    override fun disposeUIResources() { panel = null }
}

