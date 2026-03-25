// Collection IPC handlers
import crypto from 'crypto';
import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import type { Collection, CollectionItem, Folder, Request } from '@apiquest/types';
import { secretVariableService } from '../SecretVariableService.js';
import type { WorkspaceCollectionVariables } from '../types/workspace.js';
import { isObjectRecord } from '../types/variables.js';
import { maskSecretRecord, maskVariablesForLog } from '../utils/mask.js';
import { collectionRegistry, workspaceRegistry } from './workspace.js';

type CollectionNode = CollectionItem;
type CollectionDocument = Collection;

type RemoveNodeResult = {
  node: CollectionNode;
  sourceParentId: string | null;
  sourceIndex: number;
};

function isFolderNode(node: CollectionNode): node is Folder {
  return node.type === 'folder';
}

function isRequestNode(node: CollectionNode): node is Request {
  return node.type === 'request';
}

function isCollectionInfo(value: unknown): value is Collection['info'] {
  return isObjectRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && (value.version === undefined || typeof value.version === 'string')
    && (value.description === undefined || typeof value.description === 'string');
}

function isRequestNodeValue(value: unknown): value is Request {
  return isObjectRecord(value)
    && value.type === 'request'
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && isObjectRecord(value.data);
}

function isFolderNodeValue(value: unknown): value is Folder {
  return isObjectRecord(value)
    && value.type === 'folder'
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && Array.isArray(value.items)
    && value.items.every((item) => isCollectionNodeValue(item));
}

function isCollectionNodeValue(value: unknown): value is CollectionNode {
  return isRequestNodeValue(value) || isFolderNodeValue(value);
}

function isCollectionDocument(value: unknown): value is CollectionDocument {
  return isObjectRecord(value)
    && isCollectionInfo(value.info)
    && typeof value.protocol === 'string'
    && (value.variables === undefined || isObjectRecord(value.variables))
    && Array.isArray(value.items)
    && value.items.every((item) => isCollectionNodeValue(item));
}

function parseCollectionDocument(content: string): CollectionDocument {
  const parsed: unknown = JSON.parse(content);

  if (!isCollectionDocument(parsed)) {
    throw new Error('Invalid collection file.');
  }

  return parsed;
}

function createCollectionDocument(collectionId: string, name: string, protocol: string): CollectionDocument {
  return {
    $schema: 'https://apiquest.dev/schemas/collection-v1.0.json',
    info: {
      id: collectionId,
      name,
      version: '1.0.0',
      description: '',
    },
    protocol,
    variables: {},
    items: [],
  };
}

function createFolderNode(folderName: string): Folder {
  return {
    type: 'folder',
    id: crypto.randomUUID(),
    name: folderName,
    items: [],
  };
}

function createRequestNode(requestName: string): Request {
  return {
    type: 'request',
    id: crypto.randomUUID(),
    name: requestName,
    data: {},
  };
}

function sanitizeFileNameSegment(value: string): string {
  return value.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
}

function getCollectionPath(workspaceId: string, collectionId: string): string {
  const workspacePath = workspaceRegistry.get(workspaceId);
  if (workspacePath === undefined) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const fileName = collectionRegistry.get(collectionId);
  if (fileName === undefined) {
    throw new Error(`Collection not found: ${collectionId}`);
  }

  return path.join(workspacePath, 'collections', fileName);
}

async function loadCollectionDocument(workspaceId: string, collectionId: string): Promise<CollectionDocument> {
  const collectionPath = getCollectionPath(workspaceId, collectionId);
  const content = await fs.readFile(collectionPath, 'utf-8');
  return parseCollectionDocument(content);
}

async function saveCollectionDocument(workspaceId: string, collectionId: string, collection: CollectionDocument): Promise<void> {
  const collectionPath = getCollectionPath(workspaceId, collectionId);
  const newContent = JSON.stringify(collection, null, 2);
  await fs.writeFile(collectionPath, newContent, 'utf-8');
}

