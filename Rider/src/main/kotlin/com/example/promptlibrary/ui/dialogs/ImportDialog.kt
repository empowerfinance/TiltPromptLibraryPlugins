package com.example.promptlibrary.ui.dialogs

import com.example.promptlibrary.model.Prompt
import com.intellij.ide.CopyPasteManagerEx
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.util.ui.JBUI
import kotlinx.serialization.json.*
import java.awt.BorderLayout
import java.awt.Component
import java.awt.FlowLayout
import java.io.File
import javax.swing.*
import javax.swing.filechooser.FileNameExtensionFilter

/**
 * Dialog for importing prompts from JSON format.
 * 
 * Supports v1 arrays (strings or objects with 'text') and v2 Library JSON.
 */
class ImportDialog(
    private val parent: Component?,
    private val onImport: (List<Prompt>) -> ImportResult
) {
    
    private val dialog = JDialog().apply {
        title = "Import Prompts"
        isModal = true
    }
    
    private val textArea = JTextArea(15, 60).apply {
        lineWrap = true
        wrapStyleWord = true
        toolTipText = "Paste JSON data here or use 'Load from File' button"
    }
    
    init {
        dialog.layout = BorderLayout()
        
        val header = JLabel("Import supports v1 arrays (strings or objects with 'text') and v2 Library JSON. v2 imports will be flattened into private prompts.")
        header.border = JBUI.Borders.empty(8)
        dialog.add(header, BorderLayout.NORTH)
        
        val scrollPane = JScrollPane(textArea).apply {
            horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER
        }
        dialog.add(scrollPane, BorderLayout.CENTER)
        
        val buttonPanel = JPanel(FlowLayout()).apply {
            add(JButton("Load from File").apply {
                addActionListener {
                    val fileChooser = JFileChooser().apply {
                        fileFilter = FileNameExtensionFilter("JSON files", "json")
                    }
                    
                    if (fileChooser.showOpenDialog(dialog) == JFileChooser.APPROVE_OPTION) {
                        try {
                            val jsonData = fileChooser.selectedFile.readText()
                            textArea.text = jsonData
                        } catch (e: Exception) {
                            JOptionPane.showMessageDialog(
                                dialog,
                                "Error reading file: ${e.message}",
                                "Import Error",
                                JOptionPane.ERROR_MESSAGE
                            )
                        }
                    }
                }
            })
            add(JButton("Paste from Clipboard").apply {
                addActionListener {
                    try {
                        val clipboardData = CopyPasteManagerEx.getInstance().contents?.getTransferData(
                            java.awt.datatransfer.DataFlavor.stringFlavor
                        ) as? String
                        if (clipboardData != null) {
                            textArea.text = clipboardData
                        } else {
                            JOptionPane.showMessageDialog(
                                dialog,
                                "No text data in clipboard",
                                "Import Error",
                                JOptionPane.WARNING_MESSAGE
                            )
                        }
                    } catch (e: Exception) {
                        JOptionPane.showMessageDialog(
                            dialog,
                            "Error reading clipboard: ${e.message}",
                            "Import Error",
                            JOptionPane.ERROR_MESSAGE
                        )
                    }
                }
            })
            add(JButton("Import").apply {
                addActionListener {
                    performImport()
                }
            })
            add(JButton("Close").apply {
                addActionListener { dialog.dispose() }
            })
        }
        dialog.add(buttonPanel, BorderLayout.SOUTH)
        
        dialog.pack()
        dialog.setLocationRelativeTo(parent)
    }
    
    private fun performImport() {
        val jsonData = textArea.text.trim()
        if (jsonData.isEmpty()) {
            JOptionPane.showMessageDialog(
                dialog,
                "Please enter JSON data to import",
                "Import Error",
                JOptionPane.WARNING_MESSAGE
            )
            return
        }
        
        try {
            val json = Json { ignoreUnknownKeys = true }
            val importedPrompts = parseImportData(jsonData, json)
            val result = onImport(importedPrompts)
            
            when (result) {
                is ImportResult.Success -> {
                    Notifications.Bus.notify(
                        Notification(
                            "PromptLibrary",
                            "Import completed",
                            "Imported ${result.importedCount} new prompts (${result.duplicatesSkipped} duplicates skipped)",
                            NotificationType.INFORMATION
                        )
                    )
                    dialog.dispose()
                }
                is ImportResult.Error -> {
                    JOptionPane.showMessageDialog(
                        dialog,
                        result.message,
                        "Import Error",
                        JOptionPane.ERROR_MESSAGE
                    )
                }
            }
        } catch (e: Exception) {
            JOptionPane.showMessageDialog(
                dialog,
                "Error parsing JSON: ${e.message}",
                "Import Error",
                JOptionPane.ERROR_MESSAGE
            )
        }
    }

    private fun parseImportData(jsonData: String, json: Json): List<Prompt> {
        val jsonElement = json.parseToJsonElement(jsonData)

        return when {
            // Handle array of strings: ["prompt1", "prompt2", ...]
            jsonElement is JsonArray && jsonElement.all { it is JsonPrimitive && it.isString } -> {
                jsonElement.map { element ->
                    val text = element.jsonPrimitive.content
                    Prompt(text = text)
                }
            }

            // Handle array of objects with flexible structure
            jsonElement is JsonArray -> {
                jsonElement.map { element ->
                    when (element) {
                        is JsonObject -> {
                            val text = element["text"]?.jsonPrimitive?.content
                                ?: throw IllegalArgumentException("Missing 'text' field in prompt object")

                            // Use existing id/timestamps if present, otherwise generate new ones
                            val id = element["id"]?.jsonPrimitive?.content ?: java.util.UUID.randomUUID().toString()
                            val createdAt = element["createdAt"]?.jsonPrimitive?.content ?: java.time.Instant.now().toString()
                            val updatedAt = element["updatedAt"]?.jsonPrimitive?.content ?: java.time.Instant.now().toString()

                            Prompt(id = id, text = text, createdAt = createdAt, updatedAt = updatedAt)
                        }
                        is JsonPrimitive -> {
                            if (element.isString) {
                                Prompt(text = element.content)
                            } else {
                                throw IllegalArgumentException("Array elements must be strings or objects with 'text' field")
                            }
                        }
                        else -> throw IllegalArgumentException("Invalid JSON structure")
                    }
                }
            }

            // Handle single object
            jsonElement is JsonObject -> {
                val text = jsonElement["text"]?.jsonPrimitive?.content
                    ?: throw IllegalArgumentException("Missing 'text' field in prompt object")

                val id = jsonElement["id"]?.jsonPrimitive?.content ?: java.util.UUID.randomUUID().toString()
                val createdAt = jsonElement["createdAt"]?.jsonPrimitive?.content ?: java.time.Instant.now().toString()
                val updatedAt = jsonElement["updatedAt"]?.jsonPrimitive?.content ?: java.time.Instant.now().toString()

                listOf(Prompt(id = id, text = text, createdAt = createdAt, updatedAt = updatedAt))
            }

            else -> throw IllegalArgumentException("JSON must be an array or object")
        }
    }

    /**
     * Shows the dialog.
     */
    fun show() {
        dialog.isVisible = true
    }
}

/**
 * Result of an import operation.
 */
sealed class ImportResult {
    data class Success(val importedCount: Int, val duplicatesSkipped: Int) : ImportResult()
    data class Error(val message: String) : ImportResult()
}

