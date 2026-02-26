// Desktop only needs Collection types for file reading/writing
// Fracture handles actual execution

// Re-export Collection types from fracture (for file I/O)
// Desktop reads/writes .apiquest.json files, fracture executes them
export type {
  Collection,
  CollectionInfo,
  CollectionItem,
  Folder,
  Request,
  Auth,
  Variable,
  RuntimeOptions,
  ResponseExample
} from '@apiquest/types';

/**
 * Desktop-specific Collection Metadata
 * Extra info desktop tracks per collection
 */
export interface CollectionMetadata {
  id: string;  // Collection info.id
  name: string;  // Collection info.name for display
  version: string;  // Collection info.version
  description: string;  // Collection info.description
  lastModified: Date;
  isStarred: boolean;
  openTabs: string[];  // Request IDs
  expandedFolders: string[];  // Folder IDs
}
