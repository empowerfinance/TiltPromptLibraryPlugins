import * as vscode from 'vscode';
import { log } from './log';
import { getSettings } from './settings';

export class StatusViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'promptLibraryStatus';
  private _view?: vscode.WebviewView;
  private _sub?: vscode.Disposable;

  constructor() {}

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage(msg => this.onMessage(msg));
    this.render();

    // Subscribe to log updates
    this._sub?.dispose();
    this._sub = log.onDidChange(() => this.postEntries());
  }

  dispose() { this._sub?.dispose(); }

  private onMessage(msg: any) {
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
    }
  }

  private postEntries() {
    if (!this._view) return;
    this._view.webview.postMessage({ type: 'entries', payload: log.entries });
  }

  private render() {
    if (!this._view) return;
    const s = getSettings();
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">`;
    const html = `<!DOCTYPE html><html><head>${csp}
    <style>
      body { font-family: var(--vscode-font-family); margin: 0; }
      .container { padding: 12px; }
      .row { display:flex; gap:8px; align-items:center; }
      .btn { padding: 4px 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; border-radius: 3px; cursor: pointer; }
      .btn:hover { background: var(--vscode-button-hoverBackground); }
      .kv { font-size: 12px; color: var(--vscode-descriptionForeground); }
      .kv div { margin-bottom: 2px; }
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
        <div class="row" style="margin-bottom:6px;">
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
          <div>writeStrategy: <b>${s.writeStrategy}</b></div>
          <div>promptsSubdir: <b>${s.promptsSubdir}</b></div>
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

