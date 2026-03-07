import React from 'react';
import type {
  IProtocolPluginUI,
  UITab,
  ResponseUITab,
  RequestBadge,
  RequestSummary,
  ScriptIntellisenseContext,
  ScriptIntellisense,
  PluginUIContext,
  ProtocolViewProps,
  SummaryLineComponent,
} from '@apiquest/plugin-ui-types';
import type { Request, ProtocolResponse } from '@apiquest/types';
import type { SoapRequestData, SoapResponseData } from '@apiquest/plugin-soap';
import * as RT from '@radix-ui/themes';

// Import script declaration text for Monaco IntelliSense
// These are loaded as raw strings via Vite's ?raw import
import soapRequestDecl from '@apiquest/plugin-soap/dist/scriptDeclarations.request.d.ts?raw';
import soapResponseDecl from '@apiquest/plugin-soap/dist/scriptDeclarations.response.d.ts?raw';

import { WsdlTab } from './WsdlTab.js';
import { BodyTab } from './BodyTab.js';
import { HeadersTab } from './HeadersTab.js';
import { SecurityTab } from './SecurityTab.js';
import { AttachmentsTab } from './AttachmentsTab.js';
import { SoapResponseViewer } from './SoapResponseViewer.js';

let UI: PluginUIContext;

/**
 * Address bar — SOAP endpoint-only.
 * No SOAP version selector here; version is handled in WSDL/Body tabs.
 */
function SoapAddressBar({
  request,
  onChange,
}: {
  request: Request;
  onChange: (request: Request) => void;
}) {
  const data = request.data as unknown as SoapRequestData;
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
        background: 'var(--color-background)',
      }}
    >
      {/* Static SOAP badge — no method selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          borderRight: '1px solid var(--gray-7)',
          background: 'var(--amber-3)',
          flexShrink: 0,
        }}
      >
        <RT.Text size="1" weight="bold" style={{ color: 'var(--amber-11)', fontFamily: 'var(--font-mono)' }}>
          SOAP
        </RT.Text>
      </div>

      {/* Endpoint URL */}
      <div style={{ flex: 1, display: 'flex' }}>
        <RT.TextField.Root
          value={url}
          onChange={(e) =>
            onChange({
              ...request,
              data: { ...data, url: (e.target as HTMLInputElement).value },
            })
          }
          placeholder="https://service.example.com/WeatherService"
          size="2"
          variant="surface"
          style={{
            flex: 1,
            border: 'none',
            borderRadius: 0,
            height: '100%',
          }}
        />
      </div>
    </div>
  );
}

const SoapSummaryLine: SummaryLineComponent = ({ request, response }) => {
  const data = request?.data as unknown as SoapRequestData | undefined;
  const soapData = response?.data as unknown as SoapResponseData | undefined;

  const status = soapData?.status ?? 0;
  const statusText = soapData?.statusText ?? '';
  const duration = response?.summary?.duration ?? 0;
  const hasFault = soapData?.fault?.hasFault ?? false;
  const operation = data?.operation;
  const url = data?.url ?? '';

  let statusColor = 'var(--gray-9)';
  if (hasFault) {
    statusColor = 'var(--orange-9)';
  } else if (status >= 200 && status < 300) {
    statusColor = 'var(--green-9)';
  } else if (status >= 400) {
    statusColor = 'var(--red-9)';
  }

  const label = hasFault ? `${status} (FAULT)` : `${status} ${statusText}`.trim();

  return (
    <RT.Flex align="center" gap="2" style={{ minWidth: 0, overflow: 'hidden' }}>
      <RT.Badge color="amber" variant="soft">SOAP</RT.Badge>
      {operation && (
        <RT.Badge color="violet" variant="soft">{operation}</RT.Badge>
      )}
      {url && (
        <RT.Text
          size="1"
          color="gray"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}
          title={url}
        >
          {url}
        </RT.Text>
      )}
      {status > 0 && (
        <RT.Text size="1" weight="bold" style={{ color: statusColor, whiteSpace: 'nowrap' }}>
          {label}
        </RT.Text>
      )}
      {duration > 0 && (
        <RT.Text size="1" color="gray" style={{ whiteSpace: 'nowrap' }}>
          {duration}ms
        </RT.Text>
      )}
    </RT.Flex>
  );
};

