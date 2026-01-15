import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GroupsProvider, GroupItem, PromptItem } from '../groups';
import { LibraryStore } from '../store';
import { Group } from '../model';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock git functions
vi.mock('../sync/git', () => ({
  isGitRepo: vi.fn().mockResolvedValue(false),
  getRemoteUrl: vi.fn().mockResolvedValue(null)
}));

describe('GroupsProvider', () => {
  let store: LibraryStore;
  let provider: GroupsProvider;
  let mockContext: vscode.ExtensionContext;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'groups-test-'));
    mockContext = {
      globalStorageUri: vscode.Uri.file(tmpDir),
      subscriptions: [],
    } as any;
    store = new LibraryStore(mockContext);
    provider = new GroupsProvider(store);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('initialization', () => {
    it('should initialize with library from store', async () => {
      await provider.init();

      const children = await provider.getChildren();

      // Should have at least Private root (Shared may be hidden if no git repo)
      expect(children.length).toBeGreaterThan(0);
      expect(children[0]).toBeInstanceOf(GroupItem);
    });

    it('should load library on first getChildren call', async () => {
      const children = await provider.getChildren();
      
      expect(children).toHaveLength(2);
    });

    it('should emit change event on refresh', async () => {
      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);
      
      provider.refresh();
      
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getChildren', () => {
    it('should return root groups when no element provided', async () => {
      await provider.init();

      const children = await provider.getChildren();

      // Should have at least Private root
      expect(children.length).toBeGreaterThan(0);
      const ids = children.map(c => (c as GroupItem).groupId);
      expect(ids).toContain('root-private');
    });

    it('should return children of a group', async () => {
      await provider.init();
      
      const roots = await provider.getChildren();
      const privateRoot = roots.find(r => (r as GroupItem).groupId === 'root-private') as GroupItem;
      
      const children = await provider.getChildren(privateRoot);
      
      // Should have Unfiled group
      expect(children.length).toBeGreaterThan(0);
      const unfiled = children.find(c => (c as GroupItem).groupId === 'grp-unfiled');
      expect(unfiled).toBeDefined();
    });

    it('should return prompts from a group', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Test prompt', 'Test Title');
      await provider.init();
      
      const roots = await provider.getChildren();
      const privateRoot = roots.find(r => (r as GroupItem).groupId === 'root-private') as GroupItem;
      const children = await provider.getChildren(privateRoot);
      const unfiled = children.find(c => (c as GroupItem).groupId === 'grp-unfiled') as GroupItem;
      
      const prompts = await provider.getChildren(unfiled);
      
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toBeInstanceOf(PromptItem);
      expect((prompts[0] as PromptItem).label).toBe('Test Title');
    });

    it('should return empty array for prompt items', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Test');
      await provider.init();
      
      const roots = await provider.getChildren();
      const privateRoot = roots.find(r => (r as GroupItem).groupId === 'root-private') as GroupItem;
      const children = await provider.getChildren(privateRoot);
      const unfiled = children.find(c => (c as GroupItem).groupId === 'grp-unfiled') as GroupItem;
      const prompts = await provider.getChildren(unfiled);
      const prompt = prompts[0] as PromptItem;
      
      const promptChildren = await provider.getChildren(prompt);
      
      expect(promptChildren).toEqual([]);
    });

    it('should use fallback title for prompts without title', async () => {
      await store.addPromptToGroup('grp-unfiled', 'This is a long prompt text without title');
      await provider.init();
      
      const roots = await provider.getChildren();
      const privateRoot = roots.find(r => (r as GroupItem).groupId === 'root-private') as GroupItem;
      const children = await provider.getChildren(privateRoot);
      const unfiled = children.find(c => (c as GroupItem).groupId === 'grp-unfiled') as GroupItem;
      const prompts = await provider.getChildren(unfiled);
      
      expect((prompts[0] as PromptItem).label).toBe('This is a long promp');
    });
  });

  describe('getGroupById', () => {
    it('should find group by id', async () => {
      await provider.init();
      
      const group = provider.getGroupById('grp-unfiled');
      
      expect(group).toBeDefined();
      expect(group?.id).toBe('grp-unfiled');
      expect(group?.name).toBe('Unfiled');
    });

    it('should return null for non-existent group', async () => {
      await provider.init();
      
      const group = provider.getGroupById('non-existent');
      
      expect(group).toBeNull();
    });

    it('should find nested groups', async () => {
      // Add nested group
      const lib = await store.getLibrary();
      const unfiled = lib.groups.find(g => g.id === 'root-private')!.children[0];
      unfiled.children.push({
        id: 'grp-nested',
        name: 'Nested',
        kind: 'private',
        tags: [],
        children: [],
        prompts: []
      });
      await store['save'](lib);
      await provider.init();
      
      const group = provider.getGroupById('grp-nested');
      
      expect(group).toBeDefined();
      expect(group?.name).toBe('Nested');
    });
  });

  describe('addGroup', () => {
    it('should add group to target root', async () => {
      await provider.init();

      // Mock user input
      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('New Group');

      await provider.addGroup('root-private');

      const privateRoot = provider.getGroupById('root-private');
      expect(privateRoot?.children.length).toBeGreaterThan(1);

      const newGroup = privateRoot?.children.find(c => c.name === 'New Group');
      expect(newGroup).toBeDefined();
      expect(newGroup?.kind).toBe('private');
    });

    it('should generate unique id for new group', async () => {
      await provider.init();

      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Test Group');

      await provider.addGroup('root-private');

      const privateRoot = provider.getGroupById('root-private');
      const newGroup = privateRoot?.children.find(c => c.name === 'Test Group');

      expect(newGroup?.id).toMatch(/^grp-[a-z0-9]+-[a-z0-9]+$/);
    });

    it('should not add group when user cancels', async () => {
      await provider.init();

      const privateRoot = provider.getGroupById('root-private');
      const initialCount = privateRoot?.children.length || 0;

      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue(undefined);

      await provider.addGroup('root-private');

      const afterRoot = provider.getGroupById('root-private');
      expect(afterRoot?.children.length).toBe(initialCount);
    });

    it('should inherit kind from parent', async () => {
      await provider.init();

      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Shared Group');

      await provider.addGroup('root-shared');

      const sharedRoot = provider.getGroupById('root-shared');
      const newGroup = sharedRoot?.children.find(c => c.name === 'Shared Group');

      expect(newGroup?.kind).toBe('shared');
    });
  });

  describe('renameGroup', () => {
    it('should rename group', async () => {
      // Add a group first
      const lib = await store.getLibrary();
      const privateRoot = lib.groups.find(g => g.id === 'root-private')!;
      privateRoot.children.push({
        id: 'grp-test',
        name: 'Old Name',
        kind: 'private',
        tags: [],
        children: [],
        prompts: []
      });
      await store['save'](lib);
      await provider.init();

      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('New Name');

      await provider.renameGroup('grp-test');

      const group = provider.getGroupById('grp-test');
      expect(group?.name).toBe('New Name');
    });

    it('should not rename root groups', async () => {
      await provider.init();

      const warningSpy = vi.spyOn(vscode.window, 'showWarningMessage');

      await provider.renameGroup('root-private');

      expect(warningSpy).toHaveBeenCalledWith('Cannot rename this group.');
    });

    it('should not rename Unfiled group', async () => {
      await provider.init();

      const warningSpy = vi.spyOn(vscode.window, 'showWarningMessage');

      await provider.renameGroup('grp-unfiled');

      expect(warningSpy).toHaveBeenCalledWith('Cannot rename this group.');
    });

    it('should not rename shared groups', async () => {
      const lib = await store.getLibrary();
      const sharedRoot = lib.groups.find(g => g.id === 'root-shared')!;
      sharedRoot.children.push({
        id: 'grp-shared-test',
        name: 'Shared Group',
        kind: 'shared',
        tags: [],
        children: [],
        prompts: []
      });
      await store['save'](lib);
      await provider.init();

      const warningSpy = vi.spyOn(vscode.window, 'showWarningMessage');

      await provider.renameGroup('grp-shared-test');

      expect(warningSpy).toHaveBeenCalledWith('Cannot rename this group.');
    });
  });

  describe('deleteGroup', () => {
    it('should delete group and rehome prompts to unfiled', async () => {
      // Add group with prompts
      const lib = await store.getLibrary();
      const privateRoot = lib.groups.find(g => g.id === 'root-private')!;
      const now = new Date().toISOString();
      privateRoot.children.push({
        id: 'grp-to-delete',
        name: 'To Delete',
        kind: 'private',
        tags: [],
        children: [],
        prompts: [{
          id: 'p-1',
          text: 'Prompt to rehome',
          createdAt: now,
          updatedAt: now,
          tags: [],
          private: true
        }]
      });
      await store['save'](lib);
      await provider.init();

      vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Delete' as any);

      await provider.deleteGroup('grp-to-delete');

      // Group should be deleted
      const group = provider.getGroupById('grp-to-delete');
      expect(group).toBeNull();

      // Prompt should be in unfiled
      const unfiled = provider.getGroupById('grp-unfiled');
      expect(unfiled?.prompts.length).toBeGreaterThan(0);
      expect(unfiled?.prompts.find(p => p.text === 'Prompt to rehome')).toBeDefined();
    });

    it('should not delete root groups', async () => {
      await provider.init();

      const warningSpy = vi.spyOn(vscode.window, 'showWarningMessage');

      await provider.deleteGroup('root-private');

      expect(warningSpy).toHaveBeenCalledWith('This group cannot be deleted.');
    });

    it('should not delete Unfiled group', async () => {
      await provider.init();

      const warningSpy = vi.spyOn(vscode.window, 'showWarningMessage');

      await provider.deleteGroup('grp-unfiled');

      expect(warningSpy).toHaveBeenCalledWith('This group cannot be deleted.');
    });

    it('should not delete shared groups', async () => {
      const lib = await store.getLibrary();
      const sharedRoot = lib.groups.find(g => g.id === 'root-shared')!;
      sharedRoot.children.push({
        id: 'grp-shared-test',
        name: 'Shared',
        kind: 'shared',
        tags: [],
        children: [],
        prompts: []
      });
      await store['save'](lib);
      await provider.init();

      const warningSpy = vi.spyOn(vscode.window, 'showWarningMessage');

      await provider.deleteGroup('grp-shared-test');

      expect(warningSpy).toHaveBeenCalledWith('Shared groups cannot be deleted.');
    });

    it('should collect prompts from nested groups', async () => {
      // Add group with nested group containing prompts
      const lib = await store.getLibrary();
      const privateRoot = lib.groups.find(g => g.id === 'root-private')!;
      const now = new Date().toISOString();
      privateRoot.children.push({
        id: 'grp-parent',
        name: 'Parent',
        kind: 'private',
        tags: [],
        children: [{
          id: 'grp-child',
          name: 'Child',
          kind: 'private',
          tags: [],
          children: [],
          prompts: [{
            id: 'p-nested',
            text: 'Nested prompt',
            createdAt: now,
            updatedAt: now,
            tags: [],
            private: true
          }]
        }],
        prompts: []
      });
      await store['save'](lib);
      await provider.init();

      vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Delete' as any);

      await provider.deleteGroup('grp-parent');

      // Nested prompt should be in unfiled
      const unfiled = provider.getGroupById('grp-unfiled');
      expect(unfiled?.prompts.find(p => p.text === 'Nested prompt')).toBeDefined();
    });

    it('should not delete when user cancels', async () => {
      const lib = await store.getLibrary();
      const privateRoot = lib.groups.find(g => g.id === 'root-private')!;
      privateRoot.children.push({
        id: 'grp-test',
        name: 'Test',
        kind: 'private',
        tags: [],
        children: [],
        prompts: []
      });
      await store['save'](lib);
      await provider.init();

      vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

      await provider.deleteGroup('grp-test');

      const group = provider.getGroupById('grp-test');
      expect(group).toBeDefined();
    });
  });

  describe('setLibrary', () => {
    it('should update library and refresh', async () => {
      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);

      const lib = await store.getLibrary();
      provider.setLibrary(lib);

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('refreshFromStore', () => {
    it('should reload library from store', async () => {
      await provider.init();

      // Add prompt directly to store
      await store.addPromptToGroup('grp-unfiled', 'New prompt');

      // Refresh from store
      await provider.refreshFromStore();

      // Should see the new prompt
      const roots = await provider.getChildren();
      const privateRoot = roots.find(r => (r as GroupItem).groupId === 'root-private') as GroupItem;
      const children = await provider.getChildren(privateRoot);
      const unfiled = children.find(c => (c as GroupItem).groupId === 'grp-unfiled') as GroupItem;
      const prompts = await provider.getChildren(unfiled);

      expect(prompts).toHaveLength(1);
    });
  });
});
