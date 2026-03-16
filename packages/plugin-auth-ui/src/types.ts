export type ReadOnlyRenderOptions = {
  readOnly?: boolean;
};

export type AuthValidationResult = {
  valid: boolean;
  errors?: string[];
};

export type BearerAuthData = {
  token: string;
};

export type BasicAuthData = {
  username: string;
  password: string;
};

export type ApiKeyLocation = 'header' | 'query';

export type ApiKeyAuthData = {
  key: string;
  value: string;
  in: ApiKeyLocation;
};

export type OAuth2GrantType = 'client_credentials' | 'password' | 'authorization_code';

export type OAuth2AuthData = {
  grantType: OAuth2GrantType;
  accessTokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  username?: string;
  password?: string;
};

export type AuthDataRecord = Record<string, unknown>;

export function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function toBooleanValue(value: unknown, fallback: boolean = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function toApiKeyLocation(value: unknown): ApiKeyLocation {
  return value === 'query' ? 'query' : 'header';
}

export function toOAuth2GrantType(value: unknown): OAuth2GrantType {
  if (value === 'password' || value === 'authorization_code' || value === 'client_credentials') {
    return value;
  }

  return 'client_credentials';
}

export function trimIsEmpty(value: string): boolean {
  return value.trim() === '';
}

