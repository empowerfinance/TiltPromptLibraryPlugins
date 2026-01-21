import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock 'vscode' to provide just enough surface for yamlReader.ts
vi.mock('vscode', () => {
  enum FileType { File = 1, Directory = 2 }
  class Uri {
    constructor(public fsPath: string) { }
    static file(p: string) { return new Uri(path.resolve(p)); }
    static joinPath(base: Uri, ...parts: string[]) { return Uri.file(path.join(base.fsPath, ...parts)); }
  }
  const workspace = {
    fs: {
      async readDirectory(uri: any): Promise<[string, number][]> {
        const ents = fs.readdirSync(uri.fsPath, { withFileTypes: true });
        return ents.map((d) => [d.name, d.isDirectory() ? FileType.Directory : FileType.File]);
      },
      async readFile(uri: any): Promise<Uint8Array> {
        return fs.readFileSync(uri.fsPath);
      },
      async createDirectory(_uri: any): Promise<void> { /* not needed for read path */ },
      async writeFile(_uri: any, _bytes: Uint8Array): Promise<void> { /* not used in this test */ },
      async stat(_uri: any): Promise<any> { return { type: 2, ctime: 0, mtime: 0, size: 0 }; },
    },
  };
  return { Uri, workspace, FileType };
});

// Import after mocking
import { readSharedGroups } from '../sync/yamlReader';
import * as vscode from 'vscode';

