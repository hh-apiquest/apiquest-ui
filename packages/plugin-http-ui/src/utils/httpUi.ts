import type {
  GeneratedHeaderEntry,
  GeneratedParamEntry,
  HeaderEntry,
  ParamEntry,
} from '@apiquest/plugin-ui-types';
import type { Request } from '@apiquest/types';
import type { HttpBodyData, HttpRequestData } from '@apiquest/plugin-http';

import type { HttpMethod, HttpRequestWithUiData, ParsedCookie } from '../types';
import { HTTP_METHODS } from '../types';

type HttpParam = NonNullable<HttpRequestData['params']>[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getStringValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function getBodyObject(body: HttpRequestData['body']): HttpBodyData | undefined {
  if (body === undefined || typeof body === 'string') {
    return undefined;
  }

  return body;
}

export function ensureHttpMethod(value: unknown): HttpMethod {
  const normalized = String(value ?? '').toUpperCase();
  return (HTTP_METHODS as string[]).includes(normalized) ? (normalized as HttpMethod) : 'GET';
}

export function getMonacoLanguageFromMime(mime: string): string {
  const normalizedMime = mime.toLowerCase().split(';')[0].trim();

  if (normalizedMime === 'application/json' || normalizedMime.endsWith('+json')) {
    return 'json';
  }

  if (normalizedMime === 'application/xml' || normalizedMime === 'text/xml' || normalizedMime.endsWith('+xml')) {
    return 'xml';
  }

  if (normalizedMime === 'text/html') {
    return 'html';
  }

  if (normalizedMime === 'application/javascript' || normalizedMime === 'text/javascript') {
    return 'javascript';
  }

  if (normalizedMime === 'text/css') {
    return 'css';
  }

  if (normalizedMime === 'text/plain') {
    return 'plaintext';
  }

  return 'plaintext';
}

export function toHttpRequestData(data: Request['data']): HttpRequestWithUiData {
  return data as unknown as HttpRequestWithUiData;
}

export function toRequestWithData(request: Request, data: HttpRequestWithUiData): Request {
  return {
    ...request,
    data: data as unknown as Request['data'],
  };
}

export function storedParamsToParamEntries(stored: HttpRequestData['params']): ParamEntry[] {
  if (stored === undefined) {
    return [];
  }

  return stored.map((item: HttpParam) => ({
    key: item.key,
    value: item.value,
    description: item.description ?? '',
    enabled: true,
  }));
}

export function paramEntriesToArray(entries: ParamEntry[]): NonNullable<HttpRequestData['params']> {
  return entries
    .filter((entry: ParamEntry) => entry.enabled === true && entry.key.trim() !== '')
    .map((entry: ParamEntry) => {
      const description = entry.description ?? '';

      return {
        key: entry.key,
        value: entry.value,
        ...(description.trim() !== '' ? { description } : {}),
      };
    });
}

export function recordToHeaderEntries(record: Record<string, string> | undefined): HeaderEntry[] {
  if (record === undefined) {
    return [];
  }

  return Object.entries(record).map(([key, value]) => ({
    key,
    value,
    description: '',
    enabled: true,
  }));
}

export function headerEntriesToRecord(entries: HeaderEntry[]): Record<string, string> {
  const record: Record<string, string> = {};

  for (const entry of entries) {
    if (entry.enabled === true && entry.key.trim() !== '') {
      record[entry.key] = entry.value;
    }
  }

  return record;
}

export function computeGeneratedParams(auth: Request['auth']): GeneratedParamEntry[] {
  const result: GeneratedParamEntry[] = [];

  if (auth?.type !== 'apikey') {
    return result;
  }

  if (!isRecord(auth.data)) {
    return result;
  }

  const location = getStringValue(auth.data, 'in');
  const key = getStringValue(auth.data, 'key');
  const value = getStringValue(auth.data, 'value') ?? '';

  if (location === 'query' && key !== undefined && key !== '') {
    result.push({
      key,
      value,
      source: 'API Key auth',
      readonly: true,
    });
  }

  return result;
}

export function computeGeneratedHeaders(
  body: HttpRequestData['body'],
  auth: Request['auth']
): GeneratedHeaderEntry[] {
  const result: GeneratedHeaderEntry[] = [];
  const bodyData = getBodyObject(body);

  if (bodyData?.mode === 'urlencoded') {
    result.push({
      key: 'Content-Type',
      value: 'application/x-www-form-urlencoded',
      source: 'Body mode (urlencoded)',
      readonly: true,
    });
  } else if (bodyData?.mode === 'formdata') {
    result.push({
      key: 'Content-Type',
      value: 'multipart/form-data',
      source: 'Body mode (form-data)',
      readonly: true,
    });
  } else if (
    bodyData?.mode === 'raw' &&
    bodyData.language !== undefined &&
    bodyData.language !== ''
  ) {
    result.push({
      key: 'Content-Type',
      value: bodyData.language,
      source: 'Body mode (raw)',
      readonly: true,
    });
  }

  if (auth?.type === 'bearer') {
    result.push({ key: 'Authorization', value: 'Bearer', source: 'Bearer auth', readonly: true });
  } else if (auth?.type === 'basic') {
    result.push({ key: 'Authorization', value: 'Basic', source: 'Basic auth', readonly: true });
  } else if (auth?.type === 'apikey' && isRecord(auth.data)) {
    const location = getStringValue(auth.data, 'in');
    const key = getStringValue(auth.data, 'key');
    const value = getStringValue(auth.data, 'value') ?? '';

    if (location === 'header' && key !== undefined && key !== '') {
      result.push({ key, value, source: 'API Key auth', readonly: true });
    }
  } else if (auth?.type === 'oauth2') {
    result.push({ key: 'Authorization', value: 'Bearer', source: 'OAuth2', readonly: true });
  }

  return result;
}

export function toHeaderString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return value ?? '';
}

export function getHeaderValue(
  headers: Record<string, string | string[]>,
  key: string
): string | undefined {
  const target = key.toLowerCase();

  for (const [headerKey, headerValue] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === target) {
      return toHeaderString(headerValue);
    }
  }

  return undefined;
}

export function parseSetCookieHeaders(headers: Record<string, string | string[]>): ParsedCookie[] {
  const rawSetCookie = headers['set-cookie'];
  if (rawSetCookie === undefined) {
    return [];
  }

  const cookieStrings = Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie];

  return cookieStrings.map((cookieStr: string) => {
    const [nameValue, ...attributes] = cookieStr.split(';').map((segment: string) => segment.trim());
    const [name = '', value = ''] = nameValue.split('=');
    const cookie: ParsedCookie = { name, value };

    for (const attribute of attributes) {
      const [attrKey = '', attrValue = ''] = attribute.split('=');
      const key = attrKey.toLowerCase();

      if (key === 'domain') {
        cookie.domain = attrValue;
      } else if (key === 'path') {
        cookie.path = attrValue;
      } else if (key === 'expires') {
        cookie.expires = attrValue;
      } else if (key === 'max-age') {
        cookie.maxAge = attrValue;
      } else if (key === 'secure') {
        cookie.secure = true;
      } else if (key === 'httponly') {
        cookie.httpOnly = true;
      } else if (key === 'samesite') {
        cookie.sameSite = attrValue;
      }
    }

    return cookie;
  });
}

