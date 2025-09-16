import * as vscode from 'vscode';
import { Group, Prompt } from '../model';

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
  if (!id) id = `grp-${Math.random().toString(36).slice(2,8)}`;
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
  if (!id) id = `p-${Math.random().toString(36).slice(2,8)}`;
  if (!text) return null;
  return { id, title, text, tags } as any;
}

function isDirEntryDir(e: [string, vscode.FileType]) { return e[1] === vscode.FileType.Directory; }
function isDirEntryFile(e: [string, vscode.FileType]) { return e[1] === vscode.FileType.File; }

export async function readSharedGroups(rootDir: vscode.Uri, promptsSubdir = 'prompts'): Promise<Group[]> {
  const entries = await safeReadDir(rootDir);
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
  const metaUri = vscode.Uri.joinPath(dir, '_group.yaml');
  const meta = await safeReadFile(metaUri);
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
          if (!pf.toLowerCase().endsWith('.yaml')) continue;
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

