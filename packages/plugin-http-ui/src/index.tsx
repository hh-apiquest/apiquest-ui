import React from 'react';
import type { IProtocolPluginUI, UITab, UITabProps, RequestBadge, SummaryLineComponent, ResponseUITab, ProtocolViewProps, RequestSummary } from '@apiquest/plugin-ui-types';
import type { Request, ProtocolResponse } from '@apiquest/types';
import type { HttpResponseData, HttpRequestData, HttpBodyData, HttpBodyKV } from '@apiquest/plugin-http';

import * as RT from '@radix-ui/themes';
import { CheckIcon } from '@heroicons/react/20/solid';

import type { PluginUIContext } from '@apiquest/plugin-ui-types';

type UIFormDataKV = HttpBodyKV & { disabled?: boolean };
type UIUrlEncodedKV = Omit<HttpBodyKV, 'type'> & { disabled?: boolean };

let UI: PluginUIContext;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

type RadixAccentColor =
  | 'gray'
  | 'gold'
  | 'bronze'
  | 'brown'
  | 'yellow'
  | 'amber'
  | 'orange'
  | 'tomato'
  | 'red'
  | 'ruby'
  | 'crimson'
  | 'pink'
  | 'plum'
  | 'purple'
  | 'violet'
  | 'iris'
  | 'indigo'
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'jade'
  | 'green'
  | 'grass'
  | 'lime'
  | 'mint'
  | 'sky';

const methodToColor: Record<HttpMethod, RadixAccentColor> = {
  GET: 'grass',
  POST: 'amber',
  PUT: 'blue',
  DELETE: 'red',
  PATCH: 'purple',
  HEAD: 'jade',
  OPTIONS: 'yellow'
};

function ensureHttpMethod(value: unknown): HttpMethod {
  const s = String(value ?? '').toUpperCase();
  return (HTTP_METHODS as string[]).includes(s) ? (s as HttpMethod) : 'GET';
}

function getMonacoLanguageFromMime(mime: string) {
  switch (mime) {
    case 'text/plain':
      return 'plaintext';
    case 'application/json':
      return 'json';
    case 'application/xml':
      return 'xml';
    case 'text/html':
      return 'html';
    case 'application/javascript':
      return 'javascript';
    default:
      return 'plaintext';
  }
}

function MethodSelect({
  method,
  onChange
}: {
  method: HttpMethod;
  onChange: (method: HttpMethod) => void;
}) {
  const color = methodToColor[method];

  return (
    <RT.Select.Root value={method} onValueChange={(v) => onChange(ensureHttpMethod(v))} size="2">
      <RT.Select.Trigger
        variant="soft"
        color={color}
        style={{
          minWidth: 130,
          borderRadius: 0,
          height: '100%',
          justifyContent: 'space-between'
        }}
      />
      <RT.Select.Content style={{ minWidth: 160 }} position="popper" side="bottom" align="start">
        {HTTP_METHODS.map((m) => (
          <RT.Select.Item key={m} value={m}>
            <RT.Flex align="center" justify="between" gap="3" style={{ width: '100%' }}>
              <RT.Badge color={methodToColor[m]} variant="soft">
                {m}
              </RT.Badge>
              {m === method ? <CheckIcon style={{ width: 16, height: 16, opacity: 0.8 }} /> : null}
            </RT.Flex>
          </RT.Select.Item>
        ))}
      </RT.Select.Content>
    </RT.Select.Root>
  );
}

function UrlBox({
  request,
  onChange
}: {
  request: Request;
  onChange: (request: Request) => void;
}) {
  const method = ensureHttpMethod((request.data as any)?.method);
  const url = String((request.data as any)?.url ?? '');

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
      <div style={{ borderRight: '1px solid var(--gray-7)', display: 'flex' }}>
        <MethodSelect
          method={method}
          onChange={(next) =>
            onChange({
              ...request,
              data: { ...(request.data as any), method: next }
            })
          }
        />
      </div>
      <div style={{ flex: 1, display: 'flex' }}>
        <RT.TextField.Root
          value={url}
          onChange={(e) =>
            onChange({
              ...request,
              data: { ...(request.data as any), url: (e.target as HTMLInputElement).value }
            })
          }
          placeholder="Enter URL"
          size="2"
          variant="surface"
          style={{
            flex: 1,
            border: 'none',
            borderRadius: 0,
            height: '100%'
          }}
        />
      </div>
    </div>
  );
}


