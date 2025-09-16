import * as vscode from 'vscode';
import { LibraryStore } from './store';
import { GroupsProvider, GroupItem } from './groups';
import { Prompt } from './model';
import { getSettings } from './settings';
import { writeSharedGroups } from './sync/yamlWriter';
import { StatusViewProvider } from './status';
import { log } from './log';
import { checkoutNewBranch, commit as gitCommit, getCurrentBranch, getRemoteUrl, isGitRepo, push as gitPush, stageAll, tryBuildGithubCompareUrl, fetch as gitFetch, pull as gitPull } from './sync/git';
import { start as startScheduler } from './sync/scheduler';
import { readSharedGroups } from './sync/yamlReader';

class PromptLibraryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'promptLibraryView';
  private view?: vscode.WebviewView;
  private selectedGroup: { id: string | null; name: string | null } = { id: null, name: null };

  constructor(private readonly store: LibraryStore) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage(msg => this.onMessage(msg));
    webviewView.webview.html = getHtml();
  }

  async onMessage(msg: any) {
    switch (msg?.type) {
      case 'requestList': {
        await this.pushList();
        break;
      }
      case 'addPrompt': {
        const text: string = String(msg.text || '');
        if (!this.selectedGroup.id) { vscode.window.showWarningMessage('Select a group first'); return; }
        const res = await this.store.addPromptToGroup(this.selectedGroup.id, text);
        if (!res.ok) { vscode.window.showWarningMessage(res.reason ?? 'Could not add prompt'); return; }
        vscode.window.showInformationMessage('Prompt added');
        await this.pushList();
        break;
      }
      case 'deletePrompt': {
        const id: string = String(msg.id || '');
        if (!id) return;
        const ok = await this.store.deletePrompt(id);
        if (ok) { await this.pushList(); }
        break;
      }
      case 'copyPrompt': {
        const text: string = String(msg.text || '');
        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage('Prompt copied');
        break;
      }
      case 'editPrompt': {
        const id: string = String(msg.id || '');
        const text: string = String(msg.text || '');
        if (!id) return;
        const res = await this.store.updatePromptText(id, text);
        if (!res.ok) { vscode.window.showWarningMessage(res.reason ?? 'Could not edit prompt'); return; }
        await this.pushList();
        break;
      }
      case 'movePrompt': {
        const id: string = String(msg.id || '');
        if (!id) return;
        const groups = await this.store.listMovableGroups();
        const pick = await vscode.window.showQuickPick(groups.map(g => ({ label: g.name, description: g.id })), { placeHolder: 'Move to group...' });
        if (!pick) return;
        const targetId = pick.description || groups.find(g => g.name === pick.label)?.id || '';
        if (!targetId) return;
        const res = await this.store.movePrompt(id, targetId);
        if (!res.ok) { vscode.window.showWarningMessage(res.reason ?? 'Could not move prompt'); return; }
        await this.pushList();
        break;
      }
      case 'deleteMany': {
        const ids: string[] = Array.isArray(msg.ids) ? msg.ids : [];
        for (const id of ids) { await this.store.deletePrompt(String(id)); }
        await this.pushList();
        break;
      }
      case 'moveMany': {
        const ids: string[] = Array.isArray(msg.ids) ? msg.ids : [];
        if (ids.length === 0) return;
        const groups = await this.store.listMovableGroups();
        const pick = await vscode.window.showQuickPick(groups.map(g => ({ label: g.name, description: g.id })), { placeHolder: `Move ${ids.length} prompts to...` });
        if (!pick) return;
        const targetId = pick.description || groups.find(g => g.name === pick.label)?.id || '';
        if (!targetId) return;
        for (const id of ids) { await this.store.movePrompt(String(id), targetId); }
        await this.pushList();
        break;
      }
      case 'runCmd': {
        const cmd: string = String(msg.command || '');
        if (!cmd) return;
        await vscode.commands.executeCommand(cmd);
        break;
      }
    }
  }

  async pushList() {
    if (!this.view) return;
    if (!this.selectedGroup.id) { this.view.webview.postMessage({ type: 'prompts', payload: [] }); return; }
    const prompts: Prompt[] = await this.store.getPrompts(this.selectedGroup.id);
    this.view.webview.postMessage({ type: 'prompts', payload: prompts });
  }

  async refresh() { await this.pushList(); }

  setSelectedGroup(group: { id: string | null; name: string | null }) {
    this.selectedGroup = group;
    this.view?.webview.postMessage({ type: 'selectedGroup', payload: group });
    // When selection changes, refresh list for that group
    this.pushList();
  }
}

