// Workspace IPC handlers
import { ipcMain, dialog } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { workspaceManager } from '../WorkspaceManager.js';
import { walkDirectory } from '../utils/fileSystem.js';

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
    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);
        const fileName = path.basename(filePath);
        
        // Read collection to get id and name
        let collectionId = '';
        let collectionName = fileName.replace('.apiquest.json', '');
        let collectionVersion = '1.0.0';
        let collectionDescription = '';
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const collection = JSON.parse(content);
          if (collection.info) {
            collectionId = collection.info.id || '';
            collectionName = collection.info.name || collectionName;
            collectionVersion = collection.info.version || '';
            collectionDescription = collection.info.description || '';
          }
        } catch (readErr) {
          console.error(`Failed to read collection ${fileName}:`, readErr);
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

  ipcMain.handle('workspace:importCollection', async (_event, workspaceId: string) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    const importPath = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'ApiQuest Collections', extensions: ['apiquest.json', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (importPath.canceled || !importPath.filePaths[0]) {
      return null;
    }
    
    const sourceFile = importPath.filePaths[0];
    const fileName = path.basename(sourceFile);
    const targetFile = path.join(workspacePath, fileName);
    
    await fs.copyFile(sourceFile, targetFile);
    return fileName;
  });

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
