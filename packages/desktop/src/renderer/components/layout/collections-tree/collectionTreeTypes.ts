import type { CollectionItem, Folder, Request, VariableValue } from '@apiquest/types';
import type { TreeDragItem, TreeDropPreview } from './types';

export type WorkspaceCollectionSummary = {
  id: string;
  name: string;
};

export type CollectionTreeSharedProps = {
  activeRenameId: string | null;
  setActiveRenameId: (id: string | null) => void;
  inlineRenameValue: string;
  setInlineRenameValue: (value: string) => void;
  activeDragItem: TreeDragItem | null;
  dropPreview: TreeDropPreview;
};

export type CollectionTreeItemProps = CollectionTreeSharedProps & {
  item: CollectionItem;
  collectionId: string;
  parentId: string | null;
  itemIndex: number;
  protocol: string;
};

export type CollectionFolderItemProps = Omit<CollectionTreeItemProps, 'item'> & {
  item: Folder;
};

export type CollectionRequestItemProps = Omit<CollectionTreeItemProps, 'item'> & {
  item: Request;
};

export type CollectionPanelItemProps = CollectionTreeSharedProps & {
  collection: WorkspaceCollectionSummary;
};

export type CollectionVariablesMap = Record<string, VariableValue>;

export function isFolderItem(item: CollectionItem): item is Folder {
  return item.type === 'folder';
}

export function isRequestItem(item: CollectionItem): item is Request {
  return item.type === 'request';
}

export function findRequestInItems(items: CollectionItem[], requestId: string): Request | null {
  for (const item of items) {
    if (isRequestItem(item) && item.id === requestId) {
      return item;
    }

    if (isFolderItem(item)) {
      const found = findRequestInItems(item.items, requestId);
      if (found !== null) {
        return found;
      }
    }
  }

  return null;
}
