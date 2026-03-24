import type { MarketplacePlugin } from '../../main/types/plugins';

export type PluginTypeFilter =
  | 'auth-ui'
  | 'protocol-ui'
  | 'importer-ui'
  | 'exporter-ui'
  | 'visualizer-ui'
  | 'extension-ui'
  | 'all';

export interface PluginManagerProps {
  pluginType?: PluginTypeFilter;
  initialSearch?: string;
  onPluginInstalled?: (pluginId: string) => void;
}

export function isMarketplacePlugin(value: unknown): value is MarketplacePlugin {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const plugin = value as Record<string, unknown>;
  return typeof plugin.name === 'string' && typeof plugin.version === 'string' && typeof plugin.description === 'string';
}
