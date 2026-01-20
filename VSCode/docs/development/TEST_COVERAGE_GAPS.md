# Test Coverage Gaps - Detailed Analysis & Recommendations

**Date:** 2026-01-15  
**Current Coverage:** ~15-20%  
**Target Coverage:** 60-80%

---

## Critical Gaps (Must Address)

### 1. 🔴 store.ts - Core Data Layer (384 lines, 0% coverage)

**Why Critical:**
- Handles all data persistence
- Complex CRUD operations
- Migration logic
- Data integrity critical
- Used by every feature

**What to Test:**

#### Basic Operations
```typescript
describe('LibraryStore', () => {
  describe('load/save', () => {
    it('should initialize with default library')
    it('should save and load library')
    it('should handle corrupted JSON')
    it('should migrate old formats')
  })
  
  describe('addPromptToGroup', () => {
    it('should add prompt to group')
    it('should reject duplicate prompts')
    it('should handle invalid group ID')
    it('should generate unique IDs')
    it('should set timestamps')
  })
  
  describe('editPrompt', () => {
    it('should update prompt text')
    it('should update title')
    it('should preserve ID')
    it('should update timestamp')
  })
  
  describe('deletePrompt', () => {
    it('should remove prompt from group')
    it('should handle non-existent prompt')
  })
  
  describe('movePrompt', () => {
    it('should move between groups')
    it('should handle invalid source/target')
    it('should preserve prompt data')
  })
})
```

**Estimated Tests:** 30-40 tests  
**Priority:** 🔴 CRITICAL  
**Effort:** 4-6 hours

---

### 2. 🔴 extension.ts - Main Extension Logic (826 lines, 0% coverage)

**Why Critical:**
- Entry point for all features
- Command handlers
- Webview providers
- State management
- User-facing operations

**What to Test:**

#### Command Handlers
```typescript
describe('Extension Commands', () => {
  describe('promptLibrary.copyPrompt', () => {
    it('should copy prompt to clipboard')
    it('should show success message')
    it('should handle copy failure')
  })
  
  describe('promptLibrary.deletePrompt', () => {
    it('should delete prompt after confirmation')
    it('should cancel on user rejection')
    it('should refresh tree view')
  })
  
  describe('promptLibrary.importJson', () => {
    it('should import valid JSON')
    it('should reject invalid JSON')
    it('should show import statistics')
    it('should handle duplicates')
  })
})
```

#### Webview Providers
```typescript
describe('PromptLibraryViewProvider', () => {
  describe('message handling', () => {
    it('should handle addPrompt message')
    it('should handle editPrompt message')
    it('should handle deletePrompt message')
    it('should handle bulk operations')
  })
  
  describe('group selection', () => {
    it('should remember last selected group')
    it('should default to Unfiled')
    it('should update on selection change')
  })
})
```

**Estimated Tests:** 50-60 tests  
**Priority:** 🔴 CRITICAL  
**Effort:** 8-10 hours

---

### 3. 🟠 groups.ts - Tree Provider (249 lines, 0% coverage)

**Why Important:**
- Complex tree hierarchy logic
- UI rendering
- Group management
- Repository label computation

**What to Test:**

```typescript
describe('GroupsProvider', () => {
  describe('tree structure', () => {
    it('should build correct hierarchy')
    it('should show/hide shared groups')
    it('should compute repository label')
    it('should handle nested groups')
  })
  
  describe('refresh', () => {
    it('should reload from store')
    it('should emit change event')
    it('should update tree view')
  })
  
  describe('getChildren', () => {
    it('should return root groups')
    it('should return child groups')
    it('should return prompts')
    it('should handle empty groups')
  })
})
```

**Estimated Tests:** 20-25 tests  
**Priority:** 🟠 HIGH  
**Effort:** 3-4 hours

---

### 4. 🟠 sync/git.ts - Git Operations (117 lines, 0% coverage)

**Why Important:**
- External process execution
- Error handling critical
- Network operations
- Data loss risk

**What to Test:**

```typescript
describe('Git Operations', () => {
  describe('runGit', () => {
    it('should execute git command')
    it('should capture stdout')
    it('should capture stderr')
    it('should return exit code')
    it('should handle command not found')
  })
  
  describe('isGitRepo', () => {
    it('should detect git repository')
    it('should return false for non-repo')
  })
  
  describe('commit', () => {
    it('should create commit')
    it('should handle nothing to commit')
    it('should handle commit failure')
  })
  
  describe('push', () => {
    it('should push to remote')
    it('should handle network errors')
    it('should handle auth failures')
  })
})
```

**Estimated Tests:** 25-30 tests  
**Priority:** 🟠 HIGH  
**Effort:** 4-5 hours

---

### 5. 🟠 sync/yamlWriter.ts - YAML Writing (109 lines, 0% coverage)

**Why Important:**
- Data serialization
- File system operations
- Sync functionality
- Data format correctness

**What to Test:**

```typescript
describe('YAML Writer', () => {
  describe('yamlScalar', () => {
    it('should escape special characters')
    it('should quote when needed')
    it('should handle newlines')
  })
  
  describe('writePromptYaml', () => {
    it('should generate valid YAML')
    it('should handle multiline text')
    it('should include tags')
    it('should strip private flag')
  })
  
  describe('writeSharedGroups', () => {
    it('should create directory structure')
    it('should write group metadata')
    it('should write prompt files')
    it('should handle file conflicts')
    it('should track changes')
  })
})
```

