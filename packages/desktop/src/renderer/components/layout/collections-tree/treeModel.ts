import type { TreeDragItem, TreeDropTarget } from './types';

type TreeNode = {
  id: string;
  name: string;
  type?: string;
  items?: TreeNode[];
};

function collectFolderIds(items: TreeNode[] | undefined): string[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const folderIds: string[] = [];

  for (const item of items) {
    if (Array.isArray(item.items)) {
      folderIds.push(item.id);
      folderIds.push(...collectFolderIds(item.items));
    }
  }

  return folderIds;
}

function collectRequestIds(items: TreeNode[] | undefined): string[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const requestIds: string[] = [];

  for (const item of items) {
    if (Array.isArray(item.items)) {
      requestIds.push(...collectRequestIds(item.items));
      continue;
    }

    requestIds.push(item.id);
  }

  return requestIds;
}

export function buildDragItem(params: {
  item: TreeNode;
  sourceCollectionId: string;
  sourceParentId: string | null;
  sourceIndex: number;
}): TreeDragItem {
  const isFolder = Array.isArray(params.item.items);

  return {
    type: isFolder ? 'folder' : 'request',
    id: params.item.id,
    name: params.item.name,
    sourceCollectionId: params.sourceCollectionId,
    sourceParentId: params.sourceParentId,
    sourceIndex: params.sourceIndex,
    descendantFolderIds: isFolder ? collectFolderIds(params.item.items) : [],
    descendantRequestIds: isFolder ? collectRequestIds(params.item.items) : [],
  };
}

export function createDropZoneId(target: Omit<TreeDropTarget, 'zoneId'>): string {
  return [
    'drop',
    target.targetCollectionId,
    target.targetParentId ?? 'root',
    target.overType,
    target.overId,
    target.position,
    String(target.targetIndex),
  ].join(':');
}

export function createDropTarget(target: Omit<TreeDropTarget, 'zoneId'>): TreeDropTarget {
  return {
    ...target,
    zoneId: createDropZoneId(target),
  };
}

export function isValidDropTarget(dragItem: TreeDragItem | null, dropTarget: TreeDropTarget | null): boolean {
  if (dragItem === null || dropTarget === null) {
    return false;
  }

  if (dragItem.type === 'folder') {
    if (dropTarget.targetParentId === dragItem.id) {
      return false;
    }

    if (dropTarget.targetParentId !== null && dragItem.descendantFolderIds.includes(dropTarget.targetParentId)) {
      return false;
    }
  }

  if (
    dragItem.sourceCollectionId === dropTarget.targetCollectionId
    && dragItem.sourceParentId === dropTarget.targetParentId
    && (dropTarget.targetIndex === dragItem.sourceIndex || dropTarget.targetIndex === dragItem.sourceIndex + 1)
  ) {
    return false;
  }

  return true;
}
