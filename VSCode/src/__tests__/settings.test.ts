import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSettings,
  onSettingsChanged,
  PromptLibrarySettings,
  getRepoConfig,
  getActiveLibrary,
  getEnabledLibraries,
  getLibraryPath,
  discoverLibraries,
  DEFAULT_LIBRARY_NAME,
  LibraryConfig,
  RepoConfig,
  toPascalCase
} from '../settings';
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
        promptsSubdir: 'general',
        hiddenLibraries: [],
        branchName: '',
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
            'hiddenLibraries': ['archived', 'deprecated'],
            'branchName': 'feature-branch',
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
        hiddenLibraries: ['archived', 'deprecated'],
        branchName: 'feature-branch',
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

  describe('DEFAULT_LIBRARY_NAME', () => {
    it('should be "general"', () => {
      expect(DEFAULT_LIBRARY_NAME).toBe('general');
    });
  });

  describe('getRepoConfig', () => {
    it('should convert settings to RepoConfig format with discovered libraries', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-config-test-'));

      try {
        // Create a library with _library.yaml
        const platformDir = path.join(tmpDir, 'platform');
        fs.mkdirSync(platformDir, { recursive: true });
        fs.writeFileSync(path.join(platformDir, '_library.yaml'), 'name: Platform\n');

        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            const values: Record<string, any> = {
              'remoteRepoUrl': 'https://github.com/user/repo.git',
              'repoPath': tmpDir,
              'promptsSubdir': 'platform',
              'branchName': 'main',
              'hiddenLibraries': [],
              'autoFetch.enabled': false,
              'autoFetch.minutes': 5,
            };
            return values[key] ?? defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };

        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const repoConfig = getRepoConfig();

        expect(repoConfig.url).toBe('https://github.com/user/repo.git');
        expect(repoConfig.localPath).toBe(tmpDir);
        expect(repoConfig.branch).toBe('main');
        expect(repoConfig.libraries).toHaveLength(1);
        expect(repoConfig.libraries[0].id).toBe('platform');
        expect(repoConfig.libraries[0].path).toBe('platform');
        expect(repoConfig.libraries[0].displayName).toBe('platform');
        expect(repoConfig.libraries[0].enabled).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should return empty libraries when no _library.yaml files exist', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-config-test-'));

      try {
        // Empty repo with no library folders
        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            const values: Record<string, any> = {
              'remoteRepoUrl': '',
              'repoPath': tmpDir,
              'promptsSubdir': '',
              'branchName': '',
            };
            return values[key] ?? defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };

        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const repoConfig = getRepoConfig();

        // Should return empty array when no libraries on disk
        expect(repoConfig.libraries).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should display hyphenated library names as-is', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-config-test-'));

      try {
        // Create a library with hyphenated name
        const libDir = path.join(tmpDir, 'my-custom-library');
        fs.mkdirSync(libDir, { recursive: true });
        fs.writeFileSync(path.join(libDir, '_library.yaml'), 'name: My Custom Library\n');

        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            const values: Record<string, any> = {
              'repoPath': tmpDir,
              'promptsSubdir': 'my-custom-library',
            };
            return values[key] ?? defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };

        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const repoConfig = getRepoConfig();

        // Display name should exactly match folder name on disk
        expect(repoConfig.libraries[0].displayName).toBe('my-custom-library');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should display underscored library names as-is', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-config-test-'));

      try {
        // Create a library with underscored name
        const libDir = path.join(tmpDir, 'data_science_prompts');
        fs.mkdirSync(libDir, { recursive: true });
        fs.writeFileSync(path.join(libDir, '_library.yaml'), 'name: Data Science Prompts\n');

        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            const values: Record<string, any> = {
              'repoPath': tmpDir,
              'promptsSubdir': 'data_science_prompts',
            };
            return values[key] ?? defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };

        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const repoConfig = getRepoConfig();

        // Display name should exactly match folder name on disk
        expect(repoConfig.libraries[0].displayName).toBe('data_science_prompts');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('getActiveLibrary', () => {
    it('should return the first enabled library', () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue: any) => {
          if (key === 'promptsSubdir') return 'analytics';
          return defaultValue;
        }),
        has: vi.fn(),
        inspect: vi.fn(),
        update: vi.fn(),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

      const activeLibrary = getActiveLibrary();

      expect(activeLibrary.id).toBe('analytics');
      expect(activeLibrary.path).toBe('analytics');
      expect(activeLibrary.enabled).toBe(true);
    });

    it('should return default library when none configured', () => {
      const mockConfig = {
        get: vi.fn((key: string, defaultValue: any) => defaultValue),
        has: vi.fn(),
        inspect: vi.fn(),
        update: vi.fn(),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

      const activeLibrary = getActiveLibrary();

      expect(activeLibrary.id).toBe('general');
      expect(activeLibrary.displayName).toBe('general'); // Display as folder name
    });
  });

  describe('getEnabledLibraries', () => {
    it('should return all enabled libraries', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enabled-libs-test-'));

      try {
        // Create a library with _library.yaml
        const platformDir = path.join(tmpDir, 'platform');
        fs.mkdirSync(platformDir, { recursive: true });
        fs.writeFileSync(path.join(platformDir, '_library.yaml'), 'name: Platform\n');

        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            const values: Record<string, any> = {
              'repoPath': tmpDir,
              'promptsSubdir': 'platform',
              'hiddenLibraries': [],
            };
            return values[key] ?? defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };

        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const libraries = getEnabledLibraries();

        expect(libraries).toHaveLength(1);
        expect(libraries[0].id).toBe('platform');
        expect(libraries[0].enabled).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('getLibraryPath', () => {
    it('should join repo path with library path', () => {
      const library: LibraryConfig = {
        id: 'platform',
        path: 'platform',
        displayName: 'Platform',
        enabled: true,
      };

      const libraryPath = getLibraryPath('/home/user/repo', library);

      expect(libraryPath).toBe(path.join('/home/user/repo', 'platform'));
    });

    it('should handle nested library paths', () => {
      const library: LibraryConfig = {
        id: 'analytics-reports',
        path: 'analytics/reports',
        displayName: 'Analytics Reports',
        enabled: true,
      };

      const libraryPath = getLibraryPath('/home/user/repo', library);

      expect(libraryPath).toBe(path.join('/home/user/repo', 'analytics/reports'));
    });

    it('should handle empty repo path', () => {
      const library: LibraryConfig = {
        id: 'general',
        path: 'general',
        displayName: 'General',
        enabled: true,
      };

      const libraryPath = getLibraryPath('', library);

      expect(libraryPath).toBe('general');
    });
  });

  describe('discoverLibraries', () => {
    it('should return empty array for non-existent repo path', () => {
      const libraries = discoverLibraries('/non/existent/path');

      expect(libraries).toEqual([]);
    });

    it('should return empty array for empty repo path', () => {
      const libraries = discoverLibraries('');

      expect(libraries).toEqual([]);
    });

    it('should discover libraries with _library.yaml at library root', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-'));

      try {
        // Create library structure: repoRoot/libraryName/_library.yaml
        const lib1Path = path.join(tmpDir, 'general');
        const lib2Path = path.join(tmpDir, 'platform');

        fs.mkdirSync(lib1Path, { recursive: true });
        fs.mkdirSync(lib2Path, { recursive: true });

        fs.writeFileSync(path.join(lib1Path, '_library.yaml'), 'name: General\n');
        fs.writeFileSync(path.join(lib2Path, '_library.yaml'), 'name: Platform\n');

        const libraries = discoverLibraries(tmpDir);

        expect(libraries).toHaveLength(2);
        expect(libraries.map(l => l.id)).toContain('general');
        expect(libraries.map(l => l.id)).toContain('platform');
        expect(libraries.every(l => l.enabled)).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should not discover directories without _library.yaml', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-'));

      try {
        // Create directory without _library.yaml
        const emptyDir = path.join(tmpDir, 'empty-library');
        const validLib = path.join(tmpDir, 'valid-library');

        fs.mkdirSync(emptyDir, { recursive: true });
        fs.mkdirSync(validLib, { recursive: true });
        fs.writeFileSync(path.join(validLib, '_library.yaml'), 'name: Valid Library\n');

        const libraries = discoverLibraries(tmpDir);

        expect(libraries).toHaveLength(1);
        expect(libraries[0].id).toBe('valid-library');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should return empty array when no libraries found', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-'));

      try {
        // Create empty directory (no _library.yaml files)
        const libraries = discoverLibraries(tmpDir);

        // Should return empty array, not a default "general" library
        expect(libraries).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should preserve camelCase library names in displayName', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-'));

      try {
        // Create library with camelCase name
        const libPath = path.join(tmpDir, 'promptsProduct');
        fs.mkdirSync(libPath, { recursive: true });
        fs.writeFileSync(path.join(libPath, '_library.yaml'), 'name: Prompts Product\n');

        const libraries = discoverLibraries(tmpDir);

        expect(libraries).toHaveLength(1);
        expect(libraries[0].id).toBe('promptsProduct');
        // Display name should be exactly the folder name on disk
        expect(libraries[0].displayName).toBe('promptsProduct');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should ignore hidden directories', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-'));

      try {
        // Create hidden library directory
        const hiddenLib = path.join(tmpDir, '.hidden-library');
        const visibleLib = path.join(tmpDir, 'visible-library');

        fs.mkdirSync(hiddenLib, { recursive: true });
        fs.mkdirSync(visibleLib, { recursive: true });
        fs.writeFileSync(path.join(hiddenLib, '_library.yaml'), 'name: Hidden\n');
        fs.writeFileSync(path.join(visibleLib, '_library.yaml'), 'name: Visible\n');

        const libraries = discoverLibraries(tmpDir);

        expect(libraries).toHaveLength(1);
        expect(libraries[0].id).toBe('visible-library');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should ignore node_modules directory', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-'));

      try {
        // Create node_modules with library-like structure
        const nodeModulesLib = path.join(tmpDir, 'node_modules');
        const visibleLib = path.join(tmpDir, 'visible-library');

        fs.mkdirSync(nodeModulesLib, { recursive: true });
        fs.mkdirSync(visibleLib, { recursive: true });
        fs.writeFileSync(path.join(nodeModulesLib, '_library.yaml'), 'name: Node Modules\n');
        fs.writeFileSync(path.join(visibleLib, '_library.yaml'), 'name: Visible\n');

        const libraries = discoverLibraries(tmpDir);

        expect(libraries).toHaveLength(1);
        expect(libraries[0].id).toBe('visible-library');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('displayName (folder name as-is)', () => {
    it('should display folder name as-is for hyphenated names', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'displayname-test-'));
      const libPath = path.join(tmpDir, 'my-custom-library');
      fs.mkdirSync(libPath, { recursive: true });
      fs.writeFileSync(path.join(libPath, '_library.yaml'), 'name: my-custom-library\n');

      try {
        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            if (key === 'repoPath') return tmpDir;
            if (key === 'promptsSubdir') return 'my-custom-library';
            if (key === 'hiddenLibraries') return [];
            return defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };

        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const repoConfig = getRepoConfig();

        // Display name should exactly match folder name on disk
        expect(repoConfig.libraries[0].displayName).toBe('my-custom-library');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should display folder name as-is for camelCase', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'displayname-test-'));
      const libPath = path.join(tmpDir, 'promptsProduct');
      fs.mkdirSync(libPath, { recursive: true });
      fs.writeFileSync(path.join(libPath, '_library.yaml'), 'name: promptsProduct\n');

      try {
        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            if (key === 'repoPath') return tmpDir;
            if (key === 'promptsSubdir') return 'promptsProduct';
            if (key === 'hiddenLibraries') return [];
            return defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };

        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const repoConfig = getRepoConfig();

        // Display name should exactly match folder name on disk
        expect(repoConfig.libraries[0].displayName).toBe('promptsProduct');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should display folder name as-is for underscore names', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'displayname-test-'));
      const libPath = path.join(tmpDir, 'prompts_product');
      fs.mkdirSync(libPath, { recursive: true });
      fs.writeFileSync(path.join(libPath, '_library.yaml'), 'name: prompts_product\n');

      try {
        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            if (key === 'repoPath') return tmpDir;
            if (key === 'promptsSubdir') return 'prompts_product';
            if (key === 'hiddenLibraries') return [];
            return defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };

        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const repoConfig = getRepoConfig();

        // Display name should exactly match folder name on disk
        expect(repoConfig.libraries[0].displayName).toBe('prompts_product');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should handle single word names', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'displayname-test-'));
      const libPath = path.join(tmpDir, 'general');
      fs.mkdirSync(libPath, { recursive: true });
      fs.writeFileSync(path.join(libPath, '_library.yaml'), 'name: general\n');

      try {
        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            if (key === 'repoPath') return tmpDir;
            if (key === 'promptsSubdir') return 'general';
            if (key === 'hiddenLibraries') return [];
            return defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };

        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const repoConfig = getRepoConfig();

        // Display name should exactly match folder name on disk
        expect(repoConfig.libraries[0].displayName).toBe('general');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('toPascalCase', () => {
    it('should convert space-separated words to PascalCase', () => {
      expect(toPascalCase('my new group')).toBe('MyNewGroup');
      expect(toPascalCase('My New Group')).toBe('MyNewGroup');
      expect(toPascalCase('MY NEW GROUP')).toBe('MyNewGroup');
    });

    it('should convert hyphenated words to PascalCase', () => {
      expect(toPascalCase('my-new-group')).toBe('MyNewGroup');
      expect(toPascalCase('My-New-Group')).toBe('MyNewGroup');
    });

    it('should convert underscored words to PascalCase', () => {
      expect(toPascalCase('my_new_group')).toBe('MyNewGroup');
      expect(toPascalCase('My_New_Group')).toBe('MyNewGroup');
    });

    it('should handle single words', () => {
      expect(toPascalCase('general')).toBe('General');
      expect(toPascalCase('GENERAL')).toBe('General');
      expect(toPascalCase('General')).toBe('General');
    });

    it('should preserve existing PascalCase', () => {
      expect(toPascalCase('MyNewGroup')).toBe('MyNewGroup');
      expect(toPascalCase('PromptsProduct')).toBe('PromptsProduct');
    });

    it('should handle mixed separators', () => {
      expect(toPascalCase('my-new_group name')).toBe('MyNewGroupName');
    });

    it('should handle empty string', () => {
      expect(toPascalCase('')).toBe('');
    });

    it('should trim whitespace', () => {
      expect(toPascalCase('  my group  ')).toBe('MyGroup');
    });

    it('should handle camelCase input by preserving word boundaries', () => {
      // When input is already camelCase like "promptsProduct",
      // we just capitalize the first letter
      expect(toPascalCase('promptsProduct')).toBe('PromptsProduct');
    });
  });

  describe('hiddenLibraries setting behavior (opt-out)', () => {
    it('should show all discovered libraries when hiddenLibraries is empty', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-test-'));

      try {
        // Create 3 library folders on disk with _library.yaml at root
        const lib1Path = path.join(tmpDir, 'libraryA');
        const lib2Path = path.join(tmpDir, 'libraryB');
        const lib3Path = path.join(tmpDir, 'libraryC');
        fs.mkdirSync(lib1Path, { recursive: true });
        fs.mkdirSync(lib2Path, { recursive: true });
        fs.mkdirSync(lib3Path, { recursive: true });
        fs.writeFileSync(path.join(lib1Path, '_library.yaml'), 'name: libraryA\n');
        fs.writeFileSync(path.join(lib2Path, '_library.yaml'), 'name: libraryB\n');
        fs.writeFileSync(path.join(lib3Path, '_library.yaml'), 'name: libraryC\n');

        // Mock settings: hiddenLibraries is empty (show all)
        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            if (key === 'repoPath') return tmpDir;
            if (key === 'promptsSubdir') return 'libraryA';
            if (key === 'hiddenLibraries') return [];
            return defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const enabledLibraries = getEnabledLibraries();

        // Should return all 3 libraries
        expect(enabledLibraries).toHaveLength(3);
        expect(enabledLibraries.map(l => l.id)).toContain('libraryA');
        expect(enabledLibraries.map(l => l.id)).toContain('libraryB');
        expect(enabledLibraries.map(l => l.id)).toContain('libraryC');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should hide libraries that are in hiddenLibraries setting', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-test-'));

      try {
        // Create 3 library folders on disk with _library.yaml at root
        const lib1Path = path.join(tmpDir, 'libraryA');
        const lib2Path = path.join(tmpDir, 'libraryB');
        const lib3Path = path.join(tmpDir, 'libraryC');
        fs.mkdirSync(lib1Path, { recursive: true });
        fs.mkdirSync(lib2Path, { recursive: true });
        fs.mkdirSync(lib3Path, { recursive: true });
        fs.writeFileSync(path.join(lib1Path, '_library.yaml'), 'name: libraryA\n');
        fs.writeFileSync(path.join(lib2Path, '_library.yaml'), 'name: libraryB\n');
        fs.writeFileSync(path.join(lib3Path, '_library.yaml'), 'name: libraryC\n');

        // Mock settings: hide libraryB
        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            if (key === 'repoPath') return tmpDir;
            if (key === 'promptsSubdir') return 'libraryA';
            if (key === 'hiddenLibraries') return ['libraryB'];
            return defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const enabledLibraries = getEnabledLibraries();

        // Should return only A and C (B is hidden)
        expect(enabledLibraries).toHaveLength(2);
        expect(enabledLibraries.map(l => l.id)).toContain('libraryA');
        expect(enabledLibraries.map(l => l.id)).toContain('libraryC');
        expect(enabledLibraries.map(l => l.id)).not.toContain('libraryB');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should allow hiding all libraries including the active library', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-test-'));

      try {
        // Create 2 library folders with _library.yaml at root
        const lib1Path = path.join(tmpDir, 'libraryA');
        const lib2Path = path.join(tmpDir, 'libraryB');
        fs.mkdirSync(lib1Path, { recursive: true });
        fs.mkdirSync(lib2Path, { recursive: true });
        fs.writeFileSync(path.join(lib1Path, '_library.yaml'), 'name: libraryA\n');
        fs.writeFileSync(path.join(lib2Path, '_library.yaml'), 'name: libraryB\n');

        // Mock settings: hide both libraries including the active one
        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            if (key === 'repoPath') return tmpDir;
            if (key === 'promptsSubdir') return 'libraryA'; // active
            if (key === 'hiddenLibraries') return ['libraryA', 'libraryB']; // hide both
            return defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const enabledLibraries = getEnabledLibraries();

        // All libraries should be hidden (no restriction on active library)
        expect(enabledLibraries).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should ignore non-existent libraries in hiddenLibraries', () => {
      const fs = require('fs');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-test-'));

      try {
        // Create 1 library on disk with _library.yaml at root
        const lib1Path = path.join(tmpDir, 'libraryA');
        fs.mkdirSync(lib1Path, { recursive: true });
        fs.writeFileSync(path.join(lib1Path, '_library.yaml'), 'name: libraryA\n');

        // Mock settings: try to hide a non-existent library
        const mockConfig = {
          get: vi.fn((key: string, defaultValue: any) => {
            if (key === 'repoPath') return tmpDir;
            if (key === 'promptsSubdir') return 'libraryA';
            if (key === 'hiddenLibraries') return ['nonExistentLibrary'];
            return defaultValue;
          }),
          has: vi.fn(),
          inspect: vi.fn(),
          update: vi.fn(),
        };
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as any);

        const enabledLibraries = getEnabledLibraries();

        // Should still return the existing library
        expect(enabledLibraries).toHaveLength(1);
        expect(enabledLibraries[0].id).toBe('libraryA');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});

