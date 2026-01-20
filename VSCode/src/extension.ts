// extension.ts
import * as vscode from 'vscode';
import { LibraryStore } from './store';
import { GroupsProvider, GroupItem, PromptItem } from './groups';
import { Prompt, Group } from './model';
import { getSettings, getActiveLibrary, getLibraryPath, setActiveLibrary, discoverLibraries, onSettingsChanged, getHiddenLibraryPaths, setHiddenLibraries, getEnabledLibraries, showAllLibraries, hideAllLibraries, setRemoteRepoUrl, setRepoPath } from './settings';
import { writeSharedGroups, writeToLibrary } from './sync/yamlWriter';
import { log } from './log';
import { checkoutNewBranch, commit as gitCommit, getCurrentBranch, getRemoteUrl, isGitRepo, push as gitPush, stageAll, getGitVersion } from './sync/hybridGit';
import { tryBuildGithubCompareUrl, fetch as gitFetch, pull as gitPull, clone as gitClone, resetHardToRemote, cleanUntracked } from './sync/git';
import { start as startScheduler } from './sync/scheduler';
import { readSharedGroups, readFromLibrary, readFromLibraries } from './sync/yamlReader';
import { SyncOpsPanel } from './syncOps';
import { loadHtmlTemplate, getNonce, generateCSP } from './ui/htmlLoader';

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';


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
        try { const lib = await this.store.getLibrary(); this.groups.setLibrary(lib); } catch { }
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
        try { const lib = await this.store.getLibrary(); this.groups.setLibrary(lib); } catch { }
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
    try { await this.memento.update('promptLibrary.lastSelectedGroup', effective); } catch { }
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
  ) { }

  handleDrag(source: readonly (GroupItem | PromptItem)[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
    try {
      const promptItems = source.filter(s => (s as any).promptId) as PromptItem[];
      if (!promptItems.length) return;
      const payload = {
        promptIds: promptItems.map(p => (p as any).promptId as string),
        fromGroupId: (promptItems[0] as any).groupId as string | undefined,
      };
      dataTransfer.set(this.mime, new vscode.DataTransferItem(JSON.stringify(payload)));
    } catch { }
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
    } catch { }
  }

  dispose() { }
}

// ============================================================================
// Library Status Bar
// ============================================================================

let libraryStatusBarItem: vscode.StatusBarItem | undefined;

function updateLibraryStatusBar(): void {
  if (!libraryStatusBarItem) return;
  const activeLibrary = getActiveLibrary();
  const enabledLibraries = getEnabledLibraries();
  const libraryCount = enabledLibraries.length;

  if (libraryCount > 1) {
    libraryStatusBarItem.text = `$(library) ${activeLibrary.displayName} (+${libraryCount - 1})`;
    libraryStatusBarItem.tooltip = `Active Library: ${activeLibrary.displayName}\nEnabled Libraries: ${enabledLibraries.map(l => l.displayName).join(', ')}\nClick to switch active library`;
  } else {
    libraryStatusBarItem.text = `$(library) ${activeLibrary.displayName}`;
    libraryStatusBarItem.tooltip = `Active Library: ${activeLibrary.displayName}\nClick to switch libraries`;
  }
  libraryStatusBarItem.show();
}

