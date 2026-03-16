import React from 'react';
import * as RT from '@radix-ui/themes';
import type { IAuthPluginUI } from '@apiquest/plugin-ui-types';

import { AuthField, AuthStack, textFieldStyles } from './AuthLayout';
import { PasswordField } from './PasswordField';
import type {
  ApiKeyAuthData,
  ApiKeyLocation,
  AuthValidationResult,
  ReadOnlyRenderOptions,
} from '../types';
import { toApiKeyLocation, toStringValue, trimIsEmpty } from '../types';

function normalizeApiKeyAuthData(authData: unknown): ApiKeyAuthData {
  const record = typeof authData === 'object' && authData !== null ? (authData as Record<string, unknown>) : {};
  return {
    key: toStringValue(record.key),
    value: toStringValue(record.value),
    in: toApiKeyLocation(record.in),
  };
}

function validateApiKeyAuthData(authData: ApiKeyAuthData): AuthValidationResult {
  const errors: string[] = [];

  if (trimIsEmpty(authData.key)) {
    errors.push('Key name is required');
  }

  if (trimIsEmpty(authData.value)) {
    errors.push('API key value is required');
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

export function createApiKeyAuthPlugin(): IAuthPluginUI {
  return {
    type: 'apikey',

    setup(): void {
      // no-op
    },

    createDefault(): ApiKeyAuthData {
      return { key: '', value: '', in: 'header' };
    },

    renderForm(
      authData: unknown,
      onChange: (data: unknown) => void,
      options?: ReadOnlyRenderOptions
    ): React.ReactNode {
      const data = normalizeApiKeyAuthData(authData);
      const readOnly = options?.readOnly ?? false;

      return (
        <AuthStack>
          <AuthField label="Key">
            <RT.TextField.Root
              type="text"
              value={data.key}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                onChange({ ...data, key: event.target.value });
              }}
              placeholder="e.g., X-API-Key"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>

          <AuthField label="Value">
            <PasswordField
              value={data.value}
              onChange={(value: string) => {
                onChange({ ...data, value });
              }}
              placeholder="API key value or {{variable}}"
              disabled={readOnly}
            />
          </AuthField>

          <AuthField label="Add to">
            <RT.Select.Root
              value={data.in}
              onValueChange={(value: string) => {
                const nextIn: ApiKeyLocation = value === 'query' ? 'query' : 'header';
                onChange({ ...data, in: nextIn });
              }}
              size="2"
              disabled={readOnly}
            >
              <RT.Select.Trigger style={{ width: '100%' }} />
              <RT.Select.Content>
                <RT.Select.Item value="header">Header</RT.Select.Item>
                <RT.Select.Item value="query">Query Parameter</RT.Select.Item>
              </RT.Select.Content>
            </RT.Select.Root>
          </AuthField>
        </AuthStack>
      );
    },

    validate(authData: unknown): AuthValidationResult {
      return validateApiKeyAuthData(normalizeApiKeyAuthData(authData));
    },
  };
}

