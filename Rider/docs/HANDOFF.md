## Handoff Summary — Rider Prompt Library Plugin

Owner: Shared (agent-friendly)
Target IDE: Rider 2025.2+ (legacy: 2024.3–2025.1)
Language/Build: Kotlin 2.1.21, Gradle, IntelliJ Platform Gradle Plugin 2.7.2

What’s working
- Build is green (gradlew build). Sandbox (runIde) launches.
- Core features: create/edit/delete, copy-on-click, search, JSON import/export (v1), persistence, title display, v2 local library with migration.
- Group namespaces: Shared and Private roots; per-namespace uniqueness; context menu for group Rename/Delete; Unfiled fallback; toast notifications.
- GitHub Sync foundations: Settings page (remote URL and/or local path, prompts subdir, branch, write strategy, auto-fetch toggle), read-only YAML import (Load Repo), Pull button (fetch --all + pull --rebase), write strategies (Direct and Branch+PR), Write to Git button, Sync button (one-click round trip), Nuke Local Repo button.

Recent changes
- Split group tree into Shared and Private roots; removed “Library” label from the visible tree; auto-expand roots; disabled delete/rename on roots.
- Add Group now allows choosing Shared or Private; repo gained addSharedGroup/addPrivateGroup and getSharedGroups/getPrivateGroups.
- Fix: delete dialog correctly interpolates group name.
- Earlier: Upgraded to plugin 2.7.2, Kotlin 2.1.21; disabled BuildSearchableOptions; YAML helpers scaffolded.
- Today: Migrated private-root prompts to Private/Unfiled; disabled showing prompts at namespace roots; default save to Unfiled when no group selected; blocked root destinations in Move To…; fixed move across locations; fixed edit-save across locations; added live composer state (disable + hint + grey editor); group toolbar for add/rename/delete (delete blocked in Shared); selection preserved on rebuild.
- New (Sync): Managed local clone in %TEMP%\promptlib-repos; SSH-friendly; initial empty repo initialization; remote-wins merge; GitYamlWriter (export Shared only); GitPullService; WriteStrategyService (Direct + Branch+PR + compare URL); Sync orchestrator with progress; Nuke Local Repo (clears only the working copy).
Next steps (deferred)
- Auto-fetch service (fetch only) wired behind setting (default OFF). Add compare/PR creation on Branch+PR.
- Deterministic YAML round-trip tests.
- Merge view for conflict surfacing.



Open issues/next steps
1) Root behavior polish
   - Optionally veto collapsing Shared/Private via TreeWillExpandListener for stricter UX.
   - Pin “Unfiled” at top of Private, make it non-deletable.
2) Namespace completeness
   - Right now all existing groups are migrated under Private; enable Shared storage (or sync) source when ready.
   - Allow adding subgroups (children) if desired; currently add creates top-level groups only.
3) UI polish
   - Consider inline rename (F2) and delete (Del) on selection.
   - Keep compact header icons; optional hover-only actions.
4) YAML Repository import/export (v2)
   - Export as YAML repo: folder per group, _group.yaml + prompt files using KAML helpers.
   - Import from YAML repo: scan folder; map to Shared/Private as selected by user.
   - Keep JSON v1 export/import as a secondary option.
5) README updates
   - Document Shared/Private, Unfiled, and group management.
6) Tests (optional but recommended)
   - Unit tests for YAML round-trip (Prompt, Group). Avoid UI tests for now.

How to build/run (Windows PowerShell)
- .\gradlew.bat build
- .\gradlew.bat runIde

Where to look
- UI: src/main/kotlin/com/example/promptlibrary/ui/PromptLibraryPanel.kt
- Data: src/main/kotlin/com/example/promptlibrary/model/*
- Repo: src/main/kotlin/com/example/promptlibrary/repository/*
- YAML: src/main/kotlin/com/example/promptlibrary/yaml/*
- Docs: README.md, docs/WORK_TRACKING.md (reverse-chronological), docs/GITHUB_SYNC_*.md

Risks/notes
- Sandbox startup may show benign startup “errors”; safe to ignore unless stack trace cites our package.
- Keep using JDK 21 for latest build; legacy script exists for older Rider.


### One-click next step for the next agent
Implement Sync summary toasts (counts of added/updated/deleted), show explicit toast on “initialized empty repo”, and ensure Nuke only clears the Git working copy and immediately runs Sync.

---

### One-line next-agent prompt
Goal: Finalize Shared/Private group UX (veto collapse, pin non-deletable Unfiled, context menu polish, optional keyboard shortcuts), then implement YAML Repository import/export using existing KAML helpers; build via .\gradlew.bat runIde, verify, and update README accordingly.
