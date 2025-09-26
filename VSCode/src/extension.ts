// extension.ts
import * as vscode from 'vscode';
import { LibraryStore } from './store';
import { GroupsProvider, GroupItem, PromptItem } from './groups';
import { Prompt } from './model';
import { getSettings } from './settings';
import { writeSharedGroups } from './sync/yamlWriter';
import { log } from './log';
import { checkoutNewBranch, commit as gitCommit, getCurrentBranch, getRemoteUrl, isGitRepo, push as gitPush, stageAll, tryBuildGithubCompareUrl, fetch as gitFetch, pull as gitPull, clone as gitClone, resetHardToRemote, cleanUntracked } from './sync/git';
import { start as startScheduler } from './sync/scheduler';
import { readSharedGroups } from './sync/yamlReader';
import { SyncOpsPanel } from './syncOps';

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';


class PromptDetailViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'promptDetailView';
  private view?: vscode.WebviewView;
  private lastTitle: string = '';
  private lastText: string = '';

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this.render();
  }

  showPrompt(title: string, text: string) {
    this.lastTitle = title;
    this.lastText = text;
    this.render();
  }

  private render() {
    if (!this.view) return;
    const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const title = esc(this.lastTitle || 'Prompt');
    const body = esc(this.lastText);
    const html = `<!DOCTYPE html><html><head>
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
      <style>
        :root { --accent: var(--vscode-focusBorder); --border: var(--vscode-widget-border); --card-bg: var(--vscode-editorWidget-background); }
        * { box-sizing: border-box; }
        body { font-family: var(--vscode-font-family); margin: 0; color: var(--vscode-foreground); }
        .container { padding: 16px; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; box-shadow: 0 1px 0 rgba(0,0,0,.2), 0 8px 24px rgba(0,0,0,.08); }
        .title { font-weight: 700; font-size: 13px; margin: 0 0 8px 0; }
        .pre { white-space: pre-wrap; line-height: 1.5; font-family: var(--vscode-editor-font-family, Consolas, Menlo, monospace); font-size: 12px; }
      </style>
    </head><body>
      <div class="container">
        <div class="card">
          <div class="title">${title}</div>
          <div class="pre">${body}</div>
        </div>
      </div>
    </body></html>`;
    this.view.webview.html = html;
  }
}

class PromptLibraryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'promptLibraryView';
  private view?: vscode.WebviewView;
  private selectedGroup: { id: string | null; name: string | null };

  constructor(private readonly store: LibraryStore, private readonly memento: vscode.Memento, private readonly groups: GroupsProvider) {
    this.selectedGroup = (this.memento.get<{ id: string | null; name: string | null }>('promptLibrary.lastSelectedGroup')) ?? { id: null, name: null };
  }

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage(msg => this.onMessage(msg));
    webviewView.webview.html = getHtml(webviewView.webview);
    // Ensure the webview reflects the current selection even if it resolved after selection happened
    let replay = this.selectedGroup;
    if (!replay.id) {
      // Default to the actual Unfiled group id (do not assume a fixed id)
      try {
        const lib = await this.store.getLibrary();
        const priv = lib.groups.find(g => g.id === 'root-private');
        const unfiled = priv?.children.find(c => c.id === 'grp-unfiled' || (c.name || '').toLowerCase() === 'unfiled');
        if (unfiled) {
          replay = { id: unfiled.id, name: unfiled.name };
        } else {
          replay = { id: 'grp-unfiled', name: 'Unfiled' };
        }
      } catch {
        replay = { id: 'grp-unfiled', name: 'Unfiled' };
      }
      this.selectedGroup = replay;
    }
    log.info(`Webview resolved; replaying selected group: id=${replay.id ?? 'null'}, name=${replay.name ?? 'null'}`);
    webviewView.webview.postMessage({ type: 'selectedGroup', payload: replay });
    this.pushList();
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        webviewView.webview.postMessage({ type: 'selectedGroup', payload: this.selectedGroup });
        this.pushList();
      }
    });

  }

  async onMessage(msg: any) {
    switch (msg?.type) {
      case 'requestList': {
        await this.pushList();
        break;
      }
      case 'addPrompt': {
        const text: string = String(msg.text || '');
        const title: string | undefined = typeof msg.title === 'string' ? msg.title : undefined;
        if (!this.selectedGroup.id) { vscode.window.showWarningMessage('Select a group first'); return; }
        const res = await this.store.addPromptToGroup(this.selectedGroup.id, text, title);
        if (!res.ok) { vscode.window.showWarningMessage(res.reason ?? 'Could not add prompt'); return; }
        vscode.window.showInformationMessage('Prompt added');
        await this.pushList();
        try { const lib = await this.store.getLibrary(); this.groups.setLibrary(lib); } catch {}
        break;
      }
      case 'deletePrompt': {
        const id: string = String(msg.id || '');
        if (!id) return;
        const p = await this.store.getPromptById(id);
        if (p && !p.private) { vscode.window.showWarningMessage('Cannot delete prompts from the GitHub collection.'); return; }
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
        const title: string | undefined = typeof msg.title === 'string' ? msg.title : undefined;
        if (typeof title !== 'undefined') {
          const res2 = await this.store.updatePromptTitle(id, title);
          if (!res2.ok) { vscode.window.showWarningMessage(res2.reason ?? 'Could not update title'); return; }
        }
        await this.pushList();
        try { const lib = await this.store.getLibrary(); this.groups.setLibrary(lib); } catch {}
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
        const deletable: string[] = [];
        for (const raw of ids) {
          const id = String(raw);
          const p = await this.store.getPromptById(id);
          if (p && p.private) deletable.push(id);
        }
        if (deletable.length === 0) { vscode.window.showInformationMessage('No deletable prompts (GitHub collection prompts cannot be deleted).'); return; }
        for (const id of deletable) { await this.store.deletePrompt(id); }
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
      case 'ready': {
        log.info('Prompt Library webview ready');
        // Re-send current selection and list
        this.view?.webview.postMessage({ type: 'selectedGroup', payload: this.selectedGroup });
        await this.pushList();
        break;
      }
      case 'wv-log': {
        try { log.info(`[webview] ${String(msg.msg ?? '')}`); } catch { }
        break;
      }
    }
  }

  async pushList() {
    if (!this.view) return;
    if (!this.selectedGroup.id) { this.view.webview.postMessage({ type: 'prompts', payload: [] }); return; }
    log.info(`pushList: loading prompts for group=${this.selectedGroup.id}`);
    const prompts: Prompt[] = await this.store.getPrompts(this.selectedGroup.id);
    log.info(`pushList: sending ${prompts.length} prompts`);
    this.view.webview.postMessage({ type: 'prompts', payload: prompts });
  }

  async refresh() { await this.pushList(); }
  getSelectedGroup() { return this.selectedGroup; }


  // *** PATCH: redirect root selections to a writable child (e.g., Private -> Unfiled) ***
  async setSelectedGroup(group: { id: string | null; name: string | null }) {
    let effective = group;

    try {
      if (group.id === 'root-private') {
        const lib = await this.store.getLibrary();
        const priv = lib.groups.find(g => g.id === 'root-private');
        const unfiled = priv?.children.find(c => c.id === 'grp-unfiled');
        if (unfiled) {
          effective = { id: unfiled.id, name: `${group.name} / ${unfiled.name}` };
        }
      } else if (group.id === 'root-shared') {
        const lib = await this.store.getLibrary();
        const shared = lib.groups.find(g => g.id === 'root-shared');
        const firstChild = shared?.children[0];
        if (firstChild) {
          effective = { id: firstChild.id, name: `${group.name} / ${firstChild.name}` };
        }
      }
    } catch (e) {
      // fall back to original group if anything goes wrong
    }

    this.selectedGroup = effective;
    try { await this.memento.update('promptLibrary.lastSelectedGroup', effective); } catch {}
    log.info(`Webview setSelectedGroup: id=${effective.id ?? 'null'}, name=${effective.name ?? 'null'}, hasView=${!!this.view}`);
    this.view?.webview.postMessage({ type: 'selectedGroup', payload: effective });
    // When selection changes, refresh list for that group
    await this.pushList();
  }

  // Populate the composer inputs with an existing prompt (id/title/text)
  populateComposer(payload: { id: string; title?: string; text: string }) {
    this.view?.webview.postMessage({ type: 'populateComposer', payload });
  }



}


class PromptTreeDragAndDrop implements vscode.TreeDragAndDropController<GroupItem | PromptItem> {
  readonly dragMimeTypes = ['application/vnd.tilt.prompt'];
  readonly dropMimeTypes = ['application/vnd.tilt.prompt'];
  private readonly mime = 'application/vnd.tilt.prompt';

  constructor(
    private readonly store: LibraryStore,
    private readonly groups: GroupsProvider,
    private readonly provider: PromptLibraryViewProvider,
  ) {}

