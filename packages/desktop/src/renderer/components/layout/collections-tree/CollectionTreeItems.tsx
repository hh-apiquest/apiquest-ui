import { useRef, useState, type ReactElement } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@radix-ui/themes';
import { ChevronDownIcon, ChevronRightIcon, EllipsisVerticalIcon, FolderIcon, FolderPlusIcon, PlusIcon } from '@heroicons/react/24/outline';
import type { CollectionItem } from '@apiquest/types';
import { pluginLoader } from '../../../services';
import { useTabNavigation, useTabStatusActions, useWorkspace } from '../../../contexts';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { InputDialog } from '../../shared/InputDialog';
import { RequestMetadataIcons } from '../../shared/RequestMetadataIcons';
import { UnifiedContextMenu, type MenuAction } from '../../shared/UnifiedContextMenu';
import { InlineRenameField } from './InlineRenameField';
import { buildDragItem, createDropTarget } from './treeModel';
import { useInlineRename } from './useInlineRename';
import { DropTargetZones } from './CollectionTreeDropTargets';
import {
  findRequestInItems,
  isFolderItem,
  type CollectionFolderItemProps,
  type CollectionRequestItemProps,
  type CollectionTreeItemProps,
} from './collectionTreeTypes';

export function CollectionRequestItem(props: CollectionTreeItemProps): ReactElement {
  return isFolderItem(props.item)
    ? <CollectionFolderItem {...props} item={props.item} />
    : <CollectionLeafRequestItem {...props} item={props.item} />;
}

