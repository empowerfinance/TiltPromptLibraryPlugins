# Changelog

## Unreleased

### Added

- 🎨 **Unified View, Add and Edit Interface** - Single streamlined panel for all prompt operations
  - Click any prompt to load it for immediate editing
  - Smart save button only enables when changes are detected
  - Three modes: Add (empty fields), Edit (loaded prompt), View (readonly - deprecated)
  - Auto-title generation from first 20 characters
  - "Add New" button only shows when editing (not in add mode)

- 📤 **Send to Augment** - One-click integration to send prompts directly to Augment chat
  - Automatically opens Augment's chat panel
  - Pastes prompt text into the input field
  - Fallback clipboard copy if paste fails
  - Works seamlessly with Augment for VS Code extension

- 🧹 **UI Cleanup**
  - Removed separate "Prompt" detail panel (no longer needed)
  - Toolbar buttons (Sync Ops, Settings) moved to Prompt Groups title bar
  - Removed duplicate headings and debug text
  - Cleaner, more spacious interface

### Changed

- **Layout Reorganization** - Views reordered to match Rider plugin:
  - Prompt Groups (tree) at top
  - View, Add and Edit (composer) in middle
  - Removed redundant detail view at bottom

## 0.0.1

- Initial scaffold: sidebar view, hello command, TS config, model + store skeleton.
