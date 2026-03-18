/**
 * Main-process module for @apiquest/plugin-importer-ui.
 *
 * When converting an Insomnia or Postman export this bundle uses Tier 3
 * ui.prompt() interactions to:
 *   1. Show the user a summary of the collection and let them pick import
 *      options before conversion starts.
 *   2. Show a failure dialog when the converter throws an error so the user
 *      can read the message before the import is aborted.
 */

import type { PluginSandboxGlobals } from '@apiquest/plugin-ui-types';

import { convertImportByFormat, normalizeConvertPayload } from './importer/host/convert';
import { getInsomniaResourceSummary, convertInsomnia } from './importer/host/insomnia';
import type { InsomniaConvertOptions } from './importer/host/insomnia';
import { getPostmanCollectionSummary, convertPostman } from './importer/host/postman';
import type { ImportCollectionResult } from './importer/host/types';

const {
  handlers,
  console: hostConsole,
  ui,
} = globalThis as unknown as PluginSandboxGlobals;

// ---------------------------------------------------------------------------
// Shared: show the failure dialog and always throw after dismissal.
// Errors during conversion are converter bugs — no partial import offered.
// ---------------------------------------------------------------------------

async function showFailureDialog(promptKey: string, errors: string[]): Promise<never> {
  await ui.prompt({
    promptKey,
    payload: { errors, partial: false, successCount: 0 },
  });
  throw new Error(`[plugin-importer-ui] Import failed (${promptKey}): ${errors[0] ?? 'unknown error'}`);
}

// ---------------------------------------------------------------------------
// Insomnia — pre-convert options + failure dialog
// ---------------------------------------------------------------------------

async function convertInsomniaWithPrompt(
  data: string,
  options: InsomniaConvertOptions
): Promise<ImportCollectionResult> {
  // Step 1 — Summarise the export and ask the user for import options.
  const summary = getInsomniaResourceSummary(data);

  if (summary !== null) {
    const promptResult = await ui.prompt<{
      importScripts: boolean;
      importBaseEnvironment: boolean;
    }>({ promptKey: 'insomnia:pre-convert-options', payload: summary });

    if (!promptResult.ok) {
      throw new Error('[plugin-importer-ui] Insomnia import cancelled by user.');
    }

    if (typeof promptResult.value === 'object' && promptResult.value !== null) {
      const userOptions = promptResult.value as { importScripts: boolean; importBaseEnvironment: boolean };
      options = {
        ...options,
        importScripts: userOptions.importScripts,
        importBaseEnvironment: userOptions.importBaseEnvironment,
      };
    }
  }

  // Step 2 — Run the converter.
  try {
    return convertInsomnia(data, hostConsole, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return showFailureDialog('insomnia:failure', [message]);
  }
}

// ---------------------------------------------------------------------------
// Postman — pre-convert options + failure dialog
// ---------------------------------------------------------------------------

async function convertPostmanWithPrompt(data: string): Promise<ImportCollectionResult> {
  // Step 1 — Summarise and ask the user for import options.
  const summary = getPostmanCollectionSummary(data);

  let strictMode = false;
  let convertScripts = true;
  let scriptConversionMode: 'rule' | 'ai' = 'rule';

  if (summary !== null) {
    const promptResult = await ui.prompt<{
      strictMode: boolean;
      convertScripts: boolean;
      useAi: boolean;
    }>({ promptKey: 'postman:pre-convert-options', payload: summary });

    if (!promptResult.ok) {
      throw new Error('[plugin-importer-ui] Postman import cancelled by user.');
    }

    if (typeof promptResult.value === 'object' && promptResult.value !== null) {
      const userOptions = promptResult.value as { strictMode: boolean; convertScripts: boolean; useAi: boolean };
      strictMode = userOptions.strictMode;
      convertScripts = userOptions.convertScripts;
      scriptConversionMode = userOptions.useAi ? 'ai' : 'rule';
    }
  }

  // Step 2 — Run the converter.
  try {
    return convertPostman(data, hostConsole, {
      convertScripts,
      scriptConversionMode,
      // strictMode from the dialog controls the collection's runtime strictMode, not
      // script-conversion strictness. See ImportConvertOptions.collectionStrictMode.
      collectionStrictMode: strictMode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return showFailureDialog('postman:failure', [message]);
  }
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

handlers.on('convert', async (payload: unknown): Promise<ImportCollectionResult> => {
  const normalized = normalizeConvertPayload(payload);

  if (normalized.format === 'insomnia') {
    const insomniaOptions: InsomniaConvertOptions = {
      convertScripts: normalized.options?.convertScripts,
      scriptConversionMode: normalized.options?.scriptConversionMode,
      strictScriptConversion: normalized.options?.strictScriptConversion,
      aiPrompt: normalized.options?.aiPrompt,
      importScripts: true,
      importBaseEnvironment: true,
    };
    return convertInsomniaWithPrompt(normalized.data, insomniaOptions);
  }

  if (normalized.format === 'postman') {
    return convertPostmanWithPrompt(normalized.data);
  }

  return convertImportByFormat(normalized.data, normalized.format, hostConsole, normalized.options);
});

hostConsole.log('[plugin-importer-ui] host-bundle initialized');
