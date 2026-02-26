// Auth Inheritance Resolver
// Resolves inherited authentication from parent collection/folder chain

import type { Collection, CollectionItem, Folder, Auth } from '@apiquest/types';

export interface InheritedAuthResult {
  auth: Auth | null;
  source: {
    type: 'collection' | 'folder';
    name: string;
  } | null;
}

/**
 * Find the path from root to a specific item in the collection tree
 * Returns array [collection, ...folders, item] or null if not found
 */
function findItemPath(
  items: CollectionItem[],
  targetId: string,
  currentPath: CollectionItem[] = []
): CollectionItem[] | null {
  for (const item of items) {
    if (item.id === targetId) {
      return [...currentPath, item];
    }
    
    if (item.type === 'folder') {
      const found = findItemPath(
        (item as Folder).items,
        targetId,
        [...currentPath, item]
      );
      if (found) return found;
    }
  }
  return null;
}

/**
 * Normalize auth to handle legacy 'inherit' type and missing auth
 * Returns null if auth should inherit, Auth if explicit
 */
function normalizeAuth(auth: Auth | undefined): Auth | null {
  // Missing auth or explicit 'inherit' should inherit
  if (!auth || auth.type === 'inherit') {
    return null;
  }
  
  // Explicit type (including 'none') uses as-is
  return auth;
}

/**
 * Resolve inherited auth for a request or folder
 * Walks the parent chain from nearest to root, stopping at first explicit auth or 'none'
 * 
 * @param collection - The full collection object
 * @param resourceId - ID of the request or folder to resolve auth for
 * @returns Inherited auth and source, or null if no auth in chain
 */
export function resolveInheritedAuth(
  collection: Collection,
  resourceId: string
): InheritedAuthResult {
  // Find the path to this item
  const path = findItemPath(collection.items, resourceId);
  
  if (!path) {
    // Item not found, no inherited auth
    return { auth: null, source: null };
  }
  
  // Walk backwards through parent chain (nearest parent to root)
  // path = [folder1, folder2, targetItem]
  // We want to check: folder2.auth, folder1.auth, collection.auth
  for (let i = path.length - 2; i >= 0; i--) {
    const parent = path[i] as Folder;
    const normalized = normalizeAuth(parent.auth);
    
    if (normalized) {
      // Found explicit auth (could be 'none' which stops inheritance)
      return {
        auth: normalized,
        source: {
          type: 'folder',
          name: parent.name
        }
      };
    }
  }
  
  // Check collection-level auth
  const collectionAuth = normalizeAuth(collection.auth);
  if (collectionAuth) {
    return {
      auth: collectionAuth,
      source: {
        type: 'collection',
        name: collection.info.name
      }
    };
  }
  
  // No auth found in entire chain
  return { auth: null, source: null };
}
