// groups.ts
import * as vscode from 'vscode';
import { Group, Library, Prompt } from './model';
import { LibraryStore } from './store';
import { getSettings } from './settings';
import { getRemoteUrl, isGitRepo } from './sync/git';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export class GroupsProvider implements vscode.TreeDataProvider<GroupItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GroupItem | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private library: Library | null = null;
  private repoLabel: string | null = null;

  constructor(private readonly store: LibraryStore) {}

  async init() {
    this.library = await this.store.load();
    await this.computeRepoLabel();
    this.refresh();
  }

  private async computeRepoLabel() {
    try {
      const cfg = getSettings();
      let remoteUrl: string | null = null;
      if (cfg?.remoteRepoUrl && String(cfg.remoteRepoUrl).trim()) {
        remoteUrl = String(cfg.remoteRepoUrl).trim();
      } else if (cfg?.repoPath && await isGitRepo(cfg.repoPath)) {
        remoteUrl = await getRemoteUrl(cfg.repoPath, 'origin');
      }
      if (!remoteUrl) { this.repoLabel = null; return; }
      const urlStr = String(remoteUrl);
      // Extract repo name (last path segment without .git)
      let repoName: string | null = null;
      const m = urlStr.match(/[\/:]([^\/:]+)\/([^\/:]+?)(?:\.git)?$/);
      if (m) {
        repoName = m[2]?.replace(/\.git$/,'') || null;
      } else {
        const seg = urlStr.split('/').pop() || '';
        repoName = seg.replace(/\.git$/,'') || null;
      }
      if (repoName && /github\.com/i.test(urlStr)) {
        this.repoLabel = `GitHub: ${repoName}`;
      } else if (repoName) {
        this.repoLabel = `Remote: ${repoName}`;
      } else {
        this.repoLabel = null;
      }
    } catch {
      this.repoLabel = null;
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: GroupItem): vscode.TreeItem { return element; }

  async getChildren(element?: GroupItem): Promise<GroupItem[]> {
    if (!this.library) {
      this.library = await this.store.load();
    }
    if (!element) {
      // roots are top-level groups in library
      return (this.library?.groups ?? []).map(g => toItem(g, this.repoLabel));
    }
    const group = this.findGroup(element.groupId);
    if (!group) return [];
    return group.children.map(g => toItem(g, this.repoLabel));
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
    if (!this.library) this.library = await this.store.load();
    const name = await vscode.window.showInputBox({ prompt: 'New group name', validateInput: v => v.trim() ? undefined : 'Required' });
    if (!name) return;
    const root = this.findGroup(targetRootId);
    if (!root) return;
    root.children.push({ id: genId('grp'), name: name.trim(), kind: root.kind, tags: [], description: undefined, children: [], prompts: [] });
    await this.store.save(this.library!);
    this.refresh();
  }

  async renameGroup(groupId: string) {
    if (!this.library) this.library = await this.store.load();
    const g = this.findGroup(groupId);
    if (!g) return;
    // Do not allow renaming root groups or 'Unfiled'
    if (g.id === 'root-shared' || g.id === 'root-private' || g.id === 'grp-unfiled') {
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

export class GroupItem extends vscode.TreeItem {
  constructor(public readonly groupId: string, label: string, collapsible: vscode.TreeItemCollapsibleState, ctx: string) {
    super(label, collapsible);
    this.contextValue = ctx;
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

function toItem(g: Group, repoLabel?: string | null): GroupItem {
  const isRootShared = g.id === 'root-shared';
  const isRootPrivate = g.id === 'root-private';
  const isUnfiled = g.id === 'grp-unfiled';
  const isSharedChild = g.kind === 'shared' && !isRootShared;
  const ctx = isRootShared ? 'root-shared' : isRootPrivate ? 'root-private' : isUnfiled ? 'group-unfiled' : (isSharedChild ? 'group-shared' : 'group');
  const collapsible = (g.children && g.children.length > 0)
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.None;
  const label = isRootShared && repoLabel ? repoLabel : g.name;
  const item = new GroupItem(g.id, label, collapsible, ctx);
  // Icons: GitHub for shared root, lock for private root, repo for shared children, folder otherwise
  item.iconPath = new vscode.ThemeIcon(isRootShared ? 'github' : isRootPrivate ? 'lock' : isSharedChild ? 'repo' : 'folder');
  return item;
}
