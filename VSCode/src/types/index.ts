/**
 * Shared types and interfaces for the Prompt Library extension
 */

/**
 * Message types sent from webview to extension
 */
export type WebviewMessageType =
  | 'ready'
  | 'requestList'
  | 'addPrompt'
  | 'editPrompt'
  | 'deletePrompt'
  | 'copyPrompt'
  | 'movePrompt'
  | 'deleteMany'
  | 'moveMany'
  | 'runCmd'
  | 'wv-log';

/**
 * Message types sent from extension to webview
 */
export type ExtensionMessageType =
  | 'selectedGroup'
  | 'prompts'
  | 'populateComposer';

/**
 * Message sent from webview to extension
 */
export interface WebviewMessage {
  type: WebviewMessageType;
  text?: string;
  title?: string;
  id?: string;
  ids?: string[];
  command?: string;
  msg?: string;
}

/**
 * Message sent from extension to webview
 */
export interface ExtensionMessage {
  type: ExtensionMessageType;
  payload?: any;
}

/**
 * Group selection state
 */
export interface GroupSelection {
  id: string | null;
  name: string | null;
}

/**
 * Result of an operation that can fail
 */
export interface OperationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Import result statistics
 */
export interface ImportResult {
  added: number;
  skipped: number;
}

/**
 * Constants used throughout the extension
 */
export const Constants = {
  /** Root group IDs */
  ROOT_SHARED_ID: 'root-shared',
  ROOT_PRIVATE_ID: 'root-private',
  UNFILED_GROUP_ID: 'grp-unfiled',
  
  /** Group kinds */
  KIND_SHARED: 'shared' as const,
  KIND_PRIVATE: 'private' as const,
  
  /** Namespace tags */
  TAG_NS_SHARED: 'ns:shared',
  TAG_NS_PRIVATE: 'ns:private',
  
  /** File names */
  LIBRARY_FILE: 'library.v2.json',
  GROUP_METADATA_FILE: '_group.yaml',
  
  /** Limits */
  MAX_LOG_ENTRIES: 300,
  DEFAULT_FETCH_INTERVAL_MINUTES: 5,
} as const;

/**
 * Helper to normalize text for duplicate detection
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n|\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Helper to generate a unique ID with a prefix
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Helper to get first N characters of text for display
 */
export function truncateText(text: string, maxLength: number = 20): string {
  const normalized = text.replace(/\r\n?|\n/g, ' ').trim();
  return normalized.length > maxLength 
    ? normalized.slice(0, maxLength).trim() 
    : normalized;
}

