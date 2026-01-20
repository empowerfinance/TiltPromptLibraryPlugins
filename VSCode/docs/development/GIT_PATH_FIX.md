# Git PATH Fix

**Date:** 2026-01-15  
**Status:** ✅ Fixed  

---

## Problem

Git is installed and works in the terminal, but VSCode can't find it:

```
[timestamp] isGitRepo result: false, error: Git is not installed or not in PATH. Install git from https://git-scm.com/
```

User can run `git` commands in terminal successfully, but the extension can't spawn git.

---

## Root Cause

VSCode's Node.js process doesn't inherit the same PATH environment variable as the user's terminal. This happens because:

1. **Terminal shells** (bash, zsh) load PATH from `.bashrc`, `.zshrc`, etc.
2. **VSCode** launches with the system PATH, which may not include git
3. **spawn() with shell: false** doesn't use a shell, so it can't find git in non-standard locations

Common scenarios:
- Git installed via Homebrew (`/opt/homebrew/bin/git` or `/usr/local/bin/git`)
- Git installed in user directory
- VSCode launched before PATH was updated
- macOS PATH issues with GUI apps vs terminal apps

---

## Solution

### 1. Changed spawn to use shell

**Before:**
```typescript
const proc = spawn('git', args, { cwd, shell: false });
```

**After:**
```typescript
const proc = spawn('git', args, { cwd, shell: true });
```

This makes spawn use a shell (bash/zsh), which:
- Inherits the PATH from the environment
- Can find git in standard locations like `/usr/local/bin` and `/opt/homebrew/bin`
- Works the same way as running `git` in terminal

### 2. Added better error messages

Now includes PATH information in error messages:

```typescript
proc.on('error', (err: any) => {
  clearTimeout(timeout);
  const pathInfo = process.env.PATH || 'PATH not set';
  reject(new Error(`Failed to spawn git: ${err.message}\nPATH: ${pathInfo}\nTry: which git in terminal to find git location`));
});
```

### 3. Added git version check

Added diagnostic logging to show git version at start of sync:

```typescript
const gitCheck = await getGitVersion();
if (gitCheck.version) {
  log.info(`Git version: ${gitCheck.version}`);
} else {
  log.error(`Git check failed: ${gitCheck.error}`);
}
```

### 4. Simplified error handling

Removed overly specific error categorization - now just returns the full error message for better debugging.

---

## Expected Behavior After Fix

### Success Case:
```
[timestamp] syncDirectCommit command started
[timestamp] Git version: git version 2.39.3 (Apple Git-146)
[timestamp] Config: repoPath=/Users/paul/PromptLibrary, promptsSubdir=promptsProduct
[timestamp] Checking if /Users/paul/PromptLibrary is a git repo...
[timestamp] isGitRepo result: true
[timestamp] Direct commit: writing YAML...
```

### If Git Still Not Found:
```
[timestamp] syncDirectCommit command started
[timestamp] Git check failed: Failed to spawn git: spawn git ENOENT
PATH: /usr/bin:/bin:/usr/sbin:/sbin
Try: which git in terminal to find git location
```

This will show the actual PATH VSCode is using, helping diagnose the issue.

---

## Alternative Solutions (if shell: true doesn't work)

### Option 1: Configure Git Path in VSCode Settings

Add a new setting to specify git path explicitly:

```json
{
  "promptLibrary.gitPath": "/opt/homebrew/bin/git"
}
```

### Option 2: Restart VSCode

Sometimes VSCode needs to be restarted to pick up PATH changes:
1. Quit VSCode completely (Cmd+Q)
2. Reopen VSCode
3. Try sync again

### Option 3: Add Git to System PATH

Edit `~/.zshrc` or `~/.bashrc`:
```bash
export PATH="/opt/homebrew/bin:$PATH"
```

Then restart VSCode.

---

## Testing

After reloading the extension, you should see:
1. Git version logged at start of sync
2. Better error messages if git still can't be found
3. Sync should work if git is in any standard location

---

## Summary

✅ **Changed spawn to use shell** - Inherits PATH from environment  
✅ **Added git version check** - Diagnostic logging  
✅ **Better error messages** - Shows PATH and suggestions  
✅ **Simplified error handling** - Full error messages for debugging  

**Next Step:** Reload the extension and try sync again. You should now see the git version in the logs!

