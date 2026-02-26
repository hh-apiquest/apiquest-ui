import { CollectionRunner } from '@apiquest/fracture';
import type { Request, Collection, RunOptions, CollectionItem, Folder } from '@apiquest/types';
import type { ExecutionInfo, ExecutionEvent, RunRequestParams } from '../types/execution.js';
import type { RunCollectionParams, RunnerExecutionState } from '../renderer/types/quest.js';
import path from 'path';
import { app, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { workspaceRegistry, collectionRegistry } from './handlers/workspace.js';

class RunnerService {
  private pluginsDir: string;
  private activeExecutions: Map<string, ExecutionInfo> = new Map();
  private activeCollectionRuns: Map<string, RunnerExecutionState> = new Map();
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    // Store plugins directory but don't create runners yet (lazy init)
    this.pluginsDir = path.join(app.getPath('userData'), 'plugins');
  }
  
  /**
   * Set main window for IPC event streaming
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }
  
  /**
   * Stream execution event to renderer
   */
  private streamEvent(event: ExecutionEvent): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('execution:event', event);
    }
  }
  
  /**
   * Cleanup execution after completion
   */
  private cleanupExecution(executionId: string): void {
    this.activeExecutions.delete(executionId);
    console.log(`[RunnerService] Cleaned up execution: ${executionId}`);
  }

  private async loadCollection(workspaceId: string, collectionId: string): Promise<Collection> {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    const fileName = collectionRegistry.get(collectionId);
    if (!fileName) throw new Error(`Collection not found: ${collectionId}`);
    
    const collectionPath = path.join(workspacePath, 'collections', fileName);
    const content = await fs.readFile(collectionPath, 'utf-8');
    return JSON.parse(content);
  }

  private async loadEnvironment(workspaceId: string, environmentId: string): Promise<Record<string, string>> {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    // Add .json extension if not present
    const environmentPath = path.join(workspacePath, 'environments', `${environmentId}.json`);
    try {
      const content = await fs.readFile(environmentPath, 'utf-8');
      const environment = JSON.parse(content);
      
      // Convert variables array to object for runner
      const variables: Record<string, string> = {};
      if (environment.variables && Array.isArray(environment.variables)) {
        for (const variable of environment.variables) {
          if (variable.key && variable.enabled !== false) {
            variables[variable.key] = variable.value || '';
          }
        }
      }
      
      return variables;
    } catch (error) {
      console.warn(`[RunnerService] Failed to load environment ${environmentId}:`, error);
      return {};
    }
  }

  private async loadGlobalVariables(): Promise<Record<string, string>> {
    const userDataPath = app.getPath('userData');
    const globalVarsPath = path.join(userDataPath, 'global-variables.json');
    
    try {
      const content = await fs.readFile(globalVarsPath, 'utf-8');
      const globalVars = JSON.parse(content);
      
      // Convert variables object to simple key-value pairs for runner
      const variables: Record<string, string> = {};
      for (const [key, variable] of Object.entries(globalVars)) {
        if (typeof variable === 'object' && variable !== null) {
          const varObj = variable as any;
          if (varObj.enabled !== false) {
            variables[key] = varObj.value || '';
          }
        }
      }
      
      return variables;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {};
      }
      console.warn('[RunnerService] Failed to load global variables:', error);
      return {};
    }
  }

  /**
   * Find request and its parent chain in collection tree
   */
  private findRequestPath(items: CollectionItem[], requestId: string, currentPath: CollectionItem[] = []): CollectionItem[] | null {
    for (const item of items) {
      if (item.type === 'request' && item.id === requestId) {
        return [...currentPath, item];
      }
      
      if (item.type === 'folder') {
        const found = this.findRequestPath(item.items, requestId, [...currentPath, item]);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Build ephemeral collection containing only request and its parent chain + dependencies(todo)
   */
  private buildEphemeralCollection(collection: Collection, modifiedRequest: Request): Collection {
    // Find request path in original collection
    const path = this.findRequestPath(collection.items, modifiedRequest.id);
    if (!path) {
      throw new Error(`Request ${modifiedRequest.id} not found in collection ${collection.info.id}`);
    }
    
    // Build minimal tree with only the request's parent chain
    let items: CollectionItem[] = [];
    
    // Rebuild tree from path (excluding the request itself, we'll add modified version)
    const folders = path.filter(item => item.type === 'folder') as Folder[];
    
    if (folders.length > 0) {
      // Build nested folder structure
      let currentLevel: CollectionItem[] = items;
      
      for (let i = 0; i < folders.length; i++) {
        const folder = folders[i];
        const folderCopy: Folder = {
          type: 'folder',
          id: folders[i].id,
          name: folder.name,
          description: folder.description,
          auth: folder.auth,
          folderPreScript: folder.folderPreScript,
          folderPostScript: folder.folderPostScript,
          preRequestScript: folder.preRequestScript,
          postRequestScript: folder.postRequestScript,
          options: folder.options,
          items: []
        };
        
        currentLevel.push(folderCopy);
        currentLevel = folderCopy.items;
      }
      
      // Add modified request to deepest folder
      currentLevel.push(modifiedRequest);
    } else {
      // Request is at root level
      items = [modifiedRequest];
    }
    
    return {
      ...(collection.$schema && { $schema: collection.$schema }),
      info: {
        id: `${collection.info.id}-ephemeral`,
        name: `${collection.info.name} (Single Request)`,
        version: collection.info.version,
        description: collection.info.description
      },
      protocol: collection.protocol,
      ...(collection.auth && { auth: collection.auth }),
      ...(collection.variables && { variables: collection.variables }),
      ...(collection.collectionPreScript?.trim() && { collectionPreScript: collection.collectionPreScript }),
      ...(collection.collectionPostScript?.trim() && { collectionPostScript: collection.collectionPostScript }),
      ...(collection.preRequestScript?.trim() && { preRequestScript: collection.preRequestScript }),
      ...(collection.postRequestScript?.trim() && { postRequestScript: collection.postRequestScript }),
      ...(collection.testData && { testData: collection.testData }),
      ...(collection.options && { options: collection.options }),
      items
    };
  }

  /**
   * Execute a single request in collection context using ephemeral collection
   */
  async executeRequest(params: RunRequestParams) {
    const { executionId, protocol, request, variables, workspaceId, collectionId } = params;
    
    const collection = await this.loadCollection(workspaceId, collectionId);
    
    console.log('[RunnerService] Loaded collection:', {
      id: collection.info.id,
      collectionPreScript: collection.collectionPreScript,
      collectionPreScriptType: typeof collection.collectionPreScript,
      collectionPreScriptLength: collection.collectionPreScript?.length,
      hasCollectionPreScript: !!collection.collectionPreScript
    });
    
    // Create fresh runner for this execution (ensures plugins are freshly loaded after devinstaller)
    const runner = new CollectionRunner({ pluginsDir: this.pluginsDir });
    
    // Store execution info
    this.activeExecutions.set(executionId, {
      id: executionId,
      runner,
      type: 'request',
      sourceId: request.id,
      startTime: Date.now(),
      status: 'running'
    });
    
    // Subscribe to ALL runner events (standard + custom) and stream to renderer
    const unsubscribe = runner.onAll((eventType, data) => {
      const enrichedData = data && typeof data === 'object' 
        ? { ...data, protocol } 
        : { data, protocol };
      
      this.streamEvent({
        type: eventType,
        executionId,
        timestamp: Date.now(),
        data: enrichedData
      });
    });
    
    try {
      const ephemeralCollection = this.buildEphemeralCollection(collection, request);
      
      console.log('[RunnerService] Built ephemeral collection:', {
        id: ephemeralCollection.info.id,
        collectionPreScript: ephemeralCollection.collectionPreScript,
        collectionPreScriptType: typeof ephemeralCollection.collectionPreScript,
        collectionPreScriptLength: ephemeralCollection.collectionPreScript?.length,
        hasCollectionPreScript: !!ephemeralCollection.collectionPreScript,
        allKeys: Object.keys(ephemeralCollection)
      });
      
      const runResult = await runner.run(ephemeralCollection, {
        environment: variables?.environment ? {
          name: 'Active Environment',
          variables: variables.environment
        } : undefined,
        globalVariables: variables?.global
      });

      // Mark execution as completed
      const execution = this.activeExecutions.get(executionId);
      if (execution) {
        execution.status = 'completed';
      }

      const requestResult = runResult.requestResults[0];
      
      console.log('[RunnerService] Request completed:', {
        hasResult: !!requestResult,
        hasResponse: !!requestResult?.response,
        responseKeys: requestResult?.response ? Object.keys(requestResult.response) : [],
        response: requestResult?.response
      });
      
      return {
        executionId,
        protocol,
        response: requestResult.response,
        timestamp: Date.now()
      };
    } catch (error) {
      // Mark execution as failed
      const execution = this.activeExecutions.get(executionId);
      if (execution) {
        execution.status = 'failed';
      }
      
      throw error;
    } finally {
      // Cleanup: unsubscribe from all events and remove execution
      unsubscribe();
      this.cleanupExecution(executionId);
    }
  }

  /**
   * Filter collection items to include only selected requests and their parents
   */
  private filterCollectionItems(items: CollectionItem[], selectedRequestIds: string[]): CollectionItem[] {
    const filtered: CollectionItem[] = [];
    
    for (const item of items) {
      if (item.type === 'request') {
        // Include request if selected
        if (selectedRequestIds.includes(item.id)) {
          filtered.push(item);
        }
      } else if (item.type === 'folder') {
        // Recursively filter folder items
        const folderFiltered = this.filterCollectionItems(item.items, selectedRequestIds);
        
        // Include folder only if it has filtered items
        if (folderFiltered.length > 0) {
          filtered.push({
            ...item,
            items: folderFiltered
          });
        }
      }
    }
    
    return filtered;
  }

  /**
   * Execute collection run with filtering
   */
  async executeCollection(params: RunCollectionParams): Promise<{ success: boolean; runId: string }> {
    const { runId, workspaceId, collectionId, selectedRequests, config } = params;
    
    // Load collection
    const collection = await this.loadCollection(workspaceId, collectionId);
    
    // Filter collection to only include selected requests
    const filteredItems = selectedRequests.length > 0 
      ? this.filterCollectionItems(collection.items, selectedRequests)
      : collection.items;
    
    const filteredCollection: Collection = {
      ...collection,
      items: filteredItems
    };
    
    console.log(`[RunnerService] Starting collection run ${runId}:`, {
      collectionId,
      totalRequests: selectedRequests.length,
      iterations: config.iterations,
      environmentId: config.environmentId
    });
    
    // Create fresh runner for this execution
    const runner = new CollectionRunner({ pluginsDir: this.pluginsDir });
    
    // Initialize run state
    const runState: RunnerExecutionState = {
      runId,
      runNumber: 1,
      collectionId,
      collectionName: collection.info.name,
      selectedRequests,
      config,
      status: 'running',
      startedAt: new Date()
    };
    
    this.activeCollectionRuns.set(runId, runState);
    
    // Create abort controller for this execution
    const abortController = new AbortController();
    
    // Store execution info for tracking
    this.activeExecutions.set(runId, {
      id: runId,
      runner,
      type: 'collection',
      sourceId: collectionId,
      startTime: Date.now(),
      status: 'running',
      abortController
    });
    
    // Subscribe to ALL runner events and forward with runId and protocol
    const unsubscribe = runner.onAll((eventType, data) => {
      // Stream event to renderer with runId and protocol attached
      const enrichedData = typeof data === 'object' && data !== null
        ? { ...data, runId, protocol: collection.protocol }
        : { originalData: data, runId, protocol: collection.protocol };
      
      this.streamEvent({
        type: eventType,
        executionId: runId,
        timestamp: Date.now(),
        data: enrichedData
      });
    });
    
    // Load variables
    const globalVariables = await this.loadGlobalVariables();
    const environmentVariables = config.environmentId 
      ? await this.loadEnvironment(workspaceId, config.environmentId)
      : undefined;
    
    // Build run options from config
    const runOptions: RunOptions = {
      // Variables
      globalVariables,
      ...(environmentVariables && {
        environment: {
          name: config.environmentId || 'Active Environment',
          variables: environmentVariables
        }
      }),
      
      // Iterations and test data
      iterations: config.iterations,
      ...(config.dataFile && { dataFile: config.dataFile }),  // dataFile is a path string
      ...(config.disableCollectionTestData && { ignoreCollectionTestData: true }),
      
      // Execution options - include parallel execution settings
      ...(config.delay !== undefined || config.bail !== undefined || config.concurrency !== undefined ? {
        execution: {
          ...(config.delay !== undefined ? { delay: config.delay } : {}),
          ...(config.bail !== undefined ? { bail: config.bail } : {}),
          ...(config.concurrency !== undefined ? { maxConcurrency: config.concurrency } : {})
        }
      } : {}),
      
      // Timeout
      ...(config.timeout ? {
        timeout: { request: config.timeout }
      } : {}),
      
      // SSL options
      ...(config.insecure !== undefined ? {
        ssl: {
          validateCertificates: !config.insecure
        }
      } : {}),
      
      // Abort signal for external cancellation
      signal: abortController?.signal,
      
      // Note: saveResponses and persistVariables are handled post-execution
      // Note: strictMode is read from collection.options.strictMode automatically by runner
    };
    
    // Execute collection asynchronously
    (async () => {
      try {
        const result = await runner.run(filteredCollection, runOptions);
        
        // Update run state
        const state = this.activeCollectionRuns.get(runId);
        if (state) {
          state.status = 'completed';
          state.completedAt = new Date();
          state.results = result;
        }
        
        // Update execution info
        const execution = this.activeExecutions.get(runId);
        if (execution) {
          execution.status = 'completed';
        }
        
        console.log(`[RunnerService] Collection run ${runId} completed`);
      } catch (error: any) {
        console.error(`[RunnerService] Collection run ${runId} failed:`, error);
        
        // Update run state
        const state = this.activeCollectionRuns.get(runId);
        if (state) {
          state.status = 'error';
          state.completedAt = new Date();
        }
        
        // Update execution info
        const execution = this.activeExecutions.get(runId);
        if (execution) {
          execution.status = 'failed';
        }
        
        // Send error event
        this.streamEvent({
          type: 'runnerError',
          executionId: runId,
          timestamp: Date.now(),
          data: {
            runId,
            error: error.message || String(error)
          }
        });
      } finally {
        // Cleanup
        unsubscribe();
        // Note: Keep run state for status queries, cleanup on stopRun or after timeout
      }
    })();
    
    return { success: true, runId };
  }

  /**
   * Stop an active collection run
   */
  async stopRun(runId: string): Promise<{ success: boolean }> {
    const execution = this.activeExecutions.get(runId);
    const state = this.activeCollectionRuns.get(runId);
    
    if (!execution || !state) {
      console.warn(`[RunnerService] Cannot stop run ${runId}: not found`);
      return { success: false };
    }
    
    console.log(`[RunnerService] Stopping run ${runId}`);
    
    // Abort the execution
    if (execution.abortController) {
      execution.abortController.abort('User cancelled execution');
    }
    
    // Update state
    state.status = 'stopped';
    state.completedAt = new Date();
    execution.status = 'cancelled';
    
    // Send stop event
    this.streamEvent({
      type: 'runnerStopped',
      executionId: runId,
      timestamp: Date.now(),
      data: {
        runId
      }
    });
    
    // Cleanup
    this.activeExecutions.delete(runId);
    
    // Keep state for a bit so UI can query final status
    setTimeout(() => {
      this.activeCollectionRuns.delete(runId);
    }, 5000);
    
    return { success: true };
  }

  /**
   * Get current status of a collection run
   */
  async getRunStatus(runId: string): Promise<RunnerExecutionState | null> {
    const state = this.activeCollectionRuns.get(runId);
    return state || null;
  }
}

export const runnerService = new RunnerService();
