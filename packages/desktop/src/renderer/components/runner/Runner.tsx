import React, { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Badge, Box, Button, Card, Code, Flex, Progress, Tabs, Text } from '@radix-ui/themes';
import type { CollectionItem, ProtocolResponse, Request } from '@apiquest/types';
import type { Tab, RunnerMetadata } from '../../contexts/TabContext';
import type { ExecutionEvent } from '../../../types/execution';
import { pluginLoader } from '../../services';
import { useWorkspace } from '../../contexts';
import { buildSummary } from '../../utils/responseAdapters';

interface RunnerProps {
  tab: Tab;
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface RequestResultResponseData {
  summary: string;
  detail?: string;
  outcome?: 'success' | 'error';
  code?: number | string;
  rawData?: unknown;
}

interface RequestResultMetadata {
  protocol?: string;
  timestamp?: number;
  error?: string;
}

interface RequestResult {
  requestId: string;
  requestName: string;
  requestPath?: string;
  status: 'success' | 'failed' | 'skipped' | 'running' | 'pending';
  duration: number;
  tests: TestResult[];
  requestData?: Request['data'];
  responseData?: RequestResultResponseData;
  metadata?: RequestResultMetadata;
}

type RequestStatusFilter = 'all' | 'success' | 'errors';
type TestResultFilter = 'all' | 'passed' | 'failed' | 'skipped';

function isRunnerMetadata(metadata: Tab['metadata']): metadata is RunnerMetadata {
  return metadata !== undefined && metadata !== null && 'runId' in metadata;
}

function hasNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value !== '';
}

function toRequestStatusFilter(value: string): RequestStatusFilter {
  if (value === 'success' || value === 'errors' || value === 'all') {
    return value;
  }

  return 'all';
}

function toTestResultFilter(value: string): TestResultFilter {
  if (value === 'passed' || value === 'failed' || value === 'skipped' || value === 'all') {
    return value;
  }

  return 'all';
}

function findRequests(items: CollectionItem[], targetIds: string[], namesMap: Map<string, string>): void {
  for (const item of items) {
    if (item.type === 'request' && targetIds.includes(item.id)) {
      namesMap.set(item.id, item.name);
      continue;
    }

    if (item.type === 'folder') {
      findRequests(item.items, targetIds, namesMap);
    }
  }
}

function buildRequestModel(result: RequestResult): Request | undefined {
  if (result.requestData === undefined) {
    return undefined;
  }

  return {
    type: 'request',
    id: result.requestId,
    name: result.requestName,
    data: result.requestData
  };
}

function buildResponseModel(result: RequestResult): ProtocolResponse | undefined {
  if (result.responseData === undefined) {
    return undefined;
  }

  const outcome = result.responseData.outcome ?? (result.metadata?.error !== undefined ? 'error' : 'success');

  return {
    data: result.responseData.rawData,
    summary: {
      duration: result.duration,
      outcome,
      code: result.responseData.code,
      label: result.responseData.summary,
      message: result.responseData.detail
    }
  };
}

function getRequestPathSegments(requestPath: string | undefined): string[] {
  if (!hasNonEmptyString(requestPath)) {
    return [];
  }

  const normalizedPath = requestPath.startsWith('request:/')
    ? requestPath.replace('request:/', '')
    : requestPath.startsWith('/')
      ? requestPath.slice(1)
      : requestPath;

  return normalizedPath === '' ? [] : normalizedPath.split('/');
}

