/**
 * InsomniaPreConvertDialog — Tier 3 interaction component.
 *
 * Rendered by PluginInteractionPortal when the host-bundle calls
 * ui.prompt('insomnia:pre-convert-options', <InsomniaResourceSummary>).
 *
 * The user can choose which optional elements to include in the import.
 * Submitting with onSubmit({ importScripts, importBaseEnvironment }) resumes
 * the main-process host-bundle handler.
 * Cancelling with onCancel() returns ok=false and the import is aborted.
 */

import React, { useState } from 'react';
import type { ComponentType } from 'react';
import type * as Radix from '@radix-ui/themes';

import type { InsomniaResourceSummary } from '../importer/host/insomnia';

// ---------------------------------------------------------------------------
// Dialog props
// ---------------------------------------------------------------------------

export interface InsomniaPreConvertOptions {
  importScripts: boolean;
  importBaseEnvironment: boolean;
}

interface DialogPayload extends InsomniaResourceSummary {}

interface DialogComponentProps {
  payload: unknown;
  onSubmit: (value: unknown) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Factory — creates the component with access to Radix from PluginUIContext.
// ---------------------------------------------------------------------------

type RadixNamespace = typeof Radix;

export function createInsomniaPreConvertDialog(
  RT: RadixNamespace | null
): ComponentType<DialogComponentProps> {
  return function InsomniaPreConvertDialog({
    payload,
    onSubmit,
    onCancel,
  }: DialogComponentProps): React.ReactElement | null {
    if (RT === null) {
      return null;
    }

    const summary = (typeof payload === 'object' && payload !== null
      ? payload
      : {}) as DialogPayload;

    const hasScripts = summary.hasScripts === true;
    const hasBaseEnv = summary.hasBaseEnvironment === true;
    const requestCount = typeof summary.requestCount === 'number' ? summary.requestCount : 0;
    const folderCount = typeof summary.folderCount === 'number' ? summary.folderCount : 0;
    const workspaceName =
      typeof summary.workspaceName === 'string' ? summary.workspaceName : 'Insomnia Workspace';
    const envVarCount =
      typeof summary.baseEnvironmentVariableCount === 'number'
        ? summary.baseEnvironmentVariableCount
        : 0;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [importScripts, setImportScripts] = useState(hasScripts);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [importBaseEnvironment, setImportBaseEnvironment] = useState(hasBaseEnv);

    const handleImport = (): void => {
      onSubmit({ importScripts, importBaseEnvironment });
    };

    return (
      <RT.Flex direction="column" gap="4" style={{ padding: 20, minWidth: 400, maxWidth: 580 }}>
        <RT.Flex direction="column" gap="1">
          <RT.Text size="3" weight="bold">
            Import Insomnia Collection
          </RT.Text>
          <RT.Text size="2" color="gray">
            Workspace: <RT.Strong>{workspaceName}</RT.Strong>
          </RT.Text>
        </RT.Flex>

        <RT.Flex direction="column" gap="1">
          <RT.Text size="1" color="gray" weight="medium" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Contents to import
          </RT.Text>
          <RT.Flex gap="2" wrap="wrap">
            <RT.Badge color="blue" variant="soft">
              {requestCount} request{requestCount !== 1 ? 's' : ''}
            </RT.Badge>
            {folderCount > 0 && (
              <RT.Badge color="gray" variant="soft">
                {folderCount} folder{folderCount !== 1 ? 's' : ''}
              </RT.Badge>
            )}
            {hasBaseEnv && (
              <RT.Badge color="green" variant="soft">
                {envVarCount} environment variable{envVarCount !== 1 ? 's' : ''}
              </RT.Badge>
            )}
          </RT.Flex>
        </RT.Flex>

        <RT.Separator size="4" />

        <RT.Flex direction="column" gap="3">
          <RT.Text size="2" weight="medium">Import options</RT.Text>

          {hasBaseEnv && (
            <RT.Flex justify="between" align="center">
              <RT.Flex direction="column" gap="1">
                <RT.Text size="2">Import base environment variables</RT.Text>
                <RT.Text size="1" color="gray">
                  Adds {envVarCount} variable{envVarCount !== 1 ? 's' : ''} to the collection
                </RT.Text>
              </RT.Flex>
              <RT.Switch
                checked={importBaseEnvironment}
                onCheckedChange={(checked: boolean) => setImportBaseEnvironment(checked)}
              />
            </RT.Flex>
          )}

          {hasScripts && (
            <RT.Flex justify="between" align="center">
              <RT.Flex direction="column" gap="1">
                <RT.Text size="2">Import scripts</RT.Text>
                <RT.Text size="1" color="gray">
                  Pre-request and test scripts will be converted
                </RT.Text>
              </RT.Flex>
              <RT.Switch
                checked={importScripts}
                onCheckedChange={(checked: boolean) => setImportScripts(checked)}
              />
            </RT.Flex>
          )}

          {!hasBaseEnv && !hasScripts && (
            <RT.Text size="2" color="gray">
              No optional elements detected in this export.
            </RT.Text>
          )}
        </RT.Flex>

        <RT.Flex justify="end" gap="2" mt="2">
          <RT.Button variant="soft" color="gray" onClick={onCancel}>
            Cancel
          </RT.Button>
          <RT.Button variant="solid" onClick={handleImport}>
            Import
          </RT.Button>
        </RT.Flex>
      </RT.Flex>
    );
  };
}
