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
  if (s.startsWith('"') && s.endsWith('"')) {
    // Double-quoted YAML strings: unescape all standard escape sequences
    // Use a single pass with a replacer function to handle all escapes correctly
    return s.slice(1, -1).replace(/\\(.)/g, (_, char) => {
      switch (char) {
        case 'n': return '\n';
        case 't': return '\t';
        case 'r': return '\r';
        case '\\': return '\\';
        case '"': return '"';
        default: return char;  // Unknown escape, just return the character
      }
    });
  }
  if (s.startsWith("'") && s.endsWith("'")) {
    // Single-quoted YAML strings: only '' is escaped to '
    return s.slice(1, -1).replace(/''/g, "'");
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

export async function readSharedGroups(rootDir: vscode.Uri): Promise<Group[]> {
  const entries = await safeReadDir(rootDir);

  const groups: Group[] = [];
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.Directory) continue;
    const dir = vscode.Uri.joinPath(rootDir, name);
    const g = await readGroupDir(dir);
    if (g) groups.push(g);
  }
  return groups;
}

async function readGroupDir(dir: vscode.Uri): Promise<Group | null> {
  // Support both _group.yaml and _group.yml for compatibility
  let meta = await safeReadFile(vscode.Uri.joinPath(dir, '_group.yaml'));
  if (!meta) {
    meta = await safeReadFile(vscode.Uri.joinPath(dir, '_group.yml'));
  }
  if (!meta) return null;
  const parsed = parseGroupMeta(meta);
  if (!parsed) return null;
  const prompts: Prompt[] = [];

  const entries = await safeReadDir(dir);
  for (const [name, type] of entries) {
    if (name === '_group.yaml' || name === '_group.yml') continue;
    // Skip subdirectories - groups are flat (no nested groups allowed)
    if (type === vscode.FileType.Directory) continue;
    if (type === vscode.FileType.File) {
      // Prompt files are directly in the group folder (p-*.yaml)
      const lower = name.toLowerCase();
      if (!(lower.endsWith('.yaml') || lower.endsWith('.yml'))) continue;
      const content = await safeReadFile(vscode.Uri.joinPath(dir, name));
      if (!content) continue;
      const parsedP = parsePrompt(content);
      if (!parsedP) continue;
      const now = new Date().toISOString();
      prompts.push({ id: parsedP.id, title: parsedP.title, text: parsedP.text, tags: parsedP.tags ?? [], createdAt: now, updatedAt: now, private: false });
    }
  }

  // No children - groups are flat (only at library root level)
  return { id: parsed.id, name: parsed.name, kind: 'shared', tags: ['ns:shared'], description: undefined, children: [], prompts };
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
 * @returns Array of groups found in the library
 *
 * Example folder structure:
 *   ~/PromptLibrary/           <- repoRoot
 *     platform/                <- library.path = "platform"
 *       API/_group.yaml
 *       API/p-xxx.yaml         <- prompts directly in group folder
 */
export async function readFromLibrary(
  repoRoot: string,
  library: LibraryConfig
): Promise<Group[]> {
  const libraryDir = vscode.Uri.file(repoRoot).with({ path: `${repoRoot}/${library.path}` });
  return readSharedGroups(libraryDir);
}

/**
 * Reads groups from multiple libraries and returns a combined result with library metadata.
 * Sets libraryId on all groups and prompts so they can be written back to disk.
 *
 * @param repoRoot - The root directory of the Git repository
 * @param libraries - Array of library configurations to read from
 * @returns Map of library ID to array of groups
 */
export async function readFromLibraries(
  repoRoot: string,
  libraries: LibraryConfig[]
): Promise<Map<string, Group[]>> {
  const result = new Map<string, Group[]>();

  for (const library of libraries.filter(l => l.enabled)) {
    try {
      const groups = await readFromLibrary(repoRoot, library);
      // Tag all groups and prompts with libraryId so they can be written back to disk
      tagWithLibraryId(groups, library.id);
      result.set(library.id, groups);
    } catch {
      // If a library fails to load, we still continue with others
      result.set(library.id, []);
    }
  }

  return result;
}

/**
 * Tags groups and their prompts with a libraryId.
 * Note: Groups are flat (no nested children), so no recursion needed.
 */
function tagWithLibraryId(groups: Group[], libraryId: string): void {
  for (const g of groups) {
    g.libraryId = libraryId;
    for (const p of g.prompts) {
      p.libraryId = libraryId;
    }
    // No recursion - groups are flat (no children)
  }
}

