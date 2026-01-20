# Test Coverage Analysis - VS Code Prompt Library Extension

**Date:** 2026-01-15  
**Total Source Lines:** ~2,415 lines (excluding tests)  
**Total Tests:** 41 tests across 4 files  
**Estimated Coverage:** ~15-20% of codebase

---

## Executive Summary

### ✅ What's Well Tested (100% coverage)
- **Refactored modules** - All new code from refactoring
- **Type utilities** - Helper functions and constants
- **HTML loading** - Template system

### ⚠️ What's Partially Tested
- **YAML reading** - 1 integration test only

### ❌ What's NOT Tested (Critical Gaps)
- **Core extension logic** - Command handlers, webview providers
- **Library store** - CRUD operations, migrations
- **Tree provider** - Group hierarchy, refresh logic
- **Git operations** - All Git commands
- **YAML writing** - File generation
- **Sync operations** - Full sync workflow
- **Settings** - Configuration management
- **Logging** - Log entry management

---

## Detailed Module Analysis

### 1. ✅ types/index.ts (127 lines) - 100% TESTED

**Lines:** 127  
**Tests:** 22 tests  
**Coverage:** ✅ 100%

**What's Tested:**
- ✅ `normalizeText()` - 6 tests
  - Line ending normalization
  - Whitespace collapsing
  - Trimming and lowercase
  - Edge cases (empty strings, complex text)
  
- ✅ `generateId()` - 4 tests
  - Prefix validation
  - Uniqueness guarantees
  - Format validation
  - Multiple prefixes
  
- ✅ `truncateText()` - 7 tests
  - Truncation logic
  - Default maxLength
  - Line break handling
  - Whitespace trimming
  
- ✅ `Constants` - 5 tests
  - All constant values validated

**Gaps:** None - Full coverage

---

### 2. ✅ ui/htmlLoader.ts (46 lines) - 100% TESTED

**Lines:** 46  
**Tests:** 10 unit tests + 8 integration tests  
**Coverage:** ✅ 100%

**What's Tested:**
- ✅ `getNonce()` - 4 tests
  - Length validation
  - Uniqueness
  - Character set
  
- ✅ `generateCSP()` - 2 tests
  - Meta tag generation
  - CSP directives
  
- ✅ `loadHtmlTemplate()` - 4 tests
  - Placeholder replacement
  - Multiple occurrences
  - Edge cases
  
- ✅ Integration tests - 8 tests
  - Real template loading
  - Full rendering pipeline
  - Template consistency

**Gaps:** None - Full coverage

---

### 3. ⚠️ sync/yamlReader.ts (161 lines) - PARTIALLY TESTED

**Lines:** 161  
**Tests:** 1 integration test  
**Coverage:** ⚠️ ~30%

**What's Tested:**
- ✅ `readSharedGroups()` - 1 integration test
  - Basic repository reading
  - Group and prompt parsing
  - YAML file structure

**Critical Gaps:**
- ❌ Error handling (malformed YAML)
- ❌ Edge cases (empty files, missing fields)
- ❌ Nested group structures
- ❌ Different YAML formats
- ❌ File system errors
- ❌ Invalid UTF-8 handling
- ❌ Large file handling

**Risk:** Medium - Used in sync operations

---

### 4. ❌ extension.ts (826 lines) - NOT TESTED

**Lines:** 826  
**Tests:** 0  
**Coverage:** ❌ 0%

**What's NOT Tested:**
- ❌ `PromptDetailViewProvider` (64 lines)
  - Webview rendering
  - HTML escaping
  - Prompt display
  
- ❌ `PromptLibraryViewProvider` (200+ lines)
  - Webview lifecycle
  - Message handling
  - Group selection
  - Prompt CRUD operations
  - Bulk operations
  