  handleDrag(source: readonly (GroupItem | PromptItem)[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
    try {
      const promptItems = source.filter(s => (s as any).promptId) as PromptItem[];
      if (!promptItems.length) return;
      const payload = {
        promptIds: promptItems.map(p => (p as any).promptId as string),
        fromGroupId: (promptItems[0] as any).groupId as string | undefined,
      };
      dataTransfer.set(this.mime, new vscode.DataTransferItem(JSON.stringify(payload)));
    } catch {}
  }

  async handleDrop(target: GroupItem | PromptItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    try {
      const item = dataTransfer.get(this.mime);
      if (!item) return;
      const raw = await item.asString();
      const data = JSON.parse(raw || '{}') as { promptIds?: string[] };
      const ids = Array.isArray(data.promptIds) ? data.promptIds : [];
      if (ids.length === 0) return;

      // Determine target group id
      let targetGroupId: string | undefined;
      if (target) {
        if ((target as any).groupId) targetGroupId = (target as any).groupId as string;
      }
      if (!targetGroupId) return;
      if (targetGroupId === 'root-shared' || targetGroupId === 'root-private') {
        vscode.window.showWarningMessage('Drop onto a subgroup to move prompts.');
        return;
      }

      for (const pid of ids) {
        const res = await this.store.movePrompt(pid, targetGroupId);
        if (!res.ok) { vscode.window.showWarningMessage(res.reason ?? 'Could not move prompt'); return; }
      }
      await this.provider.refresh();
      await this.groups.init();
    } catch {}
  }

  dispose() {}
}

export function activate(context: vscode.ExtensionContext) {
  const store = new LibraryStore(context);


  const groups = new GroupsProvider(store);
  groups.init();
  const provider = new PromptLibraryViewProvider(store, context.globalState, groups);
  const detailProvider = new PromptDetailViewProvider();

  // Start auto-fetch scheduler
  startScheduler(context);

  const dnd = new PromptTreeDragAndDrop(store, groups, provider);
  const treeView = vscode.window.createTreeView('promptLibraryGroups', { treeDataProvider: groups, showCollapseAll: false, dragAndDropController: dnd });
  treeView.onDidChangeSelection(async e => {
    const item = e.selection[0] as (GroupItem | PromptItem | undefined);
    if (!item) {
      log.info('Selection cleared');
      provider.setSelectedGroup({ id: null, name: null });
      return;
    }

    // If a prompt is selected: open Prompt view and copy to clipboard
    if (item instanceof PromptItem || (item as any).contextValue === 'prompt') {
      try {
        const pid = (item as any).promptId as string;
        const p = await store.getPromptById(pid);
        if (p) {
          await vscode.env.clipboard.writeText(p.text || '');
          const title = (p.title && p.title.trim()) ? p.title : (p.text || '').replace(/\r\n?|\n/g, ' ').slice(0, 20).trim() || 'Prompt';
          detailProvider.showPrompt(title, p.text || '');
          // Also switch the Prompt Library context to the prompt's group so composer is enabled
          const gid = (item as any).groupId as (string | undefined);
          if (gid) {
            const g = groups.getGroupById(gid);
            await provider.setSelectedGroup({ id: gid, name: g?.name ?? gid });
          }
          // Bring container into focus
          try { await vscode.commands.executeCommand('workbench.view.extension.promptLibrary'); } catch { }
          vscode.window.setStatusBarMessage('Prompt copied to clipboard', 1500);
        }
      } catch (err) {
        log.warn('Failed to open prompt: ' + String((err as any)?.message || err));
      }
      return;
    }

    // Otherwise treat it as a group selection
    const id = (item as GroupItem).groupId;
    const name = item.label?.toString() ?? null;
    log.info(`Selected group item: id=${id}, name=${name}`);
    // Treat roots as valid selections; we redirect in setSelectedGroup to show actual prompts
    await provider.setSelectedGroup({ id, name });
  });



  // Keep ALL groups permanently expanded
  const isGroupElement = (el: any) => {
    try {
      const ctx = (el as any)?.contextValue;
      return typeof ctx === 'string' && (ctx.startsWith('root-') || ctx.startsWith('group'));
    } catch { return false; }
  };
  treeView.onDidCollapseElement(e => {
    if (isGroupElement(e.element)) {
      try { setTimeout(() => treeView.reveal(e.element, { expand: 10 }), 0); } catch { }
    }
  });
  treeView.onDidExpandElement(e => {
    if (isGroupElement(e.element)) {
      try { treeView.reveal(e.element, { expand: 10 }); } catch { }
    }
  });


  // Default selection: restore last group if available, otherwise Unfiled
  const __lastSel = provider.getSelectedGroup?.() as any;
  if (!__lastSel || !__lastSel.id) {
    (async () => {
      try {
        const lib = await store.getLibrary();
        const priv = lib.groups.find(g => g.id === 'root-private');
        const unfiled = priv?.children.find(c => c.id === 'grp-unfiled' || (c.name || '').toLowerCase() === 'unfiled');
        if (unfiled) await provider.setSelectedGroup({ id: unfiled.id, name: unfiled.name });
        else await provider.setSelectedGroup({ id: 'grp-unfiled', name: 'Unfiled' });
      } catch { await provider.setSelectedGroup({ id: 'grp-unfiled', name: 'Unfiled' }); }
    })();
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PromptLibraryViewProvider.viewType, provider),
    vscode.window.registerWebviewViewProvider(PromptDetailViewProvider.viewType, detailProvider),

    dnd,
    treeView,
    // Prompt item commands (used by inline actions in the Groups tree)
    vscode.commands.registerCommand('promptLibrary.openPrompt', async (arg?: any) => {
      try {
        const pid: string | undefined = typeof arg === 'string' ? arg : arg?.promptId;
        if (!pid) return;
        const p = await store.getPromptById(pid);
        if (!p) return;
        await vscode.env.clipboard.writeText(p.text || '');
        const title = (() => { const t = (p.title ?? '').trim(); return t && !/^(null|undefined|~)$/i.test(t) ? t : ((p.text || '').replace(/\r\n?|\n/g, ' ').slice(0, 20).trim() || 'Prompt'); })();
        detailProvider.showPrompt(title, p.text || '');
        try { await vscode.commands.executeCommand('workbench.view.extension.promptLibrary'); } catch { }
        vscode.window.setStatusBarMessage('Prompt copied to clipboard', 1500);
      } catch (e) { log.warn('openPrompt failed: ' + String((e as any)?.message || e)); }
    }),
    vscode.commands.registerCommand('promptLibrary.copyPrompt', async (item?: any) => {
      const pid: string | undefined = (item as any)?.promptId;
      if (!pid) return;
      const p = await store.getPromptById(pid); if (!p) return;
      await vscode.env.clipboard.writeText(p.text || '');
      vscode.window.setStatusBarMessage('Prompt copied', 1000);
    }),
    vscode.commands.registerCommand('promptLibrary.editPrompt', async (item?: any) => {
      const pid: string | undefined = (item as any)?.promptId;
      const gid: string | undefined = (item as any)?.groupId;
      if (!pid) return;
      const p = await store.getPromptById(pid); if (!p) return;
      const title = (p.title && p.title.trim()) ? p.title : (p.text || '').replace(/\r\n?|\n/g, ' ').slice(0, 20).trim();
      // Ensure the Prompt Library view is focused and set to the prompt's group so composer is enabled
      try { if (gid) { const g = groups.getGroupById(gid); await provider.setSelectedGroup({ id: gid, name: g?.name ?? gid }); } } catch {}
      try { await vscode.commands.executeCommand('workbench.view.extension.promptLibrary'); } catch {}
      // Populate the composer with this prompt's content
      provider.populateComposer({ id: pid, title, text: p.text || '' });
    }),
    vscode.commands.registerCommand('promptLibrary.movePrompt', async (item?: any) => {
      const pid: string | undefined = (item as any)?.promptId;
      if (!pid) return;
      const groupsList = await store.listMovableGroups();
      const pick = await vscode.window.showQuickPick(groupsList.map(g => ({ label: g.name, description: g.id })), { placeHolder: 'Move to group...' });
      if (!pick) return;
      const targetId = pick.description || groupsList.find(g => g.name === pick.label)?.id || '';
      if (!targetId) return;
      const res = await store.movePrompt(pid, targetId);
      if (!res.ok) { vscode.window.showWarningMessage(res.reason ?? 'Could not move prompt'); return; }
      await provider.refresh();
      await groups.init();
    }),
    vscode.commands.registerCommand('promptLibrary.deletePrompt', async (item?: any) => {
      const pid: string | undefined = (item as any)?.promptId;
      if (!pid) return;
      const p = await store.getPromptById(pid);
      if (p && !p.private) { vscode.window.showWarningMessage('Cannot delete prompts from the GitHub collection.'); return; }
      const ok = await vscode.window.showWarningMessage('Delete this prompt?', { modal: true }, 'Delete');
      if (ok !== 'Delete') return;
      const done = await store.deletePrompt(pid);
      if (done) { await provider.refresh(); await groups.init(); }
    }),
    vscode.commands.registerCommand('promptLibrary.refreshGroups', async () => { await groups.init(); }),
    vscode.commands.registerCommand('promptLibrary.syncOps', () => {
      SyncOpsPanel.show(context);
    }),
    vscode.commands.registerCommand('promptLibrary.syncPullAndImport', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) { vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.'); return; }
      try {
        log.info('Pull & Sync started...');
        const pulled = await gitPull(cfg.repoPath);
        if (!pulled) { log.warn('Pull failed'); vscode.window.showWarningMessage('Pull failed. See Sync Ops for details.'); }
        const groupsFromRepo = await readSharedGroups(vscode.Uri.file(cfg.repoPath), cfg.promptsSubdir);
        const countPrompts = (gs: any[]): number => gs.reduce((acc, g) => acc + (Array.isArray(g.prompts) ? g.prompts.length : 0) + countPrompts(g.children || []), 0);
        const totalPrompts = countPrompts(groupsFromRepo as any);
        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) { vscode.window.showWarningMessage('Shared root not found'); log.warn('Shared root not found'); return; }
        sharedRoot.children = groupsFromRepo.map(g => ({ ...g, kind: 'shared' }));
        sharedRoot.prompts = [];
        await store.save(lib);
        await groups.init();
        await provider.refresh();
        vscode.window.showInformationMessage(`Pull & Sync complete: ${groupsFromRepo.length} groups, ${totalPrompts} prompts.`);
        log.info(`Pull & Sync complete: imported ${groupsFromRepo.length} top-level groups, ${totalPrompts} prompts.`);
      } catch (e: any) {
        log.error(`Pull & Sync failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Pull & Sync failed. See Sync Ops for details.');
      }
    }),

    vscode.commands.registerCommand('promptLibrary.syncPullOverwriteAndImport', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) { vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.'); return; }
      const confirm = await vscode.window.showWarningMessage(
        'This will discard local changes and reset to the remote branch (remote-wins). Continue?',
        { modal: true }, 'Overwrite & Sync'
      );
      if (confirm !== 'Overwrite & Sync') return;
      try {
        log.info('Overwrite Pull & Sync started...');
        const ok = await resetHardToRemote(cfg.repoPath);
        if (!ok) { log.warn('Overwrite pull failed'); vscode.window.showWarningMessage('Overwrite pull failed. See Sync Ops for details.'); return; }
        const groupsFromRepo = await readSharedGroups(vscode.Uri.file(cfg.repoPath), cfg.promptsSubdir);
        const countPrompts = (gs: any[]): number => gs.reduce((acc, g) => acc + (Array.isArray(g.prompts) ? g.prompts.length : 0) + countPrompts(g.children || []), 0);
        const totalPrompts = countPrompts(groupsFromRepo as any);
        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) { vscode.window.showWarningMessage('Shared root not found'); log.warn('Shared root not found'); return; }
        sharedRoot.children = groupsFromRepo.map(g => ({ ...g, kind: 'shared' }));
        sharedRoot.prompts = [];
        await store.save(lib);
        await groups.init();
        await provider.refresh();
        vscode.window.showInformationMessage(`Overwrite Pull & Sync complete: ${groupsFromRepo.length} groups, ${totalPrompts} prompts.`);
        log.info(`Overwrite Pull & Sync complete: imported ${groupsFromRepo.length} top-level groups, ${totalPrompts} prompts.`);
      } catch (e: any) {
        log.error(`Overwrite Pull & Sync failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Overwrite Pull & Sync failed. See Sync Ops for details.');
      }
    }),

