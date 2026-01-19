import * as vscode from 'vscode';
import { Group, Prompt } from '../model';
import { LibraryConfig } from '../settings';

interface GroupMeta { id: string; name: string }

function parseGroupMeta(content: string): GroupMeta | null {
  let id = '';
  let name = '';
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const mId = /^id:\s*(.+)$/.exec(line);
    if (mId) { id = stripQuotes(mId[1].trim()); continue; }
    const mName = /^name:\s*(.+)$/.exec(line);
    if (mName) { name = stripQuotes(mName[1].trim()); continue; }
  }
  if (!name) return null;
  if (!id) id = `grp-${Math.random().toString(36).slice(2, 8)}`;
  return { id, name };
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

function parsePrompt(content: string): Omit<Prompt, 'createdAt' | 'updatedAt' | 'private'> | null {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  let id = '';
  let title: string | undefined;
  let text = '';
  const tags: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t || t.startsWith('#')) { i++; continue; }
    if (t.startsWith('id:')) { id = stripQuotes(t.slice(3).trim()); i++; continue; }
    if (t.startsWith('title:')) { title = stripQuotes(t.slice(6).trim()); i++; continue; }
    if (t.startsWith('text:')) {
      // Expect block scalar |
      if (t.includes('|')) {
        i++;
        const buf: string[] = [];
        while (i < lines.length) {
          const l = lines[i];
          if (l.startsWith('  ')) { buf.push(l.slice(2)); i++; continue; }
          if (!l.trim()) { buf.push(''); i++; continue; }
          break;
        }
        text = buf.join('\n');
        continue;
      } else {
        // single-line scalar
        text = stripQuotes(t.slice(5).trim()); i++; continue;
      }
    }
    if (t.startsWith('tags:')) {
      i++;
      while (i < lines.length) {
        const l = lines[i];
        const m = /^\s*-\s*(.+)$/.exec(l);
        if (m) { tags.push(stripQuotes(m[1].trim())); i++; continue; }
        if (!l.trim()) { i++; continue; }
        break;
      }
      continue;
    }
    i++;
  }
  if (!id) id = `p-${Math.random().toString(36).slice(2, 8)}`;
  if (!text) return null;
  const tnorm = (title ?? '').trim();
  const safeTitle = tnorm && !/^(null|undefined|~)$/i.test(tnorm) ? tnorm : undefined;
  return { id, title: safeTitle, text, tags } as any;
}

function isDirEntryDir(e: [string, vscode.FileType]) { return e[1] === vscode.FileType.Directory; }
function isDirEntryFile(e: [string, vscode.FileType]) { return e[1] === vscode.FileType.File; }

export async function readSharedGroups(rootDir: vscode.Uri, promptsSubdir = 'prompts'): Promise<Group[]> {
  const entries = await safeReadDir(rootDir);

  // Some repos (including Empower's) place all groups under a top-level container directory
  // also named like the prompts subdirectory (e.g. "prompts/General/_group.yaml").
  // If we detect that pattern, scan inside that container instead of the root.
  const container = entries.find(([name, type]) => type === vscode.FileType.Directory && name.toLowerCase() === promptsSubdir.toLowerCase());
  if (container) {
    const containerUri = vscode.Uri.joinPath(rootDir, container[0]);
    const sub = await safeReadDir(containerUri);
    const fromContainer: Group[] = [];
    for (const [name, type] of sub) {
      if (type !== vscode.FileType.Directory) continue;
      const g = await readGroupDir(vscode.Uri.joinPath(containerUri, name), promptsSubdir);
      if (g) fromContainer.push(g);
    }
    if (fromContainer.length > 0) {
      return fromContainer;
    }
    // If container exists but no groups were found, fall through to root scan
  }

  const groups: Group[] = [];
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.Directory) continue;
    const dir = vscode.Uri.joinPath(rootDir, name);
    const g = await readGroupDir(dir, promptsSubdir);
    if (g) groups.push(g);
  }
  return groups;
}

