import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

export type WriteStrategy = 'direct' | 'branchPR';

/**
 * Expands tilde (~) in paths to the user's home directory
 */
function expandPath(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

export interface PromptLibrarySettings {
  remoteRepoUrl: string;
  repoPath: string;
  promptsSubdir: string; // default 'prompts'
  branchName: string;
  writeStrategy: WriteStrategy;
  autoFetch: { enabled: boolean; minutes: number };
}

export function getSettings(): PromptLibrarySettings {
  const cfg = vscode.workspace.getConfiguration('promptLibrary');
  const rawRepoPath = cfg.get<string>('repoPath', '');
  return {
    remoteRepoUrl: cfg.get<string>('remoteRepoUrl', ''),
    repoPath: rawRepoPath ? expandPath(rawRepoPath) : '',
    promptsSubdir: cfg.get<string>('promptsSubdir', 'prompts'),
    branchName: cfg.get<string>('branchName', ''),
    writeStrategy: cfg.get<WriteStrategy>('writeStrategy', 'direct'),
    autoFetch: {
      enabled: cfg.get<boolean>('autoFetch.enabled', false),
      minutes: cfg.get<number>('autoFetch.minutes', 5),
    },
  };
}

export function onSettingsChanged(cb: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('promptLibrary')) cb();
  });
}

