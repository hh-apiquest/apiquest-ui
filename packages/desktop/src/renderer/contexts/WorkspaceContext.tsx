// WorkspaceContext - Manages active workspace and collections
// Layer: Contexts (React layer, wraps WorkspaceService)

import React, { createContext, useContext, useState, useEffect, type ReactElement, type ReactNode, useCallback } from 'react';
import type { Workspace } from '../types/workspace';
import type { Collection, CollectionItem, Folder, Request } from '../types/request';
import type { EnvironmentMetadata } from '../types/environment';
import type { Environment } from '@apiquest/types';
import { workspaceService } from '../services';

type RecentWorkspaces = string[];

function parseRecentWorkspaces(value: string | null): RecentWorkspaces {
  if (value === null) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function isFolderItem(item: CollectionItem): item is Folder {
  return item.type === 'folder';
}

function isRequestItem(item: CollectionItem): item is Request {
  return item.type === 'request';
}

function updateRequestInItems(items: CollectionItem[], requestId: string, updates: Partial<Request>): boolean {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (isRequestItem(item) && item.id === requestId) {
      items[i] = { ...item, ...updates };
      return true;
    }

    if (isFolderItem(item) && updateRequestInItems(item.items, requestId, updates)) {
      return true;
    }
  }

  return false;
}

function updateFolderInItems(items: CollectionItem[], folderId: string, updates: Partial<Folder>): boolean {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (isFolderItem(item) && item.id === folderId) {
      items[i] = { ...item, ...updates, items: item.items };
      return true;
    }

    if (isFolderItem(item) && updateFolderInItems(item.items, folderId, updates)) {
      return true;
    }
  }

  return false;
}

interface WorkspaceContextValue {
  // Current workspace
  workspace: Workspace | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  openWorkspace: (folderPath: string) => Promise<void>;
  closeWorkspace: () => void;
  refreshWorkspace: () => Promise<void>;
  
  // Collection operations (with cache)
  getCollection: (collectionId: string) => Promise<Collection>;
  updateCollection: (collectionId: string, updates: Partial<Collection>) => Promise<void>;
  updateRequest: (collectionId: string, requestId: string, updates: Partial<Request>) => Promise<void>;
  updateFolder: (collectionId: string, folderId: string, updates: Partial<Folder>) => Promise<void>;
  saveCollection: (collectionId: string) => Promise<void>;
  clearCollectionCache: (collectionId?: string) => void;
  
