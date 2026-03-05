import { settingsService, type SecretPrimitive, type WorkspaceSecrets } from './SettingsService.js';
import type { Variable, VariablePrimitive, VariableValue } from '@apiquest/types';
import { maskSecretRecord } from './utils/mask.js';

type VariableRecord = Record<string, VariableValue>;

type SplitResult = {
  sanitizedVariables: VariableRecord;
  secrets: Record<string, SecretPrimitive>;
};

function isObjectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVariableObject(value: VariableValue): value is Variable {
  return isObjectValue(value) && Object.prototype.hasOwnProperty.call(value, 'value');
}

function isSecretVariableObject(value: VariableValue): value is Variable {
  return isVariableObject(value) && value.isSecret === true;
}

function normalizeSecretPrimitive(value: unknown): VariablePrimitive {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  return null;
}

function cloneVariableForFile(value: VariableValue): VariableValue {
  if (isObjectValue(value)) {
    return { ...(value as Variable) };
  }

  return value;
}

export class SecretVariableService {
  private encodeBeforeStore(value: SecretPrimitive): SecretPrimitive {
    // Encryption hook point (currently pass-through)
    return value;
  }

  private decodeAfterLoad(value: SecretPrimitive): SecretPrimitive {
    // Encryption hook point (currently pass-through)
    return value;
  }

  splitVariablesForSave(variables: VariableRecord | undefined): SplitResult {
    const sanitizedVariables: VariableRecord = {};
    const secrets: Record<string, SecretPrimitive> = {};

    if (!variables || !isObjectValue(variables)) {
      return { sanitizedVariables, secrets };
    }

    for (const [key, value] of Object.entries(variables)) {
      if (isSecretVariableObject(value)) {
        const secretValue = normalizeSecretPrimitive(value.value);
        secrets[key] = this.encodeBeforeStore(secretValue);
        sanitizedVariables[key] = {
          ...value,
          value: null
        } as Variable;
        continue;
      }

      sanitizedVariables[key] = cloneVariableForFile(value);
    }

    return { sanitizedVariables, secrets };
  }

  hydrateVariables(
    variables: VariableRecord | undefined,
    secrets: Record<string, SecretPrimitive>
  ): VariableRecord {
    const hydratedVariables: VariableRecord = {};
    const source = variables && isObjectValue(variables) ? variables : {};

    for (const [key, value] of Object.entries(source)) {
      if (isSecretVariableObject(value)) {
        const storedValue = Object.prototype.hasOwnProperty.call(secrets, key)
          ? secrets[key]
          : null;

        hydratedVariables[key] = {
          ...value,
          value: this.decodeAfterLoad(storedValue ?? null)
        };
        continue;
      }

      hydratedVariables[key] = cloneVariableForFile(value);
    }

    return hydratedVariables;
  }

  private async getWorkspaceSecrets(workspaceId: string): Promise<WorkspaceSecrets> {
    const value = await settingsService.get(`secrets.workspaces.${workspaceId}`);
    return isObjectValue(value) ? (value as WorkspaceSecrets) : {};
  }

  private async setWorkspaceSecrets(workspaceId: string, secrets: WorkspaceSecrets): Promise<void> {
    await settingsService.set(`secrets.workspaces.${workspaceId}`, secrets);
  }

  async getCollectionSecrets(workspaceId: string, collectionId: string): Promise<Record<string, SecretPrimitive>> {
    const workspaceSecrets = await this.getWorkspaceSecrets(workspaceId);
    const value = workspaceSecrets.collections?.[collectionId];
    if (!isObjectValue(value)) return {};

    const normalized: Record<string, SecretPrimitive> = {};
    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = normalizeSecretPrimitive(entry);
    }

    console.log('[SecretVariableService] getCollectionSecrets', {
      workspaceId,
      collectionId,
      secretKeys: Object.keys(normalized),
      secrets: maskSecretRecord(normalized)
    });

