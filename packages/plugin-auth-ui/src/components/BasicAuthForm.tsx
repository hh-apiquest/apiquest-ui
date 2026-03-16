import React from 'react';
import * as RT from '@radix-ui/themes';
import type { IAuthPluginUI } from '@apiquest/plugin-ui-types';

import { AuthField, AuthStack, textFieldStyles } from './AuthLayout';
import { PasswordField } from './PasswordField';
import type { AuthValidationResult, BasicAuthData, ReadOnlyRenderOptions } from '../types';
import { trimIsEmpty, toStringValue } from '../types';

function normalizeBasicAuthData(authData: unknown): BasicAuthData {
  const record = typeof authData === 'object' && authData !== null ? (authData as Record<string, unknown>) : {};
  return {
    username: toStringValue(record.username),
    password: toStringValue(record.password),
  };
}

function validateBasicAuthData(authData: BasicAuthData): AuthValidationResult {
  const errors: string[] = [];

  if (trimIsEmpty(authData.username)) {
    errors.push('Username is required');
  }

  if (trimIsEmpty(authData.password)) {
    errors.push('Password is required');
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

export function createBasicAuthPlugin(): IAuthPluginUI {
  return {
    type: 'basic',

    setup(): void {
      // no-op
    },

    createDefault(): BasicAuthData {
      return { username: '', password: '' };
    },

    renderForm(
      authData: unknown,
      onChange: (data: unknown) => void,
      options?: ReadOnlyRenderOptions
    ): React.ReactNode {
      const data = normalizeBasicAuthData(authData);
      const readOnly = options?.readOnly ?? false;

      return (
        <AuthStack>
          <AuthField label="Username">
            <RT.TextField.Root
              type="text"
              value={data.username}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                onChange({ ...data, username: event.target.value });
              }}
              placeholder="Username"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>

          <AuthField label="Password">
            <PasswordField
              value={data.password}
              onChange={(password: string) => {
                onChange({ ...data, password });
              }}
              placeholder="Password or {{variable}}"
              disabled={readOnly}
            />
          </AuthField>
        </AuthStack>
      );
    },

    validate(authData: unknown): AuthValidationResult {
      return validateBasicAuthData(normalizeBasicAuthData(authData));
    },
  };
}

