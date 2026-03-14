// PluginManagerService - Manages UI plugins with dynamic loading via plugin:// protocol

import type { 
  IProtocolPluginUI,
  IAuthPluginUI,
  IImporterPluginUI,
  ApiquestMetadata
} from '@apiquest/plugin-ui-types';
import type { InstalledPluginInfo } from '../types/plugin';
import { EventEmitter } from 'eventemitter3';
import { settingsService } from './SettingsService';

// ScannedPlugin type from IPC handler
interface ScannedPlugin {
  name: string;
  version: string;
  main: string;
  metadata: ApiquestMetadata;
  enabled: boolean;
}

export class PluginManagerService extends EventEmitter {
  private protocolPlugins: Map<string, IProtocolPluginUI> = new Map();
  private authPlugins: Map<string, IAuthPluginUI> = new Map();
  private importerPlugins: Map<string, IImporterPluginUI> = new Map();
  private scannedPlugins: Map<string, ScannedPlugin> = new Map();
  private protocolMetadata: Map<string, ApiquestMetadata> = new Map();
  private authMetadata: Map<string, ApiquestMetadata> = new Map();
  private importerMetadata: Map<string, ApiquestMetadata> = new Map();
  private pluginsLoaded: boolean = false;

  // Reverse-lookup maps: natural identity key -> npm package name.
  // Required so PluginLoaderService can pass the correct packageName to createUIContext()
  // for every plugin type. Canonical for host bridge dispatch.
  //
  // Protocol plugins: key = protocol string (e.g. 'soap')
  // Auth plugins: key = auth type string (e.g. 'bearer')
  // Importer plugins: key = npm package name (already canonical — no separate map needed)
  // Future exporter/visualizer/extension plugins follow the same pattern as importer.
  private protocolPackageNames: Map<string, string> = new Map(); // protocol string -> npm package name
  private authPackageNames: Map<string, string> = new Map();     // auth type string -> npm package name

  constructor() {
    super();
    this.loadPluginsFromFolder()
      .then(() => {
        this.pluginsLoaded = true;
        this.emit('pluginsLoaded');
      })
      .catch(err => {
        console.error('[PluginManager] Plugin loading failed:', err);
        this.pluginsLoaded = true; // Mark as loaded even on error to unblock UI
        this.emit('pluginsLoaded');
      });
  }
  
  /**
   * Check if plugins have finished loading
   */
  arePluginsLoaded(): boolean {
    return this.pluginsLoaded;
  }

  /**
   * Scan plugins folder and dynamically load enabled plugins via plugin://  protocol
   */
  private async loadPluginsFromFolder(): Promise<void> {
    console.log('[PluginManager] Starting dynamic plugin load...');
    
    // FIRST: Ensure dev plugins are installed (in dev mode, this copies workspace plugins)
    // This is a no-op in production (packaged app)
    await window.quest.plugins.ensureDevInstalled();
    
    // THEN: Scan plugins via IPC (main process knows the path and enabled status)
    const discoveredPlugins: ScannedPlugin[] = await window.quest.plugins.scan();
    console.log(`[PluginManager] Discovered ${discoveredPlugins.length} plugins`);
    
    if (discoveredPlugins.length === 0) {
      console.warn('[PluginManager] No plugins found - did you build the plugins?');
      return;
    }

    // Load each enabled plugin
    for (const pkg of discoveredPlugins) {
      // Store scanned plugin info
      this.scannedPlugins.set(pkg.name, pkg);
      
      // Load if enabled (enabled status comes from scan)
      if (pkg.enabled) {
        try {
          await this.loadPluginDynamic(pkg);
          console.log(`[PluginManager] Loaded: ${pkg.name} v${pkg.version}`);
        } catch (err) {
          console.error(`[PluginManager] Failed to load ${pkg.name}:`, err);
        }
      } else {
        console.log(`[PluginManager] Skipping disabled: ${pkg.name}`);
      }
    }
    
    console.log(`[PluginManager] Loaded ${this.protocolPlugins.size} protocol plugins, ${this.authPlugins.size} auth plugins, ${this.importerPlugins.size} importer plugins`);
  }

