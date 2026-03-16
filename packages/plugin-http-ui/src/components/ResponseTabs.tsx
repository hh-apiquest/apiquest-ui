import React from 'react';
import type { ResponseTabProps } from '@apiquest/plugin-ui-types';
import * as RT from '@radix-ui/themes';
import type { HttpResponseData } from '@apiquest/plugin-http';

import { getHeaderValue, getMonacoLanguageFromMime, parseSetCookieHeaders } from '../utils/httpUi';
import type { ParsedCookie } from '../types';

type ViewMode = 'pretty' | 'raw';

function ViewModeSelect({
  value,
  onValueChange,
}: {
  value: ViewMode;
  onValueChange: (value: ViewMode) => void;
}): React.ReactElement {
  return (
    <RT.Select.Root
      value={value}
      onValueChange={(nextValue: string): void => onValueChange(nextValue === 'raw' ? 'raw' : 'pretty')}
      size="1"
    >
      <RT.Select.Trigger variant="soft" style={{ minWidth: 140 }} />
      <RT.Select.Content>
        <RT.Select.Item value="pretty">Pretty</RT.Select.Item>
        <RT.Select.Item value="raw">Raw</RT.Select.Item>
      </RT.Select.Content>
    </RT.Select.Root>
  );
}

export function HttpResponseBodyTab({ response, uiContext, uiState }: ResponseTabProps): React.ReactElement {
  const { Monaco } = uiContext;
  const [viewMode, setViewMode] = React.useState<ViewMode>('pretty');
  const [language, setLanguage] = React.useState<string>('json');

  const httpData = response?.data as HttpResponseData | undefined;
  const body = httpData?.body ?? '';

  React.useEffect((): void => {
    const contentType = getHeaderValue(httpData?.headers ?? {}, 'content-type') ?? '';
    setLanguage(getMonacoLanguageFromMime(contentType));
  }, [httpData?.headers]);

  const displayBody = React.useMemo((): string => {
    if (body === '') {
      return '';
    }

    if (viewMode === 'raw') {
      return body;
    }

    try {
      if (language === 'json') {
        return JSON.stringify(JSON.parse(body), null, 2);
      }
    } catch {
      // Keep original body when JSON pretty-printing fails.
    }

    return body;
  }, [body, viewMode, language]);

  if (body === '') {
    return (
      <RT.Flex align="center" justify="center" height="100%" style={{ color: 'var(--gray-9)' }}>
        <RT.Box style={{ textAlign: 'center' }}>
          <RT.Text size="2" style={{ display: 'block', marginBottom: '4px' }}>
            No response body
          </RT.Text>
          <RT.Text size="1" color="gray" style={{ display: 'block' }}>
            Response did not include a body
          </RT.Text>
        </RT.Box>
      </RT.Flex>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid var(--gray-6)',
          background: 'var(--gray-2)',
        }}
      >
        <ViewModeSelect value={viewMode} onValueChange={setViewMode} />
        <RT.Text size="1" color="gray">
          {language.toUpperCase()}
        </RT.Text>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <Monaco.Editor
          value={displayBody}
          language={language}
          height="100%"
          readonly
          onChange={(): void => {
            // read-only editor
          }}
          theme={uiState.theme}
        />
      </div>
    </div>
  );
}

export function HttpResponseHeadersTab({ response }: ResponseTabProps): React.ReactElement {
  const httpData = response?.data as HttpResponseData | undefined;
  const headers = httpData?.headers ?? {};
  const entries = Object.entries(headers);

  if (entries.length === 0) {
    return (
      <RT.Flex align="center" justify="center" height="100%" style={{ color: 'var(--gray-9)' }}>
        <RT.Box style={{ textAlign: 'center' }}>
          <RT.Text size="2" style={{ display: 'block', marginBottom: '4px' }}>
            No headers
          </RT.Text>
          <RT.Text size="1" color="gray" style={{ display: 'block' }}>
            Response did not include headers
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
            <RT.Table.ColumnHeaderCell>Key</RT.Table.ColumnHeaderCell>
            <RT.Table.ColumnHeaderCell>Value</RT.Table.ColumnHeaderCell>
          </RT.Table.Row>
        </RT.Table.Header>
        <RT.Table.Body>
          {entries.map(([key, value]) => (
            <RT.Table.Row key={key}>
              <RT.Table.Cell>
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
    </RT.Box>
  );
}

export function HttpResponseCookiesTab({ response }: ResponseTabProps): React.ReactElement {
  const cookies = React.useMemo((): ParsedCookie[] => {
    const httpData = response?.data as HttpResponseData | undefined;
    return parseSetCookieHeaders(httpData?.headers ?? {});
  }, [response?.data]);

  if (cookies.length === 0) {
    return (
      <RT.Flex align="center" justify="center" height="100%" style={{ color: 'var(--gray-9)' }}>
        <RT.Box style={{ textAlign: 'center' }}>
          <RT.Text size="2" style={{ display: 'block', marginBottom: '4px' }}>
            No cookies
          </RT.Text>
          <RT.Text size="1" color="gray" style={{ display: 'block' }}>
            Response did not set any cookies
          </RT.Text>
        </RT.Box>
      </RT.Flex>
    );
  }

  return (
    <RT.Box p="4">
      <RT.Table.Root variant="surface">
        <RT.Table.Header>
          <RT.Table.Row>
            <RT.Table.ColumnHeaderCell>Name</RT.Table.ColumnHeaderCell>
            <RT.Table.ColumnHeaderCell>Value</RT.Table.ColumnHeaderCell>
            <RT.Table.ColumnHeaderCell>Domain</RT.Table.ColumnHeaderCell>
            <RT.Table.ColumnHeaderCell>Path</RT.Table.ColumnHeaderCell>
            <RT.Table.ColumnHeaderCell>Flags</RT.Table.ColumnHeaderCell>
          </RT.Table.Row>
        </RT.Table.Header>
        <RT.Table.Body>
          {cookies.map((cookie: ParsedCookie, index: number) => (
            <RT.Table.Row key={`${cookie.name}-${index}`}>
              <RT.Table.Cell>
                <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {cookie.name}
                </RT.Text>
              </RT.Table.Cell>
              <RT.Table.Cell>
                <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)' }}>
                  {cookie.value}
                </RT.Text>
              </RT.Table.Cell>
              <RT.Table.Cell>
                <RT.Text as="span" size="1" color="gray">
                  {cookie.domain ?? '-'}
                </RT.Text>
              </RT.Table.Cell>
              <RT.Table.Cell>
                <RT.Text as="span" size="1" color="gray">
                  {cookie.path ?? '-'}
                </RT.Text>
              </RT.Table.Cell>
              <RT.Table.Cell>
                <RT.Flex gap="2" wrap="wrap">
                  {cookie.secure === true ? (
                    <RT.Badge color="green" variant="soft">
                      Secure
                    </RT.Badge>
                  ) : null}
                  {cookie.httpOnly === true ? (
                    <RT.Badge color="blue" variant="soft">
                      HttpOnly
                    </RT.Badge>
                  ) : null}
                  {cookie.sameSite !== undefined && cookie.sameSite !== '' ? (
                    <RT.Badge color="purple" variant="soft">
                      {cookie.sameSite}
                    </RT.Badge>
                  ) : null}
                </RT.Flex>
              </RT.Table.Cell>
            </RT.Table.Row>
          ))}
        </RT.Table.Body>
      </RT.Table.Root>
    </RT.Box>
  );
}