- ❌ Command handlers (400+ lines)
  - `promptLibrary.hello`
  - `promptLibrary.copyPrompt`
  - `promptLibrary.deletePrompt`
  - `promptLibrary.editPrompt`
  - `promptLibrary.movePrompt`
  - `promptLibrary.addGroup`
  - `promptLibrary.renameGroup`
  - `promptLibrary.deleteGroup`
  - `promptLibrary.importJson`
  - `promptLibrary.exportJson`
  - `promptLibrary.deduplicate`
  - `promptLibrary.syncOps`
  - `promptLibrary.syncDirectCommit`
  - `promptLibrary.syncBranchPR`
  - `promptLibrary.syncPullAndImport`
  - `promptLibrary.syncPullOverwriteAndImport`
  - `promptLibrary.syncReadNow`
  - `promptLibrary.syncFetch`
  - `promptLibrary.openSettings`
  
- ❌ Extension activation/deactivation
- ❌ Webview message routing
- ❌ State management

**Risk:** HIGH - Core functionality, many edge cases

---

### 5. ❌ groups.ts (249 lines) - NOT TESTED

**Lines:** 249  
**Tests:** 0  
**Coverage:** ❌ 0%

**What's NOT Tested:**
- ❌ `GroupsProvider` class
  - Tree data provider implementation
  - Group hierarchy building
  - Refresh logic
  - Repository label computation
  - Shared/private filtering
  
- ❌ `GroupItem` and `PromptItem` classes
  - Tree item creation
  - Icon selection
  - Context values
  - Tooltip generation
  
- ❌ Helper functions
  - `genId()` - ID generation (duplicate of types module)
  - Group finding logic
  - Tree structure building

**Risk:** HIGH - Critical for UI, complex tree logic

---

### 6. ❌ store.ts (384 lines) - NOT TESTED

**Lines:** 384  
**Tests:** 0  
**Coverage:** ❌ 0%

**What's NOT Tested:**
- ❌ `LibraryStore` class
  - File I/O operations
  - JSON serialization/deserialization
  - Library initialization
  - Migration logic
  
- ❌ CRUD operations
  - `getPrompts()` - Retrieve prompts
  - `addPromptToGroup()` - Add prompt
  - `editPrompt()` - Update prompt
  - `deletePrompt()` - Remove prompt
  - `movePrompt()` - Move between groups
  - `copyPrompt()` - Duplicate prompt
  
- ❌ Group operations
  - `addGroup()` - Create group
  - `renameGroup()` - Rename group
  - `deleteGroup()` - Remove group
  - `findGroup()` - Search groups
  
- ❌ Bulk operations
  - `deleteMany()` - Bulk delete
  - `moveMany()` - Bulk move
  
- ❌ Import/Export
  - `importFromJson()` - JSON import
  - `exportToJson()` - JSON export
  - `deduplicate()` - Remove duplicates
  
- ❌ Merge operations
  - `mergeSharedGroups()` - Sync merge logic

**Risk:** CRITICAL - Core data layer, complex logic, data integrity

---

### 7. ❌ sync/git.ts (117 lines) - NOT TESTED

**Lines:** 117  
**Tests:** 0  
**Coverage:** ❌ 0%

**What's NOT Tested:**
- ❌ Git command execution
  - `runGit()` - Command runner
  - `isGitRepo()` - Repository detection
  - `getCurrentBranch()` - Branch info
  - `stageAll()` - Stage changes
  - `commit()` - Create commit
  - `push()` - Push to remote
  - `checkoutNewBranch()` - Branch creation
  - `getRemoteUrl()` - Remote URL
  - `clone()` - Clone repository
  - `fetch()` - Fetch updates
  - `pull()` - Pull changes
  - `resetHardToRemote()` - Hard reset
  - `cleanUntracked()` - Clean files
  - `tryBuildGithubCompareUrl()` - URL building

**Risk:** HIGH - External process execution, error handling critical

---

### 8. ❌ sync/yamlWriter.ts (109 lines) - NOT TESTED

