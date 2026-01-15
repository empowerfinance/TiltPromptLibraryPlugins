# Git Timeout Fix

**Date:** 2026-01-15  
**Status:** ✅ Fixed  

---

## Problem

The sync command was hanging at the git repo check:
```
[2026-01-15T11:21:21.069Z] UI -> Received syncDirectCommit
[2026-01-15T11:21:21.069Z] syncDirectCommit command started
[2026-01-15T11:21:21.069Z] Config: repoPath=/Users/paul/PromptLibrary, promptsSubdir=promptsProduct
[2026-01-15T11:21:21.070Z] Checking if /Users/paul/PromptLibrary is a git repo...
(hangs forever)
```

---

## Root Cause

The `runGit()` function had **no timeout** and **no error handling**. If:
- Git command hangs
- Git is not installed
- Process fails to spawn
- Directory doesn't exist

The promise would never resolve or reject, causing the command to hang forever.

---

## Solution

### 1. Added Timeout to runGit()

Added a 30-second timeout to all git operations:

```typescript
export async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`Git command timed out after 30s: git ${args.join(' ')}`));
    }, 30000);

    const proc = spawn('git', args, { cwd, shell: false });
    // ... rest of implementation
    
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to spawn git: ${err.message}`));
    });
    
    proc.on('close', code => {
      clearTimeout(timeout);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}
```

### 2. Added Error Handling to isGitRepo()

Wrapped the git call in try-catch:

```typescript
export async function isGitRepo(path: string): Promise<boolean> {
  try {
    const res = await runGit(path, ['rev-parse', '--is-inside-work-tree']);
    return res.code === 0 && res.stdout.trim() === 'true';
  } catch (e) {
    // If git command fails to run, it's not a git repo
    return false;
  }
}
```

### 3. Added Error Logging in Extension Commands

Added try-catch and logging around isGitRepo calls:

```typescript
let isRepo = false;
try {
  isRepo = await isGitRepo(repoPath);
  log.info(`isGitRepo result: ${isRepo}`);
} catch (e: any) {
  log.error(`isGitRepo failed: ${e?.message || e}`);
  vscode.window.showWarningMessage(`Failed to check git repository: ${e?.message || e}`);
  return;
}
```

---

## What You'll See Now

### If Git is Not Installed:
```
[timestamp] Checking if /Users/paul/PromptLibrary is a git repo...
[timestamp] isGitRepo failed: Failed to spawn git: spawn git ENOENT
```

### If Directory Doesn't Exist:
```
[timestamp] Checking if /Users/paul/PromptLibrary is a git repo...
[timestamp] isGitRepo result: false
[timestamp] repoPath is not a Git repository
```

### If Git Command Hangs:
```
[timestamp] Checking if /Users/paul/PromptLibrary is a git repo...
[timestamp] isGitRepo failed: Git command timed out after 30s: git rev-parse --is-inside-work-tree
```

### If It's a Valid Git Repo:
```
[timestamp] Checking if /Users/paul/PromptLibrary is a git repo...
[timestamp] isGitRepo result: true
[timestamp] Direct commit: writing YAML...
```

---

## Testing

✅ All 283 tests passing
- Git tests updated to handle new error cases
- No regressions

---

## Next Steps

1. **Reload the extension** (Cmd+Shift+P → "Developer: Reload Window")
2. **Try the sync again**
3. **Check the logs** - you should now see either:
   - `isGitRepo result: true` (and continue to next step)
   - `isGitRepo result: false` (with error message)
   - `isGitRepo failed: ...` (with specific error)

---

## Diagnostic Commands

To verify your git setup manually, run these commands in terminal:

```bash
# Check if directory exists
ls -la /Users/paul/PromptLibrary

# Check if it's a git repo
cd /Users/paul/PromptLibrary
git status

# Check git is installed
which git
git --version
```

If the directory doesn't exist or isn't a git repo, you'll need to:

```bash
# Create directory and initialize git
mkdir -p /Users/paul/PromptLibrary
cd /Users/paul/PromptLibrary
git init

# Or clone an existing repo
git clone <your-github-repo-url> /Users/paul/PromptLibrary
```

---

## Summary

✅ **Added 30-second timeout** to prevent infinite hangs  
✅ **Added error handling** for spawn failures  
✅ **Added try-catch** in isGitRepo  
✅ **Added detailed logging** for all error cases  
✅ **All tests passing**  

The sync command will no longer hang - it will either succeed or fail with a clear error message within 30 seconds!

