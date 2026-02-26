import React, { useState, useMemo, useEffect } from 'react';
import { Box, Flex, Text, Badge, Tabs, Card, Button, Code, Table, Progress } from '@radix-ui/themes';
import { CheckCircleIcon, XCircleIcon, NoSymbolIcon } from '@heroicons/react/24/solid';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import type { Tab } from '../../contexts/TabContext';
import type { RunnerMetadata } from '../../contexts/TabContext';
import type { ExecutionEvent } from '../../../types/execution';
import { pluginLoader } from '../../services';
import { useWorkspace } from '../../contexts';
import type { Collection, CollectionItem } from '@apiquest/types';
import { buildSummary } from '../../utils/responseAdapters';

interface RunnerProps {
  tab: Tab;
}

// Protocol-agnostic request result
interface RequestResult {
  requestId: string;
  requestName: string;
  requestPath?: string;
  status: 'success' | 'failed' | 'skipped' | 'running' | 'pending';
  duration: number;
  tests: TestResult[];
  // Request/Response data (protocol-specific, for detail panel)
  requestData?: any;
  responseData?: any;
  metadata?: {
    protocol?: string;
    timestamp?: number;
    error?: string;
  };
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

type RequestStatusFilter = 'all' | 'success' | 'errors';
type TestResultFilter = 'all' | 'passed' | 'failed' | 'skipped';

export function Runner({ tab }: RunnerProps) {
  const metadata = tab.metadata as RunnerMetadata;
  const { workspace } = useWorkspace();
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatusFilter>('all');
  const [testResultFilter, setTestResultFilter] = useState<TestResultFilter>('all');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestNamesMap, setRequestNamesMap] = useState<Map<string, string>>(new Map());
  const [selectedIteration, setSelectedIteration] = useState<number | null>(null);
  const [hasManualIterationSelection, setHasManualIterationSelection] = useState(false);

  const isRunning = metadata.status === 'running' || metadata.status === 'pending';
  const events = tab.execution?.events || [];
  
  // Load collection and extract request names for selected request IDs
  useEffect(() => {
    const loadRequestNames = async () => {
      if (!workspace || !metadata.collectionId || !metadata.selectedRequests.length) return;
      
      try {
        const collection = await window.quest.workspace.loadCollection(workspace.id, metadata.collectionId) as Collection;
        
        // Recursively find requests in collection items
        const findRequests = (items: CollectionItem[], targetIds: string[], namesMap: Map<string, string>) => {
          for (const item of items) {
            if (item.type === 'request' && targetIds.includes(item.id)) {
              namesMap.set(item.id, item.name);
            } else if (item.type === 'folder') {
              findRequests(item.items, targetIds, namesMap);
            }
          }
        };
        
        const namesMap = new Map<string, string>();
        findRequests(collection.items, metadata.selectedRequests, namesMap);
        setRequestNamesMap(namesMap);
      } catch (error) {
        console.error('Failed to load request names:', error);
      }
    };
    
    loadRequestNames();
  }, [workspace, metadata.collectionId, metadata.selectedRequests]);

  const iterationState = useMemo(() => {
    let maxIteration = 0;
    let totalIteration = 0;
    let currentIteration = 0;
    const iterationsSeen = new Set<number>();

    events.forEach((event: ExecutionEvent) => {
      const iteration = event.data?.iteration;
      const current = iteration?.current;
      const total = iteration?.total;

      if (typeof current === 'number') {
        iterationsSeen.add(current);
        if (current > maxIteration) {
          maxIteration = current;
        }
        currentIteration = current;
      }

      if (typeof total === 'number' && total > totalIteration) {
        totalIteration = total;
      }
    });

    const inferredCount = totalIteration || maxIteration;
    const fallbackCount = metadata.config?.iterations ?? 1;
    const iterationCount = inferredCount || fallbackCount;
    const orderedIterations = Array.from(iterationsSeen).sort((a, b) => a - b);

    return {
      iterationCount,
      iterationsSeen: orderedIterations,
      currentIteration: currentIteration || orderedIterations[orderedIterations.length - 1] || 1
    };
  }, [events, metadata.config?.iterations]);