**Lines:** 109  
**Tests:** 0  
**Coverage:** ❌ 0%

**What's NOT Tested:**
- ❌ YAML generation
  - `yamlScalar()` - Escaping logic
  - `writeGroupMeta()` - Group metadata
  - `writePromptYaml()` - Prompt serialization
  
- ❌ File operations
  - `writeSharedGroups()` - Main write function
  - `snapshotFiles()` - File tracking
  - Directory creation
  - File deletion
  - Content hashing
  
- ❌ Write strategies
  - Incremental updates
  - Full rewrites
  - Conflict detection

**Risk:** HIGH - Data serialization, file system operations

---

### 9. ❌ syncOps.ts (109 lines) - NOT TESTED

**Lines:** 109  
**Tests:** 0  
**Coverage:** ❌ 0%

**What's NOT Tested:**
- ❌ `SyncOpsPanel` class
  - Webview panel management
  - Message handling
  - Log display
  - Action buttons
  
- ❌ Sync operations
  - Pull & Sync
  - Pull (Overwrite) & Sync
  - Direct Commit
  - Branch + PR
  
- ❌ UI rendering
  - HTML generation (now uses template)
  - Dynamic content
  - State management

**Risk:** MEDIUM - UI panel, user-facing operations

---

### 10. ❌ log.ts (39 lines) - NOT TESTED

**Lines:** 39  
**Tests:** 0  
**Coverage:** ❌ 0%

**What's NOT Tested:**
- ❌ `PromptLibraryLog` class
  - Entry management
  - Max entries limit (300)
  - Event emission
  - Clear functionality
  
- ❌ Log methods
  - `info()` - Info logging
  - `warn()` - Warning logging
  - `error()` - Error logging

**Risk:** LOW - Simple utility, but used everywhere

---

### 11. ❌ settings.ts (47 lines) - NOT TESTED

**Lines:** 47  
**Tests:** 0  
**Coverage:** ❌ 0%

**What's NOT Tested:**
- ❌ `getSettings()` - Configuration reading
- ❌ `expandPath()` - Tilde expansion
- ❌ `onSettingsChanged()` - Change detection
- ❌ Settings validation
- ❌ Default values

**Risk:** MEDIUM - Configuration errors can break features

---

### 12. ❌ status.ts (128 lines) - NOT TESTED

**Lines:** 128  
**Tests:** 0  
**Coverage:** ❌ 0%

**What's NOT Tested:**
- ❌ `StatusViewProvider` class
  - Webview rendering
  - Log subscription
  - Message handling
  - Command execution

**Risk:** LOW - UI component, less critical

---

### 13. ❌ sync/scheduler.ts (46 lines) - NOT TESTED

**Lines:** 46  
**Tests:** 0  
**Coverage:** ❌ 0%

**What's NOT Tested:**
- ❌ Auto-fetch scheduling
- ❌ Timer management
- ❌ Settings integration
- ❌ Error handling

**Risk:** MEDIUM - Background operations

---

### 14. ✅ model.ts (27 lines) - INDIRECTLY TESTED

**Lines:** 27  
**Tests:** 0 direct tests  
**Coverage:** ⚠️ Indirectly tested through other modules

**What's Defined:**
- Type definitions only (no logic)
- `Prompt` interface
- `Group` interface
- `Library` interface
- `GroupKind` type

**Risk:** LOW - Pure type definitions

---

## Summary by Risk Level

### 🔴 CRITICAL RISK (Must Test)
1. **store.ts** (384 lines) - Core data layer, CRUD operations
2. **extension.ts** (826 lines) - Main extension logic, commands

### 🟠 HIGH RISK (Should Test)
3. **groups.ts** (249 lines) - Tree provider, complex hierarchy
4. **sync/git.ts** (117 lines) - External process execution
5. **sync/yamlWriter.ts** (109 lines) - Data serialization

