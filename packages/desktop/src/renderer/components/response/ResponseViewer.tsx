import React, { useMemo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Badge } from '@radix-ui/themes';
import type { Request, ProtocolResponse } from '@apiquest/types';
import type { PluginUIContext, ReactiveUIState } from '@apiquest/plugin-ui-types';
import { CheckIcon, MinusIcon, XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { buildSummary } from '../../utils/responseAdapters';

interface ResponseViewerProps {
  request: Request | null;
  response: ProtocolResponse | null;
  events: any[];
  error?: string;
  pluginUI: any;
  uiContext: PluginUIContext;
  uiState: ReactiveUIState;
}
function getRawSize(rawData: unknown): number {
  if (rawData === undefined || rawData === null) return 0;
  if (typeof rawData === 'string') {
    return new Blob([rawData]).size;
  }
  try {
    return new Blob([JSON.stringify(rawData)]).size;
  } catch {
    return 0;
  }
}

export function ResponseViewer({ request, response, events, error, pluginUI, uiContext, uiState }: ResponseViewerProps) {
  const responseTabs = useMemo(() => {
    if (!pluginUI?.getResponseTabs) return [];
    return pluginUI.getResponseTabs();
  }, [pluginUI]);

  const testResultsTab = useMemo(() => ({
    id: 'test-results',
    label: 'Test Results',
    position: 1000,
    component: TestResultsTab
  }), []);

  const allTabs = useMemo(() => {
    return [...responseTabs, testResultsTab].sort((a, b) => (a.position || 50) - (b.position || 50));
  }, [responseTabs, testResultsTab]);

  const summaryView = useMemo(() => request ? buildSummary(request, response || undefined, pluginUI) : null, [request, response, pluginUI]);

  const metadata = useMemo(() => {
    if (!response) return null;
    
    const assertions = events.filter(e => e.type === 'assertion');
    const passed = assertions.filter(a => a.data?.test?.passed).length;
    const failed = assertions.filter(a => !a.data?.test?.passed && !a.data?.test?.skipped).length;

    return {
      summary: summaryView,
      duration: summaryView?.duration || 0,
      size: getRawSize(summaryView?.rawData),
      tests: { passed, failed, total: assertions.length }
    };
  }, [response, events, summaryView]);

  if (error || !response) {
    if (error) {
      // Script or execution error (not HTTP error)
      // Extract clean error message from IPC error
      let cleanError = error;
      const match = error.match(/Error: (.+)$/);
      if (match) {
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

  if (summaryView?.error) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: '#fee2e2', borderColor: 'var(--gray-6)' }}>
          <h3 className="text-xs font-medium" style={{ color: '#b91c1c' }}>Request Failed</h3>
          <div className="flex items-center gap-3 text-xs" style={{ color: '#dc2626' }}>
            <span>Time: {summaryView.duration || 0}ms</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div style={{ color: '#ef4444' }}>
            <div className="font-semibold mb-2">Error:</div>
            <pre className="text-sm p-3 rounded" style={{ background: '#fee2e2' }}>{summaryView.error}</pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: 'var(--gray-2)', borderColor: 'var(--gray-6)' }}>
        <div className="flex items-center gap-4">
          {metadata?.summary && (
            <div className="flex items-center gap-2">
              <Badge color={getSummaryBadgeColor(metadata.summary.statusLevel)} size="1" style={{ fontSize: '11px' }}>
                {metadata.summary.statusLabel}
              </Badge>
              {metadata.summary.statusDetail && (
                <span className="text-xs" style={{ color: 'var(--gray-10)' }}>
                  {metadata.summary.statusDetail}
                </span>
              )}
            </div>
          )}

          {metadata && metadata.tests.total > 0 && (
            <span className="text-xs" style={{ color: 'var(--gray-10)' }}>
              Tests: {metadata.tests.passed}/{metadata.tests.total} passed
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--gray-9)' }}>
          <span>Size: {formatBytes(metadata?.size || 0)}</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <Tabs.Root defaultValue={allTabs[0]?.id} className="flex flex-col h-full">
          <Tabs.List className="flex items-center border-b px-4 editor-tabs-list" style={{ borderColor: 'var(--gray-6)' }}>
            {allTabs.map(tab => (
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
            {allTabs.map(tab => {
              const TabComponent = tab.component;
              console.log('[ResponseViewer] Rendering tab:', {
                tabId: tab.id,
                hasResponse: !!response,
                responseKeys: response ? Object.keys(response) : [],
                response: response
              });
              return (
                <Tabs.Content key={tab.id} value={tab.id} className="h-full overflow-auto min-h-0 box-border">
                  <TabComponent
                    request={request!}
                    response={response}
                    events={events}
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

function TestResultsTab({events }: { events: any[] }) {
  const assertions = useMemo(() => {
    return events.filter(e => e.type === 'assertion').map(e => e.data);
  }, [events]);

  const stats = useMemo(() => {
    const passed = assertions.filter(a => a?.test?.passed).length;
    const failed = assertions.filter(a => !a?.test?.passed && !a?.test?.skipped).length;
    const skipped = assertions.filter(a => a?.test?.skipped).length;
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
              background: assertion.test?.skipped ? 'var(--gray-3)' : assertion.test?.passed ? '#dcfce7' : '#fee2e2',
              color: assertion.test?.skipped ? 'var(--gray-9)' : assertion.test?.passed ? '#15803d' : '#b91c1c'
            }}
          >
            <div className="flex items-start gap-2">
              {assertion.test?.skipped ? (
                <MinusIcon className="w-3.5 h-3.5" style={{ marginTop: '2px' }} />
              ) : assertion.test?.passed ? (
                <CheckIcon className="w-3.5 h-3.5" style={{ marginTop: '2px' }} />
              ) : (
                <XMarkIcon className="w-3.5 h-3.5" style={{ marginTop: '2px' }} />
              )}
              <div className="flex-1">
                <div>{assertion.test?.name || `Test ${idx + 1}`}</div>
                {assertion.test?.error && (
                  <div className="text-xs mt-1" style={{ opacity: 0.8 }}>{assertion.test.error}</div>
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