    return normalized;
  }

  async setCollectionSecrets(
    workspaceId: string,
    collectionId: string,
    secrets: Record<string, SecretPrimitive>
  ): Promise<void> {
    const workspaceSecrets = await this.getWorkspaceSecrets(workspaceId);
    const collections = {
      ...(workspaceSecrets.collections || {})
    };

    collections[collectionId] = { ...secrets };

    console.log('[SecretVariableService] setCollectionSecrets', {
      workspaceId,
      collectionId,
      secretKeys: Object.keys(secrets),
      secrets: maskSecretRecord(secrets)
    });

    await this.setWorkspaceSecrets(workspaceId, {
      ...workspaceSecrets,
      collections
    });
  }

  async copyCollectionSecrets(workspaceId: string, sourceCollectionId: string, targetCollectionId: string): Promise<void> {
    const workspaceSecrets = await this.getWorkspaceSecrets(workspaceId);
    const collections = {
      ...(workspaceSecrets.collections || {})
    };

    collections[targetCollectionId] = {
      ...(collections[sourceCollectionId] || {})
    };

    await this.setWorkspaceSecrets(workspaceId, {
      ...workspaceSecrets,
      collections
    });
  }

  async deleteCollectionSecrets(workspaceId: string, collectionId: string): Promise<void> {
    const workspaceSecrets = await this.getWorkspaceSecrets(workspaceId);
    const collections = {
      ...(workspaceSecrets.collections || {})
    };

    delete collections[collectionId];

    await this.setWorkspaceSecrets(workspaceId, {
      ...workspaceSecrets,
      collections
    });
  }

  async getEnvironmentSecrets(workspaceId: string, environmentId: string): Promise<Record<string, SecretPrimitive>> {
    const workspaceSecrets = await this.getWorkspaceSecrets(workspaceId);
    const value = workspaceSecrets.environments?.[environmentId];
    if (!isObjectValue(value)) return {};

    const normalized: Record<string, SecretPrimitive> = {};
    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = normalizeSecretPrimitive(entry);
    }

    console.log('[SecretVariableService] getEnvironmentSecrets', {
      workspaceId,
      environmentId,
      secretKeys: Object.keys(normalized),
      secrets: maskSecretRecord(normalized)
    });

    return normalized;
  }

  async setEnvironmentSecrets(
    workspaceId: string,
    environmentId: string,
    secrets: Record<string, SecretPrimitive>
  ): Promise<void> {
    const workspaceSecrets = await this.getWorkspaceSecrets(workspaceId);
    const environments = {
      ...(workspaceSecrets.environments || {})
    };

    environments[environmentId] = { ...secrets };

    console.log('[SecretVariableService] setEnvironmentSecrets', {
      workspaceId,
      environmentId,
      secretKeys: Object.keys(secrets),
      secrets: maskSecretRecord(secrets)
    });

    await this.setWorkspaceSecrets(workspaceId, {
      ...workspaceSecrets,
      environments
    });
  }

  async moveEnvironmentSecrets(workspaceId: string, oldEnvironmentId: string, newEnvironmentId: string): Promise<void> {
    const workspaceSecrets = await this.getWorkspaceSecrets(workspaceId);
    const environments = {
      ...(workspaceSecrets.environments || {})
    };

    environments[newEnvironmentId] = {
      ...(environments[oldEnvironmentId] || {})
    };
    delete environments[oldEnvironmentId];

    await this.setWorkspaceSecrets(workspaceId, {
      ...workspaceSecrets,
      environments
    });
  }

  async copyEnvironmentSecrets(workspaceId: string, sourceEnvironmentId: string, targetEnvironmentId: string): Promise<void> {
    const workspaceSecrets = await this.getWorkspaceSecrets(workspaceId);
    const environments = {
      ...(workspaceSecrets.environments || {})
    };

    environments[targetEnvironmentId] = {
      ...(environments[sourceEnvironmentId] || {})
    };

    await this.setWorkspaceSecrets(workspaceId, {
      ...workspaceSecrets,
      environments
    });
  }

  async deleteEnvironmentSecrets(workspaceId: string, environmentId: string): Promise<void> {
    const workspaceSecrets = await this.getWorkspaceSecrets(workspaceId);
    const environments = {
      ...(workspaceSecrets.environments || {})
    };

    delete environments[environmentId];

    await this.setWorkspaceSecrets(workspaceId, {
      ...workspaceSecrets,
      environments
    });
  }
}

export const secretVariableService = new SecretVariableService();
