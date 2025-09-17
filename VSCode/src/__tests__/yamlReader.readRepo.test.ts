import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock 'vscode' to provide just enough surface for yamlReader.ts
vi.mock('vscode', () => {
  enum FileType { File = 1, Directory = 2 }
  class Uri {
    constructor(public fsPath: string) {}
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

describe('readSharedGroups (local repository import)', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-readrepo-'));
  const repoRoot = path.join(tmpRoot, 'PromptLibrary');

  beforeAll(() => {
    // Layout with a top-level container named "prompts"
    // prompts/
    //   General/_group.yaml
    //   General/prompts/a.yaml
    //   PlatformPrompts/_group.yaml
    //   PlatformPrompts/prompts/{b.yaml,c.yml}
    write(path.join(repoRoot, 'prompts', 'General', '_group.yaml'), [
      'id: "grp-general"',
      'name: "General"',
      ''
    ].join('\n'));

    write(path.join(repoRoot, 'prompts', 'General', 'prompts', 'a.yaml'), [
      'id: "a"',
      'title: "A"',
      'text: |',
      '  Hello',
      '  World',
      'tags:',
      '  - test',
      ''
    ].join('\n'));

    write(path.join(repoRoot, 'prompts', 'PlatformPrompts', '_group.yaml'), [
      'id: "grp-platform"',
      'name: "PlatformPrompts"',
      ''
    ].join('\n'));

    write(path.join(repoRoot, 'prompts', 'PlatformPrompts', 'prompts', 'b.yaml'), [
      'id: "b"',
      'text: "B single line"',
      ''
    ].join('\n'));

    write(path.join(repoRoot, 'prompts', 'PlatformPrompts', 'prompts', 'c.yml'), [
      'id: "c"',
      'title: "C"',
      'text: |',
      '  line1',
      '  line2',
      ''
    ].join('\n'));
  });

  afterAll(() => {
    // Cleanup temp directory
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it('reads groups and prompts from a local repo folder (with top-level "prompts" container)', async () => {
    const uri = vscode.Uri.file(repoRoot);
    const groups = await readSharedGroups(uri, 'prompts');

    // We expect two top-level groups
    expect(groups.length).toBe(2);
    const general = groups.find(g => g.name === 'General');
    const platform = groups.find(g => g.name === 'PlatformPrompts');
    expect(general).toBeTruthy();
    expect(platform).toBeTruthy();

    // Each group should have its prompts imported
    expect(general!.prompts.length).toBe(1);
    expect(platform!.prompts.length).toBe(2);

    // Spot-check content was parsed
    expect(general!.prompts[0].text).toContain('Hello');
    expect(platform!.prompts[0].text).toContain('single line');
  });
});

