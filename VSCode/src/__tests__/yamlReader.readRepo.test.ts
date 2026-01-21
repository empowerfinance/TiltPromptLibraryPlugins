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
    with(change: { path?: string }) {
      if (change.path) {
        return new Uri(change.path);
      }
      return this;
    }
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
import { readSharedGroups, readFromLibraries, readFromLibrary } from '../sync/yamlReader';
import { LibraryConfig } from '../settings';
import * as vscode from 'vscode';

function write(p: string, content: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

describe('readSharedGroups (local repository import)', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-readrepo-'));
  const repoRoot = path.join(tmpRoot, 'PromptLibrary');

  beforeAll(() => {
    // Layout with groups directly under library root
    // General/_group.yaml
    // General/p-a.yaml            <- prompts directly in group folder
    // PlatformPrompts/_group.yaml
    // PlatformPrompts/p-b.yaml
    // PlatformPrompts/p-c.yml
    write(path.join(repoRoot, 'General', '_group.yaml'), [
      'id: "grp-general"',
      'name: "General"',
      ''
    ].join('\n'));

    write(path.join(repoRoot, 'General', 'p-a.yaml'), [
      'id: "a"',
      'title: "A"',
      'text: |',
      '  Hello',
      '  World',
      'tags:',
      '  - test',
      ''
    ].join('\n'));

    write(path.join(repoRoot, 'PlatformPrompts', '_group.yaml'), [
      'id: "grp-platform"',
      'name: "PlatformPrompts"',
      ''
    ].join('\n'));

    write(path.join(repoRoot, 'PlatformPrompts', 'p-b.yaml'), [
      'id: "b"',
      'text: "B single line"',
      ''
    ].join('\n'));

    write(path.join(repoRoot, 'PlatformPrompts', 'p-c.yml'), [
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
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { }
  });

  it('reads groups and prompts from a local repo folder (flat structure)', async () => {
    const uri = vscode.Uri.file(repoRoot);
    const groups = await readSharedGroups(uri);

    // We expect two top-level groups
    expect(groups.length).toBe(2);
    const general = groups.find(g => g.name === 'General');
    const platform = groups.find(g => g.name === 'PlatformPrompts');
    expect(general).toBeTruthy();
    expect(platform).toBeTruthy();

    // Each group should have its prompts imported (directly from group folder)
    expect(general!.prompts.length).toBe(1);
    expect(platform!.prompts.length).toBe(2);

    // Spot-check content was parsed
    expect(general!.prompts[0].text).toContain('Hello');
    expect(platform!.prompts[0].text).toContain('single line');
  });
});

describe('readFromLibrary', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-readlib-'));
  const repoRoot = path.join(tmpRoot, 'MultiLibRepo');

  beforeAll(() => {
    // Create a library structure (flat - prompts directly in group folder)
    write(path.join(repoRoot, 'platform', 'API', '_group.yaml'), [
      'id: "grp-api"',
      'name: "API"',
      ''
    ].join('\n'));

    write(path.join(repoRoot, 'platform', 'API', 'p-endpoint.yaml'), [
      'id: "endpoint"',
      'title: "Endpoint"',
      'text: "Create an API endpoint"',
      ''
    ].join('\n'));
  });

  afterAll(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { }
  });

  it('reads groups from a specific library', async () => {
    const library: LibraryConfig = {
      id: 'platform',
      path: 'platform',
      displayName: 'Platform',
      enabled: true
    };

    const groups = await readFromLibrary(repoRoot, library);

    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe('API');
    expect(groups[0].prompts.length).toBe(1);
    expect(groups[0].prompts[0].id).toBe('endpoint');
  });

  it('returns empty array for non-existent library path', async () => {
    const library: LibraryConfig = {
      id: 'missing',
      path: 'missing',
      displayName: 'Missing',
      enabled: true
    };

    const groups = await readFromLibrary(repoRoot, library);

    expect(groups).toEqual([]);
  });
});

describe('readFromLibraries', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-readlibs-'));
  const repoRoot = path.join(tmpRoot, 'MultiLibRepo');

  beforeAll(() => {
    // Create platform library (flat - prompts directly in group folder)
    write(path.join(repoRoot, 'platform', 'API', '_group.yaml'), [
      'id: "grp-api"',
      'name: "API"',
      ''
    ].join('\n'));

    write(path.join(repoRoot, 'platform', 'API', 'p-endpoint.yaml'), [
      'id: "endpoint"',
      'text: "Create an API endpoint"',
      ''
    ].join('\n'));

    // Create analytics library
    write(path.join(repoRoot, 'analytics', 'Reports', '_group.yaml'), [
      'id: "grp-reports"',
      'name: "Reports"',
      ''
    ].join('\n'));

    write(path.join(repoRoot, 'analytics', 'Reports', 'p-dashboard.yaml'), [
      'id: "dashboard"',
      'text: "Create a dashboard"',
      ''
    ].join('\n'));
  });

  afterAll(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { }
  });

  it('reads from multiple enabled libraries', async () => {
    const libraries: LibraryConfig[] = [
      { id: 'platform', path: 'platform', displayName: 'Platform', enabled: true },
      { id: 'analytics', path: 'analytics', displayName: 'Analytics', enabled: true }
    ];

    const result = await readFromLibraries(repoRoot, libraries);

    expect(result.size).toBe(2);
    expect(result.get('platform')?.length).toBe(1);
    expect(result.get('platform')?.[0].name).toBe('API');
    expect(result.get('analytics')?.length).toBe(1);
    expect(result.get('analytics')?.[0].name).toBe('Reports');
  });

  it('only reads from enabled libraries', async () => {
    const libraries: LibraryConfig[] = [
      { id: 'platform', path: 'platform', displayName: 'Platform', enabled: true },
      { id: 'analytics', path: 'analytics', displayName: 'Analytics', enabled: false }
    ];

    const result = await readFromLibraries(repoRoot, libraries);

    expect(result.size).toBe(1);
    expect(result.has('platform')).toBe(true);
    expect(result.has('analytics')).toBe(false);
  });

  it('returns empty map for empty library list', async () => {
    const result = await readFromLibraries(repoRoot, []);

    expect(result.size).toBe(0);
  });

  it('handles library load failures gracefully', async () => {
    const libraries: LibraryConfig[] = [
      { id: 'platform', path: 'platform', displayName: 'Platform', enabled: true },
      { id: 'missing', path: 'missing', displayName: 'Missing', enabled: true }
    ];

    const result = await readFromLibraries(repoRoot, libraries);

    expect(result.size).toBe(2);
    expect(result.get('platform')?.length).toBe(1);
    expect(result.get('missing')).toEqual([]);
  });
});