### 🟡 MEDIUM RISK (Nice to Test)
6. **sync/yamlReader.ts** (161 lines) - Partially tested
7. **syncOps.ts** (109 lines) - UI panel
8. **settings.ts** (47 lines) - Configuration
9. **sync/scheduler.ts** (46 lines) - Background tasks

### 🟢 LOW RISK (Optional)
10. **log.ts** (39 lines) - Simple utility
11. **status.ts** (128 lines) - UI component
12. **model.ts** (27 lines) - Type definitions only

---

## Coverage Statistics

| Category | Lines | Tests | Coverage | Status |
|----------|-------|-------|----------|--------|
| **Tested** | 173 | 40 | 100% | ✅ |
| **Partially Tested** | 161 | 1 | ~30% | ⚠️ |
| **Not Tested** | 2,081 | 0 | 0% | ❌ |
| **TOTAL** | 2,415 | 41 | ~15-20% | ⚠️ |

---

## Visual Coverage Map

```
Extension Modules                    Coverage    Risk    Priority
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
types/index.ts          (127 lines)  ████████  ✅ 100%   LOW    ✅ DONE
ui/htmlLoader.ts         (46 lines)  ████████  ✅ 100%   LOW    ✅ DONE
sync/yamlReader.ts      (161 lines)  ██░░░░░░  ⚠️  30%   MED    ⚠️ PARTIAL
store.ts                (384 lines)  ░░░░░░░░  ❌   0%   CRIT   🔴 TODO
extension.ts            (826 lines)  ░░░░░░░░  ❌   0%   CRIT   🔴 TODO
groups.ts               (249 lines)  ░░░░░░░░  ❌   0%   HIGH   🟠 TODO
sync/git.ts             (117 lines)  ░░░░░░░░  ❌   0%   HIGH   🟠 TODO
sync/yamlWriter.ts      (109 lines)  ░░░░░░░░  ❌   0%   HIGH   🟠 TODO
syncOps.ts              (109 lines)  ░░░░░░░░  ❌   0%   MED    🟡 TODO
settings.ts              (47 lines)  ░░░░░░░░  ❌   0%   MED    🟡 TODO
sync/scheduler.ts        (46 lines)  ░░░░░░░░  ❌   0%   MED    🟡 TODO
log.ts                   (39 lines)  ░░░░░░░░  ❌   0%   LOW    🟢 TODO
status.ts               (128 lines)  ░░░░░░░░  ❌   0%   LOW    🟢 TODO
model.ts                 (27 lines)  ████████  ⚠️ TYPES  LOW    ✅ N/A
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL                 (2,415 lines)  ██░░░░░░  ~15-20%
```

## Next Steps - Priority Order

### Immediate (This Week)
1. 🔴 **store.ts** - Core data layer (30-40 tests, 4-6 hours)
2. 🔴 **extension.ts** - Command handlers (50-60 tests, 8-10 hours)

### Short Term (Next 2 Weeks)
3. 🟠 **groups.ts** - Tree provider (20-25 tests, 3-4 hours)
4. 🟠 **sync/git.ts** - Git operations (25-30 tests, 4-5 hours)
5. 🟠 **sync/yamlWriter.ts** - YAML writing (20-25 tests, 3-4 hours)

### Medium Term (Next Month)
6. 🟡 **sync/yamlReader.ts** - Complete coverage (15-20 tests, 2-3 hours)
7. 🟡 **settings.ts** - Configuration (10-12 tests, 1-2 hours)
8. 🟡 **syncOps.ts** - Sync panel (12-15 tests, 2-3 hours)

### Long Term (As Needed)
9. 🟢 **log.ts** - Logging (6-8 tests, 1 hour)
10. 🟢 **status.ts** - Status panel (8-10 tests, 1-2 hours)
11. 🟢 **sync/scheduler.ts** - Auto-fetch (6-8 tests, 1 hour)

See **TEST_COVERAGE_GAPS.md** for detailed recommendations and test examples.

