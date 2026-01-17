# Inline Button Click Debugging Guide

## Issue
The inline "+" buttons appear next to Shared and Private nodes, but clicking them doesn't trigger the callbacks.

## Root Cause
Tree cell renderers are **rendering-only** components. They get recreated on every repaint, so action listeners attached to buttons in the renderer don't work reliably.

## Solution Implemented
Added a `MouseListener` to the tree that:
1. Detects clicks on Shared/Private root nodes
2. Calculates if the click was in the "button area" (right side of the row)
3. Triggers the appropriate callback

## How It Works

### Current Implementation

**setupCustomRenderer():**
- Creates a visual panel with label + icon for the "+" button
- The icon is just for display - not interactive

**setupMouseListener():**
- Listens for mouse clicks on the tree
- When a click occurs:
  1. Gets the tree path at click location
  2. Checks if it's a SharedRoot or PrivateRoot node
  3. Calculates click X position relative to row start
  4. If X > 60 pixels (button area), triggers callback

### Click Detection Logic

```kotlin
val rowBounds = groupTree.getPathBounds(path)
val clickX = e.x - rowBounds.x

// Button is at right side, after ~60px label
if (clickX > 60) {
    // Click was on button area
    when (userObject) {
        is SharedRoot -> onAddGroupToShared()
        is PrivateRoot -> onAddGroupToPrivate()
    }
}
```

## Debugging Steps

### 1. Verify Callbacks Are Wired
Check that `PromptLibraryPanel` passes the callbacks:

```kotlin
private val groupTreePanel = GroupTreePanel(
    repository = repository,
    onGroupSelected = { ... },
    onPromptSelected = { ... },
    onAddGroupToShared = { addGroupToNamespace("Shared") },  // ✓
    onAddGroupToPrivate = { addGroupToNamespace("Private") }  // ✓
)
```

### 2. Add Debug Logging
Add print statements to verify clicks are detected:

```kotlin
override fun mouseClicked(e: MouseEvent) {
    println("Mouse clicked at (${e.x}, ${e.y})")
    
    val path = groupTree.getPathForLocation(e.x, e.y) ?: run {
        println("No path at location")
        return
    }
    
    val node = path.lastPathComponent as? DefaultMutableTreeNode ?: run {
        println("Not a tree node")
        return
    }
    
    val userObject = node.userObject
    println("Clicked on: $userObject")
    
    if (userObject !is SharedRoot && userObject !is PrivateRoot) {
        println("Not a root node")
        return
    }
    
    val rowBounds = groupTree.getPathBounds(path) ?: run {
        println("No row bounds")
        return
    }
    
    val clickX = e.x - rowBounds.x
    println("Click X relative to row: $clickX")
    
    if (clickX > 60) {
        println("Triggering callback for $userObject")
        when (userObject) {
            is SharedRoot -> onAddGroupToShared()
            is PrivateRoot -> onAddGroupToPrivate()
        }
    } else {
        println("Click was on label area, not button")
    }
}
```

### 3. Check Button Position
The hardcoded `60` pixel threshold might need adjustment based on:
- Font size
- Icon size
- Label text length ("Shared" vs "Private")

To find the right value:
1. Add logging to print `clickX` for all clicks
2. Click on different parts of the row
3. Adjust the threshold based on actual button position

### 4. Alternative: Use Precise Bounds
Instead of hardcoded threshold, calculate actual button bounds:

```kotlin
val renderer = groupTree.cellRenderer.getTreeCellRendererComponent(
    groupTree, node, false, groupTree.isExpanded(path), 
    node.isLeaf, groupTree.getRowForPath(path), false
) as? JPanel ?: return

// Get actual component bounds
val components = renderer.components
if (components.size >= 2) {
    val buttonLabel = components[1] // Second component is the button icon
    val buttonX = buttonLabel.x
    val buttonWidth = buttonLabel.width
    
    if (clickX >= buttonX && clickX <= buttonX + buttonWidth) {
        // Click was precisely on button
        when (userObject) {
            is SharedRoot -> onAddGroupToShared()
            is PrivateRoot -> onAddGroupToPrivate()
        }
    }
}
```

## Testing

### Unit Tests
✅ Created `GroupTreePanelInlineButtonTest.kt` with:
- Test for Shared button callback
- Test for Private button callback
- Test that label clicks don't trigger callbacks

### Manual Testing
1. Build and run the plugin
2. Open the Prompt Library tool window
3. Look for "+" icons next to Shared and Private
4. Click on the "+" icon (not the label)
5. Should see "New group name:" dialog

## Expected Behavior

**When clicking the "+" next to "Shared":**
1. Mouse listener detects click
2. Identifies SharedRoot node
3. Calculates click is in button area
4. Calls `onAddGroupToShared()`
5. Shows dialog: "New group name:"
6. Creates group in Shared namespace

**When clicking the "+" next to "Private":**
- Same flow, but calls `onAddGroupToPrivate()`

## Troubleshooting

### Button doesn't appear
- Check that `setupCustomRenderer()` is called in `init`
- Verify renderer is returning the panel for root nodes

### Button appears but click does nothing
- Check that `setupMouseListener()` is called in `init`
- Add debug logging to verify clicks are detected
- Adjust the `60` pixel threshold

### Wrong callback triggered
- Verify the `when` statement correctly matches SharedRoot/PrivateRoot
- Check that node.userObject is the expected type

### Dialog doesn't appear
- Verify `addGroupToNamespace()` is being called
- Check that `JOptionPane.showInputDialog()` is working
- Ensure callbacks are properly wired in PromptLibraryPanel

## Next Steps

If clicks still don't work:
1. Add the debug logging from step 2
2. Run the plugin and click around
3. Check console output to see where the flow breaks
4. Adjust the click detection logic based on findings

