package com.example.promptlibrary.ui.dialogs

import com.example.promptlibrary.model.Prompt
import com.intellij.ide.CopyPasteManagerEx
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import java.awt.BorderLayout
import java.awt.Component
import java.awt.FlowLayout
import java.awt.datatransfer.StringSelection
import java.io.File
import javax.swing.*
import javax.swing.filechooser.FileNameExtensionFilter

/**
 * Dialog for exporting prompts to JSON format.
 * 
 * Provides options to copy to clipboard or save to file.
 */
class ExportDialog(
    private val prompts: List<Prompt>,
    private val title: String = "Export Library (v1 JSON)",
    private val defaultFileName: String = "library-prompts.json",
    private val parent: Component?
) {
    
    private val dialog: JDialog?
    private val jsonData: String?

    init {
        if (prompts.isEmpty()) {
            JOptionPane.showMessageDialog(parent, "Nothing to export.", "Export", JOptionPane.INFORMATION_MESSAGE)
            dialog = null
            jsonData = null
        } else {
            // Build simple JSON array of strings (v1 format)
            // Trim trailing whitespace/newlines from each prompt text
            val promptTexts = prompts.map { it.text.trimEnd() }
            jsonData = promptTexts.joinToString(
                prefix = "[\n  ",
                separator = ",\n  ",
                postfix = "\n]"
            ) { text ->
                "\"${text.replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")}\""
            }

            dialog = JDialog().apply {
                this.title = this@ExportDialog.title
                isModal = true
                layout = BorderLayout()

                // Main content with padding
                val contentPanel = JPanel(BorderLayout()).apply {
                    border = com.intellij.util.ui.JBUI.Borders.empty(12)

                    val textArea = JTextArea(jsonData, 20, 60).apply {
                        isEditable = false
                        lineWrap = true
                        wrapStyleWord = true
                    }

                    val scrollPane = JScrollPane(textArea).apply {
                        horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
                        border = BorderFactory.createLineBorder(com.intellij.ui.JBColor.border(), 1, true)
                    }
                    add(scrollPane, BorderLayout.CENTER)
                }
                add(contentPanel, BorderLayout.CENTER)

                val labelCount = prompts.size
                val dialogRef = this
                val buttonPanel = JPanel(FlowLayout(FlowLayout.RIGHT, 8, 8)).apply {
                    border = BorderFactory.createCompoundBorder(
                        BorderFactory.createMatteBorder(1, 0, 0, 0, com.intellij.ui.JBColor.border()),
                        com.intellij.util.ui.JBUI.Borders.empty(8)
                    )

                    add(JButton("Copy to Clipboard").apply {
                        cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)
                        addActionListener {
                            CopyPasteManagerEx.getInstance().setContents(StringSelection(jsonData))
                            Notifications.Bus.notify(
                                Notification(
                                    "PromptLibrary",
                                    "Exported to clipboard",
                                    "$labelCount prompts copied",
                                    NotificationType.INFORMATION
                                )
                            )
                            dialogRef.dispose()
                        }
                    })
                    add(JButton("Save to File").apply {
                        cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)
                        putClientProperty("JButton.buttonType", "default")
                        addActionListener {
                            val fileChooser = JFileChooser().apply {
                                fileFilter = FileNameExtensionFilter("JSON files", "json")
                                selectedFile = File(defaultFileName)
                            }

                            if (fileChooser.showSaveDialog(dialogRef) == JFileChooser.APPROVE_OPTION) {
                                try {
                                    fileChooser.selectedFile.writeText(jsonData)
                                    Notifications.Bus.notify(
                                        Notification(
                                            "PromptLibrary",
                                            "Exported to file",
                                            "Saved $labelCount prompts to ${fileChooser.selectedFile.name}",
                                            NotificationType.INFORMATION
                                        )
                                    )
                                    dialogRef.dispose()
                                } catch (e: Exception) {
                                    JOptionPane.showMessageDialog(
                                        dialogRef,
                                        "Error saving file: ${e.message}",
                                        "Export Error",
                                        JOptionPane.ERROR_MESSAGE
                                    )
                                }
                            }
                        }
                    })
                    add(JButton("Close").apply {
                        cursor = java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR)
                        addActionListener { dialogRef.dispose() }
                    })
                }
                add(buttonPanel, BorderLayout.SOUTH)

                pack()
                setLocationRelativeTo(parent)
            }
        }
    }
    
    /**
     * Shows the dialog.
     */
    fun show() {
        dialog?.isVisible = true
    }
}

