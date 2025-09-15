# Rider Prompt Library Plugin

A simple and efficient prompt library for JetBrains Rider that helps you organize, search, and reuse text prompts. Perfect for developers who work with AI assistants, code templates, or frequently used text snippets.

![Plugin Demo](docs/demo.gif) <!-- TODO: Add demo gif -->

## ✨ Features

- 📝 **Create, edit, and delete prompts** with confirmation dialogs
- 📋 **One-click copy** - click any prompt to copy it to clipboard
- 🔍 **Real-time search** with case-insensitive filtering
- 📤 **Import/Export** prompts as clean JSON arrays
- 🚫 **Duplicate detection** - automatically prevents duplicate prompts
- 💾 **Persistent storage** - prompts survive IDE restarts
- 🎨 **Theme-aware UI** - adapts to light/dark Rider themes
- ⚡ **Responsive design** - clean, scrollable interface
- 🗂️ **Shared/Private group namespaces** with per-namespace uniqueness and Unfiled fallback
- 🏷️ **Prompt titles** (optional) with smart 50‑char derived display when blank
- 🧰 **Row actions**: Open in Editor dialog with autosave, bounded card height
- ⚙️ Options menu with Show/Hide group tree and persistent splitter position
- 🧭 **Shared/Private roots UX**: roots show no prompts; new prompts go to selected group or Unfiled; Move To… lists only groups; Unfiled is the default inbox
- ✅ No prompts shown at Shared/Private roots; the tree roots are navigational only
- 📥 New prompts default into Unfiled when no group is selected
- 🚚 Moving prompts removes them from the previous location and inserts into the target group
- ✏️ Edit dialog updates prompts whether they live in Private or in any Group (duplicate-safe)

- 🧑‍🤝‍🧑 **Group toolbar**: add to Shared/Private, rename; delete is blocked for Shared (allowed in Private)




## How this was made
This plugin took about 2 hours to build from start to finish using an evolutionary development approach.
For details on what this looks like, please look at the files in the `docs` directory.

1. The `OriginalDesignPrompt.txt` file contains the original prompt given to the agent to plan the work.
2. The `KICKOFF.md` file contains the initial onboarding instructions for the agent.
3. The `WORK_TRACKING.md` file contains the work tracking log for the project.
4. The `README.md` file contains the final documentation for the plugin.

## 🚀 Quick Start

### Installation

#### Option 1: From GitHub Releases (Recommended)
1. Download the latest `Prompt-Library-1.0.8.zip` from [Releases](../../releases)
2. In Rider: **File > Settings > Plugins > ⚙️ > Install Plugin from Disk...**
3. Select the downloaded zip file
4. Restart Rider

#### Option 2: Build from Source

**Prerequisites**: JDK 21, JetBrains Rider 2025.2+ (latest) or Rider 2024.3–2025.1 (legacy)

##### For Rider 2025.2+ (Latest)
```bash
git clone https://github.com/your-org/RiderPromptLibraryPlugin.git
cd RiderPromptLibraryPlugin
./gradlew buildPlugin  # Creates zip in build/distributions/
# Windows PowerShell: .\gradlew.bat buildPlugin
```

##### For Rider 2024.3–2025.1 (Legacy)
```bash
git clone https://github.com/your-org/RiderPromptLibraryPlugin.git
cd RiderPromptLibraryPlugin
./gradlew -b build-legacy.gradle.kts buildPlugin  # Creates legacy-compatible zip
# Windows PowerShell: .\gradlew.bat -b build-legacy.gradle.kts buildPlugin
```

Then install the generated zip file in Rider:
1. **File > Settings > Plugins > ⚙️ > Install Plugin from Disk...**
2. Select `build/distributions/Prompt-Library-1.0.8.zip`
3. Restart Rider

## 🔧 Compatibility