function findFolderNode(items: CollectionNode[], folderId: string): Folder | null {
  for (const item of items) {
    if (item.id === folderId && isFolderNode(item)) {
      return item;
    }

    if (isFolderNode(item)) {
      const found = findFolderNode(item.items, folderId);
      if (found !== null) {
        return found;
      }
    }
  }

  return null;
}

function findRequestNode(items: CollectionNode[], requestId: string): Request | null {
  for (const item of items) {
    if (item.id === requestId && isRequestNode(item)) {
      return item;
    }

    if (isFolderNode(item)) {
      const found = findRequestNode(item.items, requestId);
      if (found !== null) {
        return found;
      }
    }
  }

  return null;
}

function removeNodeById(items: CollectionNode[], nodeId: string, parentId: string | null = null): RemoveNodeResult | null {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];

    if (item.id === nodeId) {
      const [node] = items.splice(index, 1);
      if (node === undefined) {
        return null;
      }

      return {
        node,
        sourceParentId: parentId,
        sourceIndex: index,
      };
    }

    if (isFolderNode(item)) {
      const nestedResult = removeNodeById(item.items, nodeId, item.id);
      if (nestedResult !== null) {
        return nestedResult;
      }
    }
  }

  return null;
}

function getDestinationItems(items: CollectionNode[], targetParentId: string | null): CollectionNode[] {
  if (targetParentId === null) {
    return items;
  }

  const targetFolder = findFolderNode(items, targetParentId);
  if (targetFolder === null) {
    throw new Error(`Target parent folder not found: ${targetParentId}`);
  }

  return targetFolder.items;
}

function clampIndex(index: number, length: number): number {
  if (index < 0) {
    return 0;
  }

  if (index > length) {
    return length;
  }

  return index;
}

function isDescendantFolder(folder: Folder, targetFolderId: string): boolean {
  for (const item of folder.items) {
    if (item.id === targetFolderId && isFolderNode(item)) {
      return true;
    }

    if (isFolderNode(item) && isDescendantFolder(item, targetFolderId)) {
      return true;
    }
  }

  return false;
}

function addNodeToItems(items: CollectionNode[], parentId: string | null, node: CollectionNode): boolean {
  if (parentId === null) {
    items.push(node);
    return true;
  }

  for (const item of items) {
    if (item.id === parentId && isFolderNode(item)) {
      item.items.push(node);
      return true;
    }

    if (isFolderNode(item) && addNodeToItems(item.items, parentId, node)) {
      return true;
    }
  }

  return false;
}

function renameFolderNode(items: CollectionNode[], folderId: string, newName: string): boolean {
  for (const item of items) {
    if (item.id === folderId && isFolderNode(item)) {
      item.name = newName;
      return true;
    }

    if (isFolderNode(item) && renameFolderNode(item.items, folderId, newName)) {
      return true;
    }
  }

  return false;
}

function renameRequestNode(items: CollectionNode[], requestId: string, newName: string): boolean {
  for (const item of items) {
    if (item.id === requestId && isRequestNode(item)) {
      item.name = newName;
      return true;
    }

    if (isFolderNode(item) && renameRequestNode(item.items, requestId, newName)) {
      return true;
    }
  }

  return false;
}

function regenerateItemIds(items: CollectionNode[]): void {
  for (const item of items) {
    item.id = crypto.randomUUID();

    if (isFolderNode(item)) {
      regenerateItemIds(item.items);
    }
  }
}

function cloneRequestNode(request: Request): Request {
  return structuredClone(request);
}

