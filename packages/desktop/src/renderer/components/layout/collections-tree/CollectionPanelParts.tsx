import { useEffect, useRef, useState, type ReactElement } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button, TextField } from '@radix-ui/themes';
import { ChevronDownIcon, ChevronRightIcon, Cog6ToothIcon, EllipsisVerticalIcon, ExclamationTriangleIcon, FolderPlusIcon, PlusIcon, PuzzlePieceIcon, RectangleStackIcon } from '@heroicons/react/24/outline';
import type { Collection, VariableValue } from '@apiquest/types';
import { pluginLoader, pluginManagerService } from '../../../services';
import { useScreenMode, useTabNavigation, useTabStatusActions, useWorkspace } from '../../../contexts';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { InputDialog } from '../../shared/InputDialog';
import { UnifiedContextMenu, type MenuAction } from '../../shared/UnifiedContextMenu';
import { VariableEditorDialog } from '../../variables/VariableEditor';
import { InlineRenameField } from './InlineRenameField';
import { CollectionRequestItem } from './CollectionTreeItems';
import { DropTargetZones } from './CollectionTreeDropTargets';
import {
  findRequestInItems,
  type CollectionPanelItemProps,
  type CollectionVariablesMap,
} from './collectionTreeTypes';
import { createDropTarget } from './treeModel';
import { useInlineRename } from './useInlineRename';

