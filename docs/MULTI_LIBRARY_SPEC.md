# Multi-Library Architecture Spec

## Overview

Enable users to organize prompts into multiple **libraries** within a single Git repository, allowing different teams (Analytics, Platform, Loans, etc.) to share one repo while maintaining separate prompt collections.

## Current State

```
~/PromptLibrary/              ← Single repo
  prompts/                    ← Single library (hardcoded or configurable)
    GroupA/
      _group.yaml
      prompts/p-xxx.yaml
```

**Problems:**
1. Only one library per repo
2. Confusing `promptsSubdir` setting with misleading label
3. No way to subscribe to multiple team libraries
4. No clear UI indication of which library prompts belong to

---

## Proposed Architecture

### Repository Structure

```
~/PromptLibrary/                    ← Git repository root
  platform/                         ← Library: Platform team
    GroupA/_group.yaml
    GroupA/prompts/p-xxx.yaml
  analytics/                        ← Library: Analytics team  
    Reports/_group.yaml
    Dashboards/_group.yaml
  general/                          ← Library: Shared/General
    Common/_group.yaml
  .library-manifest.yaml            ← Optional: metadata about available libraries
```

### Library Manifest (Optional)

```yaml
# .library-manifest.yaml - at repo root
libraries:
  - name: platform
    displayName: "Platform Team Prompts"
    description: "Prompts for platform engineering tasks"
    maintainers: ["platform-team@company.com"]
  - name: analytics
    displayName: "Analytics Prompts"
    description: "Data analysis and reporting prompts"
  - name: general
    displayName: "General Prompts"
    description: "Shared prompts for all teams"
    default: true  # Auto-subscribe new users
```

---

## Data Model

### Library Configuration

```typescript
// VS Code
interface LibraryConfig {
  id: string;           // Unique ID (e.g., "platform", "analytics")
  path: string;         // Subdirectory path in repo (e.g., "platform")
  displayName: string;  // Human-readable name
  enabled: boolean;     // Whether user is subscribed
  color?: string;       // Optional UI color for distinction
}

interface RepoConfig {
  url: string;          // Git remote URL
  localPath: string;    // Local clone path
  branch: string;       // Branch to sync (default: auto-detect)
  libraries: LibraryConfig[];
}
```

```kotlin
// Rider
data class LibraryConfig(
    val id: String,
    val path: String,
    val displayName: String,
    val enabled: Boolean = true,
    val color: String? = null
)

data class RepoConfig(
    val url: String,
    val localPath: String,
    val branch: String,
    val libraries: List<LibraryConfig>
)
```

### Settings Structure

**VS Code (settings.json):**
```json
{
  "promptLibrary.repositories": [
    {
      "url": "git@github.com:company/PromptLibrary.git",
      "localPath": "~/PromptLibrary",
      "branch": "main",
      "libraries": [
        { "id": "platform", "path": "platform", "displayName": "Platform", "enabled": true },
        { "id": "analytics", "path": "analytics", "displayName": "Analytics", "enabled": true },
        { "id": "general", "path": "general", "displayName": "General", "enabled": true }
      ]
    }
  ],
  "promptLibrary.defaultLibrary": "general"  // Where new prompts go by default
}
```

**Rider (plugin settings):**
- Similar structure stored in IDE settings

---

## UI Changes

### 1. Library Selector in Main Panel

```
┌─────────────────────────────────────────────┐
│ 📚 Libraries: [Platform ✓] [Analytics ✓] [General ✓]  │
│                                             │
│ ▼ Platform                                  │
│   └─ API Prompts                            │
│      └─ Generate REST endpoint              │
│   └─ Testing Prompts                        │
│      └─ Unit test generator                 │
│                                             │
│ ▼ Analytics                                 │
│   └─ SQL Queries                            │
│      └─ Revenue report                      │
│                                             │
│ ▼ General                                   │
│   └─ Common                                 │
│      └─ Code review                         │
│                                             │
│ ▼ Private (local only)                      │
│   └─ My Experiments                         │
└─────────────────────────────────────────────┘
```

### 2. Settings Panel - Library Management

```
┌─────────────────────────────────────────────┐
│ Repository Settings                          │
│ ─────────────────                           │
│ Remote URL: [git@github.com:company/Prompt...]│
│ Local Path: [~/PromptLibrary              ] │
│ Branch:     [main                         ] │
│                                             │
│ Available Libraries                          │
│ ─────────────────                           │
│ ☑ platform  - Platform Team Prompts   [↻]  │
│ ☑ analytics - Analytics Prompts       [↻]  │
│ ☑ general   - General Prompts         [↻]  │
│ ☐ loans     - Loans Team (disabled)        │
│                                             │
│ [+ Add Library] [Discover from Repo]        │
│                                             │
│ Default library for new prompts: [General ▼]│
└─────────────────────────────────────────────┘
```

