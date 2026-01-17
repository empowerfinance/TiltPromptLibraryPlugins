package com.example.promptlibrary.ui.components

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.ui.JBColor
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Cursor
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.Font
import javax.swing.*

/**
 * A UI component for composing new prompts with save functionality.
 *
 * This component handles the text input area and save button, with state management
 * for enabling/disabling based on whether a valid group is selected.
 */
class PromptComposer(
    private val onSave: (String, String?) -> SaveResult
) : JPanel(BorderLayout()) {

    private val titleField = JTextField().apply {
        toolTipText = "Defaults to first 20 characters of the prompt"
    }

    private val textArea = JTextArea(3, 40).apply {
        lineWrap = true
        wrapStyleWord = true
    }

    private val saveButton = JButton("Add prompt")
    private val hintLabel = JLabel("")
    private val selectedGroupLabel = JLabel("No group selected")

    private var isGroupSelected = false

    init {
        // Container for both cards
        val container = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            border = JBUI.Borders.empty(4, 0, 0, 0)
        }

        // First card: Quick Add header with selected group info
        val headerCard = JPanel(BorderLayout()).apply {
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(JBColor.border(), 1, true),
                JBUI.Borders.empty(8)
            )
            background = UIManager.getColor("Panel.background")

            val titleLabel = JLabel("Quick Add").apply {
                font = font.deriveFont(Font.BOLD, 12f)
            }

            selectedGroupLabel.apply {
                foreground = JBColor.namedColor("Label.infoForeground", JBColor.GRAY)
                font = font.deriveFont(10f)
                border = JBUI.Borders.emptyTop(2)
            }

            val leftPanel = JPanel().apply {
                layout = BoxLayout(this, BoxLayout.Y_AXIS)
                add(titleLabel)
                add(selectedGroupLabel)
                isOpaque = false
            }

            add(leftPanel, BorderLayout.WEST)
        }
        container.add(headerCard)
        container.add(Box.createVerticalStrut(4))

        // Second card: Title field, text area, and save button
        val composerCard = JPanel(BorderLayout()).apply {
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(JBColor.border(), 1, true),
                JBUI.Borders.empty(8)
            )
            background = UIManager.getColor("Panel.background")
        }

        // Title field section
        val titleSection = JPanel(BorderLayout()).apply {
            val titleLabel = JLabel("Title (optional)").apply {
                foreground = JBColor.namedColor("Label.infoForeground", JBColor.GRAY)
                font = font.deriveFont(10f)
                border = JBUI.Borders.emptyBottom(4)
            }
            add(titleLabel, BorderLayout.NORTH)
            add(titleField, BorderLayout.CENTER)
            border = JBUI.Borders.emptyBottom(8)
            isOpaque = false
        }
        composerCard.add(titleSection, BorderLayout.NORTH)

        // Center panel for text area and hint
        val centerPanel = JPanel(BorderLayout()).apply {
            // Compact text area with rounded scroll pane
            val scrollPane = JScrollPane(textArea).apply {
                border = BorderFactory.createLineBorder(JBColor.border(), 1, true)
                preferredSize = Dimension(0, 70)
                minimumSize = Dimension(0, 70)
            }
            add(scrollPane, BorderLayout.CENTER)

            // Compact hint label
            hintLabel.apply {
                border = JBUI.Borders.emptyTop(4)
                foreground = JBColor.namedColor("Label.infoForeground", JBColor.GRAY)
                font = font.deriveFont(10f)
            }
            add(hintLabel, BorderLayout.SOUTH)
            isOpaque = false
        }
        composerCard.add(centerPanel, BorderLayout.CENTER)

        // Save button with modern styling
        val buttonPanel = JPanel(FlowLayout(FlowLayout.RIGHT, 0, 0)).apply {
            border = JBUI.Borders.emptyTop(6)

            saveButton.apply {
                cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
                putClientProperty("JButton.buttonType", "default")

                addActionListener {
                    val text = textArea.text.trim()
                    if (text.isNotEmpty()) {
                        val rawTitle = titleField.text.trim()
                        val title = if (rawTitle.isEmpty()) null else rawTitle
                        val result = onSave(text, title)
                        when (result) {
                            is SaveResult.Success -> {
                                textArea.text = ""
                                titleField.text = ""
                                // Visual feedback
                                Notifications.Bus.notify(
                                    Notification(
                                        "PromptLibrary",
                                        "Prompt saved",
                                        "Your prompt has been added successfully",
                                        NotificationType.INFORMATION
                                    )
                                )
                            }
                            is SaveResult.Duplicate -> {
                                Notifications.Bus.notify(
                                    Notification(
                                        "PromptLibrary",
                                        "Duplicate prompt not added",
                                        "A similar prompt already exists",
                                        NotificationType.WARNING
                                    )
                                )
                            }
                            is SaveResult.Error -> {
                                Notifications.Bus.notify(
                                    Notification(
                                        "PromptLibrary",
                                        "Error saving prompt",
                                        result.message,
                                        NotificationType.ERROR
                                    )
                                )
                            }
                        }
                    }
                }
            }
            add(saveButton)
            isOpaque = false
        }
        composerCard.add(buttonPanel, BorderLayout.SOUTH)

        container.add(composerCard)
        add(container, BorderLayout.CENTER)

        // Auto-suggest title from first 20 chars if empty
        textArea.document.addDocumentListener(object : javax.swing.event.DocumentListener {
            override fun insertUpdate(e: javax.swing.event.DocumentEvent?) = updateTitleSuggestion()
            override fun removeUpdate(e: javax.swing.event.DocumentEvent?) = updateTitleSuggestion()
            override fun changedUpdate(e: javax.swing.event.DocumentEvent?) = updateTitleSuggestion()

            private fun updateTitleSuggestion() {
                if (titleField.text.trim().isEmpty()) {
                    val text = textArea.text.replace(Regex("[\r\n]+"), " ").take(20).trim()
                    titleField.text = text
                }
            }
        })

        // Initialize state
        updateState(false, null)
    }
    
    /**
     * Updates the composer state based on whether a group is selected.
     *
     * @param groupSelected true if a valid group is selected, false if a root is selected
     * @param groupName the name of the selected group, or null if no group is selected
     */
    fun updateState(groupSelected: Boolean, groupName: String?) {
        isGroupSelected = groupSelected

        // Update selected group label
        selectedGroupLabel.text = if (groupName != null) {
            "Selected group: $groupName"
        } else {
            "No group selected"
        }

        // Save button
        saveButton.isEnabled = groupSelected

        // Hint
        hintLabel.text = if (!groupSelected) "Select a group to enable composer" else ""

        // Title field
        titleField.isEditable = groupSelected
        titleField.background = if (!groupSelected) {
            UIManager.getColor("Panel.background")
        } else {
            UIManager.getColor("TextField.background")
        }

        // Text area
        textArea.isEditable = groupSelected
        textArea.background = if (!groupSelected) {
            UIManager.getColor("Panel.background")
        } else {
            UIManager.getColor("TextArea.background")
        }
        textArea.foreground = if (!groupSelected) {
            JBColor.GRAY
        } else {
            UIManager.getColor("TextArea.foreground")
        }

        // Update placeholder
        if (groupSelected && groupName != null) {
            textArea.toolTipText = "Write a new prompt for $groupName..."
        } else {
            textArea.toolTipText = "Select a group to enable the composer"
        }
    }
    
    /**
     * Clears the text area and title field.
     */
    fun clear() {
        textArea.text = ""
        titleField.text = ""
    }

    /**
     * Gets the current text in the composer.
     */
    fun getText(): String = textArea.text

    /**
     * Sets the text in the composer.
     */
    fun setText(text: String) {
        textArea.text = text
    }

    /**
     * Gets the current title in the composer.
     */
    fun getTitle(): String = titleField.text

    /**
     * Sets the title in the composer.
     */
    fun setTitle(title: String) {
        titleField.text = title
    }
}

/**
 * Result of a save operation.
 */
sealed class SaveResult {
    object Success : SaveResult()
    object Duplicate : SaveResult()
    data class Error(val message: String) : SaveResult()
}

