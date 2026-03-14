/**
 * plugin-importer-ui / host-bundle.ts
 *
 * Main-process module for @apiquest/plugin-importer-ui.
 * Runs inside a vm.createContext sandbox in the Electron main process.
 *
 * Available sandbox globals (injected by the host):
 *   handlers — register action handlers called via workspace:importCollection
 *   file     — read text/base64 from user-granted file paths
 *   fetch    — HTTP/HTTPS fetch; 5 MB cap
 *   console  — debug / log / info / warn / error / trace
 *
 * All imports are inlined by Rollup — no require() calls survive into the bundle.
 */

import type { PluginSandboxGlobals } from '@apiquest/plugin-ui-types';

const {
  handlers,
  console: hostConsole,
} = globalThis as unknown as PluginSandboxGlobals;

// ---------------------------------------------------------------------------
// Types (inlined — no external imports survive bundling)
// ---------------------------------------------------------------------------

type ApiQuestCollection = {
  $schema: string;
  info: {
    id: string;
    name: string;
    version: string;
    description: string;
  };
  protocol: string;
  variables: ApiQuestVariable[];
  items: ApiQuestItem[];
  warnings?: string[];
};

type ApiQuestVariable = {
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
};

type ApiQuestItem = {
  id: string;
  name: string;
  type: 'request' | 'folder';
  // request fields
  protocol?: string;
  data?: Record<string, unknown>;
  preRequestScript?: string;
  postRequestScript?: string;
  // folder fields
  items?: ApiQuestItem[];
};

// ---------------------------------------------------------------------------
// Handler: convert
//
// Called by workspace:importCollection (main process) via dispatchPluginHostInvoke.
// Also callable from renderer via uiContext.host.invoke('convert', ...) in tests.
//
// Payload: { data: string, format: string, sourcePath?: string, options?: any }
// Returns: ApiQuestCollection
// ---------------------------------------------------------------------------

handlers.on('convert', async (payload: unknown): Promise<ApiQuestCollection> => {
  const { data, format } = payload as {
    data: string;
    format: string;
    sourcePath?: string;
    options?: Record<string, unknown>;
  };

  if (!data || typeof data !== 'string') {
    throw new Error(`[plugin-importer-ui] convert: data must be a non-empty string`);
  }

  if (format === 'postman-v2.1') {
    return convertPostmanV21(data);
  }

  // Stub for other formats — returns a placeholder with warnings
  hostConsole.warn(`[plugin-importer-ui] Format '${format}' is not yet implemented. Returning empty collection.`);
  return {
    $schema: 'https://apiquest.dev/schemas/collection-v1.0.json',
    info: {
      id: generateId(),
      name: `Imported (${format})`,
      version: '1.0.0',
      description: `Imported from ${format} — converter not yet implemented`
    },
    protocol: 'http',
    variables: [],
    items: [],
    warnings: [`Converter for format '${format}' is not yet implemented.`]
  };
});

hostConsole.log('host-bundle initialized');

// ---------------------------------------------------------------------------
// Postman v2.1 converter
// ---------------------------------------------------------------------------

function convertPostmanV21(raw: string): ApiQuestCollection {
  let postman: PostmanCollection;
  try {
    postman = JSON.parse(raw) as PostmanCollection;
  } catch {
    throw new Error('[plugin-importer-ui] Failed to parse Postman JSON');
  }

  if (!postman.info || !postman.item) {
    throw new Error('[plugin-importer-ui] Not a valid Postman collection (missing info or item)');
  }

  const warnings: string[] = [];

  const variables: ApiQuestVariable[] = (postman.variable ?? []).map((v) => ({
    key: v.key ?? '',
    value: stringifyVariableValue(v.value),
    enabled: !v.disabled,
    description: v.description
  }));

  const items = convertPostmanItems(postman.item ?? [], warnings);

  const collection: ApiQuestCollection = {
    $schema: 'https://apiquest.dev/schemas/collection-v1.0.json',
    info: {
      id: generateId(),
      name: postman.info.name ?? 'Imported Collection',
      version: '1.0.0',
      description: postman.info.description ?? ''
    },
    protocol: 'http',
    variables,
    items,
  };

  if (warnings.length > 0) {
    collection.warnings = warnings;
  }

  hostConsole.info(`[plugin-importer-ui] Converted Postman v2.1 collection '${collection.info.name}': ${items.length} top-level items, ${variables.length} variables`);

  return collection;
}

