# VS Code Prompt Library — Tracking

Scope: Implement Phases 1–2 per BABY_STEPS_PLAN.md

Status: Phase 2 started — add/list/copy/delete working in webview; duplicate prevention on add; storage normalized.

Milestones / Checklist

Phase 1 — Scaffolding and minimal UI
- [x] Initialize extension: package.json, src/extension.ts, view container+view; hello command
- [x] Storage scaffolding: LibraryStore read/write JSON in global storage (seed Shared/Private roots + Unfiled) and normalize/migrate Unfiled
- [x] Tree for groups: TreeDataProvider for Shared/Private roots, Unfiled pinning, context menus (add/rename/delete with persistence)
- [x] Right‑pane webview skeleton; group selection enables composer

Phase 2 — Prompt CRUD and list
- [x] Add prompt via composer to selected group
- [x] Render prompt list for selected group
- [x] Copy to clipboard and delete
- [x] Duplicate detection + normalization (on add)
- [x] Edit prompt text
- [x] Move to group
- [ ] Search filtering in webview

Decisions
- UI: Sidebar with both a Groups TreeView and a right‑pane WebviewView
- Git sync, YAML, and settings deferred to later phases as per plan

Next Actions (short)
1) Implement edit prompt text with autosave
2) Implement move-to-group (QuickPick over groups)
3) Add search box and filter in webview
