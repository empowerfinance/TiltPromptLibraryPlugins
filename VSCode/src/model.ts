export interface Prompt {
  id: string;
  text: string;
  title?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  tags: string[];
  private: boolean;
  libraryId?: string; // Optional: which library this prompt belongs to
}

export type GroupKind = 'shared' | 'private';

export interface Group {
  id: string;
  name: string;
  kind: GroupKind;
  description?: string;
  tags: string[];
  children: Group[];
  prompts: Prompt[];
  libraryId?: string; // Optional: which library this group belongs to
  folderName?: string; // Optional: PascalCase folder name for filesystem (if different from name)
}

export interface Library {
  groups: Group[];
  privatePrompts: Prompt[];
}

