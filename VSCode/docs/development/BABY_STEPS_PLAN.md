# VS Code Prompt Library – Baby‑Steps Plan

Objective: Understand the existing Rider Prompt Library plugin and translate it into a VS Code extension that offers equivalent core functionality: a sidebar view with Shared/Private group namespaces, prompt CRUD with duplicate prevention, search, import/export (JSON), persistent storage, and optional Git YAML sync of Shared groups.

---

## 0) What the Rider plugin does (essentials to mirror)
- Tool window with a group tree: Shared and Private namespaces; Private has a pinned Unfiled group; roots show no prompts.
- Right pane shows prompts for the selected group only.
- New prompt composer saves into the selected group, defaulting to Private/Unfiled when no group is selected.
- CRUD: copy to clipboard, edit dialog with autosave, delete with confirm and undo notification, move to group.
- Search: real‑time, normalized case‑insensitive filter.
- Import/Export JSON: simple array of strings primarily; accepts flexible formats on import.
- Persistent storage: JSON (v2) in IDE config folder; migration from older v1.
- Git YAML sync (Shared only): pull → load YAML → remote‑wins merge → write deterministic YAML → commit & push; optional branch+PR; background fetch scheduler; settings page.

---

## 1) VS Code architecture mapping
- UI container: contributes.views (activity bar or explorer) with a custom view id (e.g., `promptLibrary`).
- Group tree: TreeDataProvider to render Shared/Private roots, Unfiled, nested groups, and prompts beneath groups (or keep prompts on right webview—see Phases below). For parity with Rider, prefer groups in a tree and prompts rendered in the same view using a webview or a second tree.
- Prompt list + composer UI: WebviewView (preferred) embedded as the view content, or use a TreeView for groups and a Webview for the right pane.
- Storage: use `extensionContext.globalStorageUri` with JSON file(s) mirroring v2 Library schema (groups + privatePrompts).
- Clipboard: `vscode.env.clipboard.writeText`.
- Notifications: `vscode.window.showInformationMessage/WarningMessage/ErrorMessage`.
- Commands: register for copy, add/edit/delete/move, import/export, sync.
- Settings: contributes.configuration for repo URL, local path, prompts subdir, branch, strategy, auto‑fetch cadence.
- Git: start with shelling out to git via `child_process` in the selected working copy directory; later optionally call Git extension API (`vscode.git`).
- YAML: use `js-yaml` to read/write deterministic YAML; ensure consistent ordering and defaults.

---

## 2) Data model (parity with Rider)
- Prompt: { id, text, title?, createdAt, updatedAt, tags[], private: boolean } with normalizedText helper.
- Group: { id, name, kind, description?, tags[], children: Group[], prompts: Prompt[] }.
- Library: { groups: Group[], privatePrompts: Prompt[] }.
- Namespacing: use tags `ns:shared` and `ns:private` to identify group space like Rider.

---

## 3) Phased baby‑steps plan

### Phase 1 — Scaffolding and minimal UI
1. Initialize extension
   - Files: package.json, src/extension.ts, basic activate/deactivate, command `promptLibrary.hello`.
   - Contributes: a new view container and a view (sidebar) titled “Prompt Library”.
   - Acceptance: extension activates, view appears.

2. Storage scaffolding
   - Implement LibraryStore reading/writing JSON in global storage.
   - Create v2 file if missing; define migration stub (v1→v2).
   - Acceptance: round‑trip save/load no‑op library.

3. Tree for groups (Shared/Private roots)
   - Implement TreeDataProvider for Shared/Private roots and group nodes; pin Unfiled at top of Private; forbid delete for Shared roots; add context menu items for add/rename/delete (enforced accordingly).
   - Acceptance: groups visible; add/rename/delete updates persist.

### Phase 2 — Prompt CRUD and list
4. Prompt list UI (webview)
   - Render right‑pane list in a WebviewView: search box, list of prompt cards with copy/edit/delete; expand/collapse per card; Save button enabled only when a group is selected; composer at bottom.
   - Wire message passing (postMessage/from webview) to extension host for repository ops.
   - Acceptance: create/edit/delete/move prompts; copy to clipboard; search filters rendered list; state persists.

