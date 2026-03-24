import type { Workspace } from './workspace';
import type { Collection } from './request';
import type { VariableValue } from '@apiquest/types';
import type { AppSettings, ThemeSetting, WorkspaceSecrets } from '../../main/SettingsService.js';
import type { ExecutionEvent, RunRequestParams, RunRequestResult } from '../../types/execution.js';
import type { ApiquestMetadata } from '@apiquest/plugin-ui-types';
import type { AICompletionRequest, AICompletionResponse } from '../../main/types/ai.js';
import type { ScannedPlugin, MarketplacePlugin } from '../../main/types/plugins.js';
import type { RunConfig, RunCollectionParams, RunnerExecutionState } from '../../main/types/runner.js';
import type { ImportCollectionParams, ImportCollectionResult, WorkspaceMetadata, WorkspaceWithMetadata } from '../../main/types/workspace.js';
import type { ResourceSessionState, WorkspaceSession } from '../../main/types/session.js';

export type {
  AICompletionRequest,
  AICompletionResponse,
  MarketplacePlugin,
  ResourceSessionState,
  WorkspaceSession,
  RunConfig,
  RunCollectionParams,
  RunnerExecutionState,
  ScannedPlugin,
  WorkspaceMetadata,
  WorkspaceWithMetadata,
};

// Single source of truth for the preload API exposed as window.quest
// Do not redeclare window.quest in individual files; import types and use this declaration.

export type TabSessionInfo = {
  id: string;
  type: 'request' | 'collection' | 'folder' | 'runner';
  collectionId: string;
  resourceId: string;
  protocol: string;
  name: string;
  metadata?: RequestMetadata | CollectionMetadata | FolderMetadata | RunnerMetadata;
  uiState?: {
    activeSubTab?: string;
  };
};

