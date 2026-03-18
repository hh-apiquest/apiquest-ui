import type {
  Auth,
  Collection,
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
  ConvertedHttpData,
  ConvertedRequestItem,
  ImportConvertOptions,
  ImportCollectionResult,
  PostmanAuth,
  PostmanCollection,
  PostmanEvent,
  PostmanItem,
  PostmanRequest,
  VariableRecord,
} from './types';

function generateId(): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 9);
  return `${stamp}-${rand}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringifyVariableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

function toVariablePrimitive(value: string): VariablePrimitive {
  return value;
}

function toVariableRecord(postmanVariables: PostmanCollection['variable']): VariableRecord {
  const variableRecord: VariableRecord = {};

  for (const variable of postmanVariables ?? []) {
    const key = variable.key ?? '';
    if (key.trim() === '') {
      continue;
    }

    const primitive = toVariablePrimitive(stringifyVariableValue(variable.value));
    const variableValue: Variable = {
      value: primitive,
      enabled: variable.disabled !== true,
      type: 'string',
      description: variable.description,
    };

    variableRecord[key] = variableValue as VariableValue;
  }

  return variableRecord;
}

function scriptExecToString(exec: string | string[] | undefined): string | undefined {
  if (exec === undefined) {
    return undefined;
  }

  return Array.isArray(exec) ? exec.join('\n') : exec;
}

function normalizeDescription(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (isRecord(value) && typeof value.content === 'string') {
    return value.content;
  }

  return undefined;
}

function convertScript(script: string | undefined, warnings: string[], contextName: string): string | undefined {
  if (script === undefined || script === '') {
    return undefined;
  }

  let result = script;

  result = result.replace(/\bpm\.test\s*\(/g, 'quest.test(');
  result = result.replace(/\bpm\.expect\s*\(/g, 'expect(');

  // Response assertion helpers
  result = result.replace(/\bpm\.response\.to\.have\.status\s*\((\d+)\)/g, 'quest.response.to.have.status($1)');
  result = result.replace(/\bpm\.response\.to\.be\.ok\b/g, 'quest.response.to.be.ok');
  result = result.replace(/\bpm\.response\.to\.be\.success\b/g, 'quest.response.to.be.success');
  result = result.replace(/\bpm\.response\.to\.be\.clientError\b/g, 'quest.response.to.be.clientError');
  result = result.replace(/\bpm\.response\.to\.be\.serverError\b/g, 'quest.response.to.be.serverError');
  result = result.replace(/\bpm\.response\.to\.have\.header\s*\(([^)]+)\)/g, 'quest.response.to.have.header($1)');
  // jsonBody 2-arg form: pm.response.to.have.jsonBody('key', value) — quest only supports field existence;
  // expand to an equality assertion using quest.response.json()
  result = result.replace(
    /\bpm\.response\.to\.have\.jsonBody\s*\('([^']+)',\s*([^)]+)\)/g,
    "expect(quest.response.json()['$1']).to.equal($2)"
  );
  result = result.replace(
    /\bpm\.response\.to\.have\.jsonBody\s*\("([^"]+)",\s*([^)]+)\)/g,
    'expect(quest.response.json()["$1"]).to.equal($2)'
  );
  // jsonBody 1-arg form: field-existence check maps 1:1
  result = result.replace(/\bpm\.response\.to\.have\.jsonBody\s*\(([^)]+)\)/g, 'quest.response.to.have.jsonBody($1)');

  // Response body and headers
  result = result.replace(/\bpm\.response\.json\s*\(\)/g, 'quest.response.json()');
  result = result.replace(/\bpm\.response\.text\s*\(\)/g, 'quest.response.text()');
  result = result.replace(/\bpm\.response\.body\b/g, 'quest.response.body');
  result = result.replace(/\bpm\.response\.headers\.get\s*\(([^)]+)\)/g, 'quest.response.headers.get($1)');
  result = result.replace(/\bpm\.response\.headers\.has\s*\(([^)]+)\)/g, 'quest.response.headers.has($1)');
  result = result.replace(/\bpm\.response\.headers\.toObject\s*\(\)/g, 'quest.response.headers.toObject()');

  // Response status and metrics
  result = result.replace(/\bpm\.response\.code\b/g, 'quest.response.status');
  result = result.replace(/\bpm\.response\.status\b/g, 'quest.response.status');
  result = result.replace(/\bpm\.response\.responseTime\b/g, 'quest.response.duration');

  result = result.replace(/\bpm\.environment\.get\s*\(([^)]+)\)/g, 'quest.environment.variables.get($1)');
  result = result.replace(/\bpm\.environment\.set\s*\(([^)]+)\)/g, 'quest.environment.variables.set($1)');
  result = result.replace(/\bpm\.environment\.has\s*\(([^)]+)\)/g, 'quest.environment.variables.has($1)');
  result = result.replace(/\bpm\.environment\.unset\s*\(([^)]+)\)/g, 'quest.environment.variables.remove($1)');
  result = result.replace(/\bpm\.collectionVariables\.get\s*\(([^)]+)\)/g, 'quest.collection.variables.get($1)');
  result = result.replace(/\bpm\.collectionVariables\.set\s*\(([^)]+)\)/g, 'quest.collection.variables.set($1)');
  result = result.replace(/\bpm\.collectionVariables\.has\s*\(([^)]+)\)/g, 'quest.collection.variables.has($1)');
  result = result.replace(/\bpm\.collectionVariables\.unset\s*\(([^)]+)\)/g, 'quest.collection.variables.remove($1)');
  result = result.replace(/\bpm\.globals\.get\s*\(([^)]+)\)/g, 'quest.global.variables.get($1)');
  result = result.replace(/\bpm\.globals\.set\s*\(([^)]+)\)/g, 'quest.global.variables.set($1)');
  result = result.replace(/\bpm\.globals\.has\s*\(([^)]+)\)/g, 'quest.global.variables.has($1)');
  result = result.replace(/\bpm\.globals\.unset\s*\(([^)]+)\)/g, 'quest.global.variables.remove($1)');

  result = result.replace(/\bpm\.variables\.get\s*\(([^)]+)\)/g, 'quest.variables.get($1)');
  result = result.replace(/\bpm\.variables\.set\s*\(([^)]+)\)/g, 'quest.variables.set($1)');
  result = result.replace(/\bpm\.variables\.has\s*\(([^)]+)\)/g, 'quest.variables.has($1)');
  result = result.replace(/\bpm\.iterationData\.get\s*\(([^)]+)\)/g, 'quest.iteration.data.get($1)');
  result = result.replace(/\bpm\.iterationData\.has\s*\(([^)]+)\)/g, 'quest.iteration.data.has($1)');
  result = result.replace(/\bpm\.iterationData\.toObject\s*\(\)/g, 'quest.iteration.data.toObject()');

  result = result.replace(/\bpm\.info\.requestName\b/g, 'quest.request.info.name');
  result = result.replace(/\bpm\.info\.requestId\b/g, 'quest.request.info.id');
  result = result.replace(/\bpm\.info\.iteration\b/g, 'quest.iteration.current');
  result = result.replace(/\bpm\.info\.iterationCount\b/g, 'quest.iteration.count');

  result = result.replace(/\bpm\.sendRequest\s*\(/g, 'quest.sendRequest(');

  if (/\bpm\./.test(result)) {
    warnings.push(
      `Scope '${contextName}': script contains pm.* patterns that were not automatically migrated. Review this script manually.`
    );
  }

  return result;
}

function extractEventScripts(
  events: PostmanEvent[] | undefined,
  listen: 'prerequest' | 'test',
  warnings: string[],
  contextName: string
): string | undefined {
  const sourceEvents = (events ?? []).filter((event) => event.listen === listen && event.disabled !== true);

  if (sourceEvents.length === 0) {
    return undefined;
  }

  const scripts = sourceEvents
    .map((event) => scriptExecToString(event.script?.exec))
    .filter((script): script is string => typeof script === 'string')
    .map((script) => convertScript(script, warnings, contextName))
    .filter((script): script is string => typeof script === 'string');

  if (scripts.length === 0) {
    return undefined;
  }

  return scripts.join('\n\n');
}

function extractRawUrl(url: PostmanRequest['url']): string {
  if (url === undefined) {
    return '';
  }

  if (typeof url === 'string') {
    return url;
  }

  return url.raw ?? '';
}

function extractQueryParams(url: PostmanRequest['url']): Array<{ key: string; value: string; description?: string }> {
  if (url === undefined || typeof url === 'string') {
    return [];
  }

  return (url.query ?? [])
    .filter((query) => query.disabled !== true)
    .map((query) => ({
      key: query.key,
      value: query.value,
      description: query.description,
    }));
}

function convertAuth(auth: PostmanAuth | undefined, warnings: string[]): Auth | undefined {
  if (auth === undefined || auth.type === 'noauth') {
    return undefined;
  }

  const kvList = (list?: Array<{ key: string; value: string }>): Record<string, string> => {
    return Object.fromEntries((list ?? []).map((kv) => [kv.key, kv.value]));
  };

  if (auth.type === 'bearer') {
    const kv = kvList(auth.bearer);
    return {
      type: 'bearer',
      data: { token: kv.token ?? '' },
    };
  }

  if (auth.type === 'basic') {
    const kv = kvList(auth.basic);
    return {
      type: 'basic',
      data: { username: kv.username ?? '', password: kv.password ?? '' },
    };
  }

  if (auth.type === 'apikey') {
    const kv = kvList(auth.apikey);
    return {
      type: 'apikey',
      data: {
        key: kv.key ?? '',
        value: kv.value ?? '',
        in: kv.in === 'query' ? 'query' : 'header',
      },
    };
  }

  if (auth.type === 'oauth2') {
    const kv = kvList(auth.oauth2);

    const clientAuthenticationValue = kv.clientAuthentication ?? kv.client_authentication;
    const clientAuthentication = clientAuthenticationValue === 'body' ? 'body' : 'header';

    return {
      type: 'oauth2',
      data: {
        grantType: kv.grantType ?? kv.grant_type ?? 'client_credentials',
        accessTokenUrl: kv.accessTokenUrl ?? kv.access_token_url ?? '',
        clientId: kv.clientId ?? kv.client_id ?? '',
        clientSecret: kv.clientSecret ?? kv.client_secret ?? '',
        scope: kv.scope ?? '',
        audience: kv.audience ?? '',
        resource: kv.resource ?? '',
        clientAuthentication,
      },
    };
  }

  warnings.push(`Auth type '${auth.type}' is not directly supported. Auth was not migrated for this request.`);
  return undefined;
}

function mapPostmanRawLanguageToMime(language: string | undefined): string {
  const normalized = (language ?? '').trim().toLowerCase();

  if (normalized === 'json') {
    return 'application/json';
  }

  if (normalized === 'xml') {
    return 'application/xml';
  }

  if (normalized === 'html') {
    return 'text/html';
  }

  if (normalized === 'javascript' || normalized === 'js') {
    return 'application/javascript';
  }

  if (normalized === 'text' || normalized === 'plain') {
    return 'text/plain';
  }

  return 'text/plain';
}

function getHeaderValueCaseInsensitive(headers: Record<string, string>, headerName: string): string | undefined {
  const target = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return value;
    }
  }

  return undefined;
}

function convertBody(request: PostmanRequest, headers: Record<string, string>): ConvertedHttpBody | undefined {
  const bodyMode = request.body?.mode ?? 'none';

  if (bodyMode === 'none') {
    return undefined;
  }

  if (bodyMode === 'raw') {
    const rawLanguage = request.body?.options?.raw?.language;
    const contentTypeHeader = getHeaderValueCaseInsensitive(headers, 'content-type');
    const language =
      contentTypeHeader !== undefined && contentTypeHeader.trim() !== ''
        ? contentTypeHeader
        : mapPostmanRawLanguageToMime(rawLanguage);

    return {
      mode: 'raw',
      raw: request.body?.raw ?? '',
      language,
    };
  }

  if (bodyMode === 'urlencoded') {
    return {
      mode: 'urlencoded',
      kv: (request.body?.urlencoded ?? [])
        .filter((entry) => entry.disabled !== true)
        .map((entry) => ({
          key: entry.key,
          value: entry.value,
          description: entry.description,
        })),
    };
  }

  if (bodyMode === 'formdata') {
    return {
      mode: 'formdata',
      kv: (request.body?.formdata ?? [])
        .filter((entry) => entry.disabled !== true)
        .map((entry) => ({
          key: entry.key,
          value: entry.value,
          type: entry.type === 'binary' ? 'binary' : 'text',
          description: entry.description,
        })),
    };
  }

  return { mode: 'none' };
}

function convertRequestItem(item: PostmanItem, warnings: string[]): ConvertedRequestItem {
  const id = item.id ?? generateId();
  const name = item.name ?? 'Unnamed';
  const request = item.request ?? {};
  const method = (request.method ?? 'GET').toUpperCase();

  const headersRecord: Record<string, string> = {};
  for (const header of request.header ?? []) {
    if (header.disabled !== true && header.key.trim() !== '') {
      headersRecord[header.key] = header.value;
    }
  }

  const convertedData: ConvertedHttpData = {
    method,
    url: extractRawUrl(request.url),
    headers: headersRecord,
    params: extractQueryParams(request.url),
    body: convertBody(request, headersRecord),
  };

  const preRequestScript = extractEventScripts(item.event, 'prerequest', warnings, `request '${name}' pre-request`);
  const postRequestScript = extractEventScripts(item.event, 'test', warnings, `request '${name}' post-request`);

  const converted: ConvertedRequestItem = {
    id,
    name,
    type: 'request',
    data: convertedData,
    auth: convertAuth(item.auth ?? request.auth, warnings),
  };

  const description = normalizeDescription(item.request?.description);
  if (description !== undefined && description !== '') {
    converted.description = description;
  }

  if (preRequestScript !== undefined && preRequestScript.trim() !== '') {
    converted.preRequestScript = preRequestScript;
  }

  if (postRequestScript !== undefined && postRequestScript.trim() !== '') {
    converted.postRequestScript = postRequestScript;
  }

  return converted;
}

function convertPostmanItems(items: PostmanItem[], warnings: string[]): CollectionItem[] {
  return items.map((item: PostmanItem): CollectionItem => {
    const id = item.id ?? generateId();
    const name = item.name ?? 'Unnamed';

    if (Array.isArray(item.item)) {
      const folder: Folder = {
        type: 'folder',
        id,
        name,
        items: convertPostmanItems(item.item, warnings),
      };

      const description = normalizeDescription(item.description);
      if (description !== undefined && description !== '') {
        folder.description = description;
      }

      const auth = convertAuth(item.auth, warnings);
      if (auth !== undefined) {
        folder.auth = auth;
      }

      const folderPreScript = extractEventScripts(item.event, 'prerequest', warnings, `folder '${name}' pre-request`);
      const folderPostScript = extractEventScripts(item.event, 'test', warnings, `folder '${name}' post-request`);

      if (folderPreScript !== undefined && folderPreScript.trim() !== '') {
        folder.preRequestScript = folderPreScript;
      }

      if (folderPostScript !== undefined && folderPostScript.trim() !== '') {
        folder.postRequestScript = folderPostScript;
      }

      return folder;
    }

    return convertRequestItem(item, warnings) as Request;
  });
}

// ---------------------------------------------------------------------------
// Summary helper (used by host-bundle Tier 3 flow)
// ---------------------------------------------------------------------------

export interface PostmanCollectionSummary {
  name: string;
  requestCount: number;
  folderCount: number;
  hasScripts: boolean;
  variableCount: number;
}

function countPostmanItems(
  items: PostmanItem[]
): { requests: number; folders: number; hasScripts: boolean } {
  let requests = 0;
  let folders = 0;
  let hasScripts = false;

  for (const item of items) {
    if (Array.isArray(item.item)) {
      folders++;
      const nested = countPostmanItems(item.item);
      requests += nested.requests;
      folders += nested.folders;
      hasScripts = hasScripts || nested.hasScripts;
    } else {
      requests++;
    }

    if ((item.event ?? []).some((e) => e.disabled !== true && (e.script?.exec ?? '').length > 0)) {
      hasScripts = true;
    }
  }

  return { requests, folders, hasScripts };
}

/**
 * Parse a Postman v2.1 export without converting and return a human-readable
 * summary of its contents. Returns null if the payload is not a valid Postman
 * collection.
 */
export function getPostmanCollectionSummary(raw: string): PostmanCollectionSummary | null {
  let postman: PostmanCollection;
  try {
    postman = JSON.parse(raw) as PostmanCollection;
  } catch {
    return null;
  }

  if (!isRecord(postman.info) || !Array.isArray(postman.item)) {
    return null;
  }

  const name = typeof postman.info.name === 'string' && postman.info.name !== ''
    ? postman.info.name
    : 'Postman Collection';

  const { requests, folders, hasScripts: itemScripts } = countPostmanItems(postman.item);

  // Also check collection-level scripts
  const collectionHasScripts = itemScripts ||
    (postman.event ?? []).some((e) => e.disabled !== true && (e.script?.exec ?? '').length > 0);

  const variableCount = (postman.variable ?? []).filter(
    (v) => (v.key ?? '').trim() !== ''
  ).length;

  return {
    name,
    requestCount: requests,
    folderCount: folders,
    hasScripts: collectionHasScripts,
    variableCount,
  };
}

export function convertPostman(
  raw: string,
  logger: PluginSandboxConsole,
  options?: ImportConvertOptions
): ImportCollectionResult {
  let postman: PostmanCollection;

  try {
    postman = JSON.parse(raw) as PostmanCollection;
  } catch {
    throw new Error('[plugin-importer-ui] postman: failed to parse JSON');
  }

  if (!isRecord(postman.info) || !Array.isArray(postman.item)) {
    throw new Error('[plugin-importer-ui] postman: not a valid Postman collection (missing info or item)');
  }

  // Version guard: only Postman Collection Format v2.1 is supported
  const schema = typeof postman.info._postman_schema === 'string' ? postman.info._postman_schema : '';
  if (schema !== '' && !schema.includes('v2.1')) {
    throw new Error(
      `[plugin-importer-ui] postman: unsupported schema version "${schema}". ` +
      `Only Postman Collection Format v2.1 is supported.`
    );
  }

  const warnings: string[] = [];

  if (options?.convertScripts === false) {
    warnings.push('Script conversion disabled by import options. Scripts are imported without migration.');
  } else if (options?.scriptConversionMode === 'ai') {
    warnings.push('AI script conversion requested, but host AI conversion is not yet implemented; rule-based conversion was used.');
  }

  if (options?.strictScriptConversion === true) {
    warnings.push('Strict script conversion mode requested. Unsupported script constructs are reported in warnings.');
  }

  if ((options?.aiPrompt ?? '').trim() !== '') {
    warnings.push('Custom AI prompt provided. It will be used when AI script conversion is implemented in host conversion pipeline.');
  }

  const convertedCollection: ImportCollectionResult = {
    $schema: 'https://apiquest.dev/schemas/collection-v1.0.json',
    info: {
      id: generateId(),
      name: typeof postman.info.name === 'string' && postman.info.name !== '' ? postman.info.name : 'Imported Collection',
      version: '1.0.0',
      description:
        typeof postman.info.description === 'string' ? postman.info.description : '',
    },
    protocol: 'http',
    options: {
      // strictMode controls runner determinism: true = no conditional tests or try/catch (default).
      strictMode: options?.collectionStrictMode ?? true,
    },
    auth: convertAuth(postman.auth, warnings),
    variables: toVariableRecord(postman.variable),
    items: convertPostmanItems(postman.item, warnings),
  } as Collection;

  const collectionPreScript = extractEventScripts(
    postman.event,
    'prerequest',
    warnings,
    `collection '${convertedCollection.info.name}' pre-request`
  );
  const collectionPostScript = extractEventScripts(
    postman.event,
    'test',
    warnings,
    `collection '${convertedCollection.info.name}' post-request`
  );

  if (collectionPreScript !== undefined && collectionPreScript.trim() !== '') {
    convertedCollection.preRequestScript = collectionPreScript;
  }

  if (collectionPostScript !== undefined && collectionPostScript.trim() !== '') {
    convertedCollection.postRequestScript = collectionPostScript;
  }

  if (warnings.length > 0) {
    convertedCollection.warnings = warnings;
  }

  logger.info(
    `[plugin-importer-ui] postman: converted collection '${convertedCollection.info.name}': ` +
    `${convertedCollection.items.length} top-level items, ` +
    `${Object.keys(convertedCollection.variables ?? {}).length} variables`
  );

  return convertedCollection;
}

