export const IMPORT_FORMATS = [
  'postman-v2.1',
  'insomnia-json',
  'openapi-3.0',
  'openapi-3.1',
] as const;

export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const FILE_EXTENSIONS: Record<ImportFormat, { kind: 'file' | 'directory'; extensions: string[] }> = {
  'postman-v2.1': { kind: 'file', extensions: ['.json'] },
  'insomnia-json': { kind: 'file', extensions: ['.json'] },
  'openapi-3.0': { kind: 'file', extensions: ['.json', '.yaml', '.yml'] },
  'openapi-3.1': { kind: 'file', extensions: ['.json', '.yaml', '.yml'] },
};

export function isImportFormat(value: string): value is ImportFormat {
  return (IMPORT_FORMATS as readonly string[]).includes(value);
}

export function normalizeInputToText(data: string | unknown): string | null {
  if (typeof data === 'string') {
    return data;
  }

  try {
    return JSON.stringify(data);
  } catch {
    return null;
  }
}

export function detectImportFormat(data: string | unknown): ImportFormat | null {
  const text = normalizeInputToText(data);
  if (text === null || text === '') {
    return null;
  }

  if (text.includes('"_postman_id"') || text.includes('"postman_id"')) {
    return 'postman-v2.1';
  }

  if (text.includes('"_type"') && text.includes('"__export_format"')) {
    return 'insomnia-json';
  }

  if (text.includes('"openapi"')) {
    if (text.includes('"3.1')) {
      return 'openapi-3.1';
    }

    if (text.includes('"3.0')) {
      return 'openapi-3.0';
    }

    return 'openapi-3.0';
  }

  return null;
}

