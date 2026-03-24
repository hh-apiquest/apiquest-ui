import type { RequestBadge } from '@apiquest/plugin-ui-types';
import type { RunConfig } from './runner.js';

export interface ResourceSessionState {
  name?: string;
  description?: string;
  data?: unknown;
  auth?: unknown;
  preRequestScript?: string;
  postRequestScript?: string;
  folderPreScript?: string;
  folderPostScript?: string;
  collectionPreScript?: string;
  collectionPostScript?: string;
  dependsOn?: string[];
  condition?: string;
  snapshot?: unknown;
  _ui?: Record<string, unknown>;
}

export interface SessionRequestMetadata {
  badge?: RequestBadge;
  description?: string;
}

export interface SessionRunnerMetadata {
  runId: string;
  runNumber: number;
  collectionId: string;
  collectionName: string;
  selectedRequests: string[];
  config: RunConfig;
  status: 'pending' | 'running' | 'completed' | 'stopped' | 'error';
  startedAt?: Date;
  completedAt?: Date;
}

export type SessionTabMetadata = SessionRequestMetadata | SessionRunnerMetadata;

export interface TabSessionInfo {
  id: string;
  type: 'request' | 'collection' | 'folder' | 'runner';
  collectionId: string;
  resourceId: string;
  protocol: string;
  name: string;
  metadata?: SessionTabMetadata;
  uiState?: {
    activeSubTab?: string;
  };
}

export interface WorkspaceSession {
  lastAccessed: string;
  tabs: {
    openTabs: TabSessionInfo[];
    activeTabId: string | null;
  };
  sidebar: {
    expandedFolders: Record<string, string[]>;
  };
  resources: Record<string, ResourceSessionState>;
}

export interface SessionsData {
  sessions: Record<string, WorkspaceSession>;
}
