import React from 'react';
import type { UITabProps } from '@apiquest/plugin-ui-types';
import type { SoapRequestData } from '@apiquest/plugin-soap';
import * as RT from '@radix-ui/themes';
import type { WsdlService, WsdlPort, WsdlOperation, WsdlUIState } from './types.js';

/**
 * WsdlTab — WSDL URL entry, Load button, service/port/operation selectors,
 * and binding-aware SOAP version display.
 *
 * Persists to request.data: wsdl, service, port, operation, soapVersion, soapAction.
 * Transient WSDL tree stored in request.data._ui.wsdlState (not persisted to file).
 */
export function WsdlTab({ request, onChange }: UITabProps) {
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

    // Mark loading, clear prior error/services
    patchWsdlState({ loading: true, error: undefined, services: [] });

    try {
      // IPC call to main process
      const electronAPI = (window as any).quest as {
        soap?: { loadWsdl: (location: string) => Promise<{ services: WsdlService[] }> };
      };

      if (!electronAPI?.soap?.loadWsdl) {
        throw new Error('SOAP IPC bridge not available. Please ensure the desktop is running with SOAP support.');
      }

      const result = await electronAPI.soap.loadWsdl(loc);
      const loadedServices = result.services ?? [];

      // Persist services tree to transient state, reset selections if services changed
      onChange({
        ...request,
        data: {
          ...data,
          // Clear service/port/operation/soapAction if WSDL changed
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
