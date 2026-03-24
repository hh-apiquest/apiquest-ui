// RunnerTab - Collection runner with configuration and request selection (config-only)
import { useState, useEffect, useRef, type JSX } from 'react';
import { RunnerConfig } from './RunnerConfig';
import { RequestList } from './RequestList';
import { useTabNavigation, useWorkspace } from '../../../contexts';
import type {
  RunConfig,
  RunnerCollectionItem,
  RunnerCollectionUpdate,
  RunnerTabConfig,
  RunnerTabProps,
} from '../../../types/runner-tab';

function isNonEmptyArray<T>(value: T[] | undefined): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

function isRequestItem(item: RunnerCollectionItem): boolean {
  return item.type === 'request';
}

function getAllRequestIds(items: RunnerCollectionItem[]): string[] {
  const ids: string[] = [];

  for (const item of items) {
    if (item.type === 'folder' && isNonEmptyArray(item.items)) {
      ids.push(...getAllRequestIds(item.items));
      continue;
    }

    if (isRequestItem(item) && item.id !== '') {
      ids.push(item.id);
    }
  }

  return ids;
}

export function RunnerTab({ collection, onChange, workspace, onRun }: RunnerTabProps): JSX.Element {
  const { openRunnerExecution } = useTabNavigation();
  const { activeEnvironment } = useWorkspace();

  const persistedState = collection._runnerState;
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);

  useEffect((): void => {
    if (collection.items !== undefined) {
      const allIds = getAllRequestIds(collection.items);
      const initialSelection = persistedState?.selectedRequests ?? allIds;
      setSelectedRequests(initialSelection);
    }
  }, [collection.info.id, collection.items, persistedState?.selectedRequests]);

  const allowParallel = collection.options?.execution?.allowParallel === true;
  const maxConcurrency = collection.options?.execution?.maxConcurrency;

  const [runConfig, setRunConfig] = useState<RunnerTabConfig>({
    environmentId: persistedState?.config.environmentId ?? activeEnvironment?.id ?? undefined,
    iterations: persistedState?.config.iterations ?? 1,
    delay: persistedState?.config.delay ?? 0,
    parallel: persistedState?.config.parallel ?? false,
    concurrency: persistedState?.config.concurrency ?? 1,
    allowParallel,
    maxConcurrency,
    dataFile: null,
    persistVariables: persistedState?.config.persistVariables ?? false,
    saveResponses: persistedState?.config.saveResponses ?? false,
  });

  const selectedRequestsRef = useRef(selectedRequests);
  const runConfigRef = useRef(runConfig);

  useEffect((): void => {
    selectedRequestsRef.current = selectedRequests;
  }, [selectedRequests]);

  useEffect((): void => {
    runConfigRef.current = runConfig;
  }, [runConfig]);

  const bubbleRunnerState = (nextSelected: string[], nextConfig: RunnerTabConfig): void => {
    const { dataFile: _omit, ...serializableConfig } = nextConfig;

    const updatedCollection: RunnerCollectionUpdate = {
      ...collection,
      _runnerState: {
        selectedRequests: nextSelected,
        config: serializableConfig,
      },
    };

    onChange(updatedCollection);
  };

  useEffect((): void => {
    setRunConfig((prev: RunnerTabConfig) => ({
      ...prev,
      allowParallel,
      maxConcurrency,
    }));
  }, [allowParallel, maxConcurrency]);

  useEffect((): void => {
    setRunConfig((prev: RunnerTabConfig) => ({
      ...prev,
      environmentId: activeEnvironment?.id ?? undefined,
    }));
  }, [activeEnvironment?.id]);

  const handleSelectionChange = (nextSelected: string[]): void => {
    setSelectedRequests(nextSelected);
    bubbleRunnerState(nextSelected, runConfigRef.current);
  };

  const handleConfigChange = (nextConfig: RunnerTabConfig): void => {
    setRunConfig(nextConfig);
    bubbleRunnerState(selectedRequestsRef.current, nextConfig);
  };

  const handleRunCollection = (): void => {
    if (workspace === null) {
      return;
    }

    const collectionId = collection.info.id;
    const collectionName = collection.info.name;

    if (collectionId === '' || collectionName === '') {
      return;
    }

    const executionConfig: RunConfig = {
      iterations: runConfig.iterations > 0 ? runConfig.iterations : 1,
      delay: runConfig.delay,
      environmentId: runConfig.environmentId,
      parallel: runConfig.parallel,
      concurrency: runConfig.concurrency,
      persistVariables: runConfig.persistVariables,
      saveResponses: runConfig.saveResponses,
    };

    console.log('Opening runner execution tab:', {
      collectionId,
      collectionName,
      selectedRequests,
      config: executionConfig,
    });

    if (onRun !== undefined) {
      onRun({
        collectionId,
        collectionName,
        protocol: collection.protocol ?? 'http',
        selectedRequests,
        config: executionConfig,
      });
      return;
    }

    openRunnerExecution(
      collectionId,
      collection.protocol ?? 'http',
      collectionName,
      executionConfig,
      selectedRequests,
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '16px', minHeight: 0, flex: '1' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <RequestList
            collection={collection}
            selectedRequests={selectedRequests}
            onSelectionChange={handleSelectionChange}
            isRunning={false}
          />
        </div>

        <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <RunnerConfig config={runConfig} onChange={handleConfigChange} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={handleRunCollection}
              disabled={selectedRequests.length === 0}
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: selectedRequests.length === 0 ? 'not-allowed' : 'pointer',
                backgroundColor: selectedRequests.length === 0 ? 'var(--gray-6)' : 'var(--accent-9)',
                color: 'white',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(event): void => {
                if (selectedRequests.length > 0) {
                  event.currentTarget.style.backgroundColor = 'var(--accent-10)';
                }
              }}
              onMouseLeave={(event): void => {
                if (selectedRequests.length > 0) {
                  event.currentTarget.style.backgroundColor = 'var(--accent-9)';
                }
              }}
            >
              {`▶ Run Collection (${selectedRequests.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
