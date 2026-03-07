import React from 'react';
import type { UITabProps } from '@apiquest/plugin-ui-types';
import type { SoapRequestData, SoapSecurity, SoapSecurityMode } from '@apiquest/plugin-soap';
import * as RT from '@radix-ui/themes';

/**
 * SecurityTab — WS-Security configuration.
 *
 * Modes:
 *   none         — No WS-Security header (default)
 *   usernameToken — Username + password embedded in SOAP envelope
 *   x509         — X.509 digital signature using cert/key
 *
 * Persists to request.data.security.
 */
export function SecurityTab({ request, onChange }: UITabProps) {
  const data = request.data as unknown as SoapRequestData;
  const security: SoapSecurity = data.security ?? { mode: 'none' };
  const mode: SoapSecurityMode = security.mode;

  function patchSecurity(patch: Partial<SoapSecurity>) {
    onChange({
      ...request,
      data: { ...data, security: { ...security, ...patch } },
    });
  }

  function handleModeChange(newMode: SoapSecurityMode) {
    onChange({
      ...request,
      data: {
        ...data,
        security: { mode: newMode },
      },
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      {/* Mode selector */}
      <RT.Flex direction="column" gap="1">
        <RT.Text size="1" weight="bold" color="gray">WS-Security Mode</RT.Text>
        <RT.RadioGroup.Root
          value={mode}
          onValueChange={(v) => handleModeChange(v as SoapSecurityMode)}
          size="2"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <RT.RadioGroup.Item value="none">None</RT.RadioGroup.Item>
            <RT.RadioGroup.Item value="usernameToken">UsernameToken</RT.RadioGroup.Item>
            <RT.RadioGroup.Item value="x509">X.509</RT.RadioGroup.Item>
          </div>
        </RT.RadioGroup.Root>
      </RT.Flex>

      {/* UsernameToken fields */}
      {mode === 'usernameToken' && (
        <RT.Flex direction="column" gap="3">
          <RT.Callout.Root color="blue" size="1">
            <RT.Callout.Text>
              UsernameToken inserts a WS-Security header with credentials in the SOAP envelope.
              This is separate from transport-level auth (Basic/Bearer).
            </RT.Callout.Text>
          </RT.Callout.Root>

          <RT.Flex direction="column" gap="1">
            <RT.Text size="1" weight="bold" color="gray">Username</RT.Text>
            <RT.TextField.Root
              value={security.username ?? ''}
              onChange={(e) => patchSecurity({ username: (e.target as HTMLInputElement).value })}
              placeholder="service_user"
              size="2"
            />
          </RT.Flex>

          <RT.Flex direction="column" gap="1">
            <RT.Text size="1" weight="bold" color="gray">Password</RT.Text>
            <RT.TextField.Root
              value={security.password ?? ''}
              onChange={(e) => patchSecurity({ password: (e.target as HTMLInputElement).value })}
              placeholder="Use {{variableName}} for secret values"
              size="2"
              type="password"
            />
          </RT.Flex>
        </RT.Flex>
      )}

      {/* X.509 fields */}
      {mode === 'x509' && (
        <RT.Flex direction="column" gap="3">
          <RT.Callout.Root color="blue" size="1">
            <RT.Callout.Text>
              X.509 digitally signs the SOAP envelope using a client certificate and private key.
              Provide file paths or PEM-encoded content.
            </RT.Callout.Text>
          </RT.Callout.Root>

          <RT.Flex direction="column" gap="1">
            <RT.Text size="1" weight="bold" color="gray">Certificate (PEM path or content)</RT.Text>
            <RT.TextArea
              value={security.cert ?? ''}
              onChange={(e) => patchSecurity({ cert: (e.target as HTMLTextAreaElement).value })}
              placeholder="/path/to/client-cert.pem or -----BEGIN CERTIFICATE-----"
              style={{ minHeight: 80, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </RT.Flex>

          <RT.Flex direction="column" gap="1">
            <RT.Text size="1" weight="bold" color="gray">Private Key (PEM path or content)</RT.Text>
            <RT.TextArea
              value={security.key ?? ''}
              onChange={(e) => patchSecurity({ key: (e.target as HTMLTextAreaElement).value })}
              placeholder="/path/to/client-key.pem or -----BEGIN PRIVATE KEY-----"
              style={{ minHeight: 80, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </RT.Flex>

          <RT.Flex direction="column" gap="1">
            <RT.Text size="1" weight="bold" color="gray">Key Passphrase</RT.Text>
            <RT.TextField.Root
              value={security.passphrase ?? ''}
              onChange={(e) => patchSecurity({ passphrase: (e.target as HTMLInputElement).value })}
              placeholder="Use {{variableName}} for secret values"
              size="2"
              type="password"
            />
          </RT.Flex>
        </RT.Flex>
      )}

      {/* None state hint */}
      {mode === 'none' && (
        <RT.Flex align="center" justify="center" py="8">
          <RT.Text size="2" color="gray">
            No WS-Security header will be added. Select a mode above to configure SOAP-level security.
          </RT.Text>
        </RT.Flex>
      )}
    </div>
  );
}
