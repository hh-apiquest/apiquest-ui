import React from 'react';
import * as RT from '@radix-ui/themes';
import type { HttpBodyData, HttpRequestData, HttpResponseData } from '@apiquest/plugin-http';
import type { ProtocolViewProps, SummaryLineComponent } from '@apiquest/plugin-ui-types';

import { ensureHttpMethod, getHeaderValue, toHttpRequestData } from '../utils/httpUi';
import { methodToColor } from '../types';

type DetailTab = 'request' | 'response';

function ensureDetailTab(value: string): DetailTab {
  return value === 'response' ? 'response' : 'request';
}

function formatRequestBody(requestBody: string | HttpBodyData | undefined): string {
  if (requestBody === undefined) {
    return '';
  }

  if (typeof requestBody === 'string') {
    return requestBody;
  }

  if (requestBody.mode === 'none') {
    return '';
  }

  if (requestBody.mode === 'raw' || requestBody.mode === 'binary') {
    return requestBody.raw ?? '';
  }

  if (requestBody.mode === 'formdata' || requestBody.mode === 'urlencoded') {
    return JSON.stringify(requestBody.kv ?? [], null, 2);
  }

  return '';
}

function formatResponseBody(responseBody: unknown): string {
  if (responseBody === undefined || responseBody === null) {
    return '';
  }

  if (typeof responseBody === 'string') {
    try {
      const parsed = JSON.parse(responseBody) as unknown;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return responseBody;
    }
  }

  try {
    return JSON.stringify(responseBody, null, 2);
  } catch {
    return String(responseBody);
  }
}

function getResponseLanguage(responseHeaders: Record<string, string | string[]>): string {
  const contentType = (getHeaderValue(responseHeaders, 'content-type') ?? '').toLowerCase();

  if (contentType.includes('json')) {
    return 'json';
  }

  if (contentType.includes('html')) {
    return 'html';
  }

  if (contentType.includes('xml')) {
    return 'xml';
  }

  if (contentType.includes('javascript')) {
    return 'javascript';
  }

  return 'text';
}

function getRequestLanguage(
  requestBody: string | HttpBodyData | undefined,
  requestHeaders: Record<string, string>
): string {
  if (requestBody === undefined) {
    return 'text';
  }

  const contentType = (requestHeaders['content-type'] ?? '').toLowerCase();

  if (typeof requestBody === 'string') {
    if (contentType.includes('json')) {
      return 'json';
    }

    if (contentType.includes('html')) {
      return 'html';
    }

    if (contentType.includes('xml')) {
      return 'xml';
    }

    return 'text';
  }

  if (requestBody.mode === 'none') {
    return 'text';
  }

  if (requestBody.mode === 'formdata' || requestBody.mode === 'urlencoded') {
    return 'json';
  }

  if (requestBody.mode === 'raw' || requestBody.mode === 'binary') {
    if (contentType.includes('json')) {
      return 'json';
    }

    if (contentType.includes('html')) {
      return 'html';
    }

    if (contentType.includes('xml')) {
      return 'xml';
    }
  }

  return 'text';
}

export const HttpSummaryLine: SummaryLineComponent = ({ request, response, uiContext: _uiContext, uiState: _uiState }) => {
  const requestData = request !== undefined ? toHttpRequestData(request.data) : undefined;
  const httpData = response?.data as HttpResponseData | undefined;
  const status = httpData?.status ?? 0;
  const statusText = httpData?.statusText ?? '';
  const duration = response?.summary?.duration ?? 0;
  const label = `${status} ${statusText}`.trim();
  const method = ensureHttpMethod(requestData?.method);
  const url = requestData?.url ?? '';

  let color = 'var(--gray-9)';
  if (status >= 200 && status < 300) {
    color = 'var(--green-9)';
  } else if (status >= 300 && status < 400) {
    color = 'var(--orange-9)';
  } else if (status >= 400) {
    color = 'var(--red-9)';
  }

  return (
    <RT.Flex align="center" gap="2" style={{ minWidth: 0, overflow: 'hidden' }}>
      <RT.Badge color={methodToColor[method]} variant="soft">
        {method}
      </RT.Badge>
      {url !== '' ? (
        <RT.Text
          size="1"
          color="gray"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}
          title={url}
        >
          {url}
        </RT.Text>
      ) : null}
      <RT.Text size="1" weight="bold" style={{ color, whiteSpace: 'nowrap' }}>
        {label}
      </RT.Text>
      <RT.Text size="1" color="gray" style={{ whiteSpace: 'nowrap' }}>
        {duration}ms
      </RT.Text>
    </RT.Flex>
  );
};

