import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fsp from 'fs/promises';
import type { Library, Group, Prompt } from '../src/model';

// Mock the 'vscode' module before importing the store
vi.mock('vscode', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs/promises');

  class Uri {
    fsPath: string;
    constructor(p: string) { this.fsPath = p; }
    static file(p: string) { return new Uri(p); }
    static joinPath(base: { fsPath: string }, ...parts: string[]) { return new Uri(nodePath.join(base.fsPath, ...parts)); }
  }

  const workspace = {
    fs: {
      async stat(uri: { fsPath: string }) { await fs.stat(uri.fsPath); },
      async readFile(uri: { fsPath: string }) { return await fs.readFile(uri.fsPath); },
      async writeFile(uri: { fsPath: string }, data: Buffer) { await fs.writeFile(uri.fsPath, data); },
      async createDirectory(uri: { fsPath: string }) { await fs.mkdir(uri.fsPath, { recursive: true }); },
    }
  };

  const window = {
    showInformationMessage: (_: string) => {},
    showWarningMessage: (_: string) => {}
  };

  const env = { clipboard: { writeText: async (_: string) => {} } };

  const api = { Uri, workspace, window, env };
  return { default: api, ...api };
});

import { LibraryStore } from '../src/store';
import { Uri } from 'vscode';

function makeContext(globalDir: string): any {
  // Fake ExtensionContext with only globalStorageUri used by LibraryStore
  return { globalStorageUri: Uri.file(globalDir) };
}

async function seedLibrary(dir: string, lib: Library) {
  const store = new LibraryStore(makeContext(dir));
  await store.save(lib);
}

describe('LibraryStore basics', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'promptlib-'));
  });

  it('normalizes and ensures Unfiled exists and pinned', async () => {
    const shared: Group = { id: 'root-shared', name: 'Shared', kind: 'shared', tags: [], children: [], prompts: [] };
    const priv: Group = { id: 'root-private', name: 'Private', kind: 'private', tags: [], children: [], prompts: [] };
    const lib: Library = { groups: [shared, priv], privatePrompts: [] };
    await seedLibrary(tmp, lib);

    const store = new LibraryStore(makeContext(tmp));
    const loaded = await store.load();

    const privateRoot = loaded.groups.find(g => g.id === 'root-private');
    expect(privateRoot).toBeTruthy();
    expect(privateRoot!.children.length).toBeGreaterThan(0);
    expect(privateRoot!.children[0].id).toBe('grp-unfiled');
  });

  it('deduplicates prompts across groups by normalized text', async () => {
    const p1: Prompt = { id: 'p1', text: 'Hello  world', createdAt: 'x', updatedAt: 'x', tags: [], private: true };
    const p2: Prompt = { id: 'p2', text: 'hello world', createdAt: 'x', updatedAt: 'x', tags: [], private: true };
    const unfiled: Group = { id: 'grp-unfiled', name: 'Unfiled', kind: 'private', tags: [], children: [], prompts: [p1, p2] };
    const priv: Group = { id: 'root-private', name: 'Private', kind: 'private', tags: [], children: [unfiled], prompts: [] };
    const shared: Group = { id: 'root-shared', name: 'Shared', kind: 'shared', tags: [], children: [], prompts: [] };
    const lib: Library = { groups: [shared, priv], privatePrompts: [] };
    await seedLibrary(tmp, lib);

    const store = new LibraryStore(makeContext(tmp));
    const res = await store.deduplicate();
    expect(res.removed).toBe(1);

    const after = await store.load();
    const uf = after.groups.find(g => g.id === 'root-private')!.children[0];
    expect(uf.prompts.length).toBe(1);
  });

  it('imports flexible JSON and skips duplicates into Private/Unfiled', async () => {
    const shared: Group = { id: 'root-shared', name: 'Shared', kind: 'shared', tags: [], children: [], prompts: [] };
    const unfiled: Group = { id: 'grp-unfiled', name: 'Unfiled', kind: 'private', tags: [], children: [], prompts: [] };
    const priv: Group = { id: 'root-private', name: 'Private', kind: 'private', tags: [], children: [unfiled], prompts: [] };
    const lib: Library = { groups: [shared, priv], privatePrompts: [] };
    await seedLibrary(tmp, lib);

    const store = new LibraryStore(makeContext(tmp));
    const obj = { groups: [{ name: 'G', prompts: [{ text: 'One' }, { text: 'Two' }] }], privatePrompts: [{ text: 'Two' }, { text: 'Three' }] };
    const res = await store.importFromObject(obj);
    expect(res.added).toBe(3);
    expect(res.skipped).toBe(1);

    const after = await store.load();
    const uf = after.groups.find(g => g.id === 'root-private')!.children[0];
    const texts = uf.prompts.map(p => p.text).sort();
    expect(texts).toEqual(['One', 'Three', 'Two']);
  });
});


