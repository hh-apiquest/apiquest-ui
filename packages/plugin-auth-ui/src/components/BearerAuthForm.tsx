import React from 'react';
import * as RT from '@radix-ui/themes';
import type { IAuthPluginUI } from '@apiquest/plugin-ui-types';

import { AuthField, AuthStack, textFieldStyles } from './AuthLayout';
import { PasswordField } from './PasswordField';
import type { AuthValidationResult, BearerAuthData, ReadOnlyRenderOptions } from '../types';
import { trimIsEmpty, toStringValue } from '../types';

function normalizeBearerAuthData(authData: unknown): BearerAuthData {
  const record = typeof authData === 'object' && authData !== null ? (authData as Record<string, unknown>) : {};
  return {
    token: toStringValue(record.token),
  };
}

function validateBearerAuthData(authData: BearerAuthData): AuthValidationResult {
  if (trimIsEmpty(authData.token)) {
    return { valid: false, errors: ['Token is required'] };
  }

  return { valid: true };
}

export function createBearerAuthPlugin(): IAuthPluginUI {
  return {
    type: 'bearer',

    setup(): void {
      // no-op
    },

    createDefault(): BearerAuthData {
      return { token: '' };
    },

    renderForm(
      authData: unknown,
      onChange: (data: unknown) => void,
      options?: ReadOnlyRenderOptions
    ): React.ReactNode {
      const data = normalizeBearerAuthData(authData);
      const readOnly = options?.readOnly ?? false;

      return (
        <AuthStack>
          <AuthField label="Bearer Token">
            <PasswordField
              value={data.token}
              onChange={(token: string) => {
                onChange({ ...data, token });
              }}
              placeholder="Enter bearer token or {{variable}}"
              disabled={readOnly}
            />
          </AuthField>
          <RT.Text size="1" color="gray">
            Token is stored in auth data and should be provided via secure variables when possible.
          </RT.Text>
        </AuthStack>
      );
    },

    validate(authData: unknown): AuthValidationResult {
      return validateBearerAuthData(normalizeBearerAuthData(authData));
    },
  };
}

