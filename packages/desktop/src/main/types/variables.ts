import type { VariableValue } from '@apiquest/types';

export type VariableRecord = Record<string, VariableValue>;

export interface VariableRow {
  key?: string;
  value?: unknown;
  enabled?: boolean;
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isVariableRow(value: unknown): value is VariableRow {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (value.key === undefined || typeof value.key === 'string')
    && (value.enabled === undefined || typeof value.enabled === 'boolean');
}
