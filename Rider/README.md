# Rider Prompt Library Plugin

A prompt library for JetBrains Rider to organize, search, and reuse text prompts. Perfect for AI assistant interactions, code templates, or frequently used snippets.

## ✨ Features

- **Shared/Private namespaces** - Keep private prompts local, sync shared prompts to Git
- **Copy to clipboard** - Click 📋 to copy any prompt to clipboard
- **Send to Editor** - Insert prompts directly at cursor position
- **GitHub Sync** - Export shared prompts as merge-friendly YAML with PR workflow support
- **Full CRUD for shared content** - Rename, edit, and delete shared groups/prompts locally, then sync via PR
- **Import/Export** - JSON backup and restore
- **Duplicate detection** - Automatic prevention via normalized text
- **Search & Filter** - Real-time prompt filtering
- **Theme-aware UI** - Adapts to light/dark Rider themes

## 🚀 Quick Start

### Installation

**From Releases** (Recommended)

1. Download the latest `.zip` from [Releases](../../releases)
2. In Rider: **File > Settings > Plugins > Install Plugin from Disk...**
3. Select the downloaded zip file and restart Rider

**From Source**

Prerequisites: JDK 21, JetBrains Rider 2025.2+

```bash
git clone https://github.com/empowerfinance/TiltPromptLibraryPlugins.git
cd TiltPromptLibraryPlugins/Rider
./gradlew buildPlugin
```

Then install via **File > Settings > Plugins > Install Plugin from Disk...**

### Usage

1. **Open** - Look for "Prompt Library" in the left sidebar
2. **Add** - Use the "New Prompt" text area at the bottom
3. **Copy** - Click any prompt to copy to clipboard
4. **Edit/Delete** - Use the pencil/trash icons
5. **Search** - Type in the search box to filter
6. **Groups** - Organize under Shared or Private namespaces
7. **Sync** - Use toolbar buttons to sync Shared prompts to Git

## 🔄 GitHub Sync

Only **Shared** prompts are synced. Private prompts stay local.

**YAML Repository Layout:**

```
<repoPath>/
  LibraryName/
    _library.yaml              # Library marker file (required)
    GroupName/
      _group.yaml              # Group metadata
      p-{uuid}.yaml            # Prompt files (directly in group folder)
    AnotherGroup/
      _group.yaml
      p-{uuid}.yaml
```

**Key conventions:**

- **`_library.yaml`** - Marker file identifying a library folder
- **`_group.yaml`** - Group metadata (name, id, order)
- **Flat structure** - Prompts stored directly in group folders (no `prompts/` subdirectory)
- **Flat groups** - Groups only at library root level (no nested groups)
- **Prompt filenames** - Format: `p-{uuid}.yaml`

**Sync Operations:**

- **Pull & Sync** - Get latest from Git and update local library
- **Quick Commit** - Push directly to current branch
- **Branch+PR** - Create branch and open PR

**PR Workflow:**

When creating a Pull Request, the plugin:

1. Creates a timestamped branch and commits your changes
2. Opens the GitHub compare URL to create the PR
3. Shows a dialog asking if you want to return to main and pull latest
4. Displays a branch indicator showing your current branch (with warning when not on main/master)
5. Provides a "Return to Main & Pull" button for easy branch switching

Configure via **Settings > Prompt Library**.

## 🛠️ Development

```bash
cd TiltPromptLibraryPlugins/Rider
./gradlew runIde       # Launch sandbox IDE
./gradlew test         # Run tests
./gradlew buildPlugin  # Build distribution
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

## 📄 License

MIT - See [LICENSE](LICENSE)
