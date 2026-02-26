// TrashContext - Manages trash/soft-delete
// Layer: Contexts (React layer, wraps TrashService)

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { TrashedItem, RestoreResult } from '../types/trash';
import type { Collection } from '../types/request';
import { trashService } from '../services';

interface TrashContextValue {
  items: TrashedItem[];
  autoDeleteDays: number;
  
  // Actions
  deleteCollection: (collectionId: string, name: string, data: Collection) => void;
  deleteRequest: (collectionId: string, collectionName: string, requestId: string, requestName: string, data: any, parentPath?: string) => void;
  deleteFolder: (collectionId: string, collectionName: string, folderId: string, folderName: string, data: any, parentPath?: string) => void;
  restore: (itemId: string) => RestoreResult;
  permanentlyDelete: (itemId: string) => boolean;
  emptyTrash: () => number;
  setAutoDeleteDays: (days: number) => void;
  
  // Queries
  getItemsByCollection: (collectionId: string) => TrashedItem[];
}

const TrashContext = createContext<TrashContextValue | null>(null);

interface TrashProviderProps {
  children: ReactNode;
}

export function TrashProvider({ children }: TrashProviderProps) {
  const [items, setItems] = useState<TrashedItem[]>([]);
  const [autoDeleteDays, setAutoDeleteDaysState] = useState(30);

  // Subscribe to trash service events
  useEffect(() => {
    const updateItems = () => {
      setItems(trashService.getItems());
    };

    const handleAutoDeleteDaysChanged = (days: number) => {
      setAutoDeleteDaysState(days);
    };

    trashService.on('itemDeleted', updateItems);
    trashService.on('itemRestored', updateItems);
    trashService.on('itemPermanentlyDeleted', updateItems);
    trashService.on('trashEmptied', updateItems);
    trashService.on('autoDeleteDaysChanged', handleAutoDeleteDaysChanged);

    // Initial load
    setItems(trashService.getItems());
    setAutoDeleteDaysState(trashService.getState().autoDeleteDays);

    // Start auto-delete check
    trashService.startAutoDeleteCheck();

    return () => {
      trashService.off('itemDeleted', updateItems);
      trashService.off('itemRestored', updateItems);
      trashService.off('itemPermanentlyDeleted', updateItems);
      trashService.off('trashEmptied', updateItems);
      trashService.off('autoDeleteDaysChanged', handleAutoDeleteDaysChanged);
    };
  }, []);

  const deleteCollection = (collectionId: string, name: string, data: Collection) => {
    trashService.deleteCollection(collectionId, name, data);
  };

  const deleteRequest = (
    collectionId: string,
    collectionName: string,
    requestId: string,
    requestName: string,
    data: any,
    parentPath?: string
  ) => {
    trashService.deleteRequest(collectionId, collectionName, requestId, requestName, data, parentPath);
  };

  const deleteFolder = (
    collectionId: string,
    collectionName: string,
    folderId: string,
    folderName: string,
    data: any,
    parentPath?: string
  ) => {
    trashService.deleteFolder(collectionId, collectionName, folderId, folderName, data, parentPath);
  };

  const restore = (itemId: string): RestoreResult => {
    return trashService.restore(itemId);
  };

  const permanentlyDelete = (itemId: string): boolean => {
    return trashService.permanentlyDelete(itemId);
  };

  const emptyTrash = (): number => {
    return trashService.emptyTrash();
  };

  const setAutoDeleteDays = (days: number) => {
    trashService.setAutoDeleteDays(days);
  };

  const getItemsByCollection = (collectionId: string): TrashedItem[] => {
    return trashService.getItemsByCollection(collectionId);
  };

  return (
    <TrashContext.Provider
      value={{
        items,
        autoDeleteDays,
        deleteCollection,
        deleteRequest,
        deleteFolder,
        restore,
        permanentlyDelete,
        emptyTrash,
        setAutoDeleteDays,
        getItemsByCollection
      }}
    >
      {children}
    </TrashContext.Provider>
  );
}

export function useTrash() {
  const context = useContext(TrashContext);
  if (!context) {
    throw new Error('useTrash must be used within TrashProvider');
  }
  return context;
}
