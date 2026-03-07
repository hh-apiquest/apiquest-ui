import React from 'react';
import type { UITabProps, HeaderEntry, GeneratedHeaderEntry, HeadersEditorState } from '@apiquest/plugin-ui-types';
import type { SoapRequestData } from '@apiquest/plugin-soap';

/**
 * HeadersTab — User-defined HTTP headers editor with SOAP-generated header preview.
 *
 * Generated headers (Content-Type and SOAPAction) are derived from soapVersion and soapAction.
 * These are shown read-only and never persisted to request.data.headers.
 */
export function HeadersTab({ request, onChange, uiContext }: UITabProps) {
  const data = request.data as unknown as SoapRequestData & { _ui?: { headersRows?: HeaderEntry[]; headersEditorState?: HeadersEditorState; [k: string]: unknown } };

  // Read HeaderEntry[] from transient _ui state; fall back to building from Record
  const headers: HeaderEntry[] = data._ui?.headersRows
    ? (data._ui.headersRows as HeaderEntry[])
    : recordToHeaderEntries(data.headers);

  const headersEditorState: HeadersEditorState = data._ui?.headersEditorState ?? {};

  // Compute generated headers from SOAP version and action
  const generatedHeaders = React.useMemo((): GeneratedHeaderEntry[] => {
    const result: GeneratedHeaderEntry[] = [];
    const version = data.soapVersion ?? '1.1';
    const action = data.soapAction ?? '';

    if (version === '1.2') {
      const ct = `application/soap+xml; charset=utf-8${action ? `; action="${action}"` : ''}`;
      result.push({ key: 'Content-Type', value: ct, source: 'SOAP 1.2 body mode', readonly: true });
    } else {
      result.push({ key: 'Content-Type', value: 'text/xml; charset=utf-8', source: 'SOAP 1.1 body mode', readonly: true });
      result.push({ key: 'SOAPAction', value: `"${action}"`, source: 'SOAP 1.1 action', readonly: true });
    }

    return result;
  }, [data.soapVersion, data.soapAction]);

  function handleChange(newRows: HeaderEntry[]) {
    onChange({
      ...request,
      data: {
        ...data,
        headers: headerEntriesToRecord(newRows),
        _ui: { ...(data._ui ?? {}), headersRows: newRows },
      },
    });
  }

  function handleEditorStateChange(newState: HeadersEditorState) {
    onChange({
      ...request,
      data: {
        ...data,
        _ui: { ...(data._ui ?? {}), headersEditorState: newState },
      },
    });
  }

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

function recordToHeaderEntries(record: Record<string, string> | undefined): HeaderEntry[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({
    key,
    value,
    description: '',
    enabled: true,
  }));
}

function headerEntriesToRecord(entries: HeaderEntry[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.enabled && entry.key.trim()) {
      record[entry.key] = entry.value;
    }
  }
  return record;
}
