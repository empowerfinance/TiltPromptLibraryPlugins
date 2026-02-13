import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { writeSharedGroups, deleteSinglePrompt } from '../sync/yamlWriter';
import { Group, Prompt } from '../model';

describe('yamlWriter', () => {
  let tempDir: string;
  let rootUri: vscode.Uri;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(__dirname, 'yaml-writer-test-'));
    rootUri = vscode.Uri.file(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('writeSharedGroups', () => {
    it('should create directory structure for groups', async () => {
      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test Group',
          kind: 'shared',
          prompts: [],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      // Check directory exists
      const groupDir = path.join(tempDir, 'Test-Group');
      expect(fs.existsSync(groupDir)).toBe(true);
      expect(fs.statSync(groupDir).isDirectory()).toBe(true);
    });

    it('should create _library.yaml marker file when it does not exist', async () => {
      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test Group',
          kind: 'shared',
          prompts: [],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      // _library.yaml should be created in the root directory
      const libraryYaml = path.join(tempDir, '_library.yaml');
      expect(fs.existsSync(libraryYaml)).toBe(true);

      // Should contain sensible default content
      const content = fs.readFileSync(libraryYaml, 'utf8');
      expect(content).toContain('name:');
    });

    it('should preserve existing _library.yaml content after write', async () => {
      // First, create a _library.yaml with custom content
      fs.mkdirSync(tempDir, { recursive: true });
      const customContent = 'name: MyCustomLibrary\ndescription: Custom description\n';
      fs.writeFileSync(path.join(tempDir, '_library.yaml'), customContent);

      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test Group',
          kind: 'shared',
          prompts: [],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      // _library.yaml should still exist
      const libraryYaml = path.join(tempDir, '_library.yaml');
      expect(fs.existsSync(libraryYaml)).toBe(true);

      // Should preserve the original content
      const content = fs.readFileSync(libraryYaml, 'utf8');
      expect(content).toBe(customContent);
    });

    it('should write _group.yaml metadata file', async () => {
      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test Group',
          kind: 'shared',
          prompts: [],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      const metaFile = path.join(tempDir, 'Test-Group', '_group.yaml');
      expect(fs.existsSync(metaFile)).toBe(true);

      const content = fs.readFileSync(metaFile, 'utf8');
      expect(content).toContain('id: "grp-1"'); // IDs with hyphens are quoted
      expect(content).toContain('name: Test Group'); // Name is not sanitized in YAML
    });

    it('should sanitize group names in directory paths', async () => {
      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test/Group:With*Special?Chars',
          kind: 'shared',
          prompts: [],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      // Special characters should be replaced with hyphens
      const groupDir = path.join(tempDir, 'Test-Group-With-Special-Chars');
      expect(fs.existsSync(groupDir)).toBe(true);
    });

    it('should NOT create prompts subdirectory (flat structure)', async () => {
      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test Group',
          kind: 'shared',
          prompts: [],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      // Prompts subdirectory should NOT exist (flat structure)
      const promptsDir = path.join(tempDir, 'Test-Group', 'prompts');
      expect(fs.existsSync(promptsDir)).toBe(false);

      // Group directory should exist
      const groupDir = path.join(tempDir, 'Test-Group');
      expect(fs.existsSync(groupDir)).toBe(true);
    });

    it('should write prompt files', async () => {
      const prompt: Prompt = {
        id: 'p-1',
        title: 'Test Prompt',
        text: 'This is a test prompt',
        tags: [],
        private: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test Group',
          kind: 'shared',
          prompts: [prompt],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      // Prompts are now directly in the group folder (no prompts/ subdirectory)
      const promptFile = path.join(tempDir, 'Test-Group', 'p-p-1.yaml');
      expect(fs.existsSync(promptFile)).toBe(true);

      const content = fs.readFileSync(promptFile, 'utf8');
      expect(content).toContain('id: "p-1"'); // IDs with hyphens are quoted
      expect(content).toContain('title: Test Prompt'); // Title is not sanitized
      expect(content).toContain('text: |');
      expect(content).toContain('  This is a test prompt');
    });

    it('should handle multiline prompt text', async () => {
      const prompt: Prompt = {
        id: 'p-1',
        title: 'Multiline',
        text: 'Line 1\nLine 2\nLine 3',
        tags: [],
        private: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test',
          kind: 'shared',
          prompts: [prompt],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      const promptFile = path.join(tempDir, 'Test', 'p-p-1.yaml');
      const content = fs.readFileSync(promptFile, 'utf8');

      expect(content).toContain('  Line 1');
      expect(content).toContain('  Line 2');
      expect(content).toContain('  Line 3');
    });

    it('should write prompt tags', async () => {
      const prompt: Prompt = {
        id: 'p-1',
        title: 'Tagged',
        text: 'Test',
        tags: ['tag1', 'tag2', 'tag3'],
        private: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test',
          kind: 'shared',
          prompts: [prompt],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      const promptFile = path.join(tempDir, 'Test', 'p-p-1.yaml');
      const content = fs.readFileSync(promptFile, 'utf8');

      expect(content).toContain('tags:');
      expect(content).toContain('  - tag1');
      expect(content).toContain('  - tag2');
      expect(content).toContain('  - tag3');
    });

    it('should strip private flag from prompts', async () => {
      const prompt: Prompt = {
        id: 'p-1',
        title: 'Private Prompt',
        text: 'Secret content',
        tags: [],
        private: true, // Should be stripped
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test',
          kind: 'shared',
          prompts: [prompt],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      const promptFile = path.join(tempDir, 'Test', 'p-p-1.yaml');
      const content = fs.readFileSync(promptFile, 'utf8');

      // Should not contain private flag
      expect(content).not.toContain('private');
    });

    it('should NOT write nested groups (groups are flat)', async () => {
      // Even if children are provided, they should be ignored - groups are flat
      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Parent',
          kind: 'shared',
          prompts: [],
          children: [
            {
              id: 'grp-2',
              name: 'Child',
              kind: 'shared',
              prompts: [],
              children: [],
            },
          ],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      const parentDir = path.join(tempDir, 'Parent');
      const childDir = path.join(parentDir, 'Child');

      // Parent should exist
      expect(fs.existsSync(parentDir)).toBe(true);
      // Child should NOT exist - nested groups are not supported
      expect(fs.existsSync(childDir)).toBe(false);
    });

    it('should handle special characters in YAML values', async () => {
      const prompt: Prompt = {
        id: 'p-1',
        title: 'Title: with special chars',
        text: 'Text with "quotes" and #comments',
        tags: ['tag:with:colons'],
        private: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test',
          kind: 'shared',
          prompts: [prompt],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups);

      const promptFile = path.join(tempDir, 'Test', 'p-p-1.yaml');
      const content = fs.readFileSync(promptFile, 'utf8');

      // Special characters should be quoted
      expect(content).toContain('title: "Title: with special chars"');
      expect(content).toContain('  - "tag:with:colons"');
    });

    it('should track added files', async () => {
      const groups: Group[] = [
        {
          id: 'grp-1',
          name: 'Test',
          kind: 'shared',
          prompts: [
            {
              id: 'p-1',
              title: 'Prompt 1',
              text: 'Test',
              tags: [],
              private: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          children: [],
        },
      ];

      const result = await writeSharedGroups(rootUri, groups);

      // Should have added files (group meta + prompt)
      expect(result.added).toBeGreaterThan(0);
      expect(result.updated).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should track updated files', async () => {
      // First write
      const groups1: Group[] = [
        {
          id: 'grp-1',
          name: 'Test',
          kind: 'shared',
          prompts: [
            {
              id: 'p-1',
              title: 'Original',
              text: 'Original text',
              tags: [],
              private: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          children: [],
        },
      ];

      await writeSharedGroups(rootUri, groups1);

      // Second write with updated content
      const groups2: Group[] = [
        {
          id: 'grp-1',
          name: 'Test',
          kind: 'shared',
          prompts: [
            {
              id: 'p-1',
              title: 'Updated',
              text: 'Updated text',
              tags: [],
              private: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          children: [],
        },
      ];

      const result = await writeSharedGroups(rootUri, groups2);

      // Should have updated the prompt file
      expect(result.updated).toBeGreaterThan(0);
    });
  });

  describe('deleteSinglePrompt', () => {
    it('should delete prompt file with simple ID', async () => {
      // Create a prompt file
      const groupDir = path.join(tempDir, 'TestGroup');
      fs.mkdirSync(groupDir, { recursive: true });
      fs.writeFileSync(path.join(groupDir, 'p-abc123.yaml'), 'id: abc123\ntext: test');

      await deleteSinglePrompt(tempDir, '', ['TestGroup'], 'abc123');

      expect(fs.existsSync(path.join(groupDir, 'p-abc123.yaml'))).toBe(false);
    });

    it('should delete prompt file with library-prefixed ID (new format)', async () => {
      // Create a prompt file with library prefix in filename
      const groupDir = path.join(tempDir, 'TestGroup');
      fs.mkdirSync(groupDir, { recursive: true });
      fs.writeFileSync(path.join(groupDir, 'p-MyLibrary:abc123.yaml'), 'id: MyLibrary:abc123\ntext: test');

      await deleteSinglePrompt(tempDir, '', ['TestGroup'], 'MyLibrary:abc123');

      expect(fs.existsSync(path.join(groupDir, 'p-MyLibrary:abc123.yaml'))).toBe(false);
    });

    it('should delete BOTH old and new format files when ID is library-prefixed', async () => {
      // Create both old format and new format files for the same base ID
      const groupDir = path.join(tempDir, 'TestGroup');
      fs.mkdirSync(groupDir, { recursive: true });

      // Old format: p-{baseId}.yaml
      fs.writeFileSync(path.join(groupDir, 'p-abc123.yaml'), 'id: abc123\ntext: old format');
      // New format: p-{libraryId}:{baseId}.yaml
      fs.writeFileSync(path.join(groupDir, 'p-MyLibrary:abc123.yaml'), 'id: MyLibrary:abc123\ntext: new format');

      // Delete using the library-prefixed ID
      await deleteSinglePrompt(tempDir, '', ['TestGroup'], 'MyLibrary:abc123');

      // Both files should be deleted
      expect(fs.existsSync(path.join(groupDir, 'p-MyLibrary:abc123.yaml'))).toBe(false);
      expect(fs.existsSync(path.join(groupDir, 'p-abc123.yaml'))).toBe(false);
    });

    it('should handle library path correctly', async () => {
      // Create a prompt file within a library subdirectory
      const groupDir = path.join(tempDir, 'MyLibrary', 'TestGroup');
      fs.mkdirSync(groupDir, { recursive: true });
      fs.writeFileSync(path.join(groupDir, 'p-MyLibrary:abc123.yaml'), 'id: MyLibrary:abc123\ntext: test');

      await deleteSinglePrompt(tempDir, 'MyLibrary', ['TestGroup'], 'MyLibrary:abc123');

      expect(fs.existsSync(path.join(groupDir, 'p-MyLibrary:abc123.yaml'))).toBe(false);
    });

    it('should not throw when file does not exist', async () => {
      const groupDir = path.join(tempDir, 'TestGroup');
      fs.mkdirSync(groupDir, { recursive: true });

      // Should not throw even if file doesn't exist
      await expect(deleteSinglePrompt(tempDir, '', ['TestGroup'], 'nonexistent')).resolves.toBeUndefined();
    });

    it('should handle nested group paths', async () => {
      const groupDir = path.join(tempDir, 'Parent', 'Child');
      fs.mkdirSync(groupDir, { recursive: true });
      fs.writeFileSync(path.join(groupDir, 'p-abc123.yaml'), 'id: abc123\ntext: test');

      await deleteSinglePrompt(tempDir, '', ['Parent', 'Child'], 'abc123');

      expect(fs.existsSync(path.join(groupDir, 'p-abc123.yaml'))).toBe(false);
    });
  });
});
