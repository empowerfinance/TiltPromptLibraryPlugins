## GitHub Sync: Tracking Log

This log is the single source of truth for execution status. Update this file only; do not mutate the plan doc except for corrections.

Legend
- [ ] Not started
- [/] In progress
- [x] Done
- [-] Cancelled

Meta Template (copy for each step)
- Step: <Phase/Number> — <Name>
- State: [ ]
- Goal: <one-liner>
- Owner: <name/agent>
- Start: <date>
- End: <date>
- Files likely touched: <paths>
- Validation: <manual steps>
- Notes: <risks/findings>
- Commit template: <message>

---

- Step: 0/1 — Add planning docs
  - State: [x]
  - Goal: Introduce design, plan, tracking, kickoff docs.
  - Owner: planning-agent
  - Start: 2025-08-18
  - End: 2025-08-18
  - Files likely touched: docs/*
  - Validation: Ensure docs exist and are linked.
  - Notes: Initial scaffolding.
  - Commit template: docs: add GitHub sync design/plan/tracking/kickoff

- Step: 0/2 — Domain scaffolding
  - State: [x]
  - Goal: Add Group/GroupKind/Library models; extend Prompt with private and tags (no behavior change).
  - Owner: Augment Agent
  - Start: 2025-08-18
  - End: 2025-08-18
  - Files likely touched: src/main/kotlin/com/example/promptlibrary/model/*
  - Validation: Project compiles in Rider; no UI changes.
  - Notes: Implemented models with Kotlinx Serialization; Prompt adds tags (default empty) and a boolean private flag serialized via @SerialName("private"). Fixed UUID import in Prompt.kt. Plan updated to include per-row "Open in Editor" with 240px max row height and 50-char derived titles.
  - Commit template: refactor(model): scaffold groups and private flag

- Step: 1/3 — Repository v2 with groups + migration
  - State: [x]
  - Goal: Support grouped storage locally; migrate prompts.json to prompts.v2.json with My Prompts default and titles.
  - Owner: Augment Agent
  - Start: 2025-08-18
  - End: 2025-08-18
  - Files likely touched: repository, model
  - Validation: Previous prompts load into My Prompts; CRUD works; title derived at 50 chars with ellipsis when blank.
  - Notes: v2 file prompts.v2.json created; v1 kept for backup; migration marks items private=true.
  - Commit template: feat(repo): add grouped local store with migration

- Step: 1/4 — UI tree and wrapping
  - State: [ ]
  - Goal: Render groups tree; enable add/rename/delete; wrap text in lists and editor.
  - Owner: next-agent
  - Start: <pending>
  - End: <pending>
  - Files likely touched: ui/PromptLibraryPanel.kt and new components
  - Validation: Groups appear and can be manipulated; text wraps.
  - Notes: Persist expand states.
  - Commit template: feat(ui): introduce grouped tree and wrapped text

- Step: 1/5 — Private section
  - State: [ ]
  - Goal: Private prompts separated and excluded from exports.
  - Owner: next-agent
  - Start: <pending>
  - End: <pending>
  - Files likely touched: ui, repository
  - Validation: Private toggle visible; export excludes private.
  - Notes: Add indicator on prompt rows.
  - Commit template: feat(private): support local-only prompts

- Step: 2/6 — Settings page
  - State: [x]
  - Goal: Configurable repo path/subdir/branch/strategy with validation.
  - Owner: Augment Agent
  - Start: 2025-09-08
  - End: 2025-09-08
  - Files likely touched: src/main/kotlin/com/example/promptlibrary/settings/*, META-INF/plugin.xml
  - Validation: Settings persist and reload; UI shows configured values. For now we show a warning if path/subdir invalid when using Load Repo.
  - Notes: Added PersistentStateComponent (PluginSettingsService) + Configurable (PluginSettingsConfigurable). Registered in plugin.xml. ShowSettingsUtil invoked without Project (dialog opens).
  - Commit template: feat(settings): add Git sync configuration

- Step: 2/7 — YAML serializer
  - State: [ ]
  - Goal: Deterministic read/write of group and prompt YAML; round-trip tests.
  - Owner: next-agent
  - Start: <pending>
  - End: <pending>
  - Files likely touched: repo/yaml utils + tests
  - Validation: Unit tests pass; sample tree round-trips equal.
  - Notes: Use a stable key ordering.
  - Commit template: feat(yaml): implement serializer with tests

- Step: 3/8 — Read-only import from repo
  - State: [x]
  - Goal: Read YAML tree from repo into UI under a synced root.
  - Owner: Augment Agent
  - Start: 2025-09-08
  - End: 2025-09-08
  - Files likely touched: src/main/kotlin/com/example/promptlibrary/sync/GitYamlLoader.kt, repository/PromptRepository.kt, ui/PromptLibraryPanel.kt
  - Validation: Load Repo button imports groups into Shared, reflecting directory structure under prompts subdir; private=true prompts are skipped. Build is green.
  - Notes: Added GitYamlLoader (read-only, no Git API). Replace Shared namespace via repository.replaceSharedGroups(). Next: integrate Git pull.
  - Commit template: feat(sync): display prompts from Git repo

- Step: 3/9 — Pull only
  - State: [x]
  - Goal: Fetch and pull via Git4Idea with toasts/status.
  - Owner: Augment Agent
  - Start: 2025-09-08
  - End: 2025-09-08
  - Files likely touched: sync/GitPullService.kt, ui/PromptLibraryPanel.kt, build.gradle.kts, META-INF/plugin.xml
  - Validation: Pull button fetches --all then pull --rebase; notifications show success/error; build is green.
  - Notes: Uses GitLineHandler (Git4Idea); validates repo path.
  - Commit template: feat(git): pull integration


- Step: 3/10 — Merge view
  - State: [ ]
  - Goal: Merge remote YAML into local model; flag duplicates/conflicts.
  - Owner: next-agent
  - Start: <pending>
  - End: <pending>
  - Files likely touched: merge utils, UI markers
  - Validation: Duplicates identified; conflicts flagged.
  - Notes: Use normalized text.
  - Commit template: feat(merge): basic duplicate/conflict detection

- Step: 4/11 — Draft write preview
  - State: [ ]
  - Goal: Show diff counts before writing to working tree.
  - Owner: next-agent
  - Start: <pending>
  - End: <pending>
  - Files likely touched: serializer, temp write, diff calc
  - Validation: Preview lists adds/updates/deletes.
  - Notes: No file ops without confirm.
  - Commit template: feat(sync): write preview

- Step: 4/12 — Commit (no push)
  - State: [x]
  - Goal: Write, stage, and create commit locally.
  - Owner: Augment Agent
  - Start: 2025-09-08
  - End: 2025-09-08
  - Files likely touched: sync/GitYamlWriter.kt, sync/WriteStrategyService.kt, ui/PromptLibraryPanel.kt
  - Validation: Commit created when files change; unborn repos receive an initial empty commit.
  - Notes: Stage now uses `git add --all` at repo root.
  - Commit template: chore(prompts): sync N changes

- Step: 4/13 — Push
  - State: [x]
  - Goal: Push changes and handle rejects.
  - Owner: Augment Agent
  - Start: 2025-09-08
  - End: 2025-09-08
  - Files likely touched: sync/WriteStrategyService.kt
  - Validation: Direct: push to current remote; Branch+PR: push new branch -u origin and open compare URL.
  - Notes: Rejections show toast; rebase not automated yet.
  - Commit template: chore(prompts): push synced changes

- Step: 4/14 — Conflict assistance
  - State: [ ]
  - Goal: Open VCS UI on conflicts; Finalize Sync action after manual resolution.
  - Owner: next-agent
  - Start: <pending>
  - End: <pending>
  - Files likely touched: ui actions, vcs integration
  - Validation: Resolve-and-continue works.
  - Notes: Detect unresolved merges.
  - Commit template: feat(sync): conflict assistance flow

- Step: 5/15 — Optional PR flow
- Step: 4/11 — Draft write preview
  - State: [-]
  - Goal: Show diff counts before writing to working tree.
  - Owner: Augment Agent
  - Start: 2025-09-08
  - End: 2025-09-08
  - Files likely touched: serializer, temp write, diff calc
  - Validation: Preview lists adds/updates/deletes.
  - Notes: Skipped to deliver Direct and Branch+PR write earlier.
  - Commit template: feat(sync): write preview

- Step: 4/12 — Commit (no push)
  - State: [x]
  - Goal: Write, stage, and create commit locally.
  - Owner: Augment Agent
  - Start: 2025-09-08
  - End: 2025-09-08
  - Files likely touched: sync/GitYamlWriter.kt, sync/WriteStrategyService.kt, ui/PromptLibraryPanel.kt
  - Validation: “Write to Git” creates commit using selected strategy.
  - Notes: Stage limited to prompts subdir; private prompts are not written.
  - Commit template: chore(prompts): sync N changes

- Step: 4/13 — Push
  - State: [x]
  - Goal: Push changes and handle rejects.
  - Owner: Augment Agent
  - Start: 2025-09-08
  - End: 2025-09-08
  - Files likely touched: sync/WriteStrategyService.kt
  - Validation: Direct: push to current remote; Branch+PR: push new branch -u origin
  - Notes: On push failure, we display error toast (rebase/resolve not automated yet).
  - Commit template: chore(prompts): push synced changes

- Step: 5/15 — Optional PR flow
  - State: [/]
  - Goal: Branch+PR mode that opens a PR automatically.
  - Owner: Augment Agent
  - Start: 2025-09-08
  - End: <pending>
  - Files likely touched: git utils, gh integration (optional)
  - Validation: Branch created and PR opened.
  - Notes: Next: open compare URL or integrate PR creation.
  - Commit template: feat(sync): branch+PR workflow
  - End: <pending>
  - Files likely touched: git utils, gh integration (optional)
  - Validation: Branch created and PR opened.
  - Notes: Guard with setting flag.
  - Commit template: feat(sync): branch+PR workflow

