# Unified View, Add and Edit Interface

## Latest Update: Removed Prompt Detail View (2025-01-17)

### Changes

- **Removed "Prompt" detail panel** - No longer needed since unified interface handles everything
- **Removed duplicate heading** - "View, Add and Edit" title only shows in section header
- **Hidden "Add New" in add mode** - Button only shows when editing existing prompts
- **Removed debug text** - "script running" diagnostic message hidden

### Files Modified

- `package.json`: Removed `promptDetailView` from views and activation events
- `extension.ts`: Removed `PromptDetailViewProvider` class and all references
- `promptLibraryView.html`: Removed duplicate heading, hidden boot diagnostic

---

## Previous Update: Change Detection for Save Button (2025-01-17)

### Problems Fixed

1. **Need to click twice**: First click didn't load the prompt, needed to click again
2. **Can't type in fields**: Fields were readonly in view mode, preventing immediate editing
3. **Webview timing issue**: Composer was being populated before webview was resolved
4. **Save button always enabled**: Button was active even when no changes were made

### Solutions

1. **Reordered operations**: Ensure view is visible BEFORE calling `populateComposer()`
2. **Changed mode**: Load prompts in "edit" mode (editable) instead of "view" mode (readonly)
3. **Added change detection**: Track original values and enable save button only when changes are detected

### Files Modified

- `extension.ts` lines 356-386, 438-458: Moved `workbench.view.extension.promptLibrary` call before `populateComposer()`
- `promptLibraryView.html`:
  - Line 399: Changed `setMode('view')` to `setMode('edit')`
  - Lines 262-298: Added change detection logic (`originalTitle`, `originalText`, `hasChanges()`, `updateSaveButton()`)
  - Lines 348-362: Added input event listeners to detect changes
  - Lines 427-437: Store original values when loading prompt
  - Lines 458-468, 470-505, 507-517: Clear/update original values on button actions

### Result

✅ **Single click now loads and allows immediate editing**
✅ **No more double-clicking required**
✅ **Fields are editable right away**
✅ **Save button only enabled when changes are made**

---

## Overview

Transformed the VS Code extension to use a single unified interface for viewing, adding, and editing prompts - matching the streamlined Rider plugin experience.

## Key Changes

### 1. Renamed "Quick Add" to "View, Add and Edit"

The webview is no longer just for adding - it's a unified interface that handles all three operations:

- **View Mode**: Display prompt in readonly fields when clicked
- **Add Mode**: Empty fields ready to create new prompt
- **Edit Mode**: Editable fields to modify existing prompt

### 2. Three-Mode State Machine

**View Mode** (readonly):

- Triggered when clicking a prompt in the tree
- Fields are readonly
- "Save Changes" button (switches to edit mode)
- "Cancel" button (returns to add mode)
- "Add New" button enabled

**Edit Mode** (editable):

- Triggered by clicking "Save Changes" in view mode
- Fields become editable
- "Save Changes" button (saves and returns to add mode)
- "Cancel" button (returns to add mode)
- "Add New" button enabled

**Add Mode** (editable, empty):

- Default mode when selecting a group
- Empty fields ready for new prompt
- "Add Prompt" button
- "Cancel" button hidden
- "Add New" button disabled (already in add mode)

### 3. Button Behavior

**Add New Button**:

- Visible in view and edit modes
- Clears fields and switches to add mode
- Disabled in add mode (already there)

**Save Changes / Add Prompt Button**:

- In view mode: "Save Changes" → switches to edit mode
- In edit mode: "Save Changes" → saves changes, returns to add mode
- In add mode: "Add Prompt" → creates new prompt

**Cancel Button**:

- Visible in view and edit modes
- Returns to add mode with cleared fields
- Hidden in add mode

### 4. Prompt Detail View Collapsed by Default

Added `"visibility": "collapsed"` to the Prompt detail view in package.json:

- Users can expand it if they want the old detail panel
- Most users will use the unified view exclusively
- Reduces clutter in the sidebar

## User Experience Flow

### Viewing a Prompt

1. Click a prompt in the tree
2. Prompt loads in readonly mode
3. Click "Save Changes" to edit, or "Add New" to create new

### Editing a Prompt

1. View a prompt (readonly)
2. Click "Save Changes" → fields become editable
3. Make changes
4. Click "Save Changes" → saves and returns to add mode
5. Or click "Cancel" → discards changes, returns to add mode

### Adding a Prompt

1. Select a group
2. Fields are empty and ready
3. Type prompt text
4. Click "Add Prompt"
5. Fields clear, ready for next prompt

### Quick Add New While Viewing

1. Viewing or editing a prompt
2. Click "Add New" button
3. Fields clear, ready to add new prompt

## Technical Implementation

### State Management

```javascript
let currentMode = "add"; // 'view', 'add', or 'edit'
let editingId = null; // ID when editing
let viewingId = null; // ID when viewing

function setMode(mode, promptId = null) {
  currentMode = mode;
  // Update UI based on mode
  // - Set readonly attributes
  // - Change button text
  // - Show/hide buttons
}
```

### Message Handling

- `selectedGroup`: Switch to add mode, clear fields
- `populateComposer`: Switch to view mode (readonly)
- Save button: Handle view→edit transition or save changes

### Auto-suggest Title

- Only active in add and edit modes
- Disabled in view mode to preserve original title

## Files Modified

1. **`package.json`**
   - Renamed view from "Quick Add" to "View, Add and Edit"
   - Changed icon from `$(add)` to `$(edit)`
   - Set Prompt detail view to `"visibility": "collapsed"`

2. **`src/ui/promptLibraryView.html`**
   - Added "Add New" button
   - Implemented three-mode state machine
   - Updated button event handlers
   - Modified message handlers for view mode
   - Increased textarea rows from 4 to 8 for better viewing
   - Set textarea to `resize: vertical` only (matches title input behavior)
   - Added minimum height of 120px for textarea

## Benefits

✅ **Single Interface** - One place for view, add, and edit  
✅ **Rider Parity** - Matches Rider's unified composer  
✅ **Less Context Switching** - No separate detail panel needed  
✅ **Clearer Intent** - Button text shows what will happen  
✅ **Flexible Workflow** - Easy to switch between modes  
✅ **Reduced Clutter** - Detail panel collapsed by default

## Visual Layout

```
┌─────────────────────────────────┐
│ PROMPT LIBRARY                  │
├─────────────────────────────────┤
│ Prompt Groups        [⚙️] [🔄]  │
│  ├─ Shared                      │
│  └─ Private                     │
│      ├─ Unfiled                 │
│      │   └─ 📄 My prompt  ← click
│      └─ New group               │
├─────────────────────────────────┤
│ View, Add and Edit              │
│ Selected group: Unfiled         │
│ 3 prompts                       │
│ Title (optional)                │
│ [My prompt title] (readonly)    │
│ [Prompt text here...] (readonly)│
│ [Add New] [Save Changes] [Cancel]│
└─────────────────────────────────┘
```

## Conclusion

The VS Code extension now provides a streamlined, unified interface for all prompt operations. Users can view, add, and edit prompts in a single panel with clear button labels and smooth mode transitions.
