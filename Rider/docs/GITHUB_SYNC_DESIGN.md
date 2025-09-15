## GitHub Sync: High-Level Design

### 1) Overview
Build a synchronization feature for the Rider Prompt Library plugin to persist and collaborate on prompts via Git/GitHub. The solution introduces:
- A flexible grouping taxonomy (org/team/pod/collection) rendered as a collapsible tree
- A settings page to configure a local Git repo path and sync preferences
- A readable on-disk format (YAML, file-per-prompt) to minimize merge conflicts
- Safe, explicit sync flow that pulls, writes, commits, and pushes via Rider’s Git integration (primary), with an optional gh/CLI fallback (later)
- Support for private prompts that never sync

### 2) Goals and Non‑Goals
Goals
- Model hierarchical groups that can represent org units (pods/teams/org), and arbitrary collections (e.g., “test tools”, “investigations”).
- Great UX in plugin window: expandable/collapsible groups, wrapped text, smooth editing.
- Deterministic, readable storage in Git repo with low conflict surface.
- Safe sync: always fetch/pull before writing; clear prompts to resolve conflicts using IDE VCS if needed.
- Private prompts remain local-only and excluded from sync.

Non‑Goals (initial)
- Cloud-hosted storage or GitHub API write without a local clone.
- Automatic background sync; we keep explicit, user-triggered actions.
- Cross-IDE shared settings roaming.

### 3) Current State (as of repo)
- Kotlin + IntelliJ Platform plugin for Rider.
- ToolWindow: PromptLibraryToolWindowFactory -> PromptLibraryPanel (Swing UI).
- Storage: JSON at PathManager.getConfigPath()/prompt-library/prompts.json via PromptRepository.
- Import/Export dialogs for JSON. No grouping, no Git integration today.

### 4) Proposed Architecture
Components
- Domain model: Prompt, Group, Library.
- Repository layer abstraction:
  - LocalRepository: current JSON-based store (extended to support groups and private flag)
  - GitRepository: YAML-backed reading/writing to a user-selected local Git clone path
  - SyncService: orchestrates pull -> merge -> write -> commit -> push
- Settings page (Configurable): Git repo path, inner directory (e.g., prompts/), branch name, authoring options.
- UI Tree: groups as nodes, prompts as leaves; multi-select operations; inline editing with line wrap.

Flow (high level)
1) User configures a local Git clone path in Settings.
2) When user triggers Sync:
   - Pull latest (fetch + pull --rebase) on the configured branch.
   - Read YAML tree into memory.
   - Merge with local Library state (excluding private items) using deterministic rules.
   - Write changes back to YAML files.
   - Commit with a scoped message; push.
   - If conflicts happen, open IDE’s VCS view; user resolves and re-runs finalize step.

### 5) Data Format (YAML, file‑per‑prompt)
Rationale
- File-per-prompt drastically reduces merge conflicts compared to one big file.
- Human-readable, easily reviewed in PRs.
- Directory hierarchy matches group taxonomy for simple discovery.

On-disk layout (inside configured repo directory, e.g., prompts/)
- prompts/
  - shared/
    - test-tools/
      - _group.yaml
      - prompts/
        - p-<uuid>.yaml
        - p-<uuid>.yaml
  - org/
    - platform-team/
      - _group.yaml
      - prompts/
        - p-<uuid>.yaml
  - collections/
    - investigations/
      - _group.yaml
      - prompts/
        - p-<uuid>.yaml

_group.yaml schema
- id: string (uuid)
- name: string
- kind: org|team|pod|collection|general
- description: string (optional)
- tags: [string] (optional)

Prompt file schema (p-<uuid>.yaml)
- id: string (uuid)
- text: string (multiline)
- createdAt: ISO-8601
- updatedAt: ISO-8601
- tags: [string] (optional)
- private: false (must be false or absent in synced repo)

Example prompt file
---
id: "3e6d..."
text: |
  Investigate flaky test by capturing seed and rerunning with --seed <seed>.
createdAt: "2025-08-18T12:34:56Z"
updatedAt: "2025-08-18T12:34:56Z"
tags: ["testing", "investigation"]

Private prompts
- Private items remain only in LocalRepository (JSON) with private=true; never exported.
- UI can filter to show Private group separately from synced groups.

### 6) Domain Model
- Group(id, name, kind, description?, tags?, children[], prompts[])
- Prompt(id, text, createdAt, updatedAt, tags[], private)
- Library(groups[], privatePrompts[])

Migration
- Existing prompts.json become private prompts under a default local-only group “My Prompts”.

### 7) Sync Strategy
Primary: JetBrains Git integration (git4idea)
- Operate on a user-selected local clone path.
- Steps: ensure clean working tree (or create a feature branch), fetch, pull --rebase, write changes, commit, push.
- Use Rider’s built-in VCS operations so user credentials, remotes, and UI are reused.

Alternative (later, optional): gh CLI or Git CLI
- Fallback for creating branches/PRs or if the Git plugin APIs aren’t sufficient.

Branching model
- Default: commit directly to configured branch (e.g., main) if org permits.
- Safer option: create a short-lived branch per sync (e.g., chore/prompts-YYYYMMDD-HHMM), push, and open a PR.

Commit messages
- Conventional style: chore(prompts): add/update N prompts in <group path>

### 8) Conflict Handling
- Always pull first.
- Prefer file-per-prompt to avoid content conflicts.
- If a write collides: Git will mark conflicts; surface via Rider VCS toolwindow.
- After resolution, re-run “Finalize Sync” to commit/push.
- Repository merges are last-writer-wins in practice; UI displays both versions if duplication is detected (by normalized text + tags), prompting user to consolidate.

### 9) UI/UX
- ToolWindow tree with expand/collapse; groups show kind icon; prompts show preview.
- New prompt editor uses wrapped text; editing inline card with Save/Cancel.
- Context menu: New Group, Rename, Delete, New Prompt, Move To…
- Toolbar: Sync (pull+commit+push), Pull Only, Export (YAML), Import (YAML), Settings.
- Status area shows last sync timestamp and branch.

- Per-row "Open in Editor" button and right-click context menu to open a full editor window.
- Max row height cap: 240px; rows are evenly sized up to this cap, with wrapped/clipped overflow.
- Prompt title displayed on rows; if blank, derive from first 50 characters of text and truncate with ellipsis.
- Editor uses autosave on close; in-row edits still use explicit save/cancel.

### 10) Settings
- Git repo root (local clone path)
- Subdirectory for prompts (default: prompts/)
- Branch name (default: current)
- Write strategy: direct commit vs. branch+PR
- Include tags in filenames (optional; default: no)

### 11) Security & Privacy
- Never write private=true prompts into repo.
- Avoid persisting tokens; rely on Rider Git credentials. If gh is used, we rely on user’s gh auth outside plugin.

### 12) Telemetry & Logs (minimal)
- Log sync actions to IDE log (info/warn/error) with counts, not contents.

### 13) Risks & Mitigations
- Git conflicts: mitigated by file-per-prompt and pre-pull; user guided to resolve in VCS UI.
- Settings misconfig: validate paths/branch and test repo access before enabling Sync.
- Large libraries: lazy loading of trees; virtualized lists.

### 14) Alternatives Considered
- Single JSON/YAML file: simpler but high conflict risk.
- GitHub API direct writes: requires token mgmt; less aligned with Rider’s built-in Git UX.
- Storing prompts as Markdown: readable but multiline formatting/escaping and metadata become harder without front matter.