| Rider Version | Plugin Version | Java Version | Build Command |
|---------------|----------------|--------------|---------------|
| 2025.2+ | Latest | JDK 21 | `./gradlew buildPlugin` (Windows: `./gradlew.bat buildPlugin`) |
| 2024.3–2025.1 | Legacy | JDK 17 or 21 | `./gradlew -b build-legacy.gradle.kts buildPlugin` (Windows: `./gradlew.bat -b build-legacy.gradle.kts buildPlugin`) |

Note: We target Rider 2025.2 for development; legacy build remains for back-compat testing.

### Usage

1. Open the tool window: Look for "Prompt Library" in the left sidebar
2. Add prompts: Use the "New Prompt" text area at the bottom
3. Copy prompts: Click any prompt text to copy it to clipboard
4. Edit prompts: Click the pencil icon, make changes, then Save or Cancel
5. Delete prompts: Click the trash icon and confirm
6. Search prompts: Type in the search box to filter prompts in real-time
7. Groups: Manage groups under Shared or Private using the toolbar above the tree:
   - Add Group: choose Shared or Private; the new group is focused automatically
   - Rename Group: edits the selected group name (per-namespace uniqueness)
   - Delete Group: allowed only in Private; when deleting, prompts move to Private/Unfiled
8. Move prompts: Right-click a prompt → Move To… and pick a group (roots are not valid destinations)
9. Roots behavior: Selecting Shared/Private shows no prompts; new prompts go to the selected group or default to Private/Unfiled
10. Import/Export: Use the toolbar buttons to backup or share your prompts

### JSON Format

Export creates clean, editable JSON:
```json
[
  "Write a unit test for a login function",
  "Explain dependency injection in C#",
  "Create a SQL query for user analytics"
]
```

### Storage model and migration

- The plugin stores data in a local v2 JSON library: groups + privatePrompts.
- On startup, any prompts previously stored at the private root are migrated into a Private/Unfiled group automatically.
- New prompts save to the selected group; if no group is selected (root), they go to Unfiled.
- Deleting a group moves its prompts into Private/Unfiled.

Import accepts multiple formats:
- **Simple string arrays** (as above) - most user-friendly
- **Objects with text field**: `[{"text": "prompt"}]` - generates IDs automatically
- **Full objects**: `[{"id": "uuid", "text": "prompt", "createdAt": "2024-01-01T00:00:00Z"}]`
- **Mixed formats** in the same array

**Duplicate Detection**: Uses normalized text comparison (trimmed, lowercase, collapsed whitespace) to prevent duplicates during import while preserving original formatting for display.

## 🔧 Troubleshooting

**Plugin won't install**: Check that you're using Rider 2024.1 or newer. The plugin supports Rider 2024.1+.

**Build fails**: Ensure you have JDK 21 (latest) or JDK 17 (legacy) installed and selected for the project. On Windows, use .\gradlew.bat for all Gradle commands.

**Tool window not visible**: After installation, look for "Prompt Library" in the left sidebar. If missing, try **View > Tool Windows > Prompt Library**.

**Gradle tasks not found**: Make sure you're in the project root directory and the Gradle wrapper files exist.

## 🤝 Contributing

We welcome contributions! This project was built using an evolutionary, step-by-step approach that makes it easy to understand and extend.

### Development Setup

1. **Prerequisites**: JDK 21 (latest) or JDK 17 (legacy), JetBrains Rider
2. **Clone and build**:
   ```bash
   git clone https://github.com/your-org/RiderPromptLibraryPlugin.git
   cd RiderPromptLibraryPlugin
   ./gradlew runIde  # Windows: .\gradlew.bat runIde
   ```
3. **Development workflow**:
   - Make changes to the code
   - Test in sandbox via "Run Plugin Sandbox" configuration
   - Build distribution via "Build Plugin Distribution" configuration

### Project Structure

```
src/main/kotlin/com/example/promptlibrary/
├── model/Prompt.kt                    # Data model with normalization
├── repository/PromptRepository.kt     # JSON persistence layer
├── ui/PromptLibraryPanel.kt          # Main UI components
└── PromptLibraryToolWindowFactory.kt # Plugin integration
```

