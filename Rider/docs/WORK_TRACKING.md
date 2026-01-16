## Work Tracking Log — Rider Prompt Library Plugin

This living document is the hand-off ledger for agents/contributors. Update it after each meaningful change.

### Conventions

- Entries are reverse-chronological (newest first)
- Each entry includes: Date, Author, Summary, Files touched, Next step
- Keep notes concise but actionable

---

### 2026-01-16 — Phase 1 Refactoring: Extracted PromptCard and PromptComposer components (Author: Augment Agent)

- Summary:
  - Started Phase 1 of the REFACTORING_AND_TESTING_PLAN.md to improve testability and maintainability.
  - Extracted PromptCard component (175 lines) from PromptLibraryPanel with full callback-based architecture for testability.
  - Extracted PromptComposer component (140 lines) with SaveResult sealed class for type-safe error handling.
  - Reduced PromptLibraryPanel from 1021 lines to 882 lines (139 lines saved, ~13.6% reduction).
  - Added comprehensive unit tests for both components (6 tests for PromptCard, 10 tests for PromptComposer).
  - All 126 tests passing (110 existing + 16 new component tests).
  - Components use constructor injection and callbacks instead of direct dependencies, making them independently testable.
- Files touched:
  - src/main/kotlin/com/example/promptlibrary/ui/components/PromptCard.kt (new)
  - src/main/kotlin/com/example/promptlibrary/ui/components/PromptComposer.kt (new)
  - src/test/kotlin/com/example/promptlibrary/ui/components/PromptCardTest.kt (new)
  - src/test/kotlin/com/example/promptlibrary/ui/components/PromptComposerTest.kt (new)
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt (refactored)
- Next step:
  - Continue Phase 1: Extract GroupTreePanel, PromptListPanel, ToolbarPanel components.
  - Extract dialog classes: ImportDialog, ExportDialog, EditPromptDialog, GroupManagementDialog.
  - Goal: Reduce PromptLibraryPanel to < 300 lines.

---

### 2025-09-08 — Root prompt migration, Unfiled default, namespace safeguards, and UX polish (Author: Augment Agent)

- Summary:
  - Migrated any private-root prompts into Private/Unfiled on startup; prevented prompts from showing when a namespace root (Private/Shared) is selected.
  - New prompts default to the selected group or Private/Unfiled when no group is selected.
  - Move To… now lists only groups (no namespace roots); moving prompts removes them from previous location (group or private) and inserts into the target.
  - Edit dialog Save now updates prompts regardless of location (private or any group) with de-duplication across all prompts.
  - Added group toolbar above the tree: Add (Shared/Private), Rename, Delete (blocked in Shared). Focus restored after add/save/rebuild.
  - Composer UX: Save disabled on roots, hint shown, editor grays out; state updates live with selection.
  - Fixed string interpolation in delete dialogs/notifications.
- Files touched:
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt
  - src/main/kotlin/com/example/promptlibrary/repository/PromptRepository.kt
- Next step:
  - Add lightweight success toasts (Created group, Saved changes, Moved to <Group>)
  - Optionally pin Unfiled to top and make it non-deletable; hide when empty.

### 2025-08-23 — Shared/Private roots, context menu, Unfiled fallback (Author: Augment Agent)

- Summary:
  - Flattened top-level to two roots: Shared and Private; removed visible “Library” label; auto-expand roots; disabled rename/delete on roots.
  - Added right-click context menu on groups for Rename/Delete; fixed delete dialog interpolation; toasts on collision and delete.
  - Repository: per-namespace APIs addSharedGroup/addPrivateGroup, getSharedGroups/getPrivateGroups; uniqueness per namespace; ensureUnfiledGroup.
  - Toolbar Add Group prompts for target namespace (Shared/Private).
- Files touched:
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt
  - src/main/kotlin/com/example/promptlibrary/repository/PromptRepository.kt
- Next step:
  - Optionally veto collapsing roots; pin Unfiled at top and make non-deletable.
  - Implement YAML repo import/export and document Shared/Private behaviors in README.

### 2025-08-20 — UI polish scaffolding and YAML wiring plan (Author: Augment Agent)