async function readGroupDir(dir: vscode.Uri, promptsSubdir: string): Promise<Group | null> {
  // Support both _group.yaml and _group.yml for compatibility
  let meta = await safeReadFile(vscode.Uri.joinPath(dir, '_group.yaml'));
  if (!meta) {
    meta = await safeReadFile(vscode.Uri.joinPath(dir, '_group.yml'));
  }
  if (!meta) return null;
  const parsed = parseGroupMeta(meta);
  if (!parsed) return null;
  const children: Group[] = [];
  const prompts: Prompt[] = [];

  const entries = await safeReadDir(dir);
  for (const [name, type] of entries) {
    if (name === '_group.yaml') continue;
    if (type === vscode.FileType.Directory) {
      if (name === promptsSubdir) {
        const promptFiles = await safeReadDir(vscode.Uri.joinPath(dir, name));
        for (const [pf, ptype] of promptFiles) {
          if (ptype !== vscode.FileType.File) continue;
          const lower = pf.toLowerCase();
          if (!(lower.endsWith('.yaml') || lower.endsWith('.yml'))) continue;
          const content = await safeReadFile(vscode.Uri.joinPath(dir, name, pf));
          if (!content) continue;
          const parsedP = parsePrompt(content);
          if (!parsedP) continue;
          const now = new Date().toISOString();
          prompts.push({ id: parsedP.id, title: parsedP.title, text: parsedP.text, tags: parsedP.tags ?? [], createdAt: now, updatedAt: now, private: false });
        }
      } else {
        const child = await readGroupDir(vscode.Uri.joinPath(dir, name), promptsSubdir);
        if (child) children.push(child);
      }
    }
  }

  return { id: parsed.id, name: parsed.name, kind: 'shared', tags: ['ns:shared'], description: undefined, children, prompts };
}

async function safeReadDir(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
  try { return await vscode.workspace.fs.readDirectory(uri); } catch { return []; }
}
async function safeReadFile(uri: vscode.Uri): Promise<string | null> {
  try { const b = await vscode.workspace.fs.readFile(uri); return Buffer.from(b).toString('utf8'); } catch { return null; }
}

// ============================================================================
// Multi-Library Support Functions
// ============================================================================

/**
 * Reads groups from a specific library within a repository.
 *
 * @param repoRoot - The root directory of the Git repository (as a file system path)
 * @param library - The library configuration specifying which library to read
 * @param promptsSubdirName - The name of the prompts subdirectory within groups (default: 'prompts')
 * @returns Array of groups found in the library
 *
 * Example folder structure:
 *   ~/PromptLibrary/           <- repoRoot
 *     platform/                <- library.path = "platform"
 *       API/_group.yaml
 *       API/prompts/p-xxx.yaml
 */
export async function readFromLibrary(
  repoRoot: string,
  library: LibraryConfig,
  promptsSubdirName: string = 'prompts'
): Promise<Group[]> {
  const libraryDir = vscode.Uri.file(repoRoot).with({ path: `${repoRoot}/${library.path}` });
  return readSharedGroups(libraryDir, promptsSubdirName);
}

/**
 * Reads groups from multiple libraries and returns a combined result with library metadata.
 *
 * @param repoRoot - The root directory of the Git repository
 * @param libraries - Array of library configurations to read from
 * @param promptsSubdirName - The name of the prompts subdirectory within groups
 * @returns Map of library ID to array of groups
 */
export async function readFromLibraries(
  repoRoot: string,
  libraries: LibraryConfig[],
  promptsSubdirName: string = 'prompts'
): Promise<Map<string, Group[]>> {
  const result = new Map<string, Group[]>();

  for (const library of libraries.filter(l => l.enabled)) {
    try {
      const groups = await readFromLibrary(repoRoot, library, promptsSubdirName);
      result.set(library.id, groups);
    } catch {
      // If a library fails to load, we still continue with others
      result.set(library.id, []);
    }
  }

  return result;
}

