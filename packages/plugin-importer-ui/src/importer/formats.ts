export const IMPORT_FORMATS = [
  'postman',
  'insomnia',
  'openapi',
] as const;

export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const FILE_EXTENSIONS: Record<ImportFormat, { kind: 'file' | 'directory'; extensions: string[] }> = {
  postman: { kind: 'file', extensions: ['.json'] },
  insomnia: { kind: 'file', extensions: ['.json', '.yaml', '.yml'] },
  openapi: { kind: 'file', extensions: ['.json', '.yaml', '.yml'] },
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

/**
 * Best-effort format detection from file content.
 * Version validation is performed later by each converter.
 */
export function detectImportFormat(data: string | unknown): ImportFormat | null {
  const text = normalizeInputToText(data);
  if (text === null || text === '') {
    return null;
  }

  // Postman — JSON only; presence of _postman_id / postman_id is definitive
  if (text.includes('"_postman_id"') || text.includes('"postman_id"')) {
    return 'postman';
  }

  // Insomnia JSON export: quoted YAML-style keys in JSON
  if (text.includes('"_type"') && text.includes('"__export_format"')) {
    return 'insomnia';
  }

  // Insomnia YAML export: unquoted YAML keys
  if (text.includes('_type:') && text.includes('__export_format:')) {
    return 'insomnia';
  }

  // OpenAPI — presence of "openapi" key in JSON or `openapi:` in YAML
  if (text.includes('"openapi"') || /^openapi:/m.test(text)) {
    return 'openapi';
  }

  return null;
}
