# VS Code Prompt Library Extension

A VS Code extension for organizing and managing reusable prompts with GitHub sync. Keep private prompts local and sync shared prompts as clean YAML to Git.

## ✨ Features

- **Shared/Private namespaces** - Keep private prompts local, sync shared prompts to Git
- **Copy to clipboard** - Click 📋 to copy any prompt to clipboard
- **Send to Augment** - 📤 One-click send prompts directly to Augment chat
- **GitHub Sync** - Export shared prompts as merge-friendly YAML with PR workflow support
- **Full CRUD for shared content** - Rename, edit, and delete shared groups/prompts locally, then sync via PR
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
<repoPath>/
  LibraryName/
    _library.yaml              # Library marker file (required)
    GroupName/
      _group.yaml              # Group metadata
      p-1234567890-abc.yaml    # Prompt files (directly in group folder)
      p-1234567891-def.yaml
    AnotherGroup/
      _group.yaml
      p-1234567892-ghi.yaml
```

**Key conventions:**

- **`_library.yaml`** - Marker file identifying a library folder
- **`_group.yaml`** - Group metadata (name, id, order)
- **Flat structure** - Prompts stored directly in group folders (no `prompts/` subdirectory)
- **Flat groups** - Groups only at library root level (no nested groups)
- **Prompt filenames** - Format: `p-{timestamp}-{random}.yaml`

**Sync Operations**

- **Pull & Sync** - Get latest from GitHub and update local library
- **Quick Commit** - Push directly to current branch
- **Create Pull Request** - Create branch and open PR

Only Shared prompts are synced. Private prompts stay local.

**Smart Sync (Auto-commit before pull)**

If you have uncommitted local changes when syncing, the extension automatically:

1. Stages all local changes
2. Commits with message "Auto-commit: Local changes before sync"
3. Pulls with rebase (`git pull --rebase`)

This prevents "Pull failed" errors and ensures your local work is never lost.

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
