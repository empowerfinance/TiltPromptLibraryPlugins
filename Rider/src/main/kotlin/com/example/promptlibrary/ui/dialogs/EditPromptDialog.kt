package com.example.promptlibrary.ui.dialogs

import com.example.promptlibrary.model.Prompt
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
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
        
        // Text editor
        dialog.add(JScrollPane(editorArea), BorderLayout.CENTER)
        
        // Buttons
        val buttonPanel = JPanel(FlowLayout(FlowLayout.RIGHT)).apply {
            add(JButton("Cancel").apply { 
                addActionListener { dialog.dispose() } 
            })
            add(JButton("Save").apply {
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

