// store.ts
import * as vscode from 'vscode';
import { Group, Library, Prompt } from './model';
import { writeSinglePrompt, deleteSinglePrompt, ensureGroupOnDisk } from './sync/yamlWriter';
import { getSettings } from './settings';
import { log } from './log';

const LIB_FILE = 'library.v2.json';

function genId(prefix?: string): string {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return prefix ? `${prefix}-${suffix}` : suffix;
}

export class LibraryStore {
  constructor(private readonly context: vscode.ExtensionContext) { }

  // Notify listeners whenever the library changes
  private _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange: vscode.Event<void> = this._onDidChange.event;


  private get uri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, LIB_FILE);
  }

  async ensureInitialized(): Promise<void> {
    try {
      await vscode.workspace.fs.stat(this.uri);
    } catch {
      const sharedRoot: Group = { id: 'root-shared', name: 'Shared', kind: 'shared', tags: ['ns:shared'], description: undefined, children: [], prompts: [] };
      const unfiled: Group = { id: 'grp-unfiled', name: 'Unfiled', kind: 'private', tags: [], description: undefined, children: [], prompts: [] };
      const privateRoot: Group = { id: 'root-private', name: 'Private', kind: 'private', tags: ['ns:private'], description: undefined, children: [unfiled], prompts: [] };
      const seed: Library = { groups: [sharedRoot, privateRoot], privatePrompts: [] };
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      await this.save(seed);
    }
  }

  async load(): Promise<Library> {
    await this.ensureInitialized();
    const data = await vscode.workspace.fs.readFile(this.uri);
    const lib = JSON.parse(Buffer.from(data).toString('utf8')) as Library;
    const migrated = await this.migrateAndNormalize(lib);
    if (migrated.changed) {
      await this.save(migrated.library);
      return migrated.library;
    }
    return lib;
  }

  async save(library: Library): Promise<void> {
    const bytes = Buffer.from(JSON.stringify(library, null, 2), 'utf8');
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    await vscode.workspace.fs.writeFile(this.uri, bytes);
    try { this._onDidChange.fire(); } catch { }
  }

  async resetAll(): Promise<void> {
    // Recreate the initial seed library (Shared root + Private/Unfiled)
    const sharedRoot: Group = { id: 'root-shared', name: 'Shared', kind: 'shared', tags: ['ns:shared'], description: undefined, children: [], prompts: [] };
    const unfiled: Group = { id: 'grp-unfiled', name: 'Unfiled', kind: 'private', tags: [], description: undefined, children: [], prompts: [] };
    const privateRoot: Group = { id: 'root-private', name: 'Private', kind: 'private', tags: ['ns:private'], description: undefined, children: [unfiled], prompts: [] };
    const seed: Library = { groups: [sharedRoot, privateRoot], privatePrompts: [] };
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    await this.save(seed);
  }

  // CRUD helpers
  async getPrompts(groupId: string | null): Promise<Prompt[]> {
    const lib = await this.load();
    const targetId = groupId ?? 'grp-unfiled';
    const group = this.findGroup(lib, targetId);
    if (!group) return [];
    const collect = (g: Group): Prompt[] => {
      const out: Prompt[] = [...g.prompts];
      for (const c of g.children) out.push(...collect(c));
      return out;
    };
    return collect(group);
  }

  async addPromptToGroup(groupId: string | null, text: string, title?: string): Promise<{ ok: boolean; reason?: string; prompt?: Prompt; groupId: string }> {
    const lib = await this.load();
    const targetId = groupId ?? 'grp-unfiled';
    const group = this.findGroup(lib, targetId);
    if (!group) return { ok: false, reason: 'Group not found', groupId: targetId };

    const normalizedNew = this.normalizeForCompare(text);
    const exists = this.anyPrompt(lib, p => this.normalizeForCompare(p.text) === normalizedNew);
    if (exists) return { ok: false, reason: 'Duplicate prompt (normalized match)', groupId: targetId };

    const now = new Date().toISOString();
    const fallbackTitle = (text || '').replace(/\r\n?|\n/g, ' ').slice(0, 20).trim();
    const finalTitle = (((title ?? '').trim()) && !/^(null|undefined|~)$/i.test((title ?? '').trim())) ? (title as string).trim() : fallbackTitle;
    const prompt: Prompt = { id: genId(), text, title: finalTitle || undefined, createdAt: now, updatedAt: now, tags: [], private: group.kind === 'private', libraryId: group.libraryId };
    group.prompts.push(prompt);
    await this.save(lib);

    // If this is a shared group with a libraryId, write immediately to disk
    if (group.kind === 'shared' && group.libraryId) {
      await this.writePromptToDisk(lib, group, prompt);
    }

    return { ok: true, prompt, groupId: targetId };
  }

  /**
   * Writes a prompt to disk for a shared group.
   * Finds the group's path in the tree and writes to the appropriate library folder.
   */
  private async writePromptToDisk(lib: Library, targetGroup: Group, prompt: Prompt): Promise<void> {
    const cfg = getSettings();
    if (!cfg.repoPath || !targetGroup.libraryId) return;

    try {
      // Find the path from root to this group
      const groupPath = this.findGroupPath(lib, targetGroup.id);
      if (!groupPath || groupPath.length === 0) {
        log.warn(`Could not find path for group ${targetGroup.id}`);
        return;
      }

      // Convert group path to folder names (use folderName if available, otherwise name)
      const folderPath = groupPath.map(g => g.folderName || g.name);

      await writeSinglePrompt(cfg.repoPath, targetGroup.libraryId, folderPath, prompt);
      log.info(`Wrote prompt ${prompt.id} to disk: ${targetGroup.libraryId}/${folderPath.join('/')}`);
    } catch (e: any) {
      log.error(`Failed to write prompt to disk: ${e?.message || e}`);
    }
  }

  /**
   * Finds the path of groups from the shared root to the target group.
   * Returns array of groups (excluding root-shared, including target).
   */
  private findGroupPath(lib: Library, targetId: string): Group[] | null {
    const sharedRoot = lib.groups.find(g => g.id === 'root-shared');
    if (!sharedRoot) return null;

    const find = (groups: Group[], path: Group[]): Group[] | null => {
      for (const g of groups) {
        if (g.id === targetId) {
          return [...path, g];
        }
        const found = find(g.children, [...path, g]);
        if (found) return found;
      }
      return null;
    };

    return find(sharedRoot.children, []);
  }

  async getPromptById(promptId: string): Promise<Prompt | null> {
    const lib = await this.load();
    let found: Prompt | null = null;
    const walk = (gs: Group[]): void => {
      for (const g of gs) {
        const p = g.prompts.find(x => x.id === promptId);
        if (p) { found = p; return; }
        walk(g.children);
        if (found) return;
      }
    };
    walk(lib.groups);
    if (!found && lib.privatePrompts) {
      const p2 = lib.privatePrompts.find(x => x.id === promptId) || null;
      if (p2) found = p2;
    }
    return found;
  }

  async deletePrompt(promptId: string): Promise<boolean> {
    const lib = await this.load();

    // Find the prompt and its group before removing (for disk sync)
    const ref = this.findPromptRef(lib, promptId);
    const group = ref?.group;

    const removed = this.removePrompt(lib, promptId);
    if (removed) {
      await this.save(lib);

      // If this was a shared group with a libraryId, delete from disk too
      if (group && group.kind === 'shared' && group.libraryId) {
        await this.deletePromptFromDisk(lib, group, promptId);
      }
    }
    return removed;
  }

  /**
   * Deletes a prompt file from disk.
   */
  private async deletePromptFromDisk(lib: Library, targetGroup: Group, promptId: string): Promise<void> {
    const cfg = getSettings();
    if (!cfg.repoPath || !targetGroup.libraryId) return;

    try {
      const groupPath = this.findGroupPath(lib, targetGroup.id);
      if (!groupPath || groupPath.length === 0) return;

      const folderPath = groupPath.map(g => g.folderName || g.name);
      await deleteSinglePrompt(cfg.repoPath, targetGroup.libraryId, folderPath, promptId);
      log.info(`Deleted prompt ${promptId} from disk: ${targetGroup.libraryId}/${folderPath.join('/')}`);
    } catch (e: any) {
      log.error(`Failed to delete prompt from disk: ${e?.message || e}`);
    }
  }

  async updatePromptText(promptId: string, newText: string): Promise<{ ok: boolean; reason?: string }> {
    const lib = await this.load();
    const ref = this.findPromptRef(lib, promptId);
    if (!ref) return { ok: false, reason: 'Prompt not found' };
    const normalized = this.normalizeForCompare(newText);
    const exists = this.anyPrompt(lib, p => p.id !== promptId && this.normalizeForCompare(p.text) === normalized);
    if (exists) return { ok: false, reason: 'Duplicate prompt (normalized match)' };

    const updatedPrompt = { ...ref.group.prompts[ref.index], text: newText, updatedAt: new Date().toISOString() };
    ref.group.prompts[ref.index] = updatedPrompt;
    await this.save(lib);

    // If this is a shared group, update on disk too
    if (ref.group.kind === 'shared' && ref.group.libraryId) {
      await this.writePromptToDisk(lib, ref.group, updatedPrompt);
    }

    return { ok: true };
  }

  async updatePromptTitle(promptId: string, newTitle?: string): Promise<{ ok: boolean; reason?: string }> {
    const lib = await this.load();
    const ref = this.findPromptRef(lib, promptId);
    if (!ref) return { ok: false, reason: 'Prompt not found' };
    const cur = ref.group.prompts[ref.index];
    const fallback = (cur.text || '').replace(/\r\n?|\n/g, ' ').slice(0, 20).trim();
    const finalTitle = (((newTitle ?? '').trim()) && !/^(null|undefined|~)$/i.test((newTitle ?? '').trim())) ? (newTitle as string).trim() : fallback || undefined;

    const updatedPrompt = { ...cur, title: finalTitle, updatedAt: new Date().toISOString() };
    ref.group.prompts[ref.index] = updatedPrompt;
    await this.save(lib);

    // If this is a shared group, update on disk too
    if (ref.group.kind === 'shared' && ref.group.libraryId) {
      await this.writePromptToDisk(lib, ref.group, updatedPrompt);
    }

    return { ok: true };
  }


  async movePrompt(promptId: string, targetGroupId: string): Promise<{ ok: boolean; reason?: string }> {
    if (targetGroupId === 'root-shared' || targetGroupId === 'root-private') {
      return { ok: false, reason: 'Cannot move into root' };
    }
    const lib = await this.load();
    const ref = this.findPromptRef(lib, promptId);
    if (!ref) return { ok: false, reason: 'Prompt not found' };
    const target = this.findGroup(lib, targetGroupId);
    if (!target) return { ok: false, reason: 'Target group not found' };

    const sourceGroup = ref.group;
    const [prompt] = sourceGroup.prompts.splice(ref.index, 1);

    // Delete from old location on disk if it was a shared group
    if (sourceGroup.kind === 'shared' && sourceGroup.libraryId) {
      await this.deletePromptFromDisk(lib, sourceGroup, prompt.id);
    }

    prompt.private = target.kind === 'private';

    // When moving between libraries, update the prompt ID to use the target library prefix
    const oldLibraryId = sourceGroup.libraryId;
    const newLibraryId = target.libraryId;
    if (oldLibraryId && newLibraryId && oldLibraryId !== newLibraryId) {
      // Strip old library prefix(es) and add new one
      let baseId = prompt.id;
      // Remove any existing library prefixes (handles stacked prefixes like Credit-Card:EngGeneralPurpose:xxx)
      while (baseId.includes(':')) {
        const colonIndex = baseId.indexOf(':');
        const potentialPrefix = baseId.substring(0, colonIndex);
        // Check if this looks like a library prefix (contains letters, not just the base ID pattern)
        if (/^[A-Za-z]/.test(potentialPrefix)) {
          baseId = baseId.substring(colonIndex + 1);
        } else {
          break;
        }
      }
      prompt.id = `${newLibraryId}:${baseId}`;
      log.info(`Prompt ID updated for cross-library move: ${promptId} -> ${prompt.id}`);
    }

    prompt.libraryId = newLibraryId;
    prompt.updatedAt = new Date().toISOString();
    target.prompts.push(prompt);
    await this.save(lib);

    // Write to new location on disk if target is a shared group
    if (target.kind === 'shared' && target.libraryId) {
      await this.writePromptToDisk(lib, target, prompt);
    }

    return { ok: true };
  }

  async listMovableGroups(): Promise<Array<{ id: string; name: string }>> {
    const lib = await this.load();
    const out: Array<{ id: string; name: string }> = [];
    const walk = (gs: Group[]) => {
      for (const g of gs) {
        if (g.id !== 'root-shared' && g.id !== 'root-private') {
          out.push({ id: g.id, name: g.name });
        }
        walk(g.children);
      }
    };
    walk(lib.groups);
    return out;
  }

  private findPromptRef(lib: Library, pid: string): { group: Group; index: number } | null {
    const walk = (gs: Group[]): { group: Group; index: number } | null => {
      for (const g of gs) {
        const idx = g.prompts.findIndex(p => p.id === pid);
        if (idx >= 0) return { group: g, index: idx };
        const c = walk(g.children); if (c) return c;
      }
      return null;
    };
    return walk(lib.groups);
  }

  // Internals
  private normalizeForCompare(text: string): string {
    const eol = text.replace(/\r\n?|\u2028|\u2029/g, '\n');
    const collapsed = eol.replace(/[\t ]+/g, ' ');
    return collapsed.trim().toLowerCase();
  }

  private anyPrompt(lib: Library, pred: (p: Prompt) => boolean): boolean {
    for (const g of lib.groups) {
      const stack: Group[] = [g];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur.prompts.some(pred)) return true;
        stack.push(...cur.children);
      }
    }
    if (lib.privatePrompts?.some(pred)) return true;
    return false;
  }

  private removePrompt(lib: Library, pid: string): boolean {
    const walk = (gs: Group[]): boolean => {
      for (const g of gs) {
        const idx = g.prompts.findIndex(p => p.id === pid);
        if (idx >= 0) { g.prompts.splice(idx, 1); return true; }
        if (walk(g.children)) return true;
      }
      return false;
    };
    if (walk(lib.groups)) return true;
    const i2 = lib.privatePrompts.findIndex(p => p.id === pid);
    if (i2 >= 0) { lib.privatePrompts.splice(i2, 1); return true; }
    return false;
  }

  private findGroup(lib: Library, id: string): Group | null {
    const walk = (gs: Group[]): Group | null => {
      for (const g of gs) {
        if (g.id === id) return g;
        const c = walk(g.children); if (c) return c;
      }
      return null;
    };
    return walk(lib.groups);
  }

  async getLibrary(): Promise<Library> {
    return await this.load();
  }

  async exportPrivateAsStringArray(): Promise<string[]> {
    const lib = await this.load();
    const texts: string[] = [];
    const add = (t?: string) => { if (typeof t === 'string') texts.push(t); };
    // Walk groups under Private root
    const priv = lib.groups.find(g => g.id === 'root-private');
    const walk = (g: Group) => { g.prompts.forEach(p => add(p.text)); g.children.forEach(walk); };
    if (priv) walk(priv);
    // Legacy privatePrompts bucket
    for (const p of lib.privatePrompts ?? []) add(p.text);
    return texts;
  }

  async importStringArrayToUnfiled(arr: string[]): Promise<{ added: number; skipped: number }> {
    if (!Array.isArray(arr)) throw new Error('Expected an array');
    const lib = await this.load();
    const priv = lib.groups.find(g => g.id === 'root-private');
    const unfiled = priv?.children.find(c => c.id === 'grp-unfiled') ?? null;
    if (!unfiled) throw new Error('Unfiled group missing');

    // Build set of existing normalized texts
    const seen = new Set<string>();
    this.anyPrompt(lib, p => { seen.add(this.normalizeForCompare(p.text)); return false; });

    let added = 0, skipped = 0;
    const now = new Date().toISOString();
    for (const t of arr) {
      if (typeof t !== 'string') { skipped++; continue; }
      const n = this.normalizeForCompare(t);
      if (seen.has(n)) { skipped++; continue; }
      const prompt: Prompt = { id: genId(), text: t, createdAt: now, updatedAt: now, tags: [], private: true };
      unfiled.prompts.push(prompt);
      seen.add(n);
      added++;
    }
    if (added > 0) await this.save(lib);
    return { added, skipped };
  }

  async importFromObject(obj: any): Promise<{ added: number; skipped: number }> {
    const lib = await this.load();
    const priv = lib.groups.find(g => g.id === 'root-private');
    const unfiled = priv?.children.find(c => c.id === 'grp-unfiled') ?? null;
    if (!unfiled) throw new Error('Unfiled group missing');

    // Build set of existing normalized texts
    const seen = new Set<string>();
    this.anyPrompt(lib, p => { seen.add(this.normalizeForCompare(p.text)); return false; });

    const texts: string[] = [];
    const addText = (t: any) => { if (typeof t === 'string') texts.push(t); else if (t && typeof t.text === 'string') texts.push(t.text); };

    const walkGroups = (gs: any[]) => {
      for (const g of gs ?? []) {
        for (const p of g.prompts ?? []) addText(p);
        walkGroups(g.children ?? []);
      }
    };

    if (Array.isArray(obj)) {
      for (const el of obj) addText(el);
    } else if (obj && typeof obj === 'object') {
      // library-shaped
      if (Array.isArray(obj.privatePrompts)) for (const p of obj.privatePrompts) addText(p);
      if (Array.isArray(obj.groups)) walkGroups(obj.groups);
      if (Array.isArray(obj.prompts)) for (const p of obj.prompts) addText(p); // flat
    }

    let added = 0, skipped = 0;
    const now = new Date().toISOString();
    for (const t of texts) {
      const n = this.normalizeForCompare(t);
      if (seen.has(n)) { skipped++; continue; }
      const prompt: Prompt = { id: genId(), text: t, createdAt: now, updatedAt: now, tags: [], private: true };
      unfiled.prompts.push(prompt);
      seen.add(n);
      added++;
    }

    if (added > 0) await this.save(lib);
    return { added, skipped };
  }

  async deduplicate(): Promise<{ removed: number }> {
    const lib = await this.load();
    const seen = new Set<string>();
    let removed = 0;

    const dedupList = (arr: Prompt[]) => {
      for (let i = 0; i < arr.length;) {
        const n = this.normalizeForCompare(arr[i].text);
        if (seen.has(n)) { arr.splice(i, 1); removed++; }
        else { seen.add(n); i++; }
      }
    };

    const walk = (gs: Group[]) => {
      for (const g of gs) {
        dedupList(g.prompts);
        walk(g.children);
      }
    };

    walk(lib.groups);
    dedupList(lib.privatePrompts);

    if (removed > 0) await this.save(lib);
    return { removed };
  }

  // Ensures presence of roots + Unfiled and rehomes any private-root prompts into Unfiled
  private async migrateAndNormalize(library: Library): Promise<{ changed: boolean; library: Library }> {
    let changed = false;
    const ensureRoots = (): void => {
      let shared = library.groups.find(g => g.id === 'root-shared');
      let priv = library.groups.find(g => g.id === 'root-private');
      if (!shared) { shared = { id: 'root-shared', name: 'Shared', kind: 'shared', tags: ['ns:shared'], description: undefined, children: [], prompts: [] }; library.groups.unshift(shared); changed = true; }
      if (!priv) { priv = { id: 'root-private', name: 'Private', kind: 'private', tags: ['ns:private'], description: undefined, children: [], prompts: [] }; library.groups.push(priv); changed = true; }
      // Ensure Unfiled exists and is first child
      let unfiled = priv.children.find(c => c.id === 'grp-unfiled' || c.name.toLowerCase() === 'unfiled');
      if (!unfiled) { unfiled = { id: 'grp-unfiled', name: 'Unfiled', kind: 'private', tags: [], description: undefined, children: [], prompts: [] }; priv.children.unshift(unfiled); changed = true; }
      else {
        // Pin Unfiled at index 0
        const idx = priv.children.indexOf(unfiled);
        if (idx > 0) { priv.children.splice(idx, 1); priv.children.unshift(unfiled); changed = true; }
      }
    };

    ensureRoots();

    // Rehome any prompts mistakenly on Private root to Unfiled
    const priv = library.groups.find(g => g.id === 'root-private')!;
    const unfiled = priv.children[0];
    if (priv.prompts && priv.prompts.length > 0) {
      unfiled.prompts.push(...priv.prompts);
      priv.prompts = [];
      changed = true;
    }

    return { changed, library };
  }
}
