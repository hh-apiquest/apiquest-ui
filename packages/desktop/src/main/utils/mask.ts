function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function maskSecretValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value);
  if (text.length <= 4) {
    return '*'.repeat(text.length);
  }

  return `${text.slice(0, 2)}${'*'.repeat(text.length - 4)}${text.slice(-2)}`;
}

export function maskSecretRecord(record: Record<string, unknown>): Record<string, string | null> {
  const masked: Record<string, string | null> = {};

  for (const [key, value] of Object.entries(record)) {
    masked[key] = maskSecretValue(value);
  }

  return masked;
}

export function maskVariablesForLog(variables: unknown): unknown {
  if (!isRecord(variables)) {
    return variables;
  }

  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(variables)) {
    if (
      isRecord(value)
      && value.isSecret === true
      && Object.prototype.hasOwnProperty.call(value, 'value')
    ) {
      masked[key] = {
        ...value,
        value: maskSecretValue(value.value)
      };
      continue;
    }

    masked[key] = value;
  }

  return masked;
}

