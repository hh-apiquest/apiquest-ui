// WorkspaceService - Manages workspace scanning and collection discovery
// Layer: Services (NO React dependencies)
// Uses IPC to communicate with main process for file operations

import type { Workspace } from '../types/workspace';
import type { Collection } from '../types/request';

export class WorkspaceService {
  private workspaces: Map<string, Workspace> = new Map();

  /**
   * Scan a folder and discover all .apiquest.json collections
   */
  async scanWorkspace(folderPath: string): Promise<Workspace> {
    const workspace = await window.quest.workspace.scan(folderPath);
    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  /**
   * Load a specific collection file
   */
  async loadCollection(workspaceId: string, collectionId: string): Promise<Collection> {
    return await window.quest.workspace.loadCollection(workspaceId, collectionId);
  }

  /**
   * Save a collection file
   */
  async saveCollection(workspaceId: string, collectionId: string, collection: Collection): Promise<void> {
    await window.quest.workspace.saveCollection(workspaceId, collectionId, collection);
  }

  /**
   * Open folder selection dialog
   */
  async selectFolder(): Promise<string | null> {
    return await window.quest.workspace.selectFolder();
  }

  /**
   * Get workspace by ID
   */
  getWorkspace(workspaceId: string): Workspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  /**
   * Get all workspaces
   */
  getAllWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values());
  }
}

// Singleton instance
export const workspaceService = new WorkspaceService();
