import type { IAuthPluginUI } from '@apiquest/plugin-ui-types';

import { createBearerAuthPlugin } from './components/BearerAuthForm';
import { createBasicAuthPlugin } from './components/BasicAuthForm';
import { createApiKeyAuthPlugin } from './components/ApiKeyAuthForm';
import { createOAuth2AuthPlugin } from './components/OAuth2AuthForm';

export const bearerAuthUI: IAuthPluginUI = createBearerAuthPlugin();
export const basicAuthUI: IAuthPluginUI = createBasicAuthPlugin();
export const apiKeyAuthUI: IAuthPluginUI = createApiKeyAuthPlugin();
export const oauth2AuthUI: IAuthPluginUI = createOAuth2AuthPlugin();

export const authPluginUIs: IAuthPluginUI[] = [
  bearerAuthUI,
  basicAuthUI,
  apiKeyAuthUI,
  oauth2AuthUI,
];

export default authPluginUIs;

