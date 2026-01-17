# Send to Editor Feature

## Overview

The "Send to Editor" feature allows you to insert prompt text directly into the active editor at the cursor position, providing seamless integration with your coding workflow.

This feature is similar to the VS Code extension's "Send to Augment" functionality, but adapted for the IntelliJ Platform.

## How It Works

### User Flow

1. **Select a prompt** in the tree view
2. The prompt details appear in the detail panel
3. Click the **"Send to Editor"** button
4. The prompt text is inserted at the current cursor position in the active editor

### Technical Implementation

The feature uses IntelliJ Platform APIs to:

1. **Get the active editor** using `FileEditorManager.getInstance(project).selectedTextEditor`
2. **Insert text at cursor** using `EditorModificationUtil.insertStringAtCaret()`
3. **Wrap in write action** using `WriteCommandAction.runWriteCommandAction()`

### Code Location

- **Action class**: `src/main/kotlin/com/example/promptlibrary/actions/InsertPromptAction.kt`
- **UI integration**: `src/main/kotlin/com/example/promptlibrary/ui/components/PromptDetailPanel.kt`

## Usage

### Basic Usage

1. Open a file in the editor (any file type)
2. Place your cursor where you want to insert the prompt
3. In the Prompt Library panel, click a prompt to select it
4. Click the **"Send to Editor"** button in the detail panel
5. The prompt text is inserted at your cursor position

### Use Cases

**1. Insert AI Prompts into Comments**
```kotlin
// TODO: 
// [cursor here - click "Send to Editor"]
```

**2. Insert Prompts into String Literals**
```kotlin
val prompt = """
    [cursor here - click "Send to Editor"]
""".trimIndent()
```

**3. Insert Prompts into Documentation**
```kotlin
/**
 * [cursor here - click "Send to Editor"]
 */
```

**4. Quick Prompt Testing**
- Open a scratch file
- Insert prompts to test and refine them
- Copy the refined version back to the library

## Button Location

The "Send to Editor" button appears in the **Prompt Detail Panel**, between the "Copy" and "Edit" buttons:

```
┌─────────────────────────────────────┐
│ Prompt Detail Panel                │
│ Title: Example Prompt               │
│ Text: This is an example prompt...  │
│ [Copy] [Send to Editor] [Edit] [...] │
└─────────────────────────────────────┘
```

## Notifications

- **Success**: "Prompt Inserted - Prompt text inserted at cursor position"
- **No Active Editor**: "No Active Editor - Please open a file in the editor first"

## Comparison with VS Code Extension

| Feature | VS Code | Rider |
|---------|---------|-------|
| Insert into editor | ✅ `type` command | ✅ `EditorModificationUtil` |
| Focus editor | ✅ Automatic | ✅ Automatic |
| Undo support | ✅ Yes | ✅ Yes (via WriteCommandAction) |
| Works with any file | ✅ Yes | ✅ Yes |

## Future Enhancements

### Potential Improvements

1. **Keyboard Shortcut**: Add a keyboard shortcut for quick insertion
2. **Template Variables**: Support IntelliJ template variables in prompts
3. **Smart Insertion**: Auto-detect context (comment, string, etc.) and format accordingly
4. **Multi-cursor Support**: Insert at all cursor positions
5. **Augment Integration**: If Augment for Rider exposes an API, integrate directly

### Augment Integration (Future)

If Augment for Rider adds a public API, we could integrate directly:

```kotlin
// Hypothetical future implementation
fun sendToAugment(promptText: String) {
    try {
        // Focus Augment panel
        ToolWindowManager.getInstance(project)
            .getToolWindow("Augment")?.activate(null)
        
        // Send text to Augment (if API exists)
        AugmentService.getInstance(project)
            .sendToChat(promptText)
    } catch (e: Exception) {
        // Fallback to clipboard
        CopyPasteManager.getInstance()
            .setContents(StringSelection(promptText))
    }
}
```

## Technical Details

### Write Command Action

The insertion is wrapped in a `WriteCommandAction` to ensure:
- **Undo/Redo support**: Users can undo the insertion
- **Thread safety**: Modifications happen on the correct thread
- **Document locking**: Prevents concurrent modifications

### Editor Modification Util

`EditorModificationUtil.insertStringAtCaret()` provides:
- **Smart insertion**: Respects editor settings (tabs vs spaces, etc.)
- **Selection handling**: Replaces selection if text is selected
- **Caret positioning**: Moves caret to end of inserted text

## Testing

To test the feature:

1. Build the plugin: `./gradlew buildPlugin`
2. Run Rider with the plugin
3. Open any file in the editor
4. Select a prompt in the library
5. Click "Send to Editor"
6. Verify the text is inserted at the cursor
7. Test undo (Cmd+Z / Ctrl+Z)

## Known Limitations

- Requires an active editor (file must be open)
- Inserts plain text (no formatting or syntax highlighting)
- No template variable expansion (yet)

