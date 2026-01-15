import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { writeSharedGroups } from '../sync/yamlWriter';
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

    it('should create prompts subdirectory', async () => {
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

      const promptsDir = path.join(tempDir, 'Test-Group', 'prompts');
      expect(fs.existsSync(promptsDir)).toBe(true);
      expect(fs.statSync(promptsDir).isDirectory()).toBe(true);
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

      const promptFile = path.join(tempDir, 'Test-Group', 'prompts', 'p-p-1.yaml');
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

      const promptFile = path.join(tempDir, 'Test', 'prompts', 'p-p-1.yaml');
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

      const promptFile = path.join(tempDir, 'Test', 'prompts', 'p-p-1.yaml');
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

      const promptFile = path.join(tempDir, 'Test', 'prompts', 'p-p-1.yaml');
      const content = fs.readFileSync(promptFile, 'utf8');

      // Should not contain private flag
      expect(content).not.toContain('private');
    });

    it('should handle nested groups', async () => {
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

      expect(fs.existsSync(parentDir)).toBe(true);
      expect(fs.existsSync(childDir)).toBe(true);
      expect(fs.existsSync(path.join(childDir, '_group.yaml'))).toBe(true);
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

      const promptFile = path.join(tempDir, 'Test', 'prompts', 'p-p-1.yaml');
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
});
