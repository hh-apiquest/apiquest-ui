/**
 * Main-process module for @apiquest/plugin-importer-ui.
 * Runs inside a vm.createContext sandbox in the Electron main process.
 */

import type { PluginSandboxGlobals } from '@apiquest/plugin-ui-types';

import { convertImportByFormat, normalizeConvertPayload } from './importer/host/convert';
import type { ImportCollectionResult } from './importer/host/types';

const { handlers, console: hostConsole } = globalThis as unknown as PluginSandboxGlobals;

handlers.on('convert', async (payload: unknown): Promise<ImportCollectionResult> => {
  const normalized = normalizeConvertPayload(payload);
  return convertImportByFormat(normalized.data, normalized.format, hostConsole, normalized.options);
});

hostConsole.log('host-bundle initialized');

