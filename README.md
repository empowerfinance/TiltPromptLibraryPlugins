# Tilt Prompt Library Plugins

[![Build & Release](https://github.com/empowerfinance/TiltPromptLibraryPlugins/actions/workflows/build-and-release.yml/badge.svg?branch=main)](https://github.com/empowerfinance/TiltPromptLibraryPlugins/actions/workflows/build-and-release.yml)

A single, friendly Prompt Library that works in both JetBrains Rider and VS Code. Organize reusable prompts/snippets, search quickly, and sync Shared prompts to Git as clean YAML. Private prompts stay on your machine.

- Rider plugin: see [Rider/](./Rider/)
- VS Code extension: see [VSCode/](./VSCode/)

---

## What you get (today)

Common ideas across both IDEs (feature depth varies; Rider is currently most complete):
- Create, edit, delete prompts with confirmation and instant persistence
- One‑click copy; real‑time search (case‑insensitive)
- Duplicate detection via normalized text
- Shared vs Private namespaces; “Unfiled” inbox; roots (Shared/Private) show no prompts
- Import/Export JSON (simple arrays recommended)
- GitHub Sync (Shared only): export as merge‑friendly YAML (one file per prompt)

See the Rider section for the full feature set and the YAML sync model.

---

## Quick start

### Rider (Recommended today)

Install from release
1) Download the latest Rider ZIP from the repo [Releases](../../releases)
2) Rider → File → Settings → Plugins → ⚙️ → Install from Disk…
3) Select the ZIP and restart Rider

Build from source
- Prereqs: JDK 21; Rider 2025.2+ (legacy path supports Rider 2024.3–2025.1 with JDK 17/21)
- Commands (run inside the Rider subfolder):
  - macOS/Linux: `cd Rider && ./gradlew buildPlugin`
  - Windows PowerShell: `cd Rider; .\gradlew.bat buildPlugin`
- Legacy build:
  - macOS/Linux: `cd Rider && ./gradlew -b build-legacy.gradle.kts buildPlugin`
  - Windows PowerShell: `cd Rider; .\gradlew.bat -b build-legacy.gradle.kts buildPlugin`
- Install the ZIP from `Rider/build/distributions/` via “Install from Disk…”

### VS Code

Install from release or local file
1) Download the latest `.vsix` from [Releases](../../releases), or use `VSCode/prompt-library-local.vsix`
2) VS Code → Extensions → … menu → Install from VSIX… → choose the file

Build from source
- Prereqs: Node 18+, npm
- Commands (run inside the VSCode subfolder):
  - `cd VSCode`
  - `npm install`
  - Dev: press F5 to launch “Extension Development Host”
  - Package: `npm run package` (outputs a `.vsix`), or `npm run package:local`

### VS Code extension details (current status)

- Views: Activity bar container with three views
  - Groups (tree): Shared and Private roots with child groups
  - Prompt Library (webview): list, compose, and actions for the selected group
  - Sync Status (webview): logs and feedback from sync operations
- Root behavior and actions (intentional):
  - Roots (Shared/Private) show no prompts and the composer is disabled
  - No context-menu actions are shown on root nodes; actions are allowed only on groups
  - The extension defaults selection to Private/Unfiled so you can add a prompt immediately
- Prompt actions (per group): Copy, Edit (inline), Move, Delete; bulk Move/Delete with multi-select checkboxes; duplicate detection via normalized text
- Import/Export: JSON import/export of the full library; simple string-array JSON is supported and recommended
- GitHub Sync (Shared only) — YAML repository model:
  - Export layout under a working copy path: <repoPath>/<promptsSubdir>/
    - <GroupName>/_group.yaml (group metadata: id, name, kind, tags, description)
    - <GroupName>/prompts/p-<uuid>.yaml (one file per prompt)
    - Child groups repeat the same structure in subfolders
  - Read YAML replaces the Shared namespace from the repo (remote‑wins)
  - Write YAML regenerates the tree deterministically for clean diffs
  - Direct Commit or Branch + PR flows are available; a Clone/Pull + Import one‑shot exists to bootstrap
