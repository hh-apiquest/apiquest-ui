// Execution types - shared between main and renderer processes

import type {
  VariableValue,
  Request,
  ProtocolResponse,
  RuntimeOptions,
  LogLevel,
  RunnerEvent,
  EventPayloads
} from '@apiquest/types';
import type { CollectionRunner } from '@apiquest/fracture';

type ExecutionEventDataShape = Record<string, unknown> & {
  id?: string;
  path?: string;
  protocol?: string;
  runId?: string;
  request?: Request;
  response?: ProtocolResponse;
  duration?: number;
  iteration?: {
    current?: number;
    total?: number;
  };
  test?: {
    name?: string;
    passed?: boolean;
    error?: string;
  };
  error?: unknown;
  requestId?: string;
  requestName?: string;
  success?: boolean;
  message?: string;
  level?: LogLevel;
  result?: {
    skipped?: boolean;
    error?: unknown;
    [key: string]: unknown;
  };
};

type KnownRunnerExecutionEvent = {
  [T in RunnerEvent]: {
    type: T;
    executionId: string;
    timestamp: number;
    data: EventPayloads[T] & ExecutionEventDataShape;
  }
}[RunnerEvent];

type AdditionalExecutionEvent = {
  type: 'requestStarted' | 'requestCompleted' | 'runnerError' | 'runnerStopped' | 'error';
  executionId: string;
  timestamp: number;
  data: ExecutionEventDataShape;
};

type UnknownExecutionEvent = {
  type: string;
  executionId: string;
  timestamp: number;
  data: ExecutionEventDataShape;
};

/**
 * ExecutionEvent - Generic event emitted during execution
 * Supports both strict runner events and custom plugin events
 */
export type ExecutionEvent = KnownRunnerExecutionEvent | {
  type: `${string}:${string}`; // Custom plugin event (e.g., websocket:message)
  executionId: string;
  timestamp: number;
  data: ExecutionEventDataShape;
} | AdditionalExecutionEvent | UnknownExecutionEvent;

/**
 * RunRequestParams - Parameters for executing a single request
 */
export interface RunRequestParams {
  executionId: string;
  workspaceId: string;
  collectionId: string;
  protocol: string;
  request: Request;          // Modified request object
  variables?: {
    collection?: Record<string, VariableValue>;
    environment?: Record<string, VariableValue>;
    global?: Record<string, VariableValue>;
  };
  options?: RuntimeOptions;             // RuntimeOptions from fracture
}

/**
 * RunRequestResult - Result from executing a request
 */
export interface RunRequestResult {
  executionId: string;
  protocol: string;
  response: ProtocolResponse;             // ProtocolResponse (generic, plugin-specific)
  timestamp: number;
}

/**
 * ExecutionData - Stored in Tab for each request execution
 * Persists response and events across tab changes
 */
export interface ExecutionData {
  executionId: string;
  status: 'idle' | 'running' | 'complete' | 'error' | 'cancelled';
  startTime: number;
  endTime?: number;
  
  // Generic result from plugin (plugin interprets structure)
  result?: ProtocolResponse | null;
  
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
  runner: CollectionRunner;
  type: 'request' | 'collection';
  sourceId: string;          // requestId or collectionId
  startTime: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  abortController?: AbortController;  // For cancelling executions
}
