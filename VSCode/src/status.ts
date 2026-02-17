import * as vscode from 'vscode';
import { log } from './log';
import { getSettings } from './settings';
import { getCurrentBranch, checkoutBranch, smartPull } from './sync/hybridGit';
import * as path from 'path';
import * as os from 'os';

export class StatusViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'promptLibraryStatus';
  private _view?: vscode.WebviewView;
  private _sub?: vscode.Disposable;

  constructor() { }

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage(msg => this.onMessage(msg));
    this.render();

    // Subscribe to log updates
    this._sub?.dispose();
    this._sub = log.onDidChange(() => this.postEntries());

    // Immediately push any existing entries so the view is not empty on first open
    this.postEntries();
  }

  dispose() { this._sub?.dispose(); }

  private async onMessage(msg: any) {
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
      case 'syncDirect':
        vscode.commands.executeCommand('promptLibrary.syncDirectCommit');
        break;
      case 'syncPR':
        vscode.commands.executeCommand('promptLibrary.syncBranchPR');
        break;
      case 'syncFetch':
        vscode.commands.executeCommand('promptLibrary.syncFetch');
        break;
      case 'syncPull':
        vscode.commands.executeCommand('promptLibrary.syncPull');
        break;
      case 'syncRead':
        vscode.commands.executeCommand('promptLibrary.syncReadNow');
        break;
      case 'returnToMain':
        await this.returnToMainAndPull();
        break;
      case 'refreshBranch':
        await this.render();
        break;
    }
  }

  private async returnToMainAndPull() {
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

  private postEntries() {
    if (!this._view) return;
    this._view.webview.postMessage({ type: 'entries', payload: log.entries });
  }

  /** Refresh the view to update branch status. Can be called from outside. */
  async refresh() {
    await this.render();
  }

  private async render() {
    if (!this._view) return;
    const s = getSettings();

    // Get current branch if repo is configured
    let currentBranch = '';
    let isOnMainBranch = true;
    if (s.repoPath) {
      const repoPath = s.repoPath.startsWith('~')
        ? path.join(os.homedir(), s.repoPath.slice(1))
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
      ? '<button id="returnToMain" class="btn btn-warning" style="margin-top:6px;">↩ Return to Main & Pull</button>'
      : '';

    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">`;
    const html = `<!DOCTYPE html><html><head>${csp}
    <style>
      body { font-family: var(--vscode-font-family); margin: 0; }
      .container { padding: 12px; }
      .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
      .btn { padding: 4px 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; border-radius: 3px; cursor: pointer; }
      .btn:hover { background: var(--vscode-button-hoverBackground); }
      .btn-warning { background: #c8a600; color: #000; }
      .btn-warning:hover { background: #e6c200; }
      .kv { font-size: 12px; color: var(--vscode-descriptionForeground); }
      .kv div { margin-bottom: 2px; }
      .branch-indicator { margin-top: 8px; padding: 6px 8px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 3px; font-size: 12px; }
      .log { margin-top: 8px; border-top: 1px solid var(--vscode-widget-border); padding-top: 8px; }
      .entry { font-size: 12px; margin-bottom: 4px; }
      .lvl-info { color: var(--vscode-descriptionForeground); }
      .lvl-warn { color: #c8a600; }
      .lvl-error { color: #cc241d; }
      .time { opacity: 0.7; }
    </style>
    </head><body>
      <div class="container">
        <h3>Sync Status</h3>
        ${s.repoPath ? `
        <div class="branch-indicator">
          <span style="${branchWarningStyle}">${branchIcon} Branch: <b>${currentBranch}</b></span>
          ${!isOnMainBranch ? '<span style="margin-left:8px;font-size:11px;opacity:0.8;">(PR branch - return to main when done)</span>' : ''}
          ${returnToMainBtn}
        </div>
        ` : ''}
        <div class="row" style="margin-top:8px;margin-bottom:6px;">
          <button id="openSettings" class="btn">Open Settings</button>
          <button id="syncDirect" class="btn">Direct Commit</button>
          <button id="syncPR" class="btn">Branch + PR</button>
          <button id="syncFetch" class="btn">Fetch</button>
          <button id="syncPull" class="btn">Pull</button>
          <button id="syncRead" class="btn">Read YAML → Library</button>
          <button id="clear" class="btn">Clear</button>
        </div>
        <div class="kv">
          <div>repoPath: <b>${s.repoPath || '(not set)'}</b></div>
          <div>autoFetch: <b>${s.autoFetch.enabled ? `every ${s.autoFetch.minutes} min` : 'disabled'}</b></div>
        </div>
        <div class="log">
          <div id="log"></div>
        </div>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        const logEl = document.getElementById('log');
        document.getElementById('openSettings').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
        document.getElementById('syncDirect').addEventListener('click', () => vscode.postMessage({ type: 'syncDirect' }));
        document.getElementById('syncPR').addEventListener('click', () => vscode.postMessage({ type: 'syncPR' }));
        document.getElementById('syncFetch').addEventListener('click', () => vscode.postMessage({ type: 'syncFetch' }));
        document.getElementById('syncPull').addEventListener('click', () => vscode.postMessage({ type: 'syncPull' }));
        document.getElementById('syncRead').addEventListener('click', () => vscode.postMessage({ type: 'syncRead' }));
        document.getElementById('clear').addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
        const returnBtn = document.getElementById('returnToMain');
        if (returnBtn) {
          returnBtn.addEventListener('click', () => vscode.postMessage({ type: 'returnToMain' }));
        }
        window.addEventListener('message', (event) => {
          const msg = event.data || {};
          if (msg.type === 'entries') {
            const entries = msg.payload || [];
            logEl.innerHTML = entries.map(e => '<div class="entry lvl-' + e.level + '"><span class="time">[' + e.time + ']</span> ' + e.message + '</div>').join('');
          }
        });
        vscode.postMessage({ type: 'requestEntries' });
      </script>
    </body></html>`;
    this._view.webview.html = html;
  }
}

