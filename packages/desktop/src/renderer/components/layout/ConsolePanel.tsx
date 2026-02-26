// ConsolePanel - Compact bottom panel with Console/Network/Tests tabs
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { TrashIcon, ChevronUpIcon, ChevronDownIcon, EllipsisVerticalIcon, CheckIcon } from '@heroicons/react/24/outline';
import { useConsole, useNetwork } from '../../contexts';
import { ObjectViewer } from '../shared/ObjectViewer';
import type { ConsoleMessageLevel } from '../../types/console';
import type { NetworkEntry } from '../../types/network';
import { buildResponseRaw, buildSummary } from '../../utils/responseAdapters';
import { pluginLoader } from '../../services';

interface ConsolePanelProps {
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
}

export function ConsolePanel({ isMinimized, onToggleMinimize }: ConsolePanelProps = {}) {
  const { filter, setFilter, clear: clearConsole } = useConsole();
  const { clear: clearNetwork } = useNetwork();
  const [activeTab, setActiveTab] = useState('console');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [showLevels, setShowLevels] = useState(false);
  const [showPrettyJson, setShowPrettyJson] = useState(true);
  const levelOptions: ConsoleMessageLevel[] = useMemo(
    () => ['log', 'info', 'warn', 'error'],
    []
  );

  const handleTabOrIconClick = () => {
    if (isMinimized && onToggleMinimize) {
      onToggleMinimize();
    }
  };

  const handleClear = () => {
    if (activeTab === 'console') {
      clearConsole();
    } else if (activeTab === 'network') {
      clearNetwork();
    }
  };

  const toggleLevel = (level: ConsoleMessageLevel) => {
    const nextLevels = filter.levels.includes(level)
      ? filter.levels.filter(l => l !== level)
      : [...filter.levels, level];
    setFilter({ levels: nextLevels });
  };

  return (
    <Tabs.Root defaultValue="console" className="flex flex-col h-full" onValueChange={setActiveTab}>
      <Tabs.List className="flex border-b" style={{ background: 'var(--gray-2)' }}>
        <style>{`
          .console-tab-trigger[data-state=active] {
            background: var(--gray-3);
            border-bottom: 2px solid var(--accent-9);
          }
        `}</style>
        <div className="flex items-center">
          <Tabs.Trigger
            value="console"
            className="console-tab-trigger px-3 py-1.5 text-xs font-medium cursor-pointer border-none bg-transparent"
            onClick={handleTabOrIconClick}
          >
            Console
          </Tabs.Trigger>
          {!isMinimized && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="p-1 cursor-pointer border-none bg-transparent"
                  style={{ color: 'var(--gray-9)' }}
                  title="Console options"
                  onClick={handleTabOrIconClick}
                >
                  <EllipsisVerticalIcon className="w-4 h-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal container={document.querySelector('.radix-themes') || document.body}>
                <DropdownMenu.Content
                  style={{
                    minWidth: 200,
                    background: 'var(--color-background)',
                    border: '1px solid var(--gray-6)',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    padding: '6px',
                    zIndex: 50
                  }}
                >
                  <DropdownMenu.CheckboxItem
                    checked={autoScroll}
                    onCheckedChange={(checked) => setAutoScroll(!!checked)}
                    className="px-2 py-1 text-xs rounded cursor-pointer flex items-center gap-2"
                  >
                    <DropdownMenu.ItemIndicator>
                      <CheckIcon className="w-3 h-3" />
                    </DropdownMenu.ItemIndicator>
                    Auto-scroll to end
                  </DropdownMenu.CheckboxItem>
                  <DropdownMenu.CheckboxItem
                    checked={showTimestamps}
                    onCheckedChange={(checked) => setShowTimestamps(!!checked)}
                    className="px-2 py-1 text-xs rounded cursor-pointer flex items-center gap-2"
                  >
                    <DropdownMenu.ItemIndicator>
                      <CheckIcon className="w-3 h-3" />
                    </DropdownMenu.ItemIndicator>
                    Show timestamps
                  </DropdownMenu.CheckboxItem>
                  <DropdownMenu.CheckboxItem
                    checked={showLevels}
                    onCheckedChange={(checked) => setShowLevels(!!checked)}
                    className="px-2 py-1 text-xs rounded cursor-pointer flex items-center gap-2"
                  >
                    <DropdownMenu.ItemIndicator>
                      <CheckIcon className="w-3 h-3" />
                    </DropdownMenu.ItemIndicator>
                    Show level labels
                  </DropdownMenu.CheckboxItem>
                  <DropdownMenu.CheckboxItem
                    checked={showPrettyJson}
                    onCheckedChange={(checked) => setShowPrettyJson(!!checked)}
                    className="px-2 py-1 text-xs rounded cursor-pointer flex items-center gap-2"
                  >
                    <DropdownMenu.ItemIndicator>
                      <CheckIcon className="w-3 h-3" />
                    </DropdownMenu.ItemIndicator>
                    Pretty JSON
                  </DropdownMenu.CheckboxItem>

                  <DropdownMenu.Separator style={{ height: '1px', background: 'var(--gray-6)', margin: '6px 0' }} />
                  <div className="px-2 py-1 text-[10px] uppercase" style={{ color: 'var(--gray-9)' }}>Levels</div>
                  {levelOptions.map(level => (
                    <DropdownMenu.CheckboxItem
                      key={level}
                      checked={filter.levels.includes(level)}
                      onCheckedChange={() => toggleLevel(level)}
                      className="px-2 py-1 text-xs rounded cursor-pointer flex items-center gap-2"
                    >
                      <DropdownMenu.ItemIndicator>
                        <CheckIcon className="w-3 h-3" />
                      </DropdownMenu.ItemIndicator>
                      {level}
                    </DropdownMenu.CheckboxItem>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
        <Tabs.Trigger
          value="network"
          className="console-tab-trigger px-3 py-1.5 text-xs font-medium cursor-pointer border-none bg-transparent"
          onClick={handleTabOrIconClick}
        >
          Network
        </Tabs.Trigger>
        <div className="flex-1" />
        
        <button
          className="p-1 cursor-pointer border-none bg-transparent"
          style={{ color: 'var(--gray-9)' }}
          title={`Clear ${activeTab}`}
          onClick={handleClear}
        >
          <TrashIcon className="w-4 h-4" />
        </button>
        
        {onToggleMinimize && !isMinimized && (
          <button
            className="p-1 cursor-pointer border-none bg-transparent"
            style={{ color: 'var(--gray-9)' }}
            onClick={onToggleMinimize}
            title="Minimize"
          >
            <ChevronDownIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </Tabs.List>

      {!isMinimized && (
        <>
          <Tabs.Content value="console" className="flex-1 overflow-auto p-2">
            <ConsoleTab
              autoScroll={autoScroll}
              showTimestamps={showTimestamps}
              showLevels={showLevels}
              showPrettyJson={showPrettyJson}
            />
          </Tabs.Content>

          <Tabs.Content value="network" className="flex-1 overflow-auto p-2">
            <NetworkTab />
          </Tabs.Content>

          <Tabs.Content value="tests" className="flex-1 overflow-auto p-2">
            <TestsTab />
          </Tabs.Content>
        </>
      )}
    </Tabs.Root>
  );
}

function ConsoleTab({
  autoScroll,
  showTimestamps,
  showLevels,
  showPrettyJson
}: {
  autoScroll: boolean;
  showTimestamps: boolean;
  showLevels: boolean;
  showPrettyJson: boolean;
}) {
  const { messages } = useConsole();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoScroll) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, autoScroll]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--gray-9)' }}>
        No console output
      </div>
    );
  }

  return (
    <div className="flex flex-col text-xs" style={{ fontFamily: 'monospace', gap: '2px' }}>
      {messages.map((msg) => {
        const parsedJson = showPrettyJson ? tryParseJson(msg.message) : null;

        return (
          <div key={msg.id} className="flex gap-2 items-start">
            {showTimestamps && (
              <span style={{ color: 'var(--gray-9)' }}>{msg.timestamp.toLocaleTimeString()}</span>
            )}
            {showLevels && (
              <span style={{ color: getLogColor(msg.level) }}>[{msg.level}]</span>
            )}
            {parsedJson ? (
              <ObjectViewer data={parsedJson} />
            ) : (
              <span style={{ color: getLogColor(msg.level) }}>{msg.message}</span>
            )}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function NetworkTab() {
  const { entries } = useNetwork();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(320);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedId && entries.length > 0) {
      setSelectedId(entries[0].id);
      return;
    }

    if (selectedId && !entries.some(entry => entry.id === selectedId)) {
      setSelectedId(entries[0]?.id ?? null);
    }
  }, [entries, selectedId]);

  const selectedEntry = useMemo(
    () => entries.find(entry => entry.id === selectedId) ?? null,
    [entries, selectedId]
  );

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = listWidth;
    const containerRect = containerRef.current?.getBoundingClientRect();
    const maxWidth = containerRect ? Math.max(240, containerRect.width - 240) : 800;

    const onMove = (ev: PointerEvent) => {
      const next = clamp(startWidth + (ev.clientX - startX), 220, maxWidth);
      setListWidth(next);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--gray-9)' }}>
        No network activity
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full border" style={{ borderColor: 'var(--gray-6)' }}>
      <div
        className="flex flex-col"
        style={{
          borderColor: 'var(--gray-6)',
          width: listWidth,
          minWidth: 220
        }}
      >
        <div className="flex-1 overflow-auto">
          {entries.map((entry) => {
            const url = getEntryUrl(entry);
            const duration = getEntryDuration(entry);
            const isSelected = entry.id === selectedId;

            const protocol = entry.protocol;
            const plugin = protocol ? pluginLoader.getProtocolPluginUI(protocol) : null;
            const summaryView = entry.responseSummary ?? (entry.request ? buildSummary(entry.request, entry.response, plugin) : null);
            const summaryLabel = summaryView?.statusLabel ?? '';
            const summaryDetail = summaryView?.statusDetail ?? '';
            const statusText = [summaryLabel, summaryDetail].filter(Boolean).join(' ');
            const SummaryLine = summaryView?.summaryLine || null;
            const fallbackLine = [entry.requestName, url, statusText, duration !== undefined ? `${duration} ms` : '']
              .filter(Boolean)
              .join('  ');


            return (
              <button
                key={entry.id}
                onClick={() => setSelectedId(entry.id)}
                className="w-full text-left px-2 py-1 border-b"
                style={{
                  borderColor: 'var(--gray-6)',
                  background: isSelected ? 'var(--gray-3)' : 'transparent'
                }}
              >
                <div className="flex items-center text-xs" style={{ color: 'var(--gray-11)' }}>
                    {SummaryLine && (entry.request || entry.response) ? (
                      <div className="flex items-center min-w-0 flex-1" style={{ overflow: 'hidden' }}>
                              <SummaryLine
                                request={entry.request}
                                response={entry.response}
                                uiContext={pluginLoader.getUIContext()}
                                uiState={pluginLoader.getUIContext()}
                              />
                      </div>
                  ) : (
                    <span className="truncate" title={fallbackLine} style={{ minWidth: 0 }}>
                      {fallbackLine || entry.requestName || '—'}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="resize-bar"
        onPointerDown={startResize}
        style={{ width: '1px', cursor: 'ew-resize', background: 'var(--gray-6)', WebkitAppRegion: 'no-drag' } as any}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {selectedEntry ? (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--gray-6)' }}>
              <div className="flex items-center gap-2 text-xs flex-1 min-w-0">
                {(() => {
                  const protocol = selectedEntry.protocol;
                  const plugin = protocol ? pluginLoader.getProtocolPluginUI(protocol) : null;
                  const badge = plugin && selectedEntry.request ? plugin.getRequestBadge(selectedEntry.request) : null;
                  const badgeColor = badge?.color || 'var(--gray-10)';
                  const badgeText = badge?.primary || getEntryMethod(selectedEntry);
                  
                  return (
                    <span style={{ color: badgeColor }}>
                      {badgeText}
                    </span>
                  );
                })()}
                <span
                  className="truncate flex-1 min-w-0"
                  style={{ color: 'var(--gray-11)' }}
                  title={getEntryUrl(selectedEntry)}
                >
                  {getEntryUrl(selectedEntry)}
                </span>
                <span style={{ color: getStatusColor(getEntryStatusLabel(selectedEntry)) }}>
                  {getEntryStatusLabel(selectedEntry) ?? '—'}
                </span>
                <span style={{ color: 'var(--gray-9)' }}>
                  {getEntryDuration(selectedEntry) !== undefined
                    ? `${getEntryDuration(selectedEntry)} ms`
                    : '—'}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-hidden" style={{ fontFamily: 'monospace' }}>
              {renderDetailView(selectedEntry)}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--gray-9)' }}>
            Select a request to view details
          </div>
        )}
      </div>
    </div>
  );
}

function TestsTab() {
  return (
    <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--gray-9)' }}>
      No test results
    </div>
  );
}

function tryParseJson(message: string): unknown | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function getEntryMethod(entry: NetworkEntry): string {
  const method = entry.request?.data?.method as string | undefined;
  if (!method) return 'REQUEST';
  return String(method).toUpperCase();
}

function getEntryUrl(entry: NetworkEntry): string {
  return (
    (entry.request?.data?.url as string) ||
    entry.path ||
    entry.requestName ||
    ''
  );
}

function getEntryStatusLabel(entry: NetworkEntry): string | undefined {
  return entry.responseSummary?.statusLabel;
}

function getEntryDuration(entry: NetworkEntry): number | undefined {
  const summaryDuration = entry.response?.summary.duration;
  if (typeof summaryDuration === 'number') return summaryDuration;
  if (typeof entry.endTime === 'number') {
    return Math.max(0, entry.endTime - entry.startTime);
  }
  return undefined;
}

function getMethodColor(method: string): string {
  switch (method) {
    case 'GET':
      return 'var(--green-11)';
    case 'POST':
      return 'var(--orange-10)';
    case 'PUT':
      return 'var(--blue-10)';
    case 'DELETE':
      return 'var(--red-10)';
    case 'PATCH':
      return 'var(--purple-10)';
    default:
      return 'var(--gray-10)';
  }
}

function getStatusColor(status?: string): string {
  if (!status) return 'var(--gray-9)';
  
  const numStatus = parseInt(status, 10);
  if (!isNaN(numStatus)) {
    if (numStatus >= 400) return '#ef4444';
    if (numStatus >= 200) return '#22c55e';
  }
  
  const statusLower = status.toLowerCase();
  if (statusLower.includes('error') || statusLower.includes('fail')) return '#ef4444';
  if (statusLower.includes('success') || statusLower.includes('ok') || statusLower === '200') return '#22c55e';
  
  return 'var(--gray-9)';
}

function getRequestHeaders(entry: NetworkEntry): Record<string, string> {
  const headers = (entry.request?.data?.headers as Record<string, string>) || {};
  return headers;
}

function getRequestBody(entry: NetworkEntry): string | undefined {
  const body = entry.request?.data?.body;
  if (body === undefined || body === null) return undefined;

  if (typeof body === 'string') return body;

  if (typeof body === 'object') {
    const bodyObj = body as any;
    if (bodyObj?.mode === 'raw' && typeof bodyObj.raw === 'string') {
      return bodyObj.raw;
    }

    try {
      return JSON.stringify(bodyObj);
    } catch {
      return String(bodyObj);
    }
  }

  return String(body);
}

function formatHeaders(headers?: Record<string, string | string[]>): string[] {
  if (!headers) return [];
  return Object.entries(headers).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: ${value.join(', ')}`;
    }
    return `${key}: ${String(value)}`;
  });
}

function buildRawRequest(entry: NetworkEntry): string {
  // Protocol-agnostic: show request as JSON
  if (!entry.request) return 'No request data';
  
  try {
    return JSON.stringify(entry.request, null, 2);
  } catch {
    return String(entry.request);
  }
}

function buildRawResponse(entry: NetworkEntry): string {
  // Protocol-agnostic: show response as JSON
  if (!entry.response) return 'No response data';
  
  try {
    return JSON.stringify(entry.response, null, 2);
  } catch {
    return String(entry.response);
  }
}

function renderPrettyBody(body: string | undefined) {
  if (!body) {
    return <span style={{ color: 'var(--gray-9)' }}>Empty body</span>;
  }

  const parsed = tryParseJson(body);
  if (parsed) {
    return <ObjectViewer data={parsed} />;
  }

  return (
    <pre className="text-xs whitespace-pre-wrap" style={{ color: 'var(--gray-11)' }}>
      {body}
    </pre>
  );
}

function renderRawEntry(entry: NetworkEntry) {
  const requestRaw = buildRawRequest(entry);
  const responseRaw = buildRawResponse(entry);

  return (
    <div className="flex flex-col gap-3 text-xs" style={{ color: 'var(--gray-11)' }}>
      <div>
        <div className="text-[10px] uppercase" style={{ color: 'var(--gray-9)' }}>
          Request
        </div>
        <pre className="whitespace-pre-wrap">{requestRaw || '—'}</pre>
      </div>
      <div>
        <div className="text-[10px] uppercase" style={{ color: 'var(--gray-9)' }}>
          Response
        </div>
        <pre className="whitespace-pre-wrap">{responseRaw || '—'}</pre>
      </div>
    </div>
  );
}

function renderPrettyEntry(entry: NetworkEntry) {
  const method = getEntryMethod(entry);
  const url = getEntryUrl(entry);
  const summaryView = entry.responseSummary ?? (entry.request ? buildSummary(entry.request, entry.response, null) : null);
  const status = summaryView?.statusLabel ?? '';
  const statusText = summaryView?.statusDetail ?? '';
  const requestHeaders = getRequestHeaders(entry);
  const requestBody = getRequestBody(entry);
  const responseRaw = buildResponseRaw(entry.response);

  return (
    <div className="flex flex-col gap-4 text-xs">
      <div>
        <div className="text-[10px] uppercase" style={{ color: 'var(--gray-9)' }}>
          Request
        </div>
        <div className="mt-1" style={{ color: 'var(--gray-11)' }}>
          {method} {url}
        </div>
        <div className="mt-2">
          <div className="text-[10px] uppercase" style={{ color: 'var(--gray-9)' }}>
            Headers
          </div>
          {Object.keys(requestHeaders).length > 0 ? (
            <ObjectViewer data={requestHeaders} />
          ) : (
            <span style={{ color: 'var(--gray-9)' }}>No headers</span>
          )}
        </div>
        <div className="mt-2">
          <div className="text-[10px] uppercase" style={{ color: 'var(--gray-9)' }}>
            Body
          </div>
          {renderPrettyBody(requestBody)}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase" style={{ color: 'var(--gray-9)' }}>
          Response
        </div>
        <div className="mt-1" style={{ color: getStatusColor(status) }}>
          {status ?? '—'} {statusText}
        </div>
        <div className="mt-2">
          <div className="text-[10px] uppercase" style={{ color: 'var(--gray-9)' }}>
            Raw Data
          </div>
          {responseRaw !== undefined && responseRaw !== null ? (
            <ObjectViewer data={responseRaw} />
          ) : (
            <span style={{ color: 'var(--gray-9)' }}>No response data</span>
          )}
        </div>
      </div>

      {entry.customEvents && entry.customEvents.length > 0 && (
        <div>
          <div className="text-[10px] uppercase" style={{ color: 'var(--gray-9)' }}>
            Events
          </div>
          <div className="flex flex-col gap-2 mt-2">
            {entry.customEvents.map((evt, index) => (
              <div key={`${evt.type}-${index}`} className="border rounded p-2" style={{ borderColor: 'var(--gray-6)' }}>
                <div className="text-[11px]" style={{ color: 'var(--gray-11)' }}>
                  {evt.type}
                </div>
                <ObjectViewer data={evt.data ?? null} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * renderDetailView - Delegate to plugin's detailView component
 * Falls back to JSON if plugin doesn't provide detailView
 */
function renderDetailView(entry: NetworkEntry) {
  const protocol = entry.protocol;
  const plugin = protocol ? pluginLoader.getProtocolPluginUI(protocol) : null;
  
  if (!entry.response) {
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--gray-9)' }}>
        No response data
      </div>
    );
  }

  // Get response summary which includes detailView component
  const summary = entry.request && plugin ? plugin.getSummary(entry.request, entry.response) : null;
  const DetailView = summary?.detailView;

  // If plugin provides detailView, use it
  if (DetailView) {
    const uiContext = pluginLoader.getUIContext();
    const uiState = {
      theme: uiContext.theme
    };
    
    return (
      <DetailView
        request={entry.request}
        response={entry.response}
        events={entry.customEvents}
        uiContext={uiContext}
        uiState={uiState}
      />
    );
  }

  // Fallback: show request and response as JSON
  return (
    <div className="flex flex-col gap-3 p-3 text-xs overflow-auto" style={{ color: 'var(--gray-11)' }}>
      <div>
        <div className="text-[10px] uppercase mb-2" style={{ color: 'var(--gray-9)' }}>
          Request
        </div>
        <ObjectViewer data={entry.request ?? null} />
      </div>
      <div>
        <div className="text-[10px] uppercase mb-2" style={{ color: 'var(--gray-9)' }}>
          Response
        </div>
        <ObjectViewer data={entry.response} />
      </div>
      {entry.customEvents && entry.customEvents.length > 0 && (
        <div>
          <div className="text-[10px] uppercase mb-2" style={{ color: 'var(--gray-9)' }}>
            Events
          </div>
          {entry.customEvents.map((evt, index) => (
            <div key={`${evt.type}-${index}`} className="mb-2">
              <div className="text-[11px] mb-1" style={{ color: 'var(--gray-11)' }}>
                {evt.type}
              </div>
              <ObjectViewer data={evt.data ?? null} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getLogColor(level: string): string {
  switch (level) {
    case 'error': return '#ef4444';
    case 'warn': return '#f59e0b';
    case 'info': return '#3b82f6';
    default: return 'var(--gray-10)';
  }
}
