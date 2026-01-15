/**
 * Global test setup file
 * This file runs before all tests and sets up common mocks
 */

import { vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Mock VS Code API
 * This provides a minimal implementation of the VS Code API for testing
 */
vi.mock('vscode', () => {
  enum FileType {
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
  }

  enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2,
    Three = 3,
  }

  class Uri {
    constructor(public fsPath: string) {}

    static file(p: string) {
      return new Uri(path.resolve(p));
    }

    static joinPath(base: Uri, ...parts: string[]) {
      return Uri.file(path.join(base.fsPath, ...parts));
    }

    static parse(value: string) {
      return new Uri(value);
    }
  }

  class EventEmitter<T> {
    private listeners: Array<(e: T) => any> = [];

    get event() {
      return (listener: (e: T) => any) => {
        this.listeners.push(listener);
        return {
          dispose: () => {
            const index = this.listeners.indexOf(listener);
            if (index >= 0) {
              this.listeners.splice(index, 1);
            }
          },
        };
      };
    }

    fire(data: T): void {
      this.listeners.forEach(listener => listener(data));
    }

    dispose(): void {
      this.listeners = [];
    }
  }

  const configChangeEmitter = new EventEmitter<any>();

  const workspace = {
    fs: {
      async readDirectory(uri: Uri): Promise<[string, number][]> {
        const entries = fs.readdirSync(uri.fsPath, { withFileTypes: true });
        return entries.map((d) => [
          d.name,
          d.isDirectory() ? FileType.Directory : FileType.File,
        ]);
      },

      async readFile(uri: Uri): Promise<Uint8Array> {
        return fs.readFileSync(uri.fsPath);
      },

      async createDirectory(uri: Uri): Promise<void> {
        fs.mkdirSync(uri.fsPath, { recursive: true });
      },

      async writeFile(uri: Uri, bytes: Uint8Array): Promise<void> {
        fs.writeFileSync(uri.fsPath, bytes);
      },

      async stat(uri: Uri): Promise<any> {
        const stats = fs.statSync(uri.fsPath);
        return {
          type: stats.isDirectory() ? FileType.Directory : FileType.File,
          ctime: stats.ctimeMs,
          mtime: stats.mtimeMs,
          size: stats.size,
        };
      },

      async delete(uri: Uri, options?: { recursive?: boolean }): Promise<void> {
        if (options?.recursive) {
          fs.rmSync(uri.fsPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(uri.fsPath);
        }
      },
    },

    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
      has: vi.fn(),
      inspect: vi.fn(),
      update: vi.fn(),
    })),

    onDidChangeConfiguration: (callback: (e: any) => void) => {
      return configChangeEmitter.event(callback);
    },

    // Helper for tests to trigger config changes
    _triggerConfigChange: (affectedKeys: string[]) => {
      configChangeEmitter.fire({
        affectsConfiguration: (key: string) => affectedKeys.some(k => key.startsWith(k)),
      });
    },
  };

  const window = {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    createWebviewPanel: vi.fn(),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
  };

  const commands = {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  };

  const Webview = {
    cspSource: 'vscode-webview:',
    asWebviewUri: vi.fn((uri: Uri) => uri),
  };

  enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
  }

  class TreeItem {
    label?: string;
    id?: string;
    iconPath?: any;
    description?: string;
    tooltip?: string;
    command?: any;
    contextValue?: string;
    collapsibleState?: TreeItemCollapsibleState;

    constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon {
    constructor(public id: string) {}
  }

  const env = {
    clipboard: {
      writeText: vi.fn(),
      readText: vi.fn(),
    },
  };

  return {
    Uri,
    FileType,
    ViewColumn,
    workspace,
    window,
    commands,
    Webview,
    EventEmitter,
    TreeItem,
    TreeItemCollapsibleState,
    ThemeIcon,
    env,
  };
});

/**
 * Suppress console output during tests (optional)
 * Uncomment if you want cleaner test output
 */
// global.console = {
//   ...console,
//   log: vi.fn(),
//   debug: vi.fn(),
//   info: vi.fn(),
//   warn: vi.fn(),
//   error: vi.fn(),
// };

