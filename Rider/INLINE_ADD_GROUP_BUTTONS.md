# Inline "Add Group" Buttons

## Overview

Added inline "+" buttons next to the Shared and Private root nodes in the tree, similar to the VS Code extension's HTML implementation.

## Changes Made

### 1. GroupTreePanel.kt

**Added:**
- Custom `TreeCellRenderer` that adds inline buttons to root nodes
- Two new callback parameters: `onAddGroupToShared` and `onAddGroupToPrivate`
- `setupCustomRenderer()` function that creates a custom cell renderer
- Inline "+" button that appears next to "Shared" and "Private" labels

**How it works:**
- The custom renderer checks if the node is a `SharedRoot` or `PrivateRoot`
- If it is, creates a panel with the label + an inline "+" button
- The button triggers the appropriate callback when clicked
- For all other nodes, uses the default renderer

### 2. PromptLibraryPanel.kt

**Added:**
- `addGroupToNamespace(namespace: String)` helper function
- Callbacks passed to `GroupTreePanel` constructor:
  - `onAddGroupToShared` → calls `addGroupToNamespace("Shared")`
  - `onAddGroupToPrivate` → calls `addGroupToNamespace("Private")`

**Behavior:**
- Clicking the "+" button next to "Shared" prompts for a group name and adds to Shared
- Clicking the "+" button next to "Private" prompts for a group name and adds to Private
- No longer needs to ask which namespace - it's implicit from which button was clicked

## Visual Layout

### Before
```
▼ Shared
  └─ My Group
▼ Private
  └─ Personal

[Toolbar with Add Group button that asks "Shared or Private?"]
```

### After
```
▼ Shared [+]
  └─ My Group
▼ Private [+]
  └─ Personal

[Toolbar - Add Group button can be removed or kept]
```

## User Experience

**Before:**
1. Click "Add Group" toolbar button
2. Dialog: "Add group to: Shared or Private?"
3. Select namespace
4. Dialog: "New group name:"
5. Enter name

**After:**
1. Click "+" button next to "Shared" or "Private"
2. Dialog: "New group name:"
3. Enter name

**Benefits:**
✅ One less dialog/step
✅ More intuitive - button is right where the group will appear
✅ Matches VS Code extension UX
✅ Cleaner, more modern interface
✅ Follows IntelliJ platform patterns (similar to "Add" buttons in other trees)

## Implementation Details

The custom renderer creates a `JPanel` with:
- A `JBLabel` with the node text and icon
- A small `JButton` with the "+" icon (16x16 pixels)
- FlowLayout to keep them inline
- Transparent background to match tree appearance

The button is:
- Borderless and non-filled for a clean look
- Has a tooltip explaining its purpose
- Triggers the appropriate callback when clicked

## Next Steps

**Optional:**
- Consider removing the "Add Group" button from the toolbar (now redundant)
- Or keep it for keyboard-only users who prefer toolbar access
- Could add keyboard shortcuts (Ctrl+N for new group, etc.)

## Files Modified

- `Rider/src/main/kotlin/com/example/promptlibrary/ui/components/GroupTreePanel.kt`
- `Rider/src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt`