function HttpParamsTab({ request, onChange, uiContext }: UITabProps) {
  const params = (request.data as any)?.params || {};
  return <uiContext.Editors.Params params={params} onChange={(newParams) => onChange({ ...request, data: { ...(request.data as any), params: newParams } })} />;
}

function HttpHeadersTab({ request, onChange, uiContext }: UITabProps) {
  const headers = (request.data as any)?.headers || {};
  return <uiContext.Editors.Headers headers={headers} onChange={(newHeaders) => onChange({ ...request, data: { ...(request.data as any), headers: newHeaders } })} />;
}

function HttpBodyTab({ request, onChange, uiContext, uiState }: UITabProps) {
  const { Monaco, Editors } = uiContext;

  // UI extends HttpBodyData with language for monaco editor
  type UIHttpBodyData = HttpBodyData & { language?: string };
  const body = ((request.data as any)?.body ?? {}) as UIHttpBodyData;
  const [mode, setMode] = React.useState<string>(body.mode || 'none');
  const [rawLang, setRawLang] = React.useState<string>(body.language || 'text/plain');

  React.useEffect(() => {
    if (body.mode !== mode) setMode(body.mode || 'none');
    if (body.language !== rawLang) setRawLang(body.language || 'text/plain');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body.mode, body.language]);

  const modes = [
    { value: 'none', label: 'none' },
    { value: 'formdata', label: 'form-data' },
    { value: 'urlencoded', label: 'urlencoded' },
    { value: 'raw', label: 'raw' }
  ] as const;

  const rawLanguages = [
    { value: 'text/plain', label: 'Text' },
    { value: 'application/json', label: 'JSON' },
    { value: 'application/xml', label: 'XML' },
    { value: 'text/html', label: 'HTML' },
    { value: 'application/javascript', label: 'JavaScript' }
  ] as const;

  const applyMode = (newMode: string) => {
    setMode(newMode);
    onChange({
      ...request,
      data: {
        ...(request.data as any),
        body: {
          mode: newMode,
          language: rawLang,
          ...(newMode === 'raw' ? { raw: body.raw ?? '' } : {}),
          ...(newMode === 'formdata' || newMode === 'urlencoded' ? { kv: body.kv ?? [] } : {})
        }
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, borderBottom: '1px solid var(--gray-6)' }}>
        <RT.RadioGroup.Root value={mode} onValueChange={applyMode} size="1" variant="soft">
          {/* Force horizontal layout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {modes.map((m) => (
              <RT.RadioGroup.Item key={m.value} value={m.value}>
                {m.label}
              </RT.RadioGroup.Item>
            ))}
          </div>
        </RT.RadioGroup.Root>

        {mode === 'raw' ? (
          <RT.Flex align="center" gap="2" style={{ marginLeft: 16, paddingLeft: 16, borderLeft: '1px solid var(--gray-6)' }}>
            <RT.Text size="1" color="gray">
              Type:
            </RT.Text>
            <RT.Select.Root
              value={rawLang}
              onValueChange={(newLang) => {
                setRawLang(newLang);
                onChange({
                  ...request,
                  data: { ...(request.data as any), body: { ...(body || {}), language: newLang } }
                });
              }}
              size="1"
            >
              <RT.Select.Trigger style={{ minWidth: 180 }} />
              <RT.Select.Content>
                {rawLanguages.map((lang) => (
                  <RT.Select.Item key={lang.value} value={lang.value}>
                    {lang.label} ({lang.value})
                  </RT.Select.Item>
                ))}
              </RT.Select.Content>
            </RT.Select.Root>
          </RT.Flex>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'raw' ? (
          <Monaco.Editor
            value={body.raw || ''}
            language={getMonacoLanguageFromMime(rawLang)}
            onChange={(value: string) =>
              onChange({
                ...request,
                data: { ...(request.data as any), body: { mode: 'raw', language: rawLang, raw: value } }
              })
            }
            height="100%"
            theme={uiState.theme}
          />
        ) : mode === 'formdata' ? (
          <Editors.FormData
            formData={(body.kv as UIFormDataKV[] || []).map(item => ({
              key: item.key,
              value: item.value,
              type: item.type  as 'text' | 'binary',
              disabled: item.disabled ?? false,
              description: item.description
            }))}
            onChange={(formdata: UIFormDataKV[]) => {
              const kv: UIFormDataKV[] = formdata;
              onChange({ ...request, data: { ...(request.data as any), body: { mode: 'formdata', language: rawLang, kv } } });
            }}
          />
        ) : mode === 'urlencoded' ? (
          <Editors.UrlEncoded
            data={(body.kv as UIUrlEncodedKV[] || []).map(item => ({
              key: item.key,
              value: item.value,
              disabled: item.disabled ?? false,
              description: item.description
            }))}
            onChange={(urlencoded: Array<{ key: string; value: string; disabled?: boolean; description?: string }>) => {
              const kv: UIUrlEncodedKV[] = urlencoded.map(item => ({
                key: item.key,
                value: item.value,
                disabled: item.disabled,
                description: item.description
              }));
              onChange({ ...request, data: { ...(request.data as any), body: { mode: 'urlencoded', language: rawLang, kv } } });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

type ViewMode = 'pretty' | 'raw';

function ViewModeSelect({ value, onValueChange }: { value: ViewMode; onValueChange: (v: ViewMode) => void }) {
  return (
    <RT.Select.Root value={value} onValueChange={(v) => onValueChange((v === 'raw' ? 'raw' : 'pretty') as ViewMode)} size="1">
      <RT.Select.Trigger variant="soft" style={{ minWidth: 140 }} />
      <RT.Select.Content>
        <RT.Select.Item value="pretty">Pretty</RT.Select.Item>
        <RT.Select.Item value="raw">Raw</RT.Select.Item>
      </RT.Select.Content>
    </RT.Select.Root>
  );
}

function HttpResponseBodyTab({ response, uiContext, uiState }: any) {
  const { Monaco } = uiContext;
  const [viewMode, setViewMode] = React.useState<ViewMode>('pretty');
  const [language, setLanguage] = React.useState('json');

  const httpData = response?.data as HttpResponseData | undefined;
  const body = httpData?.body || '';

  React.useEffect(() => {
    const contentType = httpData?.headers?.['content-type'] || '';
    if (contentType.includes('json')) setLanguage('json');
    else if (contentType.includes('xml')) setLanguage('xml');
    else if (contentType.includes('html')) setLanguage('html');
    else if (contentType.includes('javascript')) setLanguage('javascript');
    else setLanguage('plaintext');
  }, [httpData?.headers]);

  const displayBody = React.useMemo(() => {
    if (!body) return '';
    if (viewMode === 'raw') return body;
    try {
      if (language === 'json') return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      // Keep original body when JSON pretty-printing fails.
    }
    return body;
  }, [body, viewMode, language]);

  if (!body) {
    return (
      <RT.Flex align="center" justify="center" height="100%" style={{ color: 'var(--gray-9)' }}>
        <RT.Box style={{ textAlign: 'center' }}>
          <RT.Text size="2" style={{ display: 'block', marginBottom: '4px' }}>No response body</RT.Text>
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
          background: 'var(--gray-2)'
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
          onChange={() => {}}
          theme={uiState.theme}
        />
      </div>
    </div>
  );
}

function HttpResponseHeadersTab({ response }: any) {
  const httpData = response?.data as HttpResponseData | undefined;
  const headers = httpData?.headers || {};
  const entries = Object.entries(headers);

  if (entries.length === 0) {
    return (
      <RT.Flex align="center" justify="center" height="100%" style={{ color: 'var(--gray-9)' }}>
        <RT.Box style={{ textAlign: 'center' }}>
          <RT.Text size="2" style={{ display: 'block', marginBottom: '4px' }}>No headers</RT.Text>
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
          {entries.map(([k, v]) => (
            <RT.Table.Row key={k}>
              <RT.Table.Cell>
                <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gray-11)' }}>
                  {k}
                </RT.Text>
              </RT.Table.Cell>
              <RT.Table.Cell>
                <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)' }}>
                  {String(v)}
                </RT.Text>
              </RT.Table.Cell>
            </RT.Table.Row>
          ))}
        </RT.Table.Body>
      </RT.Table.Root>
    </RT.Box>
  );
}

function HttpResponseCookiesTab({ response }: any) {
  const cookies = React.useMemo(() => {
    const httpData = response?.data as HttpResponseData | undefined;
    const headers = httpData?.headers || {};
    const setCookie = headers['set-cookie'];
    if (!setCookie) return [] as any[];

    const cookieStrings = Array.isArray(setCookie) ? setCookie : [setCookie];
    return cookieStrings.map((cookieStr: string) => {
      const [nameValue, ...attributes] = cookieStr.split(';').map((s) => s.trim());
      const [name, value] = nameValue.split('=');
      const cookie: any = { name, value };
      attributes.forEach((attr) => {
        const [key, val] = attr.split('=');
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'domain') cookie.domain = val;
        else if (lowerKey === 'path') cookie.path = val;
        else if (lowerKey === 'expires') cookie.expires = val;
        else if (lowerKey === 'max-age') cookie.maxAge = val;
        else if (lowerKey === 'secure') cookie.secure = true;
        else if (lowerKey === 'httponly') cookie.httpOnly = true;
        else if (lowerKey === 'samesite') cookie.sameSite = val;
      });
      return cookie;
    });
  }, [response?.data]);

  if (cookies.length === 0) {
    return (
      <RT.Flex align="center" justify="center" height="100%" style={{ color: 'var(--gray-9)' }}>
        <RT.Box style={{ textAlign: 'center' }}>
          <RT.Text size="2" style={{ display: 'block', marginBottom: '4px' }}>No cookies</RT.Text>
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
          {cookies.map((cookie: any, idx: number) => (
            <RT.Table.Row key={idx}>
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
                  {cookie.domain || '-'}
                </RT.Text>
              </RT.Table.Cell>
              <RT.Table.Cell>
                <RT.Text as="span" size="1" color="gray">
                  {cookie.path || '-'}
                </RT.Text>
              </RT.Table.Cell>
              <RT.Table.Cell>
                <RT.Flex gap="2" wrap="wrap">
                  {cookie.secure ? (
                    <RT.Badge color="green" variant="soft">
                      Secure
                    </RT.Badge>
                  ) : null}
                  {cookie.httpOnly ? (
                    <RT.Badge color="blue" variant="soft">
                      HttpOnly
                    </RT.Badge>
                  ) : null}
                  {cookie.sameSite ? (
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

const HttpSummaryLine: SummaryLineComponent = ({ request, response  }) => {
  const name = request?.name;
  const httpData = response?.data as HttpResponseData | undefined;
  const status = httpData?.status || 0;
  const statusText = httpData?.statusText || '';
  const duration = response?.summary?.duration || 0;
  const label = `${status} ${statusText}`.trim();
  const method = ensureHttpMethod((request?.data as any)?.method);
  const url = String((request?.data as any)?.url ?? '');

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
      {url && (
        <RT.Text size="1" color="gray" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }} title={url}>
          {url}
        </RT.Text>
      )}
      <RT.Text size="1" weight="bold" style={{ color, whiteSpace: 'nowrap' }}>
        {label}
      </RT.Text>
      <RT.Text size="1" color="gray" style={{ whiteSpace: 'nowrap' }}>
        {duration}ms
      </RT.Text>
    </RT.Flex>
  );
};

/**
 * HttpDetailView - Comprehensive request/response detail display
 * Used in ConsolePanel detail view and Runner result details
 */
function HttpDetailView({ request, response, uiContext, uiState }: ProtocolViewProps) {
  const RT = uiContext.Radix;
  const Monaco = uiContext.Monaco;
  const [activeTab, setActiveTab] = React.useState<'request' | 'response'>('request');

  // Extract HTTP data
  const httpRequest = request?.data as HttpRequestData | undefined;
  const httpResponse = response?.data as HttpResponseData | undefined;

  // Request data
  const method = ensureHttpMethod(httpRequest?.method);
  const url = httpRequest?.url || '';
  const requestHeaders = httpRequest?.headers || {};
  const requestParams = httpRequest?.params || [];
  const requestBody = httpRequest?.body;

  // Response data
  const status = httpResponse?.status || 0;
  const statusText = httpResponse?.statusText || '';
  const responseHeaders = httpResponse?.headers || {};
  const responseBody = httpResponse?.body;
  const duration = response?.summary?.duration || 0;

  // Format request body for display
  const formatRequestBody = () => {
    if (!requestBody) return '';
    
    // Handle string body
    if (typeof requestBody === 'string') {
      return requestBody;
    }
    
    // Handle HttpBodyData
    if (requestBody.mode === 'none') return '';
    
    if (requestBody.mode === 'raw') {
      return requestBody.raw || '';
    } else if (requestBody.mode === 'formdata' || requestBody.mode === 'urlencoded') {
      // Both formdata and urlencoded use kv array
      return JSON.stringify(requestBody.kv || [], null, 2);
    }
    return '';
  };

  // Format response body for display
  const formatResponseBody = () => {
    if (!responseBody) return '';
    
    if (typeof responseBody === 'string') {
      try {
        const parsed = JSON.parse(responseBody);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return responseBody;
      }
    }
    return JSON.stringify(responseBody, null, 2);
  };

  // Detect language for syntax highlighting
  const getResponseLanguage = () => {
    const contentType = responseHeaders['content-type'] || '';
    if (contentType.includes('json')) return 'json';
    if (contentType.includes('html')) return 'html';
    if (contentType.includes('xml')) return 'xml';
    if (contentType.includes('javascript')) return 'javascript';
    return 'text';
  };

  const getRequestLanguage = () => {
    if (!requestBody) return 'text';
    
    // Handle string body
    if (typeof requestBody === 'string') {
      const contentType = requestHeaders['content-type'] || '';
      if (contentType.includes('json')) return 'json';
      if (contentType.includes('html')) return 'html';
      if (contentType.includes('xml')) return 'xml';
      return 'text';
    }
    
    // Handle HttpBodyData
    if (requestBody.mode === 'none') return 'text';
    if (requestBody.mode === 'formdata' || requestBody.mode === 'urlencoded') return 'json'; // kv array
    if (requestBody.mode === 'raw') {
      const contentType = requestHeaders['content-type'] || '';
      if (contentType.includes('json')) return 'json';
      if (contentType.includes('html')) return 'html';
      if (contentType.includes('xml')) return 'xml';
    }
    return 'text';
  };

  const requestBodyContent = formatRequestBody();
  const responseBodyContent = formatResponseBody();
  const hasRequestBody = requestBodyContent.length > 0;
  const hasResponseBody = responseBodyContent.length > 0;

  return (
    <RT.Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab Selector */}
      <RT.Box style={{ borderBottom: '1px solid var(--gray-6)', background: 'var(--gray-2)' }}>
        <RT.Tabs.Root value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
          <RT.Tabs.List>
            <RT.Tabs.Trigger value="request">Request</RT.Tabs.Trigger>
            <RT.Tabs.Trigger value="response">Response</RT.Tabs.Trigger>
          </RT.Tabs.List>
        </RT.Tabs.Root>
      </RT.Box>

      {/* Content Area */}
      <RT.Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {activeTab === 'response' && (
          <RT.Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Response Status */}
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

            {/* Response Headers */}
            <RT.Box p="4" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <RT.Text size="1" weight="bold" style={{ display: 'block', marginBottom: '8px' }}>
                Headers
              </RT.Text>
              {Object.keys(responseHeaders).length === 0 ? (
                <RT.Text size="1" color="gray">No headers</RT.Text>
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
                            {String(value)}
                          </RT.Text>
                        </RT.Table.Cell>
                      </RT.Table.Row>
                    ))}
                  </RT.Table.Body>
                </RT.Table.Root>
              )}
            </RT.Box>

            {/* Response Body */}
            <RT.Box style={{ flex: 1, minHeight: 300, display: 'flex', flexDirection: 'column' }}>
              <RT.Box p="2" style={{ borderBottom: '1px solid var(--gray-6)', background: 'var(--gray-2)' }}>
                <RT.Text size="1" weight="bold">Body</RT.Text>
              </RT.Box>
              {hasResponseBody ? (
                <div style={{ minHeight: 300, height: 300 }}>
                  <Monaco.Editor
                    value={responseBodyContent}
                    language={getResponseLanguage()}
                    height="100%"
                    readonly={true}
                    onChange={() => {}}
                    theme={uiState.theme}
                  />
                </div>
              ) : (
                <RT.Flex align="center" justify="center" p="4">
                  <RT.Text size="2" color="gray">No response body</RT.Text>
                </RT.Flex>
              )}
            </RT.Box>
          </RT.Box>
        )}

        {activeTab === 'request' && (
          <RT.Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Request Line */}
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

            {/* Request Params */}
            {requestParams.length > 0 && (
              <RT.Box p="4" style={{ borderBottom: '1px solid var(--gray-6)' }}>
                <RT.Text size="1" weight="bold" style={{ display: 'block', marginBottom: '8px' }}>
                  Query Params
                </RT.Text>
                <RT.Table.Root variant="surface" size="1">
                  <RT.Table.Body>
                    {requestParams.map((param, idx) => (
                      <RT.Table.Row key={idx}>
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
            )}

            {/* Request Headers */}
            <RT.Box p="4" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <RT.Text size="1" weight="bold" style={{ display: 'block', marginBottom: '8px' }}>
                Headers
              </RT.Text>
              {Object.keys(requestHeaders).length === 0 ? (
                <RT.Text size="1" color="gray">No headers</RT.Text>
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
                            {String(value)}
                          </RT.Text>
                        </RT.Table.Cell>
                      </RT.Table.Row>
                    ))}
                  </RT.Table.Body>
                </RT.Table.Root>
              )}
            </RT.Box>

            {/* Request Body */}
            <RT.Box style={{ flex: 1, minHeight: 300, display: 'flex', flexDirection: 'column' }}>
              <RT.Box p="2" style={{ borderBottom: '1px solid var(--gray-6)', background: 'var(--gray-2)' }}>
                <RT.Text size="1" weight="bold">Body</RT.Text>
              </RT.Box>
              {hasRequestBody ? (
                <div style={{ minHeight: 300, height: 300 }}>
                  <Monaco.Editor
                    value={requestBodyContent}
                    language={getRequestLanguage()}
                    height="100%"
                    readonly={true}
                    onChange={() => {}}
                    theme={uiState.theme}
                  />
                </div>
              ) : (
                <RT.Flex align="center" justify="center" p="4">
                  <RT.Text size="2" color="gray">No request body</RT.Text>
                </RT.Flex>
              )}
            </RT.Box>
          </RT.Box>
        )}
      </RT.Box>
    </RT.Box>
  );
}

