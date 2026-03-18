/**
 * ImportFailureDialog — Tier 3 interaction component.
 *
 * Rendered by PluginInteractionPortal when the host-bundle calls
 * ui.prompt('insomnia:failure' | 'postman:failure', { errors: string[] }).
 *
 * Shows the error list so the user can read what went wrong, then dismisses.
 * There is no partial-import option: errors during conversion indicate a
 * problem with the source file or the converter, not something the user can
 * recover from by accepting partial results.
 */

import React from 'react';
import type { ComponentType } from 'react';
import type * as Radix from '@radix-ui/themes';

// ---------------------------------------------------------------------------
// Payload shape sent from host-bundle
// ---------------------------------------------------------------------------

export interface ImportFailurePayload {
  errors: string[];
}

interface DialogComponentProps {
  payload: unknown;
  onSubmit: (value: unknown) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Factory — accepts a human-readable format title (e.g. 'Insomnia', 'Postman')
// ---------------------------------------------------------------------------

type RadixNamespace = typeof Radix;

export function createImportFailureDialog(
  RT: RadixNamespace | null,
  formatLabel: string
): ComponentType<DialogComponentProps> {
  return function ImportFailureDialog({
    payload,
    onSubmit,
  }: DialogComponentProps): React.ReactElement | null {
    if (RT === null) {
      return null;
    }

    const failPayload = (
      typeof payload === 'object' && payload !== null ? payload : {}
    ) as ImportFailurePayload;

    const errors = Array.isArray(failPayload.errors) ? failPayload.errors : [];

    return (
      <RT.Flex direction="column" gap="4" style={{ padding: 20, minWidth: 420, maxWidth: 620 }}>
        <RT.Flex direction="column" gap="1">
          <RT.Text size="3" weight="bold" color="red">
            {formatLabel} Import Error
          </RT.Text>
          <RT.Text size="2" color="gray">
            The import could not be completed due to the following error{errors.length !== 1 ? 's' : ''}.
          </RT.Text>
        </RT.Flex>

        <RT.Flex direction="column" gap="2">
          <RT.Text
            size="1"
            color="gray"
            weight="medium"
            style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Errors
          </RT.Text>
          <RT.ScrollArea style={{ maxHeight: 240 }}>
            <RT.Flex direction="column" gap="1">
              {errors.length === 0 ? (
                <RT.Text size="2" color="gray">
                  No error details available.
                </RT.Text>
              ) : (
                errors.map((err, i) => (
                  <RT.Flex key={i} gap="2" align="start">
                    <RT.Text size="1" color="red" style={{ flexShrink: 0 }}>
                      {i + 1}.
                    </RT.Text>
                    <RT.Text
                      size="1"
                      style={{
                        fontFamily: 'monospace',
                        background: 'var(--red-a3)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        wordBreak: 'break-all',
                      }}
                    >
                      {err}
                    </RT.Text>
                  </RT.Flex>
                ))
              )}
            </RT.Flex>
          </RT.ScrollArea>
        </RT.Flex>

        <RT.Flex justify="end" mt="2">
          <RT.Button variant="solid" color="red" onClick={() => onSubmit(null)}>
            Dismiss
          </RT.Button>
        </RT.Flex>
      </RT.Flex>
    );
  };
}
