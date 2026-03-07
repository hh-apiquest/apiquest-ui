import React from 'react';
import type { UITabProps } from '@apiquest/plugin-ui-types';
import type { SoapRequestData } from '@apiquest/plugin-soap';
import * as RT from '@radix-ui/themes';
import type { WsdlFieldSchema, WsdlUIState } from './types.js';

/**
 * BodyTab — SOAP body authoring.
 *
 * mode = 'operation' (WSDL-driven):
 *   Renders a flat form for top-level args derived from the selected operation's inputSchema.
 *   Complex fields render a label noting nested structure; expand later.
 *   Version is shown/set via the WSDL binding (see WsdlTab).
 *
 * mode = 'raw' (manual XML envelope):
 *   Monaco XML editor for the full SOAP envelope.
 *   Exposes explicit SOAP version selector (1.1 / 1.2) since no WSDL binding is available.
 */
export function BodyTab({ request, onChange, uiContext, uiState }: UITabProps) {
  const { Monaco } = uiContext;
  const data = request.data as unknown as SoapRequestData & { _ui?: { wsdlState?: WsdlUIState; [k: string]: unknown } };
  const bodyMode = data.body?.mode ?? 'operation';
  const rawXml = data.body?.raw ?? '';
  const args = data.body?.args ?? {};
  const currentSoapVersion = data.soapVersion ?? '1.1';

  // Get inputSchema from current operation (if WSDL loaded and operation selected)
  const wsdlState: WsdlUIState = data._ui?.wsdlState ?? {};
  const services = wsdlState.services ?? [];
  const selectedService = services.find(s => s.name === data.service);
  const selectedPort = selectedService?.ports.find(p => p.name === data.port);
  const selectedOperation = selectedPort?.operations.find(o => o.name === data.operation);
  const inputSchema: WsdlFieldSchema[] = selectedOperation?.inputSchema ?? [];

  function setMode(newMode: 'operation' | 'raw') {
    onChange({
      ...request,
      data: {
        ...data,
        body: {
          mode: newMode,
          ...(newMode === 'raw' ? { raw: rawXml } : { args }),
        },
      },
    });
  }

  function handleRawChange(value: string) {
    onChange({
      ...request,
      data: { ...data, body: { mode: 'raw', raw: value } },
    });
  }

  function handleArgChange(fieldName: string, value: string) {
    onChange({
      ...request,
      data: {
        ...data,
        body: {
          mode: 'operation',
          args: { ...args, [fieldName]: value },
        },
      },
    });
  }

  function handleVersionChange(v: '1.1' | '1.2') {
    onChange({ ...request, data: { ...data, soapVersion: v } });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Mode toggle toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderBottom: '1px solid var(--gray-6)',
        flexShrink: 0,
      }}>
        <RT.RadioGroup.Root
          value={bodyMode}
          onValueChange={(v) => setMode(v as 'operation' | 'raw')}
          size="1"
          variant="soft"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <RT.RadioGroup.Item value="operation">Args (WSDL)</RT.RadioGroup.Item>
            <RT.RadioGroup.Item value="raw">Raw XML</RT.RadioGroup.Item>
          </div>
        </RT.RadioGroup.Root>

        {/* Version selector only for raw mode */}
        {bodyMode === 'raw' && (
          <RT.Flex align="center" gap="2" style={{ marginLeft: 16, paddingLeft: 16, borderLeft: '1px solid var(--gray-6)' }}>
            <RT.Text size="1" color="gray">SOAP Version:</RT.Text>
            <RT.Select.Root
              value={currentSoapVersion}
              onValueChange={(v) => handleVersionChange(v as '1.1' | '1.2')}
              size="1"
            >
              <RT.Select.Trigger style={{ minWidth: 80 }} />
              <RT.Select.Content>
                <RT.Select.Item value="1.1">1.1</RT.Select.Item>
                <RT.Select.Item value="1.2">1.2</RT.Select.Item>
              </RT.Select.Content>
            </RT.Select.Root>
          </RT.Flex>
        )}
      </div>

      {/* Body content area */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {bodyMode === 'raw' ? (
          <Monaco.Editor
            value={rawXml}
            language="xml"
            onChange={handleRawChange}
            height="100%"
            theme={uiState.theme}
          />
        ) : (
          <OperationArgsForm
            inputSchema={inputSchema}
            args={args}
            onArgChange={handleArgChange}
            hasOperation={!!data.operation}
            hasWsdl={!!data.wsdl}
          />
        )}
      </div>
    </div>
  );
}

