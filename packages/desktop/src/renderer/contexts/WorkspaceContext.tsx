// WorkspaceContext - Manages active workspace and collections
// Layer: Contexts (React layer, wraps WorkspaceService)

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Workspace } from '../types/workspace';
import type { Collection, CollectionMetadata } from '../types/request';
import type { EnvironmentMetadata } from '../types/environment';
import type { Environment } from '@apiquest/types';
import { workspaceService } from '../services';

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
  updateCollection: (collectionId: string, updates: any) => Promise<void>;
  updateRequest: (collectionId: string, requestId: string, updates: any) => Promise<void>;
  updateFolder: (collectionId: string, folderId: string, updates: any) => Promise<void>;
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

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEnvironment, setActiveEnvironmentState] = useState<EnvironmentMetadata | null>(null);
  
  // Collection cache - lazy-loaded on first access
  const [collectionCache, setCollectionCache] = useState<Map<string, Collection>>(new Map());

  const openWorkspace = async (folderPath: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const ws = await workspaceService.scanWorkspace(folderPath);
      setWorkspace(ws);
      
      // Save to recent workspaces
      const recent = JSON.parse(localStorage.getItem('recentWorkspaces') || '[]');
      const updated = [folderPath, ...recent.filter((p: string) => p !== folderPath)].slice(0, 10);
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

  const closeWorkspace = () => {
    setWorkspace(null);
    localStorage.removeItem('lastWorkspace');
  };

  const refreshWorkspace = async () => {
    if (!workspace) return;
    console.log('[WorkspaceContext] Refreshing workspace, clearing collection cache');
    setCollectionCache(new Map()); // Clear cache to force reload from disk
    await openWorkspace(workspace.path);
  };

  // Get collection (with lazy loading & caching)
  const getCollection = useCallback(async (collectionId: string): Promise<Collection> => {
    if (!workspace) throw new Error('No workspace selected');
    
    // Check cache first
    if (collectionCache.has(collectionId)) {
      return collectionCache.get(collectionId)!;
    }
    
    // Load from disk & cache
    console.log('[WorkspaceContext] Loading collection from disk:', collectionId);
    const collection = await window.quest.workspace.loadCollection(workspace.id, collectionId);
    setCollectionCache(prev => new Map(prev).set(collectionId, collection));
    return collection;
  }, [workspace, collectionCache]);

  // Update entire collection
  const updateCollection = useCallback(async (collectionId: string, updates: any) => {
    if (!workspace) throw new Error('No workspace selected');
    
    const collection = await getCollection(collectionId);
    const updated = { ...collection, ...updates };
    
    // Update cache
    setCollectionCache(prev => new Map(prev).set(collectionId, updated));
    
    // Save to disk
    await window.quest.workspace.saveCollection(workspace.id, collectionId, updated);
    console.log('[WorkspaceContext] Collection updated:', collectionId);
  }, [workspace, getCollection]);

  // Update request in collection
  const updateRequest = useCallback(async (collectionId: string, requestId: string, updates: any) => {
    if (!workspace) throw new Error('No workspace selected');
    
    const collection = await getCollection(collectionId);
    
    // Find and update request in tree
    const updateInItems = (items: any[]): boolean => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type === 'request' && items[i].id === requestId) {
          items[i] = { ...items[i], ...updates };
          return true;
        }
        if (items[i].type === 'folder' && items[i].items) {
          if (updateInItems(items[i].items)) {
            return true;
          }
        }
      }
      return false;
    };

    if (collection.items) {
      updateInItems(collection.items);
    }

    // Update cache
    setCollectionCache(prev => new Map(prev).set(collectionId, { ...collection }));
    
    // Save to disk
    await window.quest.workspace.saveCollection(workspace.id, collectionId, collection);
    console.log('[WorkspaceContext] Request updated:', requestId);
  }, [workspace, getCollection]);

  // Update folder in collection
  const updateFolder = useCallback(async (collectionId: string, folderId: string, updates: any) => {
    if (!workspace) throw new Error('No workspace selected');
    
    const collection = await getCollection(collectionId);
    
    // Find and update folder in tree
    const updateInItems = (items: any[]): boolean => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type === 'folder' && items[i].id === folderId) {
          // Preserve items array, update other properties
          items[i] = { ...items[i], ...updates, items: items[i].items };
          return true;
        }
        if (items[i].type === 'folder' && items[i].items) {
          if (updateInItems(items[i].items)) {
            return true;
          }
        }
      }
      return false;
    };

    if (collection.items) {
      updateInItems(collection.items);
    }

    // Update cache
    setCollectionCache(prev => new Map(prev).set(collectionId, { ...collection }));
    
    // Save to disk
    await window.quest.workspace.saveCollection(workspace.id, collectionId, collection);
    console.log('[WorkspaceContext] Folder updated:', folderId);
  }, [workspace, getCollection]);

  // Save collection to disk
  const saveCollection = useCallback(async (collectionId: string) => {
    if (!workspace) throw new Error('No workspace selected');
    
    const collection = collectionCache.get(collectionId);
    if (!collection) {
      throw new Error(`Collection not in cache: ${collectionId}`);
    }
    
    await window.quest.workspace.saveCollection(workspace.id, collectionId, collection);
    console.log('[WorkspaceContext] Collection saved:', collectionId);
  }, [workspace, collectionCache]);

  // Clear collection cache (useful for refresh)
  const clearCollectionCache = useCallback((collectionId?: string) => {
    if (collectionId) {
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
  const setActiveEnvironment = (env: EnvironmentMetadata | null) => {
    setActiveEnvironmentState(env);
    if (workspace) {
      if (env) {
        localStorage.setItem(`activeEnv:${workspace.path}`, env.id);
      } else {
        localStorage.removeItem(`activeEnv:${workspace.path}`);
      }
    }
  };

  const createEnvironment = async (name: string) => {
    if (!workspace) return;
    await window.quest.environment.create(workspace.id, name);
    await refreshWorkspace();
  };

  const renameEnvironment = async (env: EnvironmentMetadata, newName: string) => {
    if (!workspace) return;
    const sanitizedNewName = newName.trim().replace(/[^a-z0-9-_\s]/gi, '-');
    await window.quest.environment.rename(workspace.id, env.fileName, sanitizedNewName);
    if (activeEnvironment?.id === env.id) {
      const newId = sanitizedNewName;
      setActiveEnvironmentState({ ...env, id: newId, name: newName, fileName: sanitizedNewName });
    }
    await refreshWorkspace();
  };

  const deleteEnvironment = async (env: EnvironmentMetadata) => {
    if (!workspace) return;
    await window.quest.environment.delete(workspace.id, env.fileName);
    if (activeEnvironment?.id === env.id) {
      setActiveEnvironment(null);
    }
    await refreshWorkspace();
  };

  const duplicateEnvironment = async (env: EnvironmentMetadata, newName: string) => {
    if (!workspace) return;
    const sanitizedNewName = newName.trim().replace(/[^a-z0-9-_\s]/gi, '-');
    await window.quest.environment.duplicate(workspace.id, env.fileName, sanitizedNewName);
    await refreshWorkspace();
  };

  const loadEnvironment = async (fileName: string): Promise<Environment> => {
    if (!workspace) throw new Error('No workspace selected');
    return await window.quest.environment.load(workspace.id, fileName);
  };

  const saveEnvironment = async (fileName: string, environment: Environment): Promise<void> => {
    if (!workspace) throw new Error('No workspace selected');
    await window.quest.environment.save(workspace.id, fileName, environment);
    await refreshWorkspace();
  };

  // Restore active environment when workspace changes
  useEffect(() => {
    if (workspace) {
      const savedEnvId = localStorage.getItem(`activeEnv:${workspace.path}`);
      if (savedEnvId) {
        const env = workspace.environments.find(e => e.id === savedEnvId);
        setActiveEnvironmentState(env || null);
      } else {
        setActiveEnvironmentState(null);
      }
    } else {
      setActiveEnvironmentState(null);
    }
  }, [workspace?.path, workspace?.environments]);

  // Auto-load default workspace on mount
  useEffect(() => {
    const loadWorkspace = async () => {
      const lastWorkspace = localStorage.getItem('lastWorkspace');
      if (lastWorkspace) {
        await openWorkspace(lastWorkspace);
      } else {
        // Load default workspace from app data
        const defaultPath = await window.quest.workspace.getDefaultPath();
        await openWorkspace(defaultPath);
      }
    };
    
    loadWorkspace();
  }, []);

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

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
}
