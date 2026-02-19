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

/** Exported for testing */
export function writePromptYaml(p: Prompt): string {
  // We purposefully strip potentially private fields for public sync
  const safe: Prompt = p.private ? { ...p, private: false } : p;
  const lines: string[] = [];
  lines.push(`id: ${yamlScalar(safe.id)}`);
  if (safe.title) lines.push(`title: ${yamlScalar(safe.title)}`);
  lines.push(`text: |`);
  // Normalize line endings, trim trailing whitespace from each line, and remove trailing empty lines
  const textNL = (safe.text || '').replace(/\r\n?/g, '\n');
  const textLines = textNL
    .split('\n')
    .map(line => line.trimEnd())  // Remove trailing whitespace from each line
    .join('\n')
    .trimEnd()  // Remove trailing empty lines
    .split('\n');
  textLines.forEach(line => lines.push(`  ${line}`));
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

export async function writeSharedGroups(rootDir: vscode.Uri, groups: Group[]): Promise<WriteResult> {
  // Snapshot before
  const before = await snapshotFiles(rootDir);

  // Preserve _library.yaml content if it exists (we'll recreate it after the clean rewrite)
  let libraryYamlContent: Uint8Array | null = null;
  const libraryYamlPath = vscode.Uri.joinPath(rootDir, '_library.yaml');
  try {
    libraryYamlContent = await vscode.workspace.fs.readFile(libraryYamlPath);
  } catch {
    // _library.yaml doesn't exist, create a default one based on folder name
    const folderName = path.basename(rootDir.fsPath);
    libraryYamlContent = Buffer.from(`name: ${folderName}\ndescription: \n`, 'utf8');
  }

  // Clean rewrite (remove and recreate root)
  try { await vscode.workspace.fs.delete(rootDir, { recursive: true }); } catch { }
  await vscode.workspace.fs.createDirectory(rootDir);

  // Restore/create _library.yaml (required marker file for library detection)
  await vscode.workspace.fs.writeFile(libraryYamlPath, libraryYamlContent);

  // Ensure .gitignore exists in repo root
  await ensureGitignore(vscode.Uri.joinPath(rootDir, '..'));

  // Write group trees
  for (const g of groups) {
    await writeGroupDir(rootDir, g);
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

async function writeGroupDir(parent: vscode.Uri, g: Group) {
  // Use folderName if available (PascalCase), otherwise fall back to name
  const folderName = g.folderName || g.name;
  const dir = vscode.Uri.joinPath(parent, sanitize(folderName));
  await vscode.workspace.fs.createDirectory(dir);

  const meta = vscode.Uri.joinPath(dir, '_group.yaml');
  await vscode.workspace.fs.writeFile(meta, Buffer.from(writeGroupMeta({ ...g, children: [], prompts: [] }), 'utf8'));

  // Write prompts directly in the group folder (no prompts/ subdirectory)
  for (const p of g.prompts) {
    // Sanitize the prompt ID for the filename to handle legacy prefixed IDs (e.g., "Platform:xxx" -> "Platform-xxx")
    const file = vscode.Uri.joinPath(dir, `p-${sanitize(p.id)}.yaml`);
    // Never write private prompts to shared tree (strip private)
    const content = writePromptYaml(p.private ? { ...p, private: false } : p);
    await vscode.workspace.fs.writeFile(file, Buffer.from(content, 'utf8'));
  }
  // Note: No child groups - groups are flat (only at library root level)
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
 */
export async function writeSinglePrompt(
  repoRoot: string,
  libraryPath: string,
  groupPath: string[],
  prompt: Prompt
): Promise<void> {
  // Build the full path: repoRoot/libraryPath/group1/group2/.../p-{id}.yaml
  let dir = vscode.Uri.file(path.join(repoRoot, libraryPath));

  // Navigate through group path
  for (const groupFolder of groupPath) {
    dir = vscode.Uri.joinPath(dir, sanitize(groupFolder));
  }

  // Ensure the group directory exists
  await vscode.workspace.fs.createDirectory(dir);

  // Write the prompt file directly in the group folder
  // Sanitize the prompt ID for the filename to handle legacy prefixed IDs (e.g., "Platform:xxx" -> "Platform-xxx")
  const file = vscode.Uri.joinPath(dir, `p-${sanitize(prompt.id)}.yaml`);
  const content = writePromptYaml(prompt.private ? { ...prompt, private: false } : prompt);
  await vscode.workspace.fs.writeFile(file, Buffer.from(content, 'utf8'));
}

/**
 * Deletes a single prompt file from disk.
 *
 * This function handles multiple prompt file naming formats:
 * - Current format: p-{sanitized-id}.yaml (e.g., p-Platform-abc123.yaml for ID "Platform:abc123")
 * - Legacy format with raw ID: p-{id}.yaml (may not exist if ID had illegal chars)
 * - Old format without prefix: p-{baseId}.yaml (e.g., p-abc123.yaml)
 *
 * We attempt to delete all possible filename formats to ensure proper cleanup.
 *
 * @param repoRoot - The root directory of the Git repository
 * @param libraryPath - The library folder name
 * @param groupPath - Array of group folder names from root to the target group
 * @param promptId - The ID of the prompt to delete (may be prefixed with libraryId)
 */
export async function deleteSinglePrompt(
  repoRoot: string,
  libraryPath: string,
  groupPath: string[],
  promptId: string
): Promise<void> {
  let dir = vscode.Uri.file(path.join(repoRoot, libraryPath));

  for (const groupFolder of groupPath) {
    dir = vscode.Uri.joinPath(dir, sanitize(groupFolder));
  }

  // Try sanitized filename first (current format)
  const sanitizedFile = vscode.Uri.joinPath(dir, `p-${sanitize(promptId)}.yaml`);
  try {
    await vscode.workspace.fs.delete(sanitizedFile);
  } catch {
    // File might not exist, ignore
  }

  // If the ID contains special chars, the sanitized name differs from the raw ID
  // Try the raw ID format as fallback (legacy files that were never sanitized)
  if (sanitize(promptId) !== promptId) {
    const rawFile = vscode.Uri.joinPath(dir, `p-${promptId}.yaml`);
    try {
      await vscode.workspace.fs.delete(rawFile);
    } catch {
      // File might not exist, ignore
    }
  }

  // If promptId contains a library prefix (e.g., "Platform:abc123"),
  // also try to delete the base ID format (p-{baseId}.yaml) for old prompts
  const colonIndex = promptId.indexOf(':');
  if (colonIndex > 0) {
    const baseId = promptId.substring(colonIndex + 1);
    const oldFormatFile = vscode.Uri.joinPath(dir, `p-${baseId}.yaml`);
    try {
      await vscode.workspace.fs.delete(oldFormatFile);
    } catch {
      // File might not exist, ignore
    }
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

/**
 * Result of a disk operation.
 */
export interface DiskOpResult {
  success: boolean;
  skipped?: boolean; // True if folder didn't exist (not an error)
  error?: string;
}

/**
 * Renames a group folder on disk.
 *
 * @param repoRoot - The root directory of the Git repository
 * @param libraryPath - The library folder name
 * @param oldFolderName - The current folder name
 * @param newFolderName - The new folder name
 * @param group - The group metadata to update in _group.yaml
 * @returns Result indicating success, skip (folder didn't exist), or error
 */
export async function renameGroupOnDisk(
  repoRoot: string,
  libraryPath: string,
  oldFolderName: string,
  newFolderName: string,
  group: Group
): Promise<DiskOpResult> {
  const oldDir = vscode.Uri.file(path.join(repoRoot, libraryPath, sanitize(oldFolderName)));
  const newDir = vscode.Uri.file(path.join(repoRoot, libraryPath, sanitize(newFolderName)));

  try {
    // Check if old directory exists
    await vscode.workspace.fs.stat(oldDir);
  } catch {
    // Folder doesn't exist yet on disk, skip (not an error)
    return { success: true, skipped: true };
  }

  try {
    // Rename the folder
    await vscode.workspace.fs.rename(oldDir, newDir);

    // Update the _group.yaml with new name
    const meta = vscode.Uri.joinPath(newDir, '_group.yaml');
    await vscode.workspace.fs.writeFile(
      meta,
      Buffer.from(writeGroupMeta({ ...group, children: [], prompts: [] }), 'utf8')
    );
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * Deletes a group folder and all its contents from disk.
 *
 * @param repoRoot - The root directory of the Git repository
 * @param libraryPath - The library folder name
 * @param folderName - The folder name to delete
 * @returns Result indicating success, skip (folder didn't exist), or error
 */
export async function deleteGroupOnDisk(
  repoRoot: string,
  libraryPath: string,
  folderName: string
): Promise<DiskOpResult> {
  const dir = vscode.Uri.file(path.join(repoRoot, libraryPath, sanitize(folderName)));

  try {
    // Check if directory exists first
    await vscode.workspace.fs.stat(dir);
  } catch {
    // Folder doesn't exist, skip (not an error)
    return { success: true, skipped: true };
  }

  try {
    await vscode.workspace.fs.delete(dir, { recursive: true });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
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
  groups: Group[]
): Promise<WriteResult> {
  const libraryDir = vscode.Uri.file(path.join(repoRoot, library.path));
  return writeSharedGroups(libraryDir, groups);
}

/**
 * Writes groups to multiple libraries.
 *
 * @param repoRoot - The root directory of the Git repository
 * @param libraryGroups - Map of library ID to groups to write
 * @param libraries - Array of library configurations
 * @returns Map of library ID to write results
 */
export async function writeToLibraries(
  repoRoot: string,
  libraryGroups: Map<string, Group[]>,
  libraries: LibraryConfig[]
): Promise<Map<string, WriteResult>> {
  const results = new Map<string, WriteResult>();

  // Only write to libraries that are represented in libraryGroups
  // This prevents accidentally wiping libraries that:
  // 1. Failed to load (and thus aren't in libraryGroups)
  // 2. Have groups without libraryId (which are skipped during partitioning)
  // 3. Are enabled but have no content in the current sync
  for (const library of libraries.filter(l => l.enabled)) {
    if (!libraryGroups.has(library.id)) {
      // Skip libraries not in libraryGroups to avoid wiping their content
      continue;
    }
    const groups = libraryGroups.get(library.id)!;
    try {
      const result = await writeToLibrary(repoRoot, library, groups);
      results.set(library.id, result);
    } catch {
      results.set(library.id, { added: 0, updated: 0, deleted: 0 });
    }
  }

  return results;
}

// ============================================================================
// Cleanup Functions (for migrating legacy files)
// ============================================================================

export interface CleanupResult {
  renamed: number;
  errors: string[];
}

/**
 * Cleans up prompt files with problematic names (containing : or / characters).
 *
 * This function scans all prompt files in the library and renames any that have
 * unsanitized IDs in their filenames. For example:
 * - `p-Platform:abc123.yaml` -> `p-Platform-abc123.yaml`
 * - `p-Platform/abc123.yaml` (subdirectory) -> `p-Platform-abc123.yaml` (flat file)
 *
 * The internal ID inside the YAML file is NOT changed - only the filename is fixed.
 * This ensures backward compatibility while fixing filesystem issues.
 *
 * @param repoRoot - The root directory of the Git repository
 * @param libraries - Array of library configurations to clean
 * @returns Cleanup result with count of renamed files and any errors
 */
export async function cleanupPromptFilenames(
  repoRoot: string,
  libraries: LibraryConfig[]
): Promise<CleanupResult> {
  let renamed = 0;
  const errors: string[] = [];

  for (const library of libraries.filter(l => l.enabled)) {
    const libraryDir = vscode.Uri.file(path.join(repoRoot, library.path));

    try {
      // List all directories in the library (these are groups)
      const entries = await safeReadDir(libraryDir);

      for (const [name, type] of entries) {
        if (type !== vscode.FileType.Directory) continue;
        if (name.startsWith('.') || name.startsWith('_')) continue;

        const groupDir = vscode.Uri.joinPath(libraryDir, name);
        const result = await cleanupGroupDir(groupDir);
        renamed += result.renamed;
        errors.push(...result.errors);
      }
    } catch (e: any) {
      errors.push(`Failed to process library ${library.path}: ${e?.message || e}`);
    }
  }

  return { renamed, errors };
}

/**
 * Cleans up a single group directory, renaming prompt files as needed.
 */
async function cleanupGroupDir(groupDir: vscode.Uri): Promise<CleanupResult> {
  let renamed = 0;
  const errors: string[] = [];

  try {
    const entries = await safeReadDir(groupDir);

    for (const [name, type] of entries) {
      // Handle files directly in the group
      if (type === vscode.FileType.File && name.startsWith('p-') && (name.endsWith('.yaml') || name.endsWith('.yml'))) {
        // Check if the filename needs sanitization
        // Extract the ID from the filename: p-{id}.yaml
        const ext = name.endsWith('.yaml') ? '.yaml' : '.yml';
        const id = name.slice(2, -ext.length); // Remove "p-" prefix and extension
        const sanitizedId = sanitize(id);

        if (id !== sanitizedId) {
          // Filename needs to be renamed
          const oldFile = vscode.Uri.joinPath(groupDir, name);
          const newFile = vscode.Uri.joinPath(groupDir, `p-${sanitizedId}${ext}`);

          try {
            // Check if target already exists
            try {
              await vscode.workspace.fs.stat(newFile);
              // Target exists - read both files and compare
              errors.push(`Cannot rename ${name} to p-${sanitizedId}${ext}: target already exists`);
              continue;
            } catch {
              // Target doesn't exist, proceed with rename
            }

            // Read content, write to new location, delete old
            const content = await vscode.workspace.fs.readFile(oldFile);
            await vscode.workspace.fs.writeFile(newFile, content);
            await vscode.workspace.fs.delete(oldFile);
            renamed++;
          } catch (e: any) {
            errors.push(`Failed to rename ${name}: ${e?.message || e}`);
          }
        }
      }

      // Handle subdirectories that look like broken prompt files (e.g., "p-Platform" dir with "xxx.yaml" inside)
      // This happens when a filename contains "/" - it creates a subdirectory
      if (type === vscode.FileType.Directory && name.startsWith('p-')) {
        const subDir = vscode.Uri.joinPath(groupDir, name);
        const subResult = await cleanupBrokenPromptDir(groupDir, subDir, name);
        renamed += subResult.renamed;
        errors.push(...subResult.errors);
      }
    }
  } catch (e: any) {
    errors.push(`Failed to read group directory: ${e?.message || e}`);
  }

  return { renamed, errors };
}

/**
 * Handles a "broken" prompt subdirectory created when a filename contained "/".
 * For example: `p-Platform/` directory with `abc123.yaml` inside should become `p-Platform-abc123.yaml`
 */
async function cleanupBrokenPromptDir(
  groupDir: vscode.Uri,
  subDir: vscode.Uri,
  dirName: string
): Promise<CleanupResult> {
  let renamed = 0;
  const errors: string[] = [];

  try {
    const entries = await safeReadDir(subDir);

    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File) continue;
      if (!(name.endsWith('.yaml') || name.endsWith('.yml'))) continue;

      // The full "ID" would be dirName (e.g., "p-Platform") + "/" + name (e.g., "abc123.yaml")
      // But we need to reconstruct the original intended filename
      const ext = name.endsWith('.yaml') ? '.yaml' : '.yml';
      const baseId = name.slice(0, -ext.length);
      const prefix = dirName.slice(2); // Remove "p-" from directory name
      const fullId = `${prefix}/${baseId}`;
      const sanitizedId = sanitize(fullId);

      const oldFile = vscode.Uri.joinPath(subDir, name);
      const newFile = vscode.Uri.joinPath(groupDir, `p-${sanitizedId}${ext}`);

      try {
        // Check if target already exists
        try {
          await vscode.workspace.fs.stat(newFile);
          errors.push(`Cannot move ${dirName}/${name} to p-${sanitizedId}${ext}: target already exists`);
          continue;
        } catch {
          // Target doesn't exist, proceed
        }

        // Read content, write to new location, delete old
        const content = await vscode.workspace.fs.readFile(oldFile);
        await vscode.workspace.fs.writeFile(newFile, content);
        await vscode.workspace.fs.delete(oldFile);
        renamed++;
      } catch (e: any) {
        errors.push(`Failed to move ${dirName}/${name}: ${e?.message || e}`);
      }
    }

    // Try to delete the now-empty subdirectory
    try {
      const remaining = await safeReadDir(subDir);
      if (remaining.length === 0) {
        await vscode.workspace.fs.delete(subDir);
      }
    } catch {
      // Directory might not be empty or might not exist, ignore
    }
  } catch (e: any) {
    errors.push(`Failed to process broken prompt dir ${dirName}: ${e?.message || e}`);
  }

  return { renamed, errors };
}

async function safeReadDir(dir: vscode.Uri): Promise<Array<[string, vscode.FileType]>> {
  try {
    return await vscode.workspace.fs.readDirectory(dir);
  } catch {
    return [];
  }
}
