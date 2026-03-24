import type { IAuthPluginUI, IImporterPluginUI, IProtocolPluginUI } from '@apiquest/plugin-ui-types';

export interface PluginModuleDefault {
  default?: IProtocolPluginUI | IAuthPluginUI | IImporterPluginUI | IAuthPluginUI[] | IImporterPluginUI[];
}

export interface VaultPluginInfo {
  name: string;
  icon: string;
  description: string;
}
