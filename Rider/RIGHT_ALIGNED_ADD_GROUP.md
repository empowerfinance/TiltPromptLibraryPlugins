# Right-Aligned "Add Group" Text Button

## Overview

Moved the inline button from left side (next to label) to the right side of the tree panel, and replaced the "+" icon with "+ Add Group" text in a small font.

## Changes Made

### Visual Layout

**Before:**
```
▼ Shared [+]
  └─ My Group
```

**After:**
```
▼ Shared                                              + Add Group
  └─ My Group
```

The "+ Add Group" text appears on the far right side of the tree panel, aligned to the right edge.

### Implementation Details

**1. Custom Cell Renderer (setupCustomRenderer)**

Changed from `FlowLayout` to `BorderLayout`:
- **WEST (left side)**: Label with folder icon ("Shared" or "Private")
- **EAST (right side)**: "+ Add Group" text in small gray font

**Styling:**
- Font size: 9.5pt (small but readable)
- Color: Medium gray (light theme) / Lighter gray (dark theme)
- Text: "+ Add Group" (includes "+" symbol)
- Cursor: Hand cursor when hovering

**2. Mouse Click Detection (setupMouseListener)**

Updated click detection logic:
- Calculates row width dynamically
- Button area is the last ~80 pixels of the row
- Click detection: `clickX >= (rowWidth - 80)`

**Debug output:**
```
[GroupTreePanel] Click X: 245, Row width: 300, Button starts at: 220
[GroupTreePanel] Click in 'Add Group' area! Triggering callback
```

**3. Hover Effect (setupHoverEffect)**

Added mouse motion listener:
- Shows hand cursor when hovering over "+ Add Group" text
- Returns to default cursor when over label area
- Same calculation as click detection (last 80 pixels)

### User Experience

**Interaction:**
1. Hover over "+ Add Group" → cursor changes to hand
2. Click on "+ Add Group" → shows "New group name:" dialog
3. Enter name → group is created in the appropriate namespace

**Visual Feedback:**
- ✅ Text is subtle but visible (gray color)
- ✅ Right-aligned, doesn't interfere with tree structure
- ✅ Hand cursor indicates it's clickable
- ✅ Tooltip shows "Add group to Shared" or "Add group to Private"

### Technical Details

**BorderLayout Structure:**
```kotlin
JPanel(BorderLayout()) {
    // Left side
    add(JPanel(FlowLayout.LEFT) {
        add(JBLabel("Shared") { icon = folderIcon })
    }, BorderLayout.WEST)
    
    // Right side
    add(JPanel(FlowLayout.RIGHT) {
        add(JBLabel("+ Add Group") { 
            font = 9.5pt
            color = gray
        })
    }, BorderLayout.EAST)
}
```

**Click Detection:**
```kotlin
val clickX = e.x - rowBounds.x
val rowWidth = rowBounds.width
val buttonAreaStart = rowWidth - 80  // Last 80 pixels

if (clickX >= buttonAreaStart) {
    // Clicked on "+ Add Group"
    onAddGroupToShared() or onAddGroupToPrivate()
}
```

### Advantages

✅ **More space efficient** - Doesn't crowd the label  
✅ **Clearer intent** - "Add Group" text is more explicit than "+"  
✅ **Better alignment** - Follows common UI patterns (actions on right)  
✅ **Subtle** - Small gray text doesn't dominate the UI  
✅ **Discoverable** - Hand cursor and tooltip help users find it  

### Customization Options

**Font size** (currently 9.5pt):
```kotlin
font = font.deriveFont(9.5f)  // Adjust as needed
```

**Color** (currently medium/light gray):
```kotlin
foreground = JBColor(
    java.awt.Color(100, 100, 100),  // Light theme
    java.awt.Color(150, 150, 150)   // Dark theme
)
```

**Text** (currently "+ Add Group"):
```kotlin
add(JBLabel("+ Add Group"))  // Change text here
```

**Click area width** (currently 80 pixels):
```kotlin
val buttonAreaStart = rowWidth - 80  // Adjust threshold
```

### Testing

**Build Status:** ✅ BUILD SUCCESSFUL

**Tests:** All 14 tests pass, including:
- Inline button callback tests
- Click detection tests
- Hover effect tests

**Manual Testing:**
1. Run the plugin
2. Look for "+ Add Group" on the right side of Shared/Private rows
3. Hover over it → cursor should change to hand
4. Click it → should show "New group name:" dialog
5. Check console for debug output showing click detection

### Debug Output Example

```
[GroupTreePanel] Mouse clicked at (285, 42)
[GroupTreePanel] Clicked on: Shared
[GroupTreePanel] Click X: 265, Row width: 300, Button starts at: 220
[GroupTreePanel] Click in 'Add Group' area! Triggering callback for Shared
[GroupTreePanel] Calling onAddGroupToShared
```

### Files Modified

- `Rider/src/main/kotlin/com/example/promptlibrary/ui/components/GroupTreePanel.kt`
  - Updated `setupCustomRenderer()` to use BorderLayout with right-aligned text
  - Updated `setupMouseListener()` to detect clicks on right side
  - Added `setupHoverEffect()` for cursor changes
  - Added import for `JBColor`

### Next Steps

**Optional improvements:**
- Make the text slightly bolder on hover
- Add a subtle background highlight on hover
- Animate the text appearance
- Make font size/color configurable in settings

**To remove debug logging:**
- Remove all `println()` statements from `setupMouseListener()`

