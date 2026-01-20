# VS Code Prompt Library Extension

A VS Code extension for organizing and managing reusable prompts with GitHub sync. Keep private prompts local and sync shared prompts as clean YAML to Git.

## ✨ Features

- **Shared/Private namespaces** - Keep private prompts local, sync shared prompts to Git
- **One-click copy** - Click any prompt to copy to clipboard
- **Send to Augment** - 📤 One-click send prompts directly to Augment chat
- **GitHub Sync** - Export shared prompts as merge-friendly YAML
- **Import/Export** - JSON backup and restore
- **Duplicate detection** - Automatic prevention via normalized text
- **Search & Filter** - Real-time prompt filtering

## 🚀 Quick Start

### Installation

**From Release** (Recommended)

1. Download the latest `.vsix` from [Releases](../../releases)
2. VS Code → Extensions → `...` menu → Install from VSIX...
3. Select the downloaded file

**From Source**

Prerequisites: Node.js 18+, VS Code 1.85+

```bash
cd VSCode
npm install
npm run compile
# Press F5 to launch Extension Development Host
# Or: npm run package to create .vsix
```

### Usage

1. **Open** - Click the Prompt Library icon in the Activity Bar
2. **Add** - Select a group, type in the editor panel, click "Add Prompt"
3. **Copy** - Click 📋 to copy, or 📤 to send directly to Augment chat
4. **Edit/Delete** - Click any prompt to load it, make changes, click "Save Changes"
5. **Groups** - Organize under Shared or Private namespaces
6. **Sync** - Use toolbar buttons to sync Shared prompts to Git

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
cd TiltPromptLibraryPlugins/VSCode
npm install
npm run compile
npm test              # Run tests
npm run package       # Build .vsix
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

## 📄 License

MIT - See [LICENSE](LICENSE)
