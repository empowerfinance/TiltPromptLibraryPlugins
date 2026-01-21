import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LibraryStore } from '../store';
import { Library, Group, Prompt } from '../model';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('LibraryStore', () => {
  let store: LibraryStore;
  let mockContext: vscode.ExtensionContext;
  let tmpDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-test-'));

    // Create mock extension context
    mockContext = {
      globalStorageUri: vscode.Uri.file(tmpDir),
      subscriptions: [],
    } as any;

    store = new LibraryStore(mockContext);
  });

  afterEach(() => {
    // Cleanup temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { }
  });

  describe('initialization', () => {
    it('should initialize with default library structure', async () => {
      const lib = await store.load();

      expect(lib.groups).toHaveLength(2);
      expect(lib.groups[0].id).toBe('root-shared');
      expect(lib.groups[0].name).toBe('Shared');
      expect(lib.groups[1].id).toBe('root-private');
      expect(lib.groups[1].name).toBe('Private');

      // Private root should have Unfiled child
      expect(lib.groups[1].children).toHaveLength(1);
      expect(lib.groups[1].children[0].id).toBe('grp-unfiled');
      expect(lib.groups[1].children[0].name).toBe('Unfiled');
    });

    it('should create library file on first load', async () => {
      await store.load();

      const libPath = path.join(tmpDir, 'library.v2.json');
      expect(fs.existsSync(libPath)).toBe(true);
    });

    it('should persist library across loads', async () => {
      const lib1 = await store.load();
      const lib2 = await store.load();

      expect(lib1).toEqual(lib2);
    });
  });

  describe('save and load', () => {
    it('should save and reload library', async () => {
      const lib = await store.load();

      // Add a prompt
      const result = await store.addPromptToGroup('grp-unfiled', 'Test prompt', 'Test Title');
      expect(result.ok).toBe(true);

      // Create new store instance
      const store2 = new LibraryStore(mockContext);
      const lib2 = await store2.load();

      // Should have the prompt
      const unfiled = lib2.groups[1].children[0];
      expect(unfiled.prompts).toHaveLength(1);
      expect(unfiled.prompts[0].text).toBe('Test prompt');
    });

    it('should emit change event on save', async () => {
      const listener = vi.fn();
      store.onDidChange(listener);

      await store.load();

      // Should have emitted on initial save
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('addPromptToGroup', () => {
    it('should add prompt to group', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'My prompt text', 'My Title');

      expect(result.ok).toBe(true);
      expect(result.prompt).toBeDefined();
      expect(result.prompt?.text).toBe('My prompt text');
      expect(result.prompt?.title).toBe('My Title');
      // Prompt IDs no longer have p- prefix (it's added in the filename)
      expect(result.prompt?.id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
      expect(result.groupId).toBe('grp-unfiled');
    });

    it('should generate ID for new prompt', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Test');

      expect(result.ok).toBe(true);
      // Prompt IDs are generated without prefix (just timestamp-random)
      // The p- prefix is added when writing to disk as filename
      expect(result.prompt?.id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    });

    it('should set timestamps on new prompt', async () => {
      const before = new Date().toISOString();
      const result = await store.addPromptToGroup('grp-unfiled', 'Test');
      const after = new Date().toISOString();

      expect(result.ok).toBe(true);
      expect(result.prompt?.createdAt).toBeDefined();
      expect(result.prompt?.updatedAt).toBeDefined();

      // Timestamps are ISO strings, compare as strings
      expect(result.prompt?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result.prompt?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result.prompt?.createdAt).toBe(result.prompt?.updatedAt);
    });

    it('should use fallback title when title is empty', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'This is a long prompt text that should be truncated');

      expect(result.ok).toBe(true);
      expect(result.prompt?.title).toBe('This is a long promp');
    });

    it('should reject duplicate prompts', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Duplicate text');
      const result = await store.addPromptToGroup('grp-unfiled', 'Duplicate text');

      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Duplicate');
    });

    it('should reject normalized duplicates', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Test  Prompt');
      const result = await store.addPromptToGroup('grp-unfiled', 'test prompt');

      expect(result.ok).toBe(false);
      expect(result.reason).toContain('Duplicate');
    });

    it('should return error for invalid group', async () => {
      const result = await store.addPromptToGroup('invalid-group-id', 'Test');

      expect(result.ok).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should default to unfiled when groupId is null', async () => {
      const result = await store.addPromptToGroup(null, 'Test');

      expect(result.ok).toBe(true);
      expect(result.groupId).toBe('grp-unfiled');
    });

    it('should set private flag for private groups', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Test');

      expect(result.ok).toBe(true);
      expect(result.prompt?.private).toBe(true);
    });
  });

  describe('getPrompts', () => {
    it('should return prompts from group', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Prompt 1');
      await store.addPromptToGroup('grp-unfiled', 'Prompt 2');

      const prompts = await store.getPrompts('grp-unfiled');

      expect(prompts).toHaveLength(2);
      expect(prompts[0].text).toBe('Prompt 1');
      expect(prompts[1].text).toBe('Prompt 2');
    });

    it('should return empty array for non-existent group', async () => {
      const prompts = await store.getPrompts('invalid-id');

      expect(prompts).toEqual([]);
    });

    it('should default to unfiled when groupId is null', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Test');

      const prompts = await store.getPrompts(null);

      expect(prompts).toHaveLength(1);
    });
  });

  describe('getPromptById', () => {
    it('should find prompt by id', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Test prompt');
      const promptId = result.prompt!.id;

      const found = await store.getPromptById(promptId);

      expect(found).toBeDefined();
      expect(found?.id).toBe(promptId);
      expect(found?.text).toBe('Test prompt');
    });

    it('should return null for non-existent id', async () => {
      const found = await store.getPromptById('non-existent-id');

      expect(found).toBeNull();
    });
  });

  describe('deletePrompt', () => {
    it('should delete prompt by id', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'To delete');
      const promptId = result.prompt!.id;

      const deleted = await store.deletePrompt(promptId);

      expect(deleted).toBe(true);

      const found = await store.getPromptById(promptId);
      expect(found).toBeNull();
    });

    it('should return false for non-existent prompt', async () => {
      const deleted = await store.deletePrompt('non-existent-id');

      expect(deleted).toBe(false);
    });

    it('should remove prompt from group', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'To delete');
      const promptId = result.prompt!.id;

      await store.deletePrompt(promptId);

      const prompts = await store.getPrompts('grp-unfiled');
      expect(prompts).toHaveLength(0);
    });
  });

  describe('updatePromptText', () => {
    it('should update prompt text', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Original text');
      const promptId = result.prompt!.id;

      const updated = await store.updatePromptText(promptId, 'Updated text');

      expect(updated.ok).toBe(true);

      const found = await store.getPromptById(promptId);
      expect(found?.text).toBe('Updated text');
    });

    it('should update updatedAt timestamp', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Original');
      const promptId = result.prompt!.id;
      const originalUpdatedAt = result.prompt!.updatedAt;

      // Wait a tiny bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      await store.updatePromptText(promptId, 'Updated');

      const found = await store.getPromptById(promptId);
      expect(found?.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should reject duplicate text', async () => {
      await store.addPromptToGroup('grp-unfiled', 'Existing text');
      const result = await store.addPromptToGroup('grp-unfiled', 'To update');
      const promptId = result.prompt!.id;

      const updated = await store.updatePromptText(promptId, 'Existing text');

      expect(updated.ok).toBe(false);
      expect(updated.reason).toContain('Duplicate');
    });

    it('should return error for non-existent prompt', async () => {
      const updated = await store.updatePromptText('non-existent-id', 'New text');

      expect(updated.ok).toBe(false);
      expect(updated.reason).toContain('not found');
    });
  });

  describe('updatePromptTitle', () => {
    it('should update prompt title', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'Text', 'Original Title');
      const promptId = result.prompt!.id;

      const updated = await store.updatePromptTitle(promptId, 'New Title');

      expect(updated.ok).toBe(true);

      const found = await store.getPromptById(promptId);
      expect(found?.title).toBe('New Title');
    });

    it('should use fallback title when title is empty', async () => {
      const result = await store.addPromptToGroup('grp-unfiled', 'This is the prompt text');
      const promptId = result.prompt!.id;

      const updated = await store.updatePromptTitle(promptId, '');

      expect(updated.ok).toBe(true);

      const found = await store.getPromptById(promptId);
      expect(found?.title).toBe('This is the prompt t');
    });

    it('should return error for non-existent prompt', async () => {
      const updated = await store.updatePromptTitle('non-existent-id', 'Title');

      expect(updated.ok).toBe(false);
      expect(updated.reason).toContain('not found');
    });
  });

  describe('resetAll', () => {
    it('should reset library to initial state', async () => {
      // Add some data
      await store.addPromptToGroup('grp-unfiled', 'Test 1');
      await store.addPromptToGroup('grp-unfiled', 'Test 2');

      // Reset
      await store.resetAll();

      // Should be back to initial state
      const lib = await store.load();
      expect(lib.groups).toHaveLength(2);
      expect(lib.groups[1].children[0].prompts).toHaveLength(0);
    });
  });
});

