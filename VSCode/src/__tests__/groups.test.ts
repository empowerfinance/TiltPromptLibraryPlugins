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

// Store mock implementations that can be changed per test - use vi.hoisted to ensure availability
const { mockEnabledLibrariesRef, mockActiveLibraryRef, mockSettingsRef } = vi.hoisted(() => ({
  mockEnabledLibrariesRef: { value: null as import('../settings').LibraryConfig[] | null },
  mockActiveLibraryRef: { value: null as import('../settings').LibraryConfig | null },
  mockSettingsRef: { value: null as import('../settings').PromptLibrarySettings | null },
}));

// Mock settings functions - only mock the ones we need for hidden library tests
vi.mock('../settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../settings')>();
  return {
    ...actual,
    getSettings: () => mockSettingsRef.value ?? actual.getSettings(),
    getEnabledLibraries: () => mockEnabledLibrariesRef.value ?? actual.getEnabledLibraries(),
    getActiveLibrary: () => mockActiveLibraryRef.value ?? actual.getActiveLibrary(),
  };
});

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
    } catch { }
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

      // Only Private root shows when there's no git repo (isGitRepo is mocked to false)
      // and no enabled libraries (no _library.yaml files in the temp dir)
      expect(children.length).toBeGreaterThanOrEqual(1);
      expect(children[0]).toBeInstanceOf(GroupItem);
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

    it('should set libraryId when adding group to virtual library root', async () => {
      await provider.init();

      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Library-Specific Group');

      // Add group to a virtual library root node (e.g., lib-root-promptsProduct)
      await provider.addGroup('lib-root-promptsProduct');

      // The group should be added to root-shared with the libraryId set
      const sharedRoot = provider.getGroupById('root-shared');
      const newGroup = sharedRoot?.children.find(c => c.name === 'Library-Specific Group');

      expect(newGroup).toBeDefined();
      expect(newGroup?.libraryId).toBe('promptsProduct');
      expect(newGroup?.kind).toBe('shared');
    });

    it('should set different libraryId for each library root', async () => {
      await provider.init();

      // Add to first library
      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('General Group');
      await provider.addGroup('lib-root-general');

      // Add to second library
      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Platform Group');
      await provider.addGroup('lib-root-platform');

      const sharedRoot = provider.getGroupById('root-shared');
      const generalGroup = sharedRoot?.children.find(c => c.name === 'General Group');
      const platformGroup = sharedRoot?.children.find(c => c.name === 'Platform Group');

      expect(generalGroup?.libraryId).toBe('general');
      expect(platformGroup?.libraryId).toBe('platform');
    });

    it('should not set libraryId when adding to regular root-private', async () => {
      await provider.init();

      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Private Group');

      await provider.addGroup('root-private');

      const privateRoot = provider.getGroupById('root-private');
      const newGroup = privateRoot?.children.find(c => c.name === 'Private Group');

      expect(newGroup).toBeDefined();
      expect(newGroup?.libraryId).toBeUndefined();
    });

    it('should normalize group name to PascalCase for folder path', async () => {
      await provider.init();

      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('my new group');

      await provider.addGroup('root-private');

      const privateRoot = provider.getGroupById('root-private');
      const newGroup = privateRoot?.children.find(c => c.name === 'my new group');

      expect(newGroup).toBeDefined();
      // The folderName should be PascalCase for filesystem
      expect(newGroup?.folderName).toBe('MyNewGroup');
      // But the display name (name) should be the original input
      expect(newGroup?.name).toBe('my new group');
    });

    it('should set PascalCase folder name for hyphenated input', async () => {
      await provider.init();

      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('my-api-group');

      await provider.addGroup('root-private');

      const privateRoot = provider.getGroupById('root-private');
      const newGroup = privateRoot?.children.find(c => c.name === 'my-api-group');

      expect(newGroup).toBeDefined();
      expect(newGroup?.folderName).toBe('MyApiGroup');
    });

    it('should preserve PascalCase input as folder name', async () => {
      await provider.init();

      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('MyExistingGroup');

      await provider.addGroup('root-private');

      const privateRoot = provider.getGroupById('root-private');
      const newGroup = privateRoot?.children.find(c => c.name === 'MyExistingGroup');

      expect(newGroup).toBeDefined();
      expect(newGroup?.folderName).toBe('MyExistingGroup');
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

    it('should rename shared groups', async () => {
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

      // Mock showInputBox to return new name
      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Renamed Shared Group');

      await provider.renameGroup('grp-shared-test');

      // Verify group was renamed (for PR-based workflow)
      const updatedLib = await store.getLibrary();
      const updatedSharedRoot = updatedLib.groups.find(g => g.id === 'root-shared')!;
      const renamedGroup = updatedSharedRoot.children.find(g => g.id === 'grp-shared-test');
      expect(renamedGroup?.name).toBe('Renamed Shared Group');
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

    it('should delete shared groups', async () => {
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

      // Mock confirmation dialog to accept deletion
      vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Delete' as any);

      await provider.deleteGroup('grp-shared-test');

      // Verify group was deleted (for PR-based workflow)
      const updatedLib = await store.getLibrary();
      const updatedSharedRoot = updatedLib.groups.find(g => g.id === 'root-shared')!;
      const deletedGroup = updatedSharedRoot.children.find(g => g.id === 'grp-shared-test');
      expect(deletedGroup).toBeUndefined();
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

  describe('multi-library getChildren filtering', () => {
    it('should filter library children by libraryId', async () => {
      // Setup: Add groups with different libraryIds
      const lib = await store.getLibrary();
      const sharedRoot = lib.groups.find(g => g.id === 'root-shared')!;
      sharedRoot.children = [
        {
          id: 'grp-general-1',
          name: 'General Group',
          kind: 'shared',
          libraryId: 'general',
          tags: [],
          children: [],
          prompts: []
        },
        {
          id: 'grp-platform-1',
          name: 'Platform Group',
          kind: 'shared',
          libraryId: 'platform',
          tags: [],
          children: [],
          prompts: []
        },
        {
          id: 'grp-general-2',
          name: 'Another General Group',
          kind: 'shared',
          libraryId: 'general',
          tags: [],
          children: [],
          prompts: []
        }
      ];
      await store['save'](lib);
      await provider.init();

      // Create a virtual library root item
      const generalLibRoot = new GroupItem(
        'lib-root-general',
        'General',
        vscode.TreeItemCollapsibleState.Expanded,
        'library-root'
      );

      // Get children of the general library root
      const generalChildren = await provider.getChildren(generalLibRoot);

      // Should only contain groups with libraryId === 'general'
      expect(generalChildren).toHaveLength(2);
      expect(generalChildren.map(c => (c as GroupItem).groupId)).toContain('grp-general-1');
      expect(generalChildren.map(c => (c as GroupItem).groupId)).toContain('grp-general-2');
      expect(generalChildren.map(c => (c as GroupItem).groupId)).not.toContain('grp-platform-1');
    });

    it('should return empty array for library with no groups', async () => {
      // Setup: Add groups only for one library
      const lib = await store.getLibrary();
      const sharedRoot = lib.groups.find(g => g.id === 'root-shared')!;
      sharedRoot.children = [
        {
          id: 'grp-general-1',
          name: 'General Group',
          kind: 'shared',
          libraryId: 'general',
          tags: [],
          children: [],
          prompts: []
        }
      ];
      await store['save'](lib);
      await provider.init();

      // Create a virtual library root item for a different library
      const platformLibRoot = new GroupItem(
        'lib-root-platform',
        'Platform',
        vscode.TreeItemCollapsibleState.Expanded,
        'library-root'
      );

      // Get children of the platform library root (which has no groups)
      const platformChildren = await provider.getChildren(platformLibRoot);

      expect(platformChildren).toHaveLength(0);
    });

    it('should handle groups without libraryId (legacy groups)', async () => {
      // Setup: Add groups without libraryId
      const lib = await store.getLibrary();
      const sharedRoot = lib.groups.find(g => g.id === 'root-shared')!;
      sharedRoot.children = [
        {
          id: 'grp-legacy',
          name: 'Legacy Group',
          kind: 'shared',
          // No libraryId - legacy group
          tags: [],
          children: [],
          prompts: []
        },
        {
          id: 'grp-general-1',
          name: 'General Group',
          kind: 'shared',
          libraryId: 'general',
          tags: [],
          children: [],
          prompts: []
        }
      ];
      await store['save'](lib);
      await provider.init();

      // Create a virtual library root item
      const generalLibRoot = new GroupItem(
        'lib-root-general',
        'General',
        vscode.TreeItemCollapsibleState.Expanded,
        'library-root'
      );

      // Get children of the general library root
      const generalChildren = await provider.getChildren(generalLibRoot);

      // Should only contain groups with explicit libraryId === 'general'
      // Legacy groups without libraryId should NOT appear
      expect(generalChildren).toHaveLength(1);
      expect((generalChildren[0] as GroupItem).groupId).toBe('grp-general-1');
    });

    it('should distinguish groups with same base ID but different libraryId prefixes', async () => {
      // This tests the fix for the bug where groups with the same base ID
      // in different libraries would collide
      const lib = await store.getLibrary();
      const sharedRoot = lib.groups.find(g => g.id === 'root-shared')!;

      // Simulate two libraries with groups that have the same base name but unique prefixed IDs
      sharedRoot.children = [
        {
          id: 'lib1:grp-testgroup',  // Prefixed with library ID
          name: 'TestGroup',
          kind: 'shared',
          libraryId: 'lib1',
          tags: [],
          children: [],
          prompts: [
            { id: 'lib1:p-1', text: 'Prompt from lib1', title: 'Lib1 Prompt', tags: [], createdAt: '', updatedAt: '', private: false }
          ]
        },
        {
          id: 'lib2:grp-testgroup',  // Same base ID, different library prefix
          name: 'TestGroup',
          kind: 'shared',
          libraryId: 'lib2',
          tags: [],
          children: [],
          prompts: [
            { id: 'lib2:p-1', text: 'Prompt from lib2', title: 'Lib2 Prompt', tags: [], createdAt: '', updatedAt: '', private: false }
          ]
        }
      ];
      await store['save'](lib);
      await provider.init();

      // Verify both groups exist and have unique IDs
      const reloadedLib = await store.getLibrary();
      const reloadedShared = reloadedLib.groups.find(g => g.id === 'root-shared')!;

      expect(reloadedShared.children).toHaveLength(2);
      expect(reloadedShared.children[0].id).toBe('lib1:grp-testgroup');
      expect(reloadedShared.children[1].id).toBe('lib2:grp-testgroup');

      // Verify prompts also have unique IDs
      expect(reloadedShared.children[0].prompts[0].id).toBe('lib1:p-1');
      expect(reloadedShared.children[1].prompts[0].id).toBe('lib2:p-1');
    });

    it('should find correct group when IDs are prefixed with libraryId', async () => {
      // This tests that store.findGroup works correctly with prefixed IDs
      const lib = await store.getLibrary();
      const sharedRoot = lib.groups.find(g => g.id === 'root-shared')!;

      sharedRoot.children = [
        {
          id: 'enabledLibraries:grp-test',
          name: 'Test',
          kind: 'shared',
          libraryId: 'enabledLibraries',
          tags: [],
          children: [],
          prompts: []
        },
        {
          id: 'promptsProduct:grp-test',
          name: 'Test',
          kind: 'shared',
          libraryId: 'promptsProduct',
          tags: [],
          children: [],
          prompts: []
        }
      ];
      await store['save'](lib);

      // Add a prompt to the second group (promptsProduct:grp-test)
      const result = await store.addPromptToGroup('promptsProduct:grp-test', 'Test prompt text', 'Test Title');

      expect(result.ok).toBe(true);
      expect(result.groupId).toBe('promptsProduct:grp-test');

      // Verify the prompt was added to the correct group
      const updatedLib = await store.getLibrary();
      const updatedShared = updatedLib.groups.find(g => g.id === 'root-shared')!;

      // First group (enabledLibraries) should have no prompts
      expect(updatedShared.children[0].prompts).toHaveLength(0);
      // Second group (promptsProduct) should have the new prompt
      expect(updatedShared.children[1].prompts).toHaveLength(1);
      expect(updatedShared.children[1].prompts[0].text).toBe('Test prompt text');
    });
  });
});

describe('GroupsProvider hidden libraries behavior', () => {
  let store: LibraryStore;
  let provider: GroupsProvider;
  let mockContext: vscode.ExtensionContext;
  let tmpDir: string;

  beforeEach(async () => {
    // Reset mock variables before each test
    mockEnabledLibrariesRef.value = null;
    mockActiveLibraryRef.value = null;
    mockSettingsRef.value = null;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'groups-hidden-test-'));
    mockContext = {
      globalStorageUri: vscode.Uri.file(tmpDir),
      subscriptions: [],
    } as any;
    store = new LibraryStore(mockContext);
    provider = new GroupsProvider(store);

    // Set up mock settings with a remoteRepoUrl so showShared is true
    mockSettingsRef.value = {
      remoteRepoUrl: 'https://github.com/test/repo.git',
      repoPath: tmpDir,
      promptsSubdir: 'general',
      hiddenLibraries: [],
      branchName: '',
      autoFetch: { enabled: false, minutes: 5 },
    };
  });

  afterEach(() => {
    // Reset mock variables after each test
    mockEnabledLibrariesRef.value = null;
    mockActiveLibraryRef.value = null;
    mockSettingsRef.value = null;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { }
  });

  it('should show no shared groups when all libraries are hidden', async () => {
    // Set up mocks - all libraries hidden (empty array)
    mockEnabledLibrariesRef.value = [];
    mockActiveLibraryRef.value = {
      id: 'general',
      path: 'general',
      displayName: 'General',
      enabled: false
    };

    await provider.init();
    const children = await provider.getChildren();

    // Should only have Private root, no shared libraries
    const groupIds = children.map(c => (c as GroupItem).groupId);
    expect(groupIds).toContain('root-private');
    expect(groupIds).not.toContain('root-shared');
    // No library root nodes either
    const libRootNodes = groupIds.filter(id => id.startsWith('lib-root-'));
    expect(libRootNodes).toHaveLength(0);
  });

  it('should show shared groups when at least one library is enabled', async () => {
    mockEnabledLibrariesRef.value = [
      { id: 'myLibrary', path: 'myLibrary', displayName: 'My Library', enabled: true }
    ];
    mockActiveLibraryRef.value = {
      id: 'myLibrary',
      path: 'myLibrary',
      displayName: 'My Library',
      enabled: true
    };

    await provider.init();
    const children = await provider.getChildren();

    // Should have both shared and private roots
    const groupIds = children.map(c => (c as GroupItem).groupId);
    expect(groupIds).toContain('root-private');
    expect(groupIds).toContain('root-shared');
  });

  it('should show multiple library nodes when multiple libraries are enabled', async () => {
    mockEnabledLibrariesRef.value = [
      { id: 'libraryA', path: 'libraryA', displayName: 'Library A', enabled: true },
      { id: 'libraryB', path: 'libraryB', displayName: 'Library B', enabled: true }
    ];
    mockActiveLibraryRef.value = {
      id: 'libraryA',
      path: 'libraryA',
      displayName: 'Library A',
      enabled: true
    };

    await provider.init();
    const children = await provider.getChildren();

    // Should have library root nodes for each enabled library, plus private
    const groupIds = children.map(c => (c as GroupItem).groupId);
    expect(groupIds).toContain('lib-root-libraryA');
    expect(groupIds).toContain('lib-root-libraryB');
    expect(groupIds).toContain('root-private');
    // Should NOT have the single shared root
    expect(groupIds).not.toContain('root-shared');
  });

  it('should hide active library from tree when it is in hidden list', async () => {
    // This tests that active library has no special treatment - it can be hidden
    // Active library is 'libraryA' but it's hidden (not in enabledLibraries)
    mockEnabledLibrariesRef.value = [
      { id: 'libraryB', path: 'libraryB', displayName: 'Library B', enabled: true }
    ];
    mockActiveLibraryRef.value = {
      id: 'libraryA',
      path: 'libraryA',
      displayName: 'Library A',
      enabled: false // active but hidden
    };

    await provider.init();
    const children = await provider.getChildren();

    // Should only show libraryB (the non-hidden one) + private
    const groupIds = children.map(c => (c as GroupItem).groupId);
    expect(groupIds).not.toContain('lib-root-libraryA');
    // With only one enabled library, should show root-shared not lib-root-
    expect(groupIds).toContain('root-shared');
    expect(groupIds).toContain('root-private');
  });
});
