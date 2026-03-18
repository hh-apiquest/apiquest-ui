/**
 * Insomnia export converter (v3 and v4 formats, JSON and YAML).
 *
 * Converts a flat resource list from an Insomnia export into an ApiQuest collection.
 * Builds the folder / request tree from parentId references.
 * Accepts both JSON (.json) and YAML (.yaml / .yml) Insomnia exports.
 * Validates __export_format and throws with a clear message on unsupported versions.
 */

import * as yaml from 'js-yaml';

import type {
  Auth,
  CollectionItem,
  Folder,
  Request,
  Variable,
  VariablePrimitive,
  VariableValue,
} from '@apiquest/types';
import type { PluginSandboxConsole } from '@apiquest/plugin-ui-types';

import type {
  ConvertedHttpBody,
  ImportCollectionResult,
  ImportConvertOptions,
  VariableRecord,
} from './types';

// ---------------------------------------------------------------------------
// Insomnia export raw types
// ---------------------------------------------------------------------------

type InsomniaExport = {
  __export_format?: number;
  resources?: InsomniaResource[];
};

type InsomniaResource = {
  _id: string;
  _type: string;
  parentId?: string;
  name?: string;
  // request fields
  method?: string;
  url?: string;
  headers?: Array<{ name: string; value: string; disabled?: boolean }>;
  parameters?: Array<{ name: string; value: string; disabled?: boolean }>;
  body?: InsomniaBody;
  authentication?: InsomniaAuth;
  preRequestScript?: string;
  afterResponseScript?: string;
  // request_group fields
  // environment fields
  data?: Record<string, unknown>;
  isPrivate?: boolean;
};

type InsomniaBody = {
  mimeType?: string;
  text?: string;
  params?: Array<{ name: string; value: string; disabled?: boolean }>;
};

type InsomniaAuth = {
  type?: string;
  disabled?: boolean;
  // bearer
  token?: string;
  // basic
  username?: string;
  password?: string;
  // api key
  key?: string;
  value?: string;
  addTo?: string;
};

// ---------------------------------------------------------------------------
// Options consumed by this converter (passed from host-bundle or host.ts)
// ---------------------------------------------------------------------------

