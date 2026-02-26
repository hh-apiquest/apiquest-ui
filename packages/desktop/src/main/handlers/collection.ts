// Collection IPC handlers
import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { workspaceRegistry, collectionRegistry } from './workspace.js';

// Helper function to get collection file path
function getCollectionPath(workspaceId: string, collectionId: string): string {
  const workspacePath = workspaceRegistry.get(workspaceId);
  if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
  
  const fileName = collectionRegistry.get(collectionId);
  if (!fileName) throw new Error(`Collection not found: ${collectionId}`);
  
  return path.join(workspacePath, 'collections', fileName);
}

export function registerCollectionHandlers() {
  // Collection operations
  ipcMain.handle('workspace:loadCollection', async (_event, workspaceId: string, collectionId: string) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    const content = await fs.readFile(collectionPath, 'utf-8');
    return JSON.parse(content);
  });

  ipcMain.handle('workspace:saveCollection', async (_event, workspaceId: string, collectionId: string, collection: any) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    const content = JSON.stringify(collection, null, 2);
    await fs.writeFile(collectionPath, content, 'utf-8');
  });

  ipcMain.handle('workspace:createCollection', async (_event, workspaceId: string, name: string, protocol: string) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    const collectionId = crypto.randomUUID();
    
    const collection = {
      $schema: 'https://apiquest.dev/schemas/collection-v1.0.json',
      info: {
        id: collectionId,
        name: name.trim(),
        version: '1.0.0',
        description: ''
      },
      protocol,
      variables: [],
      items: []
    };

    const sanitizedName = name.trim().replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
    const fileName = `${sanitizedName}.apiquest.json`;
    const collectionsDir = path.join(workspacePath, 'collections');
    
    // Ensure collections directory exists
    await fs.mkdir(collectionsDir, { recursive: true });
    
    const filePath = path.join(collectionsDir, fileName);

    const content = JSON.stringify(collection, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
    
    // Register collection in runtime registry (use relative path from workspace)
    collectionRegistry.set(collectionId, `${fileName}`);

    return collectionId;
  });