function CollectionFolderItem({
  item,
  collectionId,
  parentId,
  itemIndex,
  protocol,
  activeRenameId,
  setActiveRenameId,
  inlineRenameValue,
  setInlineRenameValue,
  activeDragItem,
  dropPreview,
}: CollectionFolderItemProps): ReactElement {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const folderFocusTimeRef = useRef<number>(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [rightClickMenuOpen, setRightClickMenuOpen] = useState(false);
  const [rightClickPosition, setRightClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const { tabs, closeTab, openRequest, openFolder } = useTabNavigation();
  const { setName } = useTabStatusActions();
  const { workspace, refreshWorkspace } = useWorkspace();
  const renameId = `folder:${item.id}`;
  const dragItem = buildDragItem({ item, sourceCollectionId: collectionId, sourceParentId: parentId, sourceIndex: itemIndex });
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `drag-folder:${item.id}`,
    data: { dragItem },
  });
  const draggableStyle = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.45 : 1,
  };
  const folderDropTargets = [
    createDropTarget({ targetCollectionId: collectionId, targetParentId: parentId, targetIndex: itemIndex, position: 'before', overType: 'folder', overId: item.id }),
    createDropTarget({ targetCollectionId: collectionId, targetParentId: item.id, targetIndex: item.items.length, position: 'inside', overType: 'folder', overId: item.id }),
    createDropTarget({ targetCollectionId: collectionId, targetParentId: parentId, targetIndex: itemIndex + 1, position: 'after', overType: 'folder', overId: item.id }),
  ];

  const closeTabsForFolderDeletion = (): void => {
    const folderIds = new Set<string>([item.id]);
    const requestIds = new Set<string>();
    const stack: CollectionItem[] = [...item.items];

    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) {
        continue;
      }

      if (isFolderItem(node)) {
        folderIds.add(node.id);
        stack.push(...node.items);
        continue;
      }

      requestIds.add(node.id);
    }

    tabs
      .filter((tab) => tab.collectionId === collectionId && ((tab.type === 'folder' && folderIds.has(tab.resourceId)) || (tab.type === 'request' && requestIds.has(tab.resourceId))))
      .map((tab) => tab.id)
      .forEach(closeTab);
  };

  const handleStartInlineRename = (): void => {
    setActiveRenameId(renameId);
    setInlineRenameValue(item.name);
  };

  const clearInlineRename = (): void => {
    setActiveRenameId(null);
    setInlineRenameValue('');
  };

  const { handleSubmit: handleInlineRenameSubmit, handleCancel: handleInlineRenameCancel } = useInlineRename({
    isActive: activeRenameId === renameId,
    currentValue: inlineRenameValue,
    originalValue: item.name,
    inputRef: folderInputRef,
    focusTimeRef: folderFocusTimeRef,
    onComplete: clearInlineRename,
    onSubmitValue: async (nextName) => {
      if (workspace === null) {
        return;
      }

      try {
        await window.quest.workspace.renameFolder(workspace.id, collectionId, item.id, nextName);
        tabs.filter((tab) => tab.type === 'folder' && tab.collectionId === collectionId && tab.resourceId === item.id).forEach((tab) => setName(tab.id, nextName));
        await refreshWorkspace();
      } catch (error) {
        console.error('Failed to rename folder:', error);
        alert('Failed to rename folder');
      }
    },
  });

  const handleDeleteFolder = async (): Promise<void> => {
    if (workspace === null) return;
    try {
      console.log('[Folder] Deleting folder:', item.id);
      await window.quest.workspace.deleteFolder(workspace.id, collectionId, item.id);
      closeTabsForFolderDeletion();
      await refreshWorkspace();
      setDeletingFolder(false);
    } catch (error) {
      console.error('Failed to delete folder:', error);
      alert('Failed to delete folder');
    }
  };

  const handleMenuAction = (action: MenuAction): void => {
    switch (action) {
      case 'rename':
        handleStartInlineRename();
        break;
      case 'delete':
        setDeletingFolder(true);
        break;
    }
  };

  return (
    <div>
      <div
        ref={setNodeRef}
        className="collection-row"
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px', padding: '0px 8px', fontSize: '12px', borderRadius: '4px', cursor: 'grab', ...draggableStyle }}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          if ((e.target as HTMLElement | null)?.closest('button') !== null) return;
          openFolder(collectionId, protocol, item.id, item.name, true);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if ((e.target as HTMLElement | null)?.closest('button') !== null) return;
          openFolder(collectionId, protocol, item.id, item.name, false);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRightClickPosition({ x: e.clientX, y: e.clientY });
          setRightClickMenuOpen(true);
        }}
      >
        <DropTargetZones activeDragItem={activeDragItem} dropPreview={dropPreview} zones={folderDropTargets} />
        <button style={{ color: 'var(--gray-9)', cursor: 'pointer', padding: 0, background: 'transparent', border: 'none' }} onClick={() => setIsExpanded((value) => !value)}>
          {isExpanded ? <ChevronDownIcon style={{ width: '12px', height: '12px', color: 'var(--gray-9)' }} /> : <ChevronRightIcon style={{ width: '12px', height: '12px', color: 'var(--gray-9)' }} />}
        </button>
        <FolderIcon className="w-4 h-4" style={{ color: 'var(--accent-9)' }} />
        {activeRenameId === renameId ? (
          <InlineRenameField inputRef={folderInputRef} value={inlineRenameValue} onChange={setInlineRenameValue} onSubmit={handleInlineRenameSubmit} onCancel={handleInlineRenameCancel} />
        ) : (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => setIsExpanded((value) => !value)}>{item.name}</span>
        )}
        <RequestMetadataIcons resource={item} />
        <button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowAddRequest(true); }} title="Add Request"><PlusIcon className="w-4 h-4" /></button>
        <button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowAddFolder(true); }} title="Add Folder"><FolderPlusIcon className="w-4 h-4" /></button>
        <UnifiedContextMenu type="folder" item={item} trigger={<button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-10)' }}><EllipsisVerticalIcon className="w-4 h-4" /></button>} onAction={handleMenuAction} />
      </div>

      {rightClickPosition !== null && <UnifiedContextMenu type="folder" item={item} open={rightClickMenuOpen} onOpenChange={setRightClickMenuOpen} position={rightClickPosition} onAction={handleMenuAction} />}

      {isExpanded && (
        <div style={{ marginLeft: '16px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {item.items.map((subItem, index) => (
            <CollectionRequestItem key={subItem.id} item={subItem} collectionId={collectionId} parentId={item.id} itemIndex={index} protocol={protocol} activeRenameId={activeRenameId} setActiveRenameId={setActiveRenameId} inlineRenameValue={inlineRenameValue} setInlineRenameValue={setInlineRenameValue} activeDragItem={activeDragItem} dropPreview={dropPreview} />
          ))}
        </div>
      )}

      <InputDialog open={showAddRequest} onOpenChange={setShowAddRequest} title="Add Request" placeholder="Request name" onSubmit={(name) => { void (async () => {
        try {
          if (workspace === null) return;
          const requestId = await window.quest.workspace.addRequest(workspace.id, collectionId, name, item.id);
          await refreshWorkspace();
          setIsExpanded(true);
          const collection = await window.quest.workspace.loadCollection(workspace.id, collectionId);
          const newRequest = findRequestInItems(collection.items, requestId);
          if (newRequest !== null) {
            const plugin = pluginLoader.getProtocolPluginUI(collection.protocol);
            const badge = plugin !== undefined ? plugin.getRequestBadge(newRequest) : undefined;
            openRequest(collectionId, collection.protocol, newRequest.id, newRequest.name, { badge });
          }
        } catch (error) {
          console.error('Failed to add request:', error);
          alert('Failed to add request');
        }
      })(); }} />

      <InputDialog open={showAddFolder} onOpenChange={setShowAddFolder} title="Add Folder" placeholder="Folder name" onSubmit={(name) => { void (async () => {
        try {
          if (workspace === null) return;
          await window.quest.workspace.addFolder(workspace.id, collectionId, name, item.id);
          await refreshWorkspace();
          setIsExpanded(true);
        } catch (error) {
          console.error('Failed to add folder:', error);
          alert('Failed to add folder');
        }
      })(); }} />

      <ConfirmDialog open={deletingFolder} onOpenChange={setDeletingFolder} title="Delete Folder" description={`Are you sure you want to delete "${item.name}"? This will also delete all requests and subfolders inside it. This action cannot be undone.`} confirmLabel="Delete" cancelLabel="Cancel" variant="danger" onConfirm={() => { void handleDeleteFolder(); }} />
    </div>
  );
}

