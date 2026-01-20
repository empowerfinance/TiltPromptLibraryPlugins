# Rider Plugin Issue Tracking

## Issues to Address

### Issue 1: Settings Not Persisted (Hidden Libraries)

**Status:** ✅ Fixed
**Description:** Hidden libraries are not being saved when the IDE restarts or settings are applied.
**Expected:** When a library is hidden via Settings, it should remain hidden after IDE restart.
**Root Cause:** The `State` class was a `data class` with `MutableList<String>` for `hiddenLibraries`. IntelliJ's `XmlSerializerUtil.copyBean` doesn't properly serialize `MutableList` in data classes.
**Fix:** Changed `State` from `data class` to regular `class` and changed `hiddenLibraries` from `MutableList<String>` to `ArrayList<String>` for proper XML serialization.

### Issue 2: Library Root Node Name Incorrect

**Status:** ✅ Fixed
**Description:** The library root node should display the directory name from disk, not a transformed version.
**Expected:** If directory is `promptsProduct`, node should show `promptsProduct` (or the actual folder name).
**Current:** Shows "PromptsProduct" (PascalCase transformed)
**Root Cause:** `discoverLibraries()` was using `titleCase(potentialLibDir.name)` for `displayName`.
**Fix:** Changed to use `potentialLibDir.name` directly to preserve exact folder name case.

### Issue 3: Library Name Case Mismatch

**Status:** ✅ Fixed
**Description:** The case of prompt library names doesn't match what's on disk.
**Expected:** Library names should preserve the exact case from the filesystem.
**Current:** Names are being transformed (e.g., `EnabledLibraries` instead of `enabledLibraries`).
**Root Cause:** Same as Issue 2 - `titleCase()` transformation.
**Fix:** Same as Issue 2.

### Issue 4: Library Content Not Showing After Un-hide

**Status:** ✅ Fixed
**Description:** After un-hiding a library (PromptsProduct), its content is not displayed in the tree.
**Expected:** When a library is un-hidden, its groups and prompts should appear in the tree.
**Root Cause:** When settings were applied, `LibraryEvents.fireChanged()` was called which rebuilt the tree, but the repository still had the old data. The groups for the newly-visible library weren't loaded from disk.
**Fix:**

1. Added `SyncOrchestrator.reloadFromDisk(repo)` function that reloads from all enabled libraries without git operations.
2. Modified `SettingsPanel.applySettings()` to call `reloadFromDisk()` after saving settings.
3. Refactored to share a single `PromptRepository` instance across all panels.

---

## Test Plan

### Issue 1 Tests

- [x] Test that `PluginSettingsService.hiddenLibraries` persists across save/load cycle
- [x] Test that `State` class is not a data class (for proper XML serialization)
- [x] Test that `hiddenLibraries` is an `ArrayList` (for proper XML serialization)
- [x] Test that `State` has no-arg constructor (for XML serialization)

### Issue 2 & 3 Tests

- [x] Test that `discoverLibraries()` returns folder names with exact case from disk
- [x] Test that `LibraryConfig.displayName` matches the folder name exactly
- [x] Test camelCase folder names are preserved
- [x] Test lowercase folder names are preserved
- [x] Test UPPERCASE folder names are preserved

### Issue 4 Tests

- [x] Test that `reloadFromDisk()` loads from all enabled libraries
- [x] Test that settings apply triggers reload from disk

---

## Progress Log

| Date       | Issue | Action                                                                         | Result                   |
| ---------- | ----- | ------------------------------------------------------------------------------ | ------------------------ |
| 2026-01-20 | 2 & 3 | Added TDD tests for case preservation                                          | Tests failed as expected |
| 2026-01-20 | 2 & 3 | Changed `displayName = titleCase(...)` to `displayName = potentialLibDir.name` | Tests pass               |
| 2026-01-20 | 1     | Added TDD tests for settings persistence                                       | Tests pass               |
| 2026-01-20 | 1     | Changed `State` from data class to regular class, `MutableList` to `ArrayList` | Tests pass               |
| 2026-01-20 | 4     | Added `SyncOrchestrator.reloadFromDisk()` function                             | Compiles                 |
| 2026-01-20 | 4     | Refactored panels to share single `PromptRepository` instance                  | All tests pass           |
