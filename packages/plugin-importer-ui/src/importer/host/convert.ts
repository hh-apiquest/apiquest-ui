import type { PluginSandboxConsole } from '@apiquest/plugin-ui-types';

import { convertPostmanV21 } from './postman';
import { convertInsomniaJson } from './insomnia';
import { convertOpenApi } from './openapi';
import type { ConvertPayload, ImportCollectionResult, ImportConvertOptions } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeConvertPayload(payload: unknown): ConvertPayload {
  if (!isRecord(payload)) {
    throw new Error('[plugin-importer-ui] convert: payload must be an object');
  }

  const data = payload.data;
  const format = payload.format;
  const options = payload.options;

  if (typeof data !== 'string' || data.trim() === '') {
    throw new Error('[plugin-importer-ui] convert: data must be a non-empty string');
  }

  if (typeof format !== 'string' || format.trim() === '') {
    throw new Error('[plugin-importer-ui] convert: format must be a non-empty string');
  }

  if (options !== undefined && !isRecord(options)) {
    throw new Error('[plugin-importer-ui] convert: options must be an object when provided');
  }

  return { data, format, options: options as ImportConvertOptions | undefined };
}

export function convertImportByFormat(
  data: string,
  format: string,
  logger: PluginSandboxConsole,
  options?: ImportConvertOptions
): ImportCollectionResult {
  if (format === 'postman-v2.1') {
    return convertPostmanV21(data, logger, options);
  }

  if (format === 'insomnia-json') {
    return convertInsomniaJson(data, logger, options);
  }

  if (format === 'openapi-3.0' || format === 'openapi-3.1') {
    return convertOpenApi(data, format, logger, options);
  }

  throw new Error(`[plugin-importer-ui] Unsupported import format: ${format}`);
}

