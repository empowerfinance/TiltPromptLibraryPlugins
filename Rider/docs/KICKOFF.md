## Kickoff: Rider Prompt Library Plugin

Welcome! This repository contains a minimal JetBrains Rider plugin that provides a simple prompt library. To ramp up quickly:

- Start with the plan in the root README.md (design, scope, and step-by-step implementation plan)
- Update the work tracking log in docs/WORK_TRACKING.md after each meaningful step
- Follow the Build/Installation steps in README.md to build, install, and use the plugin

### Mission Brief
- Deliver a small, reliable tool window with:
  - Scrollable saved prompt cards (wrapped text, responsive)
  - New Prompt composer (multiline + Save)
  - Copy-on-click prompt text
  - Edit in place (pencil), Delete with confirm/undo (trash), Save while editing
  - Search (simple substring)
  - Import/Export JSON
  - On-disk persistence under IDE config path

### How we work
- Prefer evolutionary steps (see plan in README)
- Keep UI simple; correctness first, polish later
- Always update docs/WORK_TRACKING.md with what changed, why, and next intended step
- If you change scope or plan, reflect it in README and the tracking log

### Starting Points
1) Run through README.md → Quick Start to verify you can build and run the plugin in a sandbox Rider (on Windows use .\\gradlew.bat)
2) Tackle the next unfinished step from docs/WORK_TRACKING.md
3) When blocked or after finishing a step, document in the tracking log, adjust plan if needed, and proceed

### Definition of Done for each step
- Code compiles
- Manual interactive check passes for that feature (or unit tests for non-UI logic)
- Persistence unaffected/regression-free
- WORK_TRACKING.md updated

### Ownership
- No single owner; this repo is agent-friendly. Treat docs as the source of truth.

