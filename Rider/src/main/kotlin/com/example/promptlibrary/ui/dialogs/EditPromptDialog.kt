package com.example.promptlibrary.ui.dialogs

import com.example.promptlibrary.model.Prompt
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.ui.JBColor
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.FlowLayout
import javax.swing.*

/**
 * Dialog for editing an existing prompt.
 * 
 * This dialog provides a text area for editing the prompt text with Save/Cancel buttons
 * and auto-save on close functionality.
 */
class EditPromptDialog(
    private val prompt: Prompt,
    private val parent: Component?,
    private val onSave: (String) -> EditResult
) {
    
    private val dialog = JDialog().apply {
        title = "Edit Prompt"
        isModal = true
    }
    
    private val editorArea = JTextArea(prompt.text, 20, 60).apply {
        lineWrap = true
        wrapStyleWord = true
    }
    
    init {
        dialog.layout = BorderLayout()

        // Main content panel with padding
        val contentPanel = JPanel(BorderLayout()).apply {
            border = JBUI.Borders.empty(12)

            // Text editor with rounded border
            val scrollPane = JScrollPane(editorArea).apply {
                border = BorderFactory.createLineBorder(JBColor.border(), 1, true)
            }
            add(scrollPane, BorderLayout.CENTER)
        }
        dialog.add(contentPanel, BorderLayout.CENTER)

        // Buttons with modern styling
        val buttonPanel = JPanel(FlowLayout(FlowLayout.RIGHT, 8, 8)).apply {
            border = BorderFactory.createCompoundBorder(
                BorderFactory.createMatteBorder(1, 0, 0, 0, JBColor.border()),
                JBUI.Borders.empty(8)
            )

            add(JButton("Cancel").apply {
                cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)
                addActionListener { dialog.dispose() }
            })
            add(JButton("Save").apply {
                cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)
                putClientProperty("JButton.buttonType", "default")
                addActionListener {
                    saveAndClose()
                }
            })
        }
        dialog.add(buttonPanel, BorderLayout.SOUTH)
        
        // Autosave on close if content changed and not blank
        dialog.addWindowListener(object : java.awt.event.WindowAdapter() {
            override fun windowClosing(e: java.awt.event.WindowEvent) {
                val newText = editorArea.text.trim()
                if (newText.isNotEmpty() && newText != prompt.text) {
                    onSave(newText)
                }
            }
        })
        
        dialog.pack()
        dialog.setLocationRelativeTo(parent)
    }
    
    /**
     * Shows the dialog.
     */
    fun show() {
        dialog.isVisible = true
    }
    
    /**
     * Saves the changes and closes the dialog.
     */
    private fun saveAndClose() {
        val newText = editorArea.text.trim()
        if (newText.isNotEmpty()) {
            val result = onSave(newText)
            when (result) {
                is EditResult.Success -> {
                    dialog.dispose()
                }
                is EditResult.Duplicate -> {
                    Notifications.Bus.notify(
                        Notification(
                            "PromptLibrary",
                            "Update failed",
                            "A similar prompt already exists",
                            NotificationType.WARNING
                        )
                    )
                }
                is EditResult.Error -> {
                    Notifications.Bus.notify(
                        Notification(
                            "PromptLibrary",
                            "Update failed",
                            result.message,
                            NotificationType.ERROR
                        )
                    )
                }
            }
        } else {
            dialog.dispose()
        }
    }
}

/**
 * Result of an edit operation.
 */
sealed class EditResult {
    object Success : EditResult()
    object Duplicate : EditResult()
    data class Error(val message: String) : EditResult()
}