**Estimated Tests:** 20-25 tests  
**Priority:** 🟠 HIGH  
**Effort:** 3-4 hours

---

## Medium Priority Gaps

### 6. 🟡 sync/yamlReader.ts - YAML Reading (161 lines, ~30% coverage)

**Current State:** 1 integration test  
**What's Missing:**
- Error handling tests
- Edge case tests
- Malformed YAML tests
- Performance tests

**Additional Tests Needed:**

```typescript
describe('YAML Reader - Error Handling', () => {
  it('should handle malformed YAML')
  it('should handle missing required fields')
  it('should handle invalid UTF-8')
  it('should handle empty files')
  it('should handle circular references')
  it('should handle large files')
})
```

**Estimated Tests:** 15-20 additional tests  
**Priority:** 🟡 MEDIUM  
**Effort:** 2-3 hours

---

### 7. 🟡 settings.ts - Configuration (47 lines, 0% coverage)

**What to Test:**

```typescript
describe('Settings', () => {
  describe('getSettings', () => {
    it('should read all settings')
    it('should use default values')
    it('should expand tilde in paths')
  })
  
  describe('expandPath', () => {
    it('should expand ~ to home directory')
    it('should handle ~/subdir')
    it('should leave absolute paths unchanged')
  })
  
  describe('onSettingsChanged', () => {
    it('should fire on config change')
    it('should only fire for promptLibrary changes')
  })
})
```

**Estimated Tests:** 10-12 tests  
**Priority:** 🟡 MEDIUM  
**Effort:** 1-2 hours

---

### 8. 🟡 syncOps.ts - Sync Panel (109 lines, 0% coverage)

**What to Test:**

```typescript
describe('SyncOpsPanel', () => {
  describe('message handling', () => {
    it('should handle pullSync')
    it('should handle syncDirectCommit')
    it('should handle syncBranchPR')
    it('should handle importJson')
    it('should handle exportJson')
  })
  
  describe('rendering', () => {
    it('should show banner when no repo')
    it('should disable buttons when no repo')
    it('should display settings')
  })
})
```

**Estimated Tests:** 12-15 tests  
**Priority:** 🟡 MEDIUM  
**Effort:** 2-3 hours

---

## Low Priority Gaps

### 9. 🟢 log.ts - Logging (39 lines, 0% coverage)

**What to Test:**

```typescript
describe('PromptLibraryLog', () => {
  it('should add info entries')
  it('should add warn entries')
  it('should add error entries')
  it('should limit to max entries')
  it('should emit change events')
  it('should clear entries')
})
```

**Estimated Tests:** 6-8 tests  
**Priority:** 🟢 LOW  
**Effort:** 1 hour

---

## Testing Strategy Recommendations

### Phase 1: Critical Foundation (2-3 weeks)
1. ✅ **store.ts** - Core data layer (30-40 tests)
2. ✅ **extension.ts** - Command handlers (50-60 tests)
3. ✅ **groups.ts** - Tree provider (20-25 tests)

**Goal:** 60% coverage of critical paths

### Phase 2: Sync Infrastructure (1-2 weeks)
4. ✅ **sync/git.ts** - Git operations (25-30 tests)
5. ✅ **sync/yamlWriter.ts** - YAML writing (20-25 tests)
6. ✅ **sync/yamlReader.ts** - Complete coverage (15-20 more tests)

**Goal:** 75% coverage including sync

### Phase 3: Polish & Edge Cases (1 week)
7. ✅ **settings.ts** - Configuration (10-12 tests)
8. ✅ **syncOps.ts** - Sync panel (12-15 tests)
9. ✅ **log.ts** - Logging (6-8 tests)
10. ✅ Integration tests for full workflows

**Goal:** 80%+ coverage

---

## Estimated Total Effort

| Phase | Tests | Hours | Priority |
|-------|-------|-------|----------|
| Phase 1 | 100-125 | 15-20 | 🔴 Critical |
| Phase 2 | 60-75 | 9-12 | 🟠 High |
| Phase 3 | 30-40 | 4-6 | 🟡 Medium |
| **TOTAL** | **190-240** | **28-38** | |

**Realistic Timeline:** 4-6 weeks part-time

---

## Quick Wins (Start Here)

If you want to improve coverage quickly, start with these:

1. **log.ts** (1 hour, 6-8 tests) - Simple, high value
2. **settings.ts** (2 hours, 10-12 tests) - Straightforward
3. **sync/yamlReader.ts** (2 hours, 15 more tests) - Build on existing
4. **store.ts basic CRUD** (4 hours, 15-20 tests) - Core functionality

**Total:** 9 hours, ~50 tests, coverage jumps to ~35-40%

---

## Conclusion

**Current State:**
- ✅ Refactored code: 100% tested
- ⚠️ Overall codebase: ~15-20% tested
- ❌ Critical modules: 0% tested

**Recommendation:**
Focus on **Phase 1 (Critical Foundation)** first. Testing store.ts and extension.ts will give you confidence in the core functionality and catch the most critical bugs.

The refactored code is well-tested, but the core business logic needs comprehensive test coverage before production use.

