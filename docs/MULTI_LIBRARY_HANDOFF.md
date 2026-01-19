# Multi-Library Feature Implementation - Agent Handoff

## Context

You are working on a **Prompt Library Plugin** that exists for both VS Code and JetBrains Rider. The plugin allows users to manage reusable prompts that sync to a Git repository.

**Repository**: `/Users/paul/code/tilt/TiltPromptLibraryPlugins`
- `VSCode/` - VS Code extension (TypeScript)
- `Rider/` - JetBrains Rider plugin (Kotlin)

## Current Problem

The current implementation has a confusing `promptsSubdir` setting that was intended to allow different teams to use separate subdirectories within one shared Git repo. However:

1. The setting label is misleading ("Subdirectory name for prompts under each group directory")
2. The default is empty string, causing errors
3. There's no UI to manage multiple libraries
4. Users can only subscribe to ONE library at a time

## Your Task

Implement the **Multi-Library Architecture** as specified in `docs/MULTI_LIBRARY_SPEC.md`.

### Implementation Order: VS Code First, Then Rider

## Phase 1: Foundation (VS Code)

### Step 1: Update Data Model

**File**: `VSCode/src/config.ts` (or create new)

Create new types:
```typescript
interface LibraryConfig {
  id: string;           // e.g., "platform"
  path: string;         // Subdirectory in repo
  displayName: string;  // Human-readable name
  enabled: boolean;     // User subscribed?
}

interface RepoConfig {
  url: string;
  localPath: string;
  branch: string;
  libraries: LibraryConfig[];
}
```

### Step 2: Migrate Settings

**File**: `VSCode/package.json` - Update contribution points for new settings structure

**File**: `VSCode/src/settings.ts` (or equivalent)

Add migration logic:
```typescript
function migrateSettings(): RepoConfig {
  const old = vscode.workspace.getConfiguration('promptLibrary');
  const promptsSubdir = old.get<string>('promptsSubdir') || 'general';
  
  return {
    url: old.get('remoteRepoUrl') || '',
    localPath: old.get('repoPath') || '~/PromptLibrary',
    branch: old.get('branchName') || 'main',
    libraries: [{
      id: promptsSubdir,
      path: promptsSubdir,
      displayName: titleCase(promptsSubdir),
      enabled: true
    }]
  };
}
```

### Step 3: Update YAML Loader

**File**: `VSCode/src/sync/yamlLoader.ts`

Modify to accept library path:
```typescript
function loadFromLibrary(repoRoot: string, libraryPath: string): Group[] {
  const libraryDir = path.join(repoRoot, libraryPath);
  return loadFromRoot(libraryDir);
}
```

### Step 4: Update YAML Writer

**File**: `VSCode/src/sync/yamlWriter.ts`

Modify to write to specific library:
```typescript
function writeToLibrary(repoRoot: string, libraryPath: string, groups: Group[]): WriteResult {
  const libraryDir = path.join(repoRoot, libraryPath);
  return writeSharedGroups(libraryDir, groups);
}
```

### Step 5: Update Sync Orchestrator

**File**: `VSCode/src/sync/syncOrchestrator.ts` (or equivalent)

Loop through enabled libraries:
```typescript
async function syncAll(config: RepoConfig): Promise<void> {
  for (const lib of config.libraries.filter(l => l.enabled)) {
    await syncLibrary(config.localPath, lib);
  }
}
```

### Step 6: Fix Settings UI Label

**File**: `VSCode/package.json`

Change the label from misleading text to:
```json
"promptLibrary.promptsSubdir": {
  "type": "string",
  "default": "general",
  "description": "Library folder name within the repository. Different teams can use different folders (e.g., 'platform', 'analytics'). Default: 'general'"
}
```

## Phase 2: Multi-Library UI (VS Code)

### Step 1: Library Selector in Tree View

Add checkboxes or toggles to show/hide libraries in the main prompt tree.

### Step 2: Settings Webview for Library Management

Create a settings panel that shows:
- Available libraries (discovered from repo)
- Checkboxes to enable/disable each
- Button to add new library
- Default library dropdown

### Step 3: Library Badge in Tree Items

Show which library each group belongs to (color or text badge).

## Key Files to Examine

### VS Code
- `VSCode/src/sync/` - All sync-related code
- `VSCode/src/extension.ts` - Entry point
- `VSCode/src/ui/` - UI components
- `VSCode/package.json` - Settings definitions

### Rider  
- `Rider/src/main/kotlin/com/example/promptlibrary/sync/` - Sync code
- `Rider/src/main/kotlin/com/example/promptlibrary/settings/` - Settings
- `Rider/src/main/kotlin/com/example/promptlibrary/ui/` - UI panels

## Testing Checklist

- [ ] Fresh install with no settings → defaults to "general" library
- [ ] Existing install with `promptsSubdir: "prompts"` → migrates correctly
- [ ] Sync creates correct folder structure: `<repo>/<library>/Group/prompts/`
- [ ] Multiple libraries can be configured
- [ ] Disabled libraries don't appear in tree view
- [ ] Force pull works with library paths
- [ ] Quick commit works with library paths

## Gotchas / Watch Out For

1. **Empty branch name**: Settings can have empty `branchName` - always fallback to detecting from origin
2. **Path expansion**: `~/PromptLibrary` needs tilde expansion on both platforms
3. **Git state**: Always clean up rebase state before operations (see `GitUtils.cleanupAndEnsureOnBranch`)
4. **Backward compatibility**: Old settings must continue to work

## Build Commands

**VS Code**:
```bash
cd VSCode && npm run compile
```

**Rider**:
```bash
cd Rider && ./gradlew buildPlugin
```

## Reference: Current Settings Structure

**VS Code** (`package.json` contributions):
- `promptLibrary.remoteRepoUrl`
- `promptLibrary.repoPath` 
- `promptLibrary.promptsSubdir`
- `promptLibrary.branchName`
- `promptLibrary.writeStrategy`

**Rider** (`PluginSettings.kt`):
```kotlin
data class State(
    var remoteRepoUrl: String = "",
    var repoPath: String = "~/PromptLibrary",
    var promptsSubdir: String = "prompts",
    var branchName: String = "",
    var writeStrategy: WriteStrategy = WriteStrategy.DIRECT,
    var autoFetchEnabled: Boolean = false,
    var autoFetchMinutes: Int = 5
)
```

## Success Criteria

1. Single library still works (backward compatible)
2. Multiple libraries can be configured and synced
3. UI clearly shows which library prompts belong to
4. Default is "general" if nothing configured
5. No more confusing error messages about empty paths

