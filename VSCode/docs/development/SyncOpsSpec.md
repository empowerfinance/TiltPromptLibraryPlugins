# Prompt Library VS Code Extension — Sync Ops Restructure Spec

## Goals
- Replace the sidebar "Sync Status" view with a dedicated page (WebviewPanel) opened via the command "Prompt Library: Sync Ops".
- Preserve existing logging behavior and surface logs in the new page.
- Simplify operations: replace separate Fetch and Pull actions with a single "Pull & Sync Repo".
- Provide clear feedback and disable actions when required settings (repoPath) are not set.
- Keep existing sync flows (Direct Commit / Branch + PR / Read/Write YAML) available via commands, but surface only essentials on the Sync Ops page.

## UX Changes
- Remove Activity Bar webview view `promptLibraryStatus` and its sidebar presence.
- Add a new WebviewPanel (two columns layout):
  - Left column: actions
    - Pull & Sync Repo (single-click: git pull + import YAML into library)
    - Open Settings
    - Clear Logs
    - Inline key settings summary (repoPath, promptsSubdir, writeStrategy)
    - If repoPath is missing: show a warning banner and disable Pull & Sync button
  - Right column: live log stream (auto-scroll)

## Commands
- New:
  - `promptLibrary.syncOps` — opens the Sync Ops panel
  - `promptLibrary.syncPullAndImport` — pull remote, read YAML from repoPath/promptsSubdir into shared library, refresh tree
- Existing commands remain for backward compatibility (not all are exposed on the new page UI):
  - `promptLibrary.syncWriteNow`, `promptLibrary.syncDirectCommit`, `promptLibrary.syncBranchPR`, `promptLibrary.syncReadNow`, `promptLibrary.syncClonePullImport`

## Technical Design
- New file `src/syncOps.ts` implementing `SyncOpsPanel` using `vscode.window.createWebviewPanel`.
  - Subscribes to `log.onDidChange` and mirrors entries into the panel
  - Embeds current settings (from `getSettings()`) into HTML to drive initial state and disable actions when needed
  - Posts messages for: `requestEntries`, `clear`, `openSettings`, `pullSync`
- `src/extension.ts` updates:
  - Remove `StatusViewProvider` import and registration
  - Register new commands `syncOps` and `syncPullAndImport`
  - Implement `syncPullAndImport` by reusing existing helpers:
    - `gitPull(repoPath)` → on success or warn if failed
    - `readSharedGroups(repoPath, promptsSubdir)` and rewrite `root-shared` children; save; refresh tree and main view
- `package.json` updates:
  - Remove `promptLibraryStatus` view contribution and its activation event
  - Add new commands and command-based activation events

## Logging
- Continue using `log` singleton from `src/log.ts` (unchanged: ring buffer, event emitter)
- Panel mirrors entries and supports Clear

## Validation
- `npm run compile` (TypeScript build) should succeed
- Manual smoke test:
  1. Run the extension; execute "Prompt Library: Sync Ops" from the Command Palette
  2. Verify banner/disabled state when `promptLibrary.repoPath` missing
  3. Set repoPath, run "Pull & Sync Repo"; logs and notifications appear; shared groups update and tree refreshes
  4. Clear logs and confirm list updates

## Out of Scope (for now)
- Removing the source file `src/status.ts` (kept for reference/back-compat; not registered)
- Adding additional operations to the panel beyond the core three buttons
- Rider plugin parity (can follow with a similar page if desired)