export function HttpDetailView({ request, response, uiContext, uiState }: ProtocolViewProps): React.ReactElement {
  const Monaco = uiContext.Monaco;
  const [activeTab, setActiveTab] = React.useState<DetailTab>('request');

  const requestData = request !== undefined ? toHttpRequestData(request.data) : undefined;
  const httpRequest = requestData as HttpRequestData | undefined;
  const httpResponse = response?.data as HttpResponseData | undefined;

  const method = ensureHttpMethod(httpRequest?.method);
  const url = httpRequest?.url ?? '';
  const requestHeaders = httpRequest?.headers ?? {};
  const requestParams = httpRequest?.params ?? [];
  const requestBody = httpRequest?.body;

  const status = httpResponse?.status ?? 0;
  const statusText = httpResponse?.statusText ?? '';
  const responseHeaders = httpResponse?.headers ?? {};
  const responseBody = httpResponse?.body;
  const duration = response?.summary?.duration ?? 0;

  const requestBodyContent = formatRequestBody(requestBody);
  const responseBodyContent = formatResponseBody(responseBody);
  const hasRequestBody = requestBodyContent.length > 0;
  const hasResponseBody = responseBodyContent.length > 0;

  return (
    <RT.Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <RT.Box style={{ borderBottom: '1px solid var(--gray-6)', background: 'var(--gray-2)' }}>
        <RT.Tabs.Root
          value={activeTab}
          onValueChange={(value: string): void => {
            setActiveTab(ensureDetailTab(value));
          }}
        >
          <RT.Tabs.List>
            <RT.Tabs.Trigger value="request">Request</RT.Tabs.Trigger>
            <RT.Tabs.Trigger value="response">Response</RT.Tabs.Trigger>
          </RT.Tabs.List>
        </RT.Tabs.Root>
      </RT.Box>

      <RT.Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {activeTab === 'response' ? (
          <RT.Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <RT.Box p="4" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <RT.Flex gap="3" align="center" wrap="wrap">
                <RT.Badge
                  color={status >= 200 && status < 300 ? 'green' : status >= 400 ? 'red' : 'gray'}
                  size="2"
                >
                  {status} {statusText}
                </RT.Badge>
                <RT.Text size="2" color="gray">
                  {duration}ms
                </RT.Text>
              </RT.Flex>
            </RT.Box>

            <RT.Box p="4" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <RT.Text size="1" weight="bold" style={{ display: 'block', marginBottom: '8px' }}>
                Headers
              </RT.Text>
              {Object.keys(responseHeaders).length === 0 ? (
                <RT.Text size="1" color="gray">
                  No headers
                </RT.Text>
              ) : (
                <RT.Table.Root variant="surface" size="1">
                  <RT.Table.Body>
                    {Object.entries(responseHeaders).map(([key, value]) => (
                      <RT.Table.Row key={key}>
                        <RT.Table.Cell style={{ width: '30%' }}>
                          <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gray-11)' }}>
                            {key}
                          </RT.Text>
                        </RT.Table.Cell>
                        <RT.Table.Cell>
                          <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)' }}>
                            {Array.isArray(value) ? value.join(', ') : value}
                          </RT.Text>
                        </RT.Table.Cell>
                      </RT.Table.Row>
                    ))}
                  </RT.Table.Body>
                </RT.Table.Root>
              )}
            </RT.Box>

            <RT.Box style={{ flex: 1, minHeight: 300, display: 'flex', flexDirection: 'column' }}>
              <RT.Box p="2" style={{ borderBottom: '1px solid var(--gray-6)', background: 'var(--gray-2)' }}>
                <RT.Text size="1" weight="bold">
                  Body
                </RT.Text>
              </RT.Box>
              {hasResponseBody ? (
                <div style={{ minHeight: 300, height: 300 }}>
                  <Monaco.Editor
                    value={responseBodyContent}
                    language={getResponseLanguage(responseHeaders)}
                    height="100%"
                    readonly
                    onChange={(): void => {
                      // read-only editor
                    }}
                    theme={uiState.theme}
                  />
                </div>
              ) : (
                <RT.Flex align="center" justify="center" p="4">
                  <RT.Text size="2" color="gray">
                    No response body
                  </RT.Text>
                </RT.Flex>
              )}
            </RT.Box>
          </RT.Box>
        ) : (
          <RT.Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <RT.Box p="4" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <RT.Flex gap="2" align="center">
                <RT.Badge color={methodToColor[method]} size="2">
                  {method}
                </RT.Badge>
                <RT.Text size="2" style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                  {url}
                </RT.Text>
              </RT.Flex>
            </RT.Box>

            {requestParams.length > 0 ? (
              <RT.Box p="4" style={{ borderBottom: '1px solid var(--gray-6)' }}>
                <RT.Text size="1" weight="bold" style={{ display: 'block', marginBottom: '8px' }}>
                  Query Params
                </RT.Text>
                <RT.Table.Root variant="surface" size="1">
                  <RT.Table.Body>
                    {requestParams.map((param, index) => (
                      <RT.Table.Row key={`${param.key}-${index}`}>
                        <RT.Table.Cell style={{ width: '30%' }}>
                          <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gray-11)' }}>
                            {param.key}
                          </RT.Text>
                        </RT.Table.Cell>
                        <RT.Table.Cell>
                          <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)' }}>
                            {param.value}
                          </RT.Text>
                        </RT.Table.Cell>
                      </RT.Table.Row>
                    ))}
                  </RT.Table.Body>
                </RT.Table.Root>
              </RT.Box>
            ) : null}

            <RT.Box p="4" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <RT.Text size="1" weight="bold" style={{ display: 'block', marginBottom: '8px' }}>
                Headers
              </RT.Text>
              {Object.keys(requestHeaders).length === 0 ? (
                <RT.Text size="1" color="gray">
                  No headers
                </RT.Text>
              ) : (
                <RT.Table.Root variant="surface" size="1">
                  <RT.Table.Body>
                    {Object.entries(requestHeaders).map(([key, value]) => (
                      <RT.Table.Row key={key}>
                        <RT.Table.Cell style={{ width: '30%' }}>
                          <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gray-11)' }}>
                            {key}
                          </RT.Text>
                        </RT.Table.Cell>
                        <RT.Table.Cell>
                          <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)' }}>
                            {value}
                          </RT.Text>
                        </RT.Table.Cell>
                      </RT.Table.Row>
                    ))}
                  </RT.Table.Body>
                </RT.Table.Root>
              )}
            </RT.Box>

            <RT.Box style={{ flex: 1, minHeight: 300, display: 'flex', flexDirection: 'column' }}>
              <RT.Box p="2" style={{ borderBottom: '1px solid var(--gray-6)', background: 'var(--gray-2)' }}>
                <RT.Text size="1" weight="bold">
                  Body
                </RT.Text>
              </RT.Box>
              {hasRequestBody ? (
                <div style={{ minHeight: 300, height: 300 }}>
                  <Monaco.Editor
                    value={requestBodyContent}
                    language={getRequestLanguage(requestBody, requestHeaders)}
                    height="100%"
                    readonly
                    onChange={(): void => {
                      // read-only editor
                    }}
                    theme={uiState.theme}
                  />
                </div>
              ) : (
                <RT.Flex align="center" justify="center" p="4">
                  <RT.Text size="2" color="gray">
                    No request body
                  </RT.Text>
                </RT.Flex>
              )}
            </RT.Box>
          </RT.Box>
        )}
      </RT.Box>
    </RT.Box>
  );
}

