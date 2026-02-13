import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface GitResult { code: number; stdout: string; stderr: string }

// Try to find git executable
function getGitPath(): string {
  // Common git locations
  const commonPaths = [
    '/usr/bin/git',
    '/usr/local/bin/git',
    '/opt/homebrew/bin/git',
    'git' // fallback to PATH
  ];

  // On macOS/Linux, try common locations first
  if (process.platform !== 'win32') {
    for (const gitPath of commonPaths) {
      if (gitPath !== 'git') {
        try {
          if (fs.existsSync(gitPath)) {
            return gitPath;
          }
        } catch (e) {
          // Continue to next path
        }
      }
    }
  }

  return 'git'; // fallback
}

export async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`Git command timed out after 30s: git ${args.join(' ')}`));
    }, 30000);

    const gitPath = getGitPath();
    console.log(`[git] Running: ${gitPath} ${args.join(' ')} in ${cwd}`);
    const proc = spawn(gitPath, args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', d => stdout += d.toString());
    proc.stderr?.on('data', d => stderr += d.toString());

    proc.on('error', (err: any) => {
      clearTimeout(timeout);
      const pathInfo = process.env.PATH || 'PATH not set';
      reject(new Error(`Failed to spawn git: ${err.message}\nPATH: ${pathInfo}\nTry: which git in terminal to find git location`));
    });

    proc.on('close', code => {
      clearTimeout(timeout);
      console.log(`[git] Result: code=${code}, stdout="${stdout.trim()}", stderr="${stderr.trim()}"`);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export async function isGitRepo(path: string): Promise<{ isRepo: boolean; error?: string }> {
  try {
    const res = await runGit(path, ['rev-parse', '--is-inside-work-tree']);
    const isRepo = res.code === 0 && res.stdout.trim() === 'true';
    if (!isRepo && res.stderr) {
      // Git ran but directory is not a repo
      return { isRepo: false, error: `Not a git repository: ${res.stderr.trim()}` };
    }
    return { isRepo };
  } catch (e: any) {
    // Git command failed to run - return the full error message for debugging
    return { isRepo: false, error: e.message };
  }
}

export async function getGitVersion(): Promise<{ version?: string; error?: string }> {
  try {
    const res = await runGit(process.cwd(), ['--version']);
    if (res.code === 0) {
      return { version: res.stdout.trim() };
    }
    return { error: `Git returned code ${res.code}: ${res.stderr}` };
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function getCurrentBranch(path: string): Promise<string | null> {
  const res = await runGit(path, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return res.code === 0 ? res.stdout.trim() : null;
}

export async function stageAll(path: string): Promise<void> {
  await runGit(path, ['add', '-A']);
}

export async function commit(path: string, message: string): Promise<{ success: boolean; error?: string; nothingToCommit?: boolean }> {
  const res = await runGit(path, ['commit', '-m', message]);
  // If nothing to commit, git returns non-zero with specific message; treat as success with no-op
  if (res.code !== 0 && /nothing to commit/i.test(res.stdout + res.stderr)) {
    return { success: true, nothingToCommit: true };
  }
  if (res.code === 0) {
    return { success: true };
  } else {
    return { success: false, error: `Git commit failed (code ${res.code}): ${res.stderr || res.stdout}` };
  }
}

export async function push(path: string, remote = 'origin', branch?: string): Promise<{ success: boolean; error?: string }> {
  const args = branch ? ['push', '-u', remote, branch] : ['push'];
  const res = await runGit(path, args);
  if (res.code === 0) {
    return { success: true };
  } else {
    return { success: false, error: `Git push failed (code ${res.code}): ${res.stderr || res.stdout}` };
  }
}

export async function checkoutNewBranch(path: string, branch: string): Promise<{ success: boolean; error?: string }> {
  const res = await runGit(path, ['checkout', '-b', branch]);
  if (res.code === 0) {
    return { success: true };
  } else {
    return { success: false, error: `Git checkout failed (code ${res.code}): ${res.stderr || res.stdout}` };
  }
}

export async function checkoutBranch(path: string, branch: string): Promise<{ success: boolean; error?: string }> {
  const res = await runGit(path, ['checkout', branch]);
  if (res.code === 0) {
    return { success: true };
  } else {
    return { success: false, error: `Git checkout failed (code ${res.code}): ${res.stderr || res.stdout}` };
  }
}

export async function getRemoteUrl(path: string, remote = 'origin'): Promise<string | null> {
  const res = await runGit(path, ['remote', 'get-url', remote]);
  if (res.code !== 0) return null;
  return res.stdout.trim();
}

/**
 * Get the git user name from git config.
 * Returns the user.name if configured, or null if not set.
 */
export async function getGitUserName(path: string): Promise<string | null> {
  const res = await runGit(path, ['config', 'user.name']);
  if (res.code !== 0) return null;
  return res.stdout.trim() || null;
}

/**
 * Generate a unique branch name using the git user name and a random suffix.
 * Format: prompt-sync/{user-name}-{random6chars}
 * Falls back to timestamp if user name is not available.
 */
export function generateBranchName(userName: string | null): string {
  const randomSuffix = Math.random().toString(36).substring(2, 8); // 6 random chars

  if (userName && userName.trim()) {
    // Sanitize the user name for git branch naming:
    // - Convert to lowercase
    // - Replace spaces and special chars with hyphens
    // - Remove consecutive hyphens
    // - Trim hyphens from start/end
    const sanitized = userName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    if (sanitized) {
      return `prompt-sync/${sanitized}-${randomSuffix}`;
    }
  }

  // Fallback to timestamp if no valid user name
  const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  return `prompt-sync/${timestamp}-${randomSuffix}`;
}

export async function clone(baseDir: string, remoteUrl: string, targetDirName?: string): Promise<{ success: boolean; error?: string }> {
  const args = targetDirName ? ['clone', remoteUrl, targetDirName] : ['clone', remoteUrl];
  console.log(`[git.clone] Cloning ${remoteUrl} to ${baseDir}/${targetDirName || ''}`);
  const res = await runGit(baseDir, args);
  console.log(`[git.clone] Clone result: code=${res.code}, stderr="${res.stderr.substring(0, 200)}"`);

  if (res.code === 0) {
    // Verify the clone actually created a .git directory
    const targetPath = targetDirName ? path.join(baseDir, targetDirName) : baseDir;
    const gitPath = path.join(targetPath, '.git');

    if (fs.existsSync(gitPath)) {
      console.log(`[git.clone] Verified .git exists at: ${gitPath}`);
      return { success: true };
    } else {
      console.error(`[git.clone] Clone reported success but .git not found at: ${gitPath}`);
      return { success: false, error: `Clone completed but .git directory not found at ${gitPath}` };
    }
  } else {
    return { success: false, error: `Git clone failed (code ${res.code}): ${res.stderr || res.stdout}` };
  }
}


export async function fetch(path: string, remote = 'origin'): Promise<boolean> {
  const res = await runGit(path, ['fetch', remote]);
  return res.code === 0;
}

export async function pull(path: string, remote = 'origin', branch?: string): Promise<boolean> {
  const args = branch ? ['pull', '--rebase', remote, branch] : ['pull', '--rebase'];
  const res = await runGit(path, args);
  return res.code === 0;
}

export async function resetHardToRemote(path: string, remote = 'origin', branch?: string): Promise<boolean> {
  let target = branch;
  if (!target) {
    const cur = await getCurrentBranch(path);
    if (!cur) return false;
    target = cur;
  }
  const okFetch = await fetch(path, remote);
  if (!okFetch) return false;
  const res = await runGit(path, ['reset', '--hard', `${remote}/${target}`]);
  return res.code === 0;
}

export async function cleanUntracked(path: string): Promise<boolean> {
  const res = await runGit(path, ['clean', '-fd']);
  return res.code === 0;
}

/**
 * Check if the repository has uncommitted changes (staged, unstaged, or untracked)
 */
export async function isDirty(path: string): Promise<boolean> {
  // git status --porcelain returns non-empty output if there are changes
  const res = await runGit(path, ['status', '--porcelain']);
  if (res.code !== 0) return false;
  return res.stdout.trim().length > 0;
}

export function tryBuildGithubCompareUrl(remoteUrl: string, branch: string, title?: string): vscode.Uri | null {
  // Supports https://github.com/org/repo.git and git@github.com:org/repo.git
  try {
    let org = '';
    let repo = '';
    if (remoteUrl.startsWith('git@github.com:')) {
      const rest = remoteUrl.replace('git@github.com:', '');
      const parts = rest.replace(/\.git$/, '').split('/');
      org = parts[0]; repo = parts[1];
    } else if (remoteUrl.startsWith('https://github.com/')) {
      const u = new URL(remoteUrl);
      const parts = u.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
      org = parts[0]; repo = parts[1];
    } else {
      return null;
    }
    let url = `https://github.com/${org}/${repo}/compare/${encodeURIComponent(branch)}?expand=1`;
    if (title) {
      url += `&title=${encodeURIComponent(title)}`;
    }
    return vscode.Uri.parse(url);
  } catch {
    return null;
  }
}

