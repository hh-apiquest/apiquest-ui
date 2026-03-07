import React from 'react';
import type { ResponseTabProps } from '@apiquest/plugin-ui-types';
import type { SoapResponseData } from '@apiquest/plugin-soap';
import * as RT from '@radix-ui/themes';

/**
 * SoapResponseViewer — Renders SOAP-specific response content.
 *
 * Displays:
 *   - SOAP Fault section (when hasFault is true) — code, reason, detail in red callout
 *   - Parsed body section — pretty JSON tree of the parsed SOAP body
 *   - Raw XML section — Monaco editor with XML syntax highlighting
 */
export function SoapResponseViewer({ response, uiContext, uiState }: ResponseTabProps) {
  const { Monaco } = uiContext;
  const [activeView, setActiveView] = React.useState<'parsed' | 'raw'>('parsed');

  const soapData = response?.data as SoapResponseData | undefined;
  const fault = soapData?.fault;
  const hasFault = fault?.hasFault ?? false;
  const rawXml = soapData?.body ?? '';
  const parsed = soapData?.parsed;

  if (!response) {
    return (
      <RT.Flex align="center" justify="center" height="100%" style={{ color: 'var(--gray-9)' }}>
        <RT.Text size="2" color="gray">No response yet. Send the request to see SOAP details.</RT.Text>
      </RT.Flex>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* SOAP Fault Banner */}
      {hasFault && (
        <div style={{ flexShrink: 0, padding: '8px 12px' }}>
          <RT.Callout.Root color="red" size="2">
            <RT.Callout.Text>
              <strong>SOAP Fault</strong>
              {fault?.code && (
                <span style={{ marginLeft: 12 }}>
                  Code: <code style={{ fontFamily: 'var(--font-mono)' }}>{fault.code}</code>
                </span>
              )}
              {fault?.reason && (
                <span style={{ marginLeft: 12 }}>— {fault.reason}</span>
              )}
              {fault?.detail && (
                <div style={{ marginTop: 4, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  Detail: {fault.detail}
                </div>
              )}
            </RT.Callout.Text>
          </RT.Callout.Root>
        </div>
      )}

      {/* View toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderBottom: '1px solid var(--gray-6)',
        flexShrink: 0,
        background: 'var(--gray-2)',
      }}>
        <RT.RadioGroup.Root
          value={activeView}
          onValueChange={(v) => setActiveView(v as 'parsed' | 'raw')}
          size="1"
          variant="soft"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <RT.RadioGroup.Item value="parsed">Parsed Body</RT.RadioGroup.Item>
            <RT.RadioGroup.Item value="raw">Raw XML</RT.RadioGroup.Item>
          </div>
        </RT.RadioGroup.Root>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeView === 'raw' ? (
          <Monaco.Editor
            value={rawXml}
            language="xml"
            readonly={true}
            onChange={() => {}}
            height="100%"
            theme={uiState.theme}
          />
        ) : (
          <ParsedBodyView parsed={parsed} />
        )}
      </div>
    </div>
  );
}

function ParsedBodyView({ parsed }: { parsed: unknown }) {
  const [expanded, setExpanded] = React.useState(true);

  if (parsed === null || parsed === undefined) {
    return (
      <RT.Flex align="center" justify="center" height="100%" p="4">
        <RT.Text size="2" color="gray">No parsed body available.</RT.Text>
      </RT.Flex>
    );
  }

  const formatted = React.useMemo(() => {
    try {
      return JSON.stringify(parsed, null, 2);
    } catch {
      return String(parsed);
    }
  }, [parsed]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '6px 12px',
        borderBottom: '1px solid var(--gray-6)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <RT.Text size="1" color="gray">Parsed SOAP body content (pretty-printed JSON)</RT.Text>
        <RT.Button size="1" variant="ghost" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse' : 'Expand'}
        </RT.Button>
      </div>

      {expanded && (
        <RT.Box p="3" style={{ overflowY: 'auto', flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {formatted}
          </pre>
        </RT.Box>
      )}
    </div>
  );
}
