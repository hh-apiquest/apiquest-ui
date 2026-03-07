// Plugins IPC handlers
import { ipcMain, app } from 'electron';
import { readdir, readFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import path from 'path';
import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import type { ApiquestMetadata } from '@apiquest/plugin-ui-types';
import { registerPluginProtocol } from '../protocols/plugin-protocol.js';
import { settingsService } from '../SettingsService.js';
import { installWorkspacePlugins } from '../DevPluginInstaller.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Resolve the path to the bundled npm CLI script.
 *
 * When packaged with electron-builder the 'npm' package is included in the app's
 * node_modules (via the dependencies field in package.json). We use createRequire
 * to resolve it relative to this module so it works regardless of whether we are
 * in dev mode or packaged.
 *
 * The npm package exposes its CLI entry point at package root + '/bin/npm-cli.js'.
 */
function getBundledNpmCli(): string | null {
  try {
    // createRequire lets us use CommonJS-style resolution from an ESM context
    const require = createRequire(import.meta.url);
    // Resolve the npm package's package.json, then navigate to the CLI script
    const npmPkg = require.resolve('npm/package.json');
    return join(dirname(npmPkg), 'bin', 'npm-cli.js');
  } catch {
    return null;
  }
}

/**
 * Run an npm command using the bundled npm CLI script executed by Electron's own
 * Node.js binary (process.execPath). This removes any dependency on a system-installed
 * npm or Node.js.
 *
 * Falls back to system 'npm' if the bundled CLI cannot be found (e.g., in dev mode
 * before the package is installed).
 */
async function runNpm(args: string[], options: { maxBuffer?: number; cwd?: string } = {}): Promise<{ stdout: string; stderr: string }> {
  const bundledCli = getBundledNpmCli();

  if (bundledCli) {
    const npmEnv = {
      ...process.env,
      // Run Electron executable as a Node.js process, not as a desktop app.
      ELECTRON_RUN_AS_NODE: '1',
      // Packaged Electron rejects many NODE_OPTIONS values and can fail/noise.
      NODE_OPTIONS: '',
      // Prevent npm from trying to update itself.
      NPM_CONFIG_UPDATE_NOTIFIER: 'false',
      // Let npm know which CLI script is being executed.
      npm_execpath: bundledCli,
    };

    // Use Electron's Node.js to invoke the bundled npm CLI script
    return execFileAsync(process.execPath, [bundledCli, ...args], {
      maxBuffer: options.maxBuffer ?? 1024 * 1024 * 10,
      cwd: options.cwd,
      windowsHide: true,
      env: npmEnv,
    });
  }

  // Fallback: system npm
  console.warn('[PluginHandler] Bundled npm not found, falling back to system npm');
  return execAsync(['npm', ...args].join(' '), {
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 10,
    cwd: options.cwd,
  });
}

/**
 * Check whether git is available either at the path configured in settings or the system PATH.
 * Returns the version string on success, or null if not found.
 */
async function checkGitAvailable(): Promise<string | null> {
  // Read custom git path from settings (if configured)
  let gitBin = 'git';
  try {
    const settings = await settingsService.getAll();
    if (settings.tools?.gitPath?.trim()) {
      gitBin = settings.tools.gitPath.trim();
    }
  } catch {
    // Settings unavailable - fall back to PATH lookup
  }

  try {
    const { stdout } = await execAsync(`"${gitBin}" --version`);
    return stdout.trim().split('\n')[0] || 'unknown';
  } catch {
    return null;
  }
}

/**
 * Check bundled npm and system git availability, caching results after first probe.
 */
let cachedNpmVersion: string | null | undefined;
let cachedGitVersion: string | null | undefined;

async function ensureToolsAvailable(): Promise<{ npm: string | null; git: string | null }> {
  if (cachedNpmVersion === undefined) {
    const cli = getBundledNpmCli();
    if (cli) {
      try {
        const { stdout } = await execFileAsync(process.execPath, [cli, '--version'], {
          windowsHide: true,
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            NODE_OPTIONS: '',
            NPM_CONFIG_UPDATE_NOTIFIER: 'false',
            npm_execpath: cli,
          }
        });
        cachedNpmVersion = `npm/${stdout.trim()} (bundled)`;
      } catch {
        cachedNpmVersion = null;
      }
    } else {
      // Try system npm as last resort
      try {
        const { stdout } = await execAsync('npm --version');
        cachedNpmVersion = `npm/${stdout.trim()} (system)`;
      } catch {
        cachedNpmVersion = null;
      }
    }
    console.log(`[PluginHandler] npm: ${cachedNpmVersion ?? 'NOT FOUND'}`);
  }

  if (cachedGitVersion === undefined) {
    cachedGitVersion = await checkGitAvailable();
    console.log(`[PluginHandler] git: ${cachedGitVersion ?? 'NOT FOUND'}`);
  }

  return { npm: cachedNpmVersion, git: cachedGitVersion };
}