    vscode.commands.registerCommand('promptLibrary.exportJson', async () => {
      try {
        const arr = await store.exportPrivateAsStringArray();
        const uri = await vscode.window.showSaveDialog({ filters: { 'JSON': ['json'] }, saveLabel: 'Export Private Prompts' });
        if (!uri) return;
        const bytes = Buffer.from(JSON.stringify(arr, null, 2), 'utf8');
        await vscode.workspace.fs.writeFile(uri, bytes);
        vscode.window.showInformationMessage('Exported private prompts.');
        log.info(`Exported ${arr.length} private prompts to ${uri.fsPath}`);
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
        if (!Array.isArray(obj) || obj.some(x => typeof x !== 'string')) {
          vscode.window.showWarningMessage('Expected a JSON array of strings (one prompt per string).');
          return;
        }
        const res = await store.importStringArrayToUnfiled(obj as string[]);
        vscode.window.showInformationMessage(res.added ? `Imported ${res.added} prompts to Unfiled (${res.skipped} skipped).` : 'No new prompts to import.');
        log.info(res.added ? `Imported ${res.added} prompts to Unfiled (${res.skipped} skipped).` : 'Import: nothing new');
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
        const countPrompts = (gs: any[]): number => gs.reduce((acc, g) => acc + (Array.isArray(g.prompts) ? g.prompts.length : 0) + countPrompts(g.children || []), 0);
        const totalPrompts = countPrompts(groupsFromRepo as any);
        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) { vscode.window.showWarningMessage('Shared root not found'); log.warn('Shared root not found'); return; }
        sharedRoot.children = groupsFromRepo.map(g => ({ ...g, kind: 'shared' }));
        sharedRoot.prompts = [];
        await store.save(lib);
        await groups.init();
        await provider.refresh();
        vscode.window.showInformationMessage(`Sync read complete: ${groupsFromRepo.length} groups, ${totalPrompts} prompts.`);
        log.info(`Sync read complete: imported ${groupsFromRepo.length} top-level groups, ${totalPrompts} prompts.`);
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
      const branch = cfg.branchName && cfg.branchName.trim() ? cfg.branchName.trim() : `prompt-sync/${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)}`;
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
    vscode.commands.registerCommand('promptLibrary.syncClonePullImport', async () => {
      const cfg = getSettings();
      if (!cfg.remoteRepoUrl || !cfg.remoteRepoUrl.trim()) { vscode.window.showWarningMessage('Set promptLibrary.remoteRepoUrl in settings first.'); return; }
      try {
        log.info('Clone/Pull+Import started...');
        let targetPath = cfg.repoPath;

        // If no repoPath is configured, use the default ~/PromptLibrary
        if (!targetPath) {
          targetPath = path.join(os.homedir(), 'PromptLibrary');
        }

        log.info(`Target path: ${targetPath}`);
        log.info(`Remote URL: ${cfg.remoteRepoUrl}`);

        // If the target path doesn't exist or isn't a git repo, clone it
        if (!fs.existsSync(targetPath) || !(await isGitRepo(targetPath))) {
          const parentDir = path.dirname(targetPath);
          const dirName = path.basename(targetPath);
          log.info(`Cloning to parent dir: ${parentDir}, dir name: ${dirName}`);
          try { fs.mkdirSync(parentDir, { recursive: true }); } catch { }
          const cloneResult = await gitClone(parentDir, cfg.remoteRepoUrl, dirName);
          if (!cloneResult.success) {
            log.error(`Clone failed: ${cloneResult.error}`);
            vscode.window.showWarningMessage('Clone failed. See Sync Status.');
            return;
          }
          log.info(`Clone successful to: ${targetPath}`);
        } else {
          log.info(`Repository already exists at: ${targetPath}`);
        }

        // Update the setting to the actual path used (if it wasn't already set)
        if (!cfg.repoPath) {
          await vscode.workspace.getConfiguration('promptLibrary')
            .update('repoPath', targetPath, vscode.ConfigurationTarget.Global);
        }
        const pulled = await gitPull(targetPath);
        if (!pulled) { log.warn('Pull failed'); vscode.window.showWarningMessage('Pull failed. See Sync Status.'); }
        const groupsFromRepo = await readSharedGroups(vscode.Uri.file(targetPath), cfg.promptsSubdir);
        const countPrompts = (gs: any[]): number => gs.reduce((acc, g) => acc + (Array.isArray(g.prompts) ? g.prompts.length : 0) + countPrompts(g.children || []), 0);
        const totalPrompts = countPrompts(groupsFromRepo as any);
        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) { vscode.window.showWarningMessage('Shared root not found'); log.warn('Shared root not found'); return; }
        sharedRoot.children = groupsFromRepo.map(g => ({ ...g, kind: 'shared' }));
        sharedRoot.prompts = [];
        await store.save(lib);
        await groups.init();
        await provider.refresh();
        vscode.window.showInformationMessage(`Sync complete: imported ${groupsFromRepo.length} groups, ${totalPrompts} prompts.`);
        log.info(`Clone/Pull+Import complete: imported ${groupsFromRepo.length} top-level groups, ${totalPrompts} prompts.`);
      } catch (e: any) {
        log.error(`Clone/Pull+Import failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Operation failed. See Sync Status for details.');
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
    vscode.commands.registerCommand('promptLibrary.deleteGroup', (item: GroupItem) => groups.deleteGroup(item.groupId)),
    vscode.commands.registerCommand('promptLibrary.resetAll', async () => {
      const answer = await vscode.window.showWarningMessage('This will reset the Prompt Library to its initial state and remove all prompts and custom groups. Continue?', { modal: true }, 'Reset');
      if (answer !== 'Reset') return;
      try {
        log.info('Resetting Prompt Library to initial state...');
        await store.resetAll();
        await groups.init();
        await provider.refresh();
        vscode.window.showInformationMessage('Prompt Library reset complete.');
        log.info('Reset complete');
      } catch (e: any) {
        log.error(`Reset failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Reset failed. See Sync Status for details.');
      }
    })
  );
}

export function deactivate() { }
function getHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const csp = `<meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${webview.cspSource} https: data:;
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';">`;

