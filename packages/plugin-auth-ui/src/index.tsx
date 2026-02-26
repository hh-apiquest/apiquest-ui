import React from 'react';
import type { IAuthPluginUI, PluginUIContext } from '@apiquest/plugin-ui-types';

import * as RT from '@radix-ui/themes';

type AuthFieldProps = {
  label: string;
  children: React.ReactNode;
};

function AuthField({ label, children }: AuthFieldProps) {
  return (
    <RT.Box>
      <RT.Text as="label" size="2" weight="medium" style={{ display: 'block', marginBottom: 4 }}>
        {label}
      </RT.Text>
      {children}
    </RT.Box>
  );
}

type AuthStackProps = {
  children: React.ReactNode;
};

function AuthStack({ children }: AuthStackProps) {
  return (
    <RT.Flex direction="column" gap="3" style={{ width: '100%' }}>
      {children}
    </RT.Flex>
  );
}

const textFieldStyles: React.CSSProperties = {
  width: '100%'
};

export const bearerAuthUI: IAuthPluginUI = (() => {
  let UI: PluginUIContext;

  return {
    type: 'bearer',

    setup(uiContext: PluginUIContext) {
      UI = uiContext;
    },

    createDefault() {
      return { token: '' };
    },

    renderForm(authData: any, onChange: (data: any) => void, options?: { readOnly?: boolean }) {
      const readOnly = options?.readOnly || false;
      return (
        <AuthStack>
          <AuthField label="Bearer Token">
            <RT.TextField.Root
              type="password"
              value={authData.token || ''}
              onChange={(e) => onChange({ ...authData, token: (e.target as HTMLInputElement).value })}
              placeholder="Enter bearer token or {{variable}}"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>
        </AuthStack>
      );
    },

    validate(authData: any) {
      if (!authData.token || authData.token.trim() === '') {
        return { valid: false, errors: ['Token is required'] };
      }
      return { valid: true };
    }
  };
})();

export const basicAuthUI: IAuthPluginUI = (() => {
  let UI: PluginUIContext;

  return {
    type: 'basic',

    setup(uiContext: PluginUIContext) {
      UI = uiContext;
    },

    createDefault() {
      return { username: '', password: '' };
    },

    renderForm(authData: any, onChange: (data: any) => void, options?: { readOnly?: boolean }) {
      const readOnly = options?.readOnly || false;
      return (
        <AuthStack>
          <AuthField label="Username">
            <RT.TextField.Root
              type="text"
              value={authData.username || ''}
              onChange={(e) => onChange({ ...authData, username: (e.target as HTMLInputElement).value })}
              placeholder="Username"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>
          <AuthField label="Password">
            <RT.TextField.Root
              type="password"
              value={authData.password || ''}
              onChange={(e) => onChange({ ...authData, password: (e.target as HTMLInputElement).value })}
              placeholder="Password or {{variable}}"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>
        </AuthStack>
      );
    },

    validate(authData: any) {
      const errors: string[] = [];
      if (!authData.username || authData.username.trim() === '') {
        errors.push('Username is required');
      }
      if (!authData.password || authData.password.trim() === '') {
        errors.push('Password is required');
      }
      return errors.length > 0 ? { valid: false, errors } : { valid: true };
    }
  };
})();

