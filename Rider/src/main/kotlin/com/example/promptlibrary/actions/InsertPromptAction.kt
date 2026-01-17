package com.example.promptlibrary.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorModificationUtil
import com.intellij.openapi.project.Project
import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications

/**
 * Action to insert prompt text directly into the active editor at the cursor position.
 * 
 * This provides a seamless way to paste prompts into code files, similar to the
 * VS Code extension's "Send to Augment" feature.
 */
class InsertPromptAction(
    private val promptText: String,
    private val project: Project
) : AnAction() {
    
    /**
     * Inserts the prompt text at the current cursor position in the active editor.
     */
    fun insertIntoEditor() {
        // Try to get the active editor
        val editor = getActiveEditor() ?: run {
            Notifications.Bus.notify(
                Notification(
                    "PromptLibrary",
                    "No Active Editor",
                    "Please open a file in the editor first",
                    NotificationType.WARNING
                )
            )
            return
        }
        
        // Insert the text at the cursor position
        WriteCommandAction.runWriteCommandAction(project) {
            EditorModificationUtil.insertStringAtCaret(editor, promptText, false, true)
        }
        
        Notifications.Bus.notify(
            Notification(
                "PromptLibrary",
                "Prompt Inserted",
                "Prompt text inserted at cursor position",
                NotificationType.INFORMATION
            )
        )
    }
    
    /**
     * Gets the currently active editor, if any.
     */
    private fun getActiveEditor(): Editor? {
        val fileEditorManager = com.intellij.openapi.fileEditor.FileEditorManager.getInstance(project)
        val selectedTextEditor = fileEditorManager.selectedTextEditor
        return selectedTextEditor
    }
    
    override fun actionPerformed(e: AnActionEvent) {
        insertIntoEditor()
    }
    
    override fun update(e: AnActionEvent) {
        // Only enable if there's an active editor
        val editor = e.getData(CommonDataKeys.EDITOR)
        e.presentation.isEnabledAndVisible = editor != null
    }
}

