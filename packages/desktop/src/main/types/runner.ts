export interface RunConfig {
  environmentId?: string;
  iterations: number;
  delay?: number;
  dataFile?: string;
  disableCollectionTestData?: boolean;
  parallel?: boolean;
  concurrency?: number;
  saveResponses?: boolean;
  persistVariables?: boolean;
  bail?: boolean;
  disableLogs?: boolean;
  timeout?: number;
  insecure?: boolean;
}

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
  progress?: unknown;
  results?: unknown;
}

export interface RunCollectionParams {
  runId: string;
  workspaceId: string;
  collectionId: string;
  selectedRequests: string[];
  config: RunConfig;
}