### Contributing Guidelines

1. **Follow the evolutionary approach** - make small, incremental changes
2. **Update documentation** - modify `docs/WORK_TRACKING.md` after meaningful changes
3. **Test thoroughly** - verify functionality in sandbox before submitting
4. **Maintain compatibility** - ensure changes work across Rider versions 2024.1+

See also:
- [Development kickoff guide](docs/KICKOFF.md) - For new contributors
- [Work tracking log](docs/WORK_TRACKING.md) - Complete development history

## 📖 Project Story

This plugin was built as a demonstration of **evolutionary software development** - starting with a minimal viable product and incrementally adding features through small, well-defined steps. The entire development process is documented in [docs/WORK_TRACKING.md](docs/WORK_TRACKING.md).

### Development Journey

**The Challenge**: Create a simple but useful prompt library for Rider that developers can use to organize and reuse text snippets, especially when working with AI assistants.

**The Approach**: Instead of building everything at once, we followed a 9-step evolutionary plan:

1. **🏗️ Project Setup** - Gradle + IntelliJ plugin scaffold
2. **🎨 UI Scaffold** - Basic layout with in-memory storage
3. **💾 Persistence** - JSON file storage under IDE config
4. **📋 Copy on Click** - Clipboard integration with notifications
5. **✏️ Edit in Place** - Inline editing with Save/Cancel
6. **🗑️ Delete with Confirm** - Safe deletion with confirmation dialogs
7. **🔍 Search** - Real-time filtering with text normalization
8. **📤 Import/Export** - Flexible JSON import/export with multiple formats
9. **✨ Polish & Package** - Final touches and distribution-ready build

**The Result**: A clean, functional plugin that demonstrates how complex software can be built through small, manageable increments. Each step was fully tested before moving to the next, ensuring a stable foundation throughout development.

### Key Design Decisions

- **Simplicity First**: Focused on core functionality rather than complex features
- **User-Friendly JSON**: Export uses clean string arrays instead of complex objects
- **Flexible Import**: Accepts multiple JSON formats for maximum compatibility
- **Immediate Persistence**: All changes save instantly - no "Save" button needed
- **Theme Awareness**: Respects Rider's light/dark theme preferences
- **Duplicate Prevention**: Smart normalization prevents accidental duplicates

## 🔧 Technical Details

### Architecture (IntelliJ Platform + Kotlin)

- **Language**: Kotlin 1.9.25 with JDK 21 (latest) / JDK 17 (legacy)
- **Build**: Gradle + IntelliJ Plugin Development Kit
- **Target**: JetBrains Rider 2024.3+ (latest) / 2024.1-2025.1 (legacy)
- **UI**: Swing components with IntelliJ Platform theming
- **Storage**: JSON files under `PathManager.getConfigPath()/prompt-library/`

### Components

- **`Prompt`** - Data model with UUID, text, and timestamps
- **`PromptRepository`** - Handles JSON persistence, deduplication, and import/export
- **`PromptLibraryPanel`** - Main UI with search, CRUD operations, and dialogs
- **`PromptLibraryToolWindowFactory`** - Integrates with Rider's tool window system

### Key Features Implementation

**Text Normalization**: Trims whitespace, normalizes line endings, collapses spaces, converts to lowercase for comparison while preserving original text for display and copying.

**Duplicate Detection**: Uses normalized text comparison to prevent duplicate prompts during add, edit, and import operations.

**Flexible Import**: Supports multiple JSON formats - simple string arrays, objects with text fields, or full Prompt objects with optional metadata.

**Immediate Persistence**: All changes (add/edit/delete) save instantly to disk using the repository pattern.

## 📋 Development History

The complete evolutionary implementation plan and development log can be found in:
- **[docs/WORK_TRACKING.md](docs/WORK_TRACKING.md)** - Detailed step-by-step development history
- **[docs/KICKOFF.md](docs/KICKOFF.md)** - Original project kickoff and guidelines

