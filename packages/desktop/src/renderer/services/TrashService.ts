// TrashService - Soft-delete collections/requests with restore capability
// Layer: Services (NO React dependencies)

import type { TrashedItem, TrashState, RestoreResult } from '../types/trash';
import type { Collection } from '../types/request';
import { EventEmitter } from 'eventemitter3';

export class TrashService extends EventEmitter {
  private state: TrashState = {
    items: [],
    autoDeleteDays: 30
  };

  /**
   * Soft-delete a collection
   */
  deleteCollection(
    collectionId: string,
    collectionName: string,
    collectionData: Collection
  ): void {
    const item: TrashedItem = {
      id: this.generateId(),
      type: 'collection',
      name: collectionName,
      collectionId,
      collectionName,
      data: collectionData,
      deletedAt: new Date(),
      deletedBy: 'user',
      autoDeleteAt: this.calculateAutoDeleteDate()
    };

    this.state.items.push(item);
    this.emit('itemDeleted', item);
    this.scheduleAutoDelete(item);
  }

  /**
   * Soft-delete a request
   */
  deleteRequest(
    collectionId: string,
    collectionName: string,
    requestId: string,
    requestName: string,
    requestData: any,
    parentPath?: string
  ): void {
    const item: TrashedItem = {
      id: this.generateId(),
      type: 'request',
      name: requestName,
      collectionId,
      collectionName,
      parentPath,
      data: requestData,
      deletedAt: new Date(),
      deletedBy: 'user',
      autoDeleteAt: this.calculateAutoDeleteDate()
    };

    this.state.items.push(item);
    this.emit('itemDeleted', item);
    this.scheduleAutoDelete(item);
  }

  /**
   * Soft-delete a folder
   */
  deleteFolder(
    collectionId: string,
    collectionName: string,
    folderId: string,
    folderName: string,
    folderData: any,
    parentPath?: string
  ): void {
    const item: TrashedItem = {
      id: this.generateId(),
      type: 'folder',
      name: folderName,
      collectionId,
      collectionName,
      parentPath,
      data: folderData,
      deletedAt: new Date(),
      deletedBy: 'user',
      autoDeleteAt: this.calculateAutoDeleteDate()
    };

    this.state.items.push(item);
    this.emit('itemDeleted', item);
    this.scheduleAutoDelete(item);
  }

  /**
   * Restore item from trash
   */
  restore(itemId: string): RestoreResult {
    const index = this.state.items.findIndex(item => item.id === itemId);
    
    if (index === -1) {
      return {
        success: false,
        error: 'Item not found in trash'
      };
    }

    const item = this.state.items[index];
    this.state.items.splice(index, 1);
    
    this.emit('itemRestored', item);
    
    return {
      success: true,
      restoredItemId: item.id
    };
  }

  /**
   * Permanently delete item from trash
   */
  permanentlyDelete(itemId: string): boolean {
    const index = this.state.items.findIndex(item => item.id === itemId);
    
    if (index === -1) {
      return false;
    }

    const item = this.state.items[index];
    this.state.items.splice(index, 1);
    
    this.emit('itemPermanentlyDeleted', item);
    return true;
  }

  /**
   * Empty trash (delete all items)
   */
  emptyTrash(): number {
    const count = this.state.items.length;
    this.state.items = [];
    this.emit('trashEmptied', count);
    return count;
  }

  /**
   * Get all trash items
   */
  getItems(): TrashedItem[] {
    return [...this.state.items];
  }

  /**
   * Get items by collection
   */
  getItemsByCollection(collectionId: string): TrashedItem[] {
    return this.state.items.filter(item => item.collectionId === collectionId);
  }

  /**
   * Get trash state
   */
  getState(): TrashState {
    return { ...this.state };
  }

  /**
   * Set auto-delete days
   */
  setAutoDeleteDays(days: number): void {
    this.state.autoDeleteDays = days;
    this.emit('autoDeleteDaysChanged', days);
  }

  /**
   * Check and auto-delete expired items
   */
  private checkAutoDelete(): void {
    const now = new Date();
    const expired = this.state.items.filter(item => 
      item.autoDeleteAt && item.autoDeleteAt <= now
    );

    for (const item of expired) {
      this.permanentlyDelete(item.id);
    }
  }

  /**
   * Schedule auto-delete check
   */
  private scheduleAutoDelete(item: TrashedItem): void {
    if (!item.autoDeleteAt) return;

    const delay = item.autoDeleteAt.getTime() - Date.now();
    
    if (delay > 0) {
      setTimeout(() => {
        this.permanentlyDelete(item.id);
      }, delay);
    }
  }

  /**
   * Calculate auto-delete date
   */
  private calculateAutoDeleteDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() + this.state.autoDeleteDays);
    return date;
  }

  /**
   * Generate unique item ID
   */
  private generateId(): string {
    return `trash-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Start periodic check for expired items
   */
  startAutoDeleteCheck(): void {
    // Check every hour
    setInterval(() => this.checkAutoDelete(), 60 * 60 * 1000);
  }
}

// Singleton instance
export const trashService = new TrashService();

