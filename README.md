<p align="center">
  <img src="./media/banner.png" alt="Tilt Prompt Library Logo" width="600" />
</p>

# Tilt Prompt Library Plugins

[![Build and Release Pipeline](https://github.com/empowerfinance/TiltPromptLibraryPlugins/actions/workflows/build-v0.1.yml/badge.svg)](https://github.com/empowerfinance/TiltPromptLibraryPlugins/actions/workflows/build-v0.1.yml)

A collection of IDE plugins for organizing and managing reusable prompts with GitHub sync. Available for **VS Code** and **JetBrains Rider**.

## 🎯 Overview

These plugins help developers organize, search, and reuse text prompts—perfect for AI assistant interactions, code templates, or frequently used text snippets. Both plugins share the same core concepts:

- **Shared/Private namespaces** - Keep private prompts local, sync shared prompts to Git
- **GitHub sync** - Export shared prompts as merge-friendly YAML with PR workflow support
- **Full CRUD for shared content** - Rename, edit, and delete shared groups/prompts locally, then sync via PR
- **Duplicate detection** - Automatic prevention via normalized text
- **Copy to clipboard** - Quickly copy prompts with the copy button
- **Augment integration** - Send prompts directly to Augment chat (VS Code)

## 📁 Repository Structure

```
TiltPromptLibraryPlugins/
├── VSCode/           # VS Code extension (TypeScript)
├── Rider/            # JetBrains Rider plugin (Kotlin)
└── docs/             # Shared documentation
```

## 📂 Prompt Library Directory Structure

Both plugins use the same on-disk YAML format for shared prompts:

```
<repoPath>/
  LibraryName/
    _library.yaml           # Library marker file (identifies this as a library)
    GroupName/
      _group.yaml           # Group metadata (name, display order)
      p-1234567890-abc.yaml # Prompt files (directly in group folder)
      p-1234567891-def.yaml
    AnotherGroup/
      _group.yaml
      p-1234567892-ghi.yaml
```

**Key conventions:**

- **`_library.yaml`** - Marker file at library root (required to identify a library folder)
- **`_group.yaml`** - Group metadata file (name, id, order)
- **Flat structure** - Prompts are stored directly in group folders (no `prompts/` subdirectory)
- **Flat groups** - Groups are only at the library root level (no nested groups)
- **Prompt filenames** - Format: `p-{timestamp}-{random}.yaml` (VSCode) or `p-{uuid}.yaml` (Rider)

## 🔄 Smart Sync / Git Operations

Both plugins feature **Smart Sync** that automatically handles local changes before pulling:

1. **Auto-commit before pull** - If you have uncommitted local changes (new prompts, edits, etc.), the plugin automatically stages and commits them with the message "Auto-commit: Local changes before sync"
2. **Rebase-based pull** - Uses `git pull --rebase` to cleanly integrate remote changes
3. **No data loss** - Local work is never lost; it's committed first, then rebased on top of remote changes

This eliminates "Pull failed" errors when you have local uncommitted changes.

### PR Workflow

When creating a Pull Request from the plugin:

1. **Branch creation** - Creates a timestamped branch (e.g., `prompt-sync/2026-02-12-14-30`)
2. **Commit & push** - Commits your changes and pushes the branch
3. **GitHub PR page** - Opens the GitHub compare URL to create the PR
4. **Return to main dialog** - After pushing, you're asked if you want to return to main and pull latest changes
5. **Branch indicator** - The Sync Ops panel shows your current branch with a warning when not on main/master
6. **Return to Main button** - One-click return to main branch and pull latest changes

## 🚀 Quick Start

### VS Code Extension

**Prerequisites:**

- Node.js 18+
- VS Code 1.85+

```bash
cd VSCode
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

See [VSCode/README.md](VSCode/README.md) for full documentation.

### Rider Plugin

**Prerequisites:**

- JDK 21
- JetBrains Rider 2025.2+

```bash
cd Rider
./gradlew runIde          # Launch sandbox with plugin
./gradlew buildPlugin     # Build distribution zip
# Windows: use gradlew.bat instead
```

See [Rider/README.md](Rider/README.md) for full documentation.

## 🛠️ Development

### VS Code Extension Development

```bash
cd VSCode
npm install               # Install dependencies
npm run compile           # Compile TypeScript
npm run watch             # Watch mode for development
npm test                  # Run tests (vitest)
npm run package           # Build .vsix for distribution
```

**Key files:**

- `src/extension.ts` - Extension entry point
- `src/store.ts` - Prompt storage and persistence
- `src/sync/` - Git sync functionality
- `src/ui/` - Webview UI components

### Rider Plugin Development

```bash
cd Rider
./gradlew runIde          # Run plugin in sandbox IDE
./gradlew buildPlugin     # Build distribution zip
./gradlew test            # Run tests
```

**Key files:**

- `src/main/kotlin/com/example/promptlibrary/` - Plugin source
  - `model/` - Data models (Prompt, Group, Library)
  - `repository/PromptRepository.kt` - Prompt storage and persistence
  - `sync/` - Git sync, YAML read/write, PR workflow
  - `yaml/` - YAML serialization for prompts and groups
  - `ui/` - UI panels and dialogs
  - `settings/` - Plugin settings and library configuration
  - `PromptLibraryToolWindowFactory.kt` - Plugin integration

### Running Tests

**VS Code:**

```bash
cd VSCode
npm test                  # Run all tests
npm run test:watch        # Watch mode
```

**Rider:**

```bash
cd Rider
./gradlew test
```

### E2E Testing

E2E tests run against a dedicated test repository: [TiltPromptLibraryE2ETestRepo](https://github.com/empowerfinance/TiltPromptLibraryE2ETestRepo)

The E2E test suite validates Git sync operations by cloning and manipulating this repository. In CI, tests authenticate using the `E2E_REPO_TOKEN` secret.

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

**Quick start:**

1. Fork and clone the repository
2. Set up the development environment (see above)
3. Create a feature branch
4. Make your changes and run tests
5. Submit a pull request

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## 📄 License

MIT - See [LICENSE](VSCode/LICENSE) or [LICENSE](Rider/LICENSE) for details.

## 🔒 Security

To report security vulnerabilities, please see our [Security Policy](.github/SECURITY.md).

---

**Built with ❤️ by [Tilt Finance](https://tilt.com/) in collaboration with [Augment](https://www.augmentcode.com/)**