- Summary:
  - Began stabilizing PromptLibraryPanel layout: introduced Options gear, planned Show group tree toggle, saved splitter state.
  - Planning to remove in-row editor and rely on modal editor to eliminate flicker; card size stabilized.
  - Decided on Import/Export dropdowns to add YAML Repository format (KAML) next to JSON v1.
- Files touched:
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt (WIP scaffold for options and splitter persistence)
- Next step:
  - Complete UI fixes (toggle, persistence), then implement YAML Import/Export via new helpers.
  - Build and verify in sandbox; document new options in README.

### 2025-08-20 — Build system migration to v2 plugin + successful build (Author: Augment Agent)

- Summary:
  - Migrated Gradle from org.jetbrains.intellij 1.x to org.jetbrains.intellij.platform 2.x DSL.
  - Targeted Rider 2024.3 in main build; added legacy build script for Rider 2024.1–2025.1.
  - Resolved build hangs by using wrapper and timeboxed runs; confirmed progress was dependency downloads.
  - Fixed instrumentation dependency by disabling InstrumentCodeTask (no GUI forms used).
  - Switched toolchains to JDK 21 and enabled auto-provisioning via Foojay resolver.
  - Fixed a Kotlin scope bug in PromptLibraryPanel.kt around JScrollPane creation.
  - Updated CI: better cache keys, warm setupDependencies, use ./gradlew.
- Files touched:
  - build.gradle.kts, build-legacy.gradle.kts, settings.gradle.kts, gradle.properties, .github/workflows/build-and-release.yml
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt
- Next step:
  - Optionally re-enable instrumentation and pin java-compiler-ant-tasks matching platform build if forms are introduced.
  - Consider adding basic unit tests for repository import/export and normalization.
  - Prepare a Release zip and test install on Rider 2024.3.

### 2025-08-19 — Continue Phase 1: Context menu + Import/Export v2 notes (Author: Augment Agent)

- Summary:
  - Implemented right-click context menu on prompt cards and titles with actions: Copy, Open in Editor, Delete (with confirm + undo notification).
  - Added modal Edit Prompt dialog with autosave-on-close.
  - Updated Export dialog title to "Export Prompts (v1 JSON)" and Import dialog header to clarify v1 vs v2 input handling (v2 flattens to private prompts).
  - Repository now exposes loadGroups() accessor to enable future Groups view scaffolding.
- Files touched:
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt (context menu, editor dialog, import/export copy changes)
  - src/main/kotlin/com/example/promptlibrary/repository/PromptRepository.kt (loadGroups)
- Next step:
  - Verify v2 migration path in sandbox: ensure prompts.json -> prompts.v2.json conversion, titles render, search works, and context menu actions behave.
  - Optionally scaffold a basic Groups sidebar (non-interactive) that lists group names from v2 library.

### 2025-08-18 — Step 1/3: Grouped local store (v2) + title support + migration (Author: Augment Agent)

- Summary:
  - Added optional `title` to Prompt and `displayTitle()` helper deriving first 50 chars with ellipsis when blank.
  - Introduced grouped local storage file `prompts.v2.json` storing `Library(groups[], privatePrompts[])`.
  - Implemented migration: on first load, if only v1 `prompts.json` exists, convert to v2 with `privatePrompts` and mark items `private=true`.
  - Kept backward-compat loader: UI repository APIs still return flat list of private prompts.
  - UI now shows a bold title label per prompt card using `displayTitle()`.
  - Gradle wrapper already at 8.10.2; use Rider build or wrapper for CLI builds.
- Files touched:
  - src/main/kotlin/com/example/promptlibrary/model/Prompt.kt (add title, displayTitle)
  - src/main/kotlin/com/example/promptlibrary/model/Library.kt (used by repo)
  - src/main/kotlin/com/example/promptlibrary/repository/PromptRepository.kt (v2 store, migration, save/load)
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt (add title label)
- Next step:
  - Step 2/3: Add basic group management UI scaffolding (optional for now), and ensure import/export UX mentions v1 vs v2 formats.

### 2025-08-15 — Initial scaffolding of documentation (Author: Augment Agent)

- Summary:
  - Rewrote README.md with comprehensive design, architecture, data model, normalization rules, plan, and acceptance criteria.
  - Added docs/KICKOFF.md with onboarding instructions for new agents.
  - Created this docs/WORK_TRACKING.md file and conventions.
