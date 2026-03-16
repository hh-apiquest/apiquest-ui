import React from 'react';
import type {
  HeaderEntry,
  HeadersEditorState,
  ParamEntry,
  ParamsEditorState,
  UITabProps,
} from '@apiquest/plugin-ui-types';
import type { HttpBodyData } from '@apiquest/plugin-http';
import * as RT from '@radix-ui/themes';

import type { UIFormDataKV, UIUrlEncodedKV } from '../types';
import {
  computeGeneratedHeaders,
  computeGeneratedParams,
  getMonacoLanguageFromMime,
  headerEntriesToRecord,
  paramEntriesToArray,
  recordToHeaderEntries,
  storedParamsToParamEntries,
  toHttpRequestData,
  toRequestWithData,
} from '../utils/httpUi';

type BodyTabMode = 'none' | 'formdata' | 'urlencoded' | 'raw';

function ensureBodyTabMode(value: string): BodyTabMode {
  if (value === 'formdata' || value === 'urlencoded' || value === 'raw') {
    return value;
  }

  return 'none';
}

function toBodyData(data: ReturnType<typeof toHttpRequestData>): HttpBodyData {
  if (data.body === undefined || typeof data.body === 'string') {
    return { mode: 'none' };
  }

  return data.body;
}

export function HttpParamsTab({ request, onChange, uiContext }: UITabProps): React.ReactElement {
  const data = toHttpRequestData(request.data);

  const params: ParamEntry[] = data._ui?.paramsRows ?? storedParamsToParamEntries(data.params);

  const generatedParams = React.useMemo(() => computeGeneratedParams(request.auth), [request.auth]);

  const paramsEditorState: ParamsEditorState = data._ui?.paramsEditorState ?? {};

  const handleChange = (newRows: ParamEntry[]): void => {
    onChange(
      toRequestWithData(request, {
        ...data,
        params: paramEntriesToArray(newRows),
        _ui: { ...(data._ui ?? {}), paramsRows: newRows },
      })
    );
  };

  const handleEditorStateChange = (newState: ParamsEditorState): void => {
    onChange(
      toRequestWithData(request, {
        ...data,
        _ui: { ...(data._ui ?? {}), paramsEditorState: newState },
      })
    );
  };

  return (
    <uiContext.Editors.Params
      params={params}
      onChange={handleChange}
      generatedParams={generatedParams}
      editorState={paramsEditorState}
      onEditorStateChange={handleEditorStateChange}
    />
  );
}

export function HttpHeadersTab({ request, onChange, uiContext }: UITabProps): React.ReactElement {
  const data = toHttpRequestData(request.data);

  const headers: HeaderEntry[] = data._ui?.headersRows ?? recordToHeaderEntries(data.headers);

  const generatedHeaders = React.useMemo(
    () => computeGeneratedHeaders(data.body, request.auth),
    [data.body, request.auth]
  );

  const headersEditorState: HeadersEditorState = data._ui?.headersEditorState ?? {};

  const handleChange = (newRows: HeaderEntry[]): void => {
    onChange(
      toRequestWithData(request, {
        ...data,
        headers: headerEntriesToRecord(newRows),
        _ui: { ...(data._ui ?? {}), headersRows: newRows },
      })
    );
  };

  const handleEditorStateChange = (newState: HeadersEditorState): void => {
    onChange(
      toRequestWithData(request, {
        ...data,
        _ui: { ...(data._ui ?? {}), headersEditorState: newState },
      })
    );
  };

  return (
    <uiContext.Editors.Headers
      headers={headers}
      onChange={handleChange}
      generatedHeaders={generatedHeaders}
      editorState={headersEditorState}
      onEditorStateChange={handleEditorStateChange}
    />
  );
}