  const showIterationBar = iterationState.iterationCount > 1;
  const effectiveIteration = showIterationBar ? (selectedIteration ?? iterationState.currentIteration) : null;

  useEffect(() => {
    if (!showIterationBar) {
      if (selectedIteration !== null) {
        setSelectedIteration(null);
      }
      if (hasManualIterationSelection) {
        setHasManualIterationSelection(false);
      }
      return;
    }

    if (!hasManualIterationSelection) {
      setSelectedIteration(iterationState.currentIteration);
    }
  }, [showIterationBar, iterationState.currentIteration, hasManualIterationSelection, selectedIteration]);

  useEffect(() => {
    if (events.length === 0) {
      setSelectedIteration(null);
      setHasManualIterationSelection(false);
    }
  }, [events.length]);

  useEffect(() => {
    setSelectedRequestId(null);
  }, [effectiveIteration]);

  const eventsForIteration = useMemo(() => {
    if (!showIterationBar || effectiveIteration === null) {
      return events;
    }

    return events.filter(event => event.data?.iteration?.current === effectiveIteration);
  }, [events, showIterationBar, effectiveIteration]);

  // Parse execution events to build RequestResult[]
  const requestResults = useMemo(() => {
    const scopedEvents = eventsForIteration;
    const resultsMap = new Map<string, RequestResult>();

    // Initialize all selected requests with actual names from collection
    metadata.selectedRequests.forEach(requestId => {
      resultsMap.set(requestId, {
        requestId,
        requestName: requestNamesMap.get(requestId) || requestId,  // Use actual name or fallback to ID
        status: 'pending',
        duration: 0,
        tests: [],
        metadata: {}
      });
    });

    // Track test assertions per request (collected from assertion events)
    const testsByRequest = new Map<string, TestResult[]>();
    
    // Track seen event IDs to handle duplicates (React StrictMode causes double renders)
    const seenEventIds = new Set<string>();

    scopedEvents.forEach((event: ExecutionEvent) => {
      // Skip duplicate events based on unique ID (Fracture adds event.data.id)
      const eventId = event.data?.id;
      if (eventId) {
        if (seenEventIds.has(eventId)) {
          return; // Skip duplicate
        }
        seenEventIds.add(eventId);
      }
      
      // beforeItem: Mark request as running, get actual request name
      if (event.type === 'beforeItem' && event.data?.request) {
        const requestId = event.data.request.id;
        const existing = resultsMap.get(requestId);
        if (existing && existing.status === 'pending') {
          existing.status = 'running';
          existing.requestName = event.data.request.name || existing.requestName;
        }
        if (existing && event.data?.path) {
          existing.requestPath = event.data.path;
        }
        // Clear previous tests for this request (fresh start)
        testsByRequest.set(requestId, []);
      }

      // afterRequest: Extract response data and protocol info
      if (event.type === 'afterRequest' && event.data?.request) {
        const requestId = event.data.request.id;
        const existing = resultsMap.get(requestId);
        if (existing) {
          const request = event.data.request;
          const response = event.data.response;
          if (event.data?.path) {
            existing.requestPath = event.data.path;
          }
          const protocol = event.data.protocol;
          const plugin = protocol ? pluginLoader.getProtocolPluginUI(protocol) : null;
          const badge = plugin ? plugin.getRequestBadge(request) : null;
          const summaryView = buildSummary(request, response, plugin);
          
          // Store the full request data for plugin rendering
          existing.requestData = request.data;

          existing.responseData = response ? {
            summary: summaryView?.statusLabel || 'Complete',
            detail: summaryView?.statusDetail,
            outcome: summaryView?.outcome,
            code: summaryView?.code,
            rawData: summaryView?.rawData
          } : undefined;

          existing.duration = summaryView?.duration ?? event.data.duration ?? 0;
          existing.metadata = {
            protocol,
            timestamp: event.timestamp,
            error: summaryView?.error
          };
        }
      }

      // assertion: Collect test results (emitted during/after post-request scripts)
      if (event.type === 'assertion' && event.data?.test) {
        const requestId = event.data.request?.id;
        if (requestId) {
          const tests = testsByRequest.get(requestId) || [];
          tests.push({
            name: event.data.test.name || 'Unnamed Test',
            passed: event.data.test.passed === true,
            error: event.data.test.error
          });
          testsByRequest.set(requestId, tests);
        }
      }

      // afterItem: Mark request as completed, attach tests, determine final status
      if (event.type === 'afterItem' && event.data?.request) {
        const requestId = event.data.request.id;
        const existing = resultsMap.get(requestId);
        
        if (existing) {
          const result = event.data.result;
          existing.requestName = event.data.request.name || existing.requestName;
          if (event.data?.path) {
            existing.requestPath = event.data.path;
          }
          
          // Determine status from result or response
          if (result?.skipped) {
            existing.status = 'skipped';
          } else if (result?.error || existing.metadata?.error) {
            existing.status = 'failed';
          } else {
            // Check if any tests failed
            const tests = testsByRequest.get(requestId) || [];
            const hasFailedTests = tests.some(t => !t.passed);
            existing.status = hasFailedTests ? 'failed' : 'success';
          }
          
          // Attach all collected tests
          existing.tests = testsByRequest.get(requestId) || [];
        }
      }
    });

    return Array.from(resultsMap.values());
  }, [eventsForIteration, metadata.selectedRequests, requestNamesMap]);

