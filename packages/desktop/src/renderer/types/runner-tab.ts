import type { Collection, CollectionItem } from '@apiquest/types';
import type { RunConfig } from '../../main/types/runner';
import type { Workspace } from './workspace';

export type { RunConfig } from '../../main/types/runner';

export interface RunnerTabConfig {
  environmentId?: string;
  iterations: number;
  delay: number;
  parallel: boolean;
  concurrency: number;
  allowParallel: boolean;
  maxConcurrency?: number;
  dataFile?: File | null;
  persistVariables: boolean;
  saveResponses: boolean;
}

export interface RunnerState {
  selectedRequests: string[];
  config: Omit<RunnerTabConfig, 'dataFile'>;
}

export type RunnerCollection = Collection & {
  _runnerState?: RunnerState;
};

export type RunnerCollectionUpdate = RunnerCollection & {
  _runnerState: RunnerState;
};

export type RunnerCollectionItem = CollectionItem;

export interface RunnerTabRunPayload {
  collectionId: string;
  collectionName: string;
  protocol: string;
  selectedRequests: string[];
  config: RunConfig;
}

export interface RunnerTabProps {
  collection: RunnerCollection;
  onChange: (collection: RunnerCollectionUpdate) => void;
  workspace: Workspace | null;
  onRun?: (payload: RunnerTabRunPayload) => void;
}
