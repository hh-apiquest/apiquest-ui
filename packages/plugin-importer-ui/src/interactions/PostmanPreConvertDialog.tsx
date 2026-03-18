/**
 * PostmanPreConvertDialog — Tier 3 interaction component.
 *
 * Rendered by PluginInteractionPortal when the host-bundle calls
 * ui.prompt('postman:pre-convert-options', <PostmanCollectionSummary>).
 *
 * Lets the user review what is in the collection and configure:
 *   - Strict mode (default off)  — unsupported patterns are hard errors
 *   - Script conversion (default on) — convert pm.* to quest.*
 *   - AI script conversion (default off) — use AI instead of rule-based
 *
 * Submitting calls onSubmit({ strictMode, convertScripts, useAi }).
 * Cancelling calls onCancel() which returns ok=false and aborts the import.
 */

import React, { useState } from 'react';
import type { ComponentType } from 'react';
import type * as Radix from '@radix-ui/themes';

import type { PostmanCollectionSummary } from '../importer/host/postman';

// ---------------------------------------------------------------------------
// Options shape submitted to host-bundle
// ---------------------------------------------------------------------------

export interface PostmanPreConvertOptions {
  strictMode: boolean;
  convertScripts: boolean;
  useAi: boolean;
}

// ---------------------------------------------------------------------------
// Dialog props
// ---------------------------------------------------------------------------

interface DialogPayload extends PostmanCollectionSummary {}

interface DialogComponentProps {
  payload: unknown;
  onSubmit: (value: unknown) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Factory — creates the component with access to Radix from PluginUIContext.
// ---------------------------------------------------------------------------

type RadixNamespace = typeof Radix;

export function createPostmanPreConvertDialog(
  RT: RadixNamespace | null
): ComponentType<DialogComponentProps> {
  return function PostmanPreConvertDialog({
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

    const collectionName =
      typeof summary.name === 'string' ? summary.name : 'Postman Collection';
    const requestCount =
      typeof summary.requestCount === 'number' ? summary.requestCount : 0;
    const folderCount =
      typeof summary.folderCount === 'number' ? summary.folderCount : 0;
    const hasScripts = summary.hasScripts === true;
    const variableCount =
      typeof summary.variableCount === 'number' ? summary.variableCount : 0;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [strictMode, setStrictMode] = useState(false);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [convertScripts, setConvertScripts] = useState(hasScripts);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [useAi, setUseAi] = useState(false);

    const handleImport = (): void => {
      const options: PostmanPreConvertOptions = {
        strictMode,
        convertScripts,
        useAi: convertScripts && useAi,
      };
      onSubmit(options);
    };

    return (
      <RT.Flex direction="column" gap="4" style={{ padding: 20, minWidth: 400, maxWidth: 580 }}>
        <RT.Flex direction="column" gap="1">
          <RT.Text size="3" weight="bold">
            Import Postman Collection
          </RT.Text>
          <RT.Text size="2" color="gray">
            Collection: <RT.Strong>{collectionName}</RT.Strong>
          </RT.Text>
        </RT.Flex>

        <RT.Flex direction="column" gap="1">
          <RT.Text
            size="1"
            color="gray"
            weight="medium"
            style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
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
            {variableCount > 0 && (
              <RT.Badge color="green" variant="soft">
                {variableCount} variable{variableCount !== 1 ? 's' : ''}
              </RT.Badge>
            )}
            {hasScripts && (
              <RT.Badge color="orange" variant="soft">
                has scripts
              </RT.Badge>
            )}
          </RT.Flex>
        </RT.Flex>

        <RT.Separator size="4" />

        <RT.Flex direction="column" gap="3">
          <RT.Text size="2" weight="medium">Import options</RT.Text>

          <RT.Flex justify="between" align="center">
            <RT.Flex direction="column" gap="1">
              <RT.Text size="2">Strict mode</RT.Text>
              <RT.Text size="1" color="gray">
                Require deterministic test declarations — no conditional tests or try/catch wrappers.
                Off by default for Postman imports since Postman scripts do not have this constraint.
              </RT.Text>
            </RT.Flex>
            <RT.Switch
              checked={strictMode}
              onCheckedChange={(checked: boolean) => setStrictMode(checked)}
            />
          </RT.Flex>

          {hasScripts && (
            <>
              <RT.Flex justify="between" align="center">
                <RT.Flex direction="column" gap="1">
                  <RT.Text size="2">Convert scripts</RT.Text>
                  <RT.Text size="1" color="gray">
                    Migrate pm.* API calls to quest.* equivalents
                  </RT.Text>
                </RT.Flex>
                <RT.Switch
                  checked={convertScripts}
                  onCheckedChange={(checked: boolean) => setConvertScripts(checked)}
                />
              </RT.Flex>

              {convertScripts && (
                <RT.Flex justify="between" align="center">
                  <RT.Flex direction="column" gap="1">
                    <RT.Text size="2">Use AI for script conversion</RT.Text>
                    <RT.Text size="1" color="gray">
                      AI converts complex scripts — requires AI to be configured in settings
                    </RT.Text>
                  </RT.Flex>
                  <RT.Switch
                    checked={useAi}
                    onCheckedChange={(checked: boolean) => setUseAi(checked)}
                  />
                </RT.Flex>
              )}
            </>
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
