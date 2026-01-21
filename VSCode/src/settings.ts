import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';



/**
 * Expands tilde (~) in paths to the user's home directory
 */
function expandPath(filePath: string): string {
  if (filePath.startsWith('~/') || filePath === '~') {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

// ============================================================================
// Multi-Library Data Model Types
// ============================================================================

/**
 * Configuration for a single library within a repository.
 * A library is a folder in the repo that contains prompt groups.
 */
export interface LibraryConfig {
  /** Unique identifier for this library (e.g., "platform", "analytics") */
  id: string;
  /** Subdirectory path within the repository (e.g., "platform", "analytics/reports") */
  path: string;
  /** Human-readable display name */
  displayName: string;
  /** Whether the user has this library enabled/subscribed */
  enabled: boolean;
  /** Optional color for UI distinction */
  color?: string;
}

/**
 * Configuration for a Git repository that contains one or more libraries.
 */
export interface RepoConfig {
  /** Git remote URL */
  url: string;
  /** Local file system path where the repo is cloned */
  localPath: string;
  /** Branch to sync with (empty = auto-detect from origin) */
  branch: string;
  /** Libraries available in this repository */
  libraries: LibraryConfig[];
}

/**
 * Converts a string to PascalCase (TitleCase with no spaces).
 * Used when creating new groups/libraries via the extension.
 * - "My New Group" → "MyNewGroup"
 * - "my-custom-library" → "MyCustomLibrary"
 * - "promptsProduct" → "PromptsProduct" (just capitalizes first letter)
 * - "GENERAL" → "General" (all-caps single word normalized)
 */
export function toPascalCase(str: string): string {
  const trimmed = str.trim();
  if (!trimmed) return '';

  // If the string has no separators (already camelCase/PascalCase or single word)
  if (!/[-_\s]/.test(trimmed)) {
    // Check if it's all uppercase (like "GENERAL") - normalize to Title case
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 1) {
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    }
    // Otherwise preserve existing casing (camelCase/PascalCase), just capitalize first letter
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }

  // Split on separators and capitalize each word's first letter, lowercase rest, join without spaces
  return trimmed
    .split(/[-_\s]+/)
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Default library name when none is configured.
 */
export const DEFAULT_LIBRARY_NAME = 'general';

// ============================================================================
// Legacy Settings Interface (for backward compatibility)
// ============================================================================

export interface PromptLibrarySettings {
  remoteRepoUrl: string;
  repoPath: string;
  promptsSubdir: string; // active library folder name for writing, default 'general'
  hiddenLibraries: string[]; // list of library folders to hide (opt-out)
  branchName: string;
  autoFetch: { enabled: boolean; minutes: number };
}

/**
 * Gets the current settings from VS Code configuration.
 * Applies migration if needed (e.g., empty promptsSubdir defaults to 'general').
 */
export function getSettings(): PromptLibrarySettings {
  const cfg = vscode.workspace.getConfiguration('promptLibrary');
  const rawRepoPath = cfg.get<string>('repoPath', '');

  // Get promptsSubdir with fallback to 'general' if empty
  let promptsSubdir = cfg.get<string>('promptsSubdir', DEFAULT_LIBRARY_NAME);
  if (!promptsSubdir || promptsSubdir.trim() === '') {
    promptsSubdir = DEFAULT_LIBRARY_NAME;
  }

  // Get hidden libraries - libraries to exclude from the tree view
  const hiddenLibraries = cfg.get<string[]>('hiddenLibraries', []);

  return {
    remoteRepoUrl: cfg.get<string>('remoteRepoUrl', ''),
    repoPath: rawRepoPath ? expandPath(rawRepoPath) : '',
    promptsSubdir: promptsSubdir,
    hiddenLibraries: hiddenLibraries,
    branchName: cfg.get<string>('branchName', ''),
    autoFetch: {
      enabled: cfg.get<boolean>('autoFetch.enabled', false),
      minutes: cfg.get<number>('autoFetch.minutes', 5),
    },
  };
}

// ============================================================================
// Multi-Library Configuration Functions
// ============================================================================

/**
 * Converts current settings into a RepoConfig with all enabled libraries.
 * Auto-discovers all valid library folders from the repository.
 *
 * Library visibility logic (opt-out approach):
 * - All discovered libraries are shown by default
 * - Libraries in hiddenLibraries setting are hidden
 */
export function getRepoConfig(): RepoConfig {
  const settings = getSettings();
  const activeLibraryPath = settings.promptsSubdir || DEFAULT_LIBRARY_NAME;
  const hiddenLibrariesSetting = settings.hiddenLibraries || [];

  // Auto-discover all libraries from the repository
  let libraries = discoverLibraries(settings.repoPath);

  // Apply enabled/disabled status based on hidden list (opt-out)
  // All libraries are enabled by default, except those in the hidden list
  libraries = libraries.map(lib => ({
    ...lib,
    enabled: !hiddenLibrariesSetting.includes(lib.id)
  }));

  // Note: We no longer add the active library if it doesn't exist on disk.
  // This prevents phantom libraries from appearing when promptsSubdir points
  // to a folder that doesn't exist or doesn't have a _library.yaml file.
  // The active library setting should be updated when the user selects
  // a different library or when the current one is deleted.

  return {
    url: settings.remoteRepoUrl,
    localPath: settings.repoPath,
    branch: settings.branchName,
    libraries
  };
}

/**
 * Gets the currently active library (used for writing).
 * This is the library where new prompts will be saved.
 */
export function getActiveLibrary(): LibraryConfig {
  const settings = getSettings();
  const libraryPath = settings.promptsSubdir || DEFAULT_LIBRARY_NAME;

  return {
    id: libraryPath,
    path: libraryPath,
    displayName: libraryPath, // Display exactly as folder name
    enabled: true
  };
}

/**
 * Gets all enabled libraries from the configuration.
 * Returns multiple libraries when enabledLibraries is configured.
 */
export function getEnabledLibraries(): LibraryConfig[] {
  const repoConfig = getRepoConfig();
  return repoConfig.libraries.filter(l => l.enabled);
}

/**
 * Computes the full file system path to a library's root directory.
 */
export function getLibraryPath(repoPath: string, library: LibraryConfig): string {
  return path.join(repoPath, library.path);
}

/**
 * Sets the active library by updating the promptsSubdir setting.
 */
export async function setActiveLibrary(libraryPath: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('promptLibrary');
  await cfg.update('promptsSubdir', libraryPath, vscode.ConfigurationTarget.Global);
}

/**
 * Updates the list of hidden libraries.
 */
export async function setHiddenLibraries(libraryPaths: string[]): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('promptLibrary');
  await cfg.update('hiddenLibraries', libraryPaths, vscode.ConfigurationTarget.Global);
}

/**
 * Gets the raw hidden libraries setting.
 */
export function getHiddenLibraryPaths(): string[] {
  const settings = getSettings();
  return settings.hiddenLibraries;
}

/**
 * Shows all libraries by clearing the hidden list.
 */
export async function showAllLibraries(): Promise<void> {
  await setHiddenLibraries([]);
}

/**
 * Hides all libraries.
 */
export async function hideAllLibraries(): Promise<void> {
  const settings = getSettings();
  const allLibraries = discoverLibraries(settings.repoPath);

  // Hide all libraries
  const toHide = allLibraries.map(lib => lib.id);

  await setHiddenLibraries(toHide);
}

/**
 * Gets available libraries based on folders in the repository.
 * Scans the repository root for directories that contain a _library.yaml file.
 *
 * A valid library structure:
 *   repoRoot/
 *     MyLibrary/
 *       _library.yaml    <- Identifies this folder as a library
 *       GroupA/
 *         _group.yaml    <- Identifies this folder as a group
 *         prompts/
 */
export function discoverLibraries(repoPath: string): LibraryConfig[] {
  const fs = require('fs');
  const libraries: LibraryConfig[] = [];

  if (!repoPath || !fs.existsSync(repoPath)) {
    return libraries;
  }

  try {
    const entries = fs.readdirSync(repoPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        // Check if this directory is a library (has _library.yaml at its root)
        const potentialLibPath = path.join(repoPath, entry.name);
        const libraryYamlPath = path.join(potentialLibPath, '_library.yaml');

        if (fs.existsSync(libraryYamlPath)) {
          libraries.push({
            id: entry.name,
            path: entry.name,
            displayName: entry.name, // Display exactly as folder name on disk
            enabled: true
          });
        }
      }
    }
  } catch (e) {
    // Silently ignore errors during discovery
  }

  // Return discovered libraries only - no default fallback
  // If no libraries found, return empty array.
  // The UI should handle this case by prompting user to create a library.
  return libraries;
}

export function onSettingsChanged(cb: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('promptLibrary')) cb();
  });
}

/**
 * Sets the remote repo URL in VS Code settings.
 */
export async function setRemoteRepoUrl(url: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('promptLibrary');
  await cfg.update('remoteRepoUrl', url, vscode.ConfigurationTarget.Global);
}

/**
 * Sets the local repo path in VS Code settings.
 */
export async function setRepoPath(repoPath: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('promptLibrary');
  await cfg.update('repoPath', repoPath, vscode.ConfigurationTarget.Global);
}

