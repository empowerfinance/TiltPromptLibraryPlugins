import * as vscode from 'vscode';

export type WriteStrategy = 'direct' | 'branchPR';

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
  return {
    remoteRepoUrl: cfg.get<string>('remoteRepoUrl', ''),
    repoPath: cfg.get<string>('repoPath', ''),
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

