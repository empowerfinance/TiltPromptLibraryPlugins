import * as vscode from 'vscode';
import { Group, Prompt } from '../model';

// Lightweight YAML emitters (no external deps) for our simple schema
function yamlScalar(s: string): string {
  const needsQuotes = /[:\-#@!\n\r\t{}\[\],&*?]|^\s|\s$/.test(s);
  const escaped = s.replace(/"/g, '\\"');
  return needsQuotes ? `"${escaped}"` : s;
}

function writeGroupMeta(g: Group): string {
  // Only meta (id, name), omit children/prompts to keep file clean, parity with Rider
  return `id: ${yamlScalar(g.id)}\nname: ${yamlScalar(g.name)}\n`;
}

function writePromptYaml(p: Prompt): string {
  // We purposefully strip potentially private fields for public sync
  const safe: Prompt = p.private ? { ...p, private: false } : p;
  const lines: string[] = [];
  lines.push(`id: ${yamlScalar(safe.id)}`);
  if (safe.title) lines.push(`title: ${yamlScalar(safe.title)}`);
  lines.push(`text: |`);
  const textNL = (safe.text || '').replace(/\r\n?/g, '\n');
  textNL.split('\n').forEach(line => lines.push(`  ${line}`));
  if (safe.tags?.length) {
    lines.push(`tags:`);
    safe.tags.forEach(t => lines.push(`  - ${yamlScalar(t)}`));
  }
  return lines.join('\n') + '\n';
}

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '-');
}

export interface WriteResult { added: number; updated: number; deleted: number; }

function sha256(buf: Uint8Array): string {
  // Simple polyfill using Node crypto available in extension host
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  const h = crypto.createHash('sha256');
  h.update(buf);
  return h.digest('hex');
}

async function snapshotFiles(root: vscode.Uri): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  async function walk(dir: vscode.Uri, relBase: string) {
    let entries: [string, vscode.FileType][] = [];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      return;
    }
    for (const [name, type] of entries) {
      const child = vscode.Uri.joinPath(dir, name);
      const rel = relBase ? `${relBase}/${name}` : name;
      if (type === vscode.FileType.File) {
        const content = await vscode.workspace.fs.readFile(child);
        map.set(rel, sha256(content));
      } else if (type === vscode.FileType.Directory) {
        await walk(child, rel);
      }
    }
  }
  await walk(root, '');
  return map;
}

export async function writeSharedGroups(rootDir: vscode.Uri, groups: Group[], promptsSubdir: string = 'prompts'): Promise<WriteResult> {
  // Snapshot before
  const before = await snapshotFiles(rootDir);
  // Clean rewrite (remove and recreate root)
  try { await vscode.workspace.fs.delete(rootDir, { recursive: true }); } catch {}
  await vscode.workspace.fs.createDirectory(rootDir);

  // Write group trees
  for (const g of groups) {
    await writeGroupDir(rootDir, g, promptsSubdir);
  }

  // Snapshot after
  const after = await snapshotFiles(rootDir);
  let added = 0, deleted = 0, updated = 0;
  for (const k of after.keys()) if (!before.has(k)) added++;
  for (const k of before.keys()) if (!after.has(k)) deleted++;
  for (const k of after.keys()) if (before.has(k) && before.get(k) !== after.get(k)) updated++;
  return { added, updated, deleted };
}

async function writeGroupDir(parent: vscode.Uri, g: Group, promptsSubdir: string) {
  const dir = vscode.Uri.joinPath(parent, sanitize(g.name));
  await vscode.workspace.fs.createDirectory(dir);

  const meta = vscode.Uri.joinPath(dir, '_group.yaml');
  await vscode.workspace.fs.writeFile(meta, Buffer.from(writeGroupMeta({ ...g, children: [], prompts: [] }), 'utf8'));

  const promptsDir = vscode.Uri.joinPath(dir, sanitize(promptsSubdir));
  await vscode.workspace.fs.createDirectory(promptsDir);
  for (const p of g.prompts) {
    const file = vscode.Uri.joinPath(promptsDir, `p-${p.id}.yaml`);
    // Never write private prompts to shared tree (strip private)
    const content = writePromptYaml(p.private ? { ...p, private: false } : p);
    await vscode.workspace.fs.writeFile(file, Buffer.from(content, 'utf8'));
  }
  for (const child of g.children) await writeGroupDir(dir, child, promptsSubdir);
}

