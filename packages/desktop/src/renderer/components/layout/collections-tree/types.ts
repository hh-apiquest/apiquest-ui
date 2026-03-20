export type TreeDragItemType = 'folder' | 'request';

export type TreeDropPosition = 'before' | 'inside' | 'after';

export type TreeDropTargetType = 'collection' | 'folder' | 'request';

export type TreeDragItem = {
  type: TreeDragItemType;
  id: string;
  name: string;
  sourceCollectionId: string;
  sourceParentId: string | null;
  sourceIndex: number;
  descendantFolderIds: string[];
  descendantRequestIds: string[];
};

export type TreeDropTarget = {
  zoneId: string;
  targetCollectionId: string;
  targetParentId: string | null;
  targetIndex: number;
  position: TreeDropPosition;
  overType: TreeDropTargetType;
  overId: string;
};

export type TreeDropPreview = {
  overZoneId: string | null;
  target: TreeDropTarget | null;
  isValid: boolean;
};
