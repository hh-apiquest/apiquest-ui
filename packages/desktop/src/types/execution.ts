// Execution types - shared between main and renderer processes

/**
 * ExecutionEvent - Generic event emitted during execution
 * Supports both standard runner events and custom plugin events
 */
export interface ExecutionEvent {
  type: string;              // RunnerEvent or custom plugin event type (e.g., 'websocket:message', 'sse:chunk')
  executionId: string;       // Links event to specific execution
  timestamp: number;
  data: any;                 // Event payload (structure depends on event type)
}

/**
 * RunRequestParams - Parameters for executing a single request
 */
export interface RunRequestParams {
  executionId: string;
  workspaceId: string;
  collectionId: string;
  protocol: string;
  request: any;              // Modified request object (type from fracture)
  variables?: {
    collection?: Record<string, string>;
    environment?: Record<string, string>;
    global?: Record<string, string>;
  };
  options?: any;             // RuntimeOptions from fracture
}

/**
 * RunRequestResult - Result from executing a request
 */
export interface RunRequestResult {
  executionId: string;
  protocol: string;
  response: any;             // ProtocolResponse (generic, plugin-specific)
  timestamp: number;
}

/**
 * ExecutionData - Stored in Tab for each request execution
 * Persists response and events across tab changes
 */
export interface ExecutionData {
  executionId: string;
  status: 'idle' | 'running' | 'complete' | 'error';
  startTime: number;
  endTime?: number;
  
  // Generic result from plugin (plugin interprets structure)
  result?: any;              // Return value from IProtocolPlugin.execute()
  
  // Event stream collected during execution
  events: ExecutionEvent[];
  
  // Error information (if status === 'error')
  error?: string;
}

/**
 * ExecutionInfo - Internal state tracked by RunnerService
 * Used for managing active executions in main process
 */
export interface ExecutionInfo {
  id: string;
  runner: any;               // CollectionRunner instance (any to avoid circular dependency)
  type: 'request' | 'collection';
  sourceId: string;          // requestId or collectionId
  startTime: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  abortController?: AbortController;  // For cancelling executions
}
