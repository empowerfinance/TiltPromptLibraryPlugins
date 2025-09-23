// extension.ts
import * as vscode from 'vscode';
import { LibraryStore } from './store';
import { GroupsProvider, GroupItem } from './groups';
import { Prompt } from './model';
import { getSettings } from './settings';
import { writeSharedGroups } from './sync/yamlWriter';
import { log } from './log';
import { checkoutNewBranch, commit as gitCommit, getCurrentBranch, getRemoteUrl, isGitRepo, push as gitPush, stageAll, tryBuildGithubCompareUrl, fetch as gitFetch, pull as gitPull, clone as gitClone } from './sync/git';
import { start as startScheduler } from './sync/scheduler';
import { readSharedGroups } from './sync/yamlReader';
import { SyncOpsPanel } from './syncOps';

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

class PromptLibraryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'promptLibraryView';
  private view?: vscode.WebviewView;
  private selectedGroup: { id: string | null; name: string | null } = { id: null, name: null };

  constructor(private readonly store: LibraryStore) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage(msg => this.onMessage(msg));
    webviewView.webview.html = getHtml(webviewView.webview);
    // Ensure the webview reflects the current selection even if it resolved after selection happened
    log.info(`Webview resolved; replaying selected group: id=${this.selectedGroup.id ?? 'null'}, name=${this.selectedGroup.name ?? 'null'}`);
    webviewView.webview.postMessage({ type: 'selectedGroup', payload: this.selectedGroup });
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
      case 'ready': {
        log.info('Prompt Library webview ready');
        // Re-send current selection and list
        this.view?.webview.postMessage({ type: 'selectedGroup', payload: this.selectedGroup });
        await this.pushList();
        break;
      }
      case 'wv-log': {
        try { log.info(`[webview] ${String(msg.msg ?? '')}`); } catch {}
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
    log.info(`Webview setSelectedGroup: id=${effective.id ?? 'null'}, name=${effective.name ?? 'null'}, hasView=${!!this.view}`);
    this.view?.webview.postMessage({ type: 'selectedGroup', payload: effective });
    // When selection changes, refresh list for that group
    await this.pushList();
  }
}

export function activate(context: vscode.ExtensionContext) {
  const store = new LibraryStore(context);
  const provider = new PromptLibraryViewProvider(store);
  const groups = new GroupsProvider(store);
  groups.init();

  // Start auto-fetch scheduler
  startScheduler(context);

  const treeView = vscode.window.createTreeView('promptLibraryGroups', { treeDataProvider: groups, showCollapseAll: true });
  treeView.onDidChangeSelection(async e => {
    const item = e.selection[0];
    if (!item) {
      log.info('Selection cleared');
      provider.setSelectedGroup({ id: null, name: null });
      return;
    }
    const id = item.groupId;
    const name = item.label?.toString() ?? null;
    log.info(`Selected group item: id=${id}, name=${name}`);
    // Treat roots as valid selections; we redirect in setSelectedGroup to show actual prompts
    await provider.setSelectedGroup({ id, name });
  });

  // Keep groups permanently expanded: if user collapses, immediately re-expand
  treeView.onDidCollapseElement(e => {
    try { treeView.reveal(e.element, { expand: 10 }); } catch {}
  });
  // Also ensure expand cascades to deeper levels when user expands a node
  treeView.onDidExpandElement(e => {
    try { treeView.reveal(e.element, { expand: 10 }); } catch {}
  });


  // *** PATCH: default selection to Unfiled so the view is immediately usable ***
  provider.setSelectedGroup({ id: 'grp-unfiled', name: 'Unfiled' });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PromptLibraryViewProvider.viewType, provider),

    treeView,
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
          try { fs.mkdirSync(parentDir, { recursive: true }); } catch {}
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

export function deactivate() {}

function getHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">`;
  return `<!DOCTYPE html><html><head>${csp}
  <style>
    body { font-family: var(--vscode-font-family); margin: 0; }
    .container { padding: 12px; }
    .toolbar { display:flex; gap:8px; align-items:center; margin-bottom: 8px; }
    /* Compact, neutral buttons (no big blue buttons) */
    .btn { padding: 2px 6px; background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-widget-border); border-radius: 3px; cursor: pointer; }
    .btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.06)); }
    /* Icon-sized buttons for per-item actions on the right */
    .iconbtn { padding: 0 4px; background: transparent; color: var(--vscode-foreground); border: none; cursor: pointer; opacity: 0.8; }
    .iconbtn:hover { opacity: 1; }
    .muted { color: var(--vscode-descriptionForeground); }
    .count { margin-left:auto; font-size: 12px; }
    .list { display:flex; flex-direction:column; gap:8px; }
    .item { border: 1px solid var(--vscode-widget-border); border-radius:4px; padding:8px; }
    .summary { cursor:pointer; font-weight:600; user-select:none; }
    .summary:hover { text-decoration: underline; }
    .tags { margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; }
    .chip { font-size:11px; padding:1px 6px; border-radius:10px; background: var(--vscode-editorCodeLens-foreground); color: var(--vscode-editor-foreground); }
    .body { display:none; margin-top:6px; white-space:pre-wrap; }
    .rowActions { margin-left:auto; display:flex; gap:4px; align-items:center; }
  </style></head><body>
  <div class="container">
    <h3>Prompt Library</h3>
    <div id="sel" class="muted">No group selected</div>
    <div class="toolbar">
      <button id="importBtn" class="btn">Import JSON</button>
      <button id="exportBtn" class="btn">Export JSON</button>
      <button id="dedupeBtn" class="btn">Deduplicate</button>
      <button id="resetBtn" class="btn">Reset</button>
      <button id="syncOpsBtn" class="btn">Sync Ops</button>

      <span id="counts" class="count"></span>
    </div>
    <div id="filterRow" style="display:none; gap:8px; align-items:center; margin-bottom:8px;">
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
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const sel = document.getElementById('sel');
    try { sel.textContent = 'Loading...'; } catch {}
    const filter = document.getElementById('filter');
    // Temporarily disable filter UI
    try {
      filter?.setAttribute('disabled','true');
      document.getElementById('clearFilter')?.setAttribute('disabled','true');
      filter?.parentElement?.setAttribute('style','display:none;');
    } catch {}
    const list = document.getElementById('list');
    const composer = document.getElementById('composer');
    const save = document.getElementById('save');
    const counts = document.getElementById('counts');

    let allPrompts = [];
    // Notify extension that the webview is ready so it can (re)send selection and list
    try { vscode.postMessage({ type: 'ready' }); vscode.postMessage({ type: 'wv-log', msg: 'boot' }); } catch {}

    const selected = new Set();

    function summarize(text){
      const first = (text||'').split(/\\r?\\n/,1)[0];
      return first.length > 120 ? first.slice(0,117) + '\\u2026' : first;
    }
    function normalized(t){ return (t||'').replace(/\\r\\n|\\r/g,'\\n').replace(/\\s+/g, ' ').trim().toLowerCase(); }
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
        const selectCb = document.createElement('input'); selectCb.type='checkbox'; selectCb.onchange = () => { if (selectCb.checked) selected.add(p.id); else selected.delete(p.id); renderSelectionBar(); };
        const title = document.createElement('div'); title.className = 'summary'; title.textContent = summarize(p.text); title.style.flex='1'; title.title='Click to copy';
        // Clicking the prompt title copies the text
        title.onclick = () => vscode.postMessage({ type: 'copyPrompt', text: p.text });

        // Right-aligned inline actions
        const actions = document.createElement('div'); actions.className = 'rowActions';
        const body = document.createElement('div'); body.className = 'body'; body.textContent = p.text;
        const expandBtn = document.createElement('button'); expandBtn.className='iconbtn'; expandBtn.title='Show/Hide details'; expandBtn.textContent='▾';
        expandBtn.onclick = () => { body.style.display = (body.style.display === 'none' || body.style.display === '') ? 'block' : 'none'; };

        const copyBtn = document.createElement('button'); copyBtn.className='iconbtn'; copyBtn.title='Copy'; copyBtn.textContent='📋';
        copyBtn.onclick = () => vscode.postMessage({ type: 'copyPrompt', text: p.text });

        const editBtn = document.createElement('button'); editBtn.className='iconbtn'; editBtn.title='Edit'; editBtn.textContent='✏️';
        editBtn.onclick = () => {
          body.style.display = 'block';
          const ta = document.createElement('textarea'); ta.style.width='100%'; ta.rows=6; ta.value = p.text;
          const row2 = document.createElement('div'); row2.style.display='flex'; row2.style.gap='6px'; row2.style.marginTop='6px';
          const saveBtn = document.createElement('button'); saveBtn.className='btn'; saveBtn.textContent='Save';
          const cancelBtn = document.createElement('button'); cancelBtn.className='btn'; cancelBtn.textContent='Cancel';
          saveBtn.onclick = () => { vscode.postMessage({ type: 'editPrompt', id: p.id, text: ta.value }); };
          cancelBtn.onclick = () => { vscode.postMessage({ type: 'requestList' }); };
          body.innerHTML=''; body.appendChild(ta); row2.append(saveBtn, cancelBtn); body.appendChild(row2);
        };

        const moveBtn = document.createElement('button'); moveBtn.className='iconbtn'; moveBtn.title='Move'; moveBtn.textContent='⇄';
        moveBtn.onclick = () => vscode.postMessage({ type: 'movePrompt', id: p.id });

        const delBtn = document.createElement('button'); delBtn.className='iconbtn'; delBtn.title='Delete'; delBtn.textContent='🗑';
        delBtn.onclick = () => vscode.postMessage({ type: 'deletePrompt', id: p.id });

        actions.append(expandBtn, copyBtn, editBtn, moveBtn, delBtn);
        row.append(selectCb, title, actions);
        const tags = document.createElement('div'); tags.className='tags'; tags.innerHTML = (p.tags||[]).map(t => '<span class="chip">'+t+'</span>').join(' ');
        item.append(row, body, tags);
        list.appendChild(item);
      });
      renderCounts(prompts.length);
      renderSelectionBar();
    }

    function applyFilter() {
      // Filter disabled: always render full list
      renderList(allPrompts);
    }

    window.addEventListener('message', (event) => {
      const msg = event.data || {};
      try { vscode.postMessage({ type: 'wv-log', msg: 'recv ' + String(msg.type) + (Array.isArray(msg.payload) ? (' len=' + msg.payload.length) : '') }); } catch {}
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
          // Clear filter and selection on group change
          try { filter.value = ''; } catch {}
          selected.clear(); renderSelectionBar();
          // Disable composer at root; enable for subgroups
          if (g.id === 'root-shared' || g.id === 'root-private') {
            composer.setAttribute('disabled','true');
            save.setAttribute('disabled','true');
            composer.setAttribute('placeholder','Select a subgroup to add prompts');
          } else {
            composer.removeAttribute('disabled');
            save.removeAttribute('disabled');
            composer.setAttribute('placeholder', 'Write a new prompt for ' + (g.name || g.id) + '...');
          }
          vscode.postMessage({ type: 'requestList' });
        }
      } else if (msg.type === 'prompts') {
        allPrompts = Array.isArray(msg.payload) ? msg.payload : [];
        // *** PATCH: small extra client log to confirm render size ***
        try { vscode.postMessage({ type: 'wv-log', msg: 'render prompts=' + allPrompts.length }); } catch {}
        applyFilter();
      }
    });

    // Bulk bar actions
    document.getElementById('bulkDelete')?.addEventListener('click', () => {
      if (selected.size === 0) return;
      vscode.postMessage({ type: 'deleteMany', ids: Array.from(selected) });
      selected.clear(); renderSelectionBar();
    });
    document.getElementById('bulkMove')?.addEventListener('click', () => {
      if (selected.size === 0) return;
      vscode.postMessage({ type: 'moveMany', ids: Array.from(selected) });
      selected.clear(); renderSelectionBar();
    });

    // Toolbar
    document.getElementById('importBtn')?.addEventListener('click', () => vscode.postMessage({ type: 'runCmd', command: 'promptLibrary.importJson' }));
    document.getElementById('exportBtn')?.addEventListener('click', () => vscode.postMessage({ type: 'runCmd', command: 'promptLibrary.exportJson' }));
    document.getElementById('syncOpsBtn')?.addEventListener('click', () => vscode.postMessage({ type: 'runCmd', command: 'promptLibrary.syncOps' }));

    document.getElementById('dedupeBtn')?.addEventListener('click', () => vscode.postMessage({ type: 'runCmd', command: 'promptLibrary.deduplicate' }));
    document.getElementById('resetBtn')?.addEventListener('click', () => vscode.postMessage({ type: 'runCmd', command: 'promptLibrary.resetAll' }));

    // Add
    save.addEventListener('click', () => {
      const text = composer.value || '';
      if (!text.trim()) return;
      const seen = new Set(allPrompts.map(p => normalized(p.text)));
      if (seen.has(normalized(text))) { alert('Duplicate prompt'); return; }
      vscode.postMessage({ type: 'addPrompt', text });
      composer.value = '';
      try { filter.value = ''; } catch {};
    });
  </script>
</body></html>`;

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

}
