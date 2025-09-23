import * as vscode from 'vscode';
import { log } from './log';
import { getSettings } from './settings';

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

  private static onMessage(msg: any) {
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

    const html = `<!DOCTYPE html><html><head>
    <style>
      body { font-family: var(--vscode-font-family); margin:0; }
      .container { padding: 12px; }
      .grid { display: grid; grid-template-columns: 320px 1fr; gap: 12px; }
      .card { border: 1px solid var(--vscode-widget-border); border-radius: 4px; }
      .card h4 { margin: 0; padding: 8px 10px; border-bottom: 1px solid var(--vscode-widget-border); }
      .card .body { padding: 10px; }
      .btn { padding: 4px 8px; background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-widget-border); border-radius: 3px; cursor: pointer; }
      .btn[disabled] { opacity: 0.6; cursor: not-allowed; }
      .kv { color: var(--vscode-descriptionForeground); font-size: 12px; }
      .banner { padding: 8px 10px; background: var(--vscode-editorWarning-background, #5e4300); color: var(--vscode-editorWarning-foreground, #fff); border-left: 3px solid #c8a600; margin-bottom: 8px; }
      .log { padding: 8px; max-height: 70vh; overflow:auto; }
      .entry { font-size: 12px; margin-bottom: 4px; }
      .lvl-info { color: var(--vscode-descriptionForeground); }
      .lvl-warn { color: #c8a600; }
      .lvl-error { color: #cc241d; }
      .time { opacity: 0.7; }
    </style>
    </head><body>
      <div class="container">
        <div class="grid">
          <div class="card">
            <h4>Actions</h4>
            <div class="body">
              ${!s.repoPath ? `<div class="banner">Set promptLibrary.repoPath in settings to enable Pull & Sync.</div>` : ''}
              <div style="display:flex; gap:8px; margin-bottom: 8px;">
                <button id="pullSync" class="btn" ${disabledAttr}>Pull & Sync Repo</button>
                <button id="openSettings" class="btn">Open Settings</button>
                <button id="clear" class="btn">Clear Logs</button>
              </div>
              <div class="kv">
                <div>repoPath: <b>${s.repoPath || '(not set)'}</b></div>
                <div>promptsSubdir: <b>${s.promptsSubdir}</b></div>
                <div>writeStrategy: <b>${s.writeStrategy}</b></div>
              </div>
            </div>
          </div>
          <div class="card">
            <h4>Logs</h4>
            <div class="body">
              <div id="log" class="log"></div>
            </div>
          </div>
        </div>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        const logEl = document.getElementById('log');
        document.getElementById('openSettings').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
        const ps = document.getElementById('pullSync'); if (ps) ps.addEventListener('click', () => vscode.postMessage({ type: 'pullSync' }));
        document.getElementById('clear').addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
        window.addEventListener('message', (event) => {
          const msg = event.data || {};
          if (msg.type === 'entries') {
            const entries = msg.payload || [];
            logEl.innerHTML = entries.map(e => '<div class="entry lvl-' + e.level + '"><span class="time">[' + e.time + ']</span> ' + e.message + '</div>').join('');
            logEl.scrollTop = logEl.scrollHeight;
          }
        });
        vscode.postMessage({ type: 'requestEntries' });
      </script>
    </body></html>`;

    this._panel!.webview.html = html;
  }
}