  // Calculate progress
  const completedCount = useMemo(() => {
    return requestResults.filter(r => r.status === 'success' || r.status === 'failed' || r.status === 'skipped').length;
  }, [requestResults]);

  const totalRequests = metadata.selectedRequests.length;
  const progressValue = totalRequests > 0 ? Math.min((completedCount / totalRequests) * 100, 100) : 0;

  // Calculate duration
  const startTime = events.find(e => e.type === 'beforeRun')?.timestamp;
  const endTime = events.length > 0 ? events[events.length - 1].timestamp : undefined;
  const totalDuration = startTime && endTime ? Math.round((endTime - startTime) / 1000) : 0;

  // Filter results based on request status and test results
  // When test result filter is active, only show those specific tests for each request
  const filteredResults = useMemo(() => {
    let filtered = requestResults;

    // Filter by request status
    if (requestStatusFilter === 'success') {
      filtered = filtered.filter(r => r.status === 'success');
    } else if (requestStatusFilter === 'errors') {
      filtered = filtered.filter(r => r.status === 'failed' || r.status === 'skipped');
    }

    // Filter by test results - show only requests with matching tests, and filter tests within each request
    if (testResultFilter !== 'all') {
      filtered = filtered
        .map(r => {
          let filteredTests = r.tests;
          
          if (testResultFilter === 'passed') {
            filteredTests = r.tests.filter(t => t.passed);
          } else if (testResultFilter === 'failed') {
            filteredTests = r.tests.filter(t => !t.passed);
          } else if (testResultFilter === 'skipped') {
            // For skipped, show requests with no tests
            filteredTests = r.tests.length === 0 ? [] : r.tests;
          }
          
          // Return request with filtered tests
          return { ...r, tests: filteredTests };
        })
        .filter(r => {
          // Only include requests that have matching criteria
          if (testResultFilter === 'passed') {
            return r.tests.length > 0; // Has passed tests
          } else if (testResultFilter === 'failed') {
            return r.tests.length > 0; // Has failed tests
          } else if (testResultFilter === 'skipped') {
            return r.tests.length === 0; // Has no tests
          }
          return true;
        });
    }

    return filtered;
  }, [requestResults, requestStatusFilter, testResultFilter]);

  // Calculate counts for filter tabs
  const counts = useMemo(() => {
    return {
      // Request status counts
      all: requestResults.length,
      success: requestResults.filter(r => r.status === 'success').length,
      errors: requestResults.filter(r => r.status === 'failed' || r.status === 'skipped').length,
      
      // Test result counts
      testsAll: requestResults.length,
      testsPassed: requestResults.filter(r => r.tests.length > 0 && r.tests.every(t => t.passed)).length,
      testsFailed: requestResults.filter(r => r.tests.some(t => !t.passed)).length,
      testsSkipped: requestResults.filter(r => r.tests.length === 0).length
    };
  }, [requestResults]);

