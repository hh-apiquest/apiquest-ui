// RunnerTab - Collection runner with configuration and request selection (config-only)
import { useState, useEffect, useRef } from 'react';
import { RunnerConfig } from './RunnerConfig';
import { RequestList } from './RequestList';
import { useTabNavigation, useWorkspace } from '../../../contexts';
import type { RunConfig } from '../../../types/quest';

interface RunnerTabProps {
  collection: any;
  onChange: (collection: any) => void;
  workspace: any;
  onRun?: (payload: {
    collectionId: string;
    collectionName: string;
    protocol: string;
    selectedRequests: string[];
    config: RunConfig;
  }) => void;
}

export type RunnerTabConfig = {
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
};

// Runner state stored in collection._runnerState so it survives tab switches.
export interface RunnerState {
  selectedRequests: string[];
  config: Omit<RunnerTabConfig, 'dataFile'>; // File cannot be serialized; omit from persisted state
}

// Helper to get all request IDs from collection
function getAllRequestIds(items: any[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (item.type === 'folder' && item.items) {
      ids.push(...getAllRequestIds(item.items));
    } else if (item.type === 'request' || item.data) {
      ids.push(item.id);
    }
  }
  return ids;
}

export function RunnerTab({ collection, onChange, workspace, onRun }: RunnerTabProps) {
  const { openRunnerExecution } = useTabNavigation();
  const { activeEnvironment } = useWorkspace();

  // Restore persisted runner state from collection._runnerState (set by a previous tab switch).
  const persistedState = collection?._runnerState as RunnerState | undefined;

  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  
  // Initialize with all requests selected (or restored from persisted state).
  useEffect(() => {
    if (collection?.items) {
      const allIds = getAllRequestIds(collection.items);
      const initialSelection = persistedState?.selectedRequests ?? allIds;
      setSelectedRequests(initialSelection);
    }
  }, [collection?.id]); // Re-init only when the collection identity changes

  // Check if parallel execution is allowed in collection
  const allowParallel = collection?.options?.execution?.allowParallel === true;
  const maxConcurrency = collection?.options?.execution?.maxConcurrency;

  const [runConfig, setRunConfig] = useState<RunnerTabConfig>({
    environmentId: persistedState?.config.environmentId ?? (activeEnvironment?.id ?? undefined),
    iterations: persistedState?.config.iterations ?? 1,
    delay: persistedState?.config.delay ?? 0,
    parallel: persistedState?.config.parallel ?? false,
    concurrency: persistedState?.config.concurrency ?? 1,
    allowParallel: allowParallel,
    maxConcurrency: maxConcurrency,
    dataFile: null,
    persistVariables: persistedState?.config.persistVariables ?? false,
    saveResponses: persistedState?.config.saveResponses ?? false
  });

  // Keep stable refs so the bubble-up effects always read the latest values.
  const selectedRequestsRef = useRef(selectedRequests);
  const runConfigRef = useRef(runConfig);
  useEffect(() => { selectedRequestsRef.current = selectedRequests; }, [selectedRequests]);
  useEffect(() => { runConfigRef.current = runConfig; }, [runConfig]);

  // Bubble runner state up to CollectionEditor via onChange so it is stored in
  // collection._runnerState and preserved by setTabEditorState on every change.
  const bubbleRunnerState = (nextSelected: string[], nextConfig: RunnerTabConfig) => {
    const { dataFile: _omit, ...serializableConfig } = nextConfig;
    onChange({
      ...collection,
      _runnerState: {
        selectedRequests: nextSelected,
        config: serializableConfig
      }
    });
  };

  useEffect(() => {
    setRunConfig(prev => ({
      ...prev,
      allowParallel,
      maxConcurrency
    }));
  }, [allowParallel, maxConcurrency]);
  
  // Update environmentId when activeEnvironment changes
  useEffect(() => {
    setRunConfig(prev => ({
      ...prev,
      environmentId: activeEnvironment?.id ?? undefined
    }));
  }, [activeEnvironment?.id]);

  const handleSelectionChange = (nextSelected: string[]) => {
    setSelectedRequests(nextSelected);
    bubbleRunnerState(nextSelected, runConfigRef.current);
  };

  const handleConfigChange = (nextConfig: RunnerTabConfig) => {
    setRunConfig(nextConfig);
    bubbleRunnerState(selectedRequestsRef.current, nextConfig);
  };

  const handleRunCollection = () => {
    if (!workspace || !collection) return;
    
    // Collection uses info.id and info.name per schema
    const collectionId = collection.info?.id || collection.id;
    const collectionName = collection.info?.name || collection.name;
    
    console.log('Opening runner execution tab:', {
      collectionId,
      collectionName,
      selectedRequests,
      config: runConfig
    });
    
    const executionConfig: RunConfig = {
      iterations: runConfig.iterations || 1,
      delay: runConfig.delay,
      environmentId: runConfig.environmentId,
      parallel: runConfig.parallel,
      concurrency: runConfig.concurrency,
      persistVariables: runConfig.persistVariables,
      saveResponses: runConfig.saveResponses
    };

    if (onRun) {
      onRun({
        collectionId,
        collectionName,
        protocol: collection.protocol || 'http',
        selectedRequests,
        config: executionConfig
      });
      return;
    }

    // Open a new runner execution tab
    openRunnerExecution(
      collectionId,
      collection.protocol || 'http',
      collectionName,
      executionConfig,
      selectedRequests
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      {/* Request Selection (Left) + Configuration (Right) */}
      <div style={{ display: 'flex', gap: '16px', minHeight: 0, flex: '1' }}>
        {/* Left Panel: Request Selection */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <RequestList
            collection={collection}
            selectedRequests={selectedRequests}
            onSelectionChange={handleSelectionChange}
            isRunning={false}
          />
        </div>

        {/* Right Panel: Configuration and Run Controls */}
        <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <RunnerConfig
            config={runConfig}
            onChange={handleConfigChange}
          />
          
          {/* Run Controls */}
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
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                if (selectedRequests.length > 0) {
                  e.currentTarget.style.backgroundColor = 'var(--accent-10)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedRequests.length > 0) {
                  e.currentTarget.style.backgroundColor = 'var(--accent-9)';
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