export function activate(context: vscode.ExtensionContext) {
  const store = new LibraryStore(context);

  // Create status bar item for library indicator
  libraryStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  libraryStatusBarItem.command = 'promptLibrary.selectLibrary';
  updateLibraryStatusBar();
  context.subscriptions.push(libraryStatusBarItem);

  // Update status bar when settings change
  context.subscriptions.push(onSettingsChanged(() => updateLibraryStatusBar()));


  const groups = new GroupsProvider(store);
  groups.init();
  const provider = new PromptLibraryViewProvider(store, context.globalState, groups);


  // Auto-refresh tree + webview whenever the library changes
  const storeSub = store.onDidChange(async () => {
    try { await groups.refreshFromStore(); } catch { }
    try { await provider.refresh(); } catch { }
  });
  context.subscriptions.push(storeSub);

  // Auto-read from disk on activation if repo is configured
  const cfg = getSettings();
  if (cfg.repoPath) {
    (async () => {
      try {
        log.info('Auto-reading libraries from disk on activation...');
        const enabledLibraries = getEnabledLibraries();
        const libraryGroupsMap = await readFromLibraries(cfg.repoPath, enabledLibraries, 'prompts');

        const addLibraryMetadata = (grps: Group[], libraryId: string): Group[] => {
          return grps.map(g => {
            // Prefix group ID with libraryId to make it unique across libraries
            const uniqueGroupId = g.id.startsWith(`${libraryId}:`) ? g.id : `${libraryId}:${g.id}`;
            return {
              ...g,
              id: uniqueGroupId,
              kind: 'shared' as const,
              libraryId,
              prompts: g.prompts.map(p => ({
                ...p,
                id: p.id.startsWith(`${libraryId}:`) ? p.id : `${libraryId}:${p.id}`,
                libraryId
              })),
              children: addLibraryMetadata(g.children || [], libraryId)
            };
          });
        };

        const allGroups: Group[] = [];
        for (const [libraryId, grps] of libraryGroupsMap) {
          const groupsWithMetadata = addLibraryMetadata(grps, libraryId);
          allGroups.push(...groupsWithMetadata);
        }

        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (sharedRoot) {
          sharedRoot.children = allGroups;
          sharedRoot.prompts = [];
          await store.save(lib);
          await groups.init();
          log.info(`Auto-read complete: ${allGroups.length} groups from ${enabledLibraries.length} library(ies)`);
        }
      } catch (e: any) {
        log.warn(`Auto-read on activation failed: ${e?.message || e}`);
      }
    })();
  }

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
          // Bring container into focus FIRST to ensure webview is resolved
          try { await vscode.commands.executeCommand('workbench.view.extension.promptLibrary'); } catch { }

          await vscode.env.clipboard.writeText(p.text || '');

          // Also switch the Prompt Library context to the prompt's group so composer is enabled
          const gid = (item as any).groupId as (string | undefined);
          if (gid) {
            const g = groups.getGroupById(gid);
            await provider.setSelectedGroup({ id: gid, name: g?.name ?? gid });
          }

          // Populate the composer with this prompt's content for viewing/editing
          // (do this AFTER ensuring view is visible and group is selected)
          provider.populateComposer({ id: pid, title: p.title, text: p.text || '' });

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
    dnd,
    treeView,
    // Prompt item commands (used by inline actions in the Groups tree)
    vscode.commands.registerCommand('promptLibrary.openPrompt', async (arg?: any) => {
      try {
        const pid: string | undefined = typeof arg === 'string' ? arg : arg?.promptId;
        if (!pid) return;
        const p = await store.getPromptById(pid);
        if (!p) return;

        // Bring container into focus FIRST to ensure webview is resolved
        try { await vscode.commands.executeCommand('workbench.view.extension.promptLibrary'); } catch { }

        await vscode.env.clipboard.writeText(p.text || '');

        // Populate the composer with this prompt's content for viewing/editing
        // (do this AFTER ensuring view is visible)
        provider.populateComposer({ id: pid, title: p.title, text: p.text || '' });

        vscode.window.setStatusBarMessage('Prompt copied to clipboard', 1500);
      } catch (e) { log.warn('openPrompt failed: ' + String((e as any)?.message || e)); }
    }),
    vscode.commands.registerCommand('promptLibrary.sendToAugment', async (arg?: any) => {
      log.info('=== Send to Augment: START ===');
      try {
        const pid: string | undefined = typeof arg === 'string' ? arg : arg?.promptId;
        log.info(`Send to Augment: promptId = ${pid}`);
        if (!pid) {
          log.warn('Send to Augment: No promptId provided');
          return;
        }

        const p = await store.getPromptById(pid);
        if (!p) {
          log.warn(`Send to Augment: Prompt not found for id ${pid}`);
          return;
        }

        const promptText = p.text || '';
        log.info(`Send to Augment: Prompt text length = ${promptText.length} chars`);
        log.info(`Send to Augment: Prompt preview = ${promptText.substring(0, 50)}...`);

        // Copy to clipboard first (fallback)
        log.info('Send to Augment: Copying to clipboard...');
        await vscode.env.clipboard.writeText(promptText);
        log.info('Send to Augment: ✓ Clipboard copy successful');

        // Try to send to Augment
        try {
          log.info('Send to Augment: Starting integration...');

          // Augment uses Cmd+L / Ctrl+L to open its chat panel
          // But we need to find the actual command name
          const allCommands = await vscode.commands.getCommands(true);
          const augmentCommands = allCommands.filter(cmd => cmd.toLowerCase().includes('augment') && cmd.toLowerCase().includes('chat'));
          log.info(`Send to Augment: Found ${augmentCommands.length} Augment chat commands: ${JSON.stringify(augmentCommands.slice(0, 10))}`);

          // Try to open Augment's chat panel and paste
          let success = false;

          // Strategy 1: Try to focus Augment's chat panel directly
          const chatFocusCommands = augmentCommands.filter(cmd =>
            cmd.includes('focus') || cmd.includes('open') || cmd.includes('show')
          );

          for (const cmd of chatFocusCommands) {
            try {
              log.info(`Send to Augment: Trying command: ${cmd}`);
              await vscode.commands.executeCommand(cmd);
              log.info(`Send to Augment: ✓ ${cmd} executed`);

              // Wait longer for Augment's input to be ready and focused
              await new Promise(resolve => setTimeout(resolve, 500));

              // The text is already in clipboard from earlier
              // Just try to paste it
              try {
                log.info('Send to Augment: Attempting paste from clipboard...');
                await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
                log.info('Send to Augment: ✓ Paste command executed');

                // Give it a moment to paste
                await new Promise(resolve => setTimeout(resolve, 100));

                vscode.window.setStatusBarMessage('✓ Sent to Augment', 2000);
                success = true;
                break;
              } catch (pasteError: any) {
                log.warn(`Send to Augment: Paste failed - ${pasteError?.message}`);

                // Fallback: Just show a message
                vscode.window.showInformationMessage(
                  '✓ Augment opened! Prompt copied to clipboard - paste with Cmd+V'
                );
                success = true;
                break;
              }
            } catch (e: any) {
              log.warn(`Send to Augment: ${cmd} failed - ${e?.message}`);
            }
          }

          if (!success) {
            throw new Error('Could not open Augment chat panel');
          }
        } catch (chatError: any) {
          log.warn(`Send to Augment: Chat integration failed - ${chatError?.message || chatError}`);
          log.warn(`Send to Augment: Error stack: ${chatError?.stack || 'no stack'}`);

          // Chat command failed - show helpful message
          vscode.window.showInformationMessage(
            '✓ Prompt copied! Open your AI chat (Cmd+K or Cmd+I) and paste with Cmd+V',
            'Got it',
            'Configure Chat Provider'
          ).then(selection => {
            if (selection === 'Configure Chat Provider') {
              vscode.window.showInformationMessage(
                'To use Augment with VS Code\'s built-in chat:\n' +
                '1. Make sure Augment is set as your default chat provider\n' +
                '2. Check Settings → Chat → Default Provider\n' +
                '3. Or use Cmd+K to open Augment directly',
                'Open Settings'
              ).then(choice => {
                if (choice === 'Open Settings') {
                  vscode.commands.executeCommand('workbench.action.openSettings', 'chat');
                }
              });
            }
          });
        }
      } catch (e: any) {
        log.error(`Send to Augment: FATAL ERROR - ${e?.message || e}`);
        log.error(`Send to Augment: Error stack: ${e?.stack || 'no stack'}`);
        vscode.window.showWarningMessage('Failed to send to Augment. Prompt is in clipboard.');
      }
      log.info('=== Send to Augment: END ===');
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
      try { if (gid) { const g = groups.getGroupById(gid); await provider.setSelectedGroup({ id: gid, name: g?.name ?? gid }); } } catch { }
      try { await vscode.commands.executeCommand('workbench.view.extension.promptLibrary'); } catch { }
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
    vscode.commands.registerCommand('promptLibrary.refreshTree', async () => {
      const cfg = getSettings();
      if (cfg.repoPath) {
        try {
          // Re-read all libraries from disk
          const enabledLibraries = getEnabledLibraries();
          const libraryGroupsMap = await readFromLibraries(cfg.repoPath, enabledLibraries, 'prompts');

          const addLibraryMetadata = (grps: Group[], libraryId: string): Group[] => {
            return grps.map(g => {
              const uniqueGroupId = g.id.startsWith(`${libraryId}:`) ? g.id : `${libraryId}:${g.id}`;
              return {
                ...g,
                id: uniqueGroupId,
                kind: 'shared' as const,
                libraryId,
                prompts: g.prompts.map(p => ({
                  ...p,
                  id: p.id.startsWith(`${libraryId}:`) ? p.id : `${libraryId}:${p.id}`,
                  libraryId
                })),
                children: addLibraryMetadata(g.children || [], libraryId)
              };
            });
          };

          const allGroups: Group[] = [];
          let totalPrompts = 0;
          for (const [libraryId, grps] of libraryGroupsMap) {
            const groupsWithMetadata = addLibraryMetadata(grps, libraryId);
            allGroups.push(...groupsWithMetadata);
            totalPrompts += grps.reduce((sum, g) => sum + (g.prompts?.length || 0), 0);
          }

          const lib = await store.getLibrary();
          const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
          if (sharedRoot) {
            sharedRoot.children = allGroups;
            sharedRoot.prompts = [];
            await store.save(lib);
            await groups.init();
          }
          log.info(`Refreshed: ${allGroups.length} groups, ${totalPrompts} prompts from ${enabledLibraries.length} libraries`);
        } catch (e: any) {
          log.error(`Refresh failed: ${e.message}`);
          // Still try to refresh tree even if read fails
          groups.refresh();
        }
      } else {
        // No repo path, just refresh the tree
        groups.refresh();
      }
    }),
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

        // Read from all enabled libraries
        const enabledLibraries = getEnabledLibraries();
        const libraryGroupsMap = await readFromLibraries(cfg.repoPath, enabledLibraries, 'prompts');

        const addLibraryMetadata = (grps: Group[], libraryId: string): Group[] => {
          return grps.map(g => {
            const uniqueGroupId = g.id.startsWith(`${libraryId}:`) ? g.id : `${libraryId}:${g.id}`;
            return {
              ...g,
              id: uniqueGroupId,
              kind: 'shared' as const,
              libraryId,
              prompts: g.prompts.map(p => ({
                ...p,
                id: p.id.startsWith(`${libraryId}:`) ? p.id : `${libraryId}:${p.id}`,
                libraryId
              })),
              children: addLibraryMetadata(g.children || [], libraryId)
            };
          });
        };

        const allGroups: Group[] = [];
        let totalPrompts = 0;
        for (const [libraryId, grps] of libraryGroupsMap) {
          const groupsWithMetadata = addLibraryMetadata(grps, libraryId);
          allGroups.push(...groupsWithMetadata);
          const countPrompts = (gs: Group[]): number => gs.reduce((acc, g) => acc + (g.prompts?.length || 0) + countPrompts(g.children || []), 0);
          totalPrompts += countPrompts(grps);
        }

        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) { vscode.window.showWarningMessage('Shared root not found'); log.warn('Shared root not found'); return; }
        sharedRoot.children = allGroups;
        sharedRoot.prompts = [];
        await store.save(lib);
        await groups.init();
        await provider.refresh();
        vscode.window.showInformationMessage(`Pull & Sync complete: ${allGroups.length} groups, ${totalPrompts} prompts from ${enabledLibraries.length} library(ies).`);
        log.info(`Pull & Sync complete: imported ${allGroups.length} top-level groups, ${totalPrompts} prompts from ${enabledLibraries.length} library(ies).`);
      } catch (e: any) {
        log.error(`Pull & Sync failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Pull & Sync failed. See Sync Ops for details.');
      }
    }),

    vscode.commands.registerCommand('promptLibrary.syncPullOverwriteAndImport', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) { vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.'); return; }
      const confirm = await vscode.window.showWarningMessage(
        'This will discard local changes (including untracked files) and reset to the remote branch (remote-wins). Continue?',
        { modal: true }, 'Overwrite & Sync'
      );
      if (confirm !== 'Overwrite & Sync') return;
      try {
        log.info('Overwrite Pull & Sync started...');
        const ok = await resetHardToRemote(cfg.repoPath);
        if (!ok) { log.warn('Overwrite pull failed'); vscode.window.showWarningMessage('Overwrite pull failed. See Sync Ops for details.'); return; }
        // Also remove untracked files so local-only changes don't linger
        try {
          const cleaned = await cleanUntracked(cfg.repoPath);
          if (!cleaned) { log.warn('git clean -fd failed; some untracked files may remain.'); }
        } catch { }

        // Read from all enabled libraries
        const enabledLibraries = getEnabledLibraries();
        const libraryGroupsMap = await readFromLibraries(cfg.repoPath, enabledLibraries, 'prompts');

        const addLibraryMetadata = (grps: Group[], libraryId: string): Group[] => {
          return grps.map(g => {
            const uniqueGroupId = g.id.startsWith(`${libraryId}:`) ? g.id : `${libraryId}:${g.id}`;
            return {
              ...g,
              id: uniqueGroupId,
              kind: 'shared' as const,
              libraryId,
              prompts: g.prompts.map(p => ({
                ...p,
                id: p.id.startsWith(`${libraryId}:`) ? p.id : `${libraryId}:${p.id}`,
                libraryId
              })),
              children: addLibraryMetadata(g.children || [], libraryId)
            };
          });
        };

        const allGroups: Group[] = [];
        let totalPrompts = 0;
        for (const [libraryId, grps] of libraryGroupsMap) {
          const groupsWithMetadata = addLibraryMetadata(grps, libraryId);
          allGroups.push(...groupsWithMetadata);
          const countPrompts = (gs: Group[]): number => gs.reduce((acc, g) => acc + (g.prompts?.length || 0) + countPrompts(g.children || []), 0);
          totalPrompts += countPrompts(grps);
        }

        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) { vscode.window.showWarningMessage('Shared root not found'); log.warn('Shared root not found'); return; }
        sharedRoot.children = allGroups;
        sharedRoot.prompts = [];
        await store.save(lib);
        await groups.init();
        await provider.refresh();
        vscode.window.showInformationMessage(`Overwrite Pull & Sync complete: ${allGroups.length} groups, ${totalPrompts} prompts from ${enabledLibraries.length} library(ies).`);
        log.info(`Overwrite Pull & Sync complete: imported ${allGroups.length} top-level groups, ${totalPrompts} prompts from ${enabledLibraries.length} library(ies).`);
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
    vscode.commands.registerCommand('promptLibrary.selectLibrary', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) {
        vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.');
        return;
      }

      // Discover available libraries in the repo
      const libraries = discoverLibraries(cfg.repoPath);
      const activeLibrary = getActiveLibrary();

      // Create quick pick items
      const items = libraries.map(lib => ({
        label: lib.displayName,
        description: lib.path,
        detail: lib.id === activeLibrary.id ? '$(check) Currently active' : undefined,
        libraryPath: lib.path
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a library to activate',
        title: 'Prompt Library: Select Library'
      });

      if (selected) {
        await setActiveLibrary(selected.libraryPath);
        updateLibraryStatusBar();
        vscode.window.showInformationMessage(`Switched to library: ${selected.label}`);
        log.info(`Switched to library: ${selected.label} (${selected.libraryPath})`);
        // Refresh the groups view
        await groups.init();
      }
    }),
    vscode.commands.registerCommand('promptLibrary.manageLibraries', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) {
        vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.');
        return;
      }

      // Discover available libraries in the repo
      const availableLibraries = discoverLibraries(cfg.repoPath);
      const currentlyHidden = getHiddenLibraryPaths();
      const activeLibrary = getActiveLibrary();

      // Create multi-select quick pick items (picked = visible, not picked = hidden)
      const items: vscode.QuickPickItem[] = availableLibraries.map(lib => ({
        label: lib.displayName,
        description: lib.path,
        detail: lib.id === activeLibrary.id ? '$(edit) Active library (always visible)' : undefined,
        picked: !currentlyHidden.includes(lib.id) // Visible if NOT in hidden list
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select libraries to show (unselected will be hidden)',
        title: 'Prompt Library: Manage Libraries',
        canPickMany: true
      });

      if (selected !== undefined) {
        // Calculate which libraries should be hidden (not selected, except active)
        const selectedPaths = selected.map(item => item.description!);
        const toHide = availableLibraries
          .filter(lib => !selectedPaths.includes(lib.path) && lib.id !== activeLibrary.id)
          .map(lib => lib.id);

        await setHiddenLibraries(toHide);

        const visibleCount = availableLibraries.length - toHide.length;
        vscode.window.showInformationMessage(`Showing ${visibleCount} of ${availableLibraries.length} libraries`);
        log.info(`Hidden libraries: ${toHide.length > 0 ? toHide.join(', ') : '(none)'}`);

        // Refresh the groups view
        await groups.init();
      }
    }),
    vscode.commands.registerCommand('promptLibrary.showAllLibraries', async () => {
      await showAllLibraries();
      vscode.window.showInformationMessage('All libraries are now visible');
      log.info('Cleared hidden libraries list - all libraries visible');
      await groups.init();
    }),
    vscode.commands.registerCommand('promptLibrary.hideAllLibraries', async () => {
      const activeLibrary = getActiveLibrary();
      await hideAllLibraries();
      vscode.window.showInformationMessage(`All libraries hidden except active: ${activeLibrary.displayName}`);
      log.info('Hidden all libraries except active');
      await groups.init();
    }),
    vscode.commands.registerCommand('promptLibrary.selectHiddenLibraries', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) {
        vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.');
        return;
      }

      const availableLibraries = discoverLibraries(cfg.repoPath);
      const currentlyHidden = getHiddenLibraryPaths();
      const activeLibrary = getActiveLibrary();

      // Create multi-select items (picked = hidden)
      const items: vscode.QuickPickItem[] = availableLibraries.map(lib => ({
        label: lib.displayName,
        description: lib.id === activeLibrary.id ? '(active - cannot hide)' : lib.path,
        picked: currentlyHidden.includes(lib.id) && lib.id !== activeLibrary.id
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select libraries to HIDE (active library cannot be hidden)',
        title: 'Select Libraries to Hide',
        canPickMany: true
      });

      if (selected !== undefined) {
        // Get IDs of selected libraries (to hide), excluding active
        const toHide = selected
          .map(item => availableLibraries.find(lib => lib.displayName === item.label)?.id)
          .filter((id): id is string => id !== undefined && id !== activeLibrary.id);

        await setHiddenLibraries(toHide);

        const hiddenCount = toHide.length;
        const visibleCount = availableLibraries.length - hiddenCount;
        vscode.window.showInformationMessage(`${hiddenCount} libraries hidden, ${visibleCount} visible`);
        log.info(`Hidden libraries: ${toHide.length > 0 ? toHide.join(', ') : '(none)'}`);

        await groups.init();
      }
    }),
    vscode.commands.registerCommand('promptLibrary.createLibrary', async () => {
      const cfg = getSettings();
      if (!cfg.repoPath) {
        vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.');
        return;
      }

      const libraryName = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new library',
        placeHolder: 'e.g. marketing, product, engineering',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Library name is required';
          }
          // Check for valid folder name characters
          if (!/^[a-zA-Z0-9_-]+$/.test(value.trim())) {
            return 'Library name can only contain letters, numbers, hyphens, and underscores';
          }
          // Check if already exists
          const libraryPath = path.join(cfg.repoPath, value.trim());
          if (fs.existsSync(libraryPath)) {
            return `Library "${value}" already exists`;
          }
          return undefined;
        }
      });

      if (!libraryName) return;

      try {
        const libraryPath = path.join(cfg.repoPath, libraryName.trim());

        // Create the library folder with a default group
        const defaultGroupPath = path.join(libraryPath, 'General');
        fs.mkdirSync(defaultGroupPath, { recursive: true });

        // Create a _group.yaml file for the default group
        const groupYamlContent = `name: General\ndescription: Default group for ${libraryName}\n`;
        fs.writeFileSync(path.join(defaultGroupPath, '_group.yaml'), groupYamlContent);

        vscode.window.showInformationMessage(`Library "${libraryName}" created successfully!`);
        log.info(`Created new library: ${libraryName} at ${libraryPath}`);

        // Refresh to show the new library
        await groups.init();

        // Ask if they want to set it as active
        const setActive = await vscode.window.showQuickPick(['Yes', 'No'], {
          placeHolder: `Set "${libraryName}" as the active library for writing?`
        });
        if (setActive === 'Yes') {
          await setActiveLibrary(libraryName.trim());
          updateLibraryStatusBar();
          await groups.init();
        }
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to create library: ${e?.message || e}`);
        log.error(`Failed to create library: ${e?.message || e}`);
      }
    }),
    vscode.commands.registerCommand('promptLibrary.setActiveLibrary', async (item?: GroupItem) => {
      const cfg = getSettings();
      if (!cfg.repoPath) {
        vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.');
        return;
      }

      let libraryId: string | undefined;

      if (item && item.groupId) {
        // Extract library ID from the group item
        // Library root items have groupId like "lib:library-name" or just the library folder name
        libraryId = item.groupId.replace('lib:', '');
      } else {
        // No item passed, show a picker
        const availableLibraries = discoverLibraries(cfg.repoPath);
        const activeLibrary = getActiveLibrary();

        const items = availableLibraries.map(lib => ({
          label: lib.displayName,
          description: lib.id === activeLibrary.id ? '(currently active)' : undefined,
          libraryId: lib.id
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a library to set as active (for writing new prompts)'
        });

        if (!selected) return;
        libraryId = selected.libraryId;
      }

      if (libraryId) {
        await setActiveLibrary(libraryId);
        updateLibraryStatusBar();
        vscode.window.showInformationMessage(`"${libraryId}" is now the active library`);
        log.info(`Set active library to: ${libraryId}`);
        await groups.init();
      }
    }),
    vscode.commands.registerCommand('promptLibrary.setupRepository', async () => {
      const cfg = getSettings();

      // Step 1: Ask how they want to set up
      const setupChoice = await vscode.window.showQuickPick([
        { label: '$(repo-clone) Clone from Git URL', description: 'Clone an existing prompt library repository', value: 'clone' },
        { label: '$(folder) Use existing local folder', description: 'Point to a folder that already exists', value: 'existing' },
        { label: '$(new-folder) Create new local folder', description: 'Create a new empty prompt library', value: 'new' }
      ], {
        placeHolder: 'How would you like to set up your prompt library?',
        title: 'Prompt Library Setup'
      });

      if (!setupChoice) return;

      if (setupChoice.value === 'clone') {
        // Clone from git
        const gitUrl = await vscode.window.showInputBox({
          prompt: 'Enter the Git repository URL',
          placeHolder: 'git@github.com:org/PromptLibrary.git or https://github.com/org/PromptLibrary.git',
          value: cfg.remoteRepoUrl || '',
          validateInput: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Git URL is required';
            }
            if (!value.includes('github.com') && !value.includes('gitlab') && !value.includes('.git') && !value.startsWith('git@')) {
              return 'Please enter a valid Git URL';
            }
            return undefined;
          }
        });

        if (!gitUrl) return;

        // Ask where to clone
        const defaultPath = path.join(os.homedir(), 'PromptLibrary');
        const clonePath = await vscode.window.showInputBox({
          prompt: 'Where should the repository be cloned?',
          value: defaultPath,
          placeHolder: defaultPath
        });

        if (!clonePath) return;

        const expandedPath = clonePath.startsWith('~/') ? path.join(os.homedir(), clonePath.slice(2)) : clonePath;

        // Check if path already exists
        if (fs.existsSync(expandedPath)) {
          const overwrite = await vscode.window.showQuickPick(['Use existing folder', 'Cancel'], {
            placeHolder: `Folder already exists at ${expandedPath}. Use it anyway?`
          });
          if (overwrite !== 'Use existing folder') return;
        } else {
          // Clone the repo
          try {
            vscode.window.showInformationMessage(`Cloning repository to ${expandedPath}...`);
            const parentDir = path.dirname(expandedPath);
            const folderName = path.basename(expandedPath);

            if (!fs.existsSync(parentDir)) {
              fs.mkdirSync(parentDir, { recursive: true });
            }

            const result = await gitClone(parentDir, gitUrl, folderName);
            if (!result.success) {
              vscode.window.showErrorMessage(`Clone failed: ${result.error}`);
              return;
            }
            vscode.window.showInformationMessage('Repository cloned successfully!');
          } catch (e: any) {
            vscode.window.showErrorMessage(`Clone failed: ${e?.message || e}`);
            return;
          }
        }

        // Set the settings
        await setRepoPath(clonePath);
        await setRemoteRepoUrl(gitUrl);
        log.info(`Setup complete: repoPath=${clonePath}, remoteUrl=${gitUrl}`);

      } else if (setupChoice.value === 'existing') {
        // Use existing folder
        const folderUri = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Select Prompt Library Folder',
          title: 'Select your prompt library folder'
        });

        if (!folderUri || folderUri.length === 0) return;

        const selectedPath = folderUri[0].fsPath;
        await setRepoPath(selectedPath);

        // Check if it's a git repo and auto-detect remote
        const gitCheck = await isGitRepo(selectedPath);
        if (gitCheck.isRepo) {
          const remoteUrl = await getRemoteUrl(selectedPath);
          if (remoteUrl) {
            await setRemoteRepoUrl(remoteUrl);
            vscode.window.showInformationMessage(`Repository configured! Git remote auto-detected: ${remoteUrl}`);
            log.info(`Setup complete: repoPath=${selectedPath}, auto-detected remoteUrl=${remoteUrl}`);
          } else {
            vscode.window.showInformationMessage('Repository configured! (No git remote detected - local-only mode)');
            log.info(`Setup complete: repoPath=${selectedPath}, no remote detected`);
          }
        } else {
          vscode.window.showInformationMessage('Folder configured! (Not a git repo - local-only mode)');
          log.info(`Setup complete: repoPath=${selectedPath}, not a git repo`);
        }

      } else if (setupChoice.value === 'new') {
        // Create new folder
        const folderUri = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Select Parent Folder',
          title: 'Select where to create the new prompt library'
        });

        if (!folderUri || folderUri.length === 0) return;

        const parentPath = folderUri[0].fsPath;
        const folderName = await vscode.window.showInputBox({
          prompt: 'Enter a name for the new prompt library folder',
          value: 'PromptLibrary',
          validateInput: (value) => {
            if (!value || value.trim().length === 0) return 'Folder name is required';
            if (!/^[a-zA-Z0-9_-]+$/.test(value.trim())) return 'Use only letters, numbers, hyphens, underscores';
            return undefined;
          }
        });

        if (!folderName) return;

        const newPath = path.join(parentPath, folderName.trim());

        try {
          // Create the folder with a default library
          const defaultLibPath = path.join(newPath, 'general', 'General');
          fs.mkdirSync(defaultLibPath, { recursive: true });
          fs.writeFileSync(path.join(defaultLibPath, '_group.yaml'), 'name: General\ndescription: Default group\n');

          await setRepoPath(newPath);
          await setRemoteRepoUrl(''); // Clear any existing remote
          vscode.window.showInformationMessage(`Created new prompt library at ${newPath}`);
          log.info(`Setup complete: created new repo at ${newPath}`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Failed to create folder: ${e?.message || e}`);
          return;
        }
      }

      // Refresh everything
      await groups.init();
      updateLibraryStatusBar();
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

        // Use library-aware writing: write to library folder (promptsSubdir)
        const activeLibrary = getActiveLibrary();
        const libraryPath = getLibraryPath(cfg.repoPath, activeLibrary);
        log.info(`Writing to library: ${activeLibrary.displayName} at ${libraryPath}`);

        const result = await writeSharedGroups(vscode.Uri.file(libraryPath), sharedRoot.children, 'prompts');
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

        // Get all enabled libraries
        const enabledLibraries = getEnabledLibraries();
        log.info(`Reading from ${enabledLibraries.length} libraries: ${enabledLibraries.map(l => l.displayName).join(', ')}`);

        // Read from all enabled libraries
        const libraryGroupsMap = await readFromLibraries(cfg.repoPath, enabledLibraries, 'prompts');

        // Helper to add library metadata to groups and prompts recursively
        const addLibraryMetadata = (groups: Group[], libraryId: string): Group[] => {
          return groups.map(g => {
            const uniqueGroupId = g.id.startsWith(`${libraryId}:`) ? g.id : `${libraryId}:${g.id}`;
            return {
              ...g,
              id: uniqueGroupId,
              kind: 'shared' as const,
              libraryId,
              prompts: g.prompts.map(p => ({
                ...p,
                id: p.id.startsWith(`${libraryId}:`) ? p.id : `${libraryId}:${p.id}`,
                libraryId
              })),
              children: addLibraryMetadata(g.children || [], libraryId)
            };
          });
        };

        // Merge all library groups into one array
        const allGroups: Group[] = [];
        let totalPrompts = 0;
        const countPrompts = (gs: Group[]): number =>
          gs.reduce((acc, g) => acc + (g.prompts?.length || 0) + countPrompts(g.children || []), 0);

        for (const [libraryId, groups] of libraryGroupsMap) {
          const groupsWithMetadata = addLibraryMetadata(groups, libraryId);
          allGroups.push(...groupsWithMetadata);
          totalPrompts += countPrompts(groups);
          log.info(`Library "${libraryId}": ${groups.length} groups, ${countPrompts(groups)} prompts`);
        }

        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) { vscode.window.showWarningMessage('Shared root not found'); log.warn('Shared root not found'); return; }
        sharedRoot.children = allGroups;
        sharedRoot.prompts = [];
        await store.save(lib);
        await groups.init();
        await provider.refresh();

        const libraryNames = enabledLibraries.map(l => l.displayName).join(', ');
        vscode.window.showInformationMessage(`Sync read complete: ${allGroups.length} groups, ${totalPrompts} prompts from ${enabledLibraries.length} library(ies).`);
        log.info(`Sync read complete: imported ${allGroups.length} top-level groups, ${totalPrompts} prompts from libraries: ${libraryNames}.`);
      } catch (e: any) {
        log.error(`Sync read failed: ${e?.message || e}`);
        vscode.window.showWarningMessage('Sync read failed. See Sync Status for details.');
      }
    }),
    vscode.commands.registerCommand('promptLibrary.syncDirectCommit', async () => {
      log.info('syncDirectCommit command started');

      // Check git availability first
      const gitCheck = await getGitVersion();
      if (gitCheck.version) {
        log.info(`Git version: ${gitCheck.version}`);
      } else {
        log.error(`Git check failed: ${gitCheck.error}`);
      }

      const cfg = getSettings();
      log.info(`Config: repoPath=${cfg.repoPath}, promptsSubdir=${cfg.promptsSubdir}`);
      if (!cfg.repoPath) {
        log.warn('No repoPath configured');
        vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.');
        return;
      }
      const repoPath = cfg.repoPath;
      log.info(`Checking if ${repoPath} is a git repo...`);
      const repoCheck = await isGitRepo(repoPath);
      log.info(`isGitRepo result: ${repoCheck.isRepo}${repoCheck.error ? `, error: ${repoCheck.error}` : ''}`);

      if (!repoCheck.isRepo) {
        const errorMsg = repoCheck.error || 'Not a Git repository';
        log.error(`Git repository check failed: ${errorMsg}`);

        // Provide helpful guidance based on the error
        let guidance = '';
        if (errorMsg.includes('not installed')) {
          guidance = '\n\nTo fix:\n1. Install Git from https://git-scm.com/\n2. Restart VSCode\n3. Try sync again';
        } else if (errorMsg.includes('Not a git repository')) {
          guidance = `\n\nTo fix:\n1. Open Terminal\n2. Run: cd "${repoPath}"\n3. Run: git init\n4. Run: git remote add origin <your-github-repo-url>\n5. Try sync again`;
        }

        vscode.window.showErrorMessage(`${errorMsg}${guidance}`, 'Open Settings').then(choice => {
          if (choice === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'promptLibrary.repoPath');
          }
        });
        return;
      }
      try {
        // STEP 1: Pull latest from remote first (to avoid push rejection)
        log.info('Pulling latest from remote before sync...');
        const pullSuccess = await gitPull(repoPath);
        if (!pullSuccess) {
          log.error('Pull failed - there may be merge conflicts');
          vscode.window.showErrorMessage(
            'Pull failed. There may be merge conflicts or the remote is unreachable. Please resolve manually in terminal:\n\ncd ' + repoPath + '\ngit pull',
            'Open Terminal'
          ).then(choice => {
            if (choice === 'Open Terminal') {
              const terminal = vscode.window.createTerminal({ name: 'Git Pull', cwd: repoPath });
              terminal.show();
              terminal.sendText('git status');
            }
          });
          return;
        }
        log.info('Pull successful');

        // STEP 2: Write YAML files
        log.info('Direct commit: writing YAML...');
        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) {
          vscode.window.showWarningMessage('Shared root not found');
          log.warn('Shared root not found');
          return;
        }
        log.info(`Found shared root with ${sharedRoot.children.length} children`);

        // Use library-aware writing: write to library folder (promptsSubdir)
        const activeLibrary = getActiveLibrary();
        const libraryPath = getLibraryPath(repoPath, activeLibrary);
        log.info(`Writing to library: ${activeLibrary.displayName} at ${libraryPath}`);

        const result = await writeSharedGroups(vscode.Uri.file(libraryPath), sharedRoot.children, 'prompts');
        log.info(`Write result: added=${result.added}, updated=${result.updated}, deleted=${result.deleted}`);

        // STEP 3: Stage and commit
        await stageAll(repoPath);
        log.info('Staged all changes');
        const msg = `Prompt Library sync: +${result.added}/~${result.updated}/-${result.deleted}`;
        log.info(`Committing with message: ${msg}`);
        const commitResult = await gitCommit(repoPath, msg);
        log.info(`Commit result: success=${commitResult.success}, nothingToCommit=${commitResult.nothingToCommit}`);
        if (!commitResult.success) {
          log.error(`Commit failed: ${commitResult.error}`);
          vscode.window.showWarningMessage(`Commit failed: ${commitResult.error}`);
          return;
        }
        if (commitResult.nothingToCommit) {
          log.warn('Nothing to commit.');
          vscode.window.showInformationMessage('No changes to commit.');
          return;
        }

        // STEP 4: Push to remote
        log.info('Pushing to remote...');
        const pushResult = await gitPush(repoPath);
        log.info(`Push result: success=${pushResult.success}`);
        if (!pushResult.success) {
          log.error(`Push failed: ${pushResult.error}`);
          vscode.window.showWarningMessage(`Push failed: ${pushResult.error}`);
          return;
        }
        log.info('Direct commit: pushed successfully.');
        vscode.window.showInformationMessage('Sync (Direct Commit) complete.');
      } catch (e: any) {
        log.error(`Direct commit failed: ${e?.message || e}`);
        log.error(`Stack trace: ${e?.stack}`);
        vscode.window.showWarningMessage('Direct commit failed. See Sync Status for details.');
      }
    }),
    vscode.commands.registerCommand('promptLibrary.syncBranchPR', async () => {
      log.info('syncBranchPR command started');
      const cfg = getSettings();
      log.info(`Config: repoPath=${cfg.repoPath}, branchName=${cfg.branchName}`);
      if (!cfg.repoPath) {
        log.warn('No repoPath configured');
        vscode.window.showWarningMessage('Set promptLibrary.repoPath in settings first.');
        return;
      }
      const repoPath = cfg.repoPath;
      log.info(`Checking if ${repoPath} is a git repo...`);
      const repoCheck = await isGitRepo(repoPath);
      log.info(`isGitRepo result: ${repoCheck.isRepo}${repoCheck.error ? `, error: ${repoCheck.error}` : ''}`);

      if (!repoCheck.isRepo) {
        const errorMsg = repoCheck.error || 'Not a Git repository';
        log.error(`Git repository check failed: ${errorMsg}`);

        // Provide helpful guidance based on the error
        let guidance = '';
        if (errorMsg.includes('not installed')) {
          guidance = '\n\nTo fix:\n1. Install Git from https://git-scm.com/\n2. Restart VSCode\n3. Try sync again';
        } else if (errorMsg.includes('Not a git repository')) {
          guidance = `\n\nTo fix:\n1. Open Terminal\n2. Run: cd "${repoPath}"\n3. Run: git init\n4. Run: git remote add origin <your-github-repo-url>\n5. Try sync again`;
        }

        vscode.window.showErrorMessage(`${errorMsg}${guidance}`, 'Open Settings').then(choice => {
          if (choice === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'promptLibrary.repoPath');
          }
        });
        return;
      }
      // Prefer configured branchName; fallback to timestamped branch
      const branch = cfg.branchName && cfg.branchName.trim() ? cfg.branchName.trim() : `prompt-sync/${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)}`;
      try {
        // STEP 1: Pull latest from remote first (to avoid conflicts when branching)
        log.info('Pulling latest from remote before creating branch...');
        const pullSuccess = await gitPull(repoPath);
        if (!pullSuccess) {
          log.error('Pull failed - there may be merge conflicts');
          vscode.window.showErrorMessage(
            'Pull failed. There may be merge conflicts or the remote is unreachable. Please resolve manually in terminal:\n\ncd ' + repoPath + '\ngit pull',
            'Open Terminal'
          ).then(choice => {
            if (choice === 'Open Terminal') {
              const terminal = vscode.window.createTerminal({ name: 'Git Pull', cwd: repoPath });
              terminal.show();
              terminal.sendText('git status');
            }
          });
          return;
        }
        log.info('Pull successful');

        // STEP 2: Create new branch
        log.info(`Branch+PR: creating branch ${branch}...`);
        const cur = await getCurrentBranch(repoPath);
        log.info(`Current branch: ${cur}`);
        if (!cur) { log.warn('Unable to detect current branch'); }
        const checkoutResult = await checkoutNewBranch(repoPath, branch);
        log.info(`Checkout result: success=${checkoutResult.success}`);
        if (!checkoutResult.success) {
          log.error(`Checkout failed: ${checkoutResult.error}`);
          vscode.window.showWarningMessage(`Failed to create branch: ${checkoutResult.error}`);
          return;
        }

        // STEP 3: Write YAML
        const lib = await store.getLibrary();
        const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
        if (!sharedRoot) {
          vscode.window.showWarningMessage('Shared root not found');
          log.warn('Shared root not found');
          return;
        }
        log.info(`Found shared root with ${sharedRoot.children.length} children`);

        // Use library-aware writing: write to library folder (promptsSubdir)
        const activeLibrary = getActiveLibrary();
        const libraryPath = getLibraryPath(repoPath, activeLibrary);
        log.info(`Writing to library: ${activeLibrary.displayName} at ${libraryPath}`);

        const result = await writeSharedGroups(vscode.Uri.file(libraryPath), sharedRoot.children, 'prompts');
        log.info(`Write result: added=${result.added}, updated=${result.updated}, deleted=${result.deleted}`);
        await stageAll(repoPath);
        log.info('Staged all changes');
        const msg = `Prompt Library sync (PR): +${result.added}/~${result.updated}/-${result.deleted}`;
        log.info(`Committing with message: ${msg}`);
        const commitResult = await gitCommit(repoPath, msg);
        log.info(`Commit result: success=${commitResult.success}, nothingToCommit=${commitResult.nothingToCommit}`);
        if (!commitResult.success) {
          log.error(`Commit failed: ${commitResult.error}`);
          vscode.window.showWarningMessage(`Commit failed: ${commitResult.error}`);
          return;
        }
        if (commitResult.nothingToCommit) {
          log.warn('Nothing to commit on branch');
          vscode.window.showInformationMessage('No changes to commit.');
          return;
        }
        log.info(`Pushing to origin/${branch}...`);
        const pushResult = await gitPush(repoPath, 'origin', branch);
        log.info(`Push result: success=${pushResult.success}`);
        if (!pushResult.success) {
          log.error(`Push failed: ${pushResult.error}`);
          vscode.window.showWarningMessage(`Push failed: ${pushResult.error}`);
          return;
        }
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
      // If no remote URL is configured, check if repoPath is already a git repo with a remote
      let remoteUrl = cfg.remoteRepoUrl?.trim() || '';
      if (!remoteUrl && cfg.repoPath) {
        const repoCheck = await isGitRepo(cfg.repoPath);
        if (repoCheck.isRepo) {
          const detected = await getRemoteUrl(cfg.repoPath);
          if (detected) {
            remoteUrl = detected;
            log.info(`Auto-detected remote URL from existing repo: ${remoteUrl}`);
          }
        }
      }
      if (!remoteUrl) {
        // No remote URL available - direct user to Setup Wizard
        const choice = await vscode.window.showWarningMessage(
          'No git repository configured. Use the Setup Wizard to clone or configure a repository.',
          'Open Setup Wizard',
          'Cancel'
        );
        if (choice === 'Open Setup Wizard') {
          await vscode.commands.executeCommand('promptLibrary.setupRepository');
        }
        return;
      }
      try {
        log.info('Clone/Pull+Import started...');
        let targetPath = cfg.repoPath;

        // If no repoPath is configured, use the default ~/PromptLibrary
        if (!targetPath) {
          targetPath = path.join(os.homedir(), 'PromptLibrary');
        }

        log.info(`Target path: ${targetPath}`);
        log.info(`Remote URL: ${remoteUrl}`);

        // If the target path doesn't exist or isn't a git repo, clone it
        const repoCheck = await isGitRepo(targetPath);
        if (!fs.existsSync(targetPath) || !repoCheck.isRepo) {
          log.info(`Need to clone repository to: ${targetPath}`);

          // If directory exists but is not a git repo, remove it first
          if (fs.existsSync(targetPath)) {
            log.warn(`Directory exists but is not a git repo, removing: ${targetPath}`);
            try {
              fs.rmSync(targetPath, { recursive: true, force: true });
              log.info(`Removed non-git directory: ${targetPath}`);
            } catch (e: any) {
              log.error(`Failed to remove directory: ${e.message}`);
              vscode.window.showErrorMessage(`Failed to remove non-git directory: ${e.message}`);
              return;
            }
          }

          const parentDir = path.dirname(targetPath);
          const dirName = path.basename(targetPath);
          log.info(`Cloning to parent dir: ${parentDir}, dir name: ${dirName}`);
          try { fs.mkdirSync(parentDir, { recursive: true }); } catch { }
          const cloneResult = await gitClone(parentDir, remoteUrl, dirName);
          if (!cloneResult.success) {
            log.error(`Clone failed: ${cloneResult.error}`);
            vscode.window.showErrorMessage(`Clone failed: ${cloneResult.error || 'Unknown error'}`);
            return;
          }
          log.info(`Clone successful to: ${targetPath}`);

          // Verify the clone worked
          const verifyRepo = await isGitRepo(targetPath);
          if (!verifyRepo.isRepo) {
            log.error(`Clone reported success but directory is not a git repo!`);
            vscode.window.showErrorMessage('Clone failed: Directory is not a git repository after clone');
            return;
          }
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
  const csp = generateCSP(webview, nonce);

  return loadHtmlTemplate('promptLibraryView.html', {
    CSP: csp,
    NONCE: nonce
  });
}