function CollectionLeafRequestItem({
  item,
  collectionId,
  parentId,
  itemIndex,
  protocol,
  activeRenameId,
  setActiveRenameId,
  inlineRenameValue,
  setInlineRenameValue,
  activeDragItem,
  dropPreview,
}: CollectionRequestItemProps): ReactElement {
  const requestInputRef = useRef<HTMLInputElement>(null);
  const requestFocusTimeRef = useRef<number>(0);
  const [rightClickMenuOpen, setRightClickMenuOpen] = useState(false);
  const [rightClickPosition, setRightClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [deletingRequest, setDeletingRequest] = useState(false);
  const { tabs, closeTab, openRequest } = useTabNavigation();
  const { setName } = useTabStatusActions();
  const { workspace, refreshWorkspace } = useWorkspace();
  const renameId = `request:${item.id}`;
  const dragItem = buildDragItem({ item, sourceCollectionId: collectionId, sourceParentId: parentId, sourceIndex: itemIndex });
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `drag-request:${item.id}`, data: { dragItem } });
  const draggableStyle = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.45 : 1 };
  const requestDropTargets = [
    createDropTarget({ targetCollectionId: collectionId, targetParentId: parentId, targetIndex: itemIndex, position: 'before', overType: 'request', overId: item.id }),
    createDropTarget({ targetCollectionId: collectionId, targetParentId: parentId, targetIndex: itemIndex + 1, position: 'after', overType: 'request', overId: item.id }),
  ];

  const closeTabsForRequestDeletion = (): void => {
    tabs.filter((tab) => tab.type === 'request' && tab.collectionId === collectionId && tab.resourceId === item.id).map((tab) => tab.id).forEach(closeTab);
  };

  const plugin = pluginLoader.getProtocolPluginUI(protocol);
  const badge = plugin !== undefined ? plugin.getRequestBadge(item) : undefined;

  const handleStartInlineRename = (): void => {
    setActiveRenameId(renameId);
    setInlineRenameValue(item.name);
  };

  const clearInlineRename = (): void => {
    setActiveRenameId(null);
    setInlineRenameValue('');
  };

  const { handleSubmit: handleInlineRenameSubmit, handleCancel: handleInlineRenameCancel } = useInlineRename({
    isActive: activeRenameId === renameId,
    currentValue: inlineRenameValue,
    originalValue: item.name,
    inputRef: requestInputRef,
    focusTimeRef: requestFocusTimeRef,
    onComplete: clearInlineRename,
    onSubmitValue: async (nextName) => {
      if (workspace === null) {
        return;
      }

      try {
        await window.quest.workspace.renameRequest(workspace.id, collectionId, item.id, nextName);
        tabs.filter((tab) => tab.type === 'request' && tab.collectionId === collectionId && tab.resourceId === item.id).forEach((tab) => setName(tab.id, nextName));
        await refreshWorkspace();
      } catch (error) {
        console.error('Failed to rename request:', error);
        alert('Failed to rename request');
      }
    },
  });

  const handleDeleteRequest = async (): Promise<void> => {
    if (workspace === null) return;
    try {
      await window.quest.workspace.deleteRequest(workspace.id, collectionId, item.id);
      closeTabsForRequestDeletion();
      await refreshWorkspace();
      setDeletingRequest(false);
    } catch (error) {
      console.error('Failed to delete request:', error);
      alert('Failed to delete request');
    }
  };

  const handleMenuAction = (action: MenuAction): void => {
    switch (action) {
      case 'rename':
        handleStartInlineRename();
        break;
      case 'duplicate':
        console.log('Duplicate request:', item.name);
        break;
      case 'delete':
        setDeletingRequest(true);
        break;
    }
  };

  return (
    <div>
      <div
        ref={setNodeRef}
        className="collection-row"
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px', padding: '0px 8px', fontSize: '12px', borderRadius: '4px', cursor: 'grab', ...draggableStyle }}
        {...attributes}
        {...listeners}
        onClick={() => { openRequest(collectionId, protocol, item.id, item.name, { badge, description: item.description }, true); }}
        onDoubleClick={() => { openRequest(collectionId, protocol, item.id, item.name, { badge, description: item.description }, false); }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRightClickPosition({ x: e.clientX, y: e.clientY });
          setRightClickMenuOpen(true);
        }}
      >
        <DropTargetZones activeDragItem={activeDragItem} dropPreview={dropPreview} zones={requestDropTargets} />
        {badge !== undefined ? <Badge color={badge.color as never} size="1" style={{ fontSize: '10px', fontWeight: 700 }}>{badge.primary}</Badge> : <Badge color="gray" size="1" style={{ fontSize: '10px', fontWeight: 700 }}>REQ</Badge>}
        {activeRenameId === renameId ? <InlineRenameField inputRef={requestInputRef} value={inlineRenameValue} onChange={setInlineRenameValue} onSubmit={handleInlineRenameSubmit} onCancel={handleInlineRenameCancel} /> : <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>}
        <RequestMetadataIcons resource={item} />
        <UnifiedContextMenu type="request" item={item} trigger={<button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-10)' }} onClick={(e) => e.stopPropagation()}><EllipsisVerticalIcon className="w-4 h-4" /></button>} onAction={handleMenuAction} />
      </div>

      {rightClickPosition !== null && <UnifiedContextMenu type="request" item={item} open={rightClickMenuOpen} onOpenChange={setRightClickMenuOpen} position={rightClickPosition} onAction={handleMenuAction} />}

      <ConfirmDialog open={deletingRequest} onOpenChange={setDeletingRequest} title="Delete Request" description={`Are you sure you want to delete "${item.name}"? This action cannot be undone.`} confirmLabel="Delete" cancelLabel="Cancel" variant="danger" onConfirm={() => { void handleDeleteRequest(); }} />
    </div>
  );
}
