import * as vscode from 'vscode';
import { log } from './log';
import { getSettings } from './settings';
import { loadHtmlTemplate, getNonce, generateCSP } from './ui/htmlLoader';

export class SyncOpsPanel {
  private static _panel: vscode.WebviewPanel | undefined;
  private static _sub: vscode.Disposable | undefined;

  static show(context: vscode.ExtensionContext) {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.Active);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'promptLibrarySyncOps',
      'Prompt Library: Sync Ops',
      vscode.ViewColumn.Active,
      { enableScripts: true }
    );
    this._panel = panel;

    panel.onDidDispose(() => {
      this._sub?.dispose();
      this._panel = undefined;
    }, null, context.subscriptions);

    panel.webview.onDidReceiveMessage(msg => this.onMessage(msg));

    // Subscribe to log updates
    this._sub?.dispose();
    this._sub = log.onDidChange(() => this.postEntries());

    this.render();
    this.postEntries();
  }

  private static async onMessage(msg: any) {
    if (!msg) return;
    switch (msg.type) {
      case 'requestEntries':
        this.postEntries();
        break;
      case 'clear':
        log.clear();
        break;
      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'promptLibrary');
        break;
      case 'pullSync':
        vscode.commands.executeCommand('promptLibrary.syncPullAndImport');
        break;
      case 'pullSyncOverwrite':
        vscode.commands.executeCommand('promptLibrary.syncPullOverwriteAndImport');
        break;
      case 'syncDirectCommit':
        log.info('UI -> Received syncDirectCommit');
        try {
          await vscode.commands.executeCommand('promptLibrary.syncDirectCommit');
          log.info('UI -> syncDirectCommit command completed');
        } catch (e: any) {
          log.error(`UI -> syncDirectCommit command failed: ${e?.message || e}`);
          log.error(`Stack: ${e?.stack}`);
        }
        break;
      case 'syncBranchPR':
        log.info('UI -> Received syncBranchPR');
        try {
          await vscode.commands.executeCommand('promptLibrary.syncBranchPR');
          log.info('UI -> syncBranchPR command completed');
        } catch (e: any) {
          log.error(`UI -> syncBranchPR command failed: ${e?.message || e}`);
          log.error(`Stack: ${e?.stack}`);
        }
        break;

      case 'importJson':
        vscode.commands.executeCommand('promptLibrary.importJson');
        break;
      case 'exportJson':
        vscode.commands.executeCommand('promptLibrary.exportJson');
        break;
      case 'deduplicate':
        vscode.commands.executeCommand('promptLibrary.deduplicate');
        break;
      case 'resetAll':
        vscode.commands.executeCommand('promptLibrary.resetAll');
        break;
    }
  }

  private static postEntries() {
    try {
      this._panel?.webview.postMessage({ type: 'entries', payload: log.entries });
    } catch {}
  }

  private static render() {
    const s = getSettings();
    const disabledAttr = !s.repoPath ? 'disabled' : '';
    const webview = this._panel!.webview;
    const nonce = getNonce();
    const csp = generateCSP(webview, nonce);

    const banner = !s.repoPath
      ? '<div class="banner">Set promptLibrary.repoPath in settings to enable Pull & Sync.</div>'
      : '';

    const html = loadHtmlTemplate('syncOpsView.html', {
      CSP: csp,
      NONCE: nonce,
      BANNER: banner,
      DISABLED: disabledAttr,
      REPO_PATH: s.repoPath || '(not set)',
      PROMPTS_SUBDIR: s.promptsSubdir,
      WRITE_STRATEGY: s.writeStrategy
    });

    this._panel!.webview.html = html;
  }
}