export function HttpBodyTab({ request, onChange, uiContext, uiState }: UITabProps): React.ReactElement {
  const { Monaco, Editors } = uiContext;
  const data = toHttpRequestData(request.data);
  const body = toBodyData(data);
  const bodyMode = body.mode === 'binary' ? 'raw' : ensureBodyTabMode(body.mode);
  const bodyLanguage = body.language ?? 'text/plain';

  const [mode, setMode] = React.useState<BodyTabMode>(bodyMode);
  const [rawLang, setRawLang] = React.useState<string>(bodyLanguage);

  React.useEffect((): void => {
    if (bodyMode !== mode) {
      setMode(bodyMode);
    }

    if (bodyLanguage !== rawLang) {
      setRawLang(bodyLanguage);
    }
  }, [bodyMode, bodyLanguage, mode, rawLang]);

  const baseKv = body.kv ?? [];

  const formdataRows: UIFormDataKV[] = data._ui?.formdataRows ?? baseKv.map((item: UIFormDataKV) => ({
    key: item.key,
    value: item.value,
    type: item.type === 'binary' ? 'binary' : 'text',
    disabled: item.disabled ?? false,
    description: item.description,
  }));

  const urlencodedRows: UIUrlEncodedKV[] = data._ui?.urlencodedRows ?? baseKv.map((item: UIUrlEncodedKV) => ({
    key: item.key,
    value: item.value,
    disabled: item.disabled ?? false,
    description: item.description,
  }));

  const modes: ReadonlyArray<{ value: BodyTabMode; label: string }> = [
    { value: 'none', label: 'none' },
    { value: 'formdata', label: 'form-data' },
    { value: 'urlencoded', label: 'urlencoded' },
    { value: 'raw', label: 'raw' },
  ];

  const rawLanguages: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'text/plain', label: 'Text' },
    { value: 'application/json', label: 'JSON' },
    { value: 'application/xml', label: 'XML' },
    { value: 'text/html', label: 'HTML' },
    { value: 'application/javascript', label: 'JavaScript' },
  ];

  const applyMode = (nextModeRaw: string): void => {
    const nextMode = ensureBodyTabMode(nextModeRaw);
    setMode(nextMode);

    const nextBody: HttpBodyData = {
      mode: nextMode,
      language: rawLang,
      ...(nextMode === 'raw' ? { raw: body.raw ?? '' } : {}),
      ...(nextMode === 'formdata' || nextMode === 'urlencoded' ? { kv: body.kv ?? [] } : {}),
    };

    onChange(
      toRequestWithData(request, {
        ...data,
        body: nextBody,
      })
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, borderBottom: '1px solid var(--gray-6)' }}>
        <RT.RadioGroup.Root value={mode} onValueChange={applyMode} size="1" variant="soft">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {modes.map((entry) => (
              <RT.RadioGroup.Item key={entry.value} value={entry.value}>
                {entry.label}
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
              onValueChange={(nextLang: string): void => {
                setRawLang(nextLang);
                onChange(
                  toRequestWithData(request, {
                    ...data,
                    body: { ...body, language: nextLang },
                  })
                );
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
            value={body.raw ?? ''}
            language={getMonacoLanguageFromMime(rawLang)}
            onChange={(value: string): void => {
              onChange(
                toRequestWithData(request, {
                  ...data,
                  body: { mode: 'raw', language: rawLang, raw: value },
                })
              );
            }}
            height="100%"
            theme={uiState.theme}
          />
        ) : mode === 'formdata' ? (
          <Editors.FormData
            formData={formdataRows.map((row: UIFormDataKV): { key: string; value: string; type: 'text' | 'binary'; disabled?: boolean; description?: string } => ({
              key: row.key,
              value: row.value,
              type: row.type === 'binary' ? 'binary' : 'text',
              disabled: row.disabled ?? false,
              description: row.description,
            }))}
            onChange={(rows: Array<{ key: string; value: string; type: 'text' | 'binary'; disabled?: boolean; description?: string }>): void => {
              const nextRows: UIFormDataKV[] = rows.map(
                (row: { key: string; value: string; type: 'text' | 'binary'; disabled?: boolean; description?: string }): UIFormDataKV => ({
                  key: row.key,
                  value: row.value,
                  type: row.type,
                  description: row.description,
                  disabled: row.disabled ?? false,
                })
              );

              const kv: UIFormDataKV[] = nextRows.filter(
                (row: UIFormDataKV) => row.disabled !== true && row.key.trim() !== ''
              );

              onChange(
                toRequestWithData(request, {
                  ...data,
                  body: { mode: 'formdata', language: rawLang, kv },
                  _ui: { ...(data._ui ?? {}), formdataRows: nextRows },
                })
              );
            }}
          />
        ) : mode === 'urlencoded' ? (
          <Editors.UrlEncoded
            data={urlencodedRows.map((row: UIUrlEncodedKV): { key: string; value: string; disabled?: boolean; description?: string } => ({
              key: row.key,
              value: row.value,
              disabled: row.disabled ?? false,
              description: row.description,
            }))}
            onChange={(rows: Array<{ key: string; value: string; disabled?: boolean; description?: string }>): void => {
              const nextRows: UIUrlEncodedKV[] = rows.map(
                (row: { key: string; value: string; disabled?: boolean; description?: string }): UIUrlEncodedKV => ({
                  key: row.key,
                  value: row.value,
                  description: row.description,
                  disabled: row.disabled ?? false,
                })
              );

              const kv: UIUrlEncodedKV[] = nextRows.filter(
                (row: UIUrlEncodedKV) => row.disabled !== true && row.key.trim() !== ''
              );

              onChange(
                toRequestWithData(request, {
                  ...data,
                  body: { mode: 'urlencoded', language: rawLang, kv },
                  _ui: { ...(data._ui ?? {}), urlencodedRows: nextRows },
                })
              );
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

