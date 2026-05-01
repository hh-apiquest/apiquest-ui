// CollectionsPanel - Collections tree with all collection management logic
import { useState, useEffect, type ReactElement } from 'react';
import { useWorkspace, useTabNavigation, useScreenMode, useTabStatusActions, useToast } from '../../contexts';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { TextField, DropdownMenu } from '@radix-ui/themes';
import {
  PlusIcon,
  ArrowUpTrayIcon,
  PuzzlePieceIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { pluginManagerService } from '../../services';
import { isValidDropTarget } from './collections-tree/treeModel';
import type { TreeDragItem, TreeDropPreview, TreeDropTarget } from './collections-tree/types';
import { CollectionItem, NewCollectionDialog } from './collections-tree/CollectionPanelParts';
import {
  type WorkspaceCollectionSummary,
} from './collections-tree/collectionTreeTypes';

/** A single import action item shown in the Import dropdown. */
type ImportAction = {
  pluginPackageName: string;
  format: string;
  label: string;
  fileExtensions: string[];
  sourceKind: 'file' | 'directory';
};

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
  const toast = useToast();
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
      toast.error('Failed to move item');
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