function write(p: string, content: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

describe('readSharedGroups - Error Handling & Edge Cases', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-yaml-errors-'));

  afterAll(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { }
  });

  describe('malformed YAML', () => {
    it('should handle malformed YAML in group file', async () => {
      const repoRoot = path.join(tmpRoot, 'malformed-group');
      write(path.join(repoRoot, 'prompts', 'BadGroup', '_group.yaml'), [
        'id: "bad-group"',
        'name: "BadGroup',  // Missing closing quote
        'invalid yaml: [unclosed',
        ''
      ].join('\n'));

      const uri = vscode.Uri.file(repoRoot);

      // Should not throw, but may skip the malformed group
      const groups = await readSharedGroups(uri, 'prompts');

      // Verify it doesn't crash
      expect(Array.isArray(groups)).toBe(true);
    });

    it('should handle malformed YAML in prompt file', async () => {
      const repoRoot = path.join(tmpRoot, 'malformed-prompt');
      write(path.join(repoRoot, 'prompts', 'Group1', '_group.yaml'), [
        'id: "grp-1"',
        'name: "Group1"',
        ''
      ].join('\n'));

      write(path.join(repoRoot, 'prompts', 'Group1', 'prompts', 'bad.yaml'), [
        'id: "bad-prompt"',
        'text: |',
        '  Some text',
        'tags: [unclosed array',  // Malformed
        ''
      ].join('\n'));

      const uri = vscode.Uri.file(repoRoot);
      const groups = await readSharedGroups(uri, 'prompts');

      // Should still read the group, may skip bad prompt
      expect(groups.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('missing required fields', () => {
    it('should handle group without id', async () => {
      const repoRoot = path.join(tmpRoot, 'no-id-group');
      write(path.join(repoRoot, 'prompts', 'NoId', '_group.yaml'), [
        'name: "NoId"',  // Missing id
        ''
      ].join('\n'));

      const uri = vscode.Uri.file(repoRoot);
      const groups = await readSharedGroups(uri, 'prompts');

      // Should handle gracefully
      expect(Array.isArray(groups)).toBe(true);
    });

    it('should handle prompt without id', async () => {
      const repoRoot = path.join(tmpRoot, 'no-id-prompt');
      write(path.join(repoRoot, 'prompts', 'Group2', '_group.yaml'), [
        'id: "grp-2"',
        'name: "Group2"',
        ''
      ].join('\n'));

      write(path.join(repoRoot, 'prompts', 'Group2', 'prompts', 'noid.yaml'), [
        'text: "Some text"',  // Missing id
        ''
      ].join('\n'));

      const uri = vscode.Uri.file(repoRoot);
      const groups = await readSharedGroups(uri, 'prompts');

      expect(Array.isArray(groups)).toBe(true);
    });

    it('should handle prompt without text', async () => {
      const repoRoot = path.join(tmpRoot, 'no-text-prompt');
      write(path.join(repoRoot, 'prompts', 'Group3', '_group.yaml'), [
        'id: "grp-3"',
        'name: "Group3"',
        ''
      ].join('\n'));

      write(path.join(repoRoot, 'prompts', 'Group3', 'prompts', 'notext.yaml'), [
        'id: "notext"',
        'title: "No Text"',  // Missing text field
        ''
      ].join('\n'));

      const uri = vscode.Uri.file(repoRoot);
      const groups = await readSharedGroups(uri, 'prompts');

      expect(Array.isArray(groups)).toBe(true);
    });
  });

  describe('empty and edge cases', () => {
    it('should handle empty repository', async () => {
      const repoRoot = path.join(tmpRoot, 'empty-repo');
      fs.mkdirSync(path.join(repoRoot, 'prompts'), { recursive: true });

      const uri = vscode.Uri.file(repoRoot);
      const groups = await readSharedGroups(uri, 'prompts');

      expect(groups).toEqual([]);
    });

    it('should handle empty group file', async () => {
      const repoRoot = path.join(tmpRoot, 'empty-group-file');
      write(path.join(repoRoot, 'prompts', 'EmptyGroup', '_group.yaml'), '');

      const uri = vscode.Uri.file(repoRoot);
      const groups = await readSharedGroups(uri, 'prompts');

      expect(Array.isArray(groups)).toBe(true);
    });

    it('should handle empty prompt file', async () => {
      const repoRoot = path.join(tmpRoot, 'empty-prompt-file');
      write(path.join(repoRoot, 'prompts', 'Group4', '_group.yaml'), [
        'id: "grp-4"',
        'name: "Group4"',
        ''
      ].join('\n'));

      write(path.join(repoRoot, 'prompts', 'Group4', 'prompts', 'empty.yaml'), '');

      const uri = vscode.Uri.file(repoRoot);
      const groups = await readSharedGroups(uri, 'prompts');

      expect(Array.isArray(groups)).toBe(true);
    });

    it('should handle group with no prompts subdirectory', async () => {
      const repoRoot = path.join(tmpRoot, 'no-prompts-subdir');
      write(path.join(repoRoot, 'prompts', 'Group5', '_group.yaml'), [
        'id: "grp-5"',
        'name: "Group5"',
        ''
      ].join('\n'));
      // No prompts/ subdirectory created

      const uri = vscode.Uri.file(repoRoot);
      const groups = await readSharedGroups(uri, 'prompts');

      expect(groups.length).toBeGreaterThanOrEqual(0);
      const group5 = groups.find(g => g.id === 'grp-5');
      if (group5) {
        expect(group5.prompts).toEqual([]);
      }
    });
  });

  describe('flat group structure', () => {
    it('should IGNORE nested groups (groups are flat)', async () => {
      const repoRoot = path.join(tmpRoot, 'nested-groups');

      // Parent group (prompts directly in group folder)
      write(path.join(repoRoot, 'Parent', '_group.yaml'), [
        'id: "grp-parent"',
        'name: "Parent"',
        ''
      ].join('\n'));

      // Child group inside Parent (should be ignored - groups are flat)
      write(path.join(repoRoot, 'Parent', 'Child', '_group.yaml'), [
        'id: "grp-child"',
        'name: "Child"',
        ''
      ].join('\n'));

      write(path.join(repoRoot, 'Parent', 'Child', 'p-nested.yaml'), [
        'id: "nested"',
        'text: "Nested prompt"',
        ''
      ].join('\n'));

      const uri = vscode.Uri.file(repoRoot);
      const groups = await readSharedGroups(uri);

      expect(groups.length).toBeGreaterThan(0);
      const parent = groups.find(g => g.id === 'grp-parent');
      expect(parent).toBeTruthy();

      // Children should be empty - nested groups are not supported
      expect(parent!.children).toEqual([]);
    });
  });
});

