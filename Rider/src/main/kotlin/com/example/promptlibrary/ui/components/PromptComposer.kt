package com.example.promptlibrary.ui.components

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.ui.JBColor
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import javax.swing.*

/**
 * A UI component for composing new prompts with save functionality.
 * 
 * This component handles the text input area and save button, with state management
 * for enabling/disabling based on whether a valid group is selected.
 */
class PromptComposer(
    private val onSave: (String) -> SaveResult
) : JPanel(BorderLayout()) {
    
    private val textArea = JTextArea(5, 40).apply {
        lineWrap = true
        wrapStyleWord = true
    }
    
    private val saveButton = JButton("Save")
    private val hintLabel = JLabel("")
    
    private var isGroupSelected = false
    
    init {
        border = JBUI.Borders.emptyTop(8)
        
        // Title
        add(JLabel("New Prompt:"), BorderLayout.NORTH)
        
        // Hint label
        hintLabel.apply {
            border = JBUI.Borders.empty(0, 8, 8, 8)
            foreground = JBColor.GRAY
        }
        add(hintLabel, BorderLayout.SOUTH)
        
        // Text area
        add(JScrollPane(textArea), BorderLayout.CENTER)
        
        // Save button
        saveButton.apply {
            addActionListener {
                val text = textArea.text.trim()
                if (text.isNotEmpty()) {
                    val result = onSave(text)
                    when (result) {
                        is SaveResult.Success -> {
                            textArea.text = ""
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
        add(saveButton, BorderLayout.EAST)
        
        // Initialize state
        updateState(false)
    }
    
    /**
     * Updates the composer state based on whether a group is selected.
     * 
     * @param groupSelected true if a valid group is selected, false if a root is selected
     */
    fun updateState(groupSelected: Boolean) {
        isGroupSelected = groupSelected
        
        // Save button
        saveButton.isEnabled = groupSelected
        
        // Hint
        hintLabel.text = if (!groupSelected) "Select a group to enable Save" else ""
        
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
    }
    
    /**
     * Clears the text area.
     */
    fun clear() {
        textArea.text = ""
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
}

/**
 * Result of a save operation.
 */
sealed class SaveResult {
    object Success : SaveResult()
    object Duplicate : SaveResult()
    data class Error(val message: String) : SaveResult()
}

