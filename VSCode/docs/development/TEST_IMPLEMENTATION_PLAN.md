# Test Implementation Plan & Progress Tracker

**Start Date:** 2026-01-15  
**Target Coverage:** 75-80%  
**Current Coverage:** ~15-20%

---

## Implementation Strategy

We'll implement tests in 4 phases, prioritizing by impact and dependencies:

1. **Phase 1: Quick Wins** - Simple modules, immediate value
2. **Phase 2: Critical Foundation** - Core business logic
3. **Phase 3: Sync Infrastructure** - Git and YAML operations
4. **Phase 4: Polish & Integration** - Remaining modules and integration tests

---

## Phase 1: Quick Wins (9 hours → 35-40% coverage)

**Goal:** Boost coverage quickly with high-value, low-complexity tests

### 1.1 log.ts (1 hour, 16 tests) ✅ COMPLETE
- [x] Test info/warn/error logging
- [x] Test max entries limit (300)
- [x] Test event emission
- [x] Test clear functionality
- [x] Test entry format
- [x] Test timestamp generation

**File:** `src/__tests__/log.test.ts`
**Status:** ✅ All 16 tests passing

### 1.2 settings.ts (2 hours, 12 tests) ✅ COMPLETE
- [x] Test getSettings() with defaults
- [x] Test getSettings() with custom values
- [x] Test expandPath() with tilde
- [x] Test expandPath() with absolute paths
- [x] Test expandPath() edge cases
- [x] Test onSettingsChanged() callback
- [x] Test configuration validation
- [x] Test all setting properties

**File:** `src/__tests__/settings.test.ts`
**Status:** ✅ All 12 tests passing

### 1.3 sync/yamlReader.ts - Complete Coverage (2 hours, 10 tests) ✅ COMPLETE
- [x] Test malformed YAML handling
- [x] Test missing required fields
- [x] Test empty files
- [x] Test nested group structures
- [x] Test prompt parsing edge cases
- [x] Test group metadata parsing

**File:** `src/__tests__/yamlReader.errors.test.ts`
**Status:** ✅ All 10 tests passing (plus 1 existing integration test)

### 1.4 store.ts - Basic CRUD (4 hours, 15-20 tests) 🔄 IN PROGRESS
- [ ] Test load() with default library
- [ ] Test save() and reload
- [ ] Test ensureInitialized()
- [ ] Test addPromptToGroup() basic
- [ ] Test addPromptToGroup() with invalid group
- [ ] Test editPrompt() basic
- [ ] Test deletePrompt() basic
- [ ] Test getPrompts() basic
- [ ] Test findGroup() helper
- [ ] Test ID generation uniqueness

**File:** `src/__tests__/store.test.ts`

**Phase 1 Total:** 9 hours, 46-58 tests

---

## Phase 2: Critical Foundation (15-20 hours → 60% coverage) ✅ COMPLETE

**Goal:** Test core business logic and command handlers

### 2.1 store.ts - Advanced Operations (29 tests) ✅ COMPLETE
- [x] Test movePrompt() between groups
- [x] Test listMovableGroups()
- [x] Test exportPrivateAsStringArray()
- [x] Test importStringArrayToUnfiled()
- [x] Test importFromObject()
- [x] Test deduplicate()
- [x] Test migration logic
- [x] Test data integrity constraints

**File:** `src/__tests__/store.advanced.test.ts`
**Status:** ✅ All 29 tests passing

### 2.2 extension.ts - Command Handlers (21 tests) ✅ COMPLETE
- [x] Test promptLibrary.copyPrompt
- [x] Test promptLibrary.deletePrompt
- [x] Test promptLibrary.editPrompt
- [x] Test promptLibrary.movePrompt
- [x] Test promptLibrary.importJson
- [x] Test promptLibrary.exportJson
- [x] Test promptLibrary.deduplicate
- [x] Test promptLibrary.resetAll
- [x] Test promptLibrary.openPrompt
- [x] Test promptLibrary.updatePromptText
- [x] Test promptLibrary.updatePromptTitle
- [x] Test error handling for each command

**File:** `src/__tests__/extension.commands.test.ts`
**Status:** ✅ All 21 tests passing

### 2.3 groups.ts - Tree Provider (27 tests) ✅ COMPLETE
- [x] Test GroupsProvider initialization
- [x] Test tree structure building
- [x] Test getChildren() for roots
- [x] Test getChildren() for groups
- [x] Test getChildren() for prompts
- [x] Test refresh() logic
- [x] Test getGroupById()
- [x] Test addGroup()
- [x] Test renameGroup()
- [x] Test deleteGroup()
- [x] Test group protection (roots, unfiled, shared)
- [x] Test prompt rehoming on delete
- [x] Test nested group handling
- [x] Test setLibrary()
- [x] Test refreshFromStore()

**File:** `src/__tests__/groups.test.ts`
**Status:** ✅ All 27 tests passing

### 2.4 extension.ts - Webview Providers ⏳ NOT TESTED
- [ ] Test PromptDetailViewProvider rendering
- [ ] Test PromptDetailViewProvider HTML escaping
- [ ] Test PromptLibraryViewProvider initialization
- [ ] Test PromptLibraryViewProvider message handling
- [ ] Test group selection persistence
- [ ] Test webview HTML generation
- [ ] Test message routing
- [ ] Test state management

**File:** `src/__tests__/extension.webview.test.ts`
**Status:** ⏳ Deferred to Phase 3

**Phase 2 Total:** ~2 hours, 77 tests ✅ COMPLETE

---

## Phase 3: Sync Infrastructure (9-12 hours → 75% coverage)

