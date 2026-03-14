// Workspace IPC handlers
import { ipcMain, dialog } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { workspaceManager } from '../WorkspaceManager.js';
import { walkDirectory } from '../utils/fileSystem.js';
import { dispatchPluginHostInvoke, grantPath } from './host.js';

// Workspace registry: maps workspace ID (GUID) to filesystem path
export const workspaceRegistry = new Map<string, string>();

// Collection registry: maps collection ID to fileName (path is workspacePath/collections/fileName)
export const collectionRegistry = new Map<string, string>();

export function registerWorkspaceHandlers() {
  // Workspace management
  ipcMain.handle('workspace:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('workspace:scan', async (event, folderPath: string) => {
    const collections = [];
    const environments = [];
    
    // Get or create workspace metadata
    let metadata = await workspaceManager.getMetadata(folderPath);
    if (!metadata) {
      metadata = {
        id: crypto.randomUUID(),
        name: path.basename(folderPath),
        createdAt: new Date().toISOString()
      };
      const metadataPath = path.join(folderPath, 'workspace.json');
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    }
    
    // Register workspace in runtime registry
    workspaceRegistry.set(metadata.id, folderPath);
    
    // Scan for .apiquest.json files
    const files = await walkDirectory(folderPath, '.apiquest.json');
    // Track seen collection IDs to detect duplicates from copied files
    const seenCollectionIds = new Set<string>();
    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);
        const fileName = path.basename(filePath);
        
        // Read collection to get id and name
        let collectionId = '';
        let collectionName = fileName.replace('.apiquest.json', '');
        let collectionVersion = '1.0.0';
        let collectionDescription = '';
        let collectionData: any = null;
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          collectionData = JSON.parse(content);
          if (collectionData.info) {
            collectionId = collectionData.info.id || '';
            collectionName = collectionData.info.name || collectionName;
            collectionVersion = collectionData.info.version || '';
            collectionDescription = collectionData.info.description || '';
          }
        } catch (readErr) {
          console.error(`Failed to read collection ${fileName}:`, readErr);
        }

        // Detect and fix duplicate collection IDs: a copied file will have the same ID as the original.
        // Assign a new UUID to the duplicate and persist it so the file is self-consistent.
        if (collectionId && seenCollectionIds.has(collectionId)) {
          const newId = crypto.randomUUID();
          console.warn(`Duplicate collection ID detected in ${fileName} (id: ${collectionId}). Assigning new ID: ${newId}`);
          collectionId = newId;
          if (collectionData && collectionData.info) {
            collectionData.info.id = newId;
            try {
              await fs.writeFile(filePath, JSON.stringify(collectionData, null, 2), 'utf-8');
            } catch (writeErr) {
              console.error(`Failed to persist new collection ID for ${fileName}:`, writeErr);
            }
          }
        }

        if (collectionId) {
          seenCollectionIds.add(collectionId);
        }
        
        // Register collection in runtime registry
        if (collectionId) {
          collectionRegistry.set(collectionId, fileName);
        }
        
        collections.push({
          id: collectionId,
          name: collectionName,
          version: collectionVersion,
          description: collectionDescription,
          lastModified: stat.mtime,
          isStarred: false,
          openTabs: [],
          expandedFolders: []
        });
      } catch (err) {
        console.error(`Failed to stat: ${filePath}`, err);
      }
    }
    
    // Scan for environments
    const envFolder = path.join(folderPath, 'environments');
    try {
      const envFiles = await fs.readdir(envFolder);
      for (const file of envFiles) {
        if (file.endsWith('.json')) {
          const fileName = file.replace('.json', '');
          const filePath = path.join(envFolder, file);
          const stat = await fs.stat(filePath);
          environments.push({
            id: fileName,
            name: fileName,
            fileName,
            lastModified: stat.mtime,
            isActive: false
          });
        }
      }
    } catch (err) {
      // No environments folder
    }
    
    return {
      id: metadata.id,
      path: folderPath,
      name: metadata.name,
      collections,
      environments
    };
  });

  ipcMain.handle('workspace:getDefaultPath', async () => {
    return workspaceManager.getDefaultWorkspacePath();
  });

  ipcMain.handle('workspace:listAll', async () => {
    return await workspaceManager.listWorkspaces();
  });

  ipcMain.handle('workspace:create', async (_event, name: string, customPath?: string) => {
    let workspacePath: string;
    
    if (customPath) {
      workspacePath = path.join(customPath, name);
    } else {
      const workspacesRoot = workspaceManager.getWorkspacesRootPath();
      workspacePath = path.join(workspacesRoot, name);
    }
    
    await workspaceManager.createWorkspace(workspacePath, name);
    return workspacePath;
  });

  ipcMain.handle('workspace:getMetadata', async (_event, workspacePath: string) => {
    return await workspaceManager.getMetadata(workspacePath);
  });

  ipcMain.handle('workspace:updateMetadata', async (_event, workspacePath: string, updates: any) => {
    await workspaceManager.updateMetadata(workspacePath, updates);
  });

  ipcMain.handle('workspace:listWithMetadata', async () => {
    return await workspaceManager.listWorkspacesWithMetadata();
  });

  /**
   * Import a collection using an installed importer plugin.
   *
   * Params:
   *   workspaceId         — target workspace
   *   pluginPackageName   — npm package name of the importer plugin (e.g. '@apiquest/plugin-importer-ui')
   *   format              — format string (e.g. 'postman-v2.1')
   *   fileExtensions      — allowed file extensions for the dialog (e.g. ['.json'])
   *   sourceKind          — 'file' or 'directory'
   *
   * Returns ImportCollectionResult or null if the user cancelled.
   */
  ipcMain.handle(
    'workspace:importCollection',
    async (
      _event,
      workspaceId: string,
      params?: {
        pluginPackageName: string;
        format: string;
        fileExtensions: string[];
        sourceKind: 'file' | 'directory';
      }
    ): Promise<{
      success: boolean;
      fileName?: string;
      collectionId?: string;
      pluginPackageName?: string;
      format?: string;
      warnings?: string[];
      errors?: string[];
    } | null> => {
      const workspacePath = workspaceRegistry.get(workspaceId);
      if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);

      // Fallback: legacy copy-only mode when no plugin params provided
      if (!params) {
        const importPath = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'ApiQuest Collections', extensions: ['apiquest.json', 'json'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        });
        if (importPath.canceled || !importPath.filePaths[0]) return null;
        const sourceFile = importPath.filePaths[0];
        const collectionsDir = path.join(workspacePath, 'collections');
        await fs.mkdir(collectionsDir, { recursive: true });
        const fileName = path.basename(sourceFile);
        const targetFile = path.join(collectionsDir, fileName);
        await fs.copyFile(sourceFile, targetFile);
        return { success: true, fileName };
      }

      const { pluginPackageName, format, fileExtensions, sourceKind } = params;

      // Step 1: Show dialog and get source path
      const isDirectory = sourceKind === 'directory';
      const dialogResult = await dialog.showOpenDialog({
        title: `Import ${format}`,
        properties: isDirectory ? ['openDirectory'] : ['openFile'],
        filters: isDirectory ? undefined : [
          {
            name: format,
            extensions: fileExtensions.map(e => e.replace('.', ''))
          },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (dialogResult.canceled || dialogResult.filePaths.length === 0) return null;

      const sourcePath = dialogResult.filePaths[0];

      // Step 2: Grant the path to the plugin (same as showOpenDialog via IPC would do)
      grantPath(pluginPackageName, sourcePath);

      // Step 3: Read the source file (directory reads are handled inside the plugin)
      let sourceData: string;
      if (isDirectory) {
        // For directory imports, pass the directory path — the plugin reads what it needs
        sourceData = sourcePath;
      } else {
        sourceData = await fs.readFile(sourcePath, 'utf-8');
      }

      // Step 4: Invoke the plugin's 'convert' handler via the host bridge dispatch
      let convertResult: unknown;
      try {
        convertResult = await dispatchPluginHostInvoke(pluginPackageName, 'convert', {
          data: sourceData,
          format,
          sourcePath
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, errors: [msg] };
      }

      const collection = convertResult as {
        info: { id?: string; name?: string };
        protocol?: string;
        variables?: unknown[];
        items?: unknown[];
        warnings?: string[];
      };

      // Step 5: Normalize the collection
      if (!collection?.info) {
        return { success: false, errors: ['Plugin returned an invalid collection (no info field)'] };
      }

      const collectionId = collection.info.id || crypto.randomUUID();
      collection.info.id = collectionId;

      const rawName = collection.info.name || path.basename(sourcePath, path.extname(sourcePath));
      const sanitizedName = rawName.trim().replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
      const fileName = `${sanitizedName}.apiquest.json`;

      collection.info.name = rawName;
      if (!collection.protocol) collection.protocol = 'http';
      if (!Array.isArray(collection.variables)) collection.variables = [];
      if (!Array.isArray(collection.items)) collection.items = [];

      // Step 6: Persist the collection
      const collectionsDir = path.join(workspacePath, 'collections');
      await fs.mkdir(collectionsDir, { recursive: true });
      const filePath = path.join(collectionsDir, fileName);
      await fs.writeFile(filePath, JSON.stringify(collection, null, 2), 'utf-8');

      // Register in runtime registry
      collectionRegistry.set(collectionId, fileName);

      console.log(`[WorkspaceHandler] Imported collection '${rawName}' as ${fileName} (plugin: ${pluginPackageName}, format: ${format})`);

      return {
        success: true,
        fileName,
        collectionId,
        pluginPackageName,
        format,
        warnings: collection.warnings,
      };
    }
  );

  ipcMain.handle('workspace:exportCollection', async (_event, workspaceId: string, collectionId: string) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    const fileName = collectionRegistry.get(collectionId);
    if (!fileName) throw new Error(`Collection not found: ${collectionId}`);
    
    const collectionPath = path.join(workspacePath, fileName);
    const result = await dialog.showSaveDialog({
      defaultPath: fileName,
      filters: [
        { name: 'ApiQuest Collection', extensions: ['apiquest.json'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    });
    
    if (result.canceled || !result.filePath) {
      return null;
    }
    
    await fs.copyFile(collectionPath, result.filePath);
    return result.filePath;
  });
}
