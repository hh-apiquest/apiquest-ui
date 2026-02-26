// Workspace types - folder containing collections

import type { CollectionMetadata } from './request';
import type { EnvironmentMetadata } from './environment';

/**
 * Workspace represents a folder containing ApiQuest collections
 */
export interface Workspace {
  id: string;                           // Unique ID (hash of path)
  path: string;                         // Absolute filesystem path
  name: string;                         // Folder name
  collections: CollectionMetadata[];    // All .apiquest.json files found
  environments: EnvironmentMetadata[];  // From environments/ folder
  gitStatus?: GitStatus;                // Git info if available
}

/**
 * Git status for workspace (if it's a Git repo)
 */
export interface GitStatus {
  isRepo: boolean;
  branch: string;
  isDirty: boolean;
  changes: GitChange[];
  ahead: number;
  behind: number;
}

export interface GitChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
}
