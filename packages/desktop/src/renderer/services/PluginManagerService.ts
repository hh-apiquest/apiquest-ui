// PluginManagerService - Manages UI plugins with dynamic loading via plugin:// protocol

import type { 
  IProtocolPluginUI,
  IAuthPluginUI,
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
  private scannedPlugins: Map<string, ScannedPlugin> = new Map();
  private protocolMetadata: Map<string, ApiquestMetadata> = new Map();
  private authMetadata: Map<string, ApiquestMetadata> = new Map();
  private pluginsLoaded: boolean = false;

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
    
    console.log(`[PluginManager] Loaded ${this.protocolPlugins.size} protocol plugins, ${this.authPlugins.size} auth plugins`);
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
      this.registerProtocolPlugin(plugin);
      this.protocolMetadata.set(plugin.protocol, pkg.metadata);
      console.log(`[PluginManager]   Protocol loaded: ${plugin.protocol}`);
      
    } else if (type === 'auth-ui') {
      const plugins = Array.isArray(pluginModule.default) ? pluginModule.default : [pluginModule.default];
      
      plugins.forEach((authUI: IAuthPluginUI) => {
        this.registerAuthPlugin(authUI);
        this.authMetadata.set(authUI.type, pkg.metadata);
        console.log(`[PluginManager]   Auth loaded: ${authUI.type}`);
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
    this.scannedPlugins.clear();
    
    await this.loadPluginsFromFolder();
    this.emit('pluginsReloaded');
  }

  registerProtocolPlugin(plugin: IProtocolPluginUI): void {
    this.protocolPlugins.set(plugin.protocol, plugin);
    this.emit('protocolPluginRegistered', plugin);
  }

  registerAuthPlugin(plugin: IAuthPluginUI): void {
    this.authPlugins.set(plugin.type, plugin);
    this.emit('authPluginRegistered', plugin);
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

  getAllVaultPlugins(): any[] {
    // Temporary hardcoded
    return [{
      name: 'file-vault',
      icon: 'file-vault',
      description: 'Store secrets in encrypted file'
    }];
  }

  /**
   * Get list of installed plugins with version info
   */
  getInstalledPlugins(): InstalledPluginInfo[] {
    const plugins: InstalledPluginInfo[] = [];
    const addedPackages = new Set<string>();

    // Protocol plugins
    for (const [protocol, plugin] of this.protocolPlugins.entries()) {
      const packageName = `@apiquest/plugin-${protocol}-ui`;
      
      if (addedPackages.has(packageName)) continue;
      addedPackages.add(packageName);
      
      const scanned = this.scannedPlugins.get(packageName);
      
      plugins.push({
        id: packageName,
        name: `${protocol.toUpperCase()} Plugin`,
        version: scanned?.version || '1.0.0',
        type: 'protocol',
        protocol,
        enabled: scanned?.enabled ?? true,
        bundled: false
      });
    }

    // Auth plugins - one row per package (auth plugin can export multiple auth types)
    const authPackages = new Set<string>();
    for (const [type, plugin] of this.authPlugins.entries()) {
      const packageName = `@apiquest/plugin-auth-ui`;
      authPackages.add(packageName);
    }
    
    for (const packageName of authPackages) {
      if (addedPackages.has(packageName)) continue;
      addedPackages.add(packageName);
      
      const scanned = this.scannedPlugins.get(packageName);
      const authTypes = this.getSupportedAuthTypes();
      
      plugins.push({
        id: packageName,
        name: `Auth Plugin (${authTypes.join(', ')})`,
        version: scanned?.version || '1.0.0',
        type: 'auth',
        enabled: scanned?.enabled ?? true,
        bundled: false
      });
    }

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
