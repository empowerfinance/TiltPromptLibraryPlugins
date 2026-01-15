import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LibraryStore } from '../store';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock the groups provider
vi.mock('../groups', () => ({
  GroupsProvider: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    refresh: vi.fn(),
    addGroup: vi.fn(),
    renameGroup: vi.fn(),
    deleteGroup: vi.fn()
  })),
  GroupItem: class {},
  PromptItem: class {}
}));

describe('Extension Commands - Basic CRUD', () => {
  let store: LibraryStore;
  let mockContext: vscode.ExtensionContext;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-cmd-test-'));
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

  describe('copyPrompt command', () => {
    it('should copy prompt text to clipboard', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Test prompt text');
      const promptId = result.prompt!.id;
      
      // Simulate command execution
      const p = await store.getPromptById(promptId);
      expect(p).toBeDefined();
      
      // In real command, this would call vscode.env.clipboard.writeText
      const textToCopy = p!.text;
      expect(textToCopy).toBe('Test prompt text');
    });

    it('should handle non-existent prompt gracefully', async () => {
      const p = await store.getPromptById('non-existent');
      expect(p).toBeNull();
    });
  });

  describe('deletePrompt command', () => {
    it('should delete private prompt', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'To delete');
      const promptId = result.prompt!.id;
      
      const p = await store.getPromptById(promptId);
      expect(p?.private).toBe(true);
      
      const deleted = await store.deletePrompt(promptId);
      expect(deleted).toBe(true);
      
      const found = await store.getPromptById(promptId);
      expect(found).toBeNull();
    });

    it('should not delete shared prompts', async () => {
      // Create shared prompt
      const lib = await store.getLibrary();
      const sharedRoot = lib.groups.find(g => g.id === 'root-shared')!;
      sharedRoot.prompts.push({
        id: 'p-shared',
        text: 'Shared prompt',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
        private: false
      });
      await store['save'](lib);
      
      const p = await store.getPromptById('p-shared');
      expect(p?.private).toBe(false);
      
      // Command should check private flag and show warning
      // In real implementation, this would show a warning message
    });
  });

  describe('movePrompt command', () => {
    it('should list movable groups', async () => {
      const groups = await store.listMovableGroups();
      
      expect(groups.length).toBeGreaterThan(0);
      expect(groups.find(g => g.id === 'grp-unfiled')).toBeDefined();
      expect(groups.find(g => g.id === 'root-shared')).toBeUndefined();
      expect(groups.find(g => g.id === 'root-private')).toBeUndefined();
    });

    it('should move prompt to selected group', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'To move');
      const promptId = result.prompt!.id;
      
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
      
      const moved = await store.movePrompt(promptId, 'grp-target');
      expect(moved.ok).toBe(true);
      
      const prompts = await store.getPrompts('grp-target');
      expect(prompts).toHaveLength(1);
      expect(prompts[0].id).toBe(promptId);
    });
  });

  describe('exportJson command', () => {
    it('should export private prompts as JSON array', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Prompt 1');
      await store.addPromptToGroup('grp-unfiled', 'Prompt 2');
      
      const exported = await store.exportPrivateAsStringArray();
      
      expect(exported).toHaveLength(2);
      expect(exported).toContain('Prompt 1');
      expect(exported).toContain('Prompt 2');
      
      // In real command, this would be written to a file
      const json = JSON.stringify(exported, null, 2);
      expect(json).toContain('Prompt 1');
      expect(json).toContain('Prompt 2');
    });

    it('should export empty array when no private prompts', async () => {
      const exported = await store.exportPrivateAsStringArray();
      expect(exported).toEqual([]);
    });
  });

  describe('importJson command', () => {
    it('should import JSON array of strings', async () => {
      const data = ['Imported 1', 'Imported 2', 'Imported 3'];
      
      const result = await store.importStringArrayToUnfiled(data);
      
      expect(result.added).toBe(3);
      expect(result.skipped).toBe(0);
      
      const prompts = await store.getPrompts('grp-unfiled');
      expect(prompts).toHaveLength(3);
    });

    it('should import JSON object with prompts', async () => {
      const data = {
        prompts: [
          { text: 'Prompt 1' },
          { text: 'Prompt 2' }
        ]
      };
      
      const result = await store.importFromObject(data);
      
      expect(result.added).toBe(2);
    });

    it('should skip duplicates during import', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Existing');
      
      const data = ['Existing', 'New 1', 'New 2'];
      const result = await store.importStringArrayToUnfiled(data);
      
      expect(result.added).toBe(2);
      expect(result.skipped).toBe(1);
    });
  });

  describe('deduplicate command', () => {
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

    it('should report when no duplicates found', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Unique 1');
      await store.addPromptToGroup('grp-unfiled', 'Unique 2');

      const result = await store.deduplicate();

      expect(result.removed).toBe(0);
    });
  });

  describe('resetAll command', () => {
    it('should reset library to initial state', async () => {
      // Add some data
      await store.addPromptToGroup('grp-unfiled', 'Test 1');
      await store.addPromptToGroup('grp-unfiled', 'Test 2');

      let prompts = await store.getPrompts('grp-unfiled');
      expect(prompts).toHaveLength(2);

      // Reset
      await store.resetAll();

      // Should be empty
      prompts = await store.getPrompts('grp-unfiled');
      expect(prompts).toHaveLength(0);

      // Should have default structure
      const lib = await store.getLibrary();
      expect(lib.groups).toHaveLength(2);
      expect(lib.groups[0].id).toBe('root-shared');
      expect(lib.groups[1].id).toBe('root-private');
    });
  });

  describe('openPrompt command', () => {
    it('should retrieve prompt by id', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Test prompt', 'Test Title');
      const promptId = result.prompt!.id;

      const p = await store.getPromptById(promptId);

      expect(p).toBeDefined();
      expect(p?.id).toBe(promptId);
      expect(p?.text).toBe('Test prompt');
      expect(p?.title).toBe('Test Title');
    });

    it('should handle missing prompt gracefully', async () => {
      const p = await store.getPromptById('non-existent');
      expect(p).toBeNull();
    });
  });

  describe('editPrompt command', () => {
    it('should retrieve prompt for editing', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Original text', 'Original Title');
      const promptId = result.prompt!.id;

      const p = await store.getPromptById(promptId);

      expect(p).toBeDefined();
      expect(p?.text).toBe('Original text');
      expect(p?.title).toBe('Original Title');
    });

    it('should use fallback title when title is empty', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'This is a long prompt text');
      const p = result.prompt!;

      const title = (p.title && p.title.trim())
        ? p.title
        : (p.text || '').replace(/\r\n?|\n/g, ' ').slice(0, 20).trim();

      expect(title).toBe('This is a long promp');
    });
  });

  describe('updatePromptText command', () => {
    it('should update prompt text', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Original');
      const promptId = result.prompt!.id;

      const updated = await store.updatePromptText(promptId, 'Updated text');

      expect(updated.ok).toBe(true);

      const p = await store.getPromptById(promptId);
      expect(p?.text).toBe('Updated text');
    });

    it('should reject duplicate text', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Existing');
      const result = await store.addPromptToGroup('grp-unfiled', 'To update');
      const promptId = result.prompt!.id;

      const updated = await store.updatePromptText(promptId, 'Existing');

      expect(updated.ok).toBe(false);
      expect(updated.reason).toContain('Duplicate');
    });
  });

  describe('updatePromptTitle command', () => {
    it('should update prompt title', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Text', 'Old Title');
      const promptId = result.prompt!.id;

      const updated = await store.updatePromptTitle(promptId, 'New Title');

      expect(updated.ok).toBe(true);

      const p = await store.getPromptById(promptId);
      expect(p?.title).toBe('New Title');
    });
  });
});
