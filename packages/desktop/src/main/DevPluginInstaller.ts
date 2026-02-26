/**
 * Dev Plugin Installer
 * 
 * In development mode, automatically copies workspace plugins to appData/plugins
 * so they can be loaded via the plugin:// protocol just like in production.
 */

import { app } from 'electron';
import { copyFile, mkdir, readdir, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * List of workspace plugins to install in dev mode
 * These will be copied from monorepo packages/ directory to appData/plugins/
 */
const WORKSPACE_UI_PLUGINS = [
  // UI plugins (desktop runtime)
  '@apiquest/plugin-http-ui',
  '@apiquest/plugin-auth-ui',
  '@apiquest/plugin-sse-ui'
];

const WORKSPACE_CORE_PLUGINS = [
  // Execution plugins (fracture runtime)
  '@apiquest/plugin-http',
  '@apiquest/plugin-auth',

  // Vault plugins (fracture runtime)
  '@apiquest/plugin-vault-file'
];

/**
 * Installs workspace plugins to appData/plugins in dev mode
 * Only runs if app is not packaged (development mode)
 */
export async function installWorkspacePlugins(): Promise<void> {
  if (app.isPackaged) {
    console.log('[DevInstaller] Skipping - app is packaged (production mode)');
    return;
  }

  console.log('[DevInstaller] Starting workspace plugin installation...');
  
  const pluginsDir = path.join(app.getPath('userData'), 'plugins');
  await mkdir(pluginsDir, { recursive: true });
  
  console.log(`[DevInstaller] Target directory: ${pluginsDir}`);

  for (const pluginName of WORKSPACE_UI_PLUGINS) {
    try {
      // Convert @apiquest/plugin-http-ui -> plugin-http-ui
      const folderName = pluginName.replace('@apiquest/', '');
      
      // Source: packages/plugin-http-ui/
      const sourcePath = path.resolve(__dirname, '../../../', folderName);
      
      // Destination: appData/plugins/plugin-http-ui/
      const destPath = path.join(pluginsDir, folderName);
      
      console.log(`[DevInstaller] Installing ${pluginName}...`);
      console.log(`[DevInstaller]   Source: ${sourcePath}`);
      console.log(`[DevInstaller]   Dest:   ${destPath}`);
      
      // Create destination directory
      await mkdir(destPath, { recursive: true });
      
      // Always copy package.json (metadata might have changed)
      await copyFile(
        path.join(sourcePath, 'package.json'),
        path.join(destPath, 'package.json')
      );
      
      // Copy dist/ folder recursively
      const distSource = path.join(sourcePath, 'dist');
      const distDest = path.join(destPath, 'dist');
      
      try {
        await copyRecursive(distSource, distDest);
        console.log(`[DevInstaller] Installed: ${pluginName}`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.warn(`[DevInstaller] Warning: ${pluginName} has no dist/ folder - run build first`);
        } else {
          throw error;
        }
      }
      
    } catch (error: any) {
      console.error(`[DevInstaller] Failed to install ${pluginName}:`, error.message);
      // Continue with other plugins
    }
  }

  for (const pluginName of WORKSPACE_CORE_PLUGINS) {
    try {
      const folderName = pluginName.replace('@apiquest/', '');
      const sourcePath = path.resolve(__dirname, '../../../../../fracture/packages', folderName);
      const destPath = path.join(pluginsDir, folderName);

      console.log(`[DevInstaller] Installing ${pluginName}...`);
      console.log(`[DevInstaller]   Source: ${sourcePath}`);
      console.log(`[DevInstaller]   Dest:   ${destPath}`);

      await mkdir(destPath, { recursive: true });

      await copyFile(
        path.join(sourcePath, 'package.json'),
        path.join(destPath, 'package.json')
      );

      const distSource = path.join(sourcePath, 'dist');
      const distDest = path.join(destPath, 'dist');

      try {
        await copyRecursive(distSource, distDest);
        console.log(`[DevInstaller] Installed: ${pluginName}`);
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          console.warn(`[DevInstaller] Warning: ${pluginName} has no dist/ folder - run build first`);
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      console.error(`[DevInstaller] Failed to install ${pluginName}:`, error.message);
    }
  }
  
  console.log('[DevInstaller] Plugin installation complete');
}

/**
 * Recursively copy a directory
 */
async function copyRecursive(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  
  const entries = await readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}