export function registerCollectionHandlers(): void {
  ipcMain.handle('workspace:loadCollection', async (_event, workspaceId: string, collectionId: string): Promise<Collection> => {
    const collection = await loadCollectionDocument(workspaceId, collectionId);
    const collectionSecrets = await secretVariableService.getCollectionSecrets(workspaceId, collectionId);

    console.log('[CollectionSecrets] loadCollection:pre-hydrate', {
      workspaceId,
      collectionId,
      fileVariables: maskVariablesForLog(collection.variables),
      settingsSecrets: maskSecretRecord(collectionSecrets),
    });

    collection.variables = secretVariableService.hydrateVariables(collection.variables, collectionSecrets);

    console.log('[CollectionSecrets] loadCollection:post-hydrate', {
      workspaceId,
      collectionId,
      hydratedVariables: maskVariablesForLog(collection.variables),
    });

    return collection;
  });

  ipcMain.handle('workspace:saveCollection', async (_event, workspaceId: string, collectionId: string, collection: Collection): Promise<void> => {
    const { sanitizedVariables, secrets } = secretVariableService.splitVariablesForSave(collection.variables);

    console.log('[CollectionSecrets] saveCollection:split', {
      workspaceId,
      collectionId,
      incomingVariables: maskVariablesForLog(collection.variables),
      sanitizedVariables: maskVariablesForLog(sanitizedVariables),
      secrets: maskSecretRecord(secrets),
    });

    const collectionForFile: Collection = {
      ...collection,
      variables: sanitizedVariables,
    };

    await saveCollectionDocument(workspaceId, collectionId, collectionForFile);
    await secretVariableService.setCollectionSecrets(workspaceId, collectionId, secrets);
  });

  ipcMain.handle('workspace:createCollection', async (_event, workspaceId: string, name: string, protocol: string): Promise<string> => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (workspacePath === undefined) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const collectionId = crypto.randomUUID();
    const normalizedName = name.trim();
    const collection = createCollectionDocument(collectionId, normalizedName, protocol);

    const sanitizedName = sanitizeFileNameSegment(normalizedName);
    const fileName = `${sanitizedName}.apiquest.json`;
    const collectionsDir = path.join(workspacePath, 'collections');

    await fs.mkdir(collectionsDir, { recursive: true });

    const filePath = path.join(collectionsDir, fileName);
    const content = JSON.stringify(collection, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');

    collectionRegistry.set(collectionId, fileName);
    return collectionId;
  });

  ipcMain.handle('workspace:renameCollection', async (_event, workspaceId: string, collectionId: string, newName: string): Promise<void> => {
    const collection = await loadCollectionDocument(workspaceId, collectionId);
    collection.info.name = newName.trim();
    await saveCollectionDocument(workspaceId, collectionId, collection);
  });

  ipcMain.handle('workspace:duplicateCollection', async (_event, workspaceId: string, collectionId: string, newName: string): Promise<string> => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (workspacePath === undefined) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const sourceFileName = collectionRegistry.get(collectionId);
    if (sourceFileName === undefined) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    const collectionsDir = path.join(workspacePath, 'collections');
    const sourcePath = path.join(collectionsDir, sourceFileName);
    const content = await fs.readFile(sourcePath, 'utf-8');
    const collection = parseCollectionDocument(content);

    const newCollectionId = crypto.randomUUID();
    collection.info.name = newName.trim();
    collection.info.id = newCollectionId;
    regenerateItemIds(collection.items);

    const sanitizedName = sanitizeFileNameSegment(newName.trim());
    const newFileName = `${sanitizedName}.apiquest.json`;
    const targetPath = path.join(collectionsDir, newFileName);

    const newContent = JSON.stringify(collection, null, 2);
    await fs.writeFile(targetPath, newContent, 'utf-8');

    collectionRegistry.set(newCollectionId, newFileName);
    await secretVariableService.copyCollectionSecrets(workspaceId, collectionId, newCollectionId);

    return newCollectionId;
  });

  ipcMain.handle('workspace:deleteCollection', async (_event, workspaceId: string, collectionId: string): Promise<void> => {
    const collectionPath = getCollectionPath(workspaceId, collectionId);
    await fs.unlink(collectionPath);
    await secretVariableService.deleteCollectionSecrets(workspaceId, collectionId);
    collectionRegistry.delete(collectionId);
  });

  ipcMain.handle(
    'workspace:updateCollectionVariables',
    async (_event, workspaceId: string, collectionId: string, variables: WorkspaceCollectionVariables): Promise<void> => {
      const collection = await loadCollectionDocument(workspaceId, collectionId);
      const { sanitizedVariables, secrets } = secretVariableService.splitVariablesForSave(variables);

      console.log('[CollectionSecrets] updateCollectionVariables:split', {
        workspaceId,
        collectionId,
        incomingVariables: maskVariablesForLog(variables),
        sanitizedVariables: maskVariablesForLog(sanitizedVariables),
        secrets: maskSecretRecord(secrets),
      });

      collection.variables = sanitizedVariables;

      await saveCollectionDocument(workspaceId, collectionId, collection);
      await secretVariableService.setCollectionSecrets(workspaceId, collectionId, secrets);
    },
  );

  ipcMain.handle('workspace:addFolder', async (_event, workspaceId: string, collectionId: string, folderName: string, parentId: string | null): Promise<string> => {
    const collection = await loadCollectionDocument(workspaceId, collectionId);
    const folder = createFolderNode(folderName.trim());
    const added = addNodeToItems(collection.items, parentId, folder);

    if (!added) {
      throw new Error(`Parent folder not found: ${parentId}`);
    }

    await saveCollectionDocument(workspaceId, collectionId, collection);
    return folder.id;
  });

  ipcMain.handle('workspace:renameFolder', async (_event, workspaceId: string, collectionId: string, folderId: string, newName: string): Promise<void> => {
    const collection = await loadCollectionDocument(workspaceId, collectionId);
    const renamed = renameFolderNode(collection.items, folderId, newName.trim());

    if (!renamed) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    await saveCollectionDocument(workspaceId, collectionId, collection);
  });

  ipcMain.handle('workspace:deleteFolder', async (_event, workspaceId: string, collectionId: string, folderId: string): Promise<void> => {
    const collection = await loadCollectionDocument(workspaceId, collectionId);
    const removed = removeNodeById(collection.items, folderId);

    if (removed === null || !isFolderNode(removed.node)) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    await saveCollectionDocument(workspaceId, collectionId, collection);
  });

  ipcMain.handle('workspace:addRequest', async (_event, workspaceId: string, collectionId: string, requestName: string, parentId: string | null): Promise<string> => {
    const collection = await loadCollectionDocument(workspaceId, collectionId);
    const request = createRequestNode(requestName.trim());
    const added = addNodeToItems(collection.items, parentId, request);

    if (!added) {
      throw new Error(`Parent folder not found: ${parentId}`);
    }

    await saveCollectionDocument(workspaceId, collectionId, collection);
    return request.id;
  });

  ipcMain.handle('workspace:renameRequest', async (_event, workspaceId: string, collectionId: string, requestId: string, newName: string): Promise<void> => {
    const collection = await loadCollectionDocument(workspaceId, collectionId);
    const renamed = renameRequestNode(collection.items, requestId, newName.trim());

    if (!renamed) {
      throw new Error(`Request not found: ${requestId}`);
    }

    await saveCollectionDocument(workspaceId, collectionId, collection);
  });

  ipcMain.handle(
    'workspace:duplicateRequest',
    async (_event, workspaceId: string, collectionId: string, requestId: string, parentId: string | null): Promise<string> => {
      const collection = await loadCollectionDocument(workspaceId, collectionId);
      const original = findRequestNode(collection.items, requestId);

      if (original === null) {
        throw new Error(`Request not found: ${requestId}`);
      }

      const duplicate = cloneRequestNode(original);
      duplicate.id = crypto.randomUUID();
      duplicate.name = `${duplicate.name} Copy`;

      if (parentId === null) {
        const removeResult = removeNodeById(collection.items, requestId);
        if (removeResult === null || !isRequestNode(removeResult.node)) {
          throw new Error(`Request not found: ${requestId}`);
        }

        collection.items.splice(removeResult.sourceIndex, 0, removeResult.node, duplicate);
      } else {
        const added = addNodeToItems(collection.items, parentId, duplicate);
        if (!added) {
          throw new Error(`Parent folder not found: ${parentId}`);
        }
      }

      await saveCollectionDocument(workspaceId, collectionId, collection);
      return duplicate.id;
    },
  );

  ipcMain.handle('workspace:deleteRequest', async (_event, workspaceId: string, collectionId: string, requestId: string): Promise<void> => {
    const collection = await loadCollectionDocument(workspaceId, collectionId);
    const removed = removeNodeById(collection.items, requestId);

    if (removed === null || !isRequestNode(removed.node)) {
      throw new Error(`Request not found: ${requestId}`);
    }

    await saveCollectionDocument(workspaceId, collectionId, collection);
  });

  ipcMain.handle(
    'workspace:moveRequest',
    async (
      _event,
      workspaceId: string,
      sourceCollectionId: string,
      requestId: string,
      targetCollectionId: string,
      targetParentId: string | null,
      targetIndex: number,
    ): Promise<void> => {
      const sourceCollection = await loadCollectionDocument(workspaceId, sourceCollectionId);
      const targetCollection = sourceCollectionId === targetCollectionId
        ? sourceCollection
        : await loadCollectionDocument(workspaceId, targetCollectionId);

      const removeResult = removeNodeById(sourceCollection.items, requestId);
      if (removeResult === null) {
        throw new Error(`Request not found: ${requestId}`);
      }

      if (!isRequestNode(removeResult.node)) {
        throw new Error(`Node is not a request: ${requestId}`);
      }

      const destinationItems = getDestinationItems(targetCollection.items, targetParentId);
      const normalizedIndex = sourceCollectionId === targetCollectionId && removeResult.sourceParentId === targetParentId && removeResult.sourceIndex < targetIndex
        ? clampIndex(targetIndex - 1, destinationItems.length)
        : clampIndex(targetIndex, destinationItems.length);

      const sameLocation = sourceCollectionId === targetCollectionId
        && removeResult.sourceParentId === targetParentId
        && removeResult.sourceIndex === normalizedIndex;

      if (sameLocation) {
        destinationItems.splice(removeResult.sourceIndex, 0, removeResult.node);
        return;
      }

      destinationItems.splice(normalizedIndex, 0, removeResult.node);

      await saveCollectionDocument(workspaceId, sourceCollectionId, sourceCollection);
      if (sourceCollectionId !== targetCollectionId) {
        await saveCollectionDocument(workspaceId, targetCollectionId, targetCollection);
      }
    },
  );

  ipcMain.handle(
    'workspace:moveFolder',
    async (
      _event,
      workspaceId: string,
      sourceCollectionId: string,
      folderId: string,
      targetCollectionId: string,
      targetParentId: string | null,
      targetIndex: number,
    ): Promise<void> => {
      const sourceCollection = await loadCollectionDocument(workspaceId, sourceCollectionId);
      const targetCollection = sourceCollectionId === targetCollectionId
        ? sourceCollection
        : await loadCollectionDocument(workspaceId, targetCollectionId);

      const removeResult = removeNodeById(sourceCollection.items, folderId);
      if (removeResult === null) {
        throw new Error(`Folder not found: ${folderId}`);
      }

      if (!isFolderNode(removeResult.node)) {
        throw new Error(`Node is not a folder: ${folderId}`);
      }

      if (targetParentId === folderId || (targetParentId !== null && isDescendantFolder(removeResult.node, targetParentId))) {
        const restoreItems = getDestinationItems(sourceCollection.items, removeResult.sourceParentId);
        restoreItems.splice(removeResult.sourceIndex, 0, removeResult.node);
        throw new Error('Cannot move a folder into itself or one of its descendants');
      }

      const destinationItems = getDestinationItems(targetCollection.items, targetParentId);
      const normalizedIndex = sourceCollectionId === targetCollectionId && removeResult.sourceParentId === targetParentId && removeResult.sourceIndex < targetIndex
        ? clampIndex(targetIndex - 1, destinationItems.length)
        : clampIndex(targetIndex, destinationItems.length);

      const sameLocation = sourceCollectionId === targetCollectionId
        && removeResult.sourceParentId === targetParentId
        && removeResult.sourceIndex === normalizedIndex;

      if (sameLocation) {
        destinationItems.splice(removeResult.sourceIndex, 0, removeResult.node);
        return;
      }

      destinationItems.splice(normalizedIndex, 0, removeResult.node);

      await saveCollectionDocument(workspaceId, sourceCollectionId, sourceCollection);
      if (sourceCollectionId !== targetCollectionId) {
        await saveCollectionDocument(workspaceId, targetCollectionId, targetCollection);
      }
    },
  );
}
