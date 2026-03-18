import type { PluginSandboxConsole } from '@apiquest/plugin-ui-types';

import { createStubCollection, logStub } from './stub';
import type { ImportCollectionResult, ImportConvertOptions } from './types';

type OpenApiVersion = '3.0' | '3.1';

function detectOpenApiVersion(raw: string): OpenApiVersion | null {
  // Try JSON parse first; fall back to regex for YAML
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      const rec = parsed as Record<string, unknown>;
      const v = typeof rec['openapi'] === 'string' ? rec['openapi'] : null;
      if (v !== null) {
        if (v.startsWith('3.1')) return '3.1';
        if (v.startsWith('3.0')) return '3.0';
      }
    }
    return null;
  } catch {
    // YAML — use regex
    const match = /^openapi:\s*['"]?(\d+\.\d+)/m.exec(raw);
    if (match !== null) {
      const v = match[1];
      if (v !== undefined) {
        if (v.startsWith('3.1')) return '3.1';
        if (v.startsWith('3.0')) return '3.0';
      }
    }
    return null;
  }
}

export function convertOpenApi(
  raw: string,
  logger: PluginSandboxConsole,
  options?: ImportConvertOptions
): ImportCollectionResult {
  const version = detectOpenApiVersion(raw);

  if (version === null) {
    throw new Error(
      '[plugin-importer-ui] openapi: could not detect OpenAPI version from file. ' +
      'Supported versions: 3.0.x and 3.1.x. Swagger 2.0 is not supported.'
    );
  }

  const message = `converter stub only; full OpenAPI ${version} mapping is pending`;

  if (options?.strictScriptConversion === true) {
    logStub(logger, 'openapi', 'Strict script conversion option received; converter implementation is pending.');
  }

  logStub(logger, 'openapi', message);
  return createStubCollection(`openapi-${version}`, message);
}
