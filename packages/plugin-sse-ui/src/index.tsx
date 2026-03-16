import React from 'react';
import type { IProtocolPluginUI, UITab, UITabProps, RequestBadge, RequestSummary, SummaryLineComponent, ResponseTabProps, ResponseUITab } from '@apiquest/plugin-ui-types';
import type { Request, ProtocolResponse } from '@apiquest/types';

import * as RT from '@radix-ui/themes';

interface SseRequestData {
  url?: string;
  timeout?: number;
}

interface SseMessage {
  event?: string;
  data?: string;
  id?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function getSseRequestData(request: Request): SseRequestData {
  const data = asRecord(request.data);
  if (data === null) {
    return {};
  }

  return {
    url: typeof data.url === 'string' ? data.url : undefined,
    timeout: typeof data.timeout === 'number' ? data.timeout : undefined,
  };
}

function patchSseRequestData(request: Request, patch: Partial<SseRequestData>): Request {
  const existingData = asRecord(request.data) ?? {};
  return {
    ...request,
    data: {
      ...existingData,
      ...patch,
    },
  };
}

function toSseMessages(response: ProtocolResponse | null | undefined): SseMessage[] {
  const responseData = asRecord(response?.data);
  if (responseData === null) {
    return [];
  }

  const eventsValue = responseData.events;
  if (!Array.isArray(eventsValue)) {
    return [];
  }

  return eventsValue.flatMap((item): SseMessage[] => {
    const record = asRecord(item);
    if (record === null) {
      return [];
    }

    return [
      {
        event: typeof record.event === 'string' ? record.event : undefined,
        data: typeof record.data === 'string' ? record.data : undefined,
        id: typeof record.id === 'string' ? record.id : undefined,
      },
    ];
  });
}

function SseConfigTab({ request, onChange }: UITabProps): React.ReactElement {
  const data = getSseRequestData(request);
  const url = data.url ?? '';
  const timeout = data.timeout ?? 30000;

  return (
    <RT.Box p="4">
      <RT.Flex direction="column" gap="4">
        <RT.Box>
          <RT.Text as="label" size="2" weight="medium" mb="2" style={{ display: 'block' }}>
            URL
          </RT.Text>
          <RT.TextField.Root
            value={url}
            onChange={(e) =>
              onChange(
                patchSseRequestData(request, {
                  url: (e.target as HTMLInputElement).value,
                })
              )
            }
            placeholder="https://example.com/events"
            size="2"
          />
        </RT.Box>

        <RT.Box>
          <RT.Text as="label" size="2" weight="medium" mb="2" style={{ display: 'block' }}>
            Timeout (ms)
          </RT.Text>
          <RT.TextField.Root
            type="number"
            value={String(timeout)}
            onChange={(e) =>
              onChange(
                patchSseRequestData(request, {
                  timeout: Number((e.target as HTMLInputElement).value),
                })
              )
            }
            placeholder="30000"
            size="2"
          />
        </RT.Box>
      </RT.Flex>
    </RT.Box>
  );
}

function SseMessagesTab({ response }: ResponseTabProps): React.ReactElement {
  const messages = toSseMessages(response);

  if (messages.length === 0) {
    return (
      <RT.Flex align="center" justify="center" height="100%" style={{ color: 'var(--gray-9)' }}>
        <RT.Box style={{ textAlign: 'center' }}>
          <RT.Text size="2" style={{ display: 'block', marginBottom: '4px' }}>
            No messages received
          </RT.Text>
          <RT.Text size="1" color="gray" style={{ display: 'block' }}>
            No SSE messages were received from the server
          </RT.Text>
        </RT.Box>
      </RT.Flex>
    );
  }

  return (
    <RT.Box p="4">
      <RT.Table.Root variant="surface" size="1">
        <RT.Table.Header>
          <RT.Table.Row>
            <RT.Table.ColumnHeaderCell>Index</RT.Table.ColumnHeaderCell>
            <RT.Table.ColumnHeaderCell>Event</RT.Table.ColumnHeaderCell>
            <RT.Table.ColumnHeaderCell>Data</RT.Table.ColumnHeaderCell>
            <RT.Table.ColumnHeaderCell>ID</RT.Table.ColumnHeaderCell>
          </RT.Table.Row>
        </RT.Table.Header>
        <RT.Table.Body>
          {messages.map((msg: { event?: string; data?: string; id?: string }, idx: number) => (
            <RT.Table.Row key={idx}>
              <RT.Table.Cell>
                <RT.Text as="span" size="1" color="gray">
                  {idx + 1}
                </RT.Text>
              </RT.Table.Cell>
              <RT.Table.Cell>
                <RT.Badge color="blue" variant="soft">
                  {msg.event !== undefined && msg.event.trim() !== '' ? msg.event : 'message'}
                </RT.Badge>
              </RT.Table.Cell>
              <RT.Table.Cell>
                <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)' }}>
                  {msg.data !== undefined && msg.data.trim() !== '' ? msg.data : '-'}
                </RT.Text>
              </RT.Table.Cell>
              <RT.Table.Cell>
                <RT.Text as="span" size="1" color="gray">
                  {msg.id !== undefined && msg.id.trim() !== '' ? msg.id : '-'}
                </RT.Text>
              </RT.Table.Cell>
            </RT.Table.Row>
          ))}
        </RT.Table.Body>
      </RT.Table.Root>
    </RT.Box>
  );
}

export const SseSummaryLine: SummaryLineComponent = ({ response }) => {
  const messageCount = toSseMessages(response).length;

  return (
    <RT.Flex align="center" gap="2">
      <RT.Text size="1" weight="bold" style={{ color: 'var(--green-9)' }}>
        Connected
      </RT.Text>
      <RT.Text size="1" color="gray">
        {messageCount} messages
      </RT.Text>
    </RT.Flex>
  );
};

const ssePluginUI: IProtocolPluginUI = {
  icon: 'signal',
  protocol: 'sse',

  setup(): void {
    // No-op for now. Tab components receive full context via props.
  },

  createNewRequest(name: string): Request {
    return {
      type: 'request',
      id: `req-${Date.now()}`,
      name,
      data: {
        url: '',
        timeout: 30000
      }
    };
  },

  getRequestBadge(_request: Request): RequestBadge {
    return {
      primary: 'SSE',
      color: 'green'
    };
  },

  getSummary(_request: Request, response?: ProtocolResponse): RequestSummary {
    const messageCount = toSseMessages(response).length;
    return {
      summaryLine: SseSummaryLine,
      statusLevel: 'success',
      fields: [
        { name: 'messages', value: messageCount }
      ],
      sortKey: messageCount
    };
  },

  renderAddressBar(request: Request, onChange: (request: Request) => void) {
    const data = getSseRequestData(request);
    const url = data.url ?? '';

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          width: '100%',
          height: 32,
          border: '1px solid var(--gray-7)',
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--color-background)'
        }}
      >
        <RT.TextField.Root
          value={url}
          onChange={(e) =>
            onChange(
              patchSseRequestData(request, {
                url: (e.target as HTMLInputElement).value,
              })
            )
          }
          placeholder="https://example.com/events"
          size="2"
          variant="surface"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: 0
          }}
        />
      </div>
    );
  },

  getRequestTabs(): UITab[] {
    return [{ id: 'config', label: 'Config', position: 10, component: SseConfigTab }];
  },

  getResponseTabs(): ResponseUITab[] {
    return [{ id: 'messages', label: 'Messages', position: 10, component: SseMessagesTab }];
  }
};

export default ssePluginUI;
