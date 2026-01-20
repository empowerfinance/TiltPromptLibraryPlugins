# Debugging Sync Issues

**Date:** 2026-01-15  
**Status:** Enhanced logging added  

---

## Problem

When clicking "Sync to Github: Direct Commit", only one log message appears:
```
[2026-01-15T11:14:48.210Z] UI -> Received syncDirectCommit
```

Nothing else happens and the library does not sync to GitHub.

---

## What We Added

### Enhanced Logging in syncDirectCommit

Added detailed logging at every step of the sync process:

```typescript
log.info('syncDirectCommit command started');
log.info(`Config: repoPath=${cfg.repoPath}, promptsSubdir=${cfg.promptsSubdir}`);
log.info(`Checking if ${repoPath} is a git repo...`);
log.info(`isGitRepo result: ${isRepo}`);
log.info('Direct commit: writing YAML...');
log.info(`Found shared root with ${sharedRoot.children.length} children`);
log.info(`Write result: added=${result.added}, updated=${result.updated}, deleted=${result.deleted}`);
log.info('Staged all changes');
log.info(`Committing with message: ${msg}`);
log.info(`Commit result: success=${commitResult.success}, nothingToCommit=${commitResult.nothingToCommit}`);
log.info('Pushing to remote...');
log.info(`Push result: success=${pushResult.success}`);
```

### Enhanced Logging in syncBranchPR

Similar detailed logging for the Branch + PR workflow.

---

## How to Debug

### Step 1: Reload the Extension

After the code changes, you need to reload the extension:
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type "Developer: Reload Window"
3. Press Enter

### Step 2: Open Sync Ops Panel

1. Open the Sync Ops panel in VSCode
2. Check your settings are configured:
   - `promptLibrary.repoPath` - Path to your git repository
   - `promptLibrary.promptsSubdir` - Subdirectory for prompts (optional)

### Step 3: Try Sync Again

Click "Sync to Github: Direct Commit" and watch the logs.

### Step 4: Check the Logs

You should now see detailed logs showing exactly where the process stops:

**Expected log sequence:**
```
[timestamp] UI -> Received syncDirectCommit
[timestamp] syncDirectCommit command started
[timestamp] Config: repoPath=/path/to/repo, promptsSubdir=prompts
[timestamp] Checking if /path/to/repo is a git repo...
[timestamp] isGitRepo result: true
[timestamp] Direct commit: writing YAML...
[timestamp] Found shared root with X children
[timestamp] Write result: added=X, updated=X, deleted=X
[timestamp] Staged all changes
[timestamp] Committing with message: Prompt Library sync: +X/~X/-X
[timestamp] Commit result: success=true, nothingToCommit=false
[timestamp] Pushing to remote...
[timestamp] Push result: success=true
[timestamp] Direct commit: pushed successfully.
```

---

## Common Issues to Check

### Issue 1: Command Not Starting
**Symptom:** Only see "UI -> Received syncDirectCommit", nothing after  
**Possible Causes:**
- Extension not reloaded after code changes
- Command registration failed
- VSCode command execution error

**Solution:**
- Reload the extension window
- Check VSCode Developer Console for errors (Help > Toggle Developer Tools)

### Issue 2: No repoPath Configured
**Symptom:** Log shows "No repoPath configured"  
**Solution:**
- Open VSCode settings (Cmd+,)
- Search for "promptLibrary.repoPath"
- Set it to the path of your git repository

### Issue 3: Not a Git Repository
**Symptom:** Log shows "isGitRepo result: false"  
**Solution:**
- Verify the path points to a valid git repository
- Run `git status` in that directory to confirm
- Initialize git if needed: `git init`

### Issue 4: No Shared Root
**Symptom:** Log shows "Shared root not found"  
**Solution:**
- This indicates a problem with the library structure
- Check if you have any shared prompts/groups
- The library should have a 'root-shared' group

### Issue 5: Nothing to Commit
**Symptom:** Log shows "nothingToCommit=true"  
**Solution:**
- This is normal if there are no changes
- Make some changes to your shared prompts first
- Try again

### Issue 6: Commit Failed
**Symptom:** Log shows "Commit result: success=false"  
**Solution:**
- Check the error message in the log
- Common issues:
  - Git user.name/user.email not configured
  - File permissions
  - Git repository in bad state

### Issue 7: Push Failed
**Symptom:** Log shows "Push result: success=false"  
**Solution:**
- Check the detailed error message (now included!)
- Common issues:
  - Authentication failure (SSH keys, tokens)
  - No upstream branch configured
  - Network issues
  - Permission denied
  - Remote repository doesn't exist

---

## Next Steps

1. **Reload the extension** to get the new logging
2. **Try the sync operation** again
3. **Share the complete log output** so we can see exactly where it's failing
4. **Check for error messages** in both the Sync Ops panel and VSCode notifications

---

## Testing

All 283 tests still pass after adding the enhanced logging.

The logging is production-safe and will help diagnose issues without exposing sensitive information.

