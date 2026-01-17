package com.example.promptlibrary.ui.components

import com.example.promptlibrary.model.Prompt
import com.intellij.icons.AllIcons
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.FlowLayout
import java.awt.datatransfer.StringSelection
import javax.swing.*

/**
 * Panel that displays details of a selected prompt.
 * Shows title, text, and action buttons (Copy, Edit, Delete).
 */
class PromptDetailPanel(
    private val onEdit: (Prompt, String) -> Unit,
    private val onDelete: (Prompt, String) -> Unit
) : JPanel(BorderLayout()) {

    private val titleLabel = JLabel("No prompt selected")
    private val textArea = JTextArea().apply {
        isEditable = false
        lineWrap = true
        wrapStyleWord = true
        font = font.deriveFont(13f)
    }
    
    private val copyButton = JButton("Copy", AllIcons.Actions.Copy)
    private val editButton = JButton("Edit", AllIcons.Actions.Edit)
    private val deleteButton = JButton("Delete", AllIcons.General.Remove)
    
    private var currentPrompt: Prompt? = null
    private var currentGroupId: String? = null

    init {
        border = JBUI.Borders.empty(8)
        
        // Title section
        val titlePanel = JPanel(BorderLayout()).apply {
            border = JBUI.Borders.emptyBottom(8)
            add(titleLabel, BorderLayout.WEST)
        }
        
        // Text area with scroll
        val scrollPane = JBScrollPane(textArea).apply {
            preferredSize = JBUI.size(0, 100)
        }
        
        // Button panel
        val buttonPanel = JPanel(FlowLayout(FlowLayout.RIGHT, 4, 0)).apply {
            border = JBUI.Borders.emptyTop(8)
            add(copyButton)
            add(editButton)
            add(deleteButton)
        }
        
        // Layout
        add(titlePanel, BorderLayout.NORTH)
        add(scrollPane, BorderLayout.CENTER)
        add(buttonPanel, BorderLayout.SOUTH)
        
        // Button actions
        copyButton.addActionListener {
            currentPrompt?.let { prompt ->
                CopyPasteManager.getInstance().setContents(StringSelection(prompt.text))
            }
        }
        
        editButton.addActionListener {
            val prompt = currentPrompt
            val groupId = currentGroupId
            if (prompt != null && groupId != null) {
                onEdit(prompt, groupId)
            }
        }
        
        deleteButton.addActionListener {
            val prompt = currentPrompt
            val groupId = currentGroupId
            if (prompt != null && groupId != null) {
                onDelete(prompt, groupId)
            }
        }
        
        // Initially disabled
        setPrompt(null, null)
    }
    
    /**
     * Updates the panel to show the given prompt.
     * If prompt is null, shows "No prompt selected" state.
     */
    fun setPrompt(prompt: Prompt?, groupId: String?) {
        currentPrompt = prompt
        currentGroupId = groupId
        
        if (prompt == null) {
            titleLabel.text = "No prompt selected"
            textArea.text = ""
            copyButton.isEnabled = false
            editButton.isEnabled = false
            deleteButton.isEnabled = false
        } else {
            titleLabel.text = prompt.displayTitle(50)
            textArea.text = prompt.text
            textArea.caretPosition = 0 // Scroll to top
            copyButton.isEnabled = true
            editButton.isEnabled = true
            deleteButton.isEnabled = true
        }
    }
    
    /**
     * Clears the current selection.
     */
    fun clear() {
        setPrompt(null, null)
    }
}