// ---------------------------------------------------------------------------
// Postman types (minimal shape needed for conversion)
// ---------------------------------------------------------------------------

type PostmanCollection = {
  info: { name?: string; description?: string; _postman_id?: string };
  item: PostmanItem[];
  variable?: PostmanVariable[];
};

type PostmanItem = {
  id?: string;
  name?: string;
  item?: PostmanItem[];  // folder has nested items
  request?: PostmanRequest;
  event?: PostmanEvent[];
};

type PostmanRequest = {
  method?: string;
  header?: Array<{ key: string; value: string; disabled?: boolean; description?: string }>;
  body?: {
    mode?: string;
    raw?: string;
    urlencoded?: Array<{ key: string; value: string; disabled?: boolean; description?: string }>;
    formdata?: Array<{ key: string; value: string; type?: string; disabled?: boolean; description?: string }>;
  };
  url?: string | {
    raw?: string;
    protocol?: string;
    host?: string | string[];
    path?: string | string[];
    query?: Array<{ key: string; value: string; disabled?: boolean; description?: string }>;
    variable?: Array<{ key: string; value: string }>;
  };
  auth?: {
    type: string;
    bearer?: Array<{ key: string; value: string }>;
    basic?: Array<{ key: string; value: string }>;
    apikey?: Array<{ key: string; value: string; in?: string }>;
  };
};

type PostmanEvent = {
  listen: 'prerequest' | 'test';
  script?: { exec?: string | string[] };
};

type PostmanVariable = {
  key?: string;
  value?: unknown;
  description?: string;
  disabled?: boolean;
};

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function convertPostmanItems(items: PostmanItem[], warnings: string[]): ApiQuestItem[] {
  return items.map((item) => {
    const id = item.id ?? generateId();
    const name = item.name ?? 'Unnamed';

    if (Array.isArray(item.item)) {
      // Folder
      return {
        id,
        name,
        type: 'folder' as const,
        items: convertPostmanItems(item.item, warnings)
      };
    }

    // Request
    const req = item.request;
    const method = (req?.method ?? 'GET').toUpperCase();
    const rawUrl = extractRawUrl(req?.url);

    // Headers
    const headers = (req?.header ?? []).map((h) => ({
      key: h.key,
      value: h.value,
      enabled: !h.disabled,
      description: h.description
    }));

    // Query params — from URL object if available
    const params = extractQueryParams(req?.url);

    // Body
    const bodyMode = req?.body?.mode ?? 'none';
    let bodyData: Record<string, unknown> = {};

    if (bodyMode === 'raw') {
      bodyData = { mode: 'raw', raw: req?.body?.raw ?? '' };
    } else if (bodyMode === 'urlencoded') {
      bodyData = {
        mode: 'urlencoded',
        urlencoded: (req?.body?.urlencoded ?? []).map((f) => ({
          key: f.key,
          value: f.value,
          enabled: !f.disabled,
          description: f.description
        }))
      };
    } else if (bodyMode === 'formdata') {
      bodyData = {
        mode: 'formdata',
        formdata: (req?.body?.formdata ?? []).map((f) => ({
          key: f.key,
          value: f.value,
          type: f.type ?? 'text',
          enabled: !f.disabled,
          description: f.description
        }))
      };
    }

    // Auth (best-effort)
    const auth = convertAuth(req?.auth, warnings);

    // Scripts
    const events = item.event ?? [];
    const preReq = events.find((e) => e.listen === 'prerequest');
    const postReq = events.find((e) => e.listen === 'test');

    const preRequestScript = preReq ? scriptExecToString(preReq.script?.exec) : undefined;
    const postRequestScript = postReq ? migrateTestScript(scriptExecToString(postReq.script?.exec), warnings, name) : undefined;

    const converted: ApiQuestItem = {
      id,
      name,
      type: 'request',
      protocol: 'http',
      data: {
        method,
        url: rawUrl,
        headers,
        params,
        body: bodyMode !== 'none' ? bodyData : undefined,
        auth: auth ?? undefined
      }
    };

    if (preRequestScript) converted.preRequestScript = preRequestScript;
    if (postRequestScript) converted.postRequestScript = postRequestScript;

    return converted;
  });
}