export const apiKeyAuthUI: IAuthPluginUI = (() => {
  let UI: PluginUIContext;

  return {
    type: 'apikey',

    setup(uiContext: PluginUIContext) {
      UI = uiContext;
    },

    createDefault() {
      return { key: '', value: '', in: 'header' };
    },

    renderForm(authData: any, onChange: (data: any) => void, options?: { readOnly?: boolean }) {
      const readOnly = options?.readOnly || false;
      return (
        <AuthStack>
          <AuthField label="Key">
            <RT.TextField.Root
              type="text"
              value={authData.key || ''}
              onChange={(e) => onChange({ ...authData, key: (e.target as HTMLInputElement).value })}
              placeholder="e.g., X-API-Key"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>
          <AuthField label="Value">
            <RT.TextField.Root
              type="password"
              value={authData.value || ''}
              onChange={(e) => onChange({ ...authData, value: (e.target as HTMLInputElement).value })}
              placeholder="API key value or {{variable}}"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>
          <AuthField label="Add to">
            <RT.Select.Root
              value={authData.in || 'header'}
              onValueChange={(value) => onChange({ ...authData, in: value })}
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

    validate(authData: any) {
      const errors: string[] = [];
      if (!authData.key || authData.key.trim() === '') {
        errors.push('Key name is required');
      }
      if (!authData.value || authData.value.trim() === '') {
        errors.push('API key value is required');
      }
      return errors.length > 0 ? { valid: false, errors } : { valid: true };
    }
  };
})();

export const oauth2AuthUI: IAuthPluginUI = (() => {
  let UI: PluginUIContext;

  return {
    type: 'oauth2',

    setup(uiContext: PluginUIContext) {
      UI = uiContext;
    },

    createDefault() {
      return {
        grantType: 'client_credentials',
        accessTokenUrl: '',
        clientId: '',
        clientSecret: '',
        scope: ''
      };
    },

    renderForm(authData: any, onChange: (data: any) => void, options?: { readOnly?: boolean }) {
      const readOnly = options?.readOnly || false;
      const grantType = authData.grantType || 'client_credentials';

      return (
        <AuthStack>
          <AuthField label="Grant Type">
            <RT.Select.Root
              value={grantType}
              onValueChange={(value) => onChange({ ...authData, grantType: value })}
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
              value={authData.accessTokenUrl || ''}
              onChange={(e) => onChange({ ...authData, accessTokenUrl: (e.target as HTMLInputElement).value })}
              placeholder="https://auth.example.com/oauth/token"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>
          <AuthField label="Client ID">
            <RT.TextField.Root
              type="text"
              value={authData.clientId || ''}
              onChange={(e) => onChange({ ...authData, clientId: (e.target as HTMLInputElement).value })}
              placeholder="Client ID"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>
          <AuthField label="Client Secret">
            <RT.TextField.Root
              type="password"
              value={authData.clientSecret || ''}
              onChange={(e) => onChange({ ...authData, clientSecret: (e.target as HTMLInputElement).value })}
              placeholder="Client Secret or {{variable}}"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>
          {grantType === 'password' ? (
            <>
              <AuthField label="Username">
                <RT.TextField.Root
                  type="text"
                  value={authData.username || ''}
                  onChange={(e) => onChange({ ...authData, username: (e.target as HTMLInputElement).value })}
                  placeholder="Username"
                  size="2"
                  style={textFieldStyles}
                  disabled={readOnly}
                />
              </AuthField>
              <AuthField label="Password">
                <RT.TextField.Root
                  type="password"
                  value={authData.password || ''}
                  onChange={(e) => onChange({ ...authData, password: (e.target as HTMLInputElement).value })}
                  placeholder="Password"
                  size="2"
                  style={textFieldStyles}
                  disabled={readOnly}
                />
              </AuthField>
            </>
          ) : null}
          <AuthField label="Scope (Optional)">
            <RT.TextField.Root
              type="text"
              value={authData.scope || ''}
              onChange={(e) => onChange({ ...authData, scope: (e.target as HTMLInputElement).value })}
              placeholder="read write"
              size="2"
              style={textFieldStyles}
              disabled={readOnly}
            />
          </AuthField>
        </AuthStack>
      );
    },

    validate(authData: any) {
      const errors: string[] = [];
      if (!authData.accessTokenUrl || authData.accessTokenUrl.trim() === '') {
        errors.push('Access Token URL is required');
      }
      if (!authData.clientId || authData.clientId.trim() === '') {
        errors.push('Client ID is required');
      }
      if (!authData.clientSecret || authData.clientSecret.trim() === '') {
        errors.push('Client Secret is required');
      }
      if (authData.grantType === 'password') {
        if (!authData.username || authData.username.trim() === '') {
          errors.push('Username is required for password grant');
        }
        if (!authData.password || authData.password.trim() === '') {
          errors.push('Password is required for password grant');
        }
      }
      return errors.length > 0 ? { valid: false, errors } : { valid: true };
    }
  };
})();

export const authPluginUIs: IAuthPluginUI[] = [
  bearerAuthUI,
  basicAuthUI,
  apiKeyAuthUI,
  oauth2AuthUI
];

export default authPluginUIs;
