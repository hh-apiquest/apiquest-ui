// CollectionsPanel - Collections tree with all collection management logic
import { useState, useEffect, useRef, type ReactElement } from 'react';
import { useWorkspace, useTabNavigation, useScreenMode, useTabStatusActions } from '../../contexts';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import * as Dialog from '@radix-ui/react-dialog';
import { TextField, Button, Badge, DropdownMenu } from '@radix-ui/themes';
import { CSS } from '@dnd-kit/utilities';
import {
  PlusIcon,
  FolderPlusIcon,
  FolderIcon,
  EllipsisVerticalIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  ArrowUpTrayIcon,
  RectangleStackIcon,
  PuzzlePieceIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { pluginManagerService, pluginLoader } from '../../services';
import type { Collection, CollectionItem, Folder, Request, VariableValue } from '@apiquest/types';
import { VariableEditorDialog } from '../variables/VariableEditor';
import { InputDialog } from '../shared/InputDialog';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { UnifiedContextMenu, type MenuAction } from '../shared/UnifiedContextMenu';
import { RequestMetadataIcons } from '../shared/RequestMetadataIcons';
import { InlineRenameField } from './collections-tree/InlineRenameField';
import { useInlineRename } from './collections-tree/useInlineRename';
import { getDropIndicatorStyle } from './collections-tree/dropIndicators';
import { buildDragItem, createDropTarget, isValidDropTarget } from './collections-tree/treeModel';
import type { TreeDragItem, TreeDropPreview, TreeDropTarget } from './collections-tree/types';

/** A single import action item shown in the Import dropdown. */
type ImportAction = {
  pluginPackageName: string;
  format: string;
  label: string;
  fileExtensions: string[];
  sourceKind: 'file' | 'directory';
};

type WorkspaceCollectionSummary = {
  id: string;
  name: string;
};

function isFolderItem(item: CollectionItem): item is Folder {
  return item.type === 'folder';
}

function isRequestItem(item: CollectionItem): item is Request {
  return item.type === 'request';
}

function findRequestInItems(items: CollectionItem[], requestId: string): Request | null {
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

/** Build the list of available import actions from installed importer plugins. */
function getImportActions(): ImportAction[] {
  const actions: ImportAction[] = [];
  for (const { packageName, plugin } of pluginManagerService.getAllImporterPluginEntries()) {
    for (const format of plugin.importFormats) {
      const ext = plugin.fileExtensions[format];
      if (ext === undefined) continue;
      actions.push({
        pluginPackageName: packageName,
        format,
        label: format, // plugins can enrich this later via a label map
        fileExtensions: ext.extensions,
        sourceKind: ext.kind,
      });
    }
  }
  return actions;
}

export function CollectionsPanel(): ReactElement | null {
  const { workspace, refreshWorkspace } = useWorkspace();
  const { tabs, closeTab } = useTabNavigation();
  const { setMode } = useScreenMode();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [activeRenameId, setActiveRenameId] = useState<string | null>(null);
  const [inlineRenameValue, setInlineRenameValue] = useState('');
  const [activeDragItem, setActiveDragItem] = useState<TreeDragItem | null>(null);
  const [dropPreview, setDropPreview] = useState<TreeDropPreview>({ overZoneId: null, target: null, isValid: false });
  // True when at least one protocol plugin is installed and enabled (active).
  // Used to show/hide the "No protocol plugins enabled" banner.
  const [hasProtocolPlugins, setHasProtocolPlugins] = useState(
    () => pluginManagerService.getAllProtocolPlugins().length > 0
  );
  // Import actions list rebuilt when plugins change
  const [importActions, setImportActions] = useState<ImportAction[]>(getImportActions);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  useEffect(() => {
    const checkPlugins = (): void => {
      setHasProtocolPlugins(pluginManagerService.getAllProtocolPlugins().length > 0);
      setImportActions(getImportActions());
    };
    pluginManagerService.on('pluginsReloaded', checkPlugins);
    pluginManagerService.on('pluginsLoaded', checkPlugins);
    pluginManagerService.on('protocolPluginRegistered', checkPlugins);
    pluginManagerService.on('importerPluginRegistered', checkPlugins);
    return () => {
      pluginManagerService.off('pluginsReloaded', checkPlugins);
      pluginManagerService.off('pluginsLoaded', checkPlugins);
      pluginManagerService.off('protocolPluginRegistered', checkPlugins);
      pluginManagerService.off('importerPluginRegistered', checkPlugins);
    };
  }, []);

  if (workspace === null) return null;

  const clearDragState = (): void => {
    setActiveDragItem(null);
    setDropPreview({ overZoneId: null, target: null, isValid: false });
  };

  const closeTabsForMovedDragItem = (dragItem: TreeDragItem, target: TreeDropTarget): void => {
    if (dragItem.sourceCollectionId === target.targetCollectionId) {
      return;
    }

    const folderIds = new Set<string>([dragItem.id, ...dragItem.descendantFolderIds]);
    const requestIds = new Set<string>(dragItem.type === 'request' ? [dragItem.id] : dragItem.descendantRequestIds);

    tabs
      .filter((tab) => tab.collectionId === dragItem.sourceCollectionId)
      .filter((tab) => (
        (tab.type === 'folder' && folderIds.has(tab.resourceId))
        || (tab.type === 'request' && requestIds.has(tab.resourceId))
      ))
      .forEach((tab) => closeTab(tab.id));
  };

  const handleDragStart = (event: DragStartEvent): void => {
    const dragItem = event.active.data.current?.dragItem as TreeDragItem | undefined;
    setActiveDragItem(dragItem ?? null);
  };

  const handleDragOver = (event: DragOverEvent): void => {
    const dragItem = event.active.data.current?.dragItem as TreeDragItem | undefined;
    const target = event.over?.data.current?.dropTarget as TreeDropTarget | undefined;
    const resolvedDragItem = dragItem ?? activeDragItem;
    const resolvedTarget = target ?? null;

    setDropPreview({
      overZoneId: event.over?.id !== undefined ? String(event.over.id) : null,
      target: resolvedTarget,
      isValid: isValidDropTarget(resolvedDragItem ?? null, resolvedTarget),
    });
  };

  const handleDragEnd = async (event: DragEndEvent): Promise<void> => {
    const dragItem = event.active.data.current?.dragItem as TreeDragItem | undefined;
    const target = event.over?.data.current?.dropTarget as TreeDropTarget | undefined;
    const resolvedDragItem = dragItem ?? activeDragItem;
    const resolvedTarget = target ?? dropPreview.target;
    const isValid = isValidDropTarget(resolvedDragItem ?? null, resolvedTarget ?? null);

    if (resolvedDragItem === null || resolvedDragItem === undefined || resolvedTarget === null || resolvedTarget === undefined || !isValid) {
      clearDragState();
      return;
    }

    try {
      if (resolvedDragItem.type === 'folder') {
        await window.quest.workspace.moveFolder(
          workspace.id,
          resolvedDragItem.sourceCollectionId,
          resolvedDragItem.id,
          resolvedTarget.targetCollectionId,
          resolvedTarget.targetParentId,
          resolvedTarget.targetIndex,
        );
      } else {
        await window.quest.workspace.moveRequest(
          workspace.id,
          resolvedDragItem.sourceCollectionId,
          resolvedDragItem.id,
          resolvedTarget.targetCollectionId,
          resolvedTarget.targetParentId,
          resolvedTarget.targetIndex,
        );
      }

      closeTabsForMovedDragItem(resolvedDragItem, resolvedTarget);
      await refreshWorkspace();
    } catch (error) {
      console.error('Failed to move tree item:', error);
      alert('Failed to move item');
    } finally {
      clearDragState();
    }
  };

  /**
   * Invoke the importer pipeline for the given plugin format.
   * The main process shows the file/directory dialog, reads the source,
   * and routes conversion through the plugin's hostBundle.
   */
  const handleImportWithFormat = async (
    pluginPackageName: string,
    format: string,
    fileExtensions: string[],
    sourceKind: 'file' | 'directory'
  ): Promise<void> => {
    try {
      const result = await window.quest.workspace.importCollection(workspace.id, {
        pluginPackageName,
        format,
        fileExtensions,
        sourceKind
      });
      if (result === null) return; // User cancelled the OS file dialog
      if (!result.success) {
        console.error('[CollectionsPanel] Import failed:', result.errors?.join('\n'));
        return;
      }
      if (result.warnings !== undefined && result.warnings.length > 0) {
        console.warn('[CollectionsPanel] Import warnings:', result.warnings);
      }
      await refreshWorkspace();
    } catch (error) {
      // Unexpected IPC-level error (not a plugin-reported failure).
      // The plugin may have already shown a ui.alert before this propagated.
      console.error('[CollectionsPanel] Import failed:', error);
    }
  };

  const handlePanelClick = (e: React.MouseEvent): void => {
    // Submit active rename when clicking on empty space
    if (activeRenameId !== null && e.target === e.currentTarget) {
      setActiveRenameId(null);
      setInlineRenameValue('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: '4px', padding: 0, borderBottom: '1px solid var(--gray-6)' }}>
        <TextField.Root
          size="1"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <button
              style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--gray-3)', borderRadius: '4px', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
              title="Import Collection"
            >
              <ArrowUpTrayIcon style={{ width: '12px', height: '12px' }} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content size="1">
            {importActions.length === 0 ? (
              <DropdownMenu.Item disabled>No importers installed</DropdownMenu.Item>
            ) : (
              importActions.map((action) => (
                <DropdownMenu.Item
                  key={`${action.pluginPackageName}::${action.format}`}
                  onSelect={() => {
                    void handleImportWithFormat(
                      action.pluginPackageName,
                      action.format,
                      action.fileExtensions,
                      action.sourceKind
                    );
                  }}
                >
                  {action.label}
                </DropdownMenu.Item>
              ))
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        <button
          onClick={() => setShowNewCollection(true)}
          style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--accent-9)', color: 'white', borderRadius: '4px', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
          title="New Collection"
        >
          <PlusIcon style={{ width: '12px', height: '12px' }} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }} onClick={handlePanelClick}>
        {/* No plugins installed banner - shown on clean install before any plugins are added */}
        {!hasProtocolPlugins && (
          <div style={{
            margin: '8px',
            padding: '12px',
            background: 'var(--amber-3)',
            borderRadius: '6px',
            border: '1px solid var(--amber-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PuzzlePieceIcon style={{ width: '14px', height: '14px', color: 'var(--amber-11)', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--amber-11)' }}>No protocol plugins installed or enabled</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--gray-11)', lineHeight: 1.4 }}>
              Install and enable a protocol plugin to start creating collections and making API requests.
            </div>
            <button
              onClick={() => setMode('settings', 'plugins')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 500,
                background: 'var(--accent-9)',
                color: 'white',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                alignSelf: 'flex-start'
              }}
            >
              <Cog6ToothIcon style={{ width: '12px', height: '12px' }} />
              Open Settings - Plugins
            </button>
          </div>
        )}

        {workspace.collections.length === 0 && hasProtocolPlugins ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '128px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-9)', marginBottom: '8px' }}>No collections</div>
            <div style={{ fontSize: '10px', color: 'var(--gray-9)' }}>Click + to create one</div>
          </div>
        ) : workspace.collections.length > 0 ? (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={(event) => { void handleDragEnd(event); }} onDragCancel={clearDragState}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px' }}>
              {workspace.collections
                .filter((collection) => searchQuery === '' || collection.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .sort((a, b) => {
                  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                })
                .map((collection) => (
                  <CollectionItem
                    key={collection.id}
                    collection={collection}
                    activeRenameId={activeRenameId}
                    setActiveRenameId={setActiveRenameId}
                    inlineRenameValue={inlineRenameValue}
                    setInlineRenameValue={setInlineRenameValue}
                    activeDragItem={activeDragItem}
                    dropPreview={dropPreview}
                  />
                ))}
            </div>
          </DndContext>
        ) : null}
      </div>

      {/* New Collection Dialog */}
      <NewCollectionDialog open={showNewCollection} onOpenChange={setShowNewCollection} />
    </div>
  );
}

