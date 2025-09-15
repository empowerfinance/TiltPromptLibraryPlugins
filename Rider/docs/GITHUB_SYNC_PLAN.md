## GitHub Sync: Evolutionary Execution Plan

This plan breaks delivery into very small, verifiable steps. After each step, update docs/GITHUB_SYNC_TRACKING.md.

Conventions
- Guardrails: no auto-installs, no background sync, user-triggered actions only.
- Tests: manual validation in Rider sandbox after each step; add unit tests where feasible for non-UI logic.

Phase 0 — Foundations
1. Add design/plan/tracking/kickoff docs (this PR).
   - Acceptance: files exist and are referenced by KICKOFF.md.
2. Introduce domain scaffolding (no behavior changes): Group, GroupKind, Library models; extend Prompt with private flag and tags.
   - Acceptance: compiles; no UI changes.

Phase 1 — Local grouping UX (no Git yet)
3. Repository v2: extend PromptRepository to support groups, private=true, and an optional title field. Migrate existing prompts.json to a new local store (prompts.v2.json) with default group “My Prompts”. Derive title from the first 50 characters of text when empty (truncate with ellipsis). Keep backward-compat loader.
   - Acceptance: previous prompts load into My Prompts; CRUD works; title is present when available or derived (50 chars with ellipsis).
4. UI tree: render groups (expand/collapse), prompts under groups; wrapped text in list cards; each prompt row has a per-row "Open in Editor" button and right-click context menu to open a full editor window for rich editing. Enforce a max row height of 240px so two prompts do not consume half the IDE; rows are evenly sized up to the max height, with overflow clipped/wrapped. Title is shown on the row; if title is blank, derive from the first 50 characters of text (truncate with ellipsis). Clicking title also opens editor.
   - Acceptance: groups can be added/renamed/deleted; prompts can be moved; text wraps; rows are capped by max height (240px) and evenly sized; per-row button and context menu exist; clicking title or button opens editor; autosave on close updates repository without explicit save.
   - Notes: Defer global toolbar button and keyboard shortcuts. Autosave on close (editor) only; in-row edits still require explicit save/cancel where applicable.
5. Private section: separate virtual group “Private” to house private prompts; toggle visibility.
   - Acceptance: private prompts not exported and clearly indicated.

Phase 2 — Settings and YAML I/O
6. Settings page (Configurable): fields for Git repo path, prompts subdir, branch, strategy (direct vs branch+PR); validate path.
   - Acceptance: settings persist; invalid path shows error and disables Sync actions.
7. YAML serializer: implement read/write for file-per-prompt and _group.yaml schemas; unit tests for determinism and round-trip.
   - Acceptance: exporter can write a small sample tree to a temp dir and read it back identically.

Phase 3 — Git integration (read-only then write)
8. Read-only import from Git repo: given a valid repo path, read YAML tree into memory and display under a synced root (e.g., “Shared”). No writes yet.
   - Acceptance: tree mirrors repo dir structure; no blocking on Git state.
9. Git operations (pull only): integrate with Git4Idea to fetch and pull --rebase for configured repo/branch; surface status/toast.
   - Acceptance: pull succeeds or presents actionable error; last pulled time visible.
10. Merge view: merge remote YAML into local Library (excluding private). Identify duplicates by normalized text; flag conflicts (same prompt id changed both sides) with a simple conflict badge.
   - Acceptance: user can see conflicts in UI (no solver yet).

Phase 4 — Safe write path
11. Draft write to working tree: write merged state to the repo working copy in a dry-run mode (temp dir diff) and show a preview diff count.
   - Acceptance: user can confirm to apply.
12. Apply write + commit (no push): write files, stage, create commit with message; keep conflicts surfaced if Git refuses.
   - Acceptance: commit created locally.
13. Push: push commit; if rejected, prompt to pull --rebase and retry.
   - Acceptance: push succeeds; errors are clear.
14. Conflict assistance: when conflicts occur, open Rider’s Version Control tool window focused on the repo; provide a “Finalize Sync” action to continue after manual resolve.
   - Acceptance: conflict path is usable end-to-end.

Phase 5 — Quality, docs, polish
15. PR flow (optional): add "use branch+PR" mode; create chore/prompts-YYYYMMDD-HHMM, push, and open browser PR via IDE API or gh if available.
   - Acceptance: branch and PR opened automatically.
16. Performance: lazy load large trees; remember expand/collapse state; add quick filter by tags.
17. Documentation: update README and docs; add examples of repo layout and YAML files.

Cutline and Rollout Strategy
- We can cut a first value delivery at the end of Phase 1 (local grouping + private prompts).
- Phase 2 adds settings + YAML I/O for offline sharing.
- Phase 3–4 delivers full Git sync.

Meta per Step (what the agent needs)
For every step, include in tracking:
- Goal: succinct outcome
- Files likely touched
- Manual validation steps in Rider
- Migration considerations
- Commit message template

Rollback Strategy
- Keep old JSON reader active until Phase 2 completes; gated migrations with backups.
- All Git writes are explicit and previewed; no background changes.

