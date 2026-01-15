# Test Checklist - Quick Reference

Use this checklist to verify changes haven't broken functionality.

## ✅ Pre-Commit Checklist

Before committing any changes:

- [ ] Run `npm test` - All tests pass
- [ ] Run `npm run compile` - No TypeScript errors
- [ ] Check for new warnings in test output
- [ ] Verify no `console.log` statements left in code
- [ ] Update tests if you changed functionality

## ✅ Refactoring Checklist

When refactoring code:

- [ ] Run tests BEFORE refactoring (establish baseline)
- [ ] Make refactoring changes
- [ ] Run tests AFTER refactoring
- [ ] Verify same number of tests pass
- [ ] No new test failures
- [ ] No changes to test expectations needed (if pure refactor)

## ✅ Adding New Features Checklist

When adding new features:

- [ ] Write tests for new functionality FIRST (TDD)
- [ ] Implement the feature
- [ ] Run tests - New tests pass
- [ ] Run all tests - No regressions
- [ ] Add integration tests if needed
- [ ] Update documentation

## 🧪 Test Commands Quick Reference

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- types.test.ts

# Run tests matching pattern
npm test -- --grep "normalizeText"

# Run with coverage (requires @vitest/coverage-v8)
npm test -- --coverage
```

## 📊 Current Test Coverage

**Total Tests:** 41 tests across 4 files

### Refactored Modules (100% coverage)
- ✅ `types/index.ts` - 22 tests
- ✅ `ui/htmlLoader.ts` - 10 tests
- ✅ HTML templates - 8 integration tests

### Existing Modules (Partial coverage)
- ✅ `sync/yamlReader.ts` - 1 test
- ❌ `extension.ts` - No tests
- ❌ `groups.ts` - No tests
- ❌ `store.ts` - No tests
- ❌ `sync/git.ts` - No tests
- ❌ `sync/yamlWriter.ts` - No tests
- ❌ `syncOps.ts` - No tests

## 🎯 What Each Test File Covers

### types.test.ts (22 tests)
- `normalizeText()` - Text normalization for duplicate detection
- `generateId()` - Unique ID generation
- `truncateText()` - Text truncation for display
- `Constants` - Shared constants validation

### htmlLoader.test.ts (10 tests)
- `getNonce()` - CSP nonce generation
- `generateCSP()` - Content Security Policy generation
- `loadHtmlTemplate()` - Template loading and placeholder replacement

### htmlTemplates.integration.test.ts (8 tests)
- `promptLibraryView.html` - Main webview template
- `syncOpsView.html` - Sync operations panel template
- Template consistency checks

### yamlReader.readRepo.test.ts (1 test)
- Repository reading from YAML files

## 🚨 Common Test Failures

### "Template not found"
**Cause:** HTML templates not copied to `out/ui/`  
**Fix:** Run `npm run compile` (includes copy-html step)

### "Module not found"
**Cause:** Missing imports or incorrect paths  
**Fix:** Check import paths, run `npm run compile`

### "Expected X but got Y"
**Cause:** Logic change broke test expectations  
**Fix:** Update test expectations OR fix the code

### "Timeout"
**Cause:** Async operation taking too long  
**Fix:** Increase timeout or fix slow operation

## 🔍 Debugging Tips

1. **Isolate the test:**
   ```bash
   npm test -- htmlLoader.test.ts
   ```

2. **Add debug output:**
   ```typescript
   console.log('Debug:', value);
   ```

3. **Use VS Code debugger:**
   - Set breakpoint in test file
   - Run "Debug Test" from test file

4. **Check test setup:**
   - Verify `setup.ts` mocks are correct
   - Check for conflicting mocks

## 📈 Success Criteria

**All tests passing:**
```
✓ src/__tests__/htmlTemplates.integration.test.ts (8)
✓ src/__tests__/htmlLoader.test.ts (10)
✓ src/__tests__/types.test.ts (22)
✓ src/__tests__/yamlReader.readRepo.test.ts (1)

Test Files  4 passed (4)
     Tests  41 passed (41)
```

**No TypeScript errors:**
```
> tsc -p ./

(no output = success)
```

## 🎓 When to Run Tests

| Scenario | Command | When |
|----------|---------|------|
| Before commit | `npm test` | Always |
| During development | `npm run test:watch` | Continuous |
| After refactoring | `npm test` | Immediately |
| Before PR | `npm test` | Always |
| After pulling changes | `npm test` | Good practice |
| Before release | `npm test -- --coverage` | Always |

## 📝 Notes

- Tests run in Node environment (not browser)
- VS Code API is mocked in `setup.ts`
- HTML templates must exist in `src/ui/` and be copied to `out/ui/`
- All tests should be deterministic (no random failures)
- Tests should be fast (< 1 second each)

---

**Last Updated:** 2026-01-15  
**Test Framework:** Vitest 1.6.0  
**Total Tests:** 41

