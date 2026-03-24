import type { VariableValue } from '@apiquest/types';

export interface WorkspaceMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface WorkspaceWithMetadata {
  path: string;
  metadata: WorkspaceMetadata | null;
}

export type WorkspaceCollectionVariables = Record<string, VariableValue>;

export interface ImportCollectionParams {
  pluginPackageName: string;
  format: string;
  fileExtensions: string[];
  sourceKind: 'file' | 'directory';
}

export interface ImportCollectionResult {
  success: boolean;
  fileName?: string;
  collectionId?: string;
  pluginPackageName?: string;
  format?: string;
  warnings?: string[];
  errors?: string[];
}