export function activate(context: vscode.ExtensionContext) {
  const store = new LibraryStore(context);
  const provider = new PromptLibraryViewProvider(store);
  const groups = new GroupsProvider(store);
  groups.init();

  const statusProvider = new StatusViewProvider();

  // Start auto-fetch scheduler
  startScheduler(context);

  const treeView = vscode.window.createTreeView('promptLibraryGroups', { treeDataProvider: groups, showCollapseAll: true });
  treeView.onDidChangeSelection(async e => {
    const item = e.selection[0];
    if (!item) { provider.setSelectedGroup({ id: null, name: null }); return; }
    const id = item.groupId;
    // Treat roots as no specific group selection
    if (id === 'root-shared' || id === 'root-private') {
      provider.setSelectedGroup({ id: null, name: null });
    } else {
      provider.setSelectedGroup({ id, name: item.label?.toString() ?? null });
    }
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PromptLibraryViewProvider.viewType, provider),
    vscode.window.registerWebviewViewProvider(StatusViewProvider.viewType, statusProvider),
    treeView,
    vscode.commands.registerCommand('promptLibrary.exportJson', async () => {
      try {
        const lib = await store.getLibrary();
        const uri = await vscode.window.showSaveDialog({ filters: { 'JSON': ['json'] }, saveLabel: 'Export' });
        if (!uri) return;
        const bytes = Buffer.from(JSON.stringify(lib, null, 2), 'utf8');
        await vscode.workspace.fs.writeFile(uri, bytes);
        vscode.window.showInformationMessage('Prompt Library exported');
        log.info(`Exported library to ${uri.fsPath}`);
      } catch (e: any) {
        log.error(`Export failed: ${e?.message || e}`);
      }
    }),
    vscode.commands.registerCommand('promptLibrary.importJson', async () => {
      try {
        const picks = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'JSON': ['json'] } });
        if (!picks || picks.length === 0) return;
        const data = await vscode.workspace.fs.readFile(picks[0]);
        const obj = JSON.parse(Buffer.from(data).toString('utf8'));
        const res = await store.importFromObject(obj);
        vscode.window.showInformationMessage(`Imported ${res.added} prompts (${res.skipped} skipped as duplicates) into Private/Unfiled.`);
        log.info(`Imported ${res.added} prompts (${res.skipped} skipped) from ${picks[0].fsPath}`);
        await groups.init();
        await provider.refresh();
      } catch (e: any) {
        log.error(`Import failed: ${e?.message || e}`);
      }
    }),
    vscode.commands.registerCommand('promptLibrary.deduplicate', async () => {
      try {
        const res = await store.deduplicate();
        vscode.window.showInformationMessage(res.removed ? `Removed ${res.removed} duplicates.` : 'No duplicates found.');
        log.info(res.removed ? `Dedup removed ${res.removed} prompts.` : 'Dedup found no duplicates.');
        await groups.init();
        await provider.refresh();
      } catch (e: any) {
        log.error(`Deduplicate failed: ${e?.message || e}`);
      }
    }),
    vscode.commands.registerCommand('promptLibrary.openSettings', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'promptLibrary');
    }),
    vscode.commands.registerCommand('promptLibrary.syncWriteNow', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) { vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.'); return; }
      try {
        const started = Date.now();
        log.info('Sync write started...');
        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) { vscode.window.showWarningMessage('Shared root not found'); log.warn('Shared root not found'); return; }
        const rootUri = vscode.Uri.file(cfg.repoPath);
        const result = await writeSharedGroups(rootUri, sharedRoot.children, cfg.promptsSubdir);
        const ms = Date.now() - started;
        vscode.window.showInformationMessage(`Sync write complete. Added ${result.added}, updated ${result.updated}, deleted ${result.deleted}.`);
        log.info(`Sync write complete in ${ms}ms. Added ${result.added}, updated ${result.updated}, deleted ${result.deleted}.`);
      } catch (e: any) {
        log.error(`Sync write failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Sync write failed. See Sync Status for details.');
      }
    }),
    vscode.commands.registerCommand('promptLibrary.syncReadNow', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) { vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.'); return; }
      try {
        log.info('Sync read started...');
        const groupsFromRepo = await readSharedGroups(vscode.Uri.file(cfg.repoPath), cfg.promptsSubdir);
        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) { vscode.window.showWarningMessage('Shared root not found'); log.warn('Shared root not found'); return; }
        sharedRoot.children = groupsFromRepo.map(g => ({ ...g, kind: 'shared' }));
        sharedRoot.prompts = [];
        await store.save(lib);
        await groups.init();
        await provider.refresh();
        vscode.window.showInformationMessage('Sync read complete: Shared library updated from repo.');
        log.info(`Sync read complete: imported ${groupsFromRepo.length} top-level groups.`);
      } catch (e: any) {
        log.error(`Sync read failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Sync read failed. See Sync Status for details.');
      }
    }),
    vscode.commands.registerCommand('promptLibrary.syncDirectCommit', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) { vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.'); return; }
      const repoPath = cfg.repoPath;
      if (!(await isGitRepo(repoPath))) { vscode.window.showWarningMessage('repoPath is not a Git repository'); log.warn('repoPath is not a Git repository'); return; }
      try {
        log.info('Direct commit: writing YAML...');
        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) { vscode.window.showWarningMessage('Shared root not found'); log.warn('Shared root not found'); return; }
        const result = await writeSharedGroups(vscode.Uri.file(repoPath), sharedRoot.children, cfg.promptsSubdir);
        await stageAll(repoPath);
        const msg = `Prompt Library sync: +${result.added}/~${result.updated}/-${result.deleted}`;
        const didCommit = await gitCommit(repoPath, msg);
        if (!didCommit) { log.warn('Nothing to commit.'); vscode.window.showInformationMessage('No changes to commit.'); return; }
        const okPush = await gitPush(repoPath);
        if (!okPush) { log.warn('Push failed'); vscode.window.showWarningMessage('Push failed. See Sync Status for details.'); return; }
        log.info('Direct commit: pushed successfully.');
        vscode.window.showInformationMessage('Sync (Direct Commit) complete.');
      } catch (e: any) {
        log.error(`Direct commit failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Direct commit failed. See Sync Status for details.');
      }
    }),
    vscode.commands.registerCommand('promptLibrary.syncBranchPR', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) { vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.'); return; }
      const repoPath = cfg.repoPath;
      if (!(await isGitRepo(repoPath))) { vscode.window.showWarningMessage('repoPath is not a Git repository'); log.warn('repoPath is not a Git repository'); return; }
      // Prefer configured branchName; fallback to timestamped branch
      const branch = cfg.branchName && cfg.branchName.trim() ? cfg.branchName.trim() : `prompt-sync/${new Date().toISOString().replace(/[:T]/g,'-').slice(0,16)}`;
      try {
        log.info(`Branch+PR: creating branch ${branch}...`);
        const cur = await getCurrentBranch(repoPath);
        if (!cur) { log.warn('Unable to detect current branch'); }
        const created = await checkoutNewBranch(repoPath, branch);
        if (!created) { log.warn('Checkout -b failed'); vscode.window.showWarningMessage('Failed to create branch. See Sync Status.'); return; }
        // Write YAML
        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) { vscode.window.showWarningMessage('Shared root not found'); log.warn('Shared root not found'); return; }
        const result = await writeSharedGroups(vscode.Uri.file(repoPath), sharedRoot.children, cfg.promptsSubdir);
        await stageAll(repoPath);
        const msg = `Prompt Library sync (PR): +${result.added}/~${result.updated}/-${result.deleted}`;
        const didCommit = await gitCommit(repoPath, msg);
        if (!didCommit) { log.warn('Nothing to commit on branch'); vscode.window.showInformationMessage('No changes to commit.'); return; }
        const pushed = await gitPush(repoPath, 'origin', branch);
        if (!pushed) { log.warn('Push failed'); vscode.window.showWarningMessage('Push failed. See Sync Status.'); return; }
        const remote = await getRemoteUrl(repoPath, 'origin');
        if (remote) {
          const prUrl = tryBuildGithubCompareUrl(remote, branch);
          if (prUrl) {
            log.info(`Opening PR URL: ${prUrl.toString()}`);
            await vscode.env.openExternal(prUrl);
          } else {
            log.warn('Remote is not a recognized GitHub URL; open a PR manually.');
          }
        }
        vscode.window.showInformationMessage('Sync (Branch + PR) pushed.');
      } catch (e: any) {
        log.error(`Branch+PR failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Branch + PR failed. See Sync Status for details.');
      }
    }),
    vscode.commands.registerCommand('promptLibrary.syncFetch', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) { vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.'); return; }
      try {
        log.info('Fetch started...');
        const ok = await gitFetch(cfg.repoPath);
        if (ok) { log.info('Fetch complete'); vscode.window.showInformationMessage('Fetch complete'); }
        else { log.warn('Fetch failed'); vscode.window.showWarningMessage('Fetch failed. See Sync Status.'); }
      } catch (e: any) {
        log.error(`Fetch failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Fetch failed. See Sync Status for details.');
      }
    }),
    vscode.commands.registerCommand('promptLibrary.syncPull', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) { vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.'); return; }
      try {
        log.info('Pull started...');
        const ok = await gitPull(cfg.repoPath);
        if (ok) { log.info('Pull complete'); vscode.window.showInformationMessage('Pull complete'); }
        else { log.warn('Pull failed'); vscode.window.showWarningMessage('Pull failed. See Sync Status.'); }
      } catch (e: any) {
        log.error(`Pull failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Pull failed. See Sync Status for details.');
      }
    }),
    vscode.commands.registerCommand('promptLibrary.hello', () => {
      vscode.window.showInformationMessage('Prompt Library: hello from scaffold');
    }),
    vscode.commands.registerCommand('promptLibrary.addGroup', (item?: GroupItem) => {
      const target = item?.groupId ?? 'root-private';
      return groups.addGroup(target);
    }),
    vscode.commands.registerCommand('promptLibrary.renameGroup', (item: GroupItem) => groups.renameGroup(item.groupId)),
    vscode.commands.registerCommand('promptLibrary.deleteGroup', (item: GroupItem) => groups.deleteGroup(item.groupId))
  );
}