function CollectionItem({ 
  collection,
  activeRenameId,
  setActiveRenameId,
  inlineRenameValue,
  setInlineRenameValue,
  activeDragItem,
  dropPreview,
}: { 
  collection: WorkspaceCollectionSummary;
  activeRenameId: string | null;
  setActiveRenameId: (id: string | null) => void;
  inlineRenameValue: string;
  setInlineRenameValue: (value: string) => void;
  activeDragItem: TreeDragItem | null;
  dropPreview: TreeDropPreview;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusTimeRef = useRef<number>(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [collectionData, setCollectionData] = useState<Collection | null>(null);
  const [isUnsupported, setIsUnsupported] = useState(false);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showCollectionVars, setShowCollectionVars] = useState(false);
  const [collectionVariables, setCollectionVariables] = useState<Record<string, VariableValue>>({});
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
    const tabIdsToClose = tabs
      .filter(tab => tab.collectionId === collection.id)
      .map(tab => tab.id);

    tabIdsToClose.forEach(closeTab);
  };

  // Load collection data and check plugin availability
  useEffect(() => {
    console.log('[CollectionItem] Loading collection data for:', collection.id, collection.name);
    getCollection(collection.id)
      .then((data) => {
        console.log('[CollectionItem] Received collection data:', {
          id: collection.id,
          name: data.info?.name,
          itemsCount: data.items.length,
          items: data.items.map((item) => ({ id: item.id, name: item.name, type: item.type }))
        });
        setCollectionData(data);
        
        // Load collection variables
        if (data.variables !== undefined) {
          setCollectionVariables(data.variables);
        }
        
        // Check if protocol plugin is available
        const protocol = data.protocol;
        if (protocol !== '') {
          const availablePlugins = pluginManagerService.getAllProtocolPlugins();
          const isAvailable = availablePlugins.some((plugin) => plugin.protocol === protocol);
          setIsUnsupported(!isAvailable);
        }
      })
      .catch((error: unknown) => console.error('Failed to load collection:', error));
  }, [collection.id, collection, getCollection]);

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
        setCollectionData((previous) => {
          if (previous === null) {
            return previous;
          }

          return {
            ...previous,
            info: {
              ...previous.info,
              name: nextName,
            },
          };
        });

        tabs
          .filter((tab) => tab.collectionId === collection.id && (tab.type === 'collection' || tab.type === 'runner'))
          .forEach((tab) => setName(tab.id, nextName));

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
        // Open collection tab with Runner tab active
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
            openCollection(collection.id, collectionData.protocol, collectionData.info?.name ?? collection.name, true); // single-click = temporary
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation(); // Prevent onClick from firing
          if ((e.target as HTMLElement).closest('button') !== null) return;
          if (collectionData !== null) {
            openCollection(collection.id, collectionData.protocol, collectionData.info?.name ?? collection.name, false); // double-click = permanent
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRightClickPosition({ x: e.clientX, y: e.clientY });
          setRightClickMenuOpen(true);
        }}
      >
        <DropTargetZones
          activeDragItem={activeDragItem}
          dropPreview={dropPreview}
          zones={[collectionDropTarget]}
        />
        <button
          style={{ color: 'var(--gray-9)', cursor: 'pointer', padding: 0, background: 'transparent', border: 'none' }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronDownIcon style={{ width: '12px', height: '12px' }} /> : <ChevronRightIcon style={{ width: '12px', height: '12px' }} />}
        </button>
        <RectangleStackIcon className="w-4 h-4" style={{ color: 'var(--accent-9)' }} />
        
        {activeRenameId === renameId ? (
          <InlineRenameField
            inputRef={inputRef}
            value={inlineRenameValue}
            onChange={setInlineRenameValue}
            onSubmit={handleInlineRenameSubmit}
            onCancel={handleInlineRenameCancel}
          />
        ) : (
          <span 
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
            onClick={() => setIsExpanded(!isExpanded)}
            title={isUnsupported ? `Unsupported protocol: ${collectionData?.protocol}` : undefined}
          >
            {collectionData?.info?.name ?? collection.name}
          </span>
        )}
        
        {/* Unsupported indicator */}
        {isUnsupported && (
          <ExclamationTriangleIcon 
            className="w-4 h-4"
            style={{ color: '#ca8a04' }}
            title={`Protocol "${collectionData?.protocol}" not available`}
          />
        )}
        
        <button 
          className="hover-visible"
          style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            setShowAddRequest(true);
          }}
          title="Add Request"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
        
        <button 
          className="hover-visible"
          style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            setShowAddFolder(true);
          }}
          title="Add Folder"
        >
          <FolderPlusIcon className="w-4 h-4" />
        </button>
        
        <UnifiedContextMenu
          type="collection"
          item={collection}
          trigger={
            <button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-10)' }}>
              <EllipsisVerticalIcon className="w-4 h-4" />
            </button>
          }
          onAction={(action) => { void handleMenuAction(action); }}
        />
      </div>

      {/* Right-click menu */}
      {rightClickPosition !== null && (
        <UnifiedContextMenu
          type="collection"
          item={collection}
          open={rightClickMenuOpen}
          onOpenChange={setRightClickMenuOpen}
          position={rightClickPosition}
          onAction={(action) => { void handleMenuAction(action); }}
        />
      )}

      {isExpanded && collectionData !== null && (
        <div style={{ marginLeft: '16px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {collectionData.items.map((item, index) => (
              <CollectionRequestItem 
                key={item.id} 
                item={item} 
                collectionId={collection.id}
                parentId={null}
                itemIndex={index}
                protocol={collectionData.protocol}
                activeRenameId={activeRenameId}
                setActiveRenameId={setActiveRenameId}
                inlineRenameValue={inlineRenameValue}
                setInlineRenameValue={setInlineRenameValue}
                activeDragItem={activeDragItem}
                dropPreview={dropPreview}
              />
            ))}
        </div>
      )}
      
      {/* Add Request Dialog */}
      <InputDialog
        open={showAddRequest}
        onOpenChange={setShowAddRequest}
        title="Add Request"
        placeholder="Request name"
        onSubmit={(name) => {
          void (async () => {
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
          })();
        }}
      />

      {/* Add Folder Dialog */}
      <InputDialog
        open={showAddFolder}
        onOpenChange={setShowAddFolder}
        title="Add Folder"
        placeholder="Folder name"
        onSubmit={(name) => {
          void (async () => {
            try {
              if (workspace === null) return;
              console.log('[CollectionItem] Adding folder:', { name, collectionId: collection.id });
              await window.quest.workspace.addFolder(workspace.id, collection.id, name, null);
              console.log('[CollectionItem] Folder added, refreshing workspace...');
              await refreshWorkspace();
              setIsExpanded(true);
              console.log('[CollectionItem] Workspace refreshed');
            } catch (error) {
              console.error('Failed to add folder:', error);
              alert('Failed to add folder');
            }
          })();
        }}
      />

      {/* Collection Variables Dialog */}
      <VariableEditorDialog
        open={showCollectionVars}
        onOpenChange={setShowCollectionVars}
        title={`${collectionData?.info?.name ?? 'Collection'} Variables`}
        variables={collectionVariables}
        onSave={(updatedVariables) => { void handleSaveCollectionVars(updatedVariables); }}
        showEnabled={false}
      />

      {/* Duplicate Collection Dialog */}
      <InputDialog
        open={duplicatingCollection}
        onOpenChange={setDuplicatingCollection}
        title="Duplicate Collection"
        placeholder="New collection name"
        defaultValue={collectionData?.info?.name !== undefined && collectionData.info.name !== '' ? `${collectionData.info.name} Copy` : `${collection.name} Copy`}
        onSubmit={(newName) => { void handleDuplicateCollection(newName); }}
      />

      {/* Delete Collection Dialog */}
      <ConfirmDialog
        open={deletingCollection}
        onOpenChange={setDeletingCollection}
        title="Delete Collection"
        description={`Are you sure you want to delete "${collectionData?.info?.name ?? collection.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => { void handleDeleteCollection(); }}
      />
    </div>
  );
}

type CollectionTreeItemProps = {
  item: CollectionItem;
  collectionId: string;
  parentId: string | null;
  itemIndex: number;
  protocol: string;
  activeRenameId: string | null;
  setActiveRenameId: (id: string | null) => void;
  inlineRenameValue: string;
  setInlineRenameValue: (value: string) => void;
  activeDragItem: TreeDragItem | null;
  dropPreview: TreeDropPreview;
};

function CollectionRequestItem(props: CollectionTreeItemProps): ReactElement {
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
}: Omit<CollectionTreeItemProps, 'item'> & { item: Folder }): ReactElement {
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
      console.log('[Folder] Folder deleted, refreshing workspace...');
      await refreshWorkspace();
      console.log('[Folder] Workspace refreshed');
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
        <button
          style={{ color: 'var(--gray-9)', cursor: 'pointer', padding: 0, background: 'transparent', border: 'none' }}
          onClick={() => setIsExpanded((value) => !value)}
        >
          {isExpanded ? <ChevronDownIcon style={{ width: '12px', height: '12px', color: 'var(--gray-9)' }} /> : <ChevronRightIcon style={{ width: '12px', height: '12px', color: 'var(--gray-9)' }} />}
        </button>
        <FolderIcon className="w-4 h-4" style={{ color: 'var(--accent-9)' }} />
        {activeRenameId === renameId ? (
          <InlineRenameField inputRef={folderInputRef} value={inlineRenameValue} onChange={setInlineRenameValue} onSubmit={handleInlineRenameSubmit} onCancel={handleInlineRenameCancel} />
        ) : (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} onClick={() => setIsExpanded((value) => !value)}>
            {item.name}
          </span>
        )}
        <RequestMetadataIcons resource={item} />
        <button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowAddRequest(true); }} title="Add Request">
          <PlusIcon className="w-4 h-4" />
        </button>
        <button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowAddFolder(true); }} title="Add Folder">
          <FolderPlusIcon className="w-4 h-4" />
        </button>
        <UnifiedContextMenu
          type="folder"
          item={item}
          trigger={<button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-10)' }}><EllipsisVerticalIcon className="w-4 h-4" /></button>}
          onAction={(action) => { handleMenuAction(action); }}
        />
      </div>

      {rightClickPosition !== null && (
        <UnifiedContextMenu type="folder" item={item} open={rightClickMenuOpen} onOpenChange={setRightClickMenuOpen} position={rightClickPosition} onAction={(action) => { handleMenuAction(action); }} />
      )}

      {isExpanded && (
        <div style={{ marginLeft: '16px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {item.items.map((subItem, index) => (
            <CollectionRequestItem
              key={subItem.id}
              item={subItem}
              collectionId={collectionId}
              parentId={item.id}
              itemIndex={index}
              protocol={protocol}
              activeRenameId={activeRenameId}
              setActiveRenameId={setActiveRenameId}
              inlineRenameValue={inlineRenameValue}
              setInlineRenameValue={setInlineRenameValue}
              activeDragItem={activeDragItem}
              dropPreview={dropPreview}
            />
          ))}
        </div>
      )}

      <InputDialog
        open={showAddRequest}
        onOpenChange={setShowAddRequest}
        title="Add Request"
        placeholder="Request name"
        onSubmit={(name) => {
          void (async () => {
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
          })();
        }}
      />

      <InputDialog
        open={showAddFolder}
        onOpenChange={setShowAddFolder}
        title="Add Folder"
        placeholder="Folder name"
        onSubmit={(name) => {
          void (async () => {
            try {
              if (workspace === null) return;
              await window.quest.workspace.addFolder(workspace.id, collectionId, name, item.id);
              await refreshWorkspace();
              setIsExpanded(true);
            } catch (error) {
              console.error('Failed to add folder:', error);
              alert('Failed to add folder');
            }
          })();
        }}
      />

      <ConfirmDialog
        open={deletingFolder}
        onOpenChange={setDeletingFolder}
        title="Delete Folder"
        description={`Are you sure you want to delete "${item.name}"? This will also delete all requests and subfolders inside it. This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => { void handleDeleteFolder(); }}
      />
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
}: Omit<CollectionTreeItemProps, 'item'> & { item: Request }): ReactElement {
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `drag-request:${item.id}`,
    data: { dragItem },
  });
  const draggableStyle = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.45 : 1,
  };
  const requestDropTargets = [
    createDropTarget({ targetCollectionId: collectionId, targetParentId: parentId, targetIndex: itemIndex, position: 'before', overType: 'request', overId: item.id }),
    createDropTarget({ targetCollectionId: collectionId, targetParentId: parentId, targetIndex: itemIndex + 1, position: 'after', overType: 'request', overId: item.id }),
  ];

  const closeTabsForRequestDeletion = (): void => {
    tabs.filter((tab) => tab.type === 'request' && tab.collectionId === collectionId && tab.resourceId === item.id).map((tab) => tab.id).forEach(closeTab);
  };

  const plugin = pluginLoader.getProtocolPluginUI(protocol);
  const badge = plugin !== undefined ? plugin.getRequestBadge(item) : undefined;

  const handleClick = (): void => {
    openRequest(collectionId, protocol, item.id, item.name, { badge, description: item.description }, true);
  };

  const handleDoubleClick = (): void => {
    openRequest(collectionId, protocol, item.id, item.name, { badge, description: item.description }, false);
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
      console.log('[Request] Deleting request:', item.id);
      await window.quest.workspace.deleteRequest(workspace.id, collectionId, item.id);
      closeTabsForRequestDeletion();
      console.log('[Request] Request deleted, refreshing workspace...');
      await refreshWorkspace();
      console.log('[Request] Workspace refreshed');
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
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRightClickPosition({ x: e.clientX, y: e.clientY });
          setRightClickMenuOpen(true);
        }}
      >
        <DropTargetZones activeDragItem={activeDragItem} dropPreview={dropPreview} zones={requestDropTargets} />
        {badge !== undefined ? <Badge color="gray" size="1" style={{ fontSize: '10px', fontWeight: 700 }}>{badge.primary}</Badge> : <Badge color="gray" size="1" style={{ fontSize: '10px', fontWeight: 700 }}>REQ</Badge>}
        {activeRenameId === renameId ? (
          <InlineRenameField inputRef={requestInputRef} value={inlineRenameValue} onChange={setInlineRenameValue} onSubmit={handleInlineRenameSubmit} onCancel={handleInlineRenameCancel} />
        ) : (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
        )}
        <RequestMetadataIcons resource={item} />
        <UnifiedContextMenu
          type="request"
          item={item}
          trigger={<button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-10)' }} onClick={(e) => e.stopPropagation()}><EllipsisVerticalIcon className="w-4 h-4" /></button>}
          onAction={(action) => { handleMenuAction(action); }}
        />
      </div>

      {rightClickPosition !== null && (
        <UnifiedContextMenu type="request" item={item} open={rightClickMenuOpen} onOpenChange={setRightClickMenuOpen} position={rightClickPosition} onAction={(action) => { handleMenuAction(action); }} />
      )}

      <ConfirmDialog
        open={deletingRequest}
        onOpenChange={setDeletingRequest}
        title="Delete Request"
        description={`Are you sure you want to delete "${item.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => { void handleDeleteRequest(); }}
      />
    </div>
  );
}

function DropTargetZones({
  activeDragItem,
  dropPreview,
  zones,
}: {
  activeDragItem: TreeDragItem | null;
  dropPreview: TreeDropPreview;
  zones: TreeDropTarget[];
}): ReactElement | null {
  if (activeDragItem === null) {
    return null;
  }

  return (
    <>
      {zones.map((zone) => (
        <DropTargetZone key={zone.zoneId} zone={zone} dropPreview={dropPreview} />
      ))}
    </>
  );
}

function DropTargetZone({ zone, dropPreview }: { zone: TreeDropTarget; dropPreview: TreeDropPreview }): ReactElement {
  const { setNodeRef } = useDroppable({
    id: zone.zoneId,
    data: { dropTarget: zone },
  });

  const isOver = dropPreview.overZoneId === zone.zoneId;
  const style = getDropIndicatorStyle(isOver, dropPreview.isValid, zone.position);

  if (zone.position === 'before') {
    return <div ref={setNodeRef} style={{ position: 'absolute', left: 0, right: 0, top: -2, height: 6, zIndex: 3, ...style }} />;
  }

  if (zone.position === 'after') {
    return <div ref={setNodeRef} style={{ position: 'absolute', left: 0, right: 0, bottom: -2, height: 6, zIndex: 3, ...style }} />;
  }

  return <div ref={setNodeRef} style={{ position: 'absolute', inset: 0, zIndex: 2, ...style }} />;
}

function NewCollectionDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
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
      // Use IPC to create collection
      await window.quest.workspace.createCollection(workspace.id, trimmedName, protocol);

      // Refresh workspace to show new collection
      await refreshWorkspace();

      // Close dialog and reset
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
          <Dialog.Title style={{ fontSize: '14px', fontWeight: 600, color: 'var(--gray-12)', marginBottom: '12px' }}>
            New Collection
          </Dialog.Title>
          <Dialog.Description style={{ fontSize: '12px', color: 'var(--gray-9)', marginBottom: '16px' }}>
            Create a new API collection
          </Dialog.Description>

          {!hasProtocols ? (
            /* No protocol plugins installed */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                padding: '12px',
                background: 'var(--amber-3)',
                border: '1px solid var(--amber-6)',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <PuzzlePieceIcon style={{ width: '14px', height: '14px', color: 'var(--amber-11)', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--amber-11)' }}>No protocol plugins installed</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--gray-11)', margin: 0, lineHeight: 1.5 }}>
                  A protocol plugin is required to create a collection. Install one from the Plugin Manager to get started.
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Dialog.Close asChild>
                  <Button variant="soft" size="1">Cancel</Button>
                </Dialog.Close>
                <Button size="1" onClick={handleGoToPlugins}>
                  <Cog6ToothIcon style={{ width: '12px', height: '12px' }} />
                  Open Plugin Manager
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Collection Name */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--gray-12)', marginBottom: '4px' }}>Name</label>
                <TextField.Root
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My API"
                  size="1"
                  autoFocus
                />
              </div>

              {/* Protocol Selection */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--gray-12)', marginBottom: '8px' }}>Protocol</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {protocols.map((plugin) => (
                    <button
                      key={plugin.protocol}
                      onClick={() => { void handleCreate(plugin.protocol); }}
                      disabled={trimmedName === '' || isCreating}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', fontSize: '12px', background: 'transparent', borderRadius: '6px', border: '1px solid var(--gray-6)', cursor: trimmedName === '' || isCreating ? 'not-allowed' : 'pointer', opacity: trimmedName === '' || isCreating ? 0.5 : 1 }}
                    >
                      <span style={{ fontSize: '16px' }}>{plugin.icon}</span>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontSize: '10px', color: 'var(--gray-9)' }}>{plugin.protocol.toUpperCase()} Collection</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Dialog.Close asChild>
                  <Button variant="soft" size="1">
                    Cancel
                  </Button>
                </Dialog.Close>
              </div>
            </>
          )}
        </Dialog.Content>
    </Dialog.Root>
  );
}
