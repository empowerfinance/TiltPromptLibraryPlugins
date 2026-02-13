// VSCode Git API wrapper - uses VSCode's built-in git instead of spawning processes
import * as vscode from 'vscode';
import { log } from '../log';

export interface GitResult { success: boolean; error?: string; nothingToCommit?: boolean }

let gitExtension: any = null;

async function getGitExtension() {
  if (gitExtension) return gitExtension;

  const ext = vscode.extensions.getExtension('vscode.git');
  if (!ext) {
    throw new Error('VSCode Git extension not found. Please enable the built-in Git extension.');
  }

  if (!ext.isActive) {
    await ext.activate();
  }

  gitExtension = ext.exports;
  return gitExtension;
}

async function getRepository(path: string) {
  const git = await getGitExtension();
  const api = git.getAPI(1);

  log.info(`Looking for repository at: ${path}`);
  log.info(`Available repositories: ${api.repositories.length}`);

  // Try to find existing repository
  for (const repo of api.repositories) {
    log.info(`Checking repo: ${repo.rootUri.fsPath}`);
    if (repo.rootUri.fsPath === path) {
      log.info(`Found matching repository!`);
      return repo;
    }
  }

  // Repository not in workspace - VSCode Git API won't work
  // We need to use git spawning for repos outside the workspace
  log.warn(`Repository ${path} not in VSCode workspace. VSCode Git API only works with workspace repositories.`);
  return null;
}

export async function isGitRepo(path: string): Promise<{ isRepo: boolean; error?: string }> {
  try {
    const repo = await getRepository(path);
    if (!repo) {
      return { isRepo: false, error: `Not a git repository: ${path}` };
    }
    return { isRepo: true };
  } catch (e: any) {
    log.error(`isGitRepo error: ${e.message}`);
    return { isRepo: false, error: e.message };
  }
}

export async function getCurrentBranch(path: string): Promise<string | null> {
  try {
    const repo = await getRepository(path);
    if (!repo) return null;
    return repo.state.HEAD?.name || null;
  } catch (e) {
    return null;
  }
}

export async function stageAll(path: string): Promise<void> {
  const repo = await getRepository(path);
  if (!repo) throw new Error('Not a git repository');

  // Stage all changes
  await repo.add([]);
}

export async function commit(path: string, message: string): Promise<GitResult> {
  try {
    const repo = await getRepository(path);
    if (!repo) {
      return { success: false, error: 'Not a git repository' };
    }

    // Check if there are changes to commit
    if (repo.state.workingTreeChanges.length === 0 && repo.state.indexChanges.length === 0) {
      return { success: true, nothingToCommit: true };
    }

    await repo.commit(message);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: `Commit failed: ${e.message}` };
  }
}

export async function push(path: string, remote = 'origin', branch?: string): Promise<GitResult> {
  try {
    const repo = await getRepository(path);
    if (!repo) {
      return { success: false, error: 'Not a git repository' };
    }

    const remoteName = remote;
    const refspec = branch ? `refs/heads/${branch}` : undefined;

    await repo.push(remoteName, refspec, true); // true = setUpstream
    return { success: true };
  } catch (e: any) {
    return { success: false, error: `Push failed: ${e.message}` };
  }
}

export async function checkoutNewBranch(path: string, branch: string): Promise<GitResult> {
  try {
    const repo = await getRepository(path);
    if (!repo) {
      return { success: false, error: 'Not a git repository' };
    }

    await repo.createBranch(branch, true); // true = checkout
    return { success: true };
  } catch (e: any) {
    return { success: false, error: `Checkout failed: ${e.message}` };
  }
}

export async function checkoutBranch(path: string, branch: string): Promise<GitResult> {
  try {
    const repo = await getRepository(path);
    if (!repo) {
      return { success: false, error: 'Not a git repository' };
    }

    await repo.checkout(branch);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: `Checkout failed: ${e.message}` };
  }
}

export async function getRemoteUrl(path: string, remote = 'origin'): Promise<string | null> {
  try {
    const repo = await getRepository(path);
    if (!repo) return null;

    const remotes = repo.state.remotes;
    const remoteObj = remotes.find((r: any) => r.name === remote);
    return remoteObj?.fetchUrl || remoteObj?.pushUrl || null;
  } catch (e) {
    return null;
  }
}

/**
 * Get the git user name from git config.
 * VSCode Git API doesn't directly expose user.name, so we return null
 * and let the caller fall back to spawn git.
 */
export async function getGitUserName(_path: string): Promise<string | null> {
  // VSCode Git API doesn't expose user.name configuration
  // Return null to signal that caller should use spawn git fallback
  return null;
}

export async function getGitVersion(): Promise<{ version?: string; error?: string }> {
  try {
    const git = await getGitExtension();
    const api = git.getAPI(1);
    // The git object has a path property that points to the git executable
    // We can use this to verify git is available
    if (api.git && api.git.path) {
      return { version: `Git available at: ${api.git.path}` };
    }
    return { version: 'Git extension loaded' };
  } catch (e: any) {
    return { error: e.message };
  }
}

/**
 * Check if the repository has uncommitted changes (staged or unstaged)
 */
export async function isDirty(path: string): Promise<boolean> {
  try {
    const repo = await getRepository(path);
    if (!repo) return false;

    // Check for working tree changes (unstaged) and index changes (staged)
    const hasWorkingTreeChanges = repo.state.workingTreeChanges.length > 0;
    const hasIndexChanges = repo.state.indexChanges.length > 0;
    const hasUntrackedChanges = repo.state.untrackedChanges?.length > 0;

    return hasWorkingTreeChanges || hasIndexChanges || hasUntrackedChanges;
  } catch (e) {
    log.warn(`isDirty error: ${e}`);
    return false;
  }
}