### 3. Prompt Creation - Library Selection

When creating a new shared prompt:
```
┌─────────────────────────────────────────────┐
│ Create New Prompt                            │
│ ─────────────────                           │
│ Title: [_____________________________]      │
│ Content: [___________________________]      │
│                                             │
│ Save to:                                    │
│ ○ Private (local only)                      │
│ ● Shared - Library: [Platform ▼]            │
│            Group:   [API Prompts ▼]         │
└─────────────────────────────────────────────┘
```

### 4. Visual Distinction

- Each library gets a subtle color/badge in the tree view
- Library name shown in prompt details panel
- Clear indication when viewing prompts from multiple libraries

---

## Sync Behavior

### Pull/Sync
1. Fetch from remote
2. For each **enabled** library:
   - Load YAML from `<repoRoot>/<libraryPath>/`
   - Merge into local state (remote wins for shared)
3. Private prompts remain untouched

### Push/Commit
1. For each enabled library with changes:
   - Write YAML to `<repoRoot>/<libraryPath>/`
2. Stage all changes
3. Commit with message indicating which libraries changed
4. Push to remote

### Force Pull
- Hard reset repo to origin
- Reload all enabled libraries

---

## Migration Path

### From Current Single-Library Setup

1. **Auto-detect**: If `promptsSubdir` is set, create a library config for it
2. **Default**: If not set, create "general" library
3. **Preserve**: All existing prompts mapped to the detected library

```typescript
// Migration logic
function migrateSettings(oldSettings: OldSettings): NewSettings {
  const libraryPath = oldSettings.promptsSubdir || "general";
  return {
    repositories: [{
      url: oldSettings.remoteRepoUrl,
      localPath: oldSettings.repoPath,
      branch: oldSettings.branchName || "main",
      libraries: [{
        id: libraryPath,
        path: libraryPath,
        displayName: titleCase(libraryPath),
        enabled: true
      }]
    }],
    defaultLibrary: libraryPath
  };
}
```

---

## Implementation Phases

### Phase 1: Foundation (VS Code first)
- [ ] Define new data model types
- [ ] Migrate settings format with backward compatibility
- [ ] Update GitYamlLoader to work with library paths
- [ ] Update GitYamlWriter to work with library paths
- [ ] Single library still works (just with new config format)

### Phase 2: Multi-Library Support
- [ ] Settings UI for managing multiple libraries
- [ ] Library selector in main panel
- [ ] Sync logic for multiple libraries
- [ ] Library discovery from repo manifest

### Phase 3: UI Polish
- [ ] Visual distinction per library (colors/badges)
- [ ] Library selector in prompt creation
- [ ] Filtering by library
- [ ] Library-specific sync status

### Phase 4: Rider Parity
- [ ] Port all changes to Rider plugin
- [ ] Kotlin data models
- [ ] Swing UI updates

---

## Open Questions

1. **Multiple Repos**: Should we support multiple Git repositories, or just multiple libraries in one repo?
   - Recommendation: Start with one repo, multiple libraries. Multi-repo adds complexity.

2. **Library Permissions**: Should libraries have read-only vs read-write modes?
   - Some teams might want to subscribe to another team's library without editing.

3. **Conflict Resolution**: When same prompt ID exists in multiple libraries?
   - Recommendation: Prompt IDs should be globally unique (UUID), so this shouldn't happen.

4. **Nested Libraries**: Should libraries support nesting (e.g., `platform/backend`, `platform/frontend`)?
   - Recommendation: Keep flat for V1, consider nesting in V2.

5. **Library Creation**: Can users create new libraries from the UI, or only subscribe to existing ones?
   - Recommendation: Allow creation - just creates a new subdirectory.

---

## Testing Plan

### Unit Tests
- Library config parsing
- Migration from old settings
- YAML loader with library paths
- YAML writer with library paths

### Integration Tests
- Create library, add prompts, sync
- Subscribe to multiple libraries, sync all
- Disable library, verify prompts hidden
- Force pull with multiple libraries

### Manual Testing Scenarios
1. Fresh install → configure single library → works like before
2. Fresh install → add multiple libraries → all sync correctly
3. Migrate existing setup → prompts preserved
4. Two users → different library subscriptions → each sees their selection
5. Create prompt → select library → syncs to correct folder

---

## Success Criteria

1. **Backward Compatible**: Existing single-library users unaffected
2. **Clear UI**: Users understand which library they're viewing/editing
3. **Team Friendly**: Easy for teams to share repo with separate libraries
4. **Discoverable**: Easy to find and subscribe to libraries in shared repo
5. **Performant**: Multiple libraries don't slow down sync noticeably

