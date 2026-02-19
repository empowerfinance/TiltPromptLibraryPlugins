import * as vscode from 'vscode';
import { log } from './log';
import { getSettings, getEnabledLibraries } from './settings';
import { loadHtmlTemplate, getNonce, generateCSP } from './ui/htmlLoader';
import { getCurrentBranch, checkoutBranch, smartPull } from './sync/hybridGit';
import { cleanupPromptFilenames } from './sync/yamlWriter';
import * as path from 'path';
import * as os from 'os';

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
          // Refresh the panel to show updated branch
          await this.render();
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
      case 'returnToMain':
        await this.returnToMainAndPull();
        break;
      case 'cleanupFilenames':
        await this.cleanupPromptFilenames();
        break;
    }
  }

  private static async cleanupPromptFilenames() {
    const s = getSettings();
    if (!s.repoPath) {
      vscode.window.showWarningMessage('No repoPath configured.');
      return;
    }

    // Handle ~ expansion
    const repoPath = s.repoPath.startsWith('~/')
      ? path.join(os.homedir(), s.repoPath.slice(2))
      : s.repoPath.startsWith('~')
        ? os.homedir()
        : s.repoPath;

    log.info('Cleaning up prompt filenames and internal IDs...');

    const libraries = getEnabledLibraries();
    if (libraries.length === 0) {
      log.warn('No enabled libraries found.');
      return;
    }

    const result = await cleanupPromptFilenames(repoPath, libraries);

    if (result.cleaned > 0) {
      log.info(`✅ Cleaned up ${result.cleaned} prompt file(s)`);
      vscode.window.showInformationMessage(`Cleaned up ${result.cleaned} prompt file(s). Filenames sanitized and library prefixes stripped from IDs.`);
    } else {
      log.info('No files needed cleanup.');
      vscode.window.showInformationMessage('All prompt files are already clean.');
    }

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        log.error(err);
      }
      vscode.window.showWarningMessage(`Cleanup completed with ${result.errors.length} error(s). Check logs for details.`);
    }
  }

  private static async returnToMainAndPull() {
    const s = getSettings();
    if (!s.repoPath) {
      vscode.window.showWarningMessage('No repoPath configured.');
      return;
    }

    // Handle ~ expansion: slice(2) to skip both '~' and '/' to avoid path.join ignoring homedir
    const repoPath = s.repoPath.startsWith('~/')
      ? path.join(os.homedir(), s.repoPath.slice(2))
      : s.repoPath.startsWith('~')
        ? os.homedir()
        : s.repoPath;

    log.info('Returning to main branch...');

    // Try 'main' first, then 'master'
    let result = await checkoutBranch(repoPath, 'main');
    if (!result.success) {
      result = await checkoutBranch(repoPath, 'master');
    }

    if (!result.success) {
      log.error(`Failed to checkout main/master: ${result.error}`);
      vscode.window.showWarningMessage(`Failed to checkout main/master: ${result.error}`);
      return;
    }

    log.info('Switched to main branch, pulling latest...');

    const pullResult = await smartPull(repoPath);
    if (pullResult.success) {
      log.info('Successfully returned to main and pulled latest changes.');
      vscode.window.showInformationMessage('Returned to main and pulled latest changes.');
    } else {
      log.error(`Pull failed: ${pullResult.error}`);
      vscode.window.showWarningMessage(`Returned to main but pull failed: ${pullResult.error}`);
    }

    // Refresh the view to show updated branch
    await this.render();
  }

  private static postEntries() {
    try {
      this._panel?.webview.postMessage({ type: 'entries', payload: log.entries });
    } catch { }
  }

  /** Refresh the panel to update branch status. Can be called from outside. */
  static async refresh() {
    if (this._panel) {
      await this.render();
    }
  }

  private static async render() {
    const s = getSettings();
    const disabledAttr = !s.repoPath ? 'disabled' : '';
    const webview = this._panel!.webview;
    const nonce = getNonce();
    const csp = generateCSP(webview, nonce);

    // Get current branch if repo is configured
    let currentBranch = '';
    let isOnMainBranch = true;
    if (s.repoPath) {
      // Handle ~ expansion: slice(2) to skip both '~' and '/' to avoid path.join ignoring homedir
      const repoPath = s.repoPath.startsWith('~/')
        ? path.join(os.homedir(), s.repoPath.slice(2))
        : s.repoPath.startsWith('~')
          ? os.homedir()
          : s.repoPath;
      try {
        const branch = await getCurrentBranch(repoPath);
        currentBranch = branch || '(unknown)';
        isOnMainBranch = currentBranch === 'main' || currentBranch === 'master';
      } catch (e) {
        currentBranch = '(error)';
      }
    }

    const branchWarningStyle = isOnMainBranch ? '' : 'color: #c8a600; font-weight: bold;';
    const branchIcon = isOnMainBranch ? '✓' : '⚠️';
    const returnToMainBtn = !isOnMainBranch && currentBranch
      ? '<button id="returnToMain" class="btn btn-warning">↩ Return to Main & Pull</button>'
      : '';

    const branchIndicator = s.repoPath ? `
      <div class="branch-indicator">
        <span style="${branchWarningStyle}">${branchIcon} Branch: <b>${currentBranch}</b></span>
        ${!isOnMainBranch ? '<span class="branch-hint">(PR branch - return to main when done)</span>' : ''}
        ${returnToMainBtn}
      </div>
    ` : '';

    const banner = !s.repoPath
      ? '<div class="banner">Set promptLibrary.repoPath in settings to enable Pull & Sync.</div>'
      : '';

    const html = loadHtmlTemplate('syncOpsView.html', {
      CSP: csp,
      NONCE: nonce,
      BANNER: banner,
      BRANCH_INDICATOR: branchIndicator,
      DISABLED: disabledAttr,
      REPO_PATH: s.repoPath || '(not set)'
    });

    this._panel!.webview.html = html;
  }
}