  // Get selected request details
  const selectedRequest = useMemo(() => {
    return requestResults.find(r => r.requestId === selectedRequestId);
  }, [requestResults, selectedRequestId]);

  const handleRequestClick = (requestId: string) => {
    setSelectedRequestId(prev => prev === requestId ? null : requestId);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Flex direction="column" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Progress Bar (shown while running) */}
      {isRunning && (
        <Box p="3" style={{ borderBottom: '1px solid var(--gray-6)' }}>
          <Flex align="center" justify="between" mb="2">
            <Text size="2" weight="medium">Running...</Text>
            <Text size="1" color="gray">
              {completedCount} / {totalRequests} completed
            </Text>
          </Flex>
          <Progress value={progressValue} size="2" color={counts.errors > 0 ? 'red' : 'blue'} />
        </Box>
      )}

      <Flex style={{ flex: 1, overflow: 'hidden' }}>
        <Box style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Flex direction="column" style={{ height: '100%', overflow: 'hidden' }}>
            {/* Summary Stats */}
            <Box p="3" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <Flex gap="3">
                <Box style={{ flex: 1, textAlign: 'center' }}>
                  <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Success</Text>
                  <Text size="3" weight="bold" style={{ color: 'var(--green-9)' }}>{counts.success}</Text>
                </Box>
                <Box style={{ flex: 1, textAlign: 'center' }}>
                  <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Errors</Text>
                  <Text size="3" weight="bold" style={{ color: 'var(--red-9)' }}>{counts.errors}</Text>
                </Box>
                <Box style={{ flex: 1, textAlign: 'center' }}>
                  <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Duration</Text>
                  <Text size="3" weight="bold">{totalDuration}s</Text>
                </Box>
              </Flex>
            </Box>

            {/* Filter Tabs - Request Status & Test Results */}
            <Box p="3" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <Flex direction="column" gap="2">
                {/* Labels */}
                <Flex gap="3">
                  <Box style={{ flex: 1 }}>
                    <Text size="1" weight="medium" color="gray">Request Status</Text>
                  </Box>
                  <Box style={{ width: '1px', backgroundColor: 'var(--gray-6)' }} />
                  <Box style={{ flex: 1 }}>
                    <Text size="1" weight="medium" color="gray">Test Results</Text>
                  </Box>
                </Flex>

                {/* Filter Tabs */}
                <Flex gap="3" align="center">
                  {/* Request Status Filter */}
                  <Box style={{ flex: 1 }}>
                    <Tabs.Root value={requestStatusFilter} onValueChange={(value) => setRequestStatusFilter(value as RequestStatusFilter)}>
                      <Tabs.List>
                        <Tabs.Trigger value="all">
                          All <Badge size="1" ml="1">{counts.all}</Badge>
                        </Tabs.Trigger>
                        <Tabs.Trigger value="success">
                          Success <Badge size="1" ml="1" color="green">{counts.success}</Badge>
                        </Tabs.Trigger>
                        <Tabs.Trigger value="errors">
                          Errors <Badge size="1" ml="1" color="red">{counts.errors}</Badge>
                        </Tabs.Trigger>
                      </Tabs.List>
                    </Tabs.Root>
                  </Box>

                  {/* Separator */}
                  <Box style={{ width: '1px', height: '32px', backgroundColor: 'var(--gray-6)' }} />