export function Runner({ tab }: RunnerProps): ReactElement {
  const { workspace } = useWorkspace();
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatusFilter>('all');
  const [testResultFilter, setTestResultFilter] = useState<TestResultFilter>('all');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestNamesMap, setRequestNamesMap] = useState<Map<string, string>>(new Map());
  const [selectedIteration, setSelectedIteration] = useState<number | null>(null);
  const [hasManualIterationSelection, setHasManualIterationSelection] = useState(false);
  const metadata = isRunnerMetadata(tab.metadata) ? tab.metadata : null;
  const metadataCollectionId = metadata?.collectionId ?? '';
  const metadataSelectedRequests = useMemo(() => metadata?.selectedRequests ?? [], [metadata]);
  const metadataIterations = metadata?.config.iterations ?? 1;
  const isRunning = metadata?.status === 'running' || metadata?.status === 'pending';
  const events = useMemo<ExecutionEvent[]>(() => tab.execution?.events ?? [], [tab.execution?.events]);

  useEffect(() => {
    const loadRequestNames = async (): Promise<void> => {
      if (workspace === null || metadata === null || metadataCollectionId === '' || metadataSelectedRequests.length === 0) {
        return;
      }

      try {
        const collection = await window.quest.workspace.loadCollection(workspace.id, metadataCollectionId);
        const namesMap = new Map<string, string>();
        findRequests(collection.items, metadataSelectedRequests, namesMap);
        setRequestNamesMap(namesMap);
      } catch (error: unknown) {
        console.error('Failed to load request names:', error);
      }
    };

    void loadRequestNames();
  }, [workspace, metadata, metadataCollectionId, metadataSelectedRequests]);

  const iterationState = useMemo(() => {
    let maxIteration = 0;
    let totalIteration = 0;
    let currentIteration = 0;
    const iterationsSeen = new Set<number>();

    events.forEach((event: ExecutionEvent) => {
      const current = event.data?.iteration?.current;
      const total = event.data?.iteration?.total;

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

    const inferredCount = totalIteration > 0 ? totalIteration : maxIteration;
    const iterationCount = inferredCount > 0 ? inferredCount : metadataIterations;
    const orderedIterations = Array.from(iterationsSeen).sort((a, b) => a - b);
    const resolvedCurrentIteration = currentIteration > 0
      ? currentIteration
      : orderedIterations.length > 0
        ? orderedIterations[orderedIterations.length - 1]
        : 1;

    return {
      iterationCount,
      iterationsSeen: orderedIterations,
      currentIteration: resolvedCurrentIteration
    };
  }, [events, metadataIterations]);

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
  }, [showIterationBar, selectedIteration, hasManualIterationSelection, iterationState.currentIteration]);

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

    return events.filter((event) => event.data?.iteration?.current === effectiveIteration);
  }, [events, showIterationBar, effectiveIteration]);

  const requestResults = useMemo(() => {
    const resultsMap = new Map<string, RequestResult>();

    metadataSelectedRequests.forEach((requestId) => {
      resultsMap.set(requestId, {
        requestId,
        requestName: requestNamesMap.get(requestId) ?? requestId,
        status: 'pending',
        duration: 0,
        tests: [],
        metadata: {}
      });
    });

    const testsByRequest = new Map<string, TestResult[]>();
    const seenEventIds = new Set<string>();

    eventsForIteration.forEach((event: ExecutionEvent) => {
      const eventId = event.data?.id;
      if (hasNonEmptyString(eventId)) {
        if (seenEventIds.has(eventId)) {
          return;
        }
        seenEventIds.add(eventId);
      }

      if (event.type === 'beforeItem' && event.data?.request !== undefined) {
        const requestId = event.data.request.id;
        const existing = resultsMap.get(requestId);
        if (existing?.status === 'pending') {
          existing.status = 'running';
          existing.requestName = event.data.request.name !== '' ? event.data.request.name : existing.requestName;
        }
        if (existing !== undefined && hasNonEmptyString(event.data.path)) {
          existing.requestPath = event.data.path;
        }
        testsByRequest.set(requestId, []);
      }

      if (event.type === 'afterRequest' && event.data?.request !== undefined) {
        const requestId = event.data.request.id;
        const existing = resultsMap.get(requestId);
        if (existing !== undefined) {
          const request = event.data.request;
          const response = event.data.response;
          if (hasNonEmptyString(event.data.path)) {
            existing.requestPath = event.data.path;
          }
          const protocol = event.data.protocol;
          const plugin = hasNonEmptyString(protocol) ? pluginLoader.getProtocolPluginUI(protocol) : undefined;
          const summaryView = buildSummary(request, response, plugin);

          existing.requestData = request.data;
          existing.responseData = response !== undefined ? {
            summary: summaryView?.statusLabel ?? 'Complete',
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

      if (event.type === 'assertion' && event.data?.test !== undefined) {
        const requestId = event.data.request?.id;
        if (hasNonEmptyString(requestId)) {
          const tests = testsByRequest.get(requestId) ?? [];
          tests.push({
            name: event.data.test.name ?? 'Unnamed Test',
            passed: event.data.test.passed === true,
            error: event.data.test.error
          });
          testsByRequest.set(requestId, tests);
        }
      }

      if (event.type === 'afterItem' && event.data?.request !== undefined) {
        const requestId = event.data.request.id;
        const existing = resultsMap.get(requestId);

        if (existing !== undefined) {
          const result = event.data.result;
          existing.requestName = event.data.request.name !== '' ? event.data.request.name : existing.requestName;
          if (hasNonEmptyString(event.data.path)) {
            existing.requestPath = event.data.path;
          }

          if (result?.skipped === true) {
            existing.status = 'skipped';
          } else if (result?.error !== undefined || existing.metadata?.error !== undefined) {
            existing.status = 'failed';
          } else {
            const tests = testsByRequest.get(requestId) ?? [];
            const hasFailedTests = tests.some((test) => test.passed === false);
            existing.status = hasFailedTests ? 'failed' : 'success';
          }

          existing.tests = testsByRequest.get(requestId) ?? [];
        }
      }
    });

    return Array.from(resultsMap.values());
  }, [eventsForIteration, metadataSelectedRequests, requestNamesMap]);

  const completedCount = useMemo(() => {
    return requestResults.filter((result) => result.status === 'success' || result.status === 'failed' || result.status === 'skipped').length;
  }, [requestResults]);

  const totalRequests = metadataSelectedRequests.length;
  const progressValue = totalRequests > 0 ? Math.min((completedCount / totalRequests) * 100, 100) : 0;
  const startTime = events.find((event) => event.type === 'beforeRun')?.timestamp;
  const endTime = events.length > 0 ? events[events.length - 1].timestamp : undefined;
  const totalDuration = startTime !== undefined && endTime !== undefined ? Math.round((endTime - startTime) / 1000) : 0;

  const filteredResults = useMemo(() => {
    let filtered = requestResults;

    if (requestStatusFilter === 'success') {
      filtered = filtered.filter((result) => result.status === 'success');
    } else if (requestStatusFilter === 'errors') {
      filtered = filtered.filter((result) => result.status === 'failed' || result.status === 'skipped');
    }

    if (testResultFilter !== 'all') {
      filtered = filtered
        .map((result) => {
          let filteredTests = result.tests;

          if (testResultFilter === 'passed') {
            filteredTests = result.tests.filter((test) => test.passed);
          } else if (testResultFilter === 'failed') {
            filteredTests = result.tests.filter((test) => !test.passed);
          } else if (testResultFilter === 'skipped') {
            filteredTests = result.tests.length === 0 ? [] : result.tests;
          }

          return { ...result, tests: filteredTests };
        })
        .filter((result) => {
          if (testResultFilter === 'passed' || testResultFilter === 'failed') {
            return result.tests.length > 0;
          }
          if (testResultFilter === 'skipped') {
            return result.tests.length === 0;
          }
          return true;
        });
    }

    return filtered;
  }, [requestResults, requestStatusFilter, testResultFilter]);

  const counts = useMemo(() => {
    return {
      all: requestResults.length,
      success: requestResults.filter((result) => result.status === 'success').length,
      errors: requestResults.filter((result) => result.status === 'failed' || result.status === 'skipped').length,
      testsAll: requestResults.length,
      testsPassed: requestResults.filter((result) => result.tests.length > 0 && result.tests.every((test) => test.passed)).length,
      testsFailed: requestResults.filter((result) => result.tests.some((test) => !test.passed)).length,
      testsSkipped: requestResults.filter((result) => result.tests.length === 0).length
    };
  }, [requestResults]);

  const selectedRequest = useMemo(() => {
    return requestResults.find((result) => result.requestId === selectedRequestId) ?? null;
  }, [requestResults, selectedRequestId]);

  const handleRequestClick = (requestId: string): void => {
    setSelectedRequestId((previous) => previous === requestId ? null : requestId);
  };

  const handleCopy = (text: string): void => {
    void navigator.clipboard.writeText(text);
  };

  if (metadata === null) {
    return (
      <Box p="3">
        <Text size="2" color="gray">Runner metadata is unavailable.</Text>
      </Box>
    );
  }

  return (
    <Flex direction="column" style={{ height: '100%', overflow: 'hidden' }}>
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

            <Box p="3" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <Flex direction="column" gap="2">
                <Flex gap="3">
                  <Box style={{ flex: 1 }}>
                    <Text size="1" weight="medium" color="gray">Request Status</Text>
                  </Box>
                  <Box style={{ width: '1px', backgroundColor: 'var(--gray-6)' }} />
                  <Box style={{ flex: 1 }}>
                    <Text size="1" weight="medium" color="gray">Test Results</Text>
                  </Box>
                </Flex>

                <Flex gap="3" align="center">
                  <Box style={{ flex: 1 }}>
                    <Tabs.Root value={requestStatusFilter} onValueChange={(value) => setRequestStatusFilter(toRequestStatusFilter(value))}>
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

                  <Box style={{ width: '1px', height: '32px', backgroundColor: 'var(--gray-6)' }} />

                  <Box style={{ flex: 1 }}>
                    <Tabs.Root
                      value={testResultFilter}
                      onValueChange={(value) => {
                        const nextFilter = toTestResultFilter(value);
                        setTestResultFilter(nextFilter);
                        if (nextFilter !== 'all') {
                          setRequestStatusFilter('all');
                        }
                      }}
                    >
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

            <Flex style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              <Box
                style={{
                  width: selectedRequest !== null ? '40%' : '100%',
                  borderRight: selectedRequest !== null ? '1px solid var(--gray-6)' : 'none',
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
                      filteredResults.map((result) => (
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

              {selectedRequest !== null && (
                <Box style={{ width: '60%', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <DetailPanel result={selectedRequest} onClose={() => setSelectedRequestId(null)} onCopy={handleCopy} />
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
              {iterationState.iterationsSeen.map((iteration) => {
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
                    style={{ width: '100%', justifyContent: 'center' }}
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

interface RequestCardProps {
  result: RequestResult;
  isSelected: boolean;
  onClick: () => void;
}

function RequestCard({ result, isSelected, onClick }: RequestCardProps): ReactElement {
  const protocol = result.metadata?.protocol;
  const plugin = hasNonEmptyString(protocol) ? pluginLoader.getProtocolPluginUI(protocol) : undefined;
  const requestPathSegments = getRequestPathSegments(result.requestPath);
  const request = buildRequestModel(result);
  const response = buildResponseModel(result);
  const summary = request !== undefined && plugin !== undefined ? plugin.getSummary(request, response) : null;
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
            {requestPathSegments.map((segment, index) => (
              <React.Fragment key={`${segment}-${index}`}>
                {index > 0 && (
                  <Text size="1" color="blue" style={{ fontFamily: 'var(--font-mono)' }}>
                    /
                  </Text>
                )}
                <Text size="1" color="blue" style={{ fontFamily: 'var(--font-mono)' }}>
                  {segment}
                </Text>
              </React.Fragment>
            ))}
          </Flex>
        )}

        {SummaryLine !== undefined && request !== undefined && response !== undefined ? (
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

        <Box pl="3" style={{ backgroundColor: 'transparent' }}>
          <Flex direction="column" gap="1">
            {result.tests.length > 0 ? (
              result.tests.map((test, index) => (
                <Flex
                  key={`${test.name}-${index}`}
                  align="start"
                  gap="2"
                  style={{
                    padding: '0px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(event): void => {
                    event.currentTarget.style.backgroundColor = 'var(--gray-2)';
                  }}
                  onMouseLeave={(event): void => {
                    event.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Text
                    size="1"
                    weight="bold"
                    style={{
                      color: test.passed ? 'var(--green-9)' : 'var(--red-9)',
                      minWidth: '20px',
                      flexShrink: 0,
                      paddingTop: '5px'
                    }}
                  >
                    {test.passed ? 'PASS' : 'FAIL'}
                  </Text>
                  <Box style={{ flex: 1 }}>
                    <Text size="1" style={{ color: test.passed ? 'var(--green-11)' : 'var(--red-11)' }}>
                      {test.name}
                    </Text>
                    {hasNonEmptyString(test.error) && (
                      <Text size="1" style={{ color: 'var(--red-10)', fontFamily: 'var(--font-mono)', marginTop: '2px', marginLeft: '10px' }}>
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

interface DetailPanelProps {
  result: RequestResult;
  onClose: () => void;
  onCopy: (text: string) => void;
}

function DetailPanel({ result, onClose }: DetailPanelProps): ReactElement {
  return (
    <Flex direction="column" style={{ height: '100%', overflow: 'hidden' }}>
      <Flex align="center" justify="between" p="3" style={{ borderBottom: '1px solid var(--gray-6)' }}>
        <Text size="2" weight="medium">Request Details</Text>
        <Button size="1" variant="ghost" onClick={onClose}>×</Button>
      </Flex>

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

interface DetailsTabProps {
  result: RequestResult;
}

function DetailsTab({ result }: DetailsTabProps): ReactElement {
  const protocol = result.metadata?.protocol;
  const plugin = hasNonEmptyString(protocol) ? pluginLoader.getProtocolPluginUI(protocol) : undefined;
  const request = buildRequestModel(result);
  const response = buildResponseModel(result);

  if (response === undefined) {
    return (
      <Box p="4">
        <Text size="2" color="gray">No response data available</Text>
      </Box>
    );
  }

  const summary = request !== undefined && plugin !== undefined ? plugin.getSummary(request, response) : null;
  const DetailView = summary?.detailView;

  if (DetailView !== undefined) {
    const uiContext = pluginLoader.getUIContext();

    return (
      <DetailView
        request={request}
        response={response}
        events={undefined}
        uiContext={uiContext}
        uiState={{ theme: uiContext.theme }}
      />
    );
  }

  return (
    <Box p="4">
      <Flex direction="column" gap="3">
        <Box>
          <Text size="1" color="gray" mb="1">Request</Text>
          <Code size="2" style={{ display: 'block', padding: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(request?.data ?? null, null, 2)}
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

interface MetadataTabProps {
  result: RequestResult;
}

function MetadataTab({ result }: MetadataTabProps): ReactElement {
  return (
    <Flex direction="column" gap="3">
      <Box>
        <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Protocol</Text>
        <Text size="2">{result.metadata?.protocol ?? 'Unknown'}</Text>
      </Box>

      <Box>
        <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Duration</Text>
        <Text size="2">{result.duration}ms</Text>
      </Box>

      {result.metadata?.timestamp !== undefined && (
        <Box>
          <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Timestamp</Text>
          <Text size="2" style={{ fontFamily: 'var(--font-mono)' }}>
            {new Date(result.metadata.timestamp).toISOString()}
          </Text>
        </Box>
      )}

      {hasNonEmptyString(result.metadata?.error) && (
        <Box>
          <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Error</Text>
          <Code size="2" style={{ display: 'block', padding: '8px', color: 'var(--red-11)', backgroundColor: 'var(--red-2)' }}>
            {result.metadata.error}
          </Code>
        </Box>
      )}

      <Box>
        <Text size="1" color="gray" style={{ display: 'block', marginBottom: '4px' }}>Request ID</Text>
        <Text size="1" style={{ fontFamily: 'var(--font-mono)' }}>{result.requestId}</Text>
      </Box>
    </Flex>
  );
}