ipcMain.handle('workspace:renameCollection', async (_event, workspaceId: string, collectionId: string, newName: string) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    const content = await fs.readFile(collectionPath, 'utf-8');
    const collection = JSON.parse(content);
    
    collection.info.name = newName.trim();
    
    const newContent = JSON.stringify(collection, null, 2);
    await fs.writeFile(collectionPath, newContent, 'utf-8');
  });

  ipcMain.handle('workspace:duplicateCollection', async (_event, workspaceId: string, collectionId: string, newName: string) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    const sourceFileName = collectionRegistry.get(collectionId);
    if (!sourceFileName) throw new Error(`Collection not found: ${collectionId}`);
    
    const collectionsDir = path.join(workspacePath, 'collections');
    const sourcePath = path.join(collectionsDir, sourceFileName);
    const content = await fs.readFile(sourcePath, 'utf-8');
    const collection = JSON.parse(content);
    
    const newCollectionId = crypto.randomUUID();
    collection.info.name = newName.trim();
    collection.info.id = newCollectionId;
    
    const sanitizedName = newName.trim().replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
    const newFileName = `${sanitizedName}.apiquest.json`;
    const targetPath = path.join(collectionsDir, newFileName);
    
    const newContent = JSON.stringify(collection, null, 2);
    await fs.writeFile(targetPath, newContent, 'utf-8');
    
    // Register new collection
    collectionRegistry.set(newCollectionId, newFileName);
    
    return newCollectionId;
  });

  ipcMain.handle('workspace:deleteCollection', async (_event, workspaceId: string, collectionId: string) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    await fs.unlink(collectionPath);
    
    // Remove from registry
    collectionRegistry.delete(collectionId);
  });

  ipcMain.handle('workspace:updateCollectionVariables', async (_event, workspaceId: string, collectionId: string, variables: any) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    const content = await fs.readFile(collectionPath, 'utf-8');
    const collection = JSON.parse(content);
    
    collection.variables = variables;
    
    const newContent = JSON.stringify(collection, null, 2);
    await fs.writeFile(collectionPath, newContent, 'utf-8');
  });

  // Folder operations
  ipcMain.handle('workspace:addFolder', async (_event, workspaceId: string, collectionId: string, folderName: string, parentId: string | null) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    const content = await fs.readFile(collectionPath, 'utf-8');
    const collection = JSON.parse(content);

    const folder = {
      type: 'folder',
      id: crypto.randomUUID(),
      name: folderName.trim(),
      items: []
    };

    const addToItems = (items: any[]): boolean => {
      if (!parentId) {
        items.push(folder);
        return true;
      }

      for (const item of items) {
        if (item.id === parentId && item.type === 'folder') {
          item.items.push(folder);
          return true;
        }
        if (item.items && addToItems(item.items)) {
          return true;
        }
      }
      return false;
    };

    addToItems(collection.items);

    const newContent = JSON.stringify(collection, null, 2);
    await fs.writeFile(collectionPath, newContent, 'utf-8');

    return folder.id;
  });

  ipcMain.handle('workspace:renameFolder', async (_event, workspaceId: string, collectionId: string, folderId: string, newName: string) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    const content = await fs.readFile(collectionPath, 'utf-8');
    const collection = JSON.parse(content);
    
    const renameInItems = (items: any[]): boolean => {
      for (const item of items) {
        if (item.id === folderId && item.type === 'folder') {
          item.name = newName.trim();
          return true;
        }
        if (item.items && renameInItems(item.items)) {
          return true;
        }
      }
      return false;
    };
    
    renameInItems(collection.items);
    
    const newContent = JSON.stringify(collection, null, 2);
    await fs.writeFile(collectionPath, newContent, 'utf-8');
  });

  ipcMain.handle('workspace:deleteFolder', async (_event, workspaceId: string, collectionId: string, folderId: string) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    const content = await fs.readFile(collectionPath, 'utf-8');
    const collection = JSON.parse(content);
    
    const deleteFromItems = (items: any[]): boolean => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === folderId && items[i].type === 'folder') {
          items.splice(i, 1);
          return true;
        }
        if (items[i].items && deleteFromItems(items[i].items)) {
          return true;
        }
      }
      return false;
    };
    
    deleteFromItems(collection.items);
    
    const newContent = JSON.stringify(collection, null, 2);
    await fs.writeFile(collectionPath, newContent, 'utf-8');
  });

  // Request operations
  ipcMain.handle('workspace:addRequest', async (_event, workspaceId: string, collectionId: string, requestName: string, parentId: string | null) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    const content = await fs.readFile(collectionPath, 'utf-8');
    const collection = JSON.parse(content);

    const request = {
      type: 'request',
      id: crypto.randomUUID(),
      name: requestName.trim(),
      data: {}
    };

    const addToItems = (items: any[]): boolean => {
      if (!parentId) {
        items.push(request);
        return true;
      }

      for (const item of items) {
        if (item.id === parentId && item.type === 'folder') {
          item.items.push(request);
          return true;
        }
        if (item.items && addToItems(item.items)) {
          return true;
        }
      }
      return false;
    };

    addToItems(collection.items);

    const newContent = JSON.stringify(collection, null, 2);
    await fs.writeFile(collectionPath, newContent, 'utf-8');

    return request.id;
  });

  ipcMain.handle('workspace:renameRequest', async (_event, workspaceId: string, collectionId: string, requestId: string, newName: string) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    const content = await fs.readFile(collectionPath, 'utf-8');
    const collection = JSON.parse(content);
    
    const renameInItems = (items: any[]): boolean => {
      for (const item of items) {
        if (item.id === requestId && item.type === 'request') {
          item.name = newName.trim();
          return true;
        }
        if (item.items && renameInItems(item.items)) {
          return true;
        }
      }
      return false;
    };
    
    renameInItems(collection.items);
    
    const newContent = JSON.stringify(collection, null, 2);
    await fs.writeFile(collectionPath, newContent, 'utf-8');
  });

  ipcMain.handle('workspace:duplicateRequest', async (_event, workspaceId: string, collectionId: string, requestId: string, parentId: string | null) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    const content = await fs.readFile(collectionPath, 'utf-8');
    const collection = JSON.parse(content);
    
    const findRequest = (items: any[]): any => {
      for (const item of items) {
        if (item.id === requestId) return item;
        if (item.items) {
          const found = findRequest(item.items);
          if (found) return found;
        }
      }
      return null;
    };
    
    const original = findRequest(collection.items);
    if (!original) throw new Error('Request not found');
    
    const duplicate = JSON.parse(JSON.stringify(original));
    duplicate.id = crypto.randomUUID();
    duplicate.name = `${duplicate.name} Copy`;
    
    const addToItems = (items: any[]): boolean => {
      if (!parentId) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].id === requestId) {
            items.splice(i + 1, 0, duplicate);
            return true;
          }
          if (items[i].items && addToItems(items[i].items)) {
            return true;
          }
        }
        return false;
      }
      
      for (const item of items) {
        if (item.id === parentId && item.type === 'folder') {
          item.items.push(duplicate);
          return true;
        }
        if (item.items && addToItems(item.items)) {
          return true;
        }
      }
      return false;
    };
    
    addToItems(collection.items);
    
    const newContent = JSON.stringify(collection, null, 2);
    await fs.writeFile(collectionPath, newContent, 'utf-8');
    
    return duplicate.id;
  });

  ipcMain.handle('workspace:deleteRequest', async (_event, workspaceId: string, collectionId: string, requestId: string) => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    const content = await fs.readFile(collectionPath, 'utf-8');
    const collection = JSON.parse(content);
    
    const deleteFromItems = (items: any[]): boolean => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === requestId && items[i].type === 'request') {
          items.splice(i, 1);
          return true;
        }
        if (items[i].items && deleteFromItems(items[i].items)) {
          return true;
        }
      }
      return false;
    };
    
    deleteFromItems(collection.items);
    
    const newContent = JSON.stringify(collection, null, 2);
    await fs.writeFile(collectionPath, newContent, 'utf-8');
  });
}
