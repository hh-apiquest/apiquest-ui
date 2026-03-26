import React, { useCallback, useMemo, type ReactElement } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Badge } from '@radix-ui/themes';
import type { Request, ProtocolResponse } from '@apiquest/types';
import type { IProtocolPluginUI, PluginUIContext, ReactiveUIState, ResponseTabProps, ResponseUITab } from '@apiquest/plugin-ui-types';
import { CheckIcon, MinusIcon, XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { buildSummary } from '../../utils/responseAdapters';
import type { ExecutionEvent } from '../../../types/execution';

interface ResponseViewerProps {
  request: Request | null;
  response: ProtocolResponse | null;
  events: ExecutionEvent[];
  error?: string;
  pluginUI: IProtocolPluginUI | undefined;
  uiContext: PluginUIContext;
  uiState: ReactiveUIState;
}

interface AssertionResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  error?: string;
}

function isAssertionEvent(event: ExecutionEvent): boolean {
  return event.type === 'assertion';
}

function toAssertionResult(event: ExecutionEvent): AssertionResult | null {
  if (!isAssertionEvent(event) || event.data?.test === undefined) {
    return null;
  }

  return {
    name: event.data.test.name ?? '',
    passed: event.data.test.passed === true,
    skipped: event.data.test.passed !== true && event.data.test.error === undefined,
    error: event.data.test.error
  };
}

function getRawSize(rawData: unknown): number {
  if (rawData === undefined || rawData === null) {
    return 0;
  }

  if (typeof rawData === 'string') {
    return new Blob([rawData]).size;
  }

  try {
    return new Blob([JSON.stringify(rawData)]).size;
  } catch {
    return 0;
  }
}

