// PluginInteractionPortal — Tier 3 renderer shell
//
// This component lives at the React root (mounted in App.tsx).
// It reads the active interaction from PluginInteractionService and renders
// either a plugin-owned dialog component (for ui.prompt) or a built-in
// alert dialog (for ui.alert / '__host_alert' promptKey) inside a Radix Dialog.
//
// The portal is invisible when there is no active interaction.

import React, { useSyncExternalStore } from 'react';
import { Dialog, Flex, Text, Button, ScrollArea } from '@radix-ui/themes';
import {
  InformationCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { pluginInteractionService } from '../../services/PluginInteractionService';
import type { ActiveInteraction } from '../../services/PluginInteractionService';

// ---------------------------------------------------------------------------
// Built-in alert dialog (for ui.alert / '__host_alert')
// ---------------------------------------------------------------------------

interface AlertPayload {
  level?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  message?: string;
  details?: string[];
}

type AlertLevel = 'info' | 'warning' | 'error' | 'success';

function alertColor(level: AlertLevel): string {
  switch (level) {
    case 'info':    return 'var(--blue-9)';
    case 'warning': return 'var(--amber-9)';
    case 'error':   return 'var(--red-9)';
    case 'success': return 'var(--green-9)';
  }
}

function AlertIcon({ level }: { level: AlertLevel }): React.ReactElement {
  const style = { width: 20, height: 20, color: alertColor(level), flexShrink: 0 };
  switch (level) {
    case 'info':    return <InformationCircleIcon style={style} />;
    case 'warning': return <ExclamationTriangleIcon style={style} />;
    case 'error':   return <XCircleIcon style={style} />;
    case 'success': return <CheckCircleIcon style={style} />;
  }
}

function BuiltinAlertDialog({
  payload,
  onSubmit,
}: {
  payload: unknown;
  onSubmit: (value: unknown) => void;
  onCancel: () => void;
}): React.ReactElement {
  const alert = (typeof payload === 'object' && payload !== null ? payload : {}) as AlertPayload;
  const level: AlertLevel = alert.level ?? 'info';
  const title = alert.title ?? 'Notice';
  const message = alert.message ?? '';
  const details = Array.isArray(alert.details) ? alert.details : [];

  return (
    <Flex direction="column" gap="3" style={{ padding: 20, minWidth: 360, maxWidth: 560 }}>
      <Flex align="center" gap="2">
        <AlertIcon level={level} />
        <Text size="3" weight="medium">
          {title}
        </Text>
      </Flex>

      {message !== '' && (
        <Text size="2" color="gray">
          {message}
        </Text>
      )}

      {details.length > 0 && (
        <ScrollArea style={{ maxHeight: 200 }}>
          <Flex direction="column" gap="1">
            {details.map((d, i) => (
              <Text
                key={i}
                size="1"
                style={{
                  fontFamily: 'monospace',
                  padding: '2px 6px',
                  background: 'var(--gray-a3)',
                  borderRadius: 4,
                  wordBreak: 'break-all',
                }}
              >
                {d}
              </Text>
            ))}
          </Flex>
        </ScrollArea>
      )}

      <Flex justify="end" gap="2" mt="2">
        <Button variant="solid" onClick={() => onSubmit(null)}>
          Dismiss
        </Button>
      </Flex>
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

export function PluginInteractionPortal(): React.ReactElement | null {
  // Subscribe to service state changes via useSyncExternalStore for concurrent-safe reads.
  const activeInteraction = useSyncExternalStore<ActiveInteraction | null>(
    (onStoreChange) => pluginInteractionService.subscribe(onStoreChange),
    () => pluginInteractionService.getActiveInteraction()
  );

  if (activeInteraction === null) {
    return null;
  }

  const { requestId, promptKey, payload, Component } = activeInteraction;

  // For the built-in alert, render the default modal; otherwise use the plugin component.
  const DialogBody =
    promptKey === '__host_alert' || Component === null
      ? BuiltinAlertDialog
      : Component;

  const handleSubmit = (value: unknown): void => {
    pluginInteractionService.resolveInteraction(requestId, value);
  };

  const handleCancel = (): void => {
    pluginInteractionService.cancelInteraction(requestId);
  };

  return (
    <Dialog.Root open={true} onOpenChange={(open) => { if (!open) handleCancel(); }}>
      <Dialog.Content
        // Prevent accidental close on outside click for non-alert interactions
        // so host flow is not accidentally unblocked.
        onInteractOutside={(e) => {
          if (promptKey !== '__host_alert') {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={() => handleCancel()}
        style={{ padding: 0, overflow: 'hidden' }}
      >
        <DialogBody
          payload={payload}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </Dialog.Content>
    </Dialog.Root>
  );
}
