package com.example.promptlibrary.ui.components

import com.example.promptlibrary.model.Prompt
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
 * A unified UI component for both adding new prompts and editing existing ones.
 *
 * This component handles the text input area and save button, with state management
 * for enabling/disabling based on whether a valid group is selected.
 *
 * Modes:
 * - Add mode: Creates new prompts
 * - Edit mode: Updates existing prompts
 */
class PromptComposer(
    private val onSave: (String, String?) -> SaveResult,
    private val onUpdate: (Prompt, String, String?) -> SaveResult
) : JPanel(BorderLayout()) {

    private val titleField = JTextField().apply {
        toolTipText = "Defaults to first 20 characters of the prompt"
    }

    private val textArea = JTextArea(3, 40).apply {
        lineWrap = true
        wrapStyleWord = true
    }

    private val saveButton = JButton("Add prompt")
    private val cancelButton = JButton("Cancel").apply {
        isVisible = false
    }
    private val addNewButton = JButton("Add New").apply {
        isVisible = false
    }
    private val hintLabel = JLabel("")
    private val selectedGroupLabel = JLabel("No group selected")

    private var isGroupSelected = false
    private var editingPrompt: Prompt? = null
    private var editingGroupId: String? = null

    // Track original values for change detection
    private var originalTitle: String = ""
    private var originalText: String = ""

    init {
        // Single unified card containing everything
        val unifiedCard = JPanel(BorderLayout()).apply {
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createLineBorder(JBColor.border(), 1, true),
                JBUI.Borders.empty(8, 4, 8, 4) // top, left, bottom, right - tight horizontal padding
            )
            background = UIManager.getColor("Panel.background")
        }

        // Header section at the top
        val headerSection = JPanel(BorderLayout()).apply {
            val titleLabel = JLabel("View, Add and Edit").apply {
                font = font.deriveFont(Font.BOLD, 14f)
            }

            selectedGroupLabel.apply {
                foreground = JBColor.namedColor("Label.infoForeground", JBColor.GRAY)
                font = font.deriveFont(10f)
            }

            val leftPanel = JPanel().apply {
                layout = BoxLayout(this, BoxLayout.Y_AXIS)
                add(titleLabel)
                add(Box.createVerticalStrut(2))
                add(selectedGroupLabel)
                isOpaque = false
            }

            add(leftPanel, BorderLayout.WEST)
            border = JBUI.Borders.emptyBottom(12)
            isOpaque = false
        }
        unifiedCard.add(headerSection, BorderLayout.NORTH)

        // Content panel for form fields
        val contentPanel = JPanel(BorderLayout()).apply {
            isOpaque = false
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
        contentPanel.add(titleSection, BorderLayout.NORTH)

        // Center panel for text area and hint
        val centerPanel = JPanel(BorderLayout()).apply {
            // Text area with rounded scroll pane - grows vertically with panel
            val scrollPane = JScrollPane(textArea).apply {
                border = BorderFactory.createLineBorder(JBColor.border(), 1, true)
                minimumSize = Dimension(0, 70) // Minimum height
                // No preferredSize - allows it to grow with the split pane
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
        contentPanel.add(centerPanel, BorderLayout.CENTER)

        // Button panel with Add New, Save, and Cancel
        val buttonPanel = JPanel(BorderLayout()).apply {
            border = JBUI.Borders.emptyTop(6)

            // Left side: Add New button
            val leftButtons = JPanel(FlowLayout(FlowLayout.LEFT, 4, 0)).apply {
                isOpaque = false
                addNewButton.apply {
                    cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
                    addActionListener {
                        exitEditMode()
                    }
                }
                add(addNewButton)
            }

            // Right side: Save and Cancel buttons
            val rightButtons = JPanel(FlowLayout(FlowLayout.RIGHT, 4, 0)).apply {
                isOpaque = false

                cancelButton.apply {
                    cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
                    addActionListener {
                        exitEditMode()
                    }
                }

                saveButton.apply {
                cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
                putClientProperty("JButton.buttonType", "default")

                addActionListener {
                    val text = textArea.text.trim()
                    if (text.isNotEmpty()) {
                        val rawTitle = titleField.text.trim()
                        val title = if (rawTitle.isEmpty()) null else rawTitle

                        val result = if (editingPrompt != null) {
                            // Edit mode
                            onUpdate(editingPrompt!!, text, title)
                        } else {
                            // Add mode
                            onSave(text, title)
                        }

                        when (result) {
                            is SaveResult.Success -> {
                                if (editingPrompt != null) {
                                    // Update original values to reflect the save
                                    originalTitle = title ?: ""
                                    originalText = text
                                    // Disable save button since there are no unsaved changes
                                    updateSaveButtonState()
                                    exitEditMode()
                                } else {
                                    textArea.text = ""
                                    titleField.text = ""
                                    originalTitle = ""
                                    originalText = ""
                                }
                                // Visual feedback
                                Notifications.Bus.notify(
                                    Notification(
                                        "PromptLibrary",
                                        if (editingPrompt != null) "Prompt updated" else "Prompt saved",
                                        if (editingPrompt != null) "Your prompt has been updated successfully" else "Your prompt has been added successfully",
                                        NotificationType.INFORMATION
                                    )
                                )
                            }
                            is SaveResult.Duplicate -> {
                                Notifications.Bus.notify(
                                    Notification(
                                        "PromptLibrary",
                                        "Duplicate prompt",
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
                add(cancelButton)
                add(saveButton)
            }

            add(leftButtons, BorderLayout.WEST)
            add(rightButtons, BorderLayout.EAST)
            isOpaque = false
        }
        contentPanel.add(buttonPanel, BorderLayout.SOUTH)

        unifiedCard.add(contentPanel, BorderLayout.CENTER)
        add(unifiedCard, BorderLayout.CENTER)

        // Auto-suggest title from first 20 chars if empty + change detection
        textArea.document.addDocumentListener(object : javax.swing.event.DocumentListener {
            override fun insertUpdate(e: javax.swing.event.DocumentEvent?) {
                updateTitleSuggestion()
                updateSaveButtonState()
            }
            override fun removeUpdate(e: javax.swing.event.DocumentEvent?) {
                updateTitleSuggestion()
                updateSaveButtonState()
            }
            override fun changedUpdate(e: javax.swing.event.DocumentEvent?) {
                updateTitleSuggestion()
                updateSaveButtonState()
            }

            private fun updateTitleSuggestion() {
                if (editingPrompt != null) return // Don't auto-suggest in edit mode
                if (titleField.text.trim().isEmpty()) {
                    val text = textArea.text.replace(Regex("[\r\n]+"), " ").take(20).trim()
                    titleField.text = text
                }
            }
        })

        // Change detection for title field
        titleField.document.addDocumentListener(object : javax.swing.event.DocumentListener {
            override fun insertUpdate(e: javax.swing.event.DocumentEvent?) = updateSaveButtonState()
            override fun removeUpdate(e: javax.swing.event.DocumentEvent?) = updateSaveButtonState()
            override fun changedUpdate(e: javax.swing.event.DocumentEvent?) = updateSaveButtonState()
        })

        // Initialize state
        updateState(false, null)
    }

    /**
     * Check if current values differ from original values.
     */
    private fun hasChanges(): Boolean {
        if (editingPrompt == null) return false
        val currentTitle = titleField.text.trim()
        val currentText = textArea.text.trim()
        return currentTitle != originalTitle || currentText != originalText
    }

    /**
     * Update save button state based on changes.
     */
    private fun updateSaveButtonState() {
        if (editingPrompt != null) {
            // Edit mode: only enable if changes detected
            saveButton.isEnabled = hasChanges()
        } else {
            // Add mode: enable if group selected and text not empty
            saveButton.isEnabled = isGroupSelected && textArea.text.trim().isNotEmpty()
        }
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
     * Enters edit mode for the given prompt.
     * Changes the composer to edit the existing prompt instead of creating a new one.
     */
    fun enterEditMode(prompt: Prompt, groupId: String) {
        editingPrompt = prompt
        editingGroupId = groupId

        // Store original values for change detection
        originalTitle = prompt.title?.trim() ?: ""
        originalText = prompt.text.trim()

        // Populate fields
        titleField.text = prompt.title ?: ""
        textArea.text = prompt.text

        // Update UI
        saveButton.text = "Save Changes"
        saveButton.isEnabled = false // Disabled until changes are made
        cancelButton.isVisible = true
        addNewButton.isVisible = true // Show "Add New" button in edit mode
        selectedGroupLabel.text = "Editing prompt"

        // Enable fields
        titleField.isEditable = true
        textArea.isEditable = true

        // Focus text area
        textArea.requestFocusInWindow()
        textArea.caretPosition = textArea.text.length
    }

    /**
     * Exits edit mode and returns to add mode.
     */
    fun exitEditMode() {
        editingPrompt = null
        editingGroupId = null

        // Clear original values
        originalTitle = ""
        originalText = ""

        // Clear fields
        textArea.text = ""
        titleField.text = ""

        // Update UI
        saveButton.text = "Add prompt"
        cancelButton.isVisible = false
        addNewButton.isVisible = false // Hide "Add New" button in add mode

        // Restore state based on group selection
        updateState(isGroupSelected, selectedGroupLabel.text.removePrefix("Selected group: "))
    }

    /**
     * Clears the text area and title field.
     */
    fun clear() {
        exitEditMode()
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

