import type { Collection, Environment, VariableValue } from '@apiquest/types';
import type { ApiquestMetadata } from '@apiquest/plugin-ui-types';
import type { AppSettings } from '../SettingsService.js';
import type { AICompletionRequest, AICompletionResponse } from './ai.js';
import type { QuestHostApi } from './host.js';
import type { MarketplacePlugin, ScannedPlugin } from './plugins.js';
import type { RunCollectionParams, RunnerExecutionState } from './runner.js';
import type {
  ImportCollectionParams,
  ImportCollectionResult,
  WorkspaceCollectionVariables,
  WorkspaceMetadata,
  WorkspaceWithMetadata,
} from './workspace.js';
import type { ExecutionEvent, RunRequestParams, RunRequestResult } from '../../types/execution.js';

export interface QuestApi {
  workspace: {
    scan(folderPath: string): Promise<unknown>;
    selectFolder(): Promise<string | null>;
    getDefaultPath(): Promise<string>;
    listAll(): Promise<string[]>;
    create(name: string, customPath?: string): Promise<string>;
    getMetadata(workspacePath: string): Promise<WorkspaceMetadata | null>;
    updateMetadata(workspacePath: string, updates: Partial<WorkspaceMetadata>): Promise<void>;
    listWithMetadata(): Promise<WorkspaceWithMetadata[]>;
    loadCollection(workspaceId: string, collectionId: string): Promise<Collection>;
    saveCollection(workspaceId: string, collectionId: string, collection: Collection): Promise<void>;
    createCollection(workspaceId: string, name: string, protocol: string): Promise<string>;
    renameCollection(workspaceId: string, collectionId: string, newName: string): Promise<void>;
    duplicateCollection(workspaceId: string, collectionId: string, newName: string): Promise<string>;
    deleteCollection(workspaceId: string, collectionId: string): Promise<void>;
    updateCollectionVariables(workspaceId: string, collectionId: string, variables: WorkspaceCollectionVariables): Promise<void>;
    importCollection(workspaceId: string, params?: ImportCollectionParams): Promise<ImportCollectionResult | null>;
    exportCollection(workspaceId: string, collectionId: string): Promise<string | null>;
    addFolder(workspaceId: string, collectionId: string, folderName: string, parentId: string | null): Promise<string>;
    renameFolder(workspaceId: string, collectionId: string, folderId: string, newName: string): Promise<void>;
    moveFolder(workspaceId: string, sourceCollectionId: string, folderId: string, targetCollectionId: string, targetParentId: string | null, targetIndex: number): Promise<void>;
    deleteFolder(workspaceId: string, collectionId: string, folderId: string): Promise<void>;
    addRequest(workspaceId: string, collectionId: string, requestName: string, parentId: string | null): Promise<string>;
    renameRequest(workspaceId: string, collectionId: string, requestId: string, newName: string): Promise<void>;
    moveRequest(workspaceId: string, sourceCollectionId: string, requestId: string, targetCollectionId: string, targetParentId: string | null, targetIndex: number): Promise<void>;
    duplicateRequest(workspaceId: string, collectionId: string, requestId: string, parentId: string | null): Promise<string>;
    deleteRequest(workspaceId: string, collectionId: string, requestId: string): Promise<void>;
  };
  environment: {
    load(workspaceId: string, fileName: string): Promise<Environment>;
    save(workspaceId: string, fileName: string, environment: Environment): Promise<void>;
    create(workspaceId: string, name: string): Promise<void>;
    rename(workspaceId: string, oldFileName: string, newFileName: string): Promise<void>;
    delete(workspaceId: string, fileName: string): Promise<void>;
    duplicate(workspaceId: string, sourceFileName: string, newFileName: string): Promise<void>;
  };
  globalVariables: {
    load(): Promise<Record<string, VariableValue>>;
    save(variables: Record<string, VariableValue>): Promise<void>;
  };
  settings: {
    getAll(): Promise<AppSettings>;
    get(path: string): Promise<unknown>;
    update(partial: AppSettings): Promise<AppSettings>;
    set(path: string, value: unknown): Promise<AppSettings>;
  };
  session: {
    get(workspaceId: string): Promise<unknown>;
    save(workspaceId: string, session: unknown): Promise<void>;
    update(workspaceId: string, updates: unknown): Promise<void>;
  };
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
  };
  plugins: {
    ensureDevInstalled(): Promise<void>;
    scan(): Promise<ScannedPlugin[]>;
    checkTools(): Promise<{ npm: string | null; git: string | null }>;
    install(packageNameOrUrl: string): Promise<{ success: boolean; error?: string }>;
    remove(pluginName: string): Promise<boolean>;
    searchMarketplace(query: string, type?: ApiquestMetadata['type'] | 'all'): Promise<MarketplacePlugin[]>;
  };
  ai: {
    isConfigured(): Promise<boolean>;
    complete(request: AICompletionRequest): Promise<AICompletionResponse>;
  };
  host: QuestHostApi;
  runner: {
    runRequest(params: RunRequestParams): Promise<RunRequestResult>;
    onExecutionEvent(callback: (event: ExecutionEvent) => void): () => void;
    runCollection(params: RunCollectionParams): Promise<{ success: boolean; runId: string }>;
    stopRun(executionId: string): Promise<{ success: boolean }>;
    getStatus(runId: string): Promise<RunnerExecutionState | null>;
  };
}