- Files touched:
  - README.md
  - docs/KICKOFF.md
  - docs/WORK_TRACKING.md
- Next step:
  - Create INSTALL.md with build/install/use instructions.
  - Begin Step 1 from the plan: Gradle project setup with Kotlin + IntelliJ plugin targeting Rider and a placeholder ToolWindow.

### 2025-08-15 — Step 1 kickoff: Gradle + plugin scaffold (Author: Augment Agent)

- Summary:
  - Added Gradle build files and IntelliJ plugin configuration targeting Rider (RD).
  - Implemented minimal ToolWindowFactory that shows a placeholder panel.
  - Added basic plugin icons.
  - Added Gradle wrapper configuration files (note: wrapper JAR must be generated locally).
- Files touched:
  - settings.gradle.kts, build.gradle.kts, gradle.properties
  - src/main/resources/META-INF/plugin.xml, pluginIcon.svg, pluginIcon_dark.svg
  - src/main/kotlin/com/example/promptlibrary/PromptLibraryToolWindowFactory.kt
  - gradlew.bat, gradle/wrapper/gradle-wrapper.properties
- Next step:
  - Generate Gradle wrapper JAR (gradle/wrapper/gradle-wrapper.jar) locally by running `gradle wrapper` or let Rider/IDEA create it.
  - Run `./gradlew runIde` (Windows: `gradlew.bat runIde`) to verify the tool window appears in sandbox Rider.

### 2025-08-15 — Step 2 in progress: Static UI scaffold (Author: Augment Agent)

- Summary:
  - Added PromptLibraryPanel with toolbar (Export/Import/Search), scrollable list, in-memory prompts, click-to-copy, edit toggle, delete confirm, and new prompt composer.
  - Wired ToolWindow to use the new panel.
  - Added a notification group for copy-to-clipboard toasts.
- Files touched:
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt
  - src/main/kotlin/com/example/promptlibrary/PromptLibraryToolWindowFactory.kt
  - src/main/resources/META-INF/plugin.xml
- Next step:
  - Run the sandbox and manually verify layout, wrapping, scrolling, copy, add, edit toggle, delete confirm.
  - Then proceed to Step 3 (persistence via JSON file under config path).

### 2025-08-15 — Sandbox run verified (Author: You)

- Summary:
  - Ran the “Run Plugin Sandbox” configuration in Rider successfully.
  - Tool window appears and the scaffold UI is functional (add, copy, edit toggle, delete confirm, search filter in-memory).
- Files touched:
  - (no code changes)
- Next step:
  - Implement Step 3 (persistence): PromptRepository with JSON file under IDE config path; load/save on add/edit/delete.

### 2025-08-15 — Step 3 implemented: Local persistence (Author: Augment Agent)

- Summary:
  - Created Prompt data model with id, text, createdAt, updatedAt fields and normalization methods.
  - Implemented PromptRepository with JSON persistence under IDE config path (PathManager.getConfigPath()/prompt-library/prompts.json).
  - Updated PromptLibraryPanel to use repository instead of in-memory list.
  - Added kotlinx.serialization dependency for JSON handling.
  - Added duplicate detection based on normalized text.
  - All CRUD operations now persist to disk immediately.
- Files touched:
  - build.gradle.kts (added kotlinx.serialization plugin and dependency)
  - src/main/kotlin/com/example/promptlibrary/model/Prompt.kt (new)
  - src/main/kotlin/com/example/promptlibrary/repository/PromptRepository.kt (new)
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt (updated to use repository)
- Next step:
  - Test the implementation by running the sandbox. Need to generate gradle-wrapper.jar first or run through IDE.
  - Verify that prompts persist across restarts (Step 3 DoD: restart Rider and prompts persist).

### 2025-08-15 — Step 3 completed: Persistence verified (Author: You)

- Summary:
  - Fixed compilation errors (PathManager import path).
  - Tested sandbox successfully - persistence is working beautifully.
  - Prompts persist across Rider restarts as expected.
  - Step 3 Definition of Done achieved: "restart Rider and prompts persist" ✅
- Files touched:
  - src/main/kotlin/com/example/promptlibrary/repository/PromptRepository.kt (fixed import)
- Next step:
  - Implement Step 4: Copy on click with notification (already partially working, need to verify and polish).

