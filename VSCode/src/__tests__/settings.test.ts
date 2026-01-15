import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSettings, onSettingsChanged, PromptLibrarySettings } from '../settings';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';

describe('settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return default settings when no config is set', () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue: any) => defaultValue),
        has: vi.fn(),
        inspect: vi.fn(),
        update: vi.fn(),
      };
      
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
      
      const settings = getSettings();
      
      expect(settings).toEqual({
        remoteRepoUrl: '',
        repoPath: '',
        promptsSubdir: 'prompts',
        branchName: '',
        writeStrategy: 'direct',
        autoFetch: {
          enabled: false,
          minutes: 5,
        },
      });
    });

    it('should return custom settings when config is set', () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue: any) => {
          const values: Record<string, any> = {
            'remoteRepoUrl': 'https://github.com/user/repo.git',
            'repoPath': '/custom/path',
            'promptsSubdir': 'my-prompts',
            'branchName': 'feature-branch',
            'writeStrategy': 'branchPR',
            'autoFetch.enabled': true,
            'autoFetch.minutes': 10,
          };
          return values[key] ?? defaultValue;
        }),
        has: vi.fn(),
        inspect: vi.fn(),
        update: vi.fn(),
      };
      
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
      
      const settings = getSettings();
      
      expect(settings).toEqual({
        remoteRepoUrl: 'https://github.com/user/repo.git',
        repoPath: '/custom/path',
        promptsSubdir: 'my-prompts',
        branchName: 'feature-branch',
        writeStrategy: 'branchPR',
        autoFetch: {
          enabled: true,
          minutes: 10,
        },
      });
    });

    it('should expand tilde in repoPath', () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue: any) => {
          if (key === 'repoPath') return '~/my-repo';
          return defaultValue;
        }),
        has: vi.fn(),
        inspect: vi.fn(),
        update: vi.fn(),
      };
      
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
      
      const settings = getSettings();
      
      expect(settings.repoPath).toBe(path.join(os.homedir(), 'my-repo'));
    });

    it('should expand tilde with subdirectory', () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue: any) => {
          if (key === 'repoPath') return '~/projects/my-repo';
          return defaultValue;
        }),
        has: vi.fn(),
        inspect: vi.fn(),
        update: vi.fn(),
      };
      
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
      
      const settings = getSettings();
      
      expect(settings.repoPath).toBe(path.join(os.homedir(), 'projects/my-repo'));
    });

    it('should not expand tilde in middle of path', () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue: any) => {
          if (key === 'repoPath') return '/path/to/~/repo';
          return defaultValue;
        }),
        has: vi.fn(),
        inspect: vi.fn(),
        update: vi.fn(),
      };
      
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
      
      const settings = getSettings();
      
      expect(settings.repoPath).toBe('/path/to/~/repo');
    });

    it('should handle empty repoPath', () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue: any) => {
          if (key === 'repoPath') return '';
          return defaultValue;
        }),
        has: vi.fn(),
        inspect: vi.fn(),
        update: vi.fn(),
      };
      
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
      
      const settings = getSettings();
      
      expect(settings.repoPath).toBe('');
    });

    it('should handle absolute paths without modification', () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue: any) => {
          if (key === 'repoPath') return '/absolute/path/to/repo';
          return defaultValue;
        }),
        has: vi.fn(),
        inspect: vi.fn(),
        update: vi.fn(),
      };
      
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);
      
      const settings = getSettings();
      
      expect(settings.repoPath).toBe('/absolute/path/to/repo');
    });
  });

  describe('onSettingsChanged', () => {
    it('should call callback when promptLibrary config changes', () => {
      const callback = vi.fn();
      const disposable = onSettingsChanged(callback);
      
      // Trigger a config change for promptLibrary
      (vscode.workspace as any)._triggerConfigChange(['promptLibrary']);
      
      expect(callback).toHaveBeenCalledTimes(1);
      
      disposable.dispose();
    });

    it('should not call callback when other config changes', () => {
      const callback = vi.fn();
      const disposable = onSettingsChanged(callback);
      
      // Trigger a config change for a different section
      (vscode.workspace as any)._triggerConfigChange(['editor']);
      
      expect(callback).not.toHaveBeenCalled();
      
      disposable.dispose();
    });

    it('should call callback multiple times for multiple changes', () => {
      const callback = vi.fn();
      const disposable = onSettingsChanged(callback);
      
      (vscode.workspace as any)._triggerConfigChange(['promptLibrary']);
      (vscode.workspace as any)._triggerConfigChange(['promptLibrary']);
      (vscode.workspace as any)._triggerConfigChange(['promptLibrary']);
      
      expect(callback).toHaveBeenCalledTimes(3);
      
      disposable.dispose();
    });

    it('should not call callback after disposal', () => {
      const callback = vi.fn();
      const disposable = onSettingsChanged(callback);
      
      disposable.dispose();
      
      (vscode.workspace as any)._triggerConfigChange(['promptLibrary']);
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should return a disposable', () => {
      const callback = vi.fn();
      const disposable = onSettingsChanged(callback);
      
      expect(disposable).toHaveProperty('dispose');
      expect(typeof disposable.dispose).toBe('function');
      
      disposable.dispose();
    });
  });
});

