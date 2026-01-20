# Testing Guide - VS Code Prompt Library Extension

## Overview

This guide explains how to run tests and verify that changes haven't broken functionality.

## Quick Start

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run specific test file
npm test -- htmlLoader.test.ts

# Run tests with coverage (requires @vitest/coverage-v8)
npm test -- --coverage
```

## Test Structure

```
VSCode/src/__tests__/
├── setup.ts                              # Global test setup and VS Code mocks
├── types.test.ts                         # Tests for types/index.ts
├── htmlLoader.test.ts                    # Tests for ui/htmlLoader.ts
├── htmlTemplates.integration.test.ts     # Integration tests for HTML templates
└── yamlReader.readRepo.test.ts          # Tests for YAML reader
```

## Test Coverage

### Current Test Files (4 files, 41 tests)

1. **types.test.ts** (22 tests)
   - ✅ `normalizeText()` - 6 tests
   - ✅ `generateId()` - 4 tests
   - ✅ `truncateText()` - 7 tests
   - ✅ `Constants` - 5 tests

2. **htmlLoader.test.ts** (10 tests)
   - ✅ `getNonce()` - 4 tests
   - ✅ `generateCSP()` - 2 tests
   - ✅ `loadHtmlTemplate()` - 4 tests

3. **htmlTemplates.integration.test.ts** (8 tests)
   - ✅ `promptLibraryView.html` - 3 tests
   - ✅ `syncOpsView.html` - 3 tests
   - ✅ Template consistency - 2 tests

4. **yamlReader.readRepo.test.ts** (1 test)
   - ✅ Repository reading - 1 test

### What's Tested

✅ **Refactored Code (New)**
- HTML template loading and placeholder replacement
- Nonce generation for CSP
- CSP meta tag generation
- Type helper functions (normalize, generate, truncate)
- Constants validation
- Integration: Real HTML templates load correctly

✅ **Existing Code**
- YAML repository reading

### What's NOT Tested Yet

❌ **Core Extension Logic**
- Command handlers in `extension.ts`
- Group tree provider (`groups.ts`)
- Library store (`store.ts`)
- Settings management (`settings.ts`)
- Git operations (`sync/git.ts`)
- YAML writer (`sync/yamlWriter.ts`)
- Sync operations panel (`syncOps.ts`)

## Test Configuration

### vitest.config.ts

```typescript
{
  environment: 'node',
  include: ['src/__tests__/**/*.test.ts'],
  globals: true,
  setupFiles: ['./src/__tests__/setup.ts'],
  coverage: {
    provider: 'v8',
    thresholds: { lines: 60, functions: 60, branches: 60, statements: 60 }
  }
}
```

### VS Code API Mocking

The `setup.ts` file provides mocks for:
- `vscode.Uri` - File path handling
- `vscode.workspace.fs` - File system operations
- `vscode.window` - UI interactions
- `vscode.commands` - Command registration
- `vscode.Webview` - Webview API

## Writing New Tests

### Example: Testing a New Function

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../myModule';

describe('myModule', () => {
  describe('myFunction', () => {
    it('should do something', () => {
      const result = myFunction('input');
      expect(result).toBe('expected output');
    });

    it('should handle edge cases', () => {
      expect(myFunction('')).toBe('');
      expect(myFunction(null)).toThrow();
    });
  });
});
```

### Example: Testing with VS Code API

```typescript
import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';

describe('myExtensionFunction', () => {
  it('should show a message', async () => {
    const spy = vi.spyOn(vscode.window, 'showInformationMessage');
    
    await myExtensionFunction();
    
    expect(spy).toHaveBeenCalledWith('Expected message');
  });
});
```

## Continuous Testing Workflow

### During Development

1. **Start watch mode**: `npm run test:watch`
2. Make code changes
3. Tests automatically re-run
4. Fix any failures immediately

### Before Committing

1. **Run all tests**: `npm test`
2. **Verify all pass**: Check for ✅ green output
3. **Check coverage** (optional): `npm test -- --coverage`
4. **Commit only if tests pass**

### Before Refactoring

1. **Run tests to establish baseline**: `npm test`
2. **Make refactoring changes**
3. **Run tests again**: `npm test`
4. **Verify same tests still pass** (no regressions)

## Test Results Interpretation

### ✅ Success Output
```
✓ src/__tests__/types.test.ts (22)
✓ src/__tests__/htmlLoader.test.ts (10)

Test Files  4 passed (4)
     Tests  41 passed (41)
```

### ❌ Failure Output
```
✓ src/__tests__/types.test.ts (22)
✗ src/__tests__/htmlLoader.test.ts (10)
  ✗ getNonce > should generate unique nonces
    Expected: not "abc123"
    Received: "abc123"

Test Files  1 failed | 3 passed (4)
     Tests  1 failed | 40 passed (41)
```

## Debugging Failed Tests

1. **Read the error message** - Shows expected vs actual
2. **Check the test file** - Line number in error
3. **Run single test**: `npm test -- htmlLoader.test.ts`
4. **Add console.log** in test or source code
5. **Use debugger** - Set breakpoints in VS Code

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run tests
  run: npm test
  
- name: Check coverage
  run: npm test -- --coverage --reporter=json
```

## Next Steps

To improve test coverage:

1. Add tests for `groups.ts` (tree provider)
2. Add tests for `store.ts` (library operations)
3. Add tests for `sync/git.ts` (Git operations)
4. Add tests for `sync/yamlWriter.ts` (YAML writing)
5. Add integration tests for full workflows
6. Add E2E tests with VS Code extension host

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

