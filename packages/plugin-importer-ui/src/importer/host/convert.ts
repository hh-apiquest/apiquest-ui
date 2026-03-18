import type { PluginSandboxConsole } from '@apiquest/plugin-ui-types';

import { convertPostman } from './postman';
import { convertInsomnia } from './insomnia';
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
  if (format === 'postman') {
    return convertPostman(data, logger, options);
  }

  if (format === 'insomnia') {
    return convertInsomnia(data, logger, options);
  }

  if (format === 'openapi') {
    return convertOpenApi(data, logger, options);
  }

  throw new Error(`[plugin-importer-ui] Unsupported import format: ${format}`);
}