export const httpPluginUI: IProtocolPluginUI = {
  protocol: 'http',

  setup(uiContext: PluginUIContext) {
    UI = uiContext;
  },

  createNewRequest(name: string): Request {
    return {
      type: 'request',
      id: `req-${Date.now()}`,
      name,
      data: {
        method: 'GET',
        url: '',
        headers: {},
        params: {},
        body: { mode: 'none' }
      }
    } as any;
  },

  getRequestBadge(request: Request): RequestBadge {
    const method = ensureHttpMethod((request.data as any)?.method);
    const color = methodToColor[method];
    return {
      primary: method,
      color
    };
  },

  getSummary(request: Request, response?: ProtocolResponse): RequestSummary {
    const httpData = response?.data as HttpResponseData;
    const status = httpData?.status || 0;
    const statusText = httpData?.statusText || '';
    const duration = response?.summary?.duration || 0;

    let statusLevel: RequestSummary['statusLevel'] = 'info';
    if (status >= 200 && status < 300) {
      statusLevel = 'success';
    } else if (status >= 300 && status < 400) {
      statusLevel = 'warning';
    } else if (status >= 400) {
      statusLevel = 'error';
    }

    return {
      summaryLine: HttpSummaryLine,
      detailView: HttpDetailView,
      statusLevel,
      fields: [
        { name: 'status', value: status },
        { name: 'statusText', value: statusText },
        { name: 'duration', value: duration, order: 1 }
      ],
      sortKey: status
    };
  },

  renderAddressBar(request: Request, onChange: (request: Request) => void) {
    return <UrlBox request={request} onChange={onChange} />;
  },

  getRequestTabs(): UITab[] {
    return [
      { id: 'params', label: 'Params', position: 10, component: HttpParamsTab },
      { id: 'headers', label: 'Headers', position: 20, component: HttpHeadersTab },
      { id: 'body', label: 'Body', position: 30, component: HttpBodyTab }
    ];
  },

  getResponseTabs(): ResponseUITab[] {
    return [
      { id: 'body', label: 'Body', position: 10, component: HttpResponseBodyTab },
      { id: 'headers', label: 'Headers', position: 20, component: HttpResponseHeadersTab },
      { id: 'cookies', label: 'Cookies', position: 30, component: HttpResponseCookiesTab }
    ];
  }
};

// Export as default for dynamic plugin loading
export default httpPluginUI;