  /**
   * Load a single plugin dynamically via plugin:// protocol
   */
  private async loadPluginDynamic(pkg: ScannedPlugin): Promise<void> {
    // Convert: @apiquest/plugin-http-ui -> http-ui
    const shortName = pkg.name.replace('@apiquest/plugin-', '').replace('/', '.');
    const pluginUrl = `plugin://${shortName}/${pkg.main}`;
    
    console.log(`[PluginManager] Loading from: ${pluginUrl}`);
    
    // Dynamic import via plugin:// protocol
    // @vite-ignore tells Vite to skip this
    const pluginModule = await import(/* @vite-ignore */ pluginUrl);
    
    if (!pluginModule.default) {
      throw new Error(`Plugin ${pkg.name} does not have default export`);
    }
    
    // Register based on type
    const type = pkg.metadata.type;
    
    if (type === 'protocol-ui') {
      const plugin = pluginModule.default;
      this.registerProtocolPlugin(plugin, pkg.name);
      this.protocolMetadata.set(plugin.protocol, pkg.metadata);
      console.log(`[PluginManager]   Protocol loaded: ${plugin.protocol} (package: ${pkg.name})`);
      
    } else if (type === 'auth-ui') {
      const plugins = Array.isArray(pluginModule.default) ? pluginModule.default : [pluginModule.default];
      
      plugins.forEach((authUI: IAuthPluginUI) => {
        this.registerAuthPlugin(authUI, pkg.name);
        this.authMetadata.set(authUI.type, pkg.metadata);
        console.log(`[PluginManager]   Auth loaded: ${authUI.type} (package: ${pkg.name})`);
      });

    } else if (type === 'importer-ui') {
      const plugins = Array.isArray(pluginModule.default) ? pluginModule.default : [pluginModule.default];

      plugins.forEach((importerUI: IImporterPluginUI) => {
        // Canonical importer key is npm package name (unique in npm registry, including scope).
        // No separate reverse-lookup needed — the key IS the package name already.
        this.registerImporterPlugin(pkg.name, importerUI);
        this.importerMetadata.set(pkg.name, pkg.metadata);
        console.log(`[PluginManager]   Importer loaded: ${pkg.name}`);
      });
      
    } else {
      console.warn(`[PluginManager] Unknown plugin type: ${type}`);
    }
  }

  /**
   * Enable or disable a plugin
   */
  async setPluginEnabled(packageName: string, enabled: boolean): Promise<void> {
    const settings = await settingsService.getAll();
    const plugins = settings.plugins || [];
    
    // Find existing or create new
    const existing = plugins.find(p => p.name === packageName);
    if (existing) {
      existing.enabled = enabled;
    } else {
      plugins.push({ name: packageName, enabled });
    }
    
    await settingsService.update({ plugins });
    
    console.log(`[PluginManager] Plugin ${packageName} ${enabled ? 'enabled' : 'disabled'}`);
    await this.reloadPlugins();
  }

  /**
   * Reload all plugins from scratch
   */
  async reloadPlugins(): Promise<void> {
    console.log('[PluginManager] Reloading all plugins...');
    this.protocolPlugins.clear();
    this.authPlugins.clear();
    this.importerPlugins.clear();
    this.scannedPlugins.clear();
    this.protocolPackageNames.clear();
    this.authPackageNames.clear();
    
    await this.loadPluginsFromFolder();
    this.emit('pluginsReloaded');
  }

  /**
   * Register a protocol plugin and record its npm package name for host bridge scoping.
   * packageName is the npm package name, e.g. '@apiquest/plugin-soap-ui'.
   */
  registerProtocolPlugin(plugin: IProtocolPluginUI, packageName: string): void {
    this.protocolPlugins.set(plugin.protocol, plugin);
    this.protocolPackageNames.set(plugin.protocol, packageName);
    this.emit('protocolPluginRegistered', plugin);
  }

  /**
   * Register an auth plugin and record its npm package name for host bridge scoping.
   * packageName is the npm package name, e.g. '@apiquest/plugin-auth-ui'.
   */
  registerAuthPlugin(plugin: IAuthPluginUI, packageName: string): void {
    this.authPlugins.set(plugin.type, plugin);
    this.authPackageNames.set(plugin.type, packageName);
    this.emit('authPluginRegistered', plugin);
  }

  /**
   * Register an importer plugin.
   * Canonical key is the npm package name — also the host bridge packageName.
   * The event payload includes the plugin and the packageName so PluginLoaderService
   * can build the correctly-scoped host bridge context on auto-setup.
   */
  registerImporterPlugin(packageName: string, plugin: IImporterPluginUI): void {
    this.importerPlugins.set(packageName, plugin);
    this.emit('importerPluginRegistered', plugin, packageName);
  }

  getProtocolPlugin(protocol: string): IProtocolPluginUI | undefined {
    return this.protocolPlugins.get(protocol);
  }

  getAuthPlugin(type: string): IAuthPluginUI | undefined {
    return this.authPlugins.get(type);
  }

  getAllProtocolPlugins(): IProtocolPluginUI[] {
    return Array.from(this.protocolPlugins.values());
  }

  getAllAuthPlugins(): IAuthPluginUI[] {
    return Array.from(this.authPlugins.values());
  }

  getImporterPlugin(id: string): IImporterPluginUI | undefined {
    return this.importerPlugins.get(id);
  }

  getAllImporterPlugins(): IImporterPluginUI[] {
    return Array.from(this.importerPlugins.values());
  }

  getAllImporterPluginEntries(): Array<{ packageName: string; plugin: IImporterPluginUI }> {
    return Array.from(this.importerPlugins.entries()).map(([packageName, plugin]) => ({ packageName, plugin }));
  }

