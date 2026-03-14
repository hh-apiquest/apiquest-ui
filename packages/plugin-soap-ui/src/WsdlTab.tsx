import React from 'react';
import type { UITabProps } from '@apiquest/plugin-ui-types';
import type { SoapRequestData } from '@apiquest/plugin-soap';
import * as RT from '@radix-ui/themes';
import type { WsdlService, WsdlPort, WsdlOperation, WsdlUIState } from './types.js';

/**
 * Minimal client-side WSDL parser.
 * Extracts service/port/operation names from raw WSDL XML using the DOM parser.
 * Returns an empty array for malformed or unsupported WSDL.
 * A full WSDL parser (supporting all binding styles, SOAP 1.1/1.2, type schemas) will replace this.
 */
function parseWsdlXml(xml: string): WsdlService[] {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    if (doc.querySelector('parsererror')) {
      console.warn('[WsdlTab] WSDL XML parse error');
      return [];
    }

    const services: WsdlService[] = [];

    // Extract wsdl:service elements (namespace-agnostic querySelector)
    const serviceEls = Array.from(doc.querySelectorAll('service'));
    for (const svcEl of serviceEls) {
      const svcName = svcEl.getAttribute('name') ?? 'unknown';
      const ports: WsdlPort[] = [];

      const portEls = Array.from(svcEl.querySelectorAll('port'));
      for (const portEl of portEls) {
        const portName = portEl.getAttribute('name') ?? 'unknown';
        const bindingRef = portEl.getAttribute('binding') ?? '';

        // Strip namespace prefix (e.g. "tns:MyBinding" -> "MyBinding")
        const localBinding = bindingRef.includes(':') ? bindingRef.split(':')[1] : bindingRef;
        const bindingEl = doc.querySelector(`binding[name="${localBinding}"]`);

        let soapVersion: '1.1' | '1.2' | 'unknown' = 'unknown';
        if (bindingEl) {
          // Heuristic: check child element local names for soap:binding or soap12:binding
          const bindingChildren = Array.from(bindingEl.children);
          for (const child of bindingChildren) {
            const lname = child.localName;
            const ns = child.namespaceURI ?? '';
            if (lname === 'binding') {
              if (ns.includes('soap12') || ns.includes('soap/1.2')) {
                soapVersion = '1.2';
              } else if (ns.includes('soap') || ns.includes('soap/1.1')) {
                soapVersion = '1.1';
              }
            }
          }
        }

        const operations: WsdlOperation[] = [];
        if (bindingEl) {
          const opEls = Array.from(bindingEl.querySelectorAll('operation'));
          for (const opEl of opEls) {
            const opName = opEl.getAttribute('name') ?? 'unknown';
            // Find the soap:operation child for SOAPAction
            const soapOpChildren = Array.from(opEl.children);
            let soapAction = '';
            for (const child of soapOpChildren) {
              if (child.localName === 'operation') {
                soapAction =
                  child.getAttribute('soapAction') ??
                  child.getAttribute('soap:soapAction') ??
                  '';
                break;
              }
            }
            operations.push({
              name: opName,
              soapAction,
              soapVersion,
              inputSchema: [], // populated by a full parser in a follow-up
            });
          }
        }

        ports.push({ name: portName, operations });
      }

      services.push({ name: svcName, ports });
    }

    return services;
  } catch {
    return [];
  }
}

/**
 * WsdlTab — WSDL URL entry, Load button, service/port/operation selectors,
 * and binding-aware SOAP version display.
 *
 * Persists to request.data: wsdl, service, port, operation, soapVersion, soapAction.
 * Transient WSDL tree stored in request.data._ui.wsdlState (not persisted to file).
 */
