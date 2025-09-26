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
      case 'pullSyncOverwrite':
        vscode.commands.executeCommand('promptLibrary.syncPullOverwriteAndImport');
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

    const html = `<!DOCTYPE html><html><head>
    <style>
      :root { --accent: var(--vscode-focusBorder); --card-bg: var(--vscode-editorWidget-background); --border: var(--vscode-widget-border); --muted: var(--vscode-descriptionForeground); }
      * { box-sizing: border-box; }
      body { font-family: var(--vscode-font-family); margin:0; color: var(--vscode-foreground); line-height:1.5; }
      .container { padding: 16px; }
      .rows { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 16px; width: 100%; align-items: start; }
      .kv b { word-break: break-all; overflow-wrap: anywhere; }

      .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 1px 0 rgba(0,0,0,.2), 0 8px 24px rgba(0,0,0,.08); }
      .card h4 { margin: 0; padding: 10px 12px; border-bottom: 1px solid var(--border); font-weight: 700; font-size: 13px; }
      .card .body { padding: 12px; }
      .btn { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border); background: rgba(255,255,255,0.03); color: var(--vscode-foreground); cursor: pointer; transition: background .15s ease, transform .02s ease, border-color .15s ease, box-shadow .15s ease; white-space: nowrap; }
      .btn:hover { background: rgba(255,255,255,0.06); }
      .btn:active { transform: translateY(1px); }
      .btn[disabled] { opacity: 0.6; cursor: not-allowed; }
      .btn-primary { background: var(--accent); color: var(--vscode-button-foreground, #000); border-color: var(--accent); }
      .btn-primary:hover { filter: brightness(1.1); }
      .kv { color: var(--muted); font-size: 12px; }
      .banner { padding: 8px 12px; background: var(--vscode-editorWarning-background, #5e4300); color: var(--vscode-editorWarning-foreground, #fff); border-left: 3px solid #c8a600; margin-bottom: 8px; border-radius: 6px; }
      .log { padding: 8px; max-height: 70vh; overflow:auto; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 8px; }
      .entry { font-size: 12px; margin-bottom: 4px; }
      .lvl-info { color: var(--muted); }
      .lvl-warn { color: #c8a600; }
      .lvl-error { color: #cc241d; }
      .time { opacity: 0.7; }
    </style>
    </head><body>
      <div class="container">
        <div class="rows">
          <div class="card">
            <h4>Actions</h4>

            <div class="body">
              ${!s.repoPath ? `<div class="banner">Set promptLibrary.repoPath in settings to enable Pull & Sync.</div>` : ''}
              <div style="display:flex; gap:8px; margin-bottom: 8px; white-space: nowrap; overflow:auto;">
                <button id="pullSync" class="btn btn-primary" ${disabledAttr}>Pull & Sync Repo</button>
                <button id="importJson" class="btn">Import JSON</button>
                <button id="pullSyncOverwrite" class="btn btn-primary" ${disabledAttr} title="Discard local changes and reset to remote before syncing">Pull (Overwrite) & Sync Repo</button>

                <button id="exportJson" class="btn">Export JSON</button>
                <button id="dedupe" class="btn">Deduplicate</button>
                <button id="clear" class="btn">Clear Logs</button>
                <button id="resetLib" class="btn">Reset Library</button>
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
        const resetBtn = document.getElementById('resetLib'); if (resetBtn) resetBtn.addEventListener('click', () => vscode.postMessage({ type: 'resetAll' }));

        const logEl = document.getElementById('log');

        const importBtn = document.getElementById('importJson'); if (importBtn) importBtn.addEventListener('click', () => vscode.postMessage({ type: 'importJson' }));
        const dedupeBtn = document.getElementById('dedupe'); if (dedupeBtn) dedupeBtn.addEventListener('click', () => vscode.postMessage({ type: 'deduplicate' }));

        const exportBtn = document.getElementById('exportJson'); if (exportBtn) exportBtn.addEventListener('click', () => vscode.postMessage({ type: 'exportJson' }));

        const ps = document.getElementById('pullSync'); if (ps) ps.addEventListener('click', () => vscode.postMessage({ type: 'pullSync' }));
        const ps2 = document.getElementById('pullSyncOverwrite'); if (ps2) ps2.addEventListener('click', () => vscode.postMessage({ type: 'pullSyncOverwrite' }));

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