  /**
   * Get all protocol plugins with their npm package names.
   * Used by PluginLoaderService to build a per-plugin host bridge context.
   */
  getAllProtocolPluginEntries(): Array<{ packageName: string; plugin: IProtocolPluginUI }> {
    return Array.from(this.protocolPlugins.entries()).map(([protocol, plugin]) => ({
      packageName: this.protocolPackageNames.get(protocol) ?? protocol,
      plugin
    }));
  }

  /**
   * Get all auth plugins with their npm package names.
   * Used by PluginLoaderService to build a per-plugin host bridge context.
   */
  getAllAuthPluginEntries(): Array<{ packageName: string; plugin: IAuthPluginUI }> {
    return Array.from(this.authPlugins.entries()).map(([type, plugin]) => ({
      packageName: this.authPackageNames.get(type) ?? type,
      plugin
    }));
  }

  /**
   * Resolve the npm package name for a protocol string.
   * Returns undefined if the protocol is not registered.
   */
  getPackageNameForProtocol(protocol: string): string | undefined {
    return this.protocolPackageNames.get(protocol);
  }

  /**
   * Resolve the npm package name for an auth type string.
   * Returns undefined if the auth type is not registered.
   */
  getPackageNameForAuthType(type: string): string | undefined {
    return this.authPackageNames.get(type);
  }

  /**
   * Persist plugin-specific settings under the existing settings.plugins[] list.
   * Canonical key is npm package name for parity with enable/disable settings.
   */
  async setPluginSettings(packageName: string, pluginSettings: Record<string, unknown> | undefined): Promise<void> {
    const settings = await settingsService.getAll();
    const plugins = settings.plugins || [];

    const existing = plugins.find(p => p.name === packageName);
    if (existing) {
      if (pluginSettings === undefined || Object.keys(pluginSettings).length === 0) {
        delete existing.settings;
      } else {
        existing.settings = pluginSettings;
      }
    } else {
      plugins.push({
        name: packageName,
        enabled: true,
        ...(pluginSettings !== undefined && Object.keys(pluginSettings).length > 0 ? { settings: pluginSettings } : {})
      });
    }

    await settingsService.update({ plugins });
  }

  async getPluginSettings(packageName: string): Promise<Record<string, unknown> | undefined> {
    const settings = await settingsService.getAll();
    const plugins = settings.plugins || [];
    const existing = plugins.find(p => p.name === packageName);
    return existing?.settings;
  }

  getAllVaultPlugins(): any[] {
    // Temporary hardcoded
    return [{
      name: 'file-vault',
      icon: 'file-vault',
      description: 'Store secrets in encrypted file'
    }];
  }

  /**
   * Get list of installed plugins with version info.
   * Uses scannedPlugins as the source of truth so all discovered plugins
   * (including disabled ones) appear in the Plugin Manager.
   */
  getInstalledPlugins(): InstalledPluginInfo[] {
    const plugins: InstalledPluginInfo[] = [];

    console.log(`[PluginManager] getInstalledPlugins: scannedPlugins has ${this.scannedPlugins.size} entries`);

    for (const [packageName, scanned] of this.scannedPlugins.entries()) {
      const type = scanned.metadata.type;
      // Use the npm package name as the display name
      const displayName = scanned.name || packageName;

      console.log(`[PluginManager]   Plugin: ${packageName} type=${type} enabled=${scanned.enabled} v${scanned.version}`);

      plugins.push({
        id: packageName,
        name: displayName,
        version: scanned.version,
        type,
        enabled: scanned.enabled,
        bundled: false
      });
    }

    console.log(`[PluginManager] getInstalledPlugins: returning ${plugins.length} plugins`);
    return plugins;
  }

  isProtocolSupported(protocol: string): boolean {
    return this.protocolPlugins.has(protocol);
  }

  isAuthTypeSupported(type: string): boolean {
    return this.authPlugins.has(type);
  }

  getSupportedProtocols(): string[] {
    return Array.from(this.protocolPlugins.keys());
  }

  getSupportedAuthTypes(): string[] {
    return Array.from(this.authPlugins.keys());
  }
  
  getProtocolMetadata(protocol: string): ApiquestMetadata | undefined {
    return this.protocolMetadata.get(protocol);
  }
  
  getAuthMetadata(type: string): ApiquestMetadata | undefined {
    return this.authMetadata.get(type);
  }

  getImporterMetadata(id: string): ApiquestMetadata | undefined {
    return this.importerMetadata.get(id);
  }
  
  /**
   * Get supported auth types for a specific protocol
   */
  getSupportedAuthTypesForProtocol(protocol: string): string[] {
    const metadata = this.protocolMetadata.get(protocol);
    if (!metadata?.capabilities?.supports?.authTypes) {
      return this.getSupportedAuthTypes();
    }
    
    const loadedAuthTypes = this.getSupportedAuthTypes();
    return metadata.capabilities.supports.authTypes.filter(
      authType => loadedAuthTypes.includes(authType)
    );
  }
}

// Singleton instance
export const pluginManagerService = new PluginManagerService();
