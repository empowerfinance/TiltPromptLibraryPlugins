import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatusViewProvider } from '../status';
import * as vscode from 'vscode';
import { log } from '../log';

describe('StatusViewProvider', () => {
  let provider: StatusViewProvider;
  let mockWebviewView: any;
  let messageHandler: (msg: any) => void;
  let executeCommandSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    log.clear();

    // Spy on vscode.commands.executeCommand
    executeCommandSpy = vi.spyOn(vscode.commands, 'executeCommand');

    provider = new StatusViewProvider();
    
    // Create mock webview view
    mockWebviewView = {
      webview: {
        options: {},
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: vi.fn((handler) => {
          messageHandler = handler;
          return { dispose: vi.fn() };
        }),
      },
    };
  });

  describe('resolveWebviewView', () => {
    it('should initialize webview with scripts enabled', () => {
      provider.resolveWebviewView(mockWebviewView);

      expect(mockWebviewView.webview.options.enableScripts).toBe(true);
    });

    it('should register message handler', () => {
      provider.resolveWebviewView(mockWebviewView);

      expect(mockWebviewView.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should render HTML content', () => {
      provider.resolveWebviewView(mockWebviewView);

      expect(mockWebviewView.webview.html).toContain('Sync Status');
      expect(mockWebviewView.webview.html).toContain('Direct Commit');
      expect(mockWebviewView.webview.html).toContain('Branch + PR');
    });

    it('should post initial log entries', () => {
      log.info('Test message');
      
      provider.resolveWebviewView(mockWebviewView);

      expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'entries',
        payload: expect.arrayContaining([
          expect.objectContaining({ message: 'Test message' })
        ])
      });
    });

    it('should subscribe to log changes', () => {
      provider.resolveWebviewView(mockWebviewView);
      
      mockWebviewView.webview.postMessage.mockClear();
      log.info('New message');

      expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'entries',
        payload: expect.arrayContaining([
          expect.objectContaining({ message: 'New message' })
        ])
      });
    });
  });

  describe('message handling', () => {
    beforeEach(() => {
      provider.resolveWebviewView(mockWebviewView);
    });

    it('should handle requestEntries message', () => {
      log.info('Test entry');
      mockWebviewView.webview.postMessage.mockClear();

      messageHandler({ type: 'requestEntries' });

      expect(mockWebviewView.webview.postMessage).toHaveBeenCalledWith({
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

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'workbench.action.openSettings',
        'promptLibrary'
      );
    });

    it('should handle syncDirect message', () => {
      messageHandler({ type: 'syncDirect' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'promptLibrary.syncDirectCommit'
      );
    });

    it('should handle syncPR message', () => {
      messageHandler({ type: 'syncPR' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'promptLibrary.syncBranchPR'
      );
    });

    it('should handle syncFetch message', () => {
      messageHandler({ type: 'syncFetch' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'promptLibrary.syncFetch'
      );
    });

    it('should handle syncPull message', () => {
      messageHandler({ type: 'syncPull' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'promptLibrary.syncPull'
      );
    });

    it('should handle syncRead message', () => {
      messageHandler({ type: 'syncRead' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'promptLibrary.syncReadNow'
      );
    });

    it('should ignore null messages', () => {
      messageHandler(null);

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should ignore undefined messages', () => {
      messageHandler(undefined);

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should dispose log subscription', () => {
      const disposeSpy = vi.fn();
      provider.resolveWebviewView(mockWebviewView);
      
      // Replace the subscription with a spy
      (provider as any)._sub = { dispose: disposeSpy };

      provider.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });
  });
});
