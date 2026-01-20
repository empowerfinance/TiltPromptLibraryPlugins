# Rider Prompt Library Plugin

A prompt library for JetBrains Rider to organize, search, and reuse text prompts. Perfect for AI assistant interactions, code templates, or frequently used snippets.

## ✨ Features

- **Shared/Private namespaces** - Keep private prompts local, sync shared prompts to Git
- **One-click copy** - Click any prompt to copy to clipboard
- **Send to Editor** - Insert prompts directly at cursor position
- **GitHub Sync** - Export shared prompts as merge-friendly YAML
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

Prerequisites: JDK 21, JetBrains Rider 2024.3+

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
<repoPath>/<promptsSubdir>/
  <GroupName>/
    _group.yaml
    prompts/
      p-<uuid>.yaml
```

**Sync Operations:**

- **Pull & Sync** - Get latest from Git (remote-wins merge)
- **Quick Commit** - Push directly to current branch
- **Branch+PR** - Create branch and open PR

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