  return `<!DOCTYPE html>
<html>
<head>
  ${csp}
  <style>
    :root {
      --accent: var(--vscode-focusBorder);
      --card-bg: var(--vscode-editorWidget-background);
      --panel-bg: var(--vscode-sideBar-background);
      --border: var(--vscode-widget-border);
      --muted: var(--vscode-descriptionForeground);
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: transparent;
      margin: 0;
      line-height: 1.5;
    }
    .container { padding: 16px; display: flex; flex-direction: column; gap: 16px; }

    h3.title {
      font-weight: 700;
      font-size: 14px;
      letter-spacing: .2px;
      margin: 0 0 4px 0;
    }
    .muted { color: var(--muted); }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      box-shadow: 0 1px 0 rgba(0,0,0,.2), 0 8px 24px rgba(0,0,0,.08);
    }
    .toolbar {
      display:flex; gap:8px; align-items:center; flex-wrap: wrap;
    }
    .toolbar .spacer { flex: 1; }


    .headerRow { display:flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .headerRow .leftCol { display:flex; flex-direction: column; align-items: flex-start; gap: 4px; }
    .headerRow .rightCol { display:flex; align-items: flex-start; }

    .btn {
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      color: var(--vscode-foreground);
      cursor: pointer;
      transition: background .15s ease, transform .02s ease, border-color .15s ease, box-shadow .15s ease;
    }
    .btn:hover { background: rgba(255,255,255,0.06); }
    .btn:active { transform: translateY(1px); }
    .btn[disabled] { opacity: .6; cursor: not-allowed; }

    .btn-primary {
      background: var(--accent);
      color: var(--vscode-button-foreground, #000);
      border-color: var(--accent);
      box-shadow: 0 0 0 0 rgba(0,0,0,0);
    }
    .btn-primary:hover { filter: brightness(1.1); }
    .btn-primary:focus { outline: none; box-shadow: 0 0 0 2px rgba(255,255,255,.08), 0 0 0 3px var(--accent); }

    input[type="text"], textarea {
      width: 100%;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground, var(--vscode-foreground));
      padding: 10px 12px;
      outline: none;
      transition: border-color .15s ease, box-shadow .15s ease;
    }
    input[type="text"]::placeholder, textarea::placeholder { color: var(--muted); }
    input[type="text"]:focus, textarea:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(56,189,248,0.15);
    }

    .list { display:flex; flex-direction:column; gap:8px; }
    .item {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      background: rgba(255,255,255,0.02);
      transition: background .15s ease, border-color .15s ease;
    }
    .item:hover { background: rgba(255,255,255,0.04); border-color: var(--accent); }
    .summary { cursor:pointer; font-weight:600; user-select:none; }
    .summary:hover { text-decoration: underline; }

    .tags { margin-top:6px; display:flex; flex-wrap:wrap; gap:6px; }
    .chip {
      font-size:11px; padding:2px 8px; border-radius:999px;
      background: rgba(255,255,255,0.06); color: var(--vscode-foreground); border: 1px solid var(--border);
    }

    .rowActions { margin-left:auto; display:flex; gap:6px; align-items:center; }

    #boot { position: sticky; top: 0; font-size: 11px; opacity: .5; padding: 4px 8px; }
  </style>
</head>
<body>
  <div id="boot">booting…</div>
  <div class="container">
    <div class="card">
      <div class="headerRow">
        <div class="leftCol">
          <h3 class="title">Prompt Library</h3>
          <div id="sel" class="muted">Loading…</div>
        </div>
        <div class="rightCol">
          <button id="syncOpsBtn" class="btn">Sync Ops</button>
        </div>
      </div>
      <div class="toolbar">
        <span id="counts" class="count"></span>
        <div class="spacer"></div>
      </div>
    </div>

    <div class="card">
      <div id="filterRow" style="display:none; gap:8px; align-items:center; margin-bottom:8px;">
        <input id="filter" type="text" placeholder="Filter prompts..." />
        <button id="clearFilter" class="btn">Clear</button>
      </div>
      <div id="bulkbar" class="toolbar" style="display:none;">
        <span id="bulkcount" class="muted">0 selected</span>
        <div class="spacer"></div>
        <button id="bulkMove" class="btn">Move Selected</button>
        <button id="bulkDelete" class="btn">Delete Selected</button>
      </div>
      <div id="list" class="list card" style="display:none;"></div>
    </div>

    <div class="card">
      <label for="titleBox" class="muted" style="display:block;margin-bottom:6px;">Title (optional)</label>
      <input id="titleBox" type="text" placeholder="Defaults to first 20 characters of the prompt" disabled />
      <div style="height:8px;"></div>
      <textarea id="composer" rows="4" placeholder="Select a group to enable the composer" disabled></textarea>
      <div style="height:10px;"></div>
      <div class="toolbar" style="gap:8px; padding:0;">
        <button id="save" class="btn btn-primary" disabled>Add prompt</button>
        <button id="cancelEdit" class="btn" style="display:none;">Cancel</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
  (function(){
    // ---- Boot diagnostics & error bridge ----
    const vscode = acquireVsCodeApi?.();
    const boot = document.getElementById('boot');
    try { if (boot) boot.textContent = 'script running'; } catch{}
    window.onerror = function(message, source, lineno, colno, error){
      try { vscode?.postMessage({ type: 'wv-log', msg: 'ERR: ' + String(message) }); } catch {}
    };

    const sel = document.getElementById('sel');
    const filter = document.getElementById('filter');
    try {
      filter?.setAttribute('disabled','true');
      document.getElementById('clearFilter')?.setAttribute('disabled','true');
      filter?.parentElement?.setAttribute('style','display:none;');
    } catch {}
    const list = document.getElementById('list');
    const composer = document.getElementById('composer');
    const save = document.getElementById('save');
    const titleBox = document.getElementById('titleBox');
    const counts = document.getElementById('counts');
    const cancelBtn = document.getElementById('cancelEdit');



	    let editingId = null;

    function first20(s){ return (String(s||'')).replace(/\\r\\n?|\\n/g,' ').slice(0,20).trim(); }

    // Optimistically enable inputs so they can receive focus immediately
    try {
      composer?.removeAttribute('disabled');
      save?.removeAttribute('disabled');
      titleBox?.removeAttribute('disabled');
    } catch {}

    // Auto-suggest title from first 20 chars if empty
    composer?.addEventListener('input', () => {
      if (!titleBox) return;
      if (!titleBox.value || !titleBox.value.trim()) {
        titleBox.value = first20(composer.value || '');
      }
    });

    let allPrompts = [];
    try { vscode?.postMessage({ type: 'ready' }); vscode?.postMessage({ type: 'wv-log', msg: 'boot' }); } catch {}

    const selected = new Set();
    function summarize(text){
      const first = (text||'').split(/\\r?\\n/,1)[0];
      return first.length > 120 ? first.slice(0,117) + '\\u2026' : first;
    }
    function normalized(t){ return (t||'').replace(/\\r\\n|\\r/g,'\\n').replace(/\\s+/g,' ').trim().toLowerCase(); }
    function renderCounts(shown){ if (counts) counts.textContent = ''; }

    function renderSelectionBar(){
      const bulkbar = document.getElementById('bulkbar');
      const bulkcount = document.getElementById('bulkcount');
      const n = selected.size;
      if (!bulkbar || !bulkcount) return;
      if (n > 0) { bulkbar.style.display = 'flex'; bulkcount.textContent = n + ' selected'; }
      else { bulkbar.style.display = 'none'; }
    }

    function renderList(prompts){
      if (!list) return;
      list.innerHTML = '';
      list.style.display = 'none';
      renderCounts(0);
      const bulkbar = document.getElementById('bulkbar'); if (bulkbar) bulkbar.style.display = 'none';
    }

    function applyFilter(){ renderList(allPrompts); } // filtering disabled

    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      try { vscode?.postMessage({ type: 'wv-log', msg: 'recv ' + String(msg.type) + (Array.isArray(msg.payload) ? (' len=' + msg.payload.length) : '') }); } catch {}
      if (msg.type === 'selectedGroup') {
        // Leaving edit mode when switching groups to avoid overwriting an existing prompt
        editingId = null;
        if (save) save.textContent = 'Add prompt';
        if (cancelBtn) cancelBtn.style.display = 'none';

        const g = msg.payload;
        if (!g || !g.id) {
          sel && (sel.textContent = 'No group selected');
          composer?.setAttribute('disabled','true');
          save?.setAttribute('disabled','true');
          titleBox?.setAttribute('disabled','true');
          composer && composer.setAttribute('placeholder','Select a group to enable the composer');
          allPrompts = [];
          renderList([]);
        } else {
          sel && (sel.textContent = 'Selected group: ' + (g.name || g.id));
          try { if (filter) filter.value = ''; } catch {}
          selected.clear(); renderSelectionBar();
          if (g.id === 'root-shared' || g.id === 'root-private') {
            composer?.setAttribute('disabled','true');
            save?.setAttribute('disabled','true');
            titleBox?.setAttribute('disabled','true');
            composer && composer.setAttribute('placeholder','Select a subgroup to add prompts');
          } else {
            composer?.removeAttribute('disabled');
            save?.removeAttribute('disabled');
            titleBox?.removeAttribute('disabled');
            composer && composer.setAttribute('placeholder', 'Write a new prompt for ' + (g.name || g.id) + '...');
          }
        }
      } else if (msg.type === 'prompts') {
        allPrompts = Array.isArray(msg.payload) ? msg.payload : [];
        try { vscode?.postMessage({ type: 'wv-log', msg: 'render prompts=' + allPrompts.length }); } catch {}
        applyFilter();
      } else if (msg.type === 'populateComposer') {
        const p = msg.payload || {};
        if (titleBox) titleBox.value = String(p.title || '');
        if (composer) { composer.value = String(p.text || ''); try { composer.focus(); } catch {} }
        editingId = (p.id ? String(p.id) : null);
        if (save) save.textContent = 'Save changes';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
      }
    });

    document.getElementById('bulkDelete')?.addEventListener('click', () => {
      if (selected.size === 0) return;
      vscode?.postMessage({ type: 'deleteMany', ids: Array.from(selected) });
      selected.clear(); renderSelectionBar();
    });
    document.getElementById('bulkMove')?.addEventListener('click', () => {
      if (selected.size === 0) return;
      vscode?.postMessage({ type: 'moveMany', ids: Array.from(selected) });
      selected.clear(); renderSelectionBar();
    });

    document.getElementById('syncOpsBtn')?.addEventListener('click', () => vscode?.postMessage({ type: 'runCmd', command: 'promptLibrary.syncOps' }));

    save?.addEventListener('click', () => {
      const text = composer?.value || '';
      if (!text.trim()) return;
      const rawTitle = (titleBox && titleBox.value) ? titleBox.value.trim() : '';
      const fallback = first20(text);
      const title = rawTitle || fallback;
      if (editingId) {
        vscode?.postMessage({ type: 'editPrompt', id: editingId, text, title });
        editingId = null;
        if (save) save.textContent = 'Add prompt'; if (cancelBtn) cancelBtn.style.display = 'none';
      } else {
        const seen = new Set(allPrompts.map(p => normalized(p.text)));
        if (seen.has(normalized(text))) { alert('Duplicate prompt'); return; }
        vscode?.postMessage({ type: 'addPrompt', text, title });
      }
      if (composer) composer.value = '';
      if (titleBox) titleBox.value = '';
      try { if (filter) filter.value = ''; } catch {};
    });
    // Cancel editing: restore add mode and clear fields
    cancelBtn?.addEventListener('click', () => {
      editingId = null;
      if (save) save.textContent = 'Add prompt';
      if (cancelBtn) cancelBtn.style.display = 'none';
      if (composer) composer.value = '';
      if (titleBox) titleBox.value = '';
      try { if (filter) filter.value = ''; } catch {};
    });

  })();
  </script>
</body>
</html>`;
}


function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}


