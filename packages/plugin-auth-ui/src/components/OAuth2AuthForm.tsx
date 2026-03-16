import React from 'react';
import * as RT from '@radix-ui/themes';
import type { IAuthPluginUI } from '@apiquest/plugin-ui-types';

import { AuthField, AuthStack, textFieldStyles } from './AuthLayout';
import { PasswordField } from './PasswordField';
import type {
  AuthValidationResult,
  OAuth2AuthData,
  OAuth2GrantType,
  ReadOnlyRenderOptions,
} from '../types';
import { toOAuth2GrantType, toStringValue, trimIsEmpty } from '../types';

function normalizeOAuth2AuthData(authData: unknown): OAuth2AuthData {
  const record = typeof authData === 'object' && authData !== null ? (authData as Record<string, unknown>) : {};
  return {
    grantType: toOAuth2GrantType(record.grantType),
    accessTokenUrl: toStringValue(record.accessTokenUrl),
    clientId: toStringValue(record.clientId),
    clientSecret: toStringValue(record.clientSecret),
    scope: toStringValue(record.scope),
    username: toStringValue(record.username),
    password: toStringValue(record.password),
  };
}

function validateOAuth2AuthData(authData: OAuth2AuthData): AuthValidationResult {
  const errors: string[] = [];

  if (trimIsEmpty(authData.accessTokenUrl)) {
    errors.push('Access Token URL is required');
  }

  if (trimIsEmpty(authData.clientId)) {
    errors.push('Client ID is required');
  }

  if (trimIsEmpty(authData.clientSecret)) {
    errors.push('Client Secret is required');
  }

  if (authData.grantType === 'password') {
    if (trimIsEmpty(authData.username ?? '')) {
      errors.push('Username is required for password grant');
    }

    if (trimIsEmpty(authData.password ?? '')) {
      errors.push('Password is required for password grant');
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

export function createOAuth2AuthPlugin(): IAuthPluginUI {
  return {
    type: 'oauth2',

    setup(): void {
      // no-op
    },

    createDefault(): OAuth2AuthData {
      return {
        grantType: 'client_credentials',
        accessTokenUrl: '',
        clientId: '',
        clientSecret: '',
        scope: '',
        username: '',
        password: '',
      };
    },

    renderForm(
      authData: unknown,
      onChange: (data: unknown) => void,
      options?: ReadOnlyRenderOptions
    ): React.ReactNode {
      const data = normalizeOAuth2AuthData(authData);
      const readOnly = options?.readOnly ?? false;

      return (
        <AuthStack>
          <AuthField label="Grant Type">
            <RT.Select.Root
              value={data.grantType}
              onValueChange={(value: string) => {
                const grantType: OAuth2GrantType = toOAuth2GrantType(value);
                onChange({ ...data, grantType });
              }}
              size="2"
              disabled={readOnly}
            >
              <RT.Select.Trigger style={{ width: '100%' }} />
              <RT.Select.Content>
                <RT.Select.Item value="client_credentials">Client Credentials</RT.Select.Item>
                <RT.Select.Item value="password">Password</RT.Select.Item>
                <RT.Select.Item value="authorization_code">Authorization Code</RT.Select.Item>
              </RT.Select.Content>
            </RT.Select.Root>
          </AuthField>

          <AuthField label="Access Token URL">
            <RT.TextField.Root
              type="text"
              value={data.accessTokenUrl}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                onChange({ ...data, accessTokenUrl: event.target.value });
              }}
              placeholder="https://auth.example.com/oauth/token"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>

          <AuthField label="Client ID">
            <RT.TextField.Root
              type="text"
              value={data.clientId}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                onChange({ ...data, clientId: event.target.value });
              }}
              placeholder="Client ID"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>

          <AuthField label="Client Secret">
            <PasswordField
              value={data.clientSecret}
              onChange={(clientSecret: string) => {
                onChange({ ...data, clientSecret });
              }}
              placeholder="Client Secret or {{variable}}"
              disabled={readOnly}
            />
          </AuthField>

          {data.grantType === 'password' ? (
            <>
              <AuthField label="Username">
                <RT.TextField.Root
                  type="text"
                  value={data.username ?? ''}
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
                  value={data.password ?? ''}
                  onChange={(password: string) => {
                    onChange({ ...data, password });
                  }}
                  placeholder="Password"
                  disabled={readOnly}
                />
              </AuthField>
            </>
          ) : null}

          <AuthField label="Scope (Optional)">
            <RT.TextField.Root
              type="text"
              value={data.scope}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                onChange({ ...data, scope: event.target.value });
              }}
              placeholder="read write"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>
        </AuthStack>
      );
    },

    validate(authData: unknown): AuthValidationResult {
      return validateOAuth2AuthData(normalizeOAuth2AuthData(authData));
    },
  };
}