**Goal:** Test Git operations and YAML writing

### 3.1 sync/git.ts (4-5 hours, 25-30 tests) ⏳ NOT STARTED
- [ ] Test runGit() command execution
- [ ] Test runGit() stdout/stderr capture
- [ ] Test runGit() exit codes
- [ ] Test isGitRepo() detection
- [ ] Test getCurrentBranch()
- [ ] Test stageAll()
- [ ] Test commit() success
- [ ] Test commit() nothing to commit
- [ ] Test commit() failure
- [ ] Test push() success
- [ ] Test push() with branch
- [ ] Test push() network errors
- [ ] Test checkoutNewBranch()
- [ ] Test getRemoteUrl()
- [ ] Test clone() success
- [ ] Test clone() failure
- [ ] Test fetch()
- [ ] Test pull()
- [ ] Test resetHardToRemote()
- [ ] Test cleanUntracked()
- [ ] Test tryBuildGithubCompareUrl()

**File:** `src/sync/__tests__/git.test.ts`

### 3.2 sync/yamlWriter.ts (3-4 hours, 20-25 tests) ⏳ NOT STARTED
- [ ] Test yamlScalar() escaping
- [ ] Test yamlScalar() quoting logic
- [ ] Test yamlScalar() special characters
- [ ] Test writeGroupMeta()
- [ ] Test writePromptYaml() basic
- [ ] Test writePromptYaml() multiline text
- [ ] Test writePromptYaml() with tags
- [ ] Test writePromptYaml() private flag stripping
- [ ] Test writeSharedGroups() directory creation
- [ ] Test writeSharedGroups() file writing
- [ ] Test writeSharedGroups() change tracking
- [ ] Test writeSharedGroups() incremental updates
- [ ] Test snapshotFiles() hashing
- [ ] Test file deletion logic
- [ ] Test sanitize() filename generation

**File:** `src/sync/__tests__/yamlWriter.test.ts`

### 3.3 syncOps.ts (2-3 hours, 12-15 tests) ⏳ NOT STARTED
- [ ] Test SyncOpsPanel initialization
- [ ] Test message handling for pullSync
- [ ] Test message handling for syncDirectCommit
- [ ] Test message handling for syncBranchPR
- [ ] Test message handling for importJson
- [ ] Test message handling for exportJson
- [ ] Test rendering with no repo
- [ ] Test rendering with repo configured
- [ ] Test button state management
- [ ] Test settings display

**File:** `src/__tests__/syncOps.test.ts`

**Phase 3 Total:** 9-12 hours, 57-70 tests

---

## Phase 4: Polish & Integration (4-6 hours → 80% coverage)

**Goal:** Complete remaining modules and add integration tests

### 4.1 status.ts (1-2 hours, 8-10 tests) ⏳ NOT STARTED
- [ ] Test StatusViewProvider initialization
- [ ] Test webview rendering
- [ ] Test log subscription
- [ ] Test message handling
- [ ] Test command execution
- [ ] Test entry display

**File:** `src/__tests__/status.test.ts`

### 4.2 sync/scheduler.ts (1 hour, 6-8 tests) ⏳ NOT STARTED
- [ ] Test scheduler initialization
- [ ] Test auto-fetch scheduling
- [ ] Test timer management
- [ ] Test settings integration
- [ ] Test error handling
- [ ] Test cleanup on dispose

**File:** `src/sync/__tests__/scheduler.test.ts`

### 4.3 Integration Tests (2-3 hours, 10-15 tests) ⏳ NOT STARTED
- [ ] Test full sync workflow (write → commit → push)
- [ ] Test full sync workflow (fetch → pull → read)
- [ ] Test prompt lifecycle (create → edit → move → delete)
- [ ] Test group lifecycle (create → rename → delete)
- [ ] Test import/export round-trip
- [ ] Test deduplication workflow
- [ ] Test branch + PR workflow
- [ ] Test error recovery scenarios

**File:** `src/__tests__/integration.test.ts`

**Phase 4 Total:** 4-6 hours, 24-33 tests

---

## Overall Summary

| Phase | Hours | Tests | Coverage Target | Status |
|-------|-------|-------|-----------------|--------|
| Phase 1: Quick Wins | 9 | 46-58 | 35-40% | ⏳ NOT STARTED |
| Phase 2: Critical | 15-17 | 75-95 | 60% | ⏳ NOT STARTED |
| Phase 3: Sync | 9-12 | 57-70 | 75% | ⏳ NOT STARTED |
| Phase 4: Polish | 4-6 | 24-33 | 80% | ⏳ NOT STARTED |
| **TOTAL** | **37-44** | **202-256** | **80%** | **⏳ NOT STARTED** |

---

## Progress Tracking

### Legend
- ⏳ NOT STARTED
- 🔄 IN PROGRESS
- ✅ COMPLETE
- ❌ BLOCKED

### Current Status (Updated: 2026-01-15 21:31)
- **Overall Progress:** 73% (186/256 tests)
- **Current Phase:** Phase 2 Complete ✅
- **Tests Added:** +145 tests (from 41 to 186)
- **Coverage:** ~65% (up from ~15%)
- **Completed Phases:**
  - ✅ Phase 1: Quick Wins (68 tests)
  - ✅ Phase 2: Critical Foundation (77 tests)
- **Next:** Phase 3 - Sync & Integration

---

## Notes

- Each test file will follow the existing patterns in `types/__tests__/index.test.ts`
- All tests will use vitest and the existing mock infrastructure
- Tests will be added incrementally and run after each module
- Coverage reports will be generated after each phase