function extractRawUrl(url: PostmanRequest['url']): string {
  if (!url) return '';
  if (typeof url === 'string') return url;
  return url.raw ?? '';
}

function extractQueryParams(url: PostmanRequest['url']): Array<{ key: string; value: string; enabled: boolean; description?: string }> {
  if (!url || typeof url === 'string') return [];
  return (url.query ?? []).map((q) => ({
    key: q.key,
    value: q.value,
    enabled: !q.disabled,
    description: q.description
  }));
}

function convertAuth(auth: PostmanRequest['auth'], warnings: string[]): Record<string, unknown> | null {
  if (!auth || auth.type === 'noauth') return null;

  const kvList = (list?: Array<{ key: string; value: string }>) =>
    Object.fromEntries((list ?? []).map((kv) => [kv.key, kv.value]));

  if (auth.type === 'bearer') {
    const kv = kvList(auth.bearer);
    return { type: 'bearer', token: kv['token'] ?? '' };
  }

  if (auth.type === 'basic') {
    const kv = kvList(auth.basic);
    return { type: 'basic', username: kv['username'] ?? '', password: kv['password'] ?? '' };
  }

  if (auth.type === 'apikey') {
    const kv = kvList(auth.apikey);
    return {
      type: 'apikey',
      key: kv['key'] ?? '',
      value: kv['value'] ?? '',
      addTo: kv['in'] === 'query' ? 'query' : 'header'
    };
  }

  warnings.push(`Auth type '${auth.type}' is not directly supported. Auth was not migrated for this request.`);
  return null;
}

/**
 * Deterministic script migration: transform common pm.* patterns to quest.* equivalents.
 * Unsupported patterns are left in place and a warning is added.
 */
function migrateTestScript(script: string | undefined, warnings: string[], requestName: string): string | undefined {
  if (!script) return undefined;

  let result = script;
  let hadUnsupported = false;

  // pm.test(...) -> quest.test(...)
  result = result.replace(/\bpm\.test\s*\(/g, 'quest.test(');

  // pm.expect(...) -> quest.expect(...)
  result = result.replace(/\bpm\.expect\s*\(/g, 'quest.expect(');

  // pm.response.to.have.status -> quest.response.status
  result = result.replace(/\bpm\.response\.to\.have\.status\s*\((\d+)\)/g, 'quest.response.status === $1');

  // pm.response.json() -> quest.response.json()
  result = result.replace(/\bpm\.response\.json\s*\(\)/g, 'quest.response.json()');

  // pm.response.text() -> quest.response.text()
  result = result.replace(/\bpm\.response\.text\s*\(\)/g, 'quest.response.text()');

  // pm.environment/collectionVariables/globals — best-effort
  result = result.replace(/\bpm\.environment\.get\s*\(([^)]+)\)/g, 'quest.variables.get($1)');
  result = result.replace(/\bpm\.environment\.set\s*\(([^)]+)\)/g, 'quest.variables.set($1)');
  result = result.replace(/\bpm\.collectionVariables\.get\s*\(([^)]+)\)/g, 'quest.variables.get($1)');
  result = result.replace(/\bpm\.collectionVariables\.set\s*\(([^)]+)\)/g, 'quest.variables.set($1)');
  result = result.replace(/\bpm\.globals\.get\s*\(([^)]+)\)/g, 'quest.variables.get($1)');
  result = result.replace(/\bpm\.globals\.set\s*\(([^)]+)\)/g, 'quest.variables.set($1)');

  // Detect remaining pm.* references (not migrated)
  if (/\bpm\./.test(result)) {
    hadUnsupported = true;
    warnings.push(`Request '${requestName}': script contains pm.* patterns that were not automatically migrated. Review the post-request script.`);
  }

  return result;
}

function scriptExecToString(exec: string | string[] | undefined): string | undefined {
  if (!exec) return undefined;
  if (Array.isArray(exec)) return exec.join('\n');
  return exec;
}

function stringifyVariableValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

// Minimal UUID-like ID generator (no crypto module in sandbox)
function generateId(): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 9);
  return `${stamp}-${rand}`;
}