export function WsdlTab({ request, onChange, uiContext }: UITabProps) {
  const data = request.data as unknown as SoapRequestData & { _ui?: { wsdlState?: WsdlUIState } };
  const wsdlState: WsdlUIState = data._ui?.wsdlState ?? {};

  const wsdlUrl = data.wsdl ?? '';
  const selectedService = data.service ?? '';
  const selectedPort = data.port ?? '';
  const selectedOperation = data.operation ?? '';
  const currentSoapVersion = data.soapVersion ?? '1.1';
  const currentSoapAction = data.soapAction ?? '';

  const services: WsdlService[] = wsdlState.services ?? [];
  const loading = wsdlState.loading ?? false;
  const loadError = wsdlState.error ?? null;

  // Derive current port list from selected service
  const currentServiceObj: WsdlService | undefined = services.find(s => s.name === selectedService);
  const ports: WsdlPort[] = currentServiceObj?.ports ?? [];

  // Derive current operation list from selected port
  const currentPortObj: WsdlPort | undefined = ports.find(p => p.name === selectedPort);
  const operations: WsdlOperation[] = currentPortObj?.operations ?? [];

  // Derive current operation detail
  const currentOperationObj: WsdlOperation | undefined = operations.find(o => o.name === selectedOperation);

  // Update transient wsdlState helper
  function patchWsdlState(patch: Partial<WsdlUIState>) {
    onChange({
      ...request,
      data: {
        ...data,
        _ui: {
          ...(data._ui ?? {}),
          wsdlState: { ...wsdlState, ...patch },
        },
      },
    });
  }

  // Update request data fields helper
  function patchData(patch: Partial<SoapRequestData>) {
    onChange({
      ...request,
      data: { ...data, ...patch },
    });
  }

  async function handleLoadWsdl() {
    const loc = wsdlUrl.trim();
    if (!loc) return;

    patchWsdlState({ loading: true, error: undefined, services: [] });

    try {
      if (!uiContext.host) {
        throw new Error('Host bridge not available. This plugin requires desktop v1.x or later.');
      }

      // Invoke the loadWsdl handler registered in plugin-soap-ui/dist/host-bundle.cjs.
      // Returns { xml: string } — raw WSDL XML. Parse it client-side.
      const result = await uiContext.host.invoke<{ xml: string }>('loadWsdl', { location: loc });

      // Parse the returned XML into the WsdlService tree
      const loadedServices = parseWsdlXml(result.xml);

      onChange({
        ...request,
        data: {
          ...data,
          service: undefined,
          port: undefined,
          operation: undefined,
          soapAction: undefined,
          _ui: {
            ...(data._ui ?? {}),
            wsdlState: { loading: false, error: undefined, services: loadedServices },
          },
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      patchWsdlState({ loading: false, error: msg, services: [] });
    }
  }

  async function handlePickWsdlFile() {
    if (!uiContext.host) return;

    // 1. Show file picker — host grants the path and returns it allowlisted
    const paths = await uiContext.host.showOpenDialog({
      kind: 'file',
      title: 'Select WSDL File',
      filters: [
        { name: 'WSDL / XML', extensions: ['wsdl', 'xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (!paths || paths.length === 0) return;

    const filePath = paths[0];
    // Show the selected path in the URL field and trigger load
    patchData({ wsdl: filePath });
    patchWsdlState({ loading: true, error: undefined, services: [] });

    try {
      // 2. Invoke loadWsdl — path is already in the allowlist from step 1
      const result = await uiContext.host.invoke<{ xml: string }>('loadWsdl', { location: filePath });
      const loadedServices = parseWsdlXml(result.xml);

      onChange({
        ...request,
        data: {
          ...data,
          wsdl: filePath,
          service: undefined,
          port: undefined,
          operation: undefined,
          soapAction: undefined,
          _ui: {
            ...(data._ui ?? {}),
            wsdlState: { loading: false, error: undefined, services: loadedServices },
          },
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      patchWsdlState({ loading: false, error: msg, services: [] });
    }
  }

  function handleServiceChange(svcName: string) {
    onChange({
      ...request,
      data: {
        ...data,
        service: svcName,
        port: undefined,
        operation: undefined,
        soapAction: undefined,
      },
    });
  }

  function handlePortChange(portName: string) {
    onChange({
      ...request,
      data: {
        ...data,
        port: portName,
        operation: undefined,
        soapAction: undefined,
      },
    });
  }

  function handleOperationChange(opName: string) {
    const op = operations.find(o => o.name === opName);
    const derivedVersion = op?.soapVersion === '1.1' || op?.soapVersion === '1.2'
      ? op.soapVersion
      : currentSoapVersion;
    onChange({
      ...request,
      data: {
        ...data,
        operation: opName,
        soapAction: op?.soapAction ?? undefined,
        soapVersion: derivedVersion,
        // Switch body mode to operation when an operation is selected
        body: {
          mode: 'operation',
          args: (data.body?.mode === 'operation' ? (data.body.args ?? {}) : {}),
        },
      },
    });
  }

  function handleSoapActionChange(val: string) {
    patchData({ soapAction: val || undefined });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      {/* WSDL Location Row */}
      <RT.Flex direction="column" gap="1">
        <RT.Text size="1" weight="bold" color="gray">WSDL Location</RT.Text>
        <RT.Flex gap="2" align="center">
          <RT.TextField.Root
            value={wsdlUrl}
            onChange={(e) => patchData({ wsdl: (e.target as HTMLInputElement).value })}
            placeholder="https://service.example.com/Service?wsdl or /path/to/service.wsdl"
            size="2"
            style={{ flex: 1 }}
          />
          {uiContext.host && (
            <RT.Button
              size="2"
              variant="outline"
              onClick={handlePickWsdlFile}
              disabled={loading}
            >
              Browse
            </RT.Button>
          )}
          <RT.Button
            size="2"
            variant="solid"
            onClick={handleLoadWsdl}
            disabled={loading || !wsdlUrl.trim()}
          >
            {loading ? 'Loading...' : 'Load WSDL'}
          </RT.Button>
        </RT.Flex>
      </RT.Flex>

      {/* Error display */}
      {loadError && (
        <RT.Callout.Root color="red" size="1">
          <RT.Callout.Text>{loadError}</RT.Callout.Text>
        </RT.Callout.Root>
      )}

      {/* Service selector */}
      {services.length > 0 && (
        <RT.Flex direction="column" gap="1">
          <RT.Text size="1" weight="bold" color="gray">Service</RT.Text>
          <RT.Select.Root
            value={selectedService}
            onValueChange={handleServiceChange}
            size="2"
          >
            <RT.Select.Trigger placeholder="Select service..." style={{ width: '100%' }} />
            <RT.Select.Content>
              {services.map(svc => (
                <RT.Select.Item key={svc.name} value={svc.name}>{svc.name}</RT.Select.Item>
              ))}
            </RT.Select.Content>
          </RT.Select.Root>
        </RT.Flex>
      )}

      {/* Port selector */}
      {selectedService && ports.length > 0 && (
        <RT.Flex direction="column" gap="1">
          <RT.Text size="1" weight="bold" color="gray">Port / Binding</RT.Text>
          <RT.Select.Root
            value={selectedPort}
            onValueChange={handlePortChange}
            size="2"
          >
            <RT.Select.Trigger placeholder="Select port..." style={{ width: '100%' }} />
            <RT.Select.Content>
              {ports.map(p => (
                <RT.Select.Item key={p.name} value={p.name}>{p.name}</RT.Select.Item>
              ))}
            </RT.Select.Content>
          </RT.Select.Root>
        </RT.Flex>
      )}

      {/* Operation selector */}
      {selectedPort && operations.length > 0 && (
        <RT.Flex direction="column" gap="1">
          <RT.Text size="1" weight="bold" color="gray">Operation</RT.Text>
          <RT.Select.Root
            value={selectedOperation}
            onValueChange={handleOperationChange}
            size="2"
          >
            <RT.Select.Trigger placeholder="Select operation..." style={{ width: '100%' }} />
            <RT.Select.Content>
              {operations.map(op => (
                <RT.Select.Item key={op.name} value={op.name}>{op.name}</RT.Select.Item>
              ))}
            </RT.Select.Content>
          </RT.Select.Root>
        </RT.Flex>
      )}

      {/* Binding-derived SOAP version display */}
      {currentOperationObj && (
        <RT.Flex direction="column" gap="1">
          <RT.Text size="1" weight="bold" color="gray">SOAP Version (from binding)</RT.Text>
          <RT.Flex align="center" gap="2">
            <RT.Badge
              color={currentOperationObj.soapVersion === '1.2' ? 'blue' : 'amber'}
              variant="soft"
              size="1"
            >
              SOAP {currentOperationObj.soapVersion === 'unknown' ? currentSoapVersion : currentOperationObj.soapVersion}
            </RT.Badge>
            {currentOperationObj.soapVersion === 'unknown' && (
              <RT.Text size="1" color="gray">Binding version could not be determined — using request default.</RT.Text>
            )}
            {currentOperationObj.soapVersion !== 'unknown' && (
              <RT.Text size="1" color="gray">
                Set from WSDL binding. Affects Content-Type and envelope namespace.
              </RT.Text>
            )}
          </RT.Flex>
        </RT.Flex>
      )}

      {/* SOAPAction display / override */}
      {selectedOperation && (
        <RT.Flex direction="column" gap="1">
          <RT.Flex align="center" gap="2">
            <RT.Text size="1" weight="bold" color="gray">SOAPAction</RT.Text>
            <RT.Text size="1" color="gray">(derived from WSDL — edit to override)</RT.Text>
          </RT.Flex>
          <RT.TextField.Root
            value={currentSoapAction}
            onChange={(e) => handleSoapActionChange((e.target as HTMLInputElement).value)}
            placeholder="http://example.com/GetWeather"
            size="2"
          />
        </RT.Flex>
      )}

      {/* Empty state */}
      {!loading && services.length === 0 && !loadError && !wsdlUrl && (
        <RT.Flex align="center" justify="center" py="8">
          <RT.Text size="2" color="gray">
            Enter a WSDL URL or file path above and click Load WSDL to discover available operations.
          </RT.Text>
        </RT.Flex>
      )}

      {/* No-WSDL hint when URL is set but not yet loaded */}
      {!loading && services.length === 0 && !loadError && wsdlUrl && (
        <RT.Flex align="center" justify="center" py="4">
          <RT.Text size="2" color="gray">
            Click Load WSDL to parse the service contract.
          </RT.Text>
        </RT.Flex>
      )}
    </div>
  );
}