### Implementation Steps Completed ✅

1. **Project Setup** - Gradle + IntelliJ plugin scaffold
2. **UI Scaffold** - Basic layout with in-memory storage
3. **Persistence** - JSON file storage under IDE config
4. **Copy on Click** - Clipboard integration with notifications
5. **Edit in Place** - Inline editing with Save/Cancel
6. **Delete with Confirm** - Safe deletion with confirmation dialogs
7. **Search** - Real-time filtering with text normalization
8. **Import/Export** - Flexible JSON import/export with multiple formats
9. **Polish & Package** - Final touches and distribution-ready build

## 🎯 Acceptance Criteria Met

- ✅ Tool window exists in Rider sidebar with scrollable, responsive list
- ✅ Create, edit, delete prompts with confirmation dialogs
- ✅ Copy prompts by clicking text with clipboard notifications
- ✅ Real-time search filters prompt list predictably
## GitHub Sync — YAML repository data model and workflow

This plugin exports only the Shared namespace to a Git repository using a simple, merge‑friendly YAML layout. Private prompts never leave your machine.

Data location
- The exported tree lives under a configurable subfolder (default: prompts). Configure this and other Git settings in Settings → Prompt Library.

Repository layout
- <promptsSubdir>/
  - <GroupName>/
    - _group.yaml          — group metadata only (id, name, kind, tags, description)
    - prompts/
      - p-<uuid>.yaml      — one file per prompt in this group
    - <ChildGroup>/        — nested groups repeat the same structure

What’s exported (Shared only)
- Groups: metadata goes to <Group>/_group.yaml; children are represented by subfolders.
- Prompts: public prompts become p-<id>.yaml files. We strip private=true and write deterministic YAML (KAML with encodeDefaults=true) for stable diffs.
- Private prompts: never exported.

Import and Load Repo
- “Load Repo” reads the YAML tree from the working copy and replaces the Shared namespace in the UI. A toast shows: “Imported N Shared group(s) from Git (remote‑wins).”

Sync flow (remote‑wins)
1) Pull latest from Git
2) Load remote YAML (Shared)
3) Merge remote‑wins with local state
   - If a prompt exists locally in Shared but is missing on the remote, we keep it locally by moving it to Private/Unfiled (no synthetic groups). A toast reports how many were kept.
4) Clean rewrite of the YAML tree (we delete and recreate the prompts subdir to avoid stale files)
5) Commit and push using the selected strategy:
   - Direct: commit to current branch and push
   - Branch+PR: create a short‑lived branch, commit, push, and open a compare/PR link when possible

Toasts and feedback
- Sync summary: “Shared changes: +A ~U -D” (files added/updated/deleted in the exported tree)
- Kept locals: “Kept K local prompt(s) in Private/Unfiled (not on remote).”
- First‑time setup: “Initialized empty repo” after an allow‑empty init commit

Shared/Private UX (relevant to sync)
- Two roots in the tree: Shared and Private; roots show no prompts.
- Private “Unfiled” is pinned at the top and cannot be renamed or deleted.
- Shared groups cannot be deleted. Move To… lists only groups (not roots).

Why multi‑file instead of a single YAML
- Small diffs and fewer conflicts (one file per prompt)
- Review clarity (PRs show exactly the prompt(s) touched)
- Scales to large libraries; structure mirrors the UI

Advanced settings (Settings → Prompt Library)
- Remote URL or Local Path (working copy)
- Prompts subfolder (default: prompts)
- Branch name
- Write strategy: Direct or Branch+PR
- Auto‑fetch (fetch only) toggle and cadence

Note: JSON import/export remains available as a quick, human‑friendly interchange format; Git sync uses the YAML repository layout above.


## 📄 License

This project is open source. See [LICENSE](LICENSE) for details.

---

**Built with ❤️ using evolutionary development principles by Paul Gradie in collaboration with Augment**
