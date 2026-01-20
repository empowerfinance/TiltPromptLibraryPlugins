import * as vscode from 'vscode';
import * as path from 'path';
import { Group, Prompt } from '../model';
import { LibraryConfig } from '../settings';

const GITIGNORE_CONTENT = `# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.idea/
*.iml
.vscode/
`;

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
  try { await vscode.workspace.fs.delete(rootDir, { recursive: true }); } catch { }
  await vscode.workspace.fs.createDirectory(rootDir);

  // Ensure .gitignore exists in repo root (parent of promptsSubdir)
  await ensureGitignore(vscode.Uri.joinPath(rootDir, '..'));

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

async function ensureGitignore(repoRoot: vscode.Uri): Promise<void> {
  const gitignorePath = vscode.Uri.joinPath(repoRoot, '.gitignore');
  try {
    await vscode.workspace.fs.stat(gitignorePath);
    // File exists, don't overwrite
  } catch {
    // File doesn't exist, create it
    await vscode.workspace.fs.writeFile(gitignorePath, Buffer.from(GITIGNORE_CONTENT, 'utf8'));
  }
}

async function writeGroupDir(parent: vscode.Uri, g: Group, promptsSubdir: string) {
  // Use folderName if available (PascalCase), otherwise fall back to name
  const folderName = g.folderName || g.name;
  const dir = vscode.Uri.joinPath(parent, sanitize(folderName));
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

// ============================================================================
// Incremental Write Functions (for immediate disk writes)
// ============================================================================

/**
 * Writes a single prompt to disk in its group's folder.
 * Used for immediate disk sync when adding/updating prompts.
 *
 * @param repoRoot - The root directory of the Git repository
 * @param libraryPath - The library folder name (e.g., "platform")
 * @param groupPath - Array of group folder names from root to the target group
 * @param prompt - The prompt to write
 * @param promptsSubdirName - The name of the prompts subdirectory within groups
 */
export async function writeSinglePrompt(
  repoRoot: string,
  libraryPath: string,
  groupPath: string[],
  prompt: Prompt,
  promptsSubdirName: string = 'prompts'
): Promise<void> {
  // Build the full path: repoRoot/libraryPath/group1/group2/.../prompts/p-{id}.yaml
  let dir = vscode.Uri.file(path.join(repoRoot, libraryPath));

  // Navigate through group path
  for (const groupFolder of groupPath) {
    dir = vscode.Uri.joinPath(dir, sanitize(groupFolder));
  }

  // Create prompts subdirectory
  const promptsDir = vscode.Uri.joinPath(dir, sanitize(promptsSubdirName));
  await vscode.workspace.fs.createDirectory(promptsDir);

  // Write the prompt file
  const file = vscode.Uri.joinPath(promptsDir, `p-${prompt.id}.yaml`);
  const content = writePromptYaml(prompt.private ? { ...prompt, private: false } : prompt);
  await vscode.workspace.fs.writeFile(file, Buffer.from(content, 'utf8'));
}

/**
 * Deletes a single prompt file from disk.
 *
 * @param repoRoot - The root directory of the Git repository
 * @param libraryPath - The library folder name
 * @param groupPath - Array of group folder names from root to the target group
 * @param promptId - The ID of the prompt to delete
 * @param promptsSubdirName - The name of the prompts subdirectory within groups
 */
export async function deleteSinglePrompt(
  repoRoot: string,
  libraryPath: string,
  groupPath: string[],
  promptId: string,
  promptsSubdirName: string = 'prompts'
): Promise<void> {
  let dir = vscode.Uri.file(path.join(repoRoot, libraryPath));

  for (const groupFolder of groupPath) {
    dir = vscode.Uri.joinPath(dir, sanitize(groupFolder));
  }

  const promptsDir = vscode.Uri.joinPath(dir, sanitize(promptsSubdirName));
  const file = vscode.Uri.joinPath(promptsDir, `p-${promptId}.yaml`);

  try {
    await vscode.workspace.fs.delete(file);
  } catch {
    // File might not exist, ignore
  }
}

/**
 * Ensures a group folder exists on disk with its _group.yaml metadata.
 *
 * @param repoRoot - The root directory of the Git repository
 * @param libraryPath - The library folder name
 * @param groupPath - Array of group folder names from root to the target group
 * @param group - The group metadata to write
 */
export async function ensureGroupOnDisk(
  repoRoot: string,
  libraryPath: string,
  groupPath: string[],
  group: Group
): Promise<void> {
  let dir = vscode.Uri.file(path.join(repoRoot, libraryPath));

  for (const groupFolder of groupPath) {
    dir = vscode.Uri.joinPath(dir, sanitize(groupFolder));
  }

  await vscode.workspace.fs.createDirectory(dir);

  const meta = vscode.Uri.joinPath(dir, '_group.yaml');
  await vscode.workspace.fs.writeFile(
    meta,
    Buffer.from(writeGroupMeta({ ...group, children: [], prompts: [] }), 'utf8')
  );
}

// ============================================================================
// Multi-Library Support Functions
// ============================================================================

/**
 * Writes groups to a specific library within a repository.
 *
 * @param repoRoot - The root directory of the Git repository (as a file system path)
 * @param library - The library configuration specifying where to write
 * @param groups - The groups to write
 * @param promptsSubdirName - The name of the prompts subdirectory within groups (default: 'prompts')
 * @returns Write result statistics
 *
 * Example:
 *   repoRoot = "~/PromptLibrary"
 *   library.path = "platform"
 *   Result: groups written to ~/PromptLibrary/platform/
 */
export async function writeToLibrary(
  repoRoot: string,
  library: LibraryConfig,
  groups: Group[],
  promptsSubdirName: string = 'prompts'
): Promise<WriteResult> {
  const libraryDir = vscode.Uri.file(path.join(repoRoot, library.path));
  return writeSharedGroups(libraryDir, groups, promptsSubdirName);
}

/**
 * Writes groups to multiple libraries.
 *
 * @param repoRoot - The root directory of the Git repository
 * @param libraryGroups - Map of library ID to groups to write
 * @param libraries - Array of library configurations
 * @param promptsSubdirName - The name of the prompts subdirectory within groups
 * @returns Map of library ID to write results
 */
export async function writeToLibraries(
  repoRoot: string,
  libraryGroups: Map<string, Group[]>,
  libraries: LibraryConfig[],
  promptsSubdirName: string = 'prompts'
): Promise<Map<string, WriteResult>> {
  const results = new Map<string, WriteResult>();

  for (const library of libraries.filter(l => l.enabled)) {
    const groups = libraryGroups.get(library.id) || [];
    try {
      const result = await writeToLibrary(repoRoot, library, groups, promptsSubdirName);
      results.set(library.id, result);
    } catch {
      results.set(library.id, { added: 0, updated: 0, deleted: 0 });
    }
  }

  return results;
}
