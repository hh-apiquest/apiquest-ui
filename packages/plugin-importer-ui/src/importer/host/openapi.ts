import type { PluginSandboxConsole } from '@apiquest/plugin-ui-types';

import { createStubCollection, logStub } from './stub';
import type { ImportCollectionResult, ImportConvertOptions } from './types';

export function convertOpenApi(
  _raw: string,
  format: 'openapi-3.0' | 'openapi-3.1',
  logger: PluginSandboxConsole,
  options?: ImportConvertOptions
): ImportCollectionResult {
  const message = `converter stub only; full ${format} mapping is pending`;

  if (options?.strictScriptConversion === true) {
    logStub(logger, format, 'Strict script conversion option received; converter implementation is pending.');
  }

  logStub(logger, format, message);
  return createStubCollection(format, message);
}

