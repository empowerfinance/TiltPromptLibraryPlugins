## Kickoff: GitHub Sync Feature for Rider Prompt Library

Read these in order:
1) High-Level Design: docs/GITHUB_SYNC_DESIGN.md — the vision, data model, and UX
2) Evolutionary Plan: docs/GITHUB_SYNC_PLAN.md — the step-by-step tasks
3) Tracking Log: docs/GITHUB_SYNC_TRACKING.md — current status and next action

What to do now
- Open docs/GITHUB_SYNC_TRACKING.md and find the first step with State: [ ].
- Follow its Meta Template: perform the work, validate, and update the step’s fields.
- Keep commits small and messages per template. Do not modify the plan doc except for fixes.

Meta for agents
- Scope: Only work on the exact step marked In Progress.
- Validation: Use the Rider sandbox; avoid background operations; explicit sync only.
- Rollback: Back up files before migrations; keep old readers until new format stabilizes.
- Git: Prefer Rider Git APIs; only suggest gh/CLI as optional fallback.
- Private data: Do not write private=true prompts into the repo; they remain local.

Initial next step
- Step 5/15 — Optional PR flow
  - Goal: For Branch+PR strategy, after pushing the feature branch, automatically open a compare URL (or create PR via GitHub integration) and surface link in notifications.
  - Files: sync/WriteStrategyService.kt (URL open), optional: GitHub plugin integration
  - Commit template: feat(sync): open PR after branch push

Hand-off protocol
- Before handing off, update docs/GITHUB_SYNC_TRACKING.md with the step’s final state and outcomes.
- Then, in this Kickoff doc, adjust the “Initial next step” section to reflect the upcoming step.

