// groups.ts
import * as vscode from 'vscode';
import { Group, Library, Prompt } from './model';
import { LibraryStore } from './store';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export class GroupsProvider implements vscode.TreeDataProvider<GroupItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GroupItem | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private library: Library | null = null;

  constructor(private readonly store: LibraryStore) {}

  async init() {
    this.library = await this.store.load();
    this.refresh();
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
      return (this.library?.groups ?? []).map(g => toItem(g));
    }
    const group = this.findGroup(element.groupId);
    if (!group) return [];
    return group.children.map(g => toItem(g));
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

function toItem(g: Group): GroupItem {
  const isRootShared = g.id === 'root-shared';
  const isRootPrivate = g.id === 'root-private';
  const isUnfiled = g.id === 'grp-unfiled';
  const ctx = isRootShared ? 'root-shared' : isRootPrivate ? 'root-private' : isUnfiled ? 'group-unfiled' : 'group';
  const collapsible = vscode.TreeItemCollapsibleState.Collapsed;
  return new GroupItem(g.id, g.name, collapsible, ctx);
}
