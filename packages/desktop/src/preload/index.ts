import { contextBridge, ipcRenderer } from 'electron';
import type { ApiquestMetadata } from '@apiquest/plugin-ui-types';
import type { AICompletionRequest, AICompletionResponse } from '../main/types/ai.js';
import type {
  PluginInteractionRequest,
  PluginInteractionResponse,
} from '../main/types/host.js';
import type { QuestApi } from '../main/types/preload.js';
import type { MarketplacePlugin, ScannedPlugin } from '../main/types/plugins.js';
import type { RunCollectionParams, RunnerExecutionState } from '../main/types/runner.js';
import type { WorkspaceSession } from '../main/types/session.js';
import type { ImportCollectionParams, WorkspaceMetadata } from '../main/types/workspace.js';
import type { AppSettings, ThemeSetting, WorkspaceSecrets } from '../main/SettingsService.js';
import type { ExecutionEvent, RunRequestParams } from '../types/execution.js';
import type { Collection, Environment, VariableValue } from '@apiquest/types';

const api: QuestApi = {
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
    
    updateMetadata: (workspacePath: string, updates: Partial<WorkspaceMetadata>) =>
      ipcRenderer.invoke('workspace:updateMetadata', workspacePath, updates),
    
    listWithMetadata: () =>
      ipcRenderer.invoke('workspace:listWithMetadata'),
    
    // Collection operations
    loadCollection: (workspaceId: string, collectionId: string) =>
      ipcRenderer.invoke('workspace:loadCollection', workspaceId, collectionId),
    
    saveCollection: (workspaceId: string, collectionId: string, collection: Collection) =>
      ipcRenderer.invoke('workspace:saveCollection', workspaceId, collectionId, collection),
    
    createCollection: (workspaceId: string, name: string, protocol: string) =>
      ipcRenderer.invoke('workspace:createCollection', workspaceId, name, protocol),
    
    renameCollection: (workspaceId: string, collectionId: string, newName: string) =>
      ipcRenderer.invoke('workspace:renameCollection', workspaceId, collectionId, newName),
    
    duplicateCollection: (workspaceId: string, collectionId: string, newName: string) =>
      ipcRenderer.invoke('workspace:duplicateCollection', workspaceId, collectionId, newName),
    
    deleteCollection: (workspaceId: string, collectionId: string) =>
      ipcRenderer.invoke('workspace:deleteCollection', workspaceId, collectionId),
    
    updateCollectionVariables: (workspaceId: string, collectionId: string, variables: Record<string, VariableValue>) =>
      ipcRenderer.invoke('workspace:updateCollectionVariables', workspaceId, collectionId, variables),
    
    importCollection: (
      workspaceId: string,
      params?: ImportCollectionParams
    ) =>
      ipcRenderer.invoke('workspace:importCollection', workspaceId, params),
    
    exportCollection: (workspaceId: string, collectionId: string) =>
      ipcRenderer.invoke('workspace:exportCollection', workspaceId, collectionId),
    
    // Folder operations
    addFolder: (workspaceId: string, collectionId: string, folderName: string, parentId: string | null) =>
      ipcRenderer.invoke('workspace:addFolder', workspaceId, collectionId, folderName, parentId),
    
    renameFolder: (workspaceId: string, collectionId: string, folderId: string, newName: string) =>
      ipcRenderer.invoke('workspace:renameFolder', workspaceId, collectionId, folderId, newName),

    moveFolder: (
      workspaceId: string,
      sourceCollectionId: string,
      folderId: string,
      targetCollectionId: string,
      targetParentId: string | null,
      targetIndex: number,
    ) => ipcRenderer.invoke(
      'workspace:moveFolder',
      workspaceId,
      sourceCollectionId,
      folderId,
      targetCollectionId,
      targetParentId,
      targetIndex,
    ),

    deleteFolder: (workspaceId: string, collectionId: string, folderId: string) =>
      ipcRenderer.invoke('workspace:deleteFolder', workspaceId, collectionId, folderId),
    
    // Request operations
    addRequest: (workspaceId: string, collectionId: string, requestName: string, parentId: string | null) =>
      ipcRenderer.invoke('workspace:addRequest', workspaceId, collectionId, requestName, parentId),
    
    renameRequest: (workspaceId: string, collectionId: string, requestId: string, newName: string) =>
      ipcRenderer.invoke('workspace:renameRequest', workspaceId, collectionId, requestId, newName),

    moveRequest: (
      workspaceId: string,
      sourceCollectionId: string,
      requestId: string,
      targetCollectionId: string,
      targetParentId: string | null,
      targetIndex: number,
    ) => ipcRenderer.invoke(
      'workspace:moveRequest',
      workspaceId,
      sourceCollectionId,
      requestId,
      targetCollectionId,
      targetParentId,
      targetIndex,
    ),

    duplicateRequest: (workspaceId: string, collectionId: string, requestId: string, parentId: string | null) =>
      ipcRenderer.invoke('workspace:duplicateRequest', workspaceId, collectionId, requestId, parentId),
    
    deleteRequest: (workspaceId: string, collectionId: string, requestId: string) =>
      ipcRenderer.invoke('workspace:deleteRequest', workspaceId, collectionId, requestId),
  },

  // Environment operations
  environment: {
    load: (workspaceId: string, fileName: string) =>
      ipcRenderer.invoke('environment:load', workspaceId, fileName),
    
    save: (workspaceId: string, fileName: string, environment: Environment) =>
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
    save: (variables: Record<string, VariableValue>) => ipcRenderer.invoke('globalVariables:save', variables),
  },

    // App settings (settings.json in userData)
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    update: (partial: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', partial),
    getTheme: (): Promise<ThemeSetting | undefined> => ipcRenderer.invoke('settings:getTheme'),
    setTheme: (theme: ThemeSetting): Promise<AppSettings> => ipcRenderer.invoke('settings:setTheme', theme),
    getWorkspaceSecrets: (workspaceId: string): Promise<WorkspaceSecrets | undefined> => ipcRenderer.invoke('settings:getWorkspaceSecrets', workspaceId),
    setWorkspaceSecrets: (workspaceId: string, secrets: WorkspaceSecrets): Promise<AppSettings> => ipcRenderer.invoke('settings:setWorkspaceSecrets', workspaceId, secrets),
  },

  // Session management (sessions.json in userData)
  session: {
    get: (workspaceId: string) => ipcRenderer.invoke('session:get', workspaceId),
    save: (workspaceId: string, session: WorkspaceSession) => ipcRenderer.invoke('session:save', workspaceId, session),
    update: (workspaceId: string, updates: Partial<WorkspaceSession>) => ipcRenderer.invoke('session:update', workspaceId, updates),
  },

  // Runner - execution-based architecture
  runner: {
    runRequest: (params: RunRequestParams) => ipcRenderer.invoke('runner:runRequest', params),
    runCollection: (params: RunCollectionParams) => ipcRenderer.invoke('runner:runCollection', params),
    stopRun: (executionId: string) => ipcRenderer.invoke('runner:stopRun', executionId),
    getStatus: (runId: string): Promise<RunnerExecutionState | null> => ipcRenderer.invoke('runner:getStatus', runId),
    
    onExecutionEvent: (callback: (event: ExecutionEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, executionEvent: ExecutionEvent): void => callback(executionEvent);
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
    scan: (): Promise<ScannedPlugin[]> => ipcRenderer.invoke('plugins:scan'),
    /**
     * Check whether npm and git are available on the system PATH.
     * Returns { npm: string|null, git: string|null } where string is the version.
     */
    checkTools: (): Promise<{ npm: string | null; git: string | null }> =>
      ipcRenderer.invoke('plugins:checkTools'),
    /**
     * Install a plugin by npm package name.
     * Returns { success: true } or { success: false, error: string }.
     */
    install: (packageNameOrUrl: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('plugins:install', packageNameOrUrl),
    remove: (pluginName: string) => ipcRenderer.invoke('plugins:remove', pluginName),
    searchMarketplace: (query: string, type?: ApiquestMetadata['type'] | 'all'): Promise<MarketplacePlugin[]> => ipcRenderer.invoke('plugins:searchMarketplace', query, type),
  },

  ai: {
    isConfigured: (): Promise<boolean> => ipcRenderer.invoke('ai:isConfigured'),
    complete: (request: AICompletionRequest): Promise<AICompletionResponse> => ipcRenderer.invoke('ai:complete', request),
  },

  /**
   * Plugin host bridge — generic relay for all plugin types.
   * Each method receives the plugin's npm package name as the first argument.
   * The main process uses it to scope file grants and handler dispatch.
   */
  host: {
    showOpenDialog: (packageName: string, options: {
      kind?: 'file' | 'directory';
      title?: string;
      buttonLabel?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
      multiSelections?: boolean;
    }): Promise<string[] | null> =>
      ipcRenderer.invoke('host:showOpenDialog', packageName, options),

    readFile: (packageName: string, filePath: string): Promise<string> =>
      ipcRenderer.invoke('host:readFile', packageName, filePath),

    fetchText: (packageName: string, url: string, options?: { headers?: Record<string, string> }): Promise<string> =>
      ipcRenderer.invoke('host:fetchText', packageName, url, options),

    invoke: <T = unknown>(packageName: string, action: string, payload?: unknown): Promise<T> =>
      ipcRenderer.invoke('host:invoke', packageName, action, payload),

    /**
     * Tier 3 — Subscribe to interaction requests pushed from main.
     * The callback receives the full request object containing requestId,
     * packageName, promptKey, and payload.
      * Returns an unsubscribe function.
      */
    onInteractionRequest: (callback: (req: PluginInteractionRequest) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, req: unknown): void =>
        callback(req as PluginInteractionRequest);
      ipcRenderer.on('host:interaction:request', handler);
      return () => ipcRenderer.off('host:interaction:request', handler);
    },

    /**
     * Tier 3 — Send the user's interaction response back to the main process.
     * Called by PluginInteractionService after the user submits or cancels.
      */
    sendInteractionResponse: (response: PluginInteractionResponse): void => {
      ipcRenderer.send('host:interaction:response', response);
    },
  },
};

contextBridge.exposeInMainWorld('quest', api);
