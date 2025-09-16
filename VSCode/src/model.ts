export interface Prompt {
  id: string;
  text: string;
  title?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  tags: string[];
  private: boolean;
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
}

export interface Library {
  groups: Group[];
  privatePrompts: Prompt[];
}

