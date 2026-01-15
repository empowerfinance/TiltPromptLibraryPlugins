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

export async function getRemoteUrl(path: string, remote = 'origin'): Promise<string | null> {
  if (isInWorkspace(path)) {
    return vscodeGit.getRemoteUrl(path, remote);
  } else {
    return spawnGit.getRemoteUrl(path, remote);
  }
}

export async function getGitVersion(): Promise<{ version?: string; error?: string }> {
  // Try VSCode API first
  const vscodeResult = await vscodeGit.getGitVersion();
  if (vscodeResult.version) {
    return vscodeResult;
  }
  
  // Fall back to spawn
  return spawnGit.getGitVersion();
}