declare global {
  interface Window {
    quest: {
      // Workspace operations
      workspace: {
        // Workspace management
        scan: (folderPath: string) => Promise<Workspace>;
        selectFolder: () => Promise<string | null>;
        getDefaultPath: () => Promise<string>;
        listAll: () => Promise<string[]>;
        create: (name: string, customPath?: string) => Promise<string>;
        getMetadata: (workspacePath: string) => Promise<WorkspaceMetadata | null>;
        updateMetadata: (workspacePath: string, updates: Partial<WorkspaceMetadata>) => Promise<void>;
        listWithMetadata: () => Promise<WorkspaceWithMetadata[]>;
        
        // Collection operations
        loadCollection: (workspaceId: string, collectionId: string) => Promise<Collection>;
        saveCollection: (fworkspaceId: string, collectionId: string, collection: Collection) => Promise<void>;
        createCollection: (workspaceId: string, name: string, protocol: string) => Promise<string>;
        renameCollection: (workspaceId: string, collectionId: string, newName: string) => Promise<void>;
        duplicateCollection: (workspaceId: string, collectionId: string, newName: string) => Promise<string>;
        deleteCollection: (workspaceId: string, collectionId: string) => Promise<void>;
        updateCollectionVariables: (workspaceId: string, collectionId: string, variables: Record<string, VariableValue>) => Promise<void>;
        importCollection: (
          workspaceId: string,
          params?: ImportCollectionParams
        ) => Promise<ImportCollectionResult | null>;
        exportCollection: (workspaceId: string, collectionId: string) => Promise<string | null>;
        
        // Folder operations
        addFolder: (workspaceId: string, collectionId: string, folderName: string, parentId: string | null) => Promise<string>;
        renameFolder: (workspaceId: string, collectionId: string, folderId: string, newName: string) => Promise<void>;
        moveFolder: (workspaceId: string, sourceCollectionId: string, folderId: string, targetCollectionId: string, targetParentId: string | null, targetIndex: number) => Promise<void>;
        deleteFolder: (workspaceId: string, collectionId: string, folderId: string) => Promise<void>;
        
        // Request operations
        addRequest: (workspaceId: string, collectionId: string, requestName: string, parentId: string | null) => Promise<string>;
        renameRequest: (workspaceId: string, collectionId: string, requestId: string, newName: string) => Promise<void>;
        moveRequest: (workspaceId: string, sourceCollectionId: string, requestId: string, targetCollectionId: string, targetParentId: string | null, targetIndex: number) => Promise<void>;
        duplicateRequest: (workspaceId: string, collectionId: string, requestId: string, parentId: string | null) => Promise<string>;
        deleteRequest: (workspaceId: string, collectionId: string, requestId: string) => Promise<void>;
      };

      // Environment operations
      environment: {
        load: (workspaceId: string, fileName: string) => Promise<Environment>;
        save: (workspaceId: string, fileName: string, environment: Environment) => Promise<void>;
        create: (workspaceId: string, name: string) => Promise<void>;
        rename: (workspaceId: string, oldFileName: string, newFileName: string) => Promise<void>;
        delete: (workspaceId: string, fileName: string) => Promise<void>;
        duplicate: (workspaceId: string, sourceFileName: string, newFileName: string) => Promise<void>;
      };

      // Global variables operations
      globalVariables: {
        load: () => Promise<Record<string, VariableValue>>;
        save: (variables: Record<string, VariableValue>) => Promise<void>;
      };

      // Settings
      settings: {
        getAll: () => Promise<AppSettings>;
        update: (partial: Partial<AppSettings>) => Promise<AppSettings>;
        getTheme: () => Promise<ThemeSetting | undefined>;
        setTheme: (theme: ThemeSetting) => Promise<AppSettings>;
        getWorkspaceSecrets: (workspaceId: string) => Promise<WorkspaceSecrets | undefined>;
        setWorkspaceSecrets: (workspaceId: string, secrets: WorkspaceSecrets) => Promise<AppSettings>;
      };

      // Session
      session: {
        get: (workspaceId: string) => Promise<WorkspaceSession | null>;
        save: (workspaceId: string, session: WorkspaceSession) => Promise<void>;
        update: (workspaceId: string, updates: Partial<WorkspaceSession>) => Promise<void>;
      };

      // Window controls
      window: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
      };

      // Plugin management
      plugins: {
        ensureDevInstalled: () => Promise<void>;
        scan: () => Promise<ScannedPlugin[]>;
        /** Check whether npm (bundled) and git (system) are available. */
        checkTools: () => Promise<{ npm: string | null; git: string | null }>;
        /** Install a plugin from npm. Returns { success } or { success: false, error }. */
        install: (packageNameOrUrl: string) => Promise<{ success: boolean; error?: string }>;
        remove: (pluginName: string) => Promise<boolean>;
        searchMarketplace: (query: string, type?: ApiquestMetadata['type'] | 'all') => Promise<MarketplacePlugin[]>;
      };

      ai: {
        isConfigured: () => Promise<boolean>;
        complete: (request: AICompletionRequest) => Promise<AICompletionResponse>;
      };

      /**
       * Plugin host bridge — generic relay for privileged plugin operations.
       * Each method is scoped to the calling plugin's npm package name.
       * Renderer plugin code must not call this directly; use PluginUIContext.host instead.
       * PluginInteractionService uses onInteractionRequest / sendInteractionResponse.
       */
      host: {
        showOpenDialog(packageName: string, options: {
          kind?: 'file' | 'directory';
          title?: string;
          buttonLabel?: string;
          filters?: Array<{ name: string; extensions: string[] }>;
          multiSelections?: boolean;
        }): Promise<string[] | null>;
        readFile(packageName: string, filePath: string): Promise<string>;
        fetchText(packageName: string, url: string, options?: { headers?: Record<string, string> }): Promise<string>;
        invoke<T = unknown>(packageName: string, action: string, payload?: unknown): Promise<T>;

        /**
         * Tier 3 — Subscribe to interaction requests pushed from main.
         * Each request contains a requestId, packageName, promptKey, and payload.
         * Call sendInteractionResponse with the same requestId to unblock the main-process handler.
         * Returns an unsubscribe function.
         */
        onInteractionRequest(callback: (req: {
          requestId: string;
          packageName: string;
          promptKey: string;
          payload: unknown;
        }) => void): () => void;

        /**
         * Tier 3 — Send the user's interaction response back to main.
         * Called by PluginInteractionService after submit or cancel.
         */
        sendInteractionResponse(response: {
          requestId: string;
          ok: boolean;
          value?: unknown;
          reason?: 'cancelled' | 'dismissed' | 'timeout' | 'renderer-unavailable';
        }): void;
      };

      // Runner - execution-based architecture
      runner: {
        runRequest: (params: RunRequestParams) => Promise<RunRequestResult>;
        onExecutionEvent: (callback: (event: ExecutionEvent) => void) => () => void;
        
        // Collection runner methods
        runCollection: (params: RunCollectionParams) => Promise<{ success: boolean; runId: string }>;
        stopRun: (executionId: string) => Promise<{ success: boolean }>;
        getRunStatus: (runId: string) => Promise<RunnerExecutionState | null>;
      };
    };
  }
}

export {};