### 2025-08-15 — Step 4 completed: Copy on click verified (Author: You)

- Summary:
  - Tested copy-to-clipboard functionality - works perfectly!
  - Clicking prompt text copies original text to clipboard.
  - "Prompt copied" notification appears as expected.
  - Step 4 Definition of Done achieved: "manual test copies expected text" ✅
- Files touched:
  - (no code changes needed - already implemented)
- Next step:
  - Implement Step 5: Edit in place + Save/Cancel (appears mostly implemented, need to verify and polish).

### 2025-08-15 — Step 5 completed: Edit in place with Save/Cancel (Author: Augment Agent)

- Summary:
  - Enhanced edit functionality by adding Cancel button alongside Save.
  - Cancel button restores original text and exits edit mode.
  - Save button persists changes via repository.
  - Tested successfully - edit functionality works brilliantly!
  - Step 5 Definition of Done achieved: "edit survives restart" ✅
- Files touched:
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt (added Cancel button with proper layout)
- Next step:
  - Implement Step 6: Delete with confirm/undo (confirm dialog already implemented, may need undo functionality).

### 2025-08-15 — Step 6 completed: Delete with confirm (Author: You)

- Summary:
  - Delete functionality working perfectly with confirmation dialog.
  - Trash icon (minus sign) shows "Delete this prompt?" confirm dialog.
  - Duplicate prevention working correctly - can't add duplicate prompts.
  - Edit, save, and delete all working as expected.
  - Confirmation dialog is sufficient - undo notification not necessary.
  - Step 6 Definition of Done achieved: "delete requires confirm or allows undo; state consistent after restart" ✅
- Files touched:
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt (added undo notification, but confirm dialog is the primary UX)
- Next step:
  - Implement Step 7: Search (simple substring) - case-insensitive filter with normalization.

### 2025-08-15 — Step 7 completed: Search functionality verified (Author: You)

- Summary:
  - Search functionality working perfectly - already implemented and tested.
  - Real-time case-insensitive substring filtering with text normalization.
  - Search field in toolbar filters prompts as you type.
  - Empty search shows all prompts, text search narrows visible cards predictably.
  - Step 7 Definition of Done achieved: "searching narrows visible cards predictably" ✅
- Files touched:
  - (no code changes needed - already implemented)
- Next step:
  - Implement Step 8: Import/Export JSON - wire up the disabled Export/Import buttons with file dialogs and JSON handling.

### 2025-08-15 — Step 8 completed: Import/Export JSON (Author: Augment Agent)

- Summary:
  - Implemented flexible import functionality that accepts multiple JSON formats:
    - Simple string arrays: ["prompt1", "prompt2"]
    - Objects with just text field: [{"text": "prompt"}]
    - Full Prompt objects with optional id/timestamps
    - Mixed formats in same array
  - Implemented clean export functionality that outputs simple string arrays
  - Added comprehensive file dialogs with save/load and clipboard operations
  - Fixed compilation errors with JDialog constructors and JSON serialization
  - Testing works beautifully - both import and export functioning perfectly!
  - Step 8 Definition of Done achieved: "no duplicate prompts by normalized text" ✅
- Files touched:
  - src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt (added export/import dialogs and flexible JSON parsing)
- Next step:
  - Implement Step 9: Polish & packaging - icons, spacing, wrapping behavior, basic tests, buildPlugin.

### 2025-08-15 — Repository cleanup and README restructure (Author: Augment Agent)

- Summary:
  - Completely restructured README.md to be user-focused with quick start at top
  - Added project story section explaining evolutionary development approach
  - Merged useful content from INSTALL.md into README.md
  - Removed redundant INSTALL.md file to eliminate duplication
  - Updated build configuration to support Rider 2024.3+ (fixed version compatibility)
  - Added troubleshooting section and enhanced JSON format documentation
  - Repository now has clean structure: README.md + 2 docs files (KICKOFF.md, WORK_TRACKING.md)
- Files touched:
  - README.md (complete restructure with user-focused approach)
  - INSTALL.md (removed - content merged into README)
  - build.gradle.kts (updated Rider version to 2024.3)
  - docs/WORK_TRACKING.md (this update)
- Next step:
  - Complete Step 9 testing: verify buildPlugin works and plugin installs successfully in Rider 2024.3+
