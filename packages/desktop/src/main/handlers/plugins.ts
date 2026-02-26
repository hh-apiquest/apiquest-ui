// Plugins IPC handlers
import { ipcMain, app } from 'electron';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ApiquestMetadata } from '@apiquest/plugin-ui-types';
import { registerPluginProtocol } from '../protocols/plugin-protocol.js';
import { settingsService } from '../SettingsService.js';
import { installWorkspacePlugins } from '../DevPluginInstaller.js';

const execAsync = promisify(exec);

export interface ScannedPlugin {
  name: string;
  version: string;
  main: string; // Entry point from package.json
  metadata: ApiquestMetadata;
  enabled: boolean; // Resolved from settings
}

export function registerPluginsHandlers() {
  // Register the plugin:// protocol handler
  const pluginsDir = path.join(app.getPath('userData'), 'plugins');
  registerPluginProtocol(pluginsDir);
  
  /**
   * Ensure dev plugins are installed (in dev mode)
   * This must be called before scanning/loading plugins
   */
  ipcMain.handle('plugins:ensureDevInstalled', async (): Promise<void> => {
    console.log('[PluginHandler] Ensuring dev plugins are installed...');
    await installWorkspacePlugins();
    console.log('[PluginHandler] Dev plugin installation complete');
  });
  
  /**
   * Scan the plugins folder for ApiQuest plugins
   * Reads package.json files and returns plugins with "apiquest" metadata and enabled status
   */
  ipcMain.handle('plugins:scan', async (): Promise<ScannedPlugin[]> => {
    const plugins: ScannedPlugin[] = [];
    
    try {
      // Get settings to check enabled status
      const settings = await settingsService.getAll();
      const pluginSettings = Array.isArray(settings.plugins) ? settings.plugins : [];
      
      console.log('[PluginHandler] Scanning folder:', pluginsDir);
      const entries = await readdir(pluginsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        // Only scan directories that start with 'plugin-'
        if (entry.isDirectory() && entry.name.startsWith('plugin-')) {
          const packageJsonPath = join(pluginsDir, entry.name, 'package.json');
          
          try {
            const content = await readFile(packageJsonPath, 'utf-8');
            const pkg = JSON.parse(content);
            
            // Check if it has apiquest metadata and is a desktop plugin
            if (pkg.apiquest && pkg.apiquest.runtime?.includes('desktop')) {
              // Check enabled status from settings (default to true if not found)
              const setting = pluginSettings.find(p => p.name === pkg.name);
              const enabled = setting ? setting.enabled : true;
              
              plugins.push({
                name: pkg.name,
                version: pkg.version || '0.0.0',
                main: pkg.main,
                metadata: pkg.apiquest,
                enabled
              });
              console.log(`[PluginHandler] Found plugin: ${pkg.name} (${pkg.apiquest.type}) - ${enabled ? 'enabled' : 'disabled'}`);
            } else if (pkg.apiquest) {
              console.log(`[PluginHandler] Skipping ${pkg.name} - not a desktop plugin (runtime: ${pkg.apiquest.runtime})`);
            }
          } catch (err: any) {
            // Skip if package.json doesn't exist or is invalid
            console.log(`[PluginHandler] Error reading ${entry.name}/package.json:`, err.message || err.code);
            continue;
          }
        }
      }
      
      console.log(`[PluginHandler] Scan complete: ${plugins.length} desktop plugins found`);
    } catch (err) {
      console.error('[PluginHandler] Failed to scan plugins folder:', err);
    }
    
    return plugins;
  });

  /**
   * Install plugin from npm registry
   */
  ipcMain.handle('plugins:install', async (_event, packageName: string): Promise<boolean> => {
    try {
      console.log('[PluginHandler] Installing plugin:', packageName);
      
      // Ensure plugins directory exists
      await mkdir(pluginsDir, { recursive: true });
      
      // Use npm to install the package
      const { stdout, stderr } = await execAsync(
        `npm install ${packageName} --prefix "${pluginsDir}" --no-save --legacy-peer-deps`,
        { maxBuffer: 1024 * 1024 * 10 } // 10MB buffer
      );
      
      if (stderr && !stderr.includes('npm WARN')) {
        console.error('[PluginHandler] Install stderr:', stderr);
      }
      
      console.log('[PluginHandler] Install stdout:', stdout);
      
      // Verify installation by checking if package.json exists
      const packageNameParts = packageName.split('/');
      const shortName = packageNameParts[packageNameParts.length - 1];
      const packagePath = join(pluginsDir, 'node_modules', packageName, 'package.json');
      
      try {
        await readFile(packagePath, 'utf-8');
        console.log('[PluginHandler] Plugin installed successfully:', packageName);
        
        // Move plugin from node_modules to plugins directory
        const sourcePath = join(pluginsDir, 'node_modules', packageName);
        const destPath = join(pluginsDir, shortName);
        
        // Use npm to copy (instead of move to preserve node_modules)
        const { copyFileSync, cpSync, existsSync, rmSync } = await import('fs');
        const { join: pathJoin } = await import('path');
        
        // Remove destination if exists
        if (existsSync(destPath)) {
          rmSync(destPath, { recursive: true, force: true });
        }
        
        // Copy plugin files
        cpSync(sourcePath, destPath, { recursive: true });
        
        console.log('[PluginHandler] Plugin copied to:', destPath);
        return true;
      } catch (verifyErr) {
        console.error('[PluginHandler] Plugin verification failed:', verifyErr);
        return false;
      }
    } catch (err: any) {
      console.error('[PluginHandler] Failed to install plugin:', err.message || err);
      return false;
    }
  });

  /**
   * Remove/uninstall plugin
   */
  ipcMain.handle('plugins:remove', async (_event, pluginName: string): Promise<boolean> => {
    try {
      console.log('[PluginHandler] Removing plugin:', pluginName);
      
      // Extract short name from package name
      const packageNameParts = pluginName.split('/');
      const shortName = packageNameParts[packageNameParts.length - 1];
      const pluginPath = join(pluginsDir, shortName);
      
      const { existsSync, rmSync } = await import('fs');
      
      if (existsSync(pluginPath)) {
        rmSync(pluginPath, { recursive: true, force: true });
        console.log('[PluginHandler] Plugin removed:', pluginName);
        return true;
      } else {
        console.warn('[PluginHandler] Plugin not found:', pluginPath);
        return false;
      }
    } catch (err: any) {
      console.error('[PluginHandler] Failed to remove plugin:', err.message || err);
      return false;
    }
  });
  
  /**
   * Search npmjs marketplace for @apiquest/* plugins
   */
  ipcMain.handle('plugins:searchMarketplace', async (
    _event,
    query: string,
    type?: ApiquestMetadata['type'] | 'all'
  ): Promise<any[]> => {
    try {
      console.log('[PluginHandler] Searching marketplace:', query, type);
      
      // Build search query - always search @apiquest/* scope
      const searchQuery = query ? `@apiquest/${query}` : '@apiquest/plugin';
      
      // Use npm search API to get package names
      const { stdout } = await execAsync(
        `npm search ${searchQuery} --json`,
        { maxBuffer: 1024 * 1024 * 10 } // 10MB buffer
      );
      
      const searchResults = JSON.parse(stdout);
      
      // Fetch full package.json for each result to get apiquest metadata
      const plugins: any[] = [];
      
      for (const pkg of searchResults) {
        if (!pkg.name.startsWith('@apiquest/')) continue;
        
        try {
          // Fetch full package.json from npm registry
          const { stdout: pkgJson } = await execAsync(
            `npm view ${pkg.name} --json`,
            { maxBuffer: 1024 * 1024* 2 } // 2MB buffer
          );
          
          const pkgData = JSON.parse(pkgJson);
          const metadata: ApiquestMetadata | undefined = pkgData.apiquest;
          
          // Skip if no apiquest metadata
          if (!metadata) continue;
          
          // Only show desktop plugins
          if (!metadata.runtime?.includes('desktop')) {
            continue;
          }
          
          // Filter by type if specified
          if (type && type !== 'all' && metadata.type !== type) {
            continue;
          }
          
          plugins.push({
            name: pkgData.name,
            version: pkgData.version,
            description: pkgData.description,
            apiquest: metadata,
            author: pkgData.author?.name || pkg.publisher?.username,
            repository: pkgData.repository?.url || pkg.links?.repository,
            homepage: pkgData.homepage || pkg.links?.homepage,
          });
        } catch (viewErr) {
          console.error(`[PluginHandler] Failed to fetch metadata for ${pkg.name}:`, viewErr);
          continue;
        }
      }
      
      console.log(`[PluginHandler] Found ${plugins.length} plugins with metadata`);
      return plugins;
    } catch (err: any) {
      console.error('[PluginHandler] Marketplace search failed:', err.message || err);
      return [];
    }
  });
}
