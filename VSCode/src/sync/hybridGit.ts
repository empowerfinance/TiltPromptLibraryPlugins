// Hybrid Git - uses VSCode API for workspace repos, spawns git for external repos
import * as vscode from 'vscode';
import * as vscodeGit from './vscodeGit';
import * as spawnGit from './git';
import { log } from '../log';

// Check if a path is in the current VSCode workspace
function isInWorkspace(path: string): boolean {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return false;

  for (const folder of workspaceFolders) {
    if (path.startsWith(folder.uri.fsPath)) {
      return true;
    }
  }
  return false;
}

export async function isGitRepo(path: string): Promise<{ isRepo: boolean; error?: string }> {
  if (isInWorkspace(path)) {
    log.info(`Repository ${path} is in workspace, using VSCode Git API`);
    return vscodeGit.isGitRepo(path);
  } else {
    log.info(`Repository ${path} is outside workspace, using git spawn`);
    return spawnGit.isGitRepo(path);
  }
}

export async function getCurrentBranch(path: string): Promise<string | null> {
  if (isInWorkspace(path)) {
    return vscodeGit.getCurrentBranch(path);
  } else {
    return spawnGit.getCurrentBranch(path);
  }
}

export async function stageAll(path: string): Promise<void> {
  if (isInWorkspace(path)) {
    return vscodeGit.stageAll(path);
  } else {
    return spawnGit.stageAll(path);
  }
}

export async function commit(path: string, message: string): Promise<{ success: boolean; error?: string; nothingToCommit?: boolean }> {
  if (isInWorkspace(path)) {
    return vscodeGit.commit(path, message);
  } else {
    return spawnGit.commit(path, message);
  }
}

export async function push(path: string, remote = 'origin', branch?: string): Promise<{ success: boolean; error?: string }> {
  if (isInWorkspace(path)) {
    return vscodeGit.push(path, remote, branch);
  } else {
    return spawnGit.push(path, remote, branch);
  }
}

export async function checkoutNewBranch(path: string, branch: string): Promise<{ success: boolean; error?: string }> {
  if (isInWorkspace(path)) {
    return vscodeGit.checkoutNewBranch(path, branch);
  } else {
    return spawnGit.checkoutNewBranch(path, branch);
  }
}

export async function checkoutBranch(path: string, branch: string): Promise<{ success: boolean; error?: string }> {
  if (isInWorkspace(path)) {
    return vscodeGit.checkoutBranch(path, branch);
  } else {
    return spawnGit.checkoutBranch(path, branch);
  }
}

export async function getRemoteUrl(path: string, remote = 'origin'): Promise<string | null> {
  if (isInWorkspace(path)) {
    return vscodeGit.getRemoteUrl(path, remote);
  } else {
    return spawnGit.getRemoteUrl(path, remote);
  }
}

/**
 * Get the git user name from git config.
 * Always uses spawn git since VSCode Git API doesn't expose user.name.
 */
export async function getGitUserName(path: string): Promise<string | null> {
  // VSCode Git API doesn't expose user.name, so always use spawn git
  return spawnGit.getGitUserName(path);
}

/**
 * Generate a unique branch name using the git user name and a random suffix.
 * Re-exports the spawn git implementation since it's just string manipulation.
 */
export const generateBranchName = spawnGit.generateBranchName;

export async function getGitVersion(): Promise<{ version?: string; error?: string }> {
  // Try VSCode API first
  const vscodeResult = await vscodeGit.getGitVersion();
  if (vscodeResult.version) {
    return vscodeResult;
  }

  // Fall back to spawn
  return spawnGit.getGitVersion();
}

/**
 * Check if the repository has uncommitted changes (staged, unstaged, or untracked)
 */
export async function isDirty(path: string): Promise<boolean> {
  if (isInWorkspace(path)) {
    return vscodeGit.isDirty(path);
  } else {
    return spawnGit.isDirty(path);
  }
}

/**
 * Smart pull that commits local changes first if the repo is dirty.
 * This avoids pull failures due to uncommitted changes.
 *
 * Returns:
 * - { success: true, autoCommitted: false } - clean pull succeeded
 * - { success: true, autoCommitted: true } - local changes were committed, then pull succeeded
 * - { success: false, error: string } - pull failed (conflicts or other issue)
 */
export async function smartPull(
  path: string,
  remote = 'origin',
  branch?: string
): Promise<{ success: boolean; autoCommitted: boolean; error?: string }> {
  try {
    // Step 1: Check if repo is dirty
    const dirty = await isDirty(path);
    let autoCommitted = false;

    if (dirty) {
      log.info('Repository has local changes, committing before pull...');

      // Stage all changes
      await stageAll(path);

      // Commit with auto-message
      const commitResult = await commit(path, 'Auto-commit: Local changes before sync');
      if (!commitResult.success && !commitResult.nothingToCommit) {
        return {
          success: false,
          autoCommitted: false,
          error: `Failed to commit local changes: ${commitResult.error}`
        };
      }

      if (!commitResult.nothingToCommit) {
        autoCommitted = true;
        log.info('Local changes committed successfully');
      }
    }

    // Step 2: Pull with rebase
    const pullSuccess = await spawnGit.pull(path, remote, branch);

    if (pullSuccess) {
      return { success: true, autoCommitted };
    } else {
      return {
        success: false,
        autoCommitted,
        error: 'Pull failed - there may be merge conflicts or the remote is unreachable'
      };
    }
  } catch (e: any) {
    return {
      success: false,
      autoCommitted: false,
      error: `Smart pull error: ${e.message}`
    };
  }
}

