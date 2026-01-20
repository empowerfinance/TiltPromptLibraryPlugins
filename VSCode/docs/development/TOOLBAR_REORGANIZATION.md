# VS Code Toolbar Reorganization

## Overview

Reorganized the VS Code extension UI to match the Rider plugin layout, with toolbar buttons moved to the Prompt Groups view title bar.

## Changes Made

### 1. View Order Updated (`package.json`)

**Before:**
1. Quick Add (webview - composer)
2. Prompt Groups (tree view)
3. Prompt (webview - detail)

**After:**
1. **Prompt Groups** (tree view) - Primary navigation at top
2. **Quick Add** (webview - composer) - Add/edit interface in middle
3. **Prompt** (webview - detail) - Detail view at bottom

This matches the Rider plugin's vertical layout where the tree is the primary element.

### 2. Toolbar Buttons Moved to Prompt Groups Title

**Added to `package.json` menus:**
```json
"view/title": [
  {
    "command": "promptLibrary.syncOps",
    "when": "view == promptLibraryGroups",
    "group": "navigation@1"
  },
  {
    "command": "promptLibrary.openSettings",
    "when": "view == promptLibraryGroups",
    "group": "navigation@2"
  }
]
```

**Added icons to commands:**
- `promptLibrary.syncOps` → `$(sync)` icon
- `promptLibrary.openSettings` → `$(settings-gear)` icon

### 3. Cleaned Up Quick Add Webview

**Removed from `promptLibraryView.html`:**
- Header row with left/right columns
- Sync Ops button
- Open Settings button
- Complex header layout

**Simplified to:**
```html
<div class="card">
  <h3 class="title">Quick Add</h3>
  <div id="sel" class="muted" style="margin-bottom:12px;">Loading…</div>
  <div class="toolbar" style="margin-bottom:12px;">
    <span id="counts" class="count"></span>
    <div class="spacer"></div>
  </div>
  <!-- Title and composer fields -->
</div>
```

**Removed JavaScript:**
- Event listeners for `syncOpsBtn`
- Event listeners for `openSettingsBtn`

## Benefits

✅ **Cleaner UI** - Buttons in consistent location at top  
✅ **Rider Parity** - Matches the Rider plugin layout  
✅ **Better Organization** - Tree view is primary navigation  
✅ **Native VS Code UX** - Uses standard view title toolbar  
✅ **Less Clutter** - Quick Add focused on its purpose  
✅ **Always Visible** - Toolbar buttons always accessible  

## User Experience

### Before
- Sync Ops and Settings buttons were in the Quick Add card
- Had to scroll to Quick Add to access these buttons
- Buttons took up space in the composer area

### After
- Sync Ops and Settings buttons are in the Prompt Groups title bar
- Always visible at the top of the sidebar
- Quick Add is cleaner and more focused
- Matches standard VS Code toolbar patterns

## Visual Layout

```
┌─────────────────────────────────┐
│ PROMPT LIBRARY (Activity Bar)  │
├─────────────────────────────────┤
│ Prompt Groups        [⚙️] [🔄]  │ ← Toolbar buttons here
│  ├─ Shared                      │
│  └─ Private                     │
│      ├─ Unfiled                 │
│      │   └─ 📄 A prompt         │
│      └─ New group               │
├─────────────────────────────────┤
│ Quick Add                       │ ← Cleaner, no buttons
│ Selected group: Unfiled         │
│ 3 prompts                       │
│ Title (optional)                │
│ [text field]                    │
│ [text area]                     │
│ [Add prompt] [Cancel]           │
├─────────────────────────────────┤
│ Prompt                          │
│ (detail view when selected)     │
└─────────────────────────────────┘
```

## Files Modified

1. **`package.json`**
   - Reordered views array
   - Added `view/title` menu entries
   - Added icons to syncOps and openSettings commands

2. **`src/ui/promptLibraryView.html`**
   - Removed header row with buttons
   - Simplified card structure
   - Removed button event listeners

## Testing

After reloading VS Code:
- [ ] Verify Prompt Groups appears first
- [ ] Verify Quick Add appears second
- [ ] Verify Prompt detail appears third
- [ ] Verify Sync Ops button appears in Prompt Groups title bar
- [ ] Verify Settings button appears in Prompt Groups title bar
- [ ] Verify clicking Sync Ops opens sync panel
- [ ] Verify clicking Settings opens settings
- [ ] Verify Quick Add card is cleaner without buttons

## Conclusion

The VS Code extension now has a cleaner, more organized layout that matches the Rider plugin's design. Toolbar buttons are in a consistent, always-visible location at the top of the Prompt Groups view, following VS Code's standard UI patterns.

