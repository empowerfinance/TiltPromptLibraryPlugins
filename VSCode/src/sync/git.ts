import * as vscode from 'vscode';
import { spawn } from 'child_process';

export interface GitResult { code: number; stdout: string; stderr: string }

export async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export async function isGitRepo(path: string): Promise<boolean> {
  const res = await runGit(path, ['rev-parse', '--is-inside-work-tree']);
  return res.code === 0 && res.stdout.trim() === 'true';
}

export async function getCurrentBranch(path: string): Promise<string | null> {
  const res = await runGit(path, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return res.code === 0 ? res.stdout.trim() : null;
}

export async function stageAll(path: string): Promise<void> {
  await runGit(path, ['add', '-A']);
}

export async function commit(path: string, message: string): Promise<boolean> {
  const res = await runGit(path, ['commit', '-m', message]);
  // If nothing to commit, git returns non-zero with specific message; treat as success with no-op
  if (res.code !== 0 && /nothing to commit/i.test(res.stdout + res.stderr)) return true;
  return res.code === 0;
}

export async function push(path: string, remote = 'origin', branch?: string): Promise<boolean> {
  const args = branch ? ['push', '-u', remote, branch] : ['push'];
  const res = await runGit(path, args);
  return res.code === 0;
}

export async function checkoutNewBranch(path: string, branch: string): Promise<boolean> {
  const res = await runGit(path, ['checkout', '-b', branch]);
  return res.code === 0;
}

export async function getRemoteUrl(path: string, remote = 'origin'): Promise<string | null> {
  const res = await runGit(path, ['remote', 'get-url', remote]);
  if (res.code !== 0) return null;
  return res.stdout.trim();
}

export async function fetch(path: string, remote = 'origin'): Promise<boolean> {
  const res = await runGit(path, ['fetch', remote]);
  return res.code === 0;
}

export async function pull(path: string, remote = 'origin', branch?: string): Promise<boolean> {
  const args = branch ? ['pull', remote, branch] : ['pull'];
  const res = await runGit(path, args);
  return res.code === 0;
}

export function tryBuildGithubCompareUrl(remoteUrl: string, branch: string): vscode.Uri | null {
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
    return vscode.Uri.parse(`https://github.com/${org}/${repo}/compare/${encodeURIComponent(branch)}?expand=1`);
  } catch {
    return null;
  }
}

