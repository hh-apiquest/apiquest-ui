import React, { useEffect, useState, useRef } from 'react';
import { Box, Flex, Text, Button, Separator, Tabs } from '@radix-ui/themes';
import { PlayIcon, StopIcon } from '@heroicons/react/24/outline';
import type { Tab, RunnerMetadata } from '../../contexts/TabContext';
import { Runner } from './Runner';
import { useWorkspace, useTabNavigation, useTabStatusActions } from '../../contexts';
import { RunnerTab } from '../collection/RunnerTab';
import type { Collection } from '@apiquest/types';

interface RunnerExecutionProps {
  tab: Tab;
}

export function RunnerExecution({ tab }: RunnerExecutionProps) {
  const { workspace } = useWorkspace();
  const { clearTabExecution, updateTabExecution } = useTabNavigation();
  const { setMetadata } = useTabStatusActions();
  const metadata = tab.metadata as RunnerMetadata;
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [activeTab, setActiveTab] = useState('setup');
  const [collection, setCollection] = useState<Collection | null>(null);
  
  // Track current runId for stop functionality
  const currentRunIdRef = useRef(metadata.runId);
  
  // Track if auto-start has been triggered to prevent double execution (dev react strict)
  const autoStartTriggeredRef = useRef(false);

  // Start execution automatically on mount if status is pending
  useEffect(() => {
    if (metadata.status === 'pending' && !hasStarted && workspace && !autoStartTriggeredRef.current) {
      autoStartTriggeredRef.current = true;
      handleStart();
    }
  }, [metadata.status, hasStarted, workspace]);

  useEffect(() => {
    if (isRunning || metadata.status === 'running' || metadata.status === 'pending') {
      setActiveTab('results');
    }
  }, [isRunning, metadata.status]);

  useEffect(() => {
    const loadCollection = async () => {
      if (!workspace || !metadata.collectionId) return;

      try {
        const loaded = await window.quest.workspace.loadCollection(workspace.id, metadata.collectionId);
        setCollection(loaded as Collection);
      } catch (error) {
        console.error('Failed to load collection for runner execution:', error);
      }
    };

    loadCollection();
  }, [workspace, metadata.collectionId]);

  // Listen to execution events to update isRunning state and metadata status
  useEffect(() => {
    const events = tab.execution?.events || [];
    const lastEvent = events[events.length - 1];
    
    if (lastEvent) {
      const currentMetadata = tab.metadata as RunnerMetadata;
      
      if (lastEvent.type === 'beforeRun') {
        setIsRunning(true);
        setMetadata(tab.id, {
          ...currentMetadata,
          status: 'running'
        } as RunnerMetadata);
      } else if (lastEvent.type === 'afterRun') {
        setIsRunning(false);
        setMetadata(tab.id, {
          ...currentMetadata,
          status: 'completed',
          completedAt: new Date()
        } as RunnerMetadata);
      } else if (lastEvent.type === 'error' || lastEvent.type === 'runnerError') {
        setIsRunning(false);
        setMetadata(tab.id, {
          ...currentMetadata,
          status: 'error',
          completedAt: new Date()
        } as RunnerMetadata);
      }
    }
  }, [tab.execution?.events]);

  const handleStart = async () => {
    if (!workspace) return;
    
    // Generate new runId for re-runs
    let runId = metadata.runId;
    if (hasStarted) {
      // Clear previous execution state
      clearTabExecution(tab.id);
      
      // Generate new runId
      runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Update current runId ref
      currentRunIdRef.current = runId;
      
      // Recreate execution object with fresh state
      updateTabExecution(tab.id, {
        executionId: crypto.randomUUID(),
        status: 'idle',
        startTime: Date.now(),
        events: []
      });
      
      // Update metadata with new runId and reset status
      setMetadata(tab.id, {
        ...metadata,
        runId,
        status: 'pending'
      } as RunnerMetadata);
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
    } catch (error) {
      console.error('Error starting collection run:', error);
      setIsRunning(false);
    }
  };

  const handleSetupRun = async (payload: {
    collectionId: string;
    collectionName: string;
    protocol: string;
    selectedRequests: string[];
    config: import('../../types/quest').RunConfig;
  }) => {
    if (!workspace) return;

    // Clear previous execution state
    clearTabExecution(tab.id);

    const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    currentRunIdRef.current = runId;

    updateTabExecution(tab.id, {
      executionId: crypto.randomUUID(),
      status: 'idle',
      startTime: Date.now(),
      events: []
    });

    setMetadata(tab.id, {
      ...metadata,
      runId,
      collectionId: payload.collectionId,
      collectionName: payload.collectionName,
      protocol: payload.protocol,
      selectedRequests: payload.selectedRequests,
      config: payload.config,
      status: 'pending'
    } as RunnerMetadata);

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
    } catch (error) {
      console.error('Error starting collection run:', error);
      setIsRunning(false);
    }

    setActiveTab('results');
  };

  const handleStop = async () => {
    try {
      await window.quest.runner.stopRun(currentRunIdRef.current);
      setIsRunning(false);
    } catch (error) {
      console.error('Error stopping run:', error);
    }
  };

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
              <Button size="1" onClick={handleStart} variant="soft">
                <PlayIcon className="w-4 h-4" />
                {hasStarted ? 'Re-run' : 'Run'}
              </Button>
            )}
            {(isRunning || metadata.status === 'running') && (
              <Button size="1" onClick={handleStop} variant="soft" color="red">
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
              {collection ? (
                <RunnerTab
                  collection={collection}
                  onChange={() => null}
                  workspace={workspace}
                  initialSelectedRequests={metadata.selectedRequests}
                  initialConfig={{
                    environmentId: metadata.config.environmentId,
                    iterations: metadata.config.iterations,
                    delay: metadata.config.delay ?? 0,
                    parallel: metadata.config.parallel ?? false,
                    concurrency: metadata.config.concurrency ?? 1,
                    persistVariables: metadata.config.persistVariables ?? false,
                    saveResponses: metadata.config.saveResponses ?? false
                  }}
                  onRun={handleSetupRun}
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
