import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SyncOpsPanel } from '../syncOps';
import * as vscode from 'vscode';
import { log } from '../log';

describe('SyncOpsPanel', () => {
  let mockContext: vscode.ExtensionContext;
  let mockPanel: any;
  let messageHandler: (msg: any) => void;
  let disposeHandler: () => void;
  let executeCommandSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    log.clear();
    
    // Spy on vscode.commands.executeCommand
    executeCommandSpy = vi.spyOn(vscode.commands, 'executeCommand');
    
    // Create mock context
    mockContext = {
      subscriptions: [],
    } as any;

    // Create mock panel
    mockPanel = {
      webview: {
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: vi.fn((handler) => {
          messageHandler = handler;
          return { dispose: vi.fn() };
        }),
      },
      reveal: vi.fn(),
      onDidDispose: vi.fn((handler) => {
        disposeHandler = handler;
        return { dispose: vi.fn() };
      }),
    };

    // Mock vscode.window.createWebviewPanel
    vi.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(mockPanel);
  });

  afterEach(() => {
    // Reset static state
    (SyncOpsPanel as any)._panel = undefined;
    (SyncOpsPanel as any)._sub = undefined;
  });

  describe('show', () => {
    it('should create webview panel on first call', () => {
      SyncOpsPanel.show(mockContext);

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'promptLibrarySyncOps',
        'Prompt Library: Sync Ops',
        vscode.ViewColumn.Active,
        { enableScripts: true }
      );
    });

    it('should reveal existing panel on subsequent calls', () => {
      SyncOpsPanel.show(mockContext);
      mockPanel.reveal.mockClear();

      SyncOpsPanel.show(mockContext);

      expect(mockPanel.reveal).toHaveBeenCalledWith(vscode.ViewColumn.Active);
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    });

    it('should register message handler', () => {
      SyncOpsPanel.show(mockContext);

      expect(mockPanel.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should register dispose handler', () => {
      SyncOpsPanel.show(mockContext);

      expect(mockPanel.onDidDispose).toHaveBeenCalled();
    });

    it('should render HTML content', () => {
      SyncOpsPanel.show(mockContext);

      expect(mockPanel.webview.html).toBeTruthy();
      expect(mockPanel.webview.html.length).toBeGreaterThan(0);
    });

    it('should post initial log entries', () => {
      log.info('Test message');
      
      SyncOpsPanel.show(mockContext);

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'entries',
        payload: expect.arrayContaining([
          expect.objectContaining({ message: 'Test message' })
        ])
      });
    });

    it('should subscribe to log changes', () => {
      SyncOpsPanel.show(mockContext);
      
      mockPanel.webview.postMessage.mockClear();
      log.info('New message');

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'entries',
        payload: expect.arrayContaining([
          expect.objectContaining({ message: 'New message' })
        ])
      });
    });
  });

  describe('message handling', () => {
    beforeEach(() => {
      SyncOpsPanel.show(mockContext);
    });

    it('should handle requestEntries message', () => {
      log.info('Test entry');
      mockPanel.webview.postMessage.mockClear();

      messageHandler({ type: 'requestEntries' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'entries',
        payload: expect.any(Array)
      });
    });

    it('should handle clear message', () => {
      log.info('Message 1');
      log.info('Message 2');

      messageHandler({ type: 'clear' });

      expect(log.entries).toHaveLength(0);
    });

    it('should handle openSettings message', () => {
      messageHandler({ type: 'openSettings' });

      expect(executeCommandSpy).toHaveBeenCalledWith(
        'workbench.action.openSettings',
        'promptLibrary'
      );
    });

    it('should handle pullSync message', () => {
      messageHandler({ type: 'pullSync' });

      expect(executeCommandSpy).toHaveBeenCalledWith(
        'promptLibrary.syncPullAndImport'
      );
    });

    it('should handle pullSyncOverwrite message', () => {
      messageHandler({ type: 'pullSyncOverwrite' });

      expect(executeCommandSpy).toHaveBeenCalledWith(
        'promptLibrary.syncPullOverwriteAndImport'
      );
    });

    it('should handle syncDirectCommit message', () => {
      messageHandler({ type: 'syncDirectCommit' });

      expect(executeCommandSpy).toHaveBeenCalledWith(
        'promptLibrary.syncDirectCommit'
      );
    });

    it('should handle syncBranchPR message', () => {
      messageHandler({ type: 'syncBranchPR' });

      expect(executeCommandSpy).toHaveBeenCalledWith(
        'promptLibrary.syncBranchPR'
      );
    });

    it('should handle importJson message', () => {
      messageHandler({ type: 'importJson' });

      expect(executeCommandSpy).toHaveBeenCalledWith(
        'promptLibrary.importJson'
      );
    });

    it('should handle exportJson message', () => {
      messageHandler({ type: 'exportJson' });

      expect(executeCommandSpy).toHaveBeenCalledWith(
        'promptLibrary.exportJson'
      );
    });

    it('should handle deduplicate message', () => {
      messageHandler({ type: 'deduplicate' });

      expect(executeCommandSpy).toHaveBeenCalledWith(
        'promptLibrary.deduplicate'
      );
    });

    it('should handle resetAll message', () => {
      messageHandler({ type: 'resetAll' });

      expect(executeCommandSpy).toHaveBeenCalledWith(
        'promptLibrary.resetAll'
      );
    });

    it('should ignore null messages', () => {
      executeCommandSpy.mockClear();
      messageHandler(null);

      expect(executeCommandSpy).not.toHaveBeenCalled();
    });

    it('should ignore undefined messages', () => {
      executeCommandSpy.mockClear();
      messageHandler(undefined);

      expect(executeCommandSpy).not.toHaveBeenCalled();
    });
  });

  describe('panel disposal', () => {
    it('should clean up on dispose', () => {
      SyncOpsPanel.show(mockContext);

      disposeHandler();

      // Panel should be cleared
      expect((SyncOpsPanel as any)._panel).toBeUndefined();
    });

    it('should dispose log subscription on panel dispose', () => {
      const disposeSpy = vi.fn();
      SyncOpsPanel.show(mockContext);

      // Replace the subscription with a spy
      (SyncOpsPanel as any)._sub = { dispose: disposeSpy };

      disposeHandler();

      expect(disposeSpy).toHaveBeenCalled();
    });
  });
});
