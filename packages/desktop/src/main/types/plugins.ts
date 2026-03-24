import type { ApiquestMetadata } from '@apiquest/plugin-ui-types';

export interface MarketplacePlugin {
  name: string;
  version: string;
  description: string;
  apiquest?: ApiquestMetadata;
  repository?: string;
  homepage?: string;
  author?: string;
}

export interface ScannedPlugin {
  name: string;
  version: string;
  main: string;
  metadata: ApiquestMetadata;
  enabled: boolean;
}

export interface PluginPackageJson {
  name?: string;
  version?: string;
  main?: string;
  apiquest?: ApiquestMetadata;
}

export interface MarketplacePackageJson {
  name?: string;
  version?: string;
  description?: string;
  apiquest?: ApiquestMetadata;
  homepage?: string;
  author?: string | { name?: string };
  repository?: string | { url?: string };
}

export function isPluginPackageJson(value: unknown): value is PluginPackageJson {
  return typeof value === 'object' && value !== null;
}

export function isMarketplacePackageJson(value: unknown): value is MarketplacePackageJson {
  return typeof value === 'object' && value !== null;
}
