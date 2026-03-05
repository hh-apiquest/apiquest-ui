import type { VariableValue } from '@apiquest/types';

export function extractVariablePrimitive(value: VariableValue): string | number | boolean | null {
  if (typeof value === 'object' && value !== null && 'value' in value) {
    const varObj = value as { value: string | number | boolean | null; enabled?: boolean };
    if (varObj.enabled === false) return null;
    return varObj.value;
  }

  return value;
}
