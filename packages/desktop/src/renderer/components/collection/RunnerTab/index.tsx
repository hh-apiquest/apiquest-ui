// RunnerTab - Collection runner with configuration and request selection (config-only)
import { useState, useEffect } from 'react';
import { RunnerConfig } from './RunnerConfig';
import { RequestList } from './RequestList';
import { useTabNavigation, useWorkspace } from '../../../contexts';
import type { RunConfig } from '../../../types/quest';

interface RunnerTabProps {
  collection: any;
  onChange: (collection: any) => void;
  workspace: any;
  initialSelectedRequests?: string[];
  initialConfig?: Partial<RunnerTabConfig>;
  onRun?: (payload: {
    collectionId: string;
    collectionName: string;
    protocol: string;
    selectedRequests: string[];
    config: RunConfig;
  }) => void;
}

type RunnerTabConfig = {
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

export function RunnerTab({ collection, onChange, workspace, initialSelectedRequests, initialConfig, onRun }: RunnerTabProps) {
  const { openRunnerExecution } = useTabNavigation();
  const { activeEnvironment } = useWorkspace();
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  
  // Initialize with all requests selected
  useEffect(() => {
    if (collection?.items) {
      const allIds = getAllRequestIds(collection.items);
      const initialSelection = initialSelectedRequests !== undefined ? initialSelectedRequests : allIds;
      setSelectedRequests(initialSelection);
    }
  }, [collection?.id, initialSelectedRequests]); // Re-init if collection changes
  
  // Check if parallel execution is allowed in collection
  const allowParallel = collection?.options?.execution?.allowParallel === true;
  const maxConcurrency = collection?.options?.execution?.maxConcurrency;
  
  const [runConfig, setRunConfig] = useState<RunnerTabConfig>({
    environmentId: initialConfig?.environmentId ?? (activeEnvironment?.id || undefined),
    iterations: initialConfig?.iterations ?? 1,
    delay: initialConfig?.delay ?? 0,
    parallel: initialConfig?.parallel ?? false,
    concurrency: initialConfig?.concurrency ?? 1,
    allowParallel: allowParallel,
    maxConcurrency: maxConcurrency,
    dataFile: initialConfig?.dataFile ?? null,
    persistVariables: initialConfig?.persistVariables ?? false,
    saveResponses: initialConfig?.saveResponses ?? false
  });

  useEffect(() => {
    if (initialConfig) {
      setRunConfig(prev => ({
        ...prev,
        ...initialConfig,
        allowParallel,
        maxConcurrency
      }));
    }
  }, [initialConfig, allowParallel, maxConcurrency]);

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
      environmentId: activeEnvironment?.id || undefined
    }));
  }, [activeEnvironment?.id]);

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
            onSelectionChange={setSelectedRequests}
            isRunning={false}
          />
        </div>

        {/* Right Panel: Configuration and Run Controls */}
        <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <RunnerConfig
            config={runConfig}
            onChange={setRunConfig}
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
