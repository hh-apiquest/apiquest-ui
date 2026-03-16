import type { PluginSandboxConsole } from '@apiquest/plugin-ui-types';

import { createStubCollection, logStub } from './stub';
import type { ImportCollectionResult, ImportConvertOptions } from './types';

export function convertInsomniaJson(
  _raw: string,
  logger: PluginSandboxConsole,
  options?: ImportConvertOptions
): ImportCollectionResult {
  const format = 'insomnia-json';
  const message = "converter stub only; full Insomnia mapping is pending";

  if (options?.scriptConversionMode === 'ai') {
    logStub(logger, format, 'AI script conversion option received; converter implementation is pending.');
  }

  logStub(logger, format, message);
  return createStubCollection(format, message);
}

