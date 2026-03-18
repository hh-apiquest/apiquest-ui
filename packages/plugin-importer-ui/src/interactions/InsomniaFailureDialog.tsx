/**
 * InsomniaFailureDialog — Tier 3 interaction component.
 *
 * Rendered by PluginInteractionPortal when the host-bundle calls
 * ui.prompt('insomnia:failure', { errors: string[], partial?: boolean }).
 *
 * Allows the user to either accept the partial import (onSubmit with proceed=true)
 * or cancel the import entirely (onCancel).
 */

import React from 'react';
import type { ComponentType } from 'react';
import type * as Radix from '@radix-ui/themes';

// ---------------------------------------------------------------------------
// Payload shape sent from host-bundle
// ---------------------------------------------------------------------------

export interface InsomniaFailurePayload {
  errors: string[];
  /** If true, some items were converted successfully — partial import is possible. */
  partial: boolean;
  /** How many items were successfully converted. */
  successCount?: number;
}

interface DialogComponentProps {
  payload: unknown;
  onSubmit: (value: unknown) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

type RadixNamespace = typeof Radix;

export function createInsomniaFailureDialog(
  RT: RadixNamespace | null
): ComponentType<DialogComponentProps> {
  return function InsomniaFailureDialog({
    payload,
    onSubmit,
    onCancel,
  }: DialogComponentProps): React.ReactElement | null {
    if (RT === null) {
      return null;
    }

    const failPayload = (
      typeof payload === 'object' && payload !== null ? payload : {}
    ) as InsomniaFailurePayload;

    const errors = Array.isArray(failPayload.errors) ? failPayload.errors : [];
    const isPartial = failPayload.partial === true;
    const successCount =
      typeof failPayload.successCount === 'number' ? failPayload.successCount : null;

    return (
      <RT.Flex direction="column" gap="4" style={{ padding: 20, minWidth: 420, maxWidth: 620 }}>
        <RT.Flex direction="column" gap="1">
          <RT.Text size="3" weight="bold" color="red">
            Insomnia Import Error
          </RT.Text>
          <RT.Text size="2" color="gray">
            {isPartial
              ? `The import completed with ${errors.length} error${errors.length !== 1 ? 's' : ''}. ` +
                (successCount !== null
                  ? `${successCount} item${successCount !== 1 ? 's' : ''} were imported successfully.`
                  : '')
              : `The import could not be completed due to the following error${errors.length !== 1 ? 's' : ''}.`}
          </RT.Text>
        </RT.Flex>

        <RT.Flex direction="column" gap="2">
          <RT.Text size="1" color="gray" weight="medium" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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

        <RT.Flex justify="end" gap="2" mt="2">
          <RT.Button variant="soft" color="gray" onClick={onCancel}>
            Cancel import
          </RT.Button>
          {isPartial && (
            <RT.Button
              variant="solid"
              color="amber"
              onClick={() => onSubmit({ proceed: true })}
            >
              Import partial results
            </RT.Button>
          )}
          {!isPartial && (
            <RT.Button
              variant="solid"
              color="red"
              onClick={() => onSubmit({ proceed: false })}
            >
              Dismiss
            </RT.Button>
          )}
        </RT.Flex>
      </RT.Flex>
    );
  };
}
