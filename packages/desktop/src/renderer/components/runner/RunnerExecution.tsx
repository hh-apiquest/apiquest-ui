import React, { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Box, Flex, Text, Button, Separator, Tabs } from '@radix-ui/themes';
import { PlayIcon, StopIcon } from '@heroicons/react/24/outline';
import type { Tab, RunnerMetadata } from '../../contexts/TabContext';
import { Runner } from './Runner';
import { useWorkspace, useTabNavigation, useTabStatusActions } from '../../contexts';
import { RunnerTab } from '../collection/RunnerTab';
import type { RunnerCollection, RunnerTabRunPayload } from '../../types/runner-tab';
import type { ExecutionData } from '../../../types/execution';

interface RunnerExecutionProps {
  tab: Tab;
}

interface RunnerExecutionEditorState {
  collection: RunnerCollection;
}

function isRunnerMetadata(metadata: Tab['metadata']): metadata is RunnerMetadata {
  return metadata !== undefined && metadata !== null && 'runId' in metadata;
}

function isRunnerExecutionEditorState(value: unknown): value is RunnerExecutionEditorState {
  return typeof value === 'object' && value !== null && 'collection' in value;
}

function createEmptyExecutionData(): ExecutionData {
  return {
    executionId: crypto.randomUUID(),
    status: 'idle',
    startTime: Date.now(),
    events: []
  };
}

