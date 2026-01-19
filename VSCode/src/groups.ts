// groups.ts
import * as vscode from 'vscode';
import { Group, Library, Prompt } from './model';
import { LibraryStore } from './store';
import { getSettings, getEnabledLibraries, getActiveLibrary, LibraryConfig, toPascalCase } from './settings';
import { getRemoteUrl, isGitRepo } from './sync/git';
import { log } from './log';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export class GroupsProvider implements vscode.TreeDataProvider<GroupItem | PromptItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GroupItem | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private library: Library | null = null;
  private repoLabel: string | null = null;
  private showShared: boolean = true;

  constructor(private readonly store: LibraryStore) { }

  async init() {
    this.library = await this.store.load();
    await this.computeRepoLabel();
    this.refresh();
  }

  async refreshFromStore() {
    // Refresh the tree view by reloading from store
    // This method ensures we get the latest data from the store
    this.library = await this.store.load();
    this.refresh();
  }

  setLibrary(library: Library) {
    this.library = library;
    this.refresh();
  }

  private async computeRepoLabel() {
    try {
      const cfg = getSettings();
      let remoteUrl: string | null = null;
      let sharing = false;
      if (cfg?.remoteRepoUrl && String(cfg.remoteRepoUrl).trim()) {
        remoteUrl = String(cfg.remoteRepoUrl).trim();
        sharing = true;
      } else if (cfg?.repoPath && await isGitRepo(cfg.repoPath)) {
        remoteUrl = await getRemoteUrl(cfg.repoPath, 'origin');
        sharing = true;
      }
      this.showShared = !!sharing;
      if (!remoteUrl) { this.repoLabel = null; return; }
      const urlStr = String(remoteUrl);
      // Extract repo name (last path segment without .git)
      let repoName: string | null = null;
      const m = urlStr.match(/[\/:]([^\/:]+)\/([^\/:]+?)(?:\.git)?$/);
      if (m) {
        repoName = m[2]?.replace(/\.git$/, '') || null;
      } else {
        const seg = urlStr.split('/').pop() || '';
        repoName = seg.replace(/\.git$/, '') || null;
      }
      // Just use the repo name without prefix
      this.repoLabel = repoName || null;
    } catch {
      this.repoLabel = null;
      this.showShared = false;
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: GroupItem | PromptItem): vscode.TreeItem { return element; }

  async getChildren(element?: GroupItem | PromptItem): Promise<Array<GroupItem | PromptItem>> {
    if (!this.library) {
      this.library = await this.store.load();
    }

    const enabledLibraries = getEnabledLibraries();
    const activeLibrary = getActiveLibrary();
    const showMultipleLibraries = enabledLibraries.length > 1 && this.showShared;

    if (!element) {
      // Build root nodes: one per enabled library (if multiple) OR single shared root, plus private
      const items: GroupItem[] = [];

      if (this.showShared) {
        if (showMultipleLibraries) {
          // Create a separate root node for each enabled library
          for (const lib of enabledLibraries) {
            const libraryRootItem = this.createLibraryRootItem(lib, activeLibrary);
            items.push(libraryRootItem);
          }
        } else {
          // Single library mode: show the old root-shared node
          const sharedRoot = this.library?.groups.find(g => g.id === 'root-shared');
          if (sharedRoot) {
            items.push(toItem(sharedRoot, this.repoLabel, false));
          }
        }
      }

      // Always show private root
      const privateRoot = this.library?.groups.find(g => g.id === 'root-private');
      if (privateRoot) {
        items.push(toItem(privateRoot, this.repoLabel, false));
      }

      return items;
    }

    // If the selected element is a prompt, it has no children
    if (element instanceof PromptItem || element.contextValue === 'prompt') return [];

    // Handle virtual library root nodes (e.g., lib-root-general)
    if (element.groupId.startsWith('lib-root-')) {
      const libraryId = element.groupId.replace('lib-root-', '');
      return this.getLibraryChildren(libraryId);
    }

    const group = this.findGroup(element.groupId);
    if (!group) return [];
    const groupItems = group.children.map(g => toItem(g, this.repoLabel, false));
    const promptItems = group.prompts.map(p => new PromptItem(
      p.id,
      group.id,
      (((p.title ?? '').trim()) && !/^(null|undefined|~)$/i.test((p.title ?? '').trim())) ? (p.title as string).trim() : ((p.text || '').replace(/\r\n?|\n/g, ' ').slice(0, 20).trim() || 'Prompt'),
      'comment',
      undefined
    ));
    return [...groupItems, ...promptItems];
  }

  /**
   * Creates a virtual library root item for multi-library display.
   */
  private createLibraryRootItem(lib: LibraryConfig, activeLib: LibraryConfig): GroupItem {
    const isActive = lib.id === activeLib.id;
    const label = this.repoLabel ? `${this.repoLabel} (${lib.displayName})` : lib.displayName;
    const item = new GroupItem(
      `lib-root-${lib.id}`,
      label,
      vscode.TreeItemCollapsibleState.Expanded,
      'library-root'
    );
    item.iconPath = new vscode.ThemeIcon('github');
    item.description = isActive ? '✏️ active' : undefined;
    item.tooltip = isActive
      ? `${lib.displayName} - Active library (prompts are written here)`
      : `${lib.displayName} - Read-only (switch to make active)`;
    return item;
  }

  /**
   * Gets children for a specific library by filtering shared groups.
   */
  private getLibraryChildren(libraryId: string): Array<GroupItem | PromptItem> {
    const sharedRoot = this.library?.groups.find(g => g.id === 'root-shared');
    if (!sharedRoot) return [];

    // Filter children that belong to this library
    const libraryGroups = sharedRoot.children.filter(g => g.libraryId === libraryId);
    return libraryGroups.map(g => toItem(g, this.repoLabel, false));
  }

  getGroupById(id: string): Group | null {
    return this.findGroup(id);
  }

  private findGroup(id: string): Group | null {
    if (!this.library) return null;
    const walk = (gs: Group[]): Group | null => {
      for (const g of gs) {
        if (g.id === id) return g;
        const c = walk(g.children);
        if (c) return c;
      }
      return null;
    };
    return walk(this.library.groups);
  }

  async addGroup(targetRootId: string) {
    log.info(`addGroup called with targetRootId: ${targetRootId}`);
    if (!this.library) this.library = await this.store.load();
    const name = await vscode.window.showInputBox({ prompt: 'New group name', validateInput: v => v.trim() ? undefined : 'Required' });
    if (!name) return;

    // Handle virtual library root nodes: redirect to root-shared with libraryId
    let libraryId: string | undefined;
    let actualRootId = targetRootId;
    if (targetRootId.startsWith('lib-root-')) {
      libraryId = targetRootId.replace('lib-root-', '');
      actualRootId = 'root-shared';
      log.info(`Library root detected: libraryId=${libraryId}, actualRootId=${actualRootId}`);
    }

    const root = this.findGroup(actualRootId);
    if (!root) {
      log.warn(`Could not find root group: ${actualRootId}`);
      return;
    }

    const trimmedName = name.trim();
    const folderName = toPascalCase(trimmedName);

    const newGroup: Group = {
      id: genId('grp'),
      name: trimmedName,
      kind: root.kind,
      tags: [],
      description: undefined,
      children: [],
      prompts: [],
      libraryId: libraryId,
      folderName: folderName
    };
    log.info(`Creating group "${newGroup.name}" (folder: ${folderName}) with libraryId=${libraryId}`);
    root.children.push(newGroup);
    await this.store.save(this.library!);
    this.refresh();
  }

  async renameGroup(groupId: string) {
    if (!this.library) this.library = await this.store.load();
    const g = this.findGroup(groupId);
    if (!g) return;
    // Do not allow renaming Shared (GitHub) groups, root groups, or 'Unfiled'
    if (g.kind === 'shared' || g.id === 'root-shared' || g.id === 'root-private' || g.id === 'grp-unfiled') {
      vscode.window.showWarningMessage('Cannot rename this group.');
      return;
    }
    const name = await vscode.window.showInputBox({ prompt: 'Rename group', value: g.name, validateInput: v => v.trim() ? undefined : 'Required' });
    if (!name) return;
    g.name = name.trim();
    await this.store.save(this.library!);
    this.refresh();
  }

  async deleteGroup(groupId: string) {
    if (!this.library) this.library = await this.store.load();
    const target = this.findGroup(groupId);
    if (!target) return;
    if (target.kind === 'shared') {
      vscode.window.showWarningMessage('Shared groups cannot be deleted.');
      return;
    }
    if (groupId === 'root-shared' || groupId === 'root-private' || groupId === 'grp-unfiled') {
      vscode.window.showWarningMessage('This group cannot be deleted.');
      return;
    }
    const ok = await vscode.window.showWarningMessage('Delete group and rehome its prompts to Private/Unfiled?', { modal: true }, 'Delete');
    if (ok !== 'Delete') return;

    const unfiled = this.findGroup('grp-unfiled');
    if (!unfiled) {
      vscode.window.showErrorMessage('Unable to locate Private/Unfiled group.');
      return;
    }


    const collectPrompts = (g: Group): Prompt[] => {
      const acc: Prompt[] = [...g.prompts];
      for (const c of g.children) acc.push(...collectPrompts(c));
      return acc;
    };

    // Find parent list and target group to delete
    const removeAndCollect = (gs: Group[]): { removed: boolean; collected: Prompt[] } => {
      const idx = gs.findIndex(x => x.id === groupId);
      if (idx >= 0) {
        const target = gs[idx];
        const collected = collectPrompts(target);
        gs.splice(idx, 1);
        return { removed: true, collected };
      }
      for (const g of gs) {
        const res = removeAndCollect(g.children);
        if (res.removed) return res;
      }
      return { removed: false, collected: [] };
    };

    const res = removeAndCollect(this.library!.groups);
    if (!res.removed) return;

    // Rehome into Unfiled
    unfiled.prompts.push(...res.collected);

    await this.store.save(this.library!);
    this.refresh();
  }
}