async function listApiquestPackagesInNodeModules(pluginsDir: string): Promise<string[]> {
  try {
    const scopeDir = join(pluginsDir, 'node_modules', '@apiquest');
    const entries = await readdir(scopeDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => `@apiquest/${entry.name}`)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function listRuntimePluginFolders(pluginsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(pluginsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('plugin-'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function packageJsonExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

async function promotePluginPackageToRuntimeFolder(pluginsDir: string, packageName: string): Promise<{ promoted: boolean; destination: string; reason?: string }> {
  const sourcePath = join(pluginsDir, 'node_modules', packageName);
  const shortName = packageName.split('/').pop() ?? packageName;
  const destination = join(pluginsDir, shortName);

  const sourcePackageJson = join(sourcePath, 'package.json');
  const sourceExists = await packageJsonExists(sourcePackageJson);
  if (!sourceExists) {
    return {
      promoted: false,
      destination,
      reason: `Package not found in node_modules: ${packageName}`,
    };
  }

  const { cpSync, existsSync, rmSync } = await import('fs');

  if (existsSync(destination)) {
    rmSync(destination, { recursive: true, force: true });
  }

  cpSync(sourcePath, destination, { recursive: true });
  return { promoted: true, destination };
}

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
   * Check whether required system tools (npm, git) are available.
   * Returns an object with the version strings or null for each tool.
   */
  ipcMain.handle('plugins:checkTools', async (): Promise<{ npm: string | null; git: string | null }> => {
    // Reset cache so the check is always fresh when explicitly requested
    cachedNpmVersion = undefined;
    cachedGitVersion = undefined;
    return ensureToolsAvailable();
  });

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
   * Install plugin from npm registry.
   * Returns { success: true } or { success: false, error: string }.
   */
  ipcMain.handle('plugins:install', async (_event, packageName: string): Promise<{ success: boolean; error?: string }> => {
    // Ensure npm is resolvable (bundled or system fallback)
    const tools = await ensureToolsAvailable();
    if (!tools.npm) {
      const msg = 'npm is not available. The bundled npm could not be loaded. Please reinstall ApiQuest or contact support.';
      console.error('[PluginHandler]', msg);
      return { success: false, error: msg };
    }

    try {
      const startedAt = Date.now();
      const resolvedNpmCli = getBundledNpmCli();

      console.log('[PluginHandler] Installing plugin:', packageName);
      console.log('[PluginHandler] Install context:', {
        packageName,
        pluginsDir,
        isPackaged: app.isPackaged,
        platform: process.platform,
        arch: process.arch,
        npmMode: resolvedNpmCli ? 'bundled-cli' : 'system-npm-fallback',
        npmCliPath: resolvedNpmCli
      });
      
      // Ensure plugins directory exists
      await mkdir(pluginsDir, { recursive: true });

      const beforeNodeModules = await listApiquestPackagesInNodeModules(pluginsDir);
      const beforeRuntimeFolders = await listRuntimePluginFolders(pluginsDir);
      console.log('[PluginHandler] Install pre-state:', {
        beforeNodeModules,
        beforeRuntimeFolders
      });
      
      // Use bundled npm (via Electron's Node.js) to install the package
      const { stdout, stderr } = await runNpm(
        ['install', packageName, '--prefix', pluginsDir, '--no-save', '--legacy-peer-deps'],
        { maxBuffer: 1024 * 1024 * 10 }
      );

      console.log('[PluginHandler] npm install completed:', {
        packageName,
        durationMs: Date.now() - startedAt,
        stdoutLength: stdout?.length ?? 0,
        stderrLength: stderr?.length ?? 0
      });
      
      if (stderr && !stderr.includes('npm WARN')) {
        console.error('[PluginHandler] Install stderr:', stderr);
      }
      
      console.log('[PluginHandler] Install stdout:', stdout);
      
      // Verify installation by checking if package.json exists
      const packageNameParts = packageName.split('/');
      const shortName = packageNameParts[packageNameParts.length - 1];
      const packagePath = join(pluginsDir, 'node_modules', packageName, 'package.json');
      
      try {
        const installedPackageJson = await readFile(packagePath, 'utf-8');
        const installedPackage = JSON.parse(installedPackageJson) as {
          name?: string;
          version?: string;
          dependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
        };

        const pluginDependencies = Object.keys(installedPackage.dependencies ?? {})
          .filter((dep) => dep.startsWith('@apiquest/plugin-'))
          .sort((a, b) => a.localeCompare(b));

        const pluginPeerDependencies = Object.keys(installedPackage.peerDependencies ?? {})
          .filter((dep) => dep.startsWith('@apiquest/plugin-'))
          .sort((a, b) => a.localeCompare(b));

        console.log('[PluginHandler] Plugin installed successfully:', packageName);
        console.log('[PluginHandler] Installed package metadata:', {
          name: installedPackage.name,
          version: installedPackage.version,
          pluginDependencies,
          pluginPeerDependencies
        });
        
        const promotedPackages: Array<{ packageName: string; destination: string }> = [];
        const failedPromotions: Array<{ packageName: string; reason: string }> = [];

        const rootPromotion = await promotePluginPackageToRuntimeFolder(pluginsDir, packageName);
        if (rootPromotion.promoted) {
          promotedPackages.push({ packageName, destination: rootPromotion.destination });
          console.log('[PluginHandler] Plugin copied to:', rootPromotion.destination);
        } else {
          failedPromotions.push({ packageName, reason: rootPromotion.reason ?? 'Unknown promotion error' });
        }

        // Promote direct @apiquest/plugin-* dependencies (fracture/runtime plugins) into
        // runtime plugin folders so request execution works in packaged app without dev installer.
        for (const dependencyName of pluginDependencies) {
          const dependencyPromotion = await promotePluginPackageToRuntimeFolder(pluginsDir, dependencyName);
          if (dependencyPromotion.promoted) {
            promotedPackages.push({ packageName: dependencyName, destination: dependencyPromotion.destination });
          } else {
            failedPromotions.push({
              packageName: dependencyName,
              reason: dependencyPromotion.reason ?? 'Unknown promotion error',
            });
          }
        }

        if (failedPromotions.length > 0) {
          console.warn('[PluginHandler] Some plugin packages were not promoted to runtime folders:', failedPromotions);
        }

        const dependencyVisibility = await Promise.all(
          pluginDependencies.map(async (dependencyName) => {
            const dependencyNodeModulesPkg = join(pluginsDir, 'node_modules', dependencyName, 'package.json');
            const dependencyRuntimePkg = join(pluginsDir, dependencyName.split('/').pop() ?? dependencyName, 'package.json');

            return {
              dependencyName,
              inNodeModules: await packageJsonExists(dependencyNodeModulesPkg),
              inRuntimePluginsDir: await packageJsonExists(dependencyRuntimePkg)
            };
          })
        );

        const afterNodeModules = await listApiquestPackagesInNodeModules(pluginsDir);
        const afterRuntimeFolders = await listRuntimePluginFolders(pluginsDir);
        console.log('[PluginHandler] Install post-state:', {
          packageName,
          promotedPackages,
          failedPromotions,
          dependencyVisibility,
          afterNodeModules,
          afterRuntimeFolders
        });

        // Enable plugin in settings (marks it as explicitly enabled so dev installer includes it)
        try {
          const settings = await settingsService.getAll();
          const plugins = Array.isArray(settings.plugins) ? settings.plugins : [];
          const existing = plugins.find(p => p.name === packageName);
          if (existing) {
            existing.enabled = true;
          } else {
            plugins.push({ name: packageName, enabled: true });
          }
          await settingsService.update({ plugins });
          console.log('[PluginHandler] Plugin enabled in settings:', packageName);
        } catch (settingsErr: any) {
          console.warn('[PluginHandler] Could not update settings after install:', settingsErr.message || settingsErr);
        }

        return { success: true };
      } catch (verifyErr: any) {
        console.error('[PluginHandler] Plugin verification failed:', verifyErr);
        return { success: false, error: verifyErr?.message || 'Plugin verification failed after installation.' };
      }
    } catch (err: any) {
      console.error('[PluginHandler] Failed to install plugin:', err.message || err);
      return { success: false, error: err?.message || 'Installation failed.' };
    }
  });

  /**
   * Remove/uninstall plugin.
   * Also disables the plugin in settings so dev-mode reinstallation does not restore it.
   */
  ipcMain.handle('plugins:remove', async (_event, pluginName: string): Promise<boolean> => {
    try {
      console.log('[PluginHandler] Removing plugin:', pluginName);

      // Extract short name from package name e.g. @apiquest/plugin-http-ui -> plugin-http-ui
      const packageNameParts = pluginName.split('/');
      const shortName = packageNameParts[packageNameParts.length - 1];
      const pluginPath = join(pluginsDir, shortName);

      const { existsSync, rmSync } = await import('fs');

      if (existsSync(pluginPath)) {
        rmSync(pluginPath, { recursive: true, force: true });
        console.log('[PluginHandler] Plugin files removed:', pluginPath);
      } else {
        console.warn('[PluginHandler] Plugin folder not found:', pluginPath);
      }

      // Persist as disabled in settings so dev-mode reinstaller skips it
      try {
        const settings = await settingsService.getAll();
        const plugins = Array.isArray(settings.plugins) ? settings.plugins : [];
        const existing = plugins.find(p => p.name === pluginName);
        if (existing) {
          existing.enabled = false;
        } else {
          plugins.push({ name: pluginName, enabled: false });
        }
        await settingsService.update({ plugins });
        console.log('[PluginHandler] Plugin marked as disabled in settings:', pluginName);
      } catch (settingsErr: any) {
        console.error('[PluginHandler] Failed to update settings after remove:', settingsErr.message || settingsErr);
      }

      return true;
    } catch (err: any) {
      console.error('[PluginHandler] Failed to remove plugin:', err.message || err);
      return false;
    }
  });
  
  /**
   * Search npmjs marketplace for @apiquest/* desktop plugins.
   * Uses the bundled npm CLI for search (finds all packages including newly published ones)
   * then fetches full metadata via npm view to get the apiquest field.
   */
  ipcMain.handle('plugins:searchMarketplace', async (
    _event,
    query: string,
    type?: ApiquestMetadata['type'] | 'all'
  ): Promise<any[]> => {
    // Ensure bundled npm is available
    const tools = await ensureToolsAvailable();
    if (!tools.npm) {
      console.warn('[PluginHandler] Marketplace search skipped: npm not available.');
      return [];
    }

    try {
      // Build search query: '@apiquest' finds all packages in the @apiquest scope
      // including newly published ones not yet indexed by the registry REST search API.
      // Using the scope prefix is more precise than 'apiquest' alone.
      const searchArgs = query
        ? ['search', `@apiquest ${query}`, '--json']
        : ['search', '@apiquest', '--json'];
      console.log('[PluginHandler] npm search:', searchArgs.join(' '));

      const { stdout } = await runNpm(searchArgs, { maxBuffer: 1024 * 1024 * 10 });

      let searchResults: any[];
      try {
        searchResults = JSON.parse(stdout);
      } catch {
        console.error('[PluginHandler] Failed to parse npm search output');
        return [];
      }

      // Filter to @apiquest/plugin-* packages only
      const pluginNames: string[] = searchResults
        .map((r: any) => r.name as string)
        .filter((name: string) => typeof name === 'string' && name.startsWith('@apiquest/plugin-'));

      console.log(`[PluginHandler] Found ${pluginNames.length} @apiquest/plugin-* packages: ${pluginNames.join(', ')}`);

      if (pluginNames.length === 0) return [];

      // Fetch full metadata for each found package using npm view
      const plugins: any[] = [];

      await Promise.all(pluginNames.map(async (name: string) => {
        try {
          console.log(`[PluginHandler]   npm view ${name}`);
          const { stdout: viewOut } = await runNpm(
            ['view', name, '--json'],
            { maxBuffer: 1024 * 1024 * 2 }
          );

          const pkgData = JSON.parse(viewOut);
          const metadata: ApiquestMetadata | undefined = pkgData.apiquest;

          if (!metadata) {
            console.log(`[PluginHandler]   ${name}: no apiquest metadata - skipping`);
            return;
          }

          // Only show desktop runtime plugins
          const runtime = metadata.runtime;
          const isDesktop = Array.isArray(runtime) ? runtime.includes('desktop') : runtime === 'desktop';
          if (!isDesktop) {
            console.log(`[PluginHandler]   ${name}@${pkgData.version}: runtime=${JSON.stringify(runtime)} - not desktop, skipping`);
            return;
          }

          // Filter by type if specified
          if (type && type !== 'all' && metadata.type !== type) {
            console.log(`[PluginHandler]   ${name}@${pkgData.version}: type=${metadata.type} - filtered out (wanted ${type})`);
            return;
          }

          console.log(`[PluginHandler]   ${name}@${pkgData.version}: accepted (type=${metadata.type})`);
          plugins.push({
            name: pkgData.name,
            version: pkgData.version,
            description: pkgData.description,
            apiquest: metadata,
            author: typeof pkgData.author === 'string' ? pkgData.author : pkgData.author?.name,
            repository: typeof pkgData.repository === 'string' ? pkgData.repository : pkgData.repository?.url,
            homepage: pkgData.homepage,
          });
        } catch (viewErr: any) {
          console.error(`[PluginHandler]   Failed to fetch metadata for ${name}:`, viewErr.message || viewErr);
        }
      }));

      plugins.sort((a, b) => a.name.localeCompare(b.name));
      console.log(`[PluginHandler] Marketplace search complete: ${plugins.length} desktop plugins returned`);
      return plugins;
    } catch (err: any) {
      console.error('[PluginHandler] Marketplace search failed:', err.message || err);
      return [];
    }
  });
}