5. Duplicate detection + normalization
   - Implement normalization parity with Rider; dedupe on add/edit/import across private + groups.
   - Acceptance: attempts to add near‑duplicate are blocked with message.

6. Move to group
   - Context menu or button shows group picker (QuickPick) for valid targets (only groups, never Shared/Private roots).
   - Acceptance: prompt moves and persists.

### Phase 3 — Import/Export
7. Export JSON (v1 simple array primary)
   - Export scope: selected group or entire library when a root is selected; display in a preview webview with Copy/Save buttons; ensure proper escaping.
   - Acceptance: exported JSON matches selection; copy or save works.

8. Import JSON (flexible)
   - Paste or open file dialog; parse arrays of strings or objects; dedupe and add to private (mark as private=true) or current group—follow Rider’s behavior (private default is fine for v1).
   - Acceptance: import count and duplicates skipped are shown; items persist.

### Phase 4 — Settings and basic Git plumbing
9. Settings page
   - contributes.configuration: remoteRepoUrl, repoPath, promptsSubdir (default `prompts`), branchName, writeStrategy: direct|branchPR, autoFetchEnabled, autoFetchMinutes.
   - Acceptance: read/write settings via `workspace.getConfiguration`.

10. Git working copy management
   - If repoPath is set and valid, use it; else if remoteRepoUrl set, clone to `globalStorageUri/repos/<name>`.
   - Shell out to git (`git clone`, `git pull`, `git checkout -B`, etc.).
   - Acceptance: clone or open local repo; report errors via message.

### Phase 5 — YAML sync (Shared only)
11. Load from repo into Shared (remote‑wins)
   - Read YAML tree at `<promptsSubdir>/Group/_group.yaml` and `<promptsSubdir>/Group/prompts/p-*.yaml`; recursively for children.
   - Replace local Shared with remote; move any local Shared prompts not on remote to Private/Unfiled; show a toast like Rider.
   - Acceptance: counts and behavior match; Shared replaced correctly.

12. Write YAML + commit & push
   - Deterministic writes; delete and recreate `<promptsSubdir>` to avoid stale files; commit message summary; direct or branch+PR flow (open compare URL if available).
   - Acceptance: file diff summary shown; commit/push works or reports no changes.

13. Full Sync action
   - Pull → load YAML → merge remote‑wins → write YAML → commit & push; single command bound to toolbar.
   - Acceptance: end‑to‑end works with toasts.

14. Auto‑fetch scheduler (optional)
   - If enabled, setInterval to `git fetch` / `git pull --ff-only`; surface status in output/log channel.
   - Acceptance: periodic fetch with no UI freezes.

---

## 4) Parity checks & acceptance criteria
- Sidebar view exists; Shared/Private roots, Unfiled pinning, and non‑prompt roots show no prompts.
- Prompt composer disabled unless a group is selected; saving into selected group; default to Private/Unfiled as needed.
- Copy/edit/delete with confirm + undo (optional for MVP – can add later); move to group.
- Real‑time search with normalization; duplicate prevention on add/edit/import.
- Import/export JSON parity with Rider’s v1.
- Settings for Git sync; remote‑wins merge; deterministic YAML; commit & push.

---

## 5) Risks/unknowns
- Git API: Leaning on shelling out is simplest; Git extension API can improve UX but adds complexity.
- Webview vs. Tree-only UI: webview offers richer, Rider‑like cards; Tree‑only version is simpler but less polished.
- Deterministic YAML: ensure stable ordering and default emission with js-yaml (custom sorting may be required).

---

## 6) Out of scope (phase 1)
- Full branch+PR automation across all Git providers; start with direct commit/push.
- Multi-window or multi-workspace synchronization.

---

## 7) Next steps
- Create `VSCode/package.json`, `src/extension.ts`, `src/store.ts`, `src/model.ts`, `media/` for webview assets.
- Implement Phases 1–2; dogfood with local JSON store before adding Git YAML sync.