export function ResponseViewer({ request, response, events, error, pluginUI, uiContext, uiState }: ResponseViewerProps): ReactElement {
  const responseTabs = useMemo<ResponseUITab[]>(() => {
    if (pluginUI?.getResponseTabs === undefined) {
      return [];
    }

    return pluginUI.getResponseTabs();
  }, [pluginUI]);

  const assertions = useMemo(() => {
    return events
      .filter((event) => isAssertionEvent(event))
      .map((event) => toAssertionResult(event))
      .filter((assertion): assertion is AssertionResult => assertion !== null);
  }, [events]);

  const TestResultsResponseTab = useCallback((_props: ResponseTabProps): ReactElement => {
    return <TestResultsTab events={events} assertions={assertions} />;
  }, [events, assertions]);

  const testResultsTab = useMemo<ResponseUITab>(() => ({
    id: 'test-results',
    label: 'Test Results',
    position: 1000,
    component: TestResultsResponseTab
  }), [TestResultsResponseTab]);

  const allTabs = useMemo<ResponseUITab[]>(() => {
    return [...responseTabs, testResultsTab].sort((left, right) => (left.position ?? 50) - (right.position ?? 50));
  }, [responseTabs, testResultsTab]);

  const summaryView = useMemo(() => {
    if (request === null) {
      return null;
    }

    return buildSummary(request, response ?? undefined, pluginUI);
  }, [request, response, pluginUI]);

  const metadata = useMemo(() => {
    if (response === null) {
      return null;
    }

    const passed = assertions.filter((assertion) => assertion.passed).length;
    const failed = assertions.filter((assertion) => !assertion.passed && !assertion.skipped).length;

    return {
      summary: summaryView,
      duration: summaryView?.duration ?? 0,
      size: getRawSize(summaryView?.rawData),
      tests: { passed, failed, total: assertions.length }
    };
  }, [response, assertions, summaryView]);

  if (response === null) {
    if (error !== undefined && error !== '') {
      // Script or execution error (not HTTP error)
      // Extract clean error message from IPC error
      let cleanError = error;
      const match = error.match(/Error: (.+)$/);
      if (match !== null) {
        cleanError = match[1];
      }
      
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: 'var(--gray-2)', borderColor: 'var(--gray-6)' }}>
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium" style={{ color: '#dc2626' }}>Execution Failed</span>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex items-center justify-center">
            <div className="text-center" style={{ maxWidth: '500px', padding: '2rem' }}>
              <ExclamationTriangleIcon className="w-10 h-10 mx-auto mb-4" style={{ color: '#dc2626' }} />
              <div className="text-sm" style={{ color: 'var(--gray-11)' }}>{cleanError}</div>
            </div>
          </div>
        </div>
      );
    }
    
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--gray-9)' }}>
        <div className="text-center">
          <div className="text-sm">No response yet</div>
          <div className="text-xs mt-1">Click Send to execute the request</div>
        </div>
      </div>
    );
  }

  if (request === null) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--gray-9)' }}>
        <div className="text-center">
          <div className="text-sm">Request context unavailable</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: 'var(--gray-2)', borderColor: 'var(--gray-6)' }}>
        <div className="flex items-center gap-4">
          {metadata?.summary !== undefined && metadata.summary !== null && (
            <div className="flex items-center gap-2">
              <Badge color={getSummaryBadgeColor(metadata.summary.statusLevel)} size="1" style={{ fontSize: '11px' }}>
                {metadata.summary.statusLabel}
              </Badge>
              {metadata.summary.statusDetail !== undefined && metadata.summary.statusDetail !== '' && (
                <span className="text-xs" style={{ color: 'var(--gray-10)' }}>
                  {metadata.summary.statusDetail}
                </span>
              )}
            </div>
          )}

          {metadata !== null && metadata.tests.total > 0 && (
            <span className="text-xs" style={{ color: 'var(--gray-10)' }}>
              Tests: {metadata.tests.passed}/{metadata.tests.total} passed
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--gray-9)' }}>
          {metadata?.duration !== undefined && metadata.duration > 0 && (
            <span>{metadata.duration}ms</span>
          )}
          <span>Size: {formatBytes(metadata?.size ?? 0)}</span>
        </div>
      </div>

      {summaryView?.error !== undefined && summaryView.error !== '' && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--gray-6)', background: '#fee2e2', color: '#b91c1c' }}>
          <div className="text-xs font-medium" style={{ marginBottom: '4px' }}>Request Failed</div>
          <div className="text-xs">{summaryView.error}</div>
        </div>
      )}

      <div className="flex-1 overflow-hidden min-h-0">
        <Tabs.Root defaultValue={allTabs[0]?.id ?? 'test-results'} className="flex flex-col h-full">
          <Tabs.List className="flex items-center border-b px-4 editor-tabs-list" style={{ borderColor: 'var(--gray-6)' }}>
            {allTabs.map((tab) => (
              <Tabs.Trigger
                key={tab.id}
                value={tab.id}
                className="px-4 py-2 text-sm font-medium editor-tab-trigger"
              >
                {tab.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <div className="flex-1 overflow-hidden min-h-0">
            {allTabs.map((tab) => {
              const TabComponent = tab.component;
              console.log('[ResponseViewer] Rendering tab:', {
                tabId: tab.id,
                hasResponse: response !== null,
                responseKeys: Object.keys(response),
                response
              });

              return (
                <Tabs.Content key={tab.id} value={tab.id} className="h-full overflow-auto min-h-0 box-border">
                  <TabComponent
                    request={request}
                    response={response}
                    uiContext={uiContext}
                    uiState={uiState}
                  />
                </Tabs.Content>
              );
            })}
          </div>
        </Tabs.Root>
      </div>
    </div>
  );
}

function getSummaryBadgeColor(statusLevel: string | undefined): 'green' | 'orange' | 'red' | 'gray' {
  switch (statusLevel) {
    case 'success':
      return 'green';
    case 'warning':
      return 'orange';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
}

interface TestResultsTabProps {
  events: ExecutionEvent[];
  assertions: AssertionResult[];
}

function TestResultsTab({ assertions }: TestResultsTabProps): ReactElement {
  const stats = useMemo(() => {
    const passed = assertions.filter((assertion) => assertion.passed).length;
    const failed = assertions.filter((assertion) => !assertion.passed && !assertion.skipped).length;
    const skipped = assertions.filter((assertion) => assertion.skipped).length;

    return { passed, failed, skipped, total: assertions.length };
  }, [assertions]);

  if (assertions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--gray-9)' }}>
        <div className="text-center">
          <div className="text-sm" style={{ marginBottom: '4px' }}>No tests defined</div>
          <div className="text-xs">Add assertions in the Scripts tab</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1" style={{ color: '#16a34a' }}>
          <CheckIcon className="w-4 h-4" />
          {stats.passed} Passed
        </span>
        {stats.failed > 0 && (
          <span className="inline-flex items-center gap-1" style={{ color: '#dc2626' }}>
            <XMarkIcon className="w-4 h-4" />
            {stats.failed} Failed
          </span>
        )}
        {stats.skipped > 0 && (
          <span className="inline-flex items-center gap-1" style={{ color: 'var(--gray-9)' }}>
            <MinusIcon className="w-4 h-4" />
            {stats.skipped} Skipped
          </span>
        )}
        <span style={{ color: 'var(--gray-9)' }}>({stats.total} total)</span>
      </div>

      <div className="flex flex-col gap-1">
        {assertions.map((assertion, idx) => (
          <div
            key={idx}
            className="p-2 rounded text-sm"
            style={{
              background: assertion.skipped ? 'var(--gray-3)' : assertion.passed ? '#dcfce7' : '#fee2e2',
              color: assertion.skipped ? 'var(--gray-9)' : assertion.passed ? '#15803d' : '#b91c1c'
            }}
          >
            <div className="flex items-start gap-2">
              {assertion.skipped ? (
                <MinusIcon className="w-3.5 h-3.5" style={{ marginTop: '2px' }} />
              ) : assertion.passed ? (
                <CheckIcon className="w-3.5 h-3.5" style={{ marginTop: '2px' }} />
              ) : (
                <XMarkIcon className="w-3.5 h-3.5" style={{ marginTop: '2px' }} />
              )}
              <div className="flex-1">
                <div>{assertion.name !== '' ? assertion.name : `Test ${idx + 1}`}</div>
                {assertion.error !== undefined && assertion.error !== '' && (
                  <div className="text-xs mt-1" style={{ opacity: 0.8 }}>{assertion.error}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