  // Environment management
  activeEnvironment: EnvironmentMetadata | null;
  setActiveEnvironment: (env: EnvironmentMetadata | null) => void;
  createEnvironment: (name: string) => Promise<void>;
  renameEnvironment: (env: EnvironmentMetadata, newName: string) => Promise<void>;
  deleteEnvironment: (env: EnvironmentMetadata) => Promise<void>;
  duplicateEnvironment: (env: EnvironmentMetadata, newName: string) => Promise<void>;
  loadEnvironment: (fileName: string) => Promise<Environment>;
  saveEnvironment: (fileName: string, environment: Environment) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps): ReactElement {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEnvironment, setActiveEnvironmentState] = useState<EnvironmentMetadata | null>(null);
  
  // Collection cache - lazy-loaded on first access
  const [collectionCache, setCollectionCache] = useState<Map<string, Collection>>(new Map());

  const openWorkspace = async (folderPath: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const ws = await workspaceService.scanWorkspace(folderPath);
      setWorkspace(ws);
      
      // Save to recent workspaces
      const recent = parseRecentWorkspaces(localStorage.getItem('recentWorkspaces'));
      const updated = [folderPath, ...recent.filter((path) => path !== folderPath)].slice(0, 10);
      localStorage.setItem('recentWorkspaces', JSON.stringify(updated));
      
      // Save as last opened
      localStorage.setItem('lastWorkspace', folderPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open workspace');
      console.error('Failed to open workspace:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const closeWorkspace = (): void => {
    setWorkspace(null);
    localStorage.removeItem('lastWorkspace');
  };

  const refreshWorkspace = async (): Promise<void> => {
    if (workspace === null) {
      return;
    }

    console.log('[WorkspaceContext] Refreshing workspace, clearing collection cache');
    setCollectionCache(new Map()); // Clear cache to force reload from disk
    await openWorkspace(workspace.path);
  };

  // Get collection (with lazy loading & caching)
  const getCollection = useCallback(async (collectionId: string): Promise<Collection> => {
    if (workspace === null) {
      throw new Error('No workspace selected');
    }
    
    // Check cache first
    if (collectionCache.has(collectionId)) {
      return collectionCache.get(collectionId) ?? await window.quest.workspace.loadCollection(workspace.id, collectionId);
    }
    
    // Load from disk & cache
    console.log('[WorkspaceContext] Loading collection from disk:', collectionId);
    const collection = await window.quest.workspace.loadCollection(workspace.id, collectionId);
    setCollectionCache(prev => new Map(prev).set(collectionId, collection));
    return collection;
  }, [workspace, collectionCache]);

  // Update entire collection
  const updateCollection = useCallback(async (collectionId: string, updates: Partial<Collection>): Promise<void> => {
    if (workspace === null) {
      throw new Error('No workspace selected');
    }
    
    const collection = await getCollection(collectionId);
    const updated = { ...collection, ...updates };
    
    // Update cache
    setCollectionCache(prev => new Map(prev).set(collectionId, updated));
    
    // Save to disk
    await window.quest.workspace.saveCollection(workspace.id, collectionId, updated);
    console.log('[WorkspaceContext] Collection updated:', collectionId);
  }, [workspace, getCollection]);

  // Update request in collection
  const updateRequest = useCallback(async (collectionId: string, requestId: string, updates: Partial<Request>): Promise<void> => {
    if (workspace === null) {
      throw new Error('No workspace selected');
    }
    
    const collection = await getCollection(collectionId);
    updateRequestInItems(collection.items, requestId, updates);

    // Update cache
    setCollectionCache(prev => new Map(prev).set(collectionId, { ...collection }));
    
    // Save to disk
    await window.quest.workspace.saveCollection(workspace.id, collectionId, collection);
    console.log('[WorkspaceContext] Request updated:', requestId);
  }, [workspace, getCollection]);

  // Update folder in collection
  const updateFolder = useCallback(async (collectionId: string, folderId: string, updates: Partial<Folder>): Promise<void> => {
    if (workspace === null) {
      throw new Error('No workspace selected');
    }
    
    const collection = await getCollection(collectionId);
    updateFolderInItems(collection.items, folderId, updates);

    // Update cache
    setCollectionCache(prev => new Map(prev).set(collectionId, { ...collection }));
    
    // Save to disk
    await window.quest.workspace.saveCollection(workspace.id, collectionId, collection);
    console.log('[WorkspaceContext] Folder updated:', folderId);
  }, [workspace, getCollection]);

  // Save collection to disk
  const saveCollection = useCallback(async (collectionId: string): Promise<void> => {
    if (workspace === null) {
      throw new Error('No workspace selected');
    }
    
    const collection = collectionCache.get(collectionId);
    if (collection === undefined) {
      throw new Error(`Collection not in cache: ${collectionId}`);
    }
    
    await window.quest.workspace.saveCollection(workspace.id, collectionId, collection);
    console.log('[WorkspaceContext] Collection saved:', collectionId);
  }, [workspace, collectionCache]);

  // Clear collection cache (useful for refresh)
  const clearCollectionCache = useCallback((collectionId?: string): void => {
    if (collectionId !== undefined && collectionId !== '') {
      setCollectionCache(prev => {
        const next = new Map(prev);
        next.delete(collectionId);
        return next;
      });
      console.log('[WorkspaceContext] Cache cleared for collection:', collectionId);
    } else {
      setCollectionCache(new Map());
      console.log('[WorkspaceContext] All collection cache cleared');
    }
  }, []);

  // Environment management
  const setActiveEnvironment = (env: EnvironmentMetadata | null): void => {
    setActiveEnvironmentState(env);
    if (workspace !== null) {
      if (env !== null) {
        localStorage.setItem(`activeEnv:${workspace.path}`, env.id);
      } else {
        localStorage.removeItem(`activeEnv:${workspace.path}`);
      }
    }
  };

  const createEnvironment = async (name: string): Promise<void> => {
    if (workspace === null) {
      return;
    }

    await window.quest.environment.create(workspace.id, name);
    await refreshWorkspace();
  };

  const renameEnvironment = async (env: EnvironmentMetadata, newName: string): Promise<void> => {
    if (workspace === null) {
      return;
    }

    const sanitizedNewName = newName.trim().replace(/[^a-z0-9-_\s]/gi, '-');
    await window.quest.environment.rename(workspace.id, env.fileName, sanitizedNewName);
    if (activeEnvironment?.id === env.id) {
      const newId = sanitizedNewName;
      setActiveEnvironmentState({ ...env, id: newId, name: newName, fileName: sanitizedNewName });
    }
    await refreshWorkspace();
  };

  const deleteEnvironment = async (env: EnvironmentMetadata): Promise<void> => {
    if (workspace === null) {
      return;
    }

    await window.quest.environment.delete(workspace.id, env.fileName);
    if (activeEnvironment?.id === env.id) {
      setActiveEnvironment(null);
    }
    await refreshWorkspace();
  };

  const duplicateEnvironment = async (env: EnvironmentMetadata, newName: string): Promise<void> => {
    if (workspace === null) {
      return;
    }

    const sanitizedNewName = newName.trim().replace(/[^a-z0-9-_\s]/gi, '-');
    await window.quest.environment.duplicate(workspace.id, env.fileName, sanitizedNewName);
    await refreshWorkspace();
  };

  const loadEnvironment = async (fileName: string): Promise<Environment> => {
    if (workspace === null) {
      throw new Error('No workspace selected');
    }

    return await window.quest.environment.load(workspace.id, fileName) as Environment;
  };

  const saveEnvironment = async (fileName: string, environment: Environment): Promise<void> => {
    if (workspace === null) {
      throw new Error('No workspace selected');
    }

    await window.quest.environment.save(workspace.id, fileName, environment);
    await refreshWorkspace();
  };

  // Restore active environment when workspace changes
  useEffect((): void => {
    if (workspace !== null) {
      const savedEnvId = localStorage.getItem(`activeEnv:${workspace.path}`);
      if (savedEnvId !== null && savedEnvId !== '') {
        const env = workspace.environments.find((environment) => environment.id === savedEnvId);
        setActiveEnvironmentState(env ?? null);
      } else {
        setActiveEnvironmentState(null);
      }
    } else {
      setActiveEnvironmentState(null);
    }
  }, [workspace?.path, workspace?.environments]);

  // Auto-load default workspace on mount
  useEffect(() => {
    const loadWorkspace = async (): Promise<void> => {
      const lastWorkspace = localStorage.getItem('lastWorkspace');
      if (lastWorkspace !== null && lastWorkspace !== '') {
        await openWorkspace(lastWorkspace);
      } else {
        // Load default workspace from app data
        const defaultPath = await window.quest.workspace.getDefaultPath();
        await openWorkspace(defaultPath);
      }
    };
    
    void loadWorkspace();
  }, [openWorkspace]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        isLoading,
        error,
        openWorkspace,
        closeWorkspace,
        refreshWorkspace,
        getCollection,
        updateCollection,
        updateRequest,
        updateFolder,
        saveCollection,
        clearCollectionCache,
        activeEnvironment,
        setActiveEnvironment,
        createEnvironment,
        renameEnvironment,
        deleteEnvironment,
        duplicateEnvironment,
        loadEnvironment,
        saveEnvironment
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (context === null) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
}