                  {/* Test Results Filter */}
                  <Box style={{ flex: 1 }}>
                    <Tabs.Root value={testResultFilter} onValueChange={(value) => {
                      setTestResultFilter(value as TestResultFilter);
                      // Reset request status filter to 'all' when changing test result filter
                      if (value !== 'all') {
                        setRequestStatusFilter('all');
                      }
                    }}>
                      <Tabs.List>
                        <Tabs.Trigger value="all">
                          All <Badge size="1" ml="1">{counts.testsAll}</Badge>
                        </Tabs.Trigger>
                        <Tabs.Trigger value="passed">
                          Passed <Badge size="1" ml="1" color="green">{counts.testsPassed}</Badge>
                        </Tabs.Trigger>
                        <Tabs.Trigger value="failed">
                          Failed <Badge size="1" ml="1" color="red">{counts.testsFailed}</Badge>
                        </Tabs.Trigger>
                        <Tabs.Trigger value="skipped">
                          No Tests <Badge size="1" ml="1" color="orange">{counts.testsSkipped}</Badge>
                        </Tabs.Trigger>
                      </Tabs.List>
                    </Tabs.Root>
                  </Box>
                </Flex>
              </Flex>
            </Box>

            {/* Two-Panel Layout */}
            <Flex style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              {/* Left Panel: Request Cards (40%) */}
              <Box
                style={{
                  width: selectedRequest ? '40%' : '100%',
                  borderRight: selectedRequest ? '1px solid var(--gray-6)' : 'none',
                  minHeight: 0,
                  flex: 1,
                  overflow: 'auto'
                }}
              >
                <Box p="3">
                  <Flex direction="column" gap="2">
                    {filteredResults.length === 0 ? (
                      <Card>
                        <Flex align="center" justify="center" p="4">
                          <Text size="2" color="gray">No requests match the current filters</Text>
                        </Flex>
                      </Card>
                    ) : (
                      filteredResults.map(result => (
                        <RequestCard
                          key={result.requestId}
                          result={result}
                          isSelected={result.requestId === selectedRequestId}
                          onClick={() => handleRequestClick(result.requestId)}
                        />
                      ))
                    )}
                  </Flex>
                </Box>
              </Box>