function SoapDetailView({ request, response, uiContext, uiState }: ProtocolViewProps) {
  const RT = uiContext.Radix;
  const Monaco = uiContext.Monaco;
  const data = request?.data as unknown as SoapRequestData | undefined;
  const soapData = response?.data as unknown as SoapResponseData | undefined;

  const status = soapData?.status ?? 0;
  const statusText = soapData?.statusText ?? '';
  const duration = response?.summary?.duration ?? 0;
  const hasFault = soapData?.fault?.hasFault ?? false;
  const rawXml = soapData?.body ?? '';
  const responseHeaders = soapData?.headers ?? {};

  return (
    <RT.Box style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, height: '100%', overflowY: 'auto' }}>
      {/* Request info */}
      <RT.Box>
        <RT.Text size="1" weight="bold" style={{ display: 'block', marginBottom: 4 }} color="gray">Endpoint</RT.Text>
        <RT.Text size="1" style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
          {data?.url ?? ''}
        </RT.Text>
        {data?.operation && (
          <RT.Flex gap="2" align="center" mt="2">
            <RT.Badge color="violet" variant="soft" size="1">{data.operation}</RT.Badge>
            <RT.Badge color="amber" variant="soft" size="1">SOAP {data.soapVersion ?? '1.1'}</RT.Badge>
          </RT.Flex>
        )}
      </RT.Box>

      {/* Response status */}
      {status > 0 && (
        <RT.Flex gap="3" align="center">
          <RT.Badge
            color={hasFault ? 'orange' : status >= 200 && status < 300 ? 'green' : status >= 400 ? 'red' : 'gray'}
            size="2"
          >
            {status} {statusText}
          </RT.Badge>
          {hasFault && <RT.Badge color="red" variant="soft">SOAP FAULT</RT.Badge>}
          <RT.Text size="2" color="gray">{duration}ms</RT.Text>
        </RT.Flex>
      )}

      {/* Fault details */}
      {hasFault && soapData?.fault && (
        <RT.Callout.Root color="red" size="1">
          <RT.Callout.Text>
            <strong>Fault Code:</strong> {soapData.fault.code ?? 'unknown'}
            {soapData.fault.reason && <><br /><strong>Reason:</strong> {soapData.fault.reason}</>}
            {soapData.fault.detail && <><br /><strong>Detail:</strong> {soapData.fault.detail}</>}
          </RT.Callout.Text>
        </RT.Callout.Root>
      )}

      {/* Response headers */}
      {Object.keys(responseHeaders).length > 0 && (
        <RT.Box>
          <RT.Text size="1" weight="bold" style={{ display: 'block', marginBottom: 4 }} color="gray">Response Headers</RT.Text>
          <RT.Table.Root variant="surface" size="1">
            <RT.Table.Body>
              {Object.entries(responseHeaders).map(([k, v]) => (
                <RT.Table.Row key={k}>
                  <RT.Table.Cell style={{ width: '30%' }}>
                    <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--gray-11)' }}>{k}</RT.Text>
                  </RT.Table.Cell>
                  <RT.Table.Cell>
                    <RT.Text as="span" size="1" style={{ fontFamily: 'var(--font-mono)' }}>{String(v)}</RT.Text>
                  </RT.Table.Cell>
                </RT.Table.Row>
              ))}
            </RT.Table.Body>
          </RT.Table.Root>
        </RT.Box>
      )}

      {/* Raw XML body */}
      {rawXml && (
        <RT.Box style={{ flex: 1, minHeight: 200, display: 'flex', flexDirection: 'column' }}>
          <RT.Text size="1" weight="bold" style={{ display: 'block', marginBottom: 4 }} color="gray">SOAP Envelope (XML)</RT.Text>
          <div style={{ height: 300 }}>
            <Monaco.Editor
              value={rawXml}
              language="xml"
              readonly={true}
              onChange={() => {}}
              height="100%"
              theme={uiState.theme}
            />
          </div>
        </RT.Box>
      )}
    </RT.Box>
  );
}

export const soapPluginUI: IProtocolPluginUI = {
  protocol: 'soap',

  setup(uiContext: PluginUIContext) {
    UI = uiContext;
  },

  createNewRequest(name: string): Request {
    return {
      type: 'request',
      id: `req-${Date.now()}`,
      name,
      data: {
        url: '',
        soapVersion: '1.1',
        body: { mode: 'operation', args: {} },
      },
    } as any;
  },

  getRequestBadge(request: Request): RequestBadge {
    const data = request.data as unknown as SoapRequestData;
    const label = data.operation ?? 'SOAP';
    return {
      primary: label,
      color: 'amber',
    };
  },

  getSummary(request: Request, response?: ProtocolResponse): RequestSummary {
    const soapData = response?.data as SoapResponseData | undefined;
    const status = soapData?.status ?? 0;
    const hasFault = soapData?.fault?.hasFault ?? false;
    const duration = response?.summary?.duration ?? 0;

    let statusLevel: RequestSummary['statusLevel'] = 'info';
    if (hasFault) {
      statusLevel = 'warning';
    } else if (status >= 200 && status < 300) {
      statusLevel = 'success';
    } else if (status >= 400) {
      statusLevel = 'error';
    }

    return {
      summaryLine: SoapSummaryLine,
      detailView: SoapDetailView,
      statusLevel,
      fields: [
        { name: 'status', value: status },
        { name: 'statusText', value: soapData?.statusText ?? '' },
        { name: 'duration', value: duration, order: 1 },
      ],
      sortKey: status,
    };
  },

  renderAddressBar(request: Request, onChange: (request: Request) => void) {
    return <SoapAddressBar request={request} onChange={onChange} />;
  },

  getRequestTabs(): UITab[] {
    return [
      { id: 'wsdl', label: 'WSDL', position: 10, component: WsdlTab },
      { id: 'body', label: 'Body', position: 20, component: BodyTab },
      { id: 'headers', label: 'Headers', position: 30, component: HeadersTab },
      { id: 'security', label: 'Security', position: 40, component: SecurityTab },
      { id: 'attachments', label: 'Attachments', position: 50, component: AttachmentsTab },
    ];
  },

  getResponseTabs(): ResponseUITab[] {
    return [
      { id: 'soap', label: 'SOAP', position: 10, component: SoapResponseViewer },
    ];
  },

  getScriptIntellisense(context: ScriptIntellisenseContext): ScriptIntellisense[] {
    const { phase } = context;

    // Folder/collection lifecycle phases have no protocol-specific symbols
    if (
      phase === 'folder-pre' ||
      phase === 'folder-post' ||
      phase === 'collection-pre' ||
      phase === 'collection-post'
    ) {
      return [];
    }

    if (phase === 'pre-request') {
      return [
        { content: soapRequestDecl, uri: 'ts:quest-soap-request.d.ts' },
      ];
    }

    if (phase === 'post-request') {
      return [
        { content: soapRequestDecl, uri: 'ts:quest-soap-request.d.ts' },
        { content: soapResponseDecl, uri: 'ts:quest-soap-response.d.ts' },
      ];
    }

    return [];
  },
};

// Export as default for dynamic plugin loading
export default soapPluginUI;