export function CollectionItem({
  collection,
  activeRenameId,
  setActiveRenameId,
  inlineRenameValue,
  setInlineRenameValue,
  activeDragItem,
  dropPreview,
}: CollectionPanelItemProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusTimeRef = useRef<number>(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [collectionData, setCollectionData] = useState<Collection | null>(null);
  const [isUnsupported, setIsUnsupported] = useState(false);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showCollectionVars, setShowCollectionVars] = useState(false);
  const [collectionVariables, setCollectionVariables] = useState<CollectionVariablesMap>({});
  const [rightClickMenuOpen, setRightClickMenuOpen] = useState(false);
  const [rightClickPosition, setRightClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [duplicatingCollection, setDuplicatingCollection] = useState(false);
  const [deletingCollection, setDeletingCollection] = useState(false);
  const { workspace, getCollection, refreshWorkspace } = useWorkspace();
  const { tabs, closeTab, openRequest, openCollection } = useTabNavigation();
  const { setName } = useTabStatusActions();
  const renameId = `collection:${collection.id}`;
  const collectionDropTarget = createDropTarget({
    targetCollectionId: collection.id,
    targetParentId: null,
    targetIndex: collectionData?.items?.length ?? 0,
    position: 'inside',
    overType: 'collection',
    overId: collection.id,
  });

  const closeTabsForCollectionDeletion = (): void => {
    tabs.filter((tab) => tab.collectionId === collection.id).map((tab) => tab.id).forEach(closeTab);
  };

  useEffect(() => {
    void getCollection(collection.id)
      .then((data) => {
        setCollectionData(data);
        if (data.variables !== undefined) {
          setCollectionVariables(data.variables);
        }

        if (data.protocol !== '') {
          const isAvailable = pluginManagerService.getAllProtocolPlugins().some((plugin) => plugin.protocol === data.protocol);
          setIsUnsupported(!isAvailable);
        }
      })
      .catch((error: unknown) => console.error('Failed to load collection:', error));
  }, [collection.id, getCollection]);

  const handleSaveCollectionVars = async (updatedVariables: Record<string, VariableValue>): Promise<void> => {
    if (workspace === null || collectionData === null) return;

    try {
      await window.quest.workspace.updateCollectionVariables(workspace.id, collection.id, updatedVariables);
      setCollectionVariables(updatedVariables);
      await refreshWorkspace();
    } catch (error) {
      console.error('Failed to save collection variables:', error);
      alert('Failed to save collection variables');
    }
  };

  const handleStartInlineRename = (): void => {
    setActiveRenameId(renameId);
    setInlineRenameValue(collectionData?.info?.name ?? collection.name);
  };

  const clearInlineRename = (): void => {
    setActiveRenameId(null);
    setInlineRenameValue('');
  };

  const { handleSubmit: handleInlineRenameSubmit, handleCancel: handleInlineRenameCancel } = useInlineRename({
    isActive: activeRenameId === renameId,
    currentValue: inlineRenameValue,
    originalValue: collectionData?.info?.name ?? collection.name,
    inputRef,
    focusTimeRef,
    onComplete: clearInlineRename,
    onSubmitValue: async (nextName) => {
      if (workspace === null) {
        return;
      }

      try {
        await window.quest.workspace.renameCollection(workspace.id, collection.id, nextName);
        setCollectionData((previous) => previous === null ? previous : ({
          ...previous,
          info: { ...previous.info, name: nextName },
        }));
        tabs.filter((tab) => tab.collectionId === collection.id && (tab.type === 'collection' || tab.type === 'runner')).forEach((tab) => setName(tab.id, nextName));
        await refreshWorkspace();
      } catch (error) {
        console.error('Failed to rename collection:', error);
        alert('Failed to rename collection');
      }
    },
  });

  const handleDuplicateCollection = async (newName: string): Promise<void> => {
    if (workspace === null) return;
    try {
      await window.quest.workspace.duplicateCollection(workspace.id, collection.id, newName.trim());
      await refreshWorkspace();
      setDuplicatingCollection(false);
    } catch (error) {
      console.error('Failed to duplicate collection:', error);
      alert('Failed to duplicate collection');
    }
  };

  const handleDeleteCollection = async (): Promise<void> => {
    if (workspace === null) return;
    try {
      await window.quest.workspace.deleteCollection(workspace.id, collection.id);
      closeTabsForCollectionDeletion();
      await refreshWorkspace();
      setDeletingCollection(false);
    } catch (error) {
      console.error('Failed to delete collection:', error);
      alert('Failed to delete collection');
    }
  };

  const handleMenuAction = (action: MenuAction): void => {
    switch (action) {
      case 'run':
        if (collectionData !== null) {
          openCollection(collection.id, collectionData.protocol, collectionData.info?.name ?? collection.name, false, 'runner');
        }
        break;
      case 'collection-variables':
        setShowCollectionVars(true);
        break;
      case 'rename':
        handleStartInlineRename();
        break;
      case 'duplicate':
        setDuplicatingCollection(true);
        break;
      case 'export':
        void (async () => {
          try {
            if (workspace !== null) {
              const result = await window.quest.workspace.exportCollection(workspace.id, collection.id);
              if (result !== null && result !== '') {
                console.log('Exported to:', result);
              }
            }
          } catch (error) {
            console.error('Failed to export collection:', error);
            alert('Failed to export collection');
          }
        })();
        break;
      case 'delete':
        setDeletingCollection(true);
        break;
    }
  };

  return (
    <div>
      <style>{`
        .collection-item:hover { background: var(--gray-3); }
        .collection-item .hover-visible { opacity: 0; }
        .collection-item:hover .hover-visible { opacity: 1; }
        .collection-row:hover { background: var(--gray-3); }
        .collection-row .hover-visible { opacity: 0; }
        .collection-row:hover .hover-visible { opacity: 1; }
        .collection-row .hover-visible:hover { background: var(--gray-4); }
      `}</style>
      <div
        className="collection-item"
        style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px', padding: '0px 8px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer' }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button') !== null) return;
          if (collectionData !== null) {
            openCollection(collection.id, collectionData.protocol, collectionData.info?.name ?? collection.name, true);
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if ((e.target as HTMLElement).closest('button') !== null) return;
          if (collectionData !== null) {
            openCollection(collection.id, collectionData.protocol, collectionData.info?.name ?? collection.name, false);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRightClickPosition({ x: e.clientX, y: e.clientY });
          setRightClickMenuOpen(true);
        }}
      >
        <DropTargetZones activeDragItem={activeDragItem} dropPreview={dropPreview} zones={[collectionDropTarget]} />
        <button style={{ color: 'var(--gray-9)', cursor: 'pointer', padding: 0, background: 'transparent', border: 'none' }} onClick={() => setIsExpanded((value) => !value)}>
          {isExpanded ? <ChevronDownIcon style={{ width: '12px', height: '12px' }} /> : <ChevronRightIcon style={{ width: '12px', height: '12px' }} />}
        </button>
        <RectangleStackIcon className="w-4 h-4" style={{ color: 'var(--accent-9)' }} />
        {activeRenameId === renameId ? (
          <InlineRenameField inputRef={inputRef} value={inlineRenameValue} onChange={setInlineRenameValue} onSubmit={handleInlineRenameSubmit} onCancel={handleInlineRenameCancel} />
        ) : (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => setIsExpanded((value) => !value)} title={isUnsupported ? `Unsupported protocol: ${collectionData?.protocol}` : undefined}>
            {collectionData?.info?.name ?? collection.name}
          </span>
        )}
        {isUnsupported && <ExclamationTriangleIcon className="w-4 h-4" style={{ color: '#ca8a04' }} title={`Protocol "${collectionData?.protocol}" not available`} />}
        <button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowAddRequest(true); }} title="Add Request"><PlusIcon className="w-4 h-4" /></button>
        <button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowAddFolder(true); }} title="Add Folder"><FolderPlusIcon className="w-4 h-4" /></button>
        <UnifiedContextMenu type="collection" item={collection} trigger={<button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-10)' }}><EllipsisVerticalIcon className="w-4 h-4" /></button>} onAction={handleMenuAction} />
      </div>

      {rightClickPosition !== null && <UnifiedContextMenu type="collection" item={collection} open={rightClickMenuOpen} onOpenChange={setRightClickMenuOpen} position={rightClickPosition} onAction={handleMenuAction} />}

      {isExpanded && collectionData !== null && (
        <div style={{ marginLeft: '16px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {collectionData.items.map((item, index) => (
            <CollectionRequestItem key={item.id} item={item} collectionId={collection.id} parentId={null} itemIndex={index} protocol={collectionData.protocol} activeRenameId={activeRenameId} setActiveRenameId={setActiveRenameId} inlineRenameValue={inlineRenameValue} setInlineRenameValue={setInlineRenameValue} activeDragItem={activeDragItem} dropPreview={dropPreview} />
          ))}
        </div>
      )}

      <InputDialog open={showAddRequest} onOpenChange={setShowAddRequest} title="Add Request" placeholder="Request name" onSubmit={(name) => { void (async () => {
        try {
          if (workspace === null) return;
          const requestId = await window.quest.workspace.addRequest(workspace.id, collection.id, name, null);
          await refreshWorkspace();
          setIsExpanded(true);
          const data = await getCollection(collection.id);
          const newRequest = findRequestInItems(data.items, requestId);
          if (newRequest !== null) {
            const plugin = pluginLoader.getProtocolPluginUI(data.protocol);
            const badge = plugin !== undefined ? plugin.getRequestBadge(newRequest) : undefined;
            openRequest(collection.id, data.protocol, newRequest.id, newRequest.name, { badge });
          }
        } catch (error) {
          console.error('Failed to add request:', error);
          alert('Failed to add request');
        }
      })(); }} />

      <InputDialog open={showAddFolder} onOpenChange={setShowAddFolder} title="Add Folder" placeholder="Folder name" onSubmit={(name) => { void (async () => {
        try {
          if (workspace === null) return;
          await window.quest.workspace.addFolder(workspace.id, collection.id, name, null);
          await refreshWorkspace();
          setIsExpanded(true);
        } catch (error) {
          console.error('Failed to add folder:', error);
          alert('Failed to add folder');
        }
      })(); }} />

      <VariableEditorDialog open={showCollectionVars} onOpenChange={setShowCollectionVars} title={`${collectionData?.info?.name ?? 'Collection'} Variables`} variables={collectionVariables} onSave={(updatedVariables) => { void handleSaveCollectionVars(updatedVariables); }} showEnabled={false} />
      <InputDialog open={duplicatingCollection} onOpenChange={setDuplicatingCollection} title="Duplicate Collection" placeholder="New collection name" defaultValue={collectionData?.info?.name !== undefined && collectionData.info.name !== '' ? `${collectionData.info.name} Copy` : `${collection.name} Copy`} onSubmit={(newName) => { void handleDuplicateCollection(newName); }} />
      <ConfirmDialog open={deletingCollection} onOpenChange={setDeletingCollection} title="Delete Collection" description={`Are you sure you want to delete "${collectionData?.info?.name ?? collection.name}"? This action cannot be undone.`} confirmLabel="Delete" cancelLabel="Cancel" variant="danger" onConfirm={() => { void handleDeleteCollection(); }} />
    </div>
  );
}

type NewCollectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewCollectionDialog({ open, onOpenChange }: NewCollectionDialogProps): ReactElement {
  const protocols = pluginManagerService.getAllProtocolPlugins();
  const hasProtocols = protocols.length > 0;
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { workspace, refreshWorkspace } = useWorkspace();
  const { setMode } = useScreenMode();
  const trimmedName = name.trim();

  const handleCreate = async (protocol: string): Promise<void> => {
    if (workspace === null || trimmedName === '') return;

    setIsCreating(true);
    try {
      await window.quest.workspace.createCollection(workspace.id, trimmedName, protocol);
      await refreshWorkspace();
      onOpenChange(false);
      setName('');
    } catch (error) {
      console.error('Failed to create collection:', error);
      alert(`Failed to create collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleGoToPlugins = (): void => {
    onOpenChange(false);
    setMode('settings', 'plugins');
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', zIndex: 50 }} />
      <Dialog.Content style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'var(--color-background)', borderRadius: '8px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', padding: '16px', width: '400px', zIndex: 50 }}>
        <Dialog.Title style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-12)', marginBottom: '12px' }}>New Collection</Dialog.Title>
        <Dialog.Description style={{ fontSize: '12px', color: 'var(--gray-9)', marginBottom: '16px' }}>Create a new API collection</Dialog.Description>

        {!hasProtocols ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '12px', background: 'var(--amber-3)', border: '1px solid var(--amber-6)', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <PuzzlePieceIcon style={{ width: '14px', height: '14px', color: 'var(--amber-11)', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--amber-11)' }}>No protocol plugins installed</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--gray-11)', margin: 0, lineHeight: 1.5 }}>A protocol plugin is required to create a collection. Install one from the Plugin Manager to get started.</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Dialog.Close asChild><Button variant="soft" size="1">Cancel</Button></Dialog.Close>
              <Button size="1" onClick={handleGoToPlugins}><Cog6ToothIcon style={{ width: '12px', height: '12px' }} />Open Plugin Manager</Button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--gray-12)', marginBottom: '4px' }}>Name</label>
              <TextField.Root value={name} onChange={(e) => setName(e.target.value)} placeholder="My API" size="1" autoFocus />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--gray-12)', marginBottom: '8px' }}>Protocol</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {protocols.map((plugin) => (
                  <button key={plugin.protocol} onClick={() => { void handleCreate(plugin.protocol); }} disabled={trimmedName === '' || isCreating} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', fontSize: '12px', background: 'transparent', borderRadius: '6px', border: '1px solid var(--gray-6)', cursor: trimmedName === '' || isCreating ? 'not-allowed' : 'pointer', opacity: trimmedName === '' || isCreating ? 0.5 : 1 }}>
                    <span style={{ fontSize: '16px' }}>{plugin.icon}</span>
                    <div style={{ flex: 1, textAlign: 'left' }}><div style={{ fontSize: '10px', color: 'var(--gray-9)' }}>{plugin.protocol.toUpperCase()} Collection</div></div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Dialog.Close asChild><Button variant="soft" size="1">Cancel</Button></Dialog.Close></div>
          </>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
