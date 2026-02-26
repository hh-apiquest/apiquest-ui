// Trash/Soft-Delete types

/**
 * Trashed Item (collection, request, folder)
 */
export interface TrashedItem {
  id: string;
  type: 'collection' | 'request' | 'folder';
  name: string;
  
  // Original location
  collectionId: string;
  collectionName: string;
  parentPath?: string;  // Path within collection
  
  // Data backup
  data: any;  // Full JSON backup
  
  // Trash metadata
  deletedAt: Date;
  deletedBy: string;  // User or system
  autoDeleteAt?: Date;  // Auto-purge after N days
}

/**
 * Trash State
 */
export interface TrashState {
  items: TrashedItem[];
  autoDeleteDays: number;  // Default: 30 days
}

/**
 * Restore Result
 */
export interface RestoreResult {
  success: boolean;
  error?: string;
  restoredItemId?: string;
}