export type InsomniaConvertOptions = ImportConvertOptions & {
  importScripts?: boolean;
  importBaseEnvironment?: boolean;
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 9);
  return `${stamp}-${rand}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Parse raw file content as either JSON or YAML.
 * JSON is attempted first; if it fails the content is treated as YAML.
 * Returns null when neither parser succeeds.
 */
function parseInsomniaInput(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // not JSON — try YAML
  }
  try {
    return yaml.load(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth mapping
// ---------------------------------------------------------------------------

function convertAuth(auth: InsomniaAuth | undefined): Auth | undefined {
  if (auth === undefined || auth.disabled === true || auth.type === 'none' || auth.type === undefined) {
    return undefined;
  }

  if (auth.type === 'bearer') {
    return { type: 'bearer', data: { token: auth.token ?? '' } };
  }

  if (auth.type === 'basic') {
    return {
      type: 'basic',
      data: { username: auth.username ?? '', password: auth.password ?? '' },
    };
  }

  if (auth.type === 'apikey') {
    const placement: 'header' | 'query' = auth.addTo === 'queryParams' ? 'query' : 'header';
    return {
      type: 'apikey',
      data: { key: auth.key ?? '', value: auth.value ?? '', in: placement },
    };
  }

  // Unknown auth type — not mapped, skip silently
  return undefined;
}

// ---------------------------------------------------------------------------
// Body mapping
// ---------------------------------------------------------------------------

function convertBody(body: InsomniaBody | undefined): ConvertedHttpBody | undefined {
  if (body?.mimeType === undefined) {
    return undefined;
  }

  if (
    body.mimeType === 'application/json' ||
    body.mimeType === 'text/plain' ||
    body.mimeType === 'text/html' ||
    body.mimeType === 'application/xml' ||
    body.mimeType === 'text/xml'
  ) {
    return {
      mode: 'raw',
      raw: body.text ?? '',
      language:
        body.mimeType === 'application/json'
          ? 'json'
          : body.mimeType.includes('xml')
            ? 'xml'
            : 'text',
    };
  }

  if (body.mimeType === 'application/x-www-form-urlencoded') {
    const kv = (body.params ?? []).map((p) => ({
      key: p.name,
      value: p.value,
      type: 'text' as const,
    }));
    return { mode: 'urlencoded', kv };
  }

  if (body.mimeType === 'multipart/form-data') {
    const kv = (body.params ?? []).map((p) => ({
      key: p.name,
      value: p.value,
      type: 'text' as const,
    }));
    return { mode: 'formdata', kv };
  }

  // No body or unsupported MIME type
  return body.text !== undefined && body.text.trim() !== ''
    ? { mode: 'raw', raw: body.text, language: 'text' }
    : undefined;
}

// ---------------------------------------------------------------------------
// Request mapping
// ---------------------------------------------------------------------------

function convertRequest(
  resource: InsomniaResource,
  options: InsomniaConvertOptions,
  warnings: string[]
): Request {
  const requestId = generateId();
  const url = resource.url ?? '';

  const headers: Record<string, string> = {};
  for (const h of resource.headers ?? []) {
    if (h.disabled !== true) {
      headers[h.name] = h.value;
    }
  }

  // Content-Type from body MIME type if not already set explicitly
  if (resource.body?.mimeType !== undefined && headers['Content-Type'] === undefined) {
    headers['Content-Type'] = resource.body.mimeType;
  }

  const params = (resource.parameters ?? [])
    .filter((p) => p.disabled !== true)
    .map((p) => ({ key: p.name, value: p.value }));

  const auth = convertAuth(resource.authentication);
  const body = convertBody(resource.body);

  let preRequestScript: string | undefined;
  let testScript: string | undefined;

  if (options.importScripts !== false && options.convertScripts !== false) {
    if (
      resource.preRequestScript !== undefined &&
      resource.preRequestScript.trim() !== ''
    ) {
      preRequestScript = resource.preRequestScript;
    }

    if (
      resource.afterResponseScript !== undefined &&
      resource.afterResponseScript.trim() !== ''
    ) {
      testScript = resource.afterResponseScript;
    }
  }

  const requestItem: Request = {
    id: requestId,
    type: 'request',
    name: resource.name ?? 'Unnamed Request',
    data: {
      method: (resource.method ?? 'GET').toUpperCase(),
      url,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      params: params.length > 0 ? params : undefined,
      body,
    },
    ...(auth !== undefined ? { auth } : {}),
    ...(preRequestScript !== undefined ? { preRequestScript } : {}),
    ...(testScript !== undefined ? { testScript } : {}),
  };

  if (Object.keys(headers).length === 0) {
    delete requestItem.data.headers;
  }

  if (warnings.length === 0) {
    // Suppress unused variable warning
  }

  return requestItem;
}

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

function buildItemTree(
  parentId: string,
  resourceMap: Map<string, InsomniaResource>,
  childMap: Map<string, string[]>,
  options: InsomniaConvertOptions,
  warnings: string[]
): CollectionItem[] {
  const childIds = childMap.get(parentId) ?? [];
  const items: CollectionItem[] = [];

  for (const childId of childIds) {
    const resource = resourceMap.get(childId);
    if (resource === undefined) {
      continue;
    }

    if (resource._type === 'request') {
      items.push(convertRequest(resource, options, warnings));
    } else if (resource._type === 'request_group') {
      const folderChildren = buildItemTree(childId, resourceMap, childMap, options, warnings);
      const folder: Folder = {
        id: generateId(),
        type: 'folder',
        name: resource.name ?? 'Unnamed Folder',
        items: folderChildren,
      };
      items.push(folder);
    }
    // Other types (environment, cookie_jar, etc.) are skipped
  }

  return items;
}

// ---------------------------------------------------------------------------
// Variable mapping (from base environment)
// ---------------------------------------------------------------------------

function convertEnvironmentVariables(
  envResource: InsomniaResource | undefined
): VariableRecord {
  if (envResource === undefined || !isRecord(envResource.data)) {
    return {};
  }

  const record: VariableRecord = {};
  for (const [key, rawValue] of Object.entries(envResource.data)) {
    if (typeof key !== 'string' || key.trim() === '') {
      continue;
    }

    const primitive: VariablePrimitive =
      typeof rawValue === 'string'
        ? rawValue
        : rawValue === null || rawValue === undefined
          ? ''
          : String(rawValue);

    const variable: Variable = {
      value: primitive,
      enabled: true,
      type: 'string',
    };

    record[key] = variable as VariableValue;
  }

  return record;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function convertInsomnia(
  raw: string,
  logger: PluginSandboxConsole,
  options?: InsomniaConvertOptions
): ImportCollectionResult {
  const opts: InsomniaConvertOptions = {
    importScripts: true,
    importBaseEnvironment: true,
    ...options,
  };

  const parsed = parseInsomniaInput(raw);
  if (!isRecord(parsed)) {
    throw new Error('[plugin-importer-ui] insomnia: failed to parse file — expected JSON or YAML Insomnia export');
  }

  const exportData = parsed as InsomniaExport;
  const exportFormat = typeof exportData.__export_format === 'number' ? exportData.__export_format : 0;
  const resources = Array.isArray(exportData.resources) ? exportData.resources : [];

  if (exportFormat !== 3 && exportFormat !== 4) {
    throw new Error(
      `[plugin-importer-ui] insomnia: unsupported __export_format=${exportFormat}. ` +
      `Supported versions: 3 and 4.`
    );
  }

  if (resources.length === 0) {
    throw new Error('[plugin-importer-ui] insomnia: no resources found in export');
  }

  // Index resources by _id and build parent -> children map
  const resourceMap = new Map<string, InsomniaResource>();
  const childMap = new Map<string, string[]>();

  for (const res of resources) {
    if (typeof res._id !== 'string') {
      continue;
    }
    resourceMap.set(res._id, res);
  }

  for (const res of resources) {
    if (typeof res._id !== 'string') {
      continue;
    }
    if (res.parentId !== undefined && res.parentId !== null) {
      if (!childMap.has(res.parentId)) {
        childMap.set(res.parentId, []);
      }
      childMap.get(res.parentId)!.push(res._id);
    }
  }

  // Find the workspace root (top-level)
  const workspace = resources.find((r) => r._type === 'workspace');
  if (workspace === undefined) {
    throw new Error('[plugin-importer-ui] insomnia: no workspace resource found');
  }

  const warnings: string[] = [];

  // Collect items from workspace root
  const items = buildItemTree(workspace._id, resourceMap, childMap, opts, warnings);

  // Extract base environment variables if requested
  const baseEnv = opts.importBaseEnvironment !== false
    ? resources.find(
        (r) =>
          r._type === 'environment' &&
          (r.parentId === workspace._id) &&
          r.isPrivate !== true
      )
    : undefined;

  const variables = convertEnvironmentVariables(baseEnv);

  const requestCount = items.reduce<number>(function countRequests(count, item): number {
    if (item.type === 'request') return count + 1;
    if (item.type === 'folder') return count + item.items.reduce(countRequests, 0);
    return count;
  }, 0);

  logger.log(
    `[plugin-importer-ui] insomnia: imported ${requestCount} request(s) ` +
    `from ${resources.length} resource(s) (export format v${exportFormat})`
  );

  const result: ImportCollectionResult = {
    $schema: 'https://apiquest.dev/schemas/collection-v1.0.json',
    info: {
      id: generateId(),
      name: workspace.name ?? 'Insomnia Import',
      version: '1.0.0',
      description: `Imported from Insomnia export (format v${exportFormat})`,
    },
    protocol: 'http',
    variables,
    items,
    warnings: warnings.length > 0 ? warnings : undefined,
  };

  return result;
}

// ---------------------------------------------------------------------------
// Resource count helper (used by host-bundle for the pre-convert dialog)
// ---------------------------------------------------------------------------

export type InsomniaResourceSummary = {
  exportFormat: number;
  workspaceName: string;
  requestCount: number;
  folderCount: number;
  hasBaseEnvironment: boolean;
  baseEnvironmentVariableCount: number;
  hasScripts: boolean;
};

export function getInsomniaResourceSummary(raw: string): InsomniaResourceSummary | null {
  const parsed = parseInsomniaInput(raw);
  if (!isRecord(parsed)) {
    return null;
  }

  const exportData = parsed as InsomniaExport;
  const resources = Array.isArray(exportData.resources) ? exportData.resources : [];
  const exportFormat = typeof exportData.__export_format === 'number' ? exportData.__export_format : 0;

  const workspace = resources.find((r) => r._type === 'workspace');
  const baseEnv = resources.find(
    (r) =>
      r._type === 'environment' &&
      workspace !== undefined &&
      r.parentId === workspace._id &&
      r.isPrivate !== true
  );

  const requestCount = resources.filter((r) => r._type === 'request').length;
  const folderCount = resources.filter((r) => r._type === 'request_group').length;

  const hasScripts = resources.some(
    (r) =>
      r._type === 'request' &&
      (
        (typeof r.preRequestScript === 'string' && r.preRequestScript.trim() !== '') ||
        (typeof r.afterResponseScript === 'string' && r.afterResponseScript.trim() !== '')
      )
  );

  const baseEnvVarCount =
    baseEnv !== undefined && isRecord(baseEnv.data)
      ? Object.keys(baseEnv.data).length
      : 0;

  return {
    exportFormat,
    workspaceName: workspace?.name ?? 'Unknown Workspace',
    requestCount,
    folderCount,
    hasBaseEnvironment: baseEnv !== undefined,
    baseEnvironmentVariableCount: baseEnvVarCount,
    hasScripts,
  };
}