function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function RunnerExecution({ tab }: RunnerExecutionProps): ReactElement {
  const { workspace } = useWorkspace();
  const { clearTabExecution, updateTabExecution, setTabEditorState, getTabEditorState } = useTabNavigation();
  const { setMetadata } = useTabStatusActions();
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [activeTab, setActiveTab] = useState('setup');
  const [collection, setCollection] = useState<RunnerCollection | null>(null);
  const metadata = isRunnerMetadata(tab.metadata) ? tab.metadata : null;
  const metadataStatus = metadata?.status;
  const metadataCollectionId = metadata?.collectionId ?? '';
  const metadataSelectedRequests = metadata?.selectedRequests ?? [];
  const metadataEnvironmentId = metadata?.config.environmentId;
  const metadataIterations = metadata?.config.iterations ?? 1;
  const metadataDelay = metadata?.config.delay ?? 0;
  const metadataParallel = metadata?.config.parallel ?? false;
  const metadataConcurrency = metadata?.config.concurrency ?? 1;
  const metadataPersistVariables = metadata?.config.persistVariables ?? false;
  const metadataSaveResponses = metadata?.config.saveResponses ?? false;
  
  // Track current runId for stop functionality
  const currentRunIdRef = useRef(metadata?.runId ?? '');
  
  // Track if auto-start has been triggered to prevent double execution (dev react strict)
  const autoStartTriggeredRef = useRef(false);

  // Start execution automatically on mount if status is pending
  const handleStart = useCallback(async (): Promise<void> => {
    if (workspace === null || metadata === null) {
      return;
    }

    let runId = metadata.runId;
    if (hasStarted) {
      clearTabExecution(tab.id);
      runId = generateRunId();
      currentRunIdRef.current = runId;

      updateTabExecution(tab.id, createEmptyExecutionData());

      setMetadata(tab.id, {
        ...metadata,
        runId,
        status: 'pending'
      });
    }

    setIsRunning(true);
    setHasStarted(true);

    try {
      const result = await window.quest.runner.runCollection({
        runId,
        workspaceId: workspace.id,
        collectionId: metadata.collectionId,
        selectedRequests: metadata.selectedRequests,
        config: metadata.config
      });

      if (!result.success) {
        console.error('Failed to start collection run');
        setIsRunning(false);
      }
    } catch (error: unknown) {
      console.error('Error starting collection run:', error);
      setIsRunning(false);
    }
  }, [workspace, metadata, hasStarted, clearTabExecution, tab.id, updateTabExecution, setMetadata]);

  const handleSetupRun = useCallback(async (payload: RunnerTabRunPayload): Promise<void> => {
    if (workspace === null || metadata === null) {
      return;
    }

    clearTabExecution(tab.id);

    const runId = generateRunId();
    currentRunIdRef.current = runId;

    updateTabExecution(tab.id, createEmptyExecutionData());

    setMetadata(tab.id, {
      ...metadata,
      runId,
      collectionId: payload.collectionId,
      collectionName: payload.collectionName,
      selectedRequests: payload.selectedRequests,
      config: payload.config,
      status: 'pending'
    });

    setIsRunning(true);
    setHasStarted(true);

    try {
      const result = await window.quest.runner.runCollection({
        runId,
        workspaceId: workspace.id,
        collectionId: payload.collectionId,
        selectedRequests: payload.selectedRequests,
        config: payload.config
      });

      if (!result.success) {
        console.error('Failed to start collection run');
        setIsRunning(false);
      }
    } catch (error: unknown) {
      console.error('Error starting collection run:', error);
      setIsRunning(false);
    }

    setActiveTab('results');
  }, [workspace, clearTabExecution, tab.id, updateTabExecution, setMetadata, metadata]);

  const handleStop = useCallback(async (): Promise<void> => {
    try {
      await window.quest.runner.stopRun(currentRunIdRef.current);
      setIsRunning(false);
    } catch (error: unknown) {
      console.error('Error stopping run:', error);
    }
  }, []);

  useEffect(() => {
    if (metadata === null) {
      return;
    }

    if (metadata.status === 'pending' && !hasStarted && workspace !== null && !autoStartTriggeredRef.current) {
      autoStartTriggeredRef.current = true;
      void handleStart();
    }
  }, [metadataStatus, hasStarted, workspace, handleStart]);

  useEffect(() => {
    if (metadata === null) {
      return;
    }

    if (isRunning || metadata.status === 'running' || metadata.status === 'pending') {
      setActiveTab('results');
    }
  }, [isRunning, metadataStatus]);

  useEffect(() => {
    const loadCollection = async (): Promise<void> => {
      if (workspace === null || metadata === null || metadataCollectionId === '') {
        return;
      }

      // Check in-memory state first (survives tab switches without re-loading).
      // Each executor tab uses its own tab.id as key so multiple executors never share state.
      const cachedState = getTabEditorState(tab.id);
      if (isRunnerExecutionEditorState(cachedState)) {
        setCollection(cachedState.collection);
        return;
      }

      try {
        const loaded = await window.quest.workspace.loadCollection(workspace.id, metadataCollectionId);
        // Seed _runnerState from metadata so RunnerTab restores the initial selection/config.
        const seeded: RunnerCollection = {
          ...loaded,
          _runnerState: {
            selectedRequests: metadata.selectedRequests,
            config: {
              environmentId: metadata.config.environmentId,
              iterations: metadata.config.iterations,
              delay: metadata.config.delay ?? 0,
              parallel: metadata.config.parallel ?? false,
              concurrency: metadata.config.concurrency ?? 1,
              allowParallel: loaded.options?.execution?.allowParallel === true,
              maxConcurrency: loaded.options?.execution?.maxConcurrency,
              persistVariables: metadata.config.persistVariables ?? false,
              saveResponses: metadata.config.saveResponses ?? false
            }
          }
        };
        setCollection(seeded);
        setTabEditorState(tab.id, { collection: seeded });
      } catch (error: unknown) {
        console.error('Failed to load collection for runner execution:', error);
      }
    };

    void loadCollection();
  }, [workspace, metadataCollectionId, metadataSelectedRequests, metadataEnvironmentId, metadataIterations, metadataDelay, metadataParallel, metadataConcurrency, metadataPersistVariables, metadataSaveResponses, getTabEditorState, setTabEditorState, tab.id]);

  // Listen to execution events to update isRunning state and metadata status
  useEffect(() => {
    if (metadata === null) {
      return;
    }

    const events = tab.execution?.events ?? [];
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;

    if (lastEvent === null) {
      return;
    }

    if (lastEvent.type === 'beforeRun') {
      setIsRunning(true);
      setMetadata(tab.id, {
        ...metadata,
        status: 'running'
      });
    } else if (lastEvent.type === 'afterRun') {
      setIsRunning(false);
      setMetadata(tab.id, {
        ...metadata,
        status: 'completed',
        completedAt: new Date()
      });
    } else if (lastEvent.type === 'error' || lastEvent.type === 'runnerError') {
      setIsRunning(false);
      setMetadata(tab.id, {
        ...metadata,
        status: 'error',
        completedAt: new Date()
      });
    }
  }, [tab.execution?.events, tab.id, metadata, setMetadata]);

  if (metadata === null) {
    return (
      <Box p="3">
        <Text size="2" color="gray">Runner metadata is unavailable.</Text>
      </Box>
    );
  }

  return (
    <Flex direction="column" style={{ flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <Box p="3" style={{ borderBottom: '1px solid var(--gray-6)' }}>
        <Flex align="center" gap="3" justify="between">
          <Flex align="center" gap="2">
            {metadata.status === 'running' && (
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            )}
            <Text size="2" weight="medium">
              {metadata.status === 'pending' && 'Pending...'}
              {metadata.status === 'running' && 'Running...'}
              {metadata.status === 'completed' && 'Completed'}
              {metadata.status === 'stopped' && 'Stopped'}
              {metadata.status === 'error' && 'Error'}
            </Text>
          </Flex>
          
          <Flex gap="2">
            {!isRunning && metadata.status !== 'running' && (
              <Button size="1" onClick={() => { void handleStart(); }} variant="soft">
                <PlayIcon className="w-4 h-4" />
                {hasStarted ? 'Re-run' : 'Run'}
              </Button>
            )}
            {(isRunning || metadata.status === 'running') && (
              <Button size="1" onClick={() => { void handleStop(); }} variant="soft" color="red">
                <StopIcon className="w-4 h-4" />
                Stop
              </Button>
            )}
          </Flex>
        </Flex>
      </Box>

      <Separator size="4" />

      {/* Content */}
      <Box style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <Tabs.Root value={activeTab} onValueChange={setActiveTab} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box p="2" style={{ borderBottom: '1px solid var(--gray-6)' }}>
            <Tabs.List>
              <Tabs.Trigger value="setup" disabled={isRunning || metadata.status === 'running' || metadata.status === 'pending'}>
                Setup
              </Tabs.Trigger>
              <Tabs.Trigger value="results">Results</Tabs.Trigger>
            </Tabs.List>
          </Box>

          <Tabs.Content value="results" style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <Runner tab={tab} />
          </Tabs.Content>

          <Tabs.Content value="setup" style={{ flex: 1, overflow: 'auto' }}>
            <Box p="3">
              {collection !== null ? (
                <RunnerTab
                  collection={collection}
                  onChange={(updatedCollection) => {
                    setCollection(updatedCollection);
                    setTabEditorState(tab.id, { collection: updatedCollection });
                  }}
                  workspace={workspace}
                  onRun={(payload) => { void handleSetupRun(payload); }}
                />
              ) : (
                <Flex align="center" justify="center" style={{ height: '100%' }}>
                  <Text size="2" color="gray">Loading collection...</Text>
                </Flex>
              )}
            </Box>
          </Tabs.Content>
        </Tabs.Root>
      </Box>
    </Flex>
  );
}
