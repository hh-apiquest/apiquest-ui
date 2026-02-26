import { contextBridge, ipcRenderer } from 'electron';
import type { ApiquestMetadata } from '@apiquest/plugin-ui-types';

const api = {
  // Workspace operations
  workspace: {
    // Workspace management
    scan: (folderPath: string) =>
      ipcRenderer.invoke('workspace:scan', folderPath),
    
    selectFolder: () =>
      ipcRenderer.invoke('workspace:selectFolder'),
    
    getDefaultPath: () =>
      ipcRenderer.invoke('workspace:getDefaultPath'),
    
    listAll: () =>
      ipcRenderer.invoke('workspace:listAll'),
    
    create: (name: string, customPath?: string) =>
      ipcRenderer.invoke('workspace:create', name, customPath),
    
    getMetadata: (workspacePath: string) =>
      ipcRenderer.invoke('workspace:getMetadata', workspacePath),
    
    updateMetadata: (workspacePath: string, updates: any) =>
      ipcRenderer.invoke('workspace:updateMetadata', workspacePath, updates),
    
    listWithMetadata: () =>
      ipcRenderer.invoke('workspace:listWithMetadata'),
    
    // Collection operations
    loadCollection: (workspaceId: string, collectionId: string) =>
      ipcRenderer.invoke('workspace:loadCollection', workspaceId, collectionId),
    
    saveCollection: (workspaceId: string, collectionId: string, collection: any) =>
      ipcRenderer.invoke('workspace:saveCollection', workspaceId, collectionId, collection),
    
    createCollection: (workspaceId: string, name: string, protocol: string) =>
      ipcRenderer.invoke('workspace:createCollection', workspaceId, name, protocol),
    
    renameCollection: (workspaceId: string, collectionId: string, newName: string) =>
      ipcRenderer.invoke('workspace:renameCollection', workspaceId, collectionId, newName),
    
    duplicateCollection: (workspaceId: string, collectionId: string, newName: string) =>
      ipcRenderer.invoke('workspace:duplicateCollection', workspaceId, collectionId, newName),
    
    deleteCollection: (workspaceId: string, collectionId: string) =>
      ipcRenderer.invoke('workspace:deleteCollection', workspaceId, collectionId),
    
    updateCollectionVariables: (workspaceId: string, collectionId: string, variables: any) =>
      ipcRenderer.invoke('workspace:updateCollectionVariables', workspaceId, collectionId, variables),
    
    importCollection: (workspaceId: string) =>
      ipcRenderer.invoke('workspace:importCollection', workspaceId),
    
    exportCollection: (workspaceId: string, collectionId: string) =>
      ipcRenderer.invoke('workspace:exportCollection', workspaceId, collectionId),
    
    // Folder operations
    addFolder: (workspaceId: string, collectionId: string, folderName: string, parentId: string | null) =>
      ipcRenderer.invoke('workspace:addFolder', workspaceId, collectionId, folderName, parentId),
    
    renameFolder: (workspaceId: string, collectionId: string, folderId: string, newName: string) =>
      ipcRenderer.invoke('workspace:renameFolder', workspaceId, collectionId, folderId, newName),
    
    deleteFolder: (workspaceId: string, collectionId: string, folderId: string) =>
      ipcRenderer.invoke('workspace:deleteFolder', workspaceId, collectionId, folderId),
    
    // Request operations
    addRequest: (workspaceId: string, collectionId: string, requestName: string, parentId: string | null) =>
      ipcRenderer.invoke('workspace:addRequest', workspaceId, collectionId, requestName, parentId),
    
    renameRequest: (workspaceId: string, collectionId: string, requestId: string, newName: string) =>
      ipcRenderer.invoke('workspace:renameRequest', workspaceId, collectionId, requestId, newName),
    
    duplicateRequest: (workspaceId: string, collectionId: string, requestId: string, parentId: string | null) =>
      ipcRenderer.invoke('workspace:duplicateRequest', workspaceId, collectionId, requestId, parentId),
    
    deleteRequest: (workspaceId: string, collectionId: string, requestId: string) =>
      ipcRenderer.invoke('workspace:deleteRequest', workspaceId, collectionId, requestId),
  },

  // Environment operations
  environment: {
    load: (workspaceId: string, fileName: string) =>
      ipcRenderer.invoke('environment:load', workspaceId, fileName),
    
    save: (workspaceId: string, fileName: string, environment: any) =>
      ipcRenderer.invoke('environment:save', workspaceId, fileName, environment),
    
    create: (workspaceId: string, name: string) =>
      ipcRenderer.invoke('environment:create', workspaceId, name),
    
    rename: (workspaceId: string, oldFileName: string, newFileName: string) =>
      ipcRenderer.invoke('environment:rename', workspaceId, oldFileName, newFileName),
    
    delete: (workspaceId: string, fileName: string) =>
      ipcRenderer.invoke('environment:delete', workspaceId, fileName),
    
    duplicate: (workspaceId: string, sourceFileName: string, newFileName: string) =>
      ipcRenderer.invoke('environment:duplicate', workspaceId, sourceFileName, newFileName),
  },

  // Global variables
  globalVariables: {
    load: () => ipcRenderer.invoke('globalVariables:load'),
    save: (variables: any) => ipcRenderer.invoke('globalVariables:save', variables),
  },

  // App settings (settings.json in userData)
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    get: (path: string) => ipcRenderer.invoke('settings:get', path),
    update: (partial: any) => ipcRenderer.invoke('settings:update', partial),
    set: (path: string, value: any) => ipcRenderer.invoke('settings:set', path, value),
  },

  // Session management (sessions.json in userData)
  session: {
    get: (workspaceId: string) => ipcRenderer.invoke('session:get', workspaceId),
    save: (workspaceId: string, session: any) => ipcRenderer.invoke('session:save', workspaceId, session),
    update: (workspaceId: string, updates: any) => ipcRenderer.invoke('session:update', workspaceId, updates),
  },

  // Runner - execution-based architecture
  runner: {
    runRequest: (params: any) => ipcRenderer.invoke('runner:runRequest', params),
    runCollection: (params: any) => ipcRenderer.invoke('runner:runCollection', params),
    stopRun: (runId: string) => ipcRenderer.invoke('runner:stopRun', runId),
    getStatus: (runId: string) => ipcRenderer.invoke('runner:getStatus', runId),
    
    onExecutionEvent: (callback: (event: any) => void) => {
      const handler = (_event: any, executionEvent: any) => callback(executionEvent);
      ipcRenderer.on('execution:event', handler);
      
      // Return unsubscribe function
      return () => {
        ipcRenderer.off('execution:event', handler);
      };
    },
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },

  // Plugin management
  plugins: {
    ensureDevInstalled: () => ipcRenderer.invoke('plugins:ensureDevInstalled'),
    scan: () => ipcRenderer.invoke('plugins:scan'),
    install: (packageNameOrUrl: string) => ipcRenderer.invoke('plugins:install', packageNameOrUrl),
    remove: (pluginName: string) => ipcRenderer.invoke('plugins:remove', pluginName),
    searchMarketplace: (query: string, type?: ApiquestMetadata['type'] | 'all') => ipcRenderer.invoke('plugins:searchMarketplace', query, type),
  },
};

contextBridge.exposeInMainWorld('quest', api);