- Settings (File → Preferences → Settings → “Prompt Library”):
  - promptLibrary.remoteRepoUrl: optional remote URL for Clone/Pull + Import
  - promptLibrary.repoPath: local working copy folder (defaults to ~/PromptLibrary if unset)
  - promptLibrary.promptsSubdir: subfolder for exported prompts (default: prompts)
  - promptLibrary.writeStrategy: direct or branchPR; promptLibrary.branchName for branchPR
  - Optional auto-fetch interval (future-facing)

Tip: To add prompts, select a child group (e.g., Private/Unfiled). The composer is disabled at the Shared/Private roots by design.

---

## Using the Prompt Library

- Open the Prompt Library tool window/panel in your IDE
- Add prompts in the input at the bottom; click any prompt to copy
- Edit via the pencil icon; delete via the trash with confirm
- Use search to filter live; duplicates are prevented automatically
- Manage groups under Shared/Private; Unfiled is the default inbox
- Import/Export JSON arrays like:
  ```json
  [
    "Write a unit test for a login function",
    "Explain dependency injection in C#"
  ]
  ```

---

## Rider plugin details (feature‑complete)

Highlights
- Theme‑aware UI; responsive list with bounded card height
- Titles (optional) with smart display when blank
- Row actions: Open in Editor dialog with autosave
- Options: show/hide group tree, remember splitter position
- Roots show no prompts; new prompts go to selected group or Private/Unfiled
- Moving prompts updates their location correctly across groups/namespaces

GitHub Sync — YAML repository model (Shared only)
- Exports under a configurable subfolder (default: `prompts`) in a working copy
- Layout:
  - `<promptsSubdir>/<GroupName>/_group.yaml` (id, name, kind, tags, description)
  - `<promptsSubdir>/<GroupName>/prompts/p-<uuid>.yaml` (one file per prompt)
  - Child groups repeat the same structure in subfolders
- Import/Load Repo replaces the Shared namespace from YAML (remote‑wins)
- Remote‑wins merge: missing-on-remote Shared prompts are moved locally to Private/Unfiled
- Clean rewrite of the YAML tree each sync; commit and push via:
  - Direct: commit to current branch and push
  - Branch+PR: create branch, commit, push, and open compare/PR link when possible
- Toasts: sync summary “+A ~U -D”; “Kept K local prompt(s) …”; “Initialized empty repo” on first setup

Compatibility
- Rider 2025.2+: build with JDK 21 → `./gradlew buildPlugin` (Windows: `./gradlew.bat buildPlugin`)
- Rider 2024.3–2025.1 (legacy): JDK 17 or 21 → `-b build-legacy.gradle.kts`

Troubleshooting
- Install fails: ensure Rider 2024.1+; use the correct ZIP for your Rider version
- Build fails: confirm JDK 21 (or JDK 17 for legacy); on Windows always use `.\gradlew.bat`
- Tool window missing: View → Tool Windows → Prompt Library

---

## Contributing

We welcome contributions! This repo documents the evolutionary approach in `Rider/docs/`.

Dev setup
- Rider: `cd Rider; .\gradlew.bat runIde` (macOS/Linux: `./gradlew runIde`) to launch a sandbox
- VS Code: `cd VSCode; npm install; npm run compile;` then press F5

Guidelines
- Make small, incremental changes; update docs where helpful
- Test in Rider sandbox or the VS Code Dev Host before submitting PRs
- Keep JSON/YAML outputs deterministic for clean diffs

---

## Releases

- Rider releases: tag `rider-vX.Y.Z` → ZIP artifact attached
- VS Code releases: tag `vsc-vX.Y.Z` → `.vsix` attached
- CI on main/PRs validates builds without publishing

## License

MIT — see [LICENSE](Rider/LICENSE) and [LICENSE](VSCode/LICENSE).

— Built with ❤️ using evolutionary development with Augment
