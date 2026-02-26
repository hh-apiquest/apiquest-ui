import type { Workspace } from './workspace';
import type { Collection } from './request';
import type { Variable } from './environment';
import type { ScannedPlugin } from '../../main/handlers/plugins.js';
import type { AppSettings } from '../../main/SettingsService.js';
import type { ExecutionEvent, RunRequestParams, RunRequestResult } from '../../types/execution.js';
import type { ApiquestMetadata } from '@apiquest/plugin-ui-types';

export interface MarketplacePlugin {
  name: string;
  version: string;
  description: string;
  apiquest?: ApiquestMetadata;
  repository?: string;
  homepage?: string;
  author?: string;
}

// Single source of truth for the preload API exposed as window.quest
// Do not redeclare window.quest in individual files; import types and use this declaration.

export type WorkspaceMetadata = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
};

export type WorkspaceWithMetadata = {
  path: string;
  metadata: WorkspaceMetadata | null;
};

// Individual resource's unsaved state (stored in session)
export type ResourceSessionState = {
  name?: string;
  description?: string;
  data?: any;
  auth?: any; // Auth configuration (Auth type from fracture)
  // Scripts for requests
  preRequestScript?: string;
  postRequestScript?: string;
  // Scripts for folders
  folderPreScript?: string;
  folderPostScript?: string;
  // Scripts for collections
  collectionPreScript?: string;
  collectionPostScript?: string;
  // Execution control for requests
  dependsOn?: string[];
  condition?: string;
  // Full resource snapshot (request/collection/folder). Used for restoring unsaved edits.
  snapshot?: any;
};

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

// Runner configuration
export interface RunConfig {
  // Basic configuration
  environmentId?: string;
  
  // Iterations (dual purpose like CLI)
  iterations: number;  // Number of iterations (limits data rows if data provided, otherwise number of runs)
  delay?: number;  // Delay between requests in ms (default: 0)
  
  // Test Data options
  dataFile?: string;  // CSV/JSON iteration data file path (selected via file dialog)
  disableCollectionTestData?: boolean;  // Ignore collection.testData if no dataFile provided (default: false)
  // Note: iterations limits how many data rows are used
  
  // Parallel execution
  parallel?: boolean;  // Enable parallel execution (only if collection allows)
  concurrency?: number;  // Number of parallel requests
  
  // Advanced options (like Postman & CLI)
  saveResponses?: boolean;  // Save response bodies (default: false)
  persistVariables?: boolean;  // Save variable changes after run (default: false)
  bail?: boolean;  // Stop run on first failure (CLI: --bail, default: false)
  disableLogs?: boolean;  // Suppress console logs (CLI: --silent, default: false)
  timeout?: number;  // Request timeout in ms (CLI: --timeout, default: undefined = no override)
  insecure?: boolean;  // Disable SSL certificate validation (CLI: --insecure, default: false)
}

// Runner execution state
export interface RunnerExecutionState {
  runId: string;
  runNumber: number;
  collectionId: string;
  collectionName: string;
  selectedRequests: string[];
  config: RunConfig;
  status: 'pending' | 'running' | 'completed' | 'stopped' | 'error';
  startedAt?: Date;
  completedAt?: Date;
  progress?: any;
  results?: any;
}

// Collection run parameters
export interface RunCollectionParams {
  runId: string;
  workspaceId: string;
  collectionId: string;
  selectedRequests: string[];
  config: RunConfig;
}

export type WorkspaceSession = {
  lastAccessed: string;
  tabs: {
    openTabs: TabSessionInfo[];
    activeTabId: string | null;
  };
  sidebar: {
    expandedFolders: Record<string, string[]>;
  };
  resources: {
    [resourceId: string]: ResourceSessionState;
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
        listWithMetadata: () => Promise<Array<{ path: string; metadata: WorkspaceMetadata | null }>>;
        
        // Collection operations
        loadCollection: (workspaceId: string, collectionId: string) => Promise<Collection>;
        saveCollection: (fworkspaceId: string, collectionId: string, collection: any) => Promise<void>;
        createCollection: (workspaceId: string, name: string, protocol: string) => Promise<string>;
        renameCollection: (workspaceId: string, collectionId: string, newName: string) => Promise<void>;
        duplicateCollection: (workspaceId: string, collectionId: string, newName: string) => Promise<string>;
        deleteCollection: (workspaceId: string, collectionId: string) => Promise<void>;
        updateCollectionVariables: (workspaceId: string, collectionId: string, variables: any) => Promise<void>;
        importCollection: (workspaceId: string) => Promise<string | null>;
        exportCollection: (workspaceId: string, collectionId: string) => Promise<string | null>;
        
        // Folder operations
        addFolder: (workspaceId: string, collectionId: string, folderName: string, parentId: string | null) => Promise<string>;
        renameFolder: (workspaceId: string, collectionId: string, folderId: string, newName: string) => Promise<void>;
        deleteFolder: (workspaceId: string, collectionId: string, folderId: string) => Promise<void>;
        
        // Request operations
        addRequest: (workspaceId: string, collectionId: string, requestName: string, parentId: string | null) => Promise<string>;
        renameRequest: (workspaceId: string, collectionId: string, requestId: string, newName: string) => Promise<void>;
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
        load: () => Promise<Record<string, Variable>>;
        save: (variables: Record<string, Variable>) => Promise<void>;
      };

      // Settings
      settings: {
        getAll: () => Promise<AppSettings>;
        get: (path: string) => Promise<any>;
        update: (partial: AppSettings) => Promise<AppSettings>;
        set: (path: string, value: any) => Promise<AppSettings>;
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
        install: (packageNameOrUrl: string) => Promise<boolean>;
        remove: (pluginName: string) => Promise<boolean>;
        searchMarketplace: (query: string, type?: ApiquestMetadata['type'] | 'all') => Promise<MarketplacePlugin[]>;
      };

      // Runner - execution-based architecture
      runner: {
        runRequest: (params: RunRequestParams) => Promise<RunRequestResult>;
        onExecutionEvent: (callback: (event: ExecutionEvent) => void) => () => void;
        
        // Collection runner methods
        runCollection: (params: RunCollectionParams) => Promise<{ success: boolean; runId: string }>;
        stopRun: (runId: string) => Promise<{ success: boolean }>;
        getRunStatus: (runId: string) => Promise<RunnerExecutionState | null>;
      };
    };
  }
}

export {};
