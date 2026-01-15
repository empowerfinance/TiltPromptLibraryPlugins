import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LibraryStore } from '../store';
import { Library, Group } from '../model';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('LibraryStore - Advanced Operations', () => {
  let store: LibraryStore;
  let mockContext: vscode.ExtensionContext;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-adv-test-'));
    mockContext = {
      globalStorageUri: vscode.Uri.file(tmpDir),
      subscriptions: [],
    } as any;
    store = new LibraryStore(mockContext);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('movePrompt', () => {
    it('should move prompt between groups', async () => {
      // Add prompt to unfiled
      const result = await store.addPromptToGroup('grp-unfiled', 'Test prompt');
      const promptId = result.prompt!.id;
      
      // Create a new group by manually modifying library
      const lib = await store.getLibrary();
      const privateRoot = lib.groups.find(g => g.id === 'root-private')!;
      const newGroup: Group = {
        id: 'grp-test',
        name: 'Test Group',
        kind: 'private',
        tags: [],
        children: [],
        prompts: []
      };
      privateRoot.children.push(newGroup);
      await store['save'](lib);
      
      // Move prompt
      const moved = await store.movePrompt(promptId, 'grp-test');
      
      expect(moved.ok).toBe(true);
      
      // Verify prompt is in new group
      const prompts = await store.getPrompts('grp-test');
      expect(prompts).toHaveLength(1);
      expect(prompts[0].id).toBe(promptId);
      
      // Verify prompt is not in old group
      const unfiledPrompts = await store.getPrompts('grp-unfiled');
      expect(unfiledPrompts).toHaveLength(0);
    });

    it('should update private flag when moving to shared group', async () => {
      // Add prompt to private group
      const result = await store.addPromptToGroup('grp-unfiled', 'Test');
      const promptId = result.prompt!.id;
      
      // Create shared group
      const lib = await store.getLibrary();
      const sharedRoot = lib.groups.find(g => g.id === 'root-shared')!;
      const sharedGroup: Group = {
        id: 'grp-shared-test',
        name: 'Shared Test',
        kind: 'shared',
        tags: [],
        children: [],
        prompts: []
      };
      sharedRoot.children.push(sharedGroup);
      await store['save'](lib);
      
      // Move to shared
      await store.movePrompt(promptId, 'grp-shared-test');
      
      const prompt = await store.getPromptById(promptId);
      expect(prompt?.private).toBe(false);
    });

    it('should reject moving to root groups', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Test');
      const promptId = result.prompt!.id;
      
      const moved1 = await store.movePrompt(promptId, 'root-shared');
      expect(moved1.ok).toBe(false);
      expect(moved1.reason).toContain('root');
      
      const moved2 = await store.movePrompt(promptId, 'root-private');
      expect(moved2.ok).toBe(false);
      expect(moved2.reason).toContain('root');
    });

    it('should return error for non-existent prompt', async () => {
      const moved = await store.movePrompt('non-existent', 'grp-unfiled');
      
      expect(moved.ok).toBe(false);
      expect(moved.reason).toContain('not found');
    });

    it('should return error for non-existent target group', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Test');
      const promptId = result.prompt!.id;
      
      const moved = await store.movePrompt(promptId, 'non-existent-group');
      
      expect(moved.ok).toBe(false);
      expect(moved.reason).toContain('not found');
    });

    it('should update updatedAt timestamp', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Test');
      const promptId = result.prompt!.id;
      const originalUpdatedAt = result.prompt!.updatedAt;
      
      // Create target group
      const lib = await store.getLibrary();
      const privateRoot = lib.groups.find(g => g.id === 'root-private')!;
      privateRoot.children.push({
        id: 'grp-target',
        name: 'Target',
        kind: 'private',
        tags: [],
        children: [],
        prompts: []
      });
      await store['save'](lib);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      await store.movePrompt(promptId, 'grp-target');
      
      const prompt = await store.getPromptById(promptId);
      expect(prompt?.updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('listMovableGroups', () => {
    it('should list all non-root groups', async () => {
      const groups = await store.listMovableGroups();
      
      // Should have at least Unfiled
      expect(groups.length).toBeGreaterThanOrEqual(1);
      expect(groups.find(g => g.id === 'grp-unfiled')).toBeDefined();
      
      // Should not have root groups
      expect(groups.find(g => g.id === 'root-shared')).toBeUndefined();
      expect(groups.find(g => g.id === 'root-private')).toBeUndefined();
    });

    it('should include custom groups', async () => {
      // Add custom group
      const lib = await store.getLibrary();
      const privateRoot = lib.groups.find(g => g.id === 'root-private')!;
      privateRoot.children.push({
        id: 'grp-custom',
        name: 'Custom Group',
        kind: 'private',
        tags: [],
        children: [],
        prompts: []
      });
      await store['save'](lib);
      
      const groups = await store.listMovableGroups();
      
      expect(groups.find(g => g.id === 'grp-custom')).toBeDefined();
      expect(groups.find(g => g.id === 'grp-custom')?.name).toBe('Custom Group');
    });

    it('should include nested groups', async () => {
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
      
      const groups = await store.listMovableGroups();
      
      expect(groups.find(g => g.id === 'grp-nested')).toBeDefined();
    });
  });

  describe('exportPrivateAsStringArray', () => {
    it('should export all private prompts as strings', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Prompt 1');
      await store.addPromptToGroup('grp-unfiled', 'Prompt 2');

      const exported = await store.exportPrivateAsStringArray();

      expect(exported).toHaveLength(2);
      expect(exported).toContain('Prompt 1');
      expect(exported).toContain('Prompt 2');
    });

    it('should return empty array when no private prompts', async () => {
      const exported = await store.exportPrivateAsStringArray();

      expect(exported).toEqual([]);
    });

    it('should include prompts from nested private groups', async () => {
      // Add to unfiled
      await store.addPromptToGroup('grp-unfiled', 'Unfiled prompt');

      // Add nested group with prompt
      const lib = await store.getLibrary();
      const privateRoot = lib.groups.find(g => g.id === 'root-private')!;
      const nestedGroup: Group = {
        id: 'grp-nested',
        name: 'Nested',
        kind: 'private',
        tags: [],
        children: [],
        prompts: [{
          id: 'p-nested',
          text: 'Nested prompt',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
          private: true
        }]
      };
      privateRoot.children.push(nestedGroup);
      await store['save'](lib);

      const exported = await store.exportPrivateAsStringArray();

      expect(exported).toHaveLength(2);
      expect(exported).toContain('Unfiled prompt');
      expect(exported).toContain('Nested prompt');
    });

    it('should not include shared prompts', async () => {
      // Add shared prompt
      const lib = await store.getLibrary();
      const sharedRoot = lib.groups.find(g => g.id === 'root-shared')!;
      const sharedGroup: Group = {
        id: 'grp-shared',
        name: 'Shared',
        kind: 'shared',
        tags: [],
        children: [],
        prompts: [{
          id: 'p-shared',
          text: 'Shared prompt',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
          private: false
        }]
      };
      sharedRoot.children.push(sharedGroup);
      await store['save'](lib);

      const exported = await store.exportPrivateAsStringArray();

      expect(exported).not.toContain('Shared prompt');
    });
  });

  describe('importStringArrayToUnfiled', () => {
    it('should import string array to unfiled', async () => {
      const result = await store.importStringArrayToUnfiled(['Prompt 1', 'Prompt 2']);

      expect(result.added).toBe(2);
      expect(result.skipped).toBe(0);

      const prompts = await store.getPrompts('grp-unfiled');
      expect(prompts).toHaveLength(2);
    });

    it('should skip duplicates', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Existing');

      const result = await store.importStringArrayToUnfiled(['Existing', 'New']);

      expect(result.added).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('should skip normalized duplicates', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Test  Prompt');

      const result = await store.importStringArrayToUnfiled(['test prompt', 'New']);

      expect(result.added).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('should skip non-string values', async () => {
      const result = await store.importStringArrayToUnfiled([
        'Valid',
        null as any,
        123 as any,
        undefined as any,
        'Also valid'
      ]);

      expect(result.added).toBe(2);
      expect(result.skipped).toBe(3);
    });

    it('should throw error for non-array input', async () => {
      await expect(store.importStringArrayToUnfiled('not an array' as any))
        .rejects.toThrow('Expected an array');
    });

    it('should set private flag on imported prompts', async () => {
      await store.importStringArrayToUnfiled(['Test']);

      const prompts = await store.getPrompts('grp-unfiled');
      expect(prompts[0].private).toBe(true);
    });
  });

  describe('importFromObject', () => {
    it('should import from array of strings', async () => {
      const result = await store.importFromObject(['Prompt 1', 'Prompt 2']);

      expect(result.added).toBe(2);
      expect(result.skipped).toBe(0);
    });

    it('should import from array of prompt objects', async () => {
      const result = await store.importFromObject([
        { text: 'Prompt 1' },
        { text: 'Prompt 2' }
      ]);

      expect(result.added).toBe(2);
    });

    it('should import from library-shaped object', async () => {
      const obj = {
        groups: [
          {
            prompts: [{ text: 'Group prompt 1' }, { text: 'Group prompt 2' }],
            children: []
          }
        ],
        privatePrompts: [{ text: 'Private prompt' }]
      };

      const result = await store.importFromObject(obj);

      expect(result.added).toBe(3);
    });

    it('should import from flat prompts array', async () => {
      const obj = {
        prompts: [{ text: 'Prompt 1' }, { text: 'Prompt 2' }]
      };

      const result = await store.importFromObject(obj);

      expect(result.added).toBe(2);
    });

    it('should skip duplicates', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Existing');

      const result = await store.importFromObject(['Existing', 'New']);

      expect(result.added).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('should handle nested groups', async () => {
      const obj = {
        groups: [
          {
            prompts: [{ text: 'Parent prompt' }],
            children: [
              {
                prompts: [{ text: 'Child prompt' }],
                children: []
              }
            ]
          }
        ]
      };

      const result = await store.importFromObject(obj);

      expect(result.added).toBe(2);
    });
  });

  describe('deduplicate', () => {
    it('should remove duplicate prompts', async () => {
      // Manually add duplicates
      const lib = await store.getLibrary();
      const unfiled = lib.groups.find(g => g.id === 'root-private')!.children[0];
      const now = new Date().toISOString();

      unfiled.prompts.push(
        { id: 'p-1', text: 'Duplicate', createdAt: now, updatedAt: now, tags: [], private: true },
        { id: 'p-2', text: 'Unique', createdAt: now, updatedAt: now, tags: [], private: true },
        { id: 'p-3', text: 'duplicate', createdAt: now, updatedAt: now, tags: [], private: true }
      );
      await store['save'](lib);

      const result = await store.deduplicate();

      expect(result.removed).toBe(1);

      const prompts = await store.getPrompts('grp-unfiled');
      expect(prompts).toHaveLength(2);
    });

    it('should keep first occurrence of duplicates', async () => {
      const lib = await store.getLibrary();
      const unfiled = lib.groups.find(g => g.id === 'root-private')!.children[0];
      const now = new Date().toISOString();

      unfiled.prompts.push(
        { id: 'p-first', text: 'Keep me', createdAt: now, updatedAt: now, tags: [], private: true },
        { id: 'p-second', text: 'keep me', createdAt: now, updatedAt: now, tags: [], private: true }
      );
      await store['save'](lib);

      await store.deduplicate();

      const prompts = await store.getPrompts('grp-unfiled');
      expect(prompts[0].id).toBe('p-first');
    });

    it('should return zero when no duplicates', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Unique 1');
      await store.addPromptToGroup('grp-unfiled', 'Unique 2');

      const result = await store.deduplicate();

      expect(result.removed).toBe(0);
    });

    it('should deduplicate across groups', async () => {
      // Add to unfiled
      await store.addPromptToGroup('grp-unfiled', 'Duplicate');

      // Add to another group
      const lib = await store.getLibrary();
      const privateRoot = lib.groups.find(g => g.id === 'root-private')!;
      const newGroup: Group = {
        id: 'grp-other',
        name: 'Other',
        kind: 'private',
        tags: [],
        children: [],
        prompts: [{
          id: 'p-dup',
          text: 'duplicate',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
          private: true
        }]
      };
      privateRoot.children.push(newGroup);
      await store['save'](lib);

      const result = await store.deduplicate();

      expect(result.removed).toBe(1);
    });
  });
});