function OperationArgsForm({
  inputSchema,
  args,
  onArgChange,
  hasOperation,
  hasWsdl,
}: {
  inputSchema: WsdlFieldSchema[];
  args: Record<string, unknown>;
  onArgChange: (name: string, value: string) => void;
  hasOperation: boolean;
  hasWsdl: boolean;
}) {
  if (!hasWsdl) {
    return (
      <RT.Flex align="center" justify="center" height="100%" p="4">
        <RT.Text size="2" color="gray">
          Go to the WSDL tab, enter a WSDL URL, and load it to enable operation-based authoring.
        </RT.Text>
      </RT.Flex>
    );
  }

  if (!hasOperation) {
    return (
      <RT.Flex align="center" justify="center" height="100%" p="4">
        <RT.Text size="2" color="gray">
          Select a service, port, and operation in the WSDL tab to author operation arguments.
        </RT.Text>
      </RT.Flex>
    );
  }

  if (inputSchema.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <RT.Text size="2" color="gray">
          This operation takes no input parameters, or the schema could not be determined.
          Edit the args object directly in JSON if needed.
        </RT.Text>
        <div style={{ marginTop: 12 }}>
          <RT.Text as="div" size="1" weight="bold" color="gray" mb="1">Raw args (JSON):</RT.Text>
          <RT.TextArea
            value={JSON.stringify(args, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse((e.target as HTMLTextAreaElement).value);
                // We can't call onArgChange for all at once; handle via parent if needed
                // For now just show the editor
                void parsed;
              } catch {
                // ignore parse errors while typing
              }
            }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minHeight: 200, width: '100%' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
      <RT.Flex direction="column" gap="3">
        {inputSchema.map((field) => (
          <FieldRow
            key={field.name}
            field={field}
            value={String(args[field.name] ?? '')}
            onChange={(val) => onArgChange(field.name, val)}
          />
        ))}
      </RT.Flex>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: WsdlFieldSchema;
  value: string;
  onChange: (val: string) => void;
}) {
  const isComplex = field.type === 'complex' || (field.children && field.children.length > 0);

  return (
    <RT.Flex direction="column" gap="1">
      <RT.Flex align="center" gap="2">
        <RT.Text size="1" weight="bold">
          {field.name}
        </RT.Text>
        {field.required && (
          <RT.Badge color="red" variant="soft" size="1">required</RT.Badge>
        )}
        <RT.Text size="1" color="gray">({field.type})</RT.Text>
      </RT.Flex>

      {isComplex ? (
        <RT.Callout.Root color="amber" size="1">
          <RT.Callout.Text>
            Complex type — edit the raw JSON args or use Raw XML mode for nested structures.
          </RT.Callout.Text>
        </RT.Callout.Root>
      ) : field.type === 'boolean' ? (
        <RT.Select.Root
          value={value === 'true' ? 'true' : 'false'}
          onValueChange={onChange}
          size="2"
        >
          <RT.Select.Trigger style={{ width: '100%' }} />
          <RT.Select.Content>
            <RT.Select.Item value="true">true</RT.Select.Item>
            <RT.Select.Item value="false">false</RT.Select.Item>
          </RT.Select.Content>
        </RT.Select.Root>
      ) : (
        <RT.TextField.Root
          value={value}
          onChange={(e) => onChange((e.target as HTMLInputElement).value)}
          placeholder={`Enter ${field.type}...`}
          size="2"
          type={field.type === 'int' || field.type === 'number' ? 'number' : 'text'}
        />
      )}
    </RT.Flex>
  );
}