export function deactivate() {}

function getHtml(): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; script-src 'unsafe-inline' 'nonce-1234'; style-src 'unsafe-inline';">`;
  return `<!DOCTYPE html><html><head>${csp}
  <style>
    body { font-family: var(--vscode-font-family); margin: 0; }
    .container { padding: 12px; }
    .toolbar { display:flex; gap:8px; align-items:center; margin-bottom: 8px; }
    .btn { padding: 4px 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; border-radius: 3px; cursor: pointer; }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .muted { color: var(--vscode-descriptionForeground); }
    .count { margin-left:auto; font-size: 12px; }
    .list { display:flex; flex-direction:column; gap:8px; }
    .item { border: 1px solid var(--vscode-widget-border); border-radius:4px; padding:8px; }
    .summary { cursor:pointer; font-weight:600; }
    .tags { margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; }
    .chip { font-size:11px; padding:1px 6px; border-radius:10px; background: var(--vscode-editorCodeLens-foreground); color: var(--vscode-editor-foreground); }
    .body { display:none; margin-top:6px; white-space:pre-wrap; }
    .actions { display:flex; gap:6px; margin-top:6px; }
  </style></head><body>
  <div class="container">
    <h3>Prompt Library</h3>
    <div id="sel" class="muted">No group selected</div>
    <div class="toolbar">
      <button id="importBtn" class="btn">Import JSON</button>
      <button id="exportBtn" class="btn">Export JSON</button>
      <button id="dedupeBtn" class="btn">Deduplicate</button>
      <span id="counts" class="count"></span>
    </div>
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
      <input id="filter" type="text" placeholder="Filter prompts..." style="flex:1;" />
      <button id="clearFilter" class="btn">Clear</button>
    </div>
    <div id="bulkbar" class="toolbar" style="display:none;">
      <span id="bulkcount" class="muted">0 selected</span>
      <div style="margin-left:auto;"></div>
      <button id="bulkMove" class="btn">Move Selected</button>
      <button id="bulkDelete" class="btn">Delete Selected</button>
    </div>
    <div id="list" class="list"></div>
    <hr/>
    <div>
      <textarea id="composer" rows="4" style="width:100%;" placeholder="Select a group to enable the composer" disabled></textarea>
      <button id="save" class="btn" disabled>Add prompt</button>
    </div>
  </div>
  <script nonce="1234">
    const vscode = acquireVsCodeApi();
    const sel = document.getElementById('sel');
    const filter = document.getElementById('filter');
    const list = document.getElementById('list');
    const composer = document.getElementById('composer');
    const save = document.getElementById('save');
    const counts = document.getElementById('counts');

    let allPrompts = [];
    const selected = new Set();

    function summarize(text){
      const first = (text||'').split(/\r?\n/,1)[0];
      return first.length > 120 ? first.slice(0,117) + '\u2026' : first;
    }
    function normalized(t){ return (t||'').replace(/\r\n|\r/g,'\n').replace(/\s+/g,' ').trim().toLowerCase(); }
    function renderCounts(shown){ counts.textContent = String(shown) + ' shown / ' + String(allPrompts.length) + ' total'; }

    function renderSelectionBar(){
      const bulkbar = document.getElementById('bulkbar');
      const bulkcount = document.getElementById('bulkcount');
      const n = selected.size;
      if (n > 0) { bulkbar.style.display = 'flex'; bulkcount.textContent = n + ' selected'; }
      else { bulkbar.style.display = 'none'; }
    }

    function renderList(prompts) {
      list.innerHTML = '';
      if (!prompts || prompts.length === 0) { list.textContent = 'No prompts in this group yet.'; renderCounts(0); renderSelectionBar(); return; }
      prompts.forEach(p => {
        const item = document.createElement('div'); item.className = 'item';
        const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px'; row.style.alignItems='center';
        const sel = document.createElement('input'); sel.type='checkbox'; sel.onchange = () => { if (sel.checked) selected.add(p.id); else selected.delete(p.id); renderSelectionBar(); };
        const title = document.createElement('div'); title.className = 'summary'; title.textContent = summarize(p.text); title.style.flex='1';
        row.appendChild(sel); row.appendChild(title);
        const body = document.createElement('div'); body.className = 'body'; body.textContent = p.text;
        title.onclick = () => { body.style.display = (body.style.display === 'none' || body.style.display === '') ? 'block' : 'none'; };
        const tags = document.createElement('div'); tags.className='tags'; tags.innerHTML = (p.tags||[]).map(t => '<span class="chip">'+t+'</span>').join(' ');
        const actions = document.createElement('div'); actions.className = 'actions';
        const copy = document.createElement('button'); copy.className='btn'; copy.textContent = 'Copy'; copy.onclick = () => vscode.postMessage({ type: 'copyPrompt', text: p.text });
        const edit = document.createElement('button'); edit.className='btn'; edit.textContent = 'Edit';
        edit.onclick = () => {
          body.style.display = 'block';
          const ta = document.createElement('textarea'); ta.style.width='100%'; ta.rows=6; ta.value = p.text;
          const row2 = document.createElement('div'); row2.style.display='flex'; row2.style.gap='6px'; row2.style.marginTop='6px';
          const saveBtn = document.createElement('button'); saveBtn.className='btn'; saveBtn.textContent='Save';
          const cancelBtn = document.createElement('button'); cancelBtn.className='btn'; cancelBtn.textContent='Cancel';
          saveBtn.onclick = () => { vscode.postMessage({ type: 'editPrompt', id: p.id, text: ta.value }); };
          cancelBtn.onclick = () => { vscode.postMessage({ type: 'requestList' }); };
          body.innerHTML=''; body.appendChild(ta); row2.append(saveBtn, cancelBtn); body.appendChild(row2);
        };
        const move = document.createElement('button'); move.className='btn'; move.textContent = 'Move'; move.onclick = () => vscode.postMessage({ type: 'movePrompt', id: p.id });
        const del = document.createElement('button'); del.className='btn'; del.textContent = 'Delete'; del.onclick = () => vscode.postMessage({ type: 'deletePrompt', id: p.id });
        actions.append(copy, edit, move, del);
        item.append(row, body, tags, actions);
        list.appendChild(item);
      });
      renderCounts(prompts.length);
      renderSelectionBar();
    }

    function applyFilter() {
      const q = (filter.value || '').toLowerCase();
      if (!q) { renderList(allPrompts); return; }
      const filtered = allPrompts.filter(p => (p.text || '').toLowerCase().includes(q));
      renderList(filtered);
    }

    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'selectedGroup') {
        const g = msg.payload;
        if (!g || !g.id) {
          sel.textContent = 'No group selected';
          composer.setAttribute('disabled','true');
          save.setAttribute('disabled','true');
          composer.setAttribute('placeholder','Select a group to enable the composer');
          allPrompts = [];
          renderList([]);
        } else {
          sel.textContent = 'Selected group: ' + (g.name || g.id);
          composer.removeAttribute('disabled');
          save.removeAttribute('disabled');
          composer.setAttribute('placeholder', 'Write a new prompt for ' + (g.name || g.id) + '...');
          vscode.postMessage({ type: 'requestList' });
        }
      } else if (msg.type === 'prompts') {
        allPrompts = msg.payload || [];
        applyFilter();
      }
    });

    filter.addEventListener('input', () => applyFilter());
    document.getElementById('clearFilter').addEventListener('click', () => { filter.value=''; applyFilter(); selected.clear(); renderSelectionBar(); });

    // Bulk bar actions
    document.getElementById('bulkDelete').addEventListener('click', () => {
      if (selected.size === 0) return;
      vscode.postMessage({ type: 'deleteMany', ids: Array.from(selected) });
      selected.clear(); renderSelectionBar();
    });
    document.getElementById('bulkMove').addEventListener('click', () => {
      if (selected.size === 0) return;
      vscode.postMessage({ type: 'moveMany', ids: Array.from(selected) });
      selected.clear(); renderSelectionBar();
    });

    // Toolbar
    document.getElementById('importBtn').addEventListener('click', () => vscode.postMessage({ type: 'runCmd', command: 'promptLibrary.importJson' }));
    document.getElementById('exportBtn').addEventListener('click', () => vscode.postMessage({ type: 'runCmd', command: 'promptLibrary.exportJson' }));
    document.getElementById('dedupeBtn').addEventListener('click', () => vscode.postMessage({ type: 'runCmd', command: 'promptLibrary.deduplicate' }));

    // Add
    save.addEventListener('click', () => {
      const text = composer.value || '';
      if (!text.trim()) return;
      const seen = new Set(allPrompts.map(p => normalized(p.text)));
      if (seen.has(normalized(text))) { alert('Duplicate prompt'); return; }
      vscode.postMessage({ type: 'addPrompt', text });
      composer.value = '';
    });
  </script>
</body></html>`;
}