export class PromptItem extends vscode.TreeItem {
  constructor(
    public readonly promptId: string,
    public readonly groupId: string,
    label: string,
    icon: string = 'comment',
    public readonly libraryId?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'prompt';

    // Show library badge in description if libraryId is set
    if (libraryId) {
      this.description = `[${titleCase(libraryId)}]`;
    }
    this.tooltip = libraryId ? `${label} (from ${titleCase(libraryId)})` : label;
    this.command = {
      command: 'promptLibrary.openPrompt',
      title: 'Open Prompt',
      arguments: [this.promptId]
    };
  }
}

/** Convert underscore/hyphen separated string to Title Case */
function titleCase(str: string): string {
  return str.split(/[-_\s]+/).map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

export class GroupItem extends vscode.TreeItem {
  constructor(
    public readonly groupId: string,
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
    ctx: string,
    public readonly libraryId?: string
  ) {
    super(label, collapsible);
    this.contextValue = ctx;
    this.iconPath = new vscode.ThemeIcon('folder');
    // Show library badge in description if libraryId is set
    if (libraryId) {
      this.description = `[${titleCase(libraryId)}]`;
    }
  }
}

function toItem(g: Group, repoLabel?: string | null, showLibraryBadge: boolean = false): GroupItem {
  const isRootShared = g.id === 'root-shared';
  const isRootPrivate = g.id === 'root-private';
  const isUnfiled = g.id === 'grp-unfiled';
  const isSharedChild = g.kind === 'shared' && !isRootShared;
  const ctx = isRootShared ? 'root-shared' : isRootPrivate ? 'root-private' : isUnfiled ? 'group-unfiled' : (isSharedChild ? 'group-shared' : 'group');
  const hasChildren = (g.children && g.children.length > 0) || (g.prompts && g.prompts.length > 0);
  const collapsible = hasChildren
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.None;
  const label = isRootShared && repoLabel ? repoLabel : g.name;
  // Only pass libraryId if we want to show badges (when multiple libraries are enabled)
  const libraryId = showLibraryBadge && g.libraryId ? g.libraryId : undefined;
  const item = new GroupItem(g.id, label, collapsible, ctx, libraryId);
  // Icons: GitHub for shared root, lock for private root, repo for all child groups (shared and private)
  item.iconPath = new vscode.ThemeIcon(isRootShared ? 'github' : isRootPrivate ? 'lock' : 'repo');

  // For root-shared in single library mode, show which library folder is active
  if (isRootShared) {
    const activeLib = getActiveLibrary();
    item.description = `📂 ${activeLib.path}`;
    item.tooltip = `Library folder: ${activeLib.path}\nClick to change libraries`;
  }

  return item;
}