              {/* Right Panel: Detail Panel (60%, toggleable) */}
              {selectedRequest && (
                <Box style={{ width: '60%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <DetailPanel
                    result={selectedRequest}
                    onClose={() => setSelectedRequestId(null)}
                    onCopy={handleCopy}
                  />
                </Box>
              )}
            </Flex>
          </Flex>
        </Box>

        {showIterationBar && (
          <Box
            style={{
              width: '30px',
              borderLeft: '1px solid var(--gray-6)',
              backgroundColor: 'var(--gray-2)',
              overflow: 'auto'
            }}
          >
            <Flex direction="column" gap="1" p="1">
              {iterationState.iterationsSeen.map(iteration => {
                const isActive = iteration === effectiveIteration;
                return (
                  <Button
                    key={iteration}
                    size="1"
                    variant={isActive ? 'solid' : 'ghost'}
                    color={isActive ? 'blue' : 'gray'}
                    onClick={() => {
                      setSelectedIteration(iteration);
                      setHasManualIterationSelection(true);
                    }}
                    style={{
                      width: '100%',
                      justifyContent: 'center'
                    }}
                  >
                    {iteration}
                  </Button>
                );
              })}
            </Flex>
          </Box>
        )}
      </Flex>
    </Flex>
  );
}

// Request Card Component (with always-expanded tests)
interface RequestCardProps {
  result: RequestResult;
  isSelected: boolean;
  onClick: () => void;
}

function RequestCard({ result, isSelected, onClick }: RequestCardProps) {
  const protocol = result.metadata?.protocol;
  const plugin = protocol ? pluginLoader.getProtocolPluginUI(protocol) : null;
  const requestPath = result.requestPath?.startsWith('request:/')
    ? result.requestPath.replace('request:/', '')
    : result.requestPath?.startsWith('/')
      ? result.requestPath.slice(1)
      : result.requestPath;
  // Build breadcrumb segments from request path.
  const requestPathSegments = requestPath ? requestPath.split('/') : [];
  
  // Build Request and ProtocolResponse for summaryLine
  const request = result.requestData ? {
    type: 'request' as const,
    id: result.requestId,
    name: result.requestName,
    data: result.requestData
  } : undefined;

  const response = result.responseData ? {
    data: result.responseData.rawData,
    summary: {
      duration: result.duration,
      outcome: result.responseData.outcome,
      code: result.responseData.code,
      label: result.responseData.summary,
      message: result.responseData.detail
    }
  } : undefined;

  // Get summary including summaryLine component
  const summary = request && plugin ? plugin.getSummary(request, response) : null;
  const SummaryLine = summary?.summaryLine;

  return (
    <Card
      style={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'var(--gray-3)' : 'transparent',
        transition: 'background-color 0.2s'
      }}
      onClick={onClick}
    >
      <Flex direction="column" gap="2">
        {requestPathSegments.length > 0 && (
          <Flex align="center" gap="1" style={{ flexWrap: 'wrap' }}>
            {requestPathSegments.map((segment, index) => {
              const isLast = index === requestPathSegments.length - 1;
              return (
                <React.Fragment key={`${segment}-${index}`}>
                  {index > 0 && (
                    <Text size="1" color="blue" style={{ fontFamily: 'var(--font-mono)' }}>
                      /
                    </Text>
                  )}
                  <Text
                    size="1"
                    color={isLast ? 'blue' : 'blue'}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {segment}
                  </Text>
                </React.Fragment>
              );
            })}
          </Flex>
        )}

        {/* Request Header: Use plugin summaryLine or fallback */}
        {SummaryLine && request && response ? (
          <SummaryLine
            request={request}
            response={response}
            uiContext={pluginLoader.getUIContext()}
            uiState={{ theme: pluginLoader.getUIContext().theme }}
          />
        ) : (
          <Flex align="center" justify="between">
            <Text size="2" weight="medium">{result.requestName}</Text>
            <Flex align="center" gap="2">
              <Text size="1" color="gray">
                {result.status === 'pending' ? 'Pending' : result.status === 'running' ? 'Running...' : result.status}
              </Text>
              {result.status !== 'pending' && result.status !== 'running' && (
                <Text size="1" color="gray">({result.duration}ms)</Text>
              )}
            </Flex>
          </Flex>
        )}

        {/* Tests (Always Expanded) */}
        <Box pl="3" style={{ backgroundColor: 'transparent' }}>
          <Flex direction="column" gap="1">
            {result.tests.length > 0 ? (
              result.tests.map((test, idx) => (
                <Flex
                  key={idx}
                  align="start"
                  gap="2"
                  style={{
                    padding: '0px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--gray-2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Text
                    size="1"
                    weight="bold"
                    style={{
                      color: test.passed ? 'var(--green-9)' : 'var(--red-9)',
                      minWidth: '20px',
                      flexShrink: 0,
                      paddingTop: '5px',
                    }}
                  >
                    {test.passed ? 'PASS' : 'FAIL'}
                  </Text>
                  <Box style={{ flex: 1 }}>
                    <Text size="1" style={{ color: test.passed ? 'var(--green-11)' : 'var(--red-11)' }}>
                      {test.name}
                    </Text>
                    {test.error && (
                      <Text size="1" style={{ color: 'var(--red-10)', fontFamily: 'var(--font-mono)', marginTop: '2px', marginLeft:'10px' }}>
                        {test.error}
                      </Text>
                    )}
                  </Box>
                </Flex>
              ))
            ) : (
              <Flex align="center" gap="2" style={{ padding: '4px 8px' }}>
                <Text size="1" color="gray">No tests</Text>
              </Flex>
            )}
          </Flex>
        </Box>
      </Flex>
    </Card>
  );
}

// Detail Panel Component (Request/Response/Metadata tabs)
interface DetailPanelProps {
  result: RequestResult;
  onClose: () => void;
  onCopy: (text: string) => void;
}

function DetailPanel({ result, onClose, onCopy }: DetailPanelProps) {
  return (
    <Flex direction="column" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Flex align="center" justify="between" p="3" style={{ borderBottom: '1px solid var(--gray-6)' }}>
        <Text size="2" weight="medium">Request Details</Text>
        <Button size="1" variant="ghost" onClick={onClose}>×</Button>
      </Flex>

      {/* Tabs */}
      <Tabs.Root defaultValue="details" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box p="3" style={{ borderBottom: '1px solid var(--gray-6)' }}>
          <Tabs.List>
            <Tabs.Trigger value="details">Details</Tabs.Trigger>
            <Tabs.Trigger value="metadata">Metadata</Tabs.Trigger>
          </Tabs.List>
        </Box>

        <Box style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Tabs.Content value="details" style={{ height: '100%', overflow: 'auto' }}>
            <DetailsTab result={result} />
          </Tabs.Content>

          <Tabs.Content value="metadata" style={{ height: '100%', overflow: 'auto' }}>
            <Box p="3">
              <MetadataTab result={result} />
            </Box>
          </Tabs.Content>
        </Box>
      </Tabs.Root>
    </Flex>
  );
}

// Details Tab - Use plugin detailView
interface DetailsTabProps {
  result: RequestResult;
}

function DetailsTab({ result }: DetailsTabProps) {
  const protocol = result.metadata?.protocol;
  const plugin = protocol ? pluginLoader.getProtocolPluginUI(protocol) : null;
  
  // Convert RequestResult to Request and ProtocolResponse
  const request = result.requestData ? {
    type: 'request' as const,
    id: result.requestId,
    name: result.requestName,
    data: result.requestData
  } : undefined;

  const response = result.responseData ? {
    data: result.responseData.rawData,
    summary: {
      duration: result.duration,
      outcome: result.responseData.outcome,
      code: result.responseData.code,
      label: result.responseData.summary,
      message: result.responseData.detail
    }
  } : undefined;

  if (!response) {
    return (
      <Box p="4">
        <Text size="2" color="gray">No response data available</Text>
      </Box>
    );
  }

  // Get response summary which includes detailView component
  const summary = request && plugin ? plugin.getSummary(request, response) : null;
  const DetailView = summary?.detailView;

  // If plugin provides detailView, use it
  if (DetailView) {
    const uiContext = pluginLoader.getUIContext();
    const uiState = {
      theme: uiContext.theme
    };
    
    return (
      <DetailView
        request={request}
        response={response}
        events={undefined}
        uiContext={uiContext}
        uiState={uiState}
      />
    );
  }

  // Fallback: show basic info
  return (
    <Box p="4">
      <Flex direction="column" gap="3">
        <Box>
          <Text size="1" color="gray" mb="1">Request</Text>
          <Code size="2" style={{ display: 'block', padding: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(request?.data, null, 2)}
          </Code>
        </Box>
        <Box>
          <Text size="1" color="gray" mb="1">Response</Text>
          <Code size="2" style={{ display: 'block', padding: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '400px', overflow: 'auto' }}>
            {typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)}
          </Code>
        </Box>
      </Flex>
    </Box>
  );
}

// Metadata Tab
interface MetadataTabProps {
  result: RequestResult;
}

function MetadataTab({ result }: MetadataTabProps) {
  return (
    <Flex direction="column" gap="3">
      {/* Protocol Info */}
      <Box>
        <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Protocol</Text>
        <Text size="2">{result.metadata?.protocol || 'Unknown'}</Text>
      </Box>

      {/* Timing */}
      <Box>
        <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Duration</Text>
        <Text size="2">{result.duration}ms</Text>
      </Box>

      {/* Timestamp */}
      {result.metadata?.timestamp && (
        <Box>
          <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Timestamp</Text>
          <Text size="2" style={{ fontFamily: 'var(--font-mono)' }}>
            {new Date(result.metadata.timestamp).toISOString()}
          </Text>
        </Box>
      )}

      {/* Error */}
      {result.metadata?.error && (
        <Box>
          <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Error</Text>
          <Code size="2" style={{ display: 'block', padding: '8px', color: 'var(--red-11)', backgroundColor: 'var(--red-2)' }}>
            {result.metadata.error}
          </Code>
        </Box>
      )}

      {/* Request ID */}
      <Box>
        <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Request ID</Text>
        <Text size="1" style={{ fontFamily: 'var(--font-mono)' }}>{result.requestId}</Text>
      </Box>
    </Flex>
  );
}

// Utility function
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
