# Prompt Library for VS Code

A VS Code extension for organizing and managing reusable prompts with GitHub sync. Keep private prompts local and sync shared prompts as clean YAML to Git.

## ✨ Features

- **Quick Add Panel** - Fast prompt creation with auto-title generation
- **Prompt Groups** - Organize prompts in Shared/Private namespaces
- **One-Click Copy** - Click any prompt to copy to clipboard
- **Send to Augment** - 📤 One-click send prompts directly to Augment chat
- **GitHub Sync** - Export shared prompts as merge-friendly YAML
- **Import/Export** - JSON backup and restore
- **Duplicate Detection** - Automatic prevention via normalized text
- **Search & Filter** - Real-time prompt filtering (coming soon)

## 🚀 Quick Start

### Installation

**From Release** (Recommended)

1. Download the latest `.vsix` from [Releases](../../releases)
2. VS Code → Extensions → `...` menu → Install from VSIX...
3. Select the downloaded file

**From Source**

```bash
cd VSCode
npm install
npm run compile
# Press F5 to launch Extension Development Host
# Or: npm run package to create .vsix
```

### Usage

1. **Open Prompt Library** - Click the Prompt Library icon in the Activity Bar
2. **Add Prompts** - Select a group, then use the Quick Add panel
3. **Copy or Send** - Click 📋 to copy, or 📤 to send directly to Augment chat
4. **Organize** - Create groups under Shared or Private
5. **Sync to GitHub** - Use Sync Ops to push/pull shared prompts

## 📋 Views

- **Quick Add** - Compose and add new prompts to the selected group
- **Prompt Groups** - Tree view of Shared/Private groups and prompts
- **Prompt** - View and copy prompt details
- **Sync Ops** - GitHub sync operations and logs

## 🤖 Augment Integration

**Send to Augment** - Click the 📤 icon next to any prompt to:

1. Automatically open Augment's chat panel
2. Paste the prompt text directly into the input
3. Ready to send - just press Enter!

Works seamlessly with Augment for VS Code. The prompt is also copied to your clipboard as a fallback.

## ⚙️ Settings

Configure via File → Preferences → Settings → "Prompt Library":

- `promptLibrary.repoPath` - Local Git repository path (default: `~/PromptLibrary`)
- `promptLibrary.promptsSubdir` - Subdirectory for YAML files (default: `promptsProduct`)
- `promptLibrary.writeStrategy` - `direct` or `branchPR`
- `promptLibrary.branchName` - Branch name for PR strategy
- `promptLibrary.remoteRepoUrl` - Optional remote URL for clone/pull

## 🔄 GitHub Sync

**YAML Repository Layout**

```
<repoPath>/<promptsSubdir>/
  <GroupName>/
    _group.yaml              # Group metadata
    prompts/
      p-<uuid>.yaml          # One file per prompt
    <ChildGroup>/            # Nested groups
```

**Sync Operations**

- **Pull & Sync** - Get latest from GitHub and update local library
- **Quick Commit** - Push directly to current branch
- **Create Pull Request** - Create branch and open PR

Only Shared prompts are synced. Private prompts stay local.

## 🛠️ Development

```bash
cd VSCode
npm install
npm run compile
npm test              # Run tests
npm run package       # Build .vsix
```

See [docs/BABY_STEPS_PLAN.md](docs/BABY_STEPS_PLAN.md) for implementation details.

## 📄 License

MIT - See [LICENSE](LICENSE)

---

**Built with ❤️ using evolutionary development**
