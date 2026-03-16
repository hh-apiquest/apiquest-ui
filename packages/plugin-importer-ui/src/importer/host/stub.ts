import type { PluginSandboxConsole } from '@apiquest/plugin-ui-types';

import type { ImportCollectionResult } from './types';

function generateId(): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 9);
  return `${stamp}-${rand}`;
}

export function createStubCollection(format: string, message: string): ImportCollectionResult {
  return {
    $schema: 'https://apiquest.dev/schemas/collection-v1.0.json',
    info: {
      id: generateId(),
      name: `Imported (${format})`,
      version: '1.0.0',
      description: `Imported from ${format} — ${message}`,
    },
    protocol: 'http',
    variables: {},
    items: [],
    warnings: [message],
  };
}

export function logStub(logger: PluginSandboxConsole, format: string, message: string): void {
  logger.warn(`[plugin-importer-ui] ${format}: ${message}`);
}