describe('LibraryStore prompt ops', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'promptlib-ops-'));
  });

  it('addPromptToGroup prevents duplicates by normalization', async () => {
    const shared: Group = { id: 'root-shared', name: 'Shared', kind: 'shared', tags: [], children: [], prompts: [] };
    const unfiled: Group = { id: 'grp-unfiled', name: 'Unfiled', kind: 'private', tags: [], children: [], prompts: [] };
    const priv: Group = { id: 'root-private', name: 'Private', kind: 'private', tags: [], children: [unfiled], prompts: [] };
    const lib: Library = { groups: [shared, priv], privatePrompts: [] };
    await seedLibrary(tmp, lib);

    const store = new LibraryStore(makeContext(tmp));
    const ok1 = await store.addPromptToGroup('grp-unfiled', 'Hello  World');
    expect(ok1.ok).toBe(true);
    const ok2 = await store.addPromptToGroup('grp-unfiled', 'hello world');
    expect(ok2.ok).toBe(false);
  });

  it('updatePromptText prevents duplicates and updates timestamps', async () => {
    const a: Prompt = { id: 'a', text: 'First', createdAt: 'x', updatedAt: 'x', tags: [], private: true };
    const b: Prompt = { id: 'b', text: 'Second', createdAt: 'x', updatedAt: 'x', tags: [], private: true };
    const unfiled: Group = { id: 'grp-unfiled', name: 'Unfiled', kind: 'private', tags: [], children: [], prompts: [a, b] };
    const priv: Group = { id: 'root-private', name: 'Private', kind: 'private', tags: [], children: [unfiled], prompts: [] };
    const shared: Group = { id: 'root-shared', name: 'Shared', kind: 'shared', tags: [], children: [], prompts: [] };
    const lib: Library = { groups: [shared, priv], privatePrompts: [] };
    await seedLibrary(tmp, lib);

    const store = new LibraryStore(makeContext(tmp));
    const fail = await store.updatePromptText('a', 'second');
    expect(fail.ok).toBe(false);

    const ok = await store.updatePromptText('a', 'third');
    expect(ok.ok).toBe(true);
    const after = await store.load();
    const uf = after.groups.find(g => g.id === 'root-private')!.children[0];
    const updated = uf.prompts.find(p => p.id === 'a')!;
    expect(updated.text).toBe('third');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(0);
  });

  it('movePrompt moves across groups and toggles private flag', async () => {
    const p: Prompt = { id: 'p', text: 'X', createdAt: 'x', updatedAt: 'x', tags: [], private: true };
    const privChild: Group = { id: 'grp-p1', name: 'P1', kind: 'private', tags: [], children: [], prompts: [p] };
    const unfiled: Group = { id: 'grp-unfiled', name: 'Unfiled', kind: 'private', tags: [], children: [], prompts: [] };
    const priv: Group = { id: 'root-private', name: 'Private', kind: 'private', tags: [], children: [unfiled, privChild], prompts: [] };
    const sharedChild: Group = { id: 'grp-s1', name: 'S1', kind: 'shared', tags: [], children: [], prompts: [] };
    const shared: Group = { id: 'root-shared', name: 'Shared', kind: 'shared', tags: [], children: [sharedChild], prompts: [] };
    const lib: Library = { groups: [shared, priv], privatePrompts: [] };
    await seedLibrary(tmp, lib);

    const store = new LibraryStore(makeContext(tmp));
    const res = await store.movePrompt('p', 'grp-s1');
    expect(res.ok).toBe(true);

    const after = await store.load();
    const pvt = after.groups.find(g => g.id === 'root-private')!;
    const prvChild = pvt.children.find(g => g.id === 'grp-p1')!;
    expect(prvChild.prompts.find(x => x.id === 'p')).toBeFalsy();
    const shd = after.groups.find(g => g.id === 'root-shared')!;
    const target = shd.children.find(g => g.id === 'grp-s1')!;
    const moved = target.prompts.find(x => x.id === 'p')!;
    expect(moved.private).toBe(false);
  });
});


