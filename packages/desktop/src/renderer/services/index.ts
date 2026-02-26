// Service layer exports
// All services are singletons - import and use directly

export { workspaceService, WorkspaceService } from './WorkspaceService';
export { settingsService, SettingsService } from './SettingsService';
export { consoleService, ConsoleService } from './ConsoleService';
export { networkService, NetworkService } from './NetworkService';
export { trashService, TrashService } from './TrashService';
export { pluginManagerService, PluginManagerService } from './PluginManagerService';
export { pluginLoader } from './PluginLoaderService';
export type { PluginLoaderService } from './PluginLoaderService';
