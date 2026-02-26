// CollectionsPanel - Collections tree with all collection management logic
import { useState, useEffect, useRef } from 'react';
import { useWorkspace, useTabNavigation } from '../../contexts';
import * as Dialog from '@radix-ui/react-dialog';
import { TextField, Button, Badge } from '@radix-ui/themes';
import {
  PlusIcon,
  FolderPlusIcon,
  EllipsisVerticalIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  ExclamationTriangleIcon,
  ArrowUpTrayIcon,
  RectangleStackIcon
} from '@heroicons/react/24/outline';
import { pluginManagerService, pluginLoader } from '../../services';
import type { Variable } from '@apiquest/types';
import { VariableEditorDialog } from '../variables/VariableEditor';
import { InputDialog } from '../shared/InputDialog';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { UnifiedContextMenu, type MenuAction } from '../shared/UnifiedContextMenu';
import { RequestMetadataIcons } from '../shared/RequestMetadataIcons';

export function CollectionsPanel() {
  const { workspace, refreshWorkspace } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [activeRenameId, setActiveRenameId] = useState<string | null>(null);
  const [inlineRenameValue, setInlineRenameValue] = useState('');

  if (!workspace) return null;

  const handleImport = async () => {
    try {
      const result = await window.quest.workspace.importCollection(workspace.id);
      if (result) {
        await refreshWorkspace();
      }
    } catch (error) {
      console.error('Failed to import collection:', error);
      alert('Failed to import collection');
    }
  };

  const handlePanelClick = (e: React.MouseEvent) => {
    // Submit active rename when clicking on empty space
    if (activeRenameId && e.target === e.currentTarget) {
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
        <button
          onClick={handleImport}
          style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--gray-3)', borderRadius: '4px', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
          title="Import Collection"
        >
          <ArrowUpTrayIcon style={{ width: '12px', height: '12px' }} />
        </button>
        <button
          onClick={() => setShowNewCollection(true)}
          style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--accent-9)', color: 'white', borderRadius: '4px', border: 'none', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
          title="New Collection"
        >
          <PlusIcon style={{ width: '12px', height: '12px' }} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }} onClick={handlePanelClick}>
        {workspace.collections.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '128px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--gray-9)', marginBottom: '8px' }}>No collections</div>
            <div style={{ fontSize: '10px', color: 'var(--gray-9)' }}>Click + to create one</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px' }}>
            {workspace.collections
              .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
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
                />
              ))}
          </div>
        )}
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
  setInlineRenameValue
}: { 
  collection: any;
  activeRenameId: string | null;
  setActiveRenameId: (id: string | null) => void;
  inlineRenameValue: string;
  setInlineRenameValue: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusTimeRef = useRef<number>(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [collectionData, setCollectionData] = useState<any>(null);
  const [isUnsupported, setIsUnsupported] = useState(false);
  const [showAddRequest, setShowAddRequest] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showCollectionVars, setShowCollectionVars] = useState(false);
  const [collectionVariables, setCollectionVariables] = useState<Record<string, string | Variable>>({});
  const [rightClickMenuOpen, setRightClickMenuOpen] = useState(false);
  const [rightClickPosition, setRightClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [duplicatingCollection, setDuplicatingCollection] = useState(false);
  const [deletingCollection, setDeletingCollection] = useState(false);
  const { workspace, getCollection, refreshWorkspace } = useWorkspace();
  const { openRequest, openCollection } = useTabNavigation();
  const renameId = `collection:${collection.id}`;

  // Explicitly focus input when rename becomes active
  useEffect(() => {
    if (activeRenameId === renameId && inputRef.current) {
      console.log('[Collection] Starting rename for:', renameId);
      // Use setTimeout to ensure input is fully mounted in DOM
      setTimeout(() => {
        if (inputRef.current) {
          focusTimeRef.current = Date.now();
          inputRef.current.focus();
          inputRef.current.select();
          console.log('[Collection] Input focused at:', focusTimeRef.current);
        }
      }, 0);
    }
  }, [activeRenameId, renameId]);

  // Load collection data and check plugin availability
  useEffect(() => {
    console.log('[CollectionItem] Loading collection data for:', collection.id, collection.name);
    getCollection(collection.id)
      .then(data => {
        console.log('[CollectionItem] Received collection data:', {
          id: collection.id,
          name: data.info?.name,
          itemsCount: data.items?.length || 0,
          items: data.items?.map((i: any) => ({ id: i.id, name: i.name, type: i.items ? 'folder' : 'request' }))
        });
        setCollectionData(data);
        
        // Load collection variables
        if (data.variables) {
          setCollectionVariables(data.variables);
        }
        
        // Check if protocol plugin is available
        const protocol = data.protocol;
        if (protocol) {
          const availablePlugins = pluginManagerService.getAllProtocolPlugins();
          const isAvailable = availablePlugins.some(p => p.protocol === protocol);
          setIsUnsupported(!isAvailable);
        }
      })
      .catch(err => console.error('Failed to load collection:', err));
  }, [collection.id, collection, getCollection]);

  const handleSaveCollectionVars = async (updatedVariables: Record<string, string | Variable>) => {
    if (!workspace || !collectionData) return;
    
    try {
      await window.quest.workspace.updateCollectionVariables(workspace.id, collection.id, updatedVariables);
      setCollectionVariables(updatedVariables);
      await refreshWorkspace();
    } catch (error) {
      console.error('Failed to save collection variables:', error);
      alert('Failed to save collection variables');
    }
  };

  const handleStartInlineRename = () => {
    setActiveRenameId(renameId);
    setInlineRenameValue(collectionData?.info?.name || collection.name);
  };

  const handleInlineRenameSubmit = async () => {
    const timeSinceFocus = Date.now() - focusTimeRef.current;
    console.log('[Collection] Blur fired, time since focus:', timeSinceFocus + 'ms');
    
    // Ignore blur events that happen too quickly after focus (menu closing)
    if (timeSinceFocus < 100) {
      console.log('[Collection] Ignoring premature blur, refocusing input');
      // Refocus the input since focus was stolen
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 0);
      return;
    }
    
    console.log('[Collection] Submit called with value:', inlineRenameValue);
    if (inlineRenameValue.trim() && inlineRenameValue !== (collectionData?.info?.name || collection.name)) {
      try {
        if (workspace) {
          await window.quest.workspace.renameCollection(workspace.id, collection.id, inlineRenameValue.trim());
          await refreshWorkspace();
        }
      } catch (error) {
        console.error('Failed to rename collection:', error);
        alert('Failed to rename collection');
      }
    }
    setActiveRenameId(null);
    setInlineRenameValue('');
  };

  const handleInlineRenameCancel = () => {
    setActiveRenameId(null);
    setInlineRenameValue('');
  };

  const handleDuplicateCollection = async (newName: string) => {
    if (!workspace) return;
    try {
      await window.quest.workspace.duplicateCollection(workspace.id, collection.id, newName.trim());
      await refreshWorkspace();
      setDuplicatingCollection(false);
    } catch (error) {
      console.error('Failed to duplicate collection:', error);
      alert('Failed to duplicate collection');
    }
  };

  const handleDeleteCollection = async () => {
    if (!workspace) return;
    try {
      await window.quest.workspace.deleteCollection(workspace.id, collection.id);
      await refreshWorkspace();
      setDeletingCollection(false);
    } catch (error) {
      console.error('Failed to delete collection:', error);
      alert('Failed to delete collection');
    }
  };

  const handleMenuAction = async (action: MenuAction, item: any) => {
    switch (action) {
      case 'run':
        // Open collection tab with Runner tab active
        if (collectionData) {
          openCollection(collection.id, collectionData.protocol, collectionData.info?.name || collection.name, false, 'runner');
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
        try {
          if (workspace) {
            const result = await window.quest.workspace.exportCollection(workspace.id, collection.id);
            if (result) {
              console.log('Exported to:', result);
            }
          }
        } catch (error) {
          console.error('Failed to export collection:', error);
          alert('Failed to export collection');
        }
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
        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0px 8px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer' }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          if (collectionData) {
            openCollection(collection.id, collectionData.protocol, collectionData.info?.name || collection.name, true); // single-click = temporary
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation(); // Prevent onClick from firing
          if ((e.target as HTMLElement).closest('button')) return;
          if (collectionData) {
            openCollection(collection.id, collectionData.protocol, collectionData.info?.name || collection.name, false); // double-click = permanent
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRightClickPosition({ x: e.clientX, y: e.clientY });
          setRightClickMenuOpen(true);
        }}
      >
        <button
          style={{ color: 'var(--gray-9)', cursor: 'pointer', padding: 0, background: 'transparent', border: 'none' }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? <ChevronDownIcon style={{ width: '12px', height: '12px' }} /> : <ChevronRightIcon style={{ width: '12px', height: '12px' }} />}
        </button>
        <RectangleStackIcon className="w-4 h-4" style={{ color: 'var(--accent-9)' }} />
        
        {activeRenameId === renameId ? (
          <TextField.Root
            ref={inputRef}
            size="1"
            value={inlineRenameValue}
            onChange={(e) => setInlineRenameValue(e.target.value)}
            onBlur={handleInlineRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleInlineRenameSubmit();
              } else if (e.key === 'Escape') {
                handleInlineRenameCancel();
              }
            }}
            style={{ flex: 1 }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span 
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
            onClick={() => setIsExpanded(!isExpanded)}
            title={isUnsupported ? `Unsupported protocol: ${collectionData?.protocol}` : undefined}
          >
            {collectionData?.info?.name || collection.name}
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
          onAction={handleMenuAction}
        />
      </div>

      {/* Right-click menu */}
      {rightClickPosition && (
        <UnifiedContextMenu
          type="collection"
          item={collection}
          open={rightClickMenuOpen}
          onOpenChange={setRightClickMenuOpen}
          position={rightClickPosition}
          onAction={handleMenuAction}
        />
      )}
      
      {isExpanded && collectionData?.items && (
        <div style={{ marginLeft: '16px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {[...collectionData.items]
            .sort((a: any, b: any) => {
              // Folders first
              const aIsFolder = !!a.items;
              const bIsFolder = !!b.items;
              if (aIsFolder && !bIsFolder) return -1;
              if (!aIsFolder && bIsFolder) return 1;
              // Then alphabetically by name
              return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
            })
              .map((item: any) => (
              <CollectionRequestItem 
                key={item.id} 
                item={item} 
                collectionId={collection.id}
                protocol={collectionData?.protocol}
                activeRenameId={activeRenameId}
                setActiveRenameId={setActiveRenameId}
                inlineRenameValue={inlineRenameValue}
                setInlineRenameValue={setInlineRenameValue}
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
        onSubmit={async (name) => {
          try {
            if (!workspace) return;
            const requestId = await window.quest.workspace.addRequest(workspace.id, collection.id, name, null);
            await refreshWorkspace();
            setIsExpanded(true);
            const data = await getCollection(collection.id);
            const findRequest = (items: any[]): any => {
              for (const item of items) {
                if (item.id === requestId) return item;
                if (item.items) {
                  const found = findRequest(item.items);
                  if (found) return found;
                }
              }
              return null;
            };
            const newRequest = findRequest(data.items);
            if (newRequest) {
              const plugin = pluginLoader.getProtocolPluginUI(data.protocol);
              const badge = plugin ? plugin.getRequestBadge(newRequest) : undefined;
              openRequest(collection.id, data.protocol, newRequest.id, newRequest.name, { badge });
            }
          } catch (error) {
            console.error('Failed to add request:', error);
            alert('Failed to add request');
          }
        }}
      />

      {/* Add Folder Dialog */}
      <InputDialog
        open={showAddFolder}
        onOpenChange={setShowAddFolder}
        title="Add Folder"
        placeholder="Folder name"
        onSubmit={async (name) => {
          try {
            if (!workspace) return;
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
        }}
      />

      {/* Collection Variables Dialog */}
      <VariableEditorDialog
        open={showCollectionVars}
        onOpenChange={setShowCollectionVars}
        title={`${collectionData?.info?.name || 'Collection'} Variables`}
        variables={collectionVariables}
        onSave={handleSaveCollectionVars}
        showEnabled={false}
      />

      {/* Duplicate Collection Dialog */}
      <InputDialog
        open={duplicatingCollection}
        onOpenChange={setDuplicatingCollection}
        title="Duplicate Collection"
        placeholder="New collection name"
        defaultValue={collectionData?.info?.name ? `${collectionData.info.name} Copy` : `${collection.name} Copy`}
        onSubmit={handleDuplicateCollection}
      />

      {/* Delete Collection Dialog */}
      <ConfirmDialog
        open={deletingCollection}
        onOpenChange={setDeletingCollection}
        title="Delete Collection"
        description={`Are you sure you want to delete "${collectionData?.info?.name || collection.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteCollection}
      />
    </div>
  );
}

function CollectionRequestItem({ 
  item, 
  collectionId,
  protocol,
  activeRenameId,
  setActiveRenameId,
  inlineRenameValue,
  setInlineRenameValue
}: { 
  item: any; 
  collectionId: string;
  protocol: string;
  activeRenameId: string | null;
  setActiveRenameId: (id: string | null) => void;
  inlineRenameValue: string;
  setInlineRenameValue: (value: string) => void;
}) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const requestInputRef = useRef<HTMLInputElement>(null);
  const { openRequest, openFolder } = useTabNavigation();

  const { workspace, refreshWorkspace } = useWorkspace();

  if (item.items) {
    // It's a folder
    const folderFocusTimeRef = useRef<number>(0);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showAddRequest, setShowAddRequest] = useState(false);
    const [showAddFolder, setShowAddFolder] = useState(false);
    const [rightClickMenuOpen, setRightClickMenuOpen] = useState(false);
    const [rightClickPosition, setRightClickPosition] = useState<{ x: number; y: number } | null>(null);
    const [deletingFolder, setDeletingFolder] = useState(false);
    const renameId = `folder:${item.id}`;
    
    // Explicitly focus input when rename becomes active
    useEffect(() => {
      if (activeRenameId === renameId && folderInputRef.current) {
        console.log('[Folder] Starting rename for:', renameId);
        // Use setTimeout to ensure input is fully mounted in DOM
        setTimeout(() => {
          if (folderInputRef.current) {
            folderFocusTimeRef.current = Date.now();
            folderInputRef.current.focus();
            folderInputRef.current.select();
            console.log('[Folder] Input focused at:', folderFocusTimeRef.current);
          }
        }, 0);
      }
    }, [activeRenameId, renameId]);
    
    const handleStartInlineRename = () => {
      setActiveRenameId(renameId);
      setInlineRenameValue(item.name);
    };

    const handleInlineRenameSubmit = async () => {
      const timeSinceFocus = Date.now() - folderFocusTimeRef.current;
      console.log('[Folder] Blur fired, time since focus:', timeSinceFocus + 'ms');
      
      // Ignore blur events that happen too quickly after focus (menu closing)
      if (timeSinceFocus < 100) {
        console.log('[Folder] Ignoring premature blur, refocusing input');
        // Refocus the input since focus was stolen
        setTimeout(() => {
          if (folderInputRef.current) {
            folderInputRef.current.focus();
            folderInputRef.current.select();
          }
        }, 0);
        return;
      }
      
      console.log('[Folder] Submit called with value:', inlineRenameValue);
      if (inlineRenameValue.trim() && inlineRenameValue !== item.name) {
        try {
          // TODO: Implement rename folder backend call
          console.log('Rename folder to:', inlineRenameValue);
        } catch (error) {
          console.error('Failed to rename folder:', error);
        }
      }
      setActiveRenameId(null);
      setInlineRenameValue('');
    };

    const handleInlineRenameCancel = () => {
      setActiveRenameId(null);
      setInlineRenameValue('');
    };
    
    const handleDeleteFolder = async () => {
      if (!workspace) return;
      try {
        console.log('[Folder] Deleting folder:', item.id);
        await window.quest.workspace.deleteFolder(workspace.id, collectionId, item.id);
        console.log('[Folder] Folder deleted, refreshing workspace...');
        await refreshWorkspace();
        console.log('[Folder] Workspace refreshed');
        setDeletingFolder(false);
      } catch (error) {
        console.error('Failed to delete folder:', error);
        alert('Failed to delete folder');
      }
    };

    const handleMenuAction = async (action: MenuAction, item: any) => {
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
          className="collection-row"
          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0px 8px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer' }}
          onClick={(e) => {
            // Don't open folder when clicking on buttons
            if ((e.target as HTMLElement).closest('button')) return;
            openFolder(collectionId, protocol, item.id, item.name, true); // single-click = temporary
          }}
          onDoubleClick={(e) => {
            e.stopPropagation(); // Prevent onClick from firing
            // Don't open folder when clicking on buttons
            if ((e.target as HTMLElement).closest('button')) return;
            openFolder(collectionId, protocol, item.id, item.name, false); // double-click = permanent
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setRightClickPosition({ x: e.clientX, y: e.clientY });
            setRightClickMenuOpen(true);
          }}
        >
        <button
          style={{ color: 'var(--gray-9)', cursor: 'pointer', padding: 0, background: 'transparent', border: 'none' }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronDownIcon style={{ width: '12px', height: '12px', color: 'var(--gray-9)' }} />
          ) : (
            <ChevronRightIcon style={{ width: '12px', height: '12px', color: 'var(--gray-9)' }} />
          )}
        </button>
        <FolderIcon className="w-4 h-4" style={{ color: 'var(--gray-10)' }} />          
        
        {activeRenameId === renameId ? (
          <TextField.Root
            ref={folderInputRef}
            size="1"
            value={inlineRenameValue}
            onChange={(e) => setInlineRenameValue(e.target.value)}
            onBlur={handleInlineRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleInlineRenameSubmit();
              } else if (e.key === 'Escape') {
                handleInlineRenameCancel();
              }
            }}
            style={{ flex: 1 }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span 
            style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {item.name}
          </span>
        )}
        
        {/* Folder metadata icons (dependencies/conditions) */}
        <RequestMetadataIcons resource={item} />
          
          {/* Add request button */}
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
          
          {/* Add folder button */}
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
          
          {/* Three-dots menu */}
          <UnifiedContextMenu
            type="folder"
            item={item}
            trigger={
              <button className="hover-visible" style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-10)' }}>
                <EllipsisVerticalIcon className="w-4 h-4" />
              </button>
            }
            onAction={handleMenuAction}
          />
        </div>

        {/* Right-click menu */}
        {rightClickPosition && (
          <UnifiedContextMenu
            type="folder"
            item={item}
            open={rightClickMenuOpen}
            onOpenChange={setRightClickMenuOpen}
            position={rightClickPosition}
            onAction={handleMenuAction}
          />
        )}
        
        {isExpanded && item.items && (
          <div style={{ marginLeft: '16px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[...item.items]
              .sort((a: any, b: any) => {
                // Folders first
                const aIsFolder = !!a.items;
                const bIsFolder = !!b.items;
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return 1;
                // Then alphabetically by name
                return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
              })
              .map((subItem: any) => (
                <CollectionRequestItem 
                  key={subItem.id} 
                  item={subItem} 
                  collectionId={collectionId}
                  protocol={protocol}
                  activeRenameId={activeRenameId}
                  setActiveRenameId={setActiveRenameId}
                  inlineRenameValue={inlineRenameValue}
                  setInlineRenameValue={setInlineRenameValue}
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
          onSubmit={async (name) => {
            try {
              if (!workspace) return;
              const requestId = await window.quest.workspace.addRequest(workspace.id, collectionId, name, item.id);
              await refreshWorkspace();
              setIsExpanded(true);
              const collection = await window.quest.workspace.loadCollection(workspace.id, collectionId);
              const findRequest = (items: any[]): any => {
                for (const it of items) {
                  if (it.id === requestId) return it;
                  if (it.items) {
                    const found = findRequest(it.items);
                    if (found) return found;
                  }
                }
                return null;
              };
              const newRequest = findRequest(collection.items);
              if (newRequest) {
                const plugin = pluginLoader.getProtocolPluginUI(collection.protocol);
                const badge = plugin ? plugin.getRequestBadge(newRequest) : undefined;
                openRequest(collectionId, collection.protocol, newRequest.id, newRequest.name, { badge });
              }
            } catch (error) {
              console.error('Failed to add request:', error);
              alert('Failed to add request');
            }
          }}
        />

        {/* Add Folder Dialog */}
        <InputDialog
          open={showAddFolder}
          onOpenChange={setShowAddFolder}
          title="Add Folder"
          placeholder="Folder name"
          onSubmit={async (name) => {
            try {
              if (!workspace) return;
              await window.quest.workspace.addFolder(workspace.id, collectionId, name, item.id);
              await refreshWorkspace();
              setIsExpanded(true);
            } catch (error) {
              console.error('Failed to add folder:', error);
              alert('Failed to add folder');
            }
          }}
        />

        {/* Delete Folder Dialog */}
        <ConfirmDialog
          open={deletingFolder}
          onOpenChange={setDeletingFolder}
          title="Delete Folder"
          description={`Are you sure you want to delete "${item.name}"? This will also delete all requests and subfolders inside it. This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={handleDeleteFolder}
        />
      </div>
    );
  }

  // It's a request
  const requestFocusTimeRef = useRef<number>(0);
  const [rightClickMenuOpen, setRightClickMenuOpen] = useState(false);
  const [rightClickPosition, setRightClickPosition] = useState<{ x: number; y: number } | null>(null);
  const [deletingRequest, setDeletingRequest] = useState(false);
  const renameId = `request:${item.id}`;
  
  // Explicitly focus input when rename becomes active
  useEffect(() => {
    if (activeRenameId === renameId && requestInputRef.current) {
      console.log('[Request] Starting rename for:', renameId);
      // Use setTimeout to ensure input is fully mounted in DOM
      setTimeout(() => {
        if (requestInputRef.current) {
          requestFocusTimeRef.current = Date.now();
          requestInputRef.current.focus();
          requestInputRef.current.select();
          console.log('[Request] Input focused at:', requestFocusTimeRef.current);
        }
      }, 0);
    }
  }, [activeRenameId, renameId]);
  
  // Get badge from plugin
  const plugin = pluginLoader.getProtocolPluginUI(protocol);
  const badge = plugin ? plugin.getRequestBadge(item) : null;

  const handleClick = () => {
    // Single click - open as temporary tab
    if (item.type === 'request' || (!item.items && item.data)) {
      const requestBadge = badge || undefined;
      openRequest(collectionId, protocol, item.id, item.name, { badge: requestBadge, description: item.description }, true); // true = isTemporary
    }
  };

  const handleDoubleClick = () => {
    // Double click - open as permanent tab
    if (item.type === 'request' || (!item.items && item.data)) {
      const requestBadge = badge || undefined;
      openRequest(collectionId, protocol, item.id, item.name, { badge: requestBadge, description: item.description }, false); // false = not temporary
    }
  };

  const handleStartInlineRename = () => {
    setActiveRenameId(renameId);
    setInlineRenameValue(item.name);
  };

  const handleInlineRenameSubmit = async () => {
    const timeSinceFocus = Date.now() - requestFocusTimeRef.current;
    console.log('[Request] Blur fired, time since focus:', timeSinceFocus + 'ms');
    
    // Ignore blur events that happen too quickly after focus (menu closing)
    if (timeSinceFocus < 100) {
      console.log('[Request] Ignoring premature blur, refocusing input');
      // Refocus the input since focus was stolen
      setTimeout(() => {
        if (requestInputRef.current) {
          requestInputRef.current.focus();
          requestInputRef.current.select();
        }
      }, 0);
      return;
    }
    
    console.log('[Request] Submit called with value:', inlineRenameValue);
    if (inlineRenameValue.trim() && inlineRenameValue !== item.name) {
        try {
          // TODO: Implement rename request backend call
          console.log('Rename request to:', inlineRenameValue);
        } catch (error) {
        console.error('Failed to rename request:', error);
      }
    }
    setActiveRenameId(null);
    setInlineRenameValue('');
  };

  const handleInlineRenameCancel = () => {
    setActiveRenameId(null);
    setInlineRenameValue('');
  };

  const handleDeleteRequest = async () => {
    if (!workspace) return;
    try {
      console.log('[Request] Deleting request:', item.id);
      await window.quest.workspace.deleteRequest(workspace.id, collectionId, item.id);
      console.log('[Request] Request deleted, refreshing workspace...');
      await refreshWorkspace();
      console.log('[Request] Workspace refreshed');
      setDeletingRequest(false);
    } catch (error) {
      console.error('Failed to delete request:', error);
      alert('Failed to delete request');
    }
  };

  const handleMenuAction = async (action: MenuAction, item: any) => {
    switch (action) {
      case 'rename':
        handleStartInlineRename();
        break;
        case 'duplicate':
          // TODO: Implement duplicate
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
        className="collection-row"
        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0px 8px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer' }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRightClickPosition({ x: e.clientX, y: e.clientY });
          setRightClickMenuOpen(true);
        }}
      >
        {badge ? (
          <Badge color={badge.color as any} size="1" style={{ fontSize: '10px', fontWeight: 700 }}>
            {badge.primary}
          </Badge>
        ) : (
          <Badge color="gray" size="1" style={{ fontSize: '10px', fontWeight: 700 }}>
            REQ
          </Badge>
        )}
        
        {activeRenameId === renameId ? (
          <TextField.Root
            ref={requestInputRef}
            size="1"
            value={inlineRenameValue}
            onChange={(e) => setInlineRenameValue(e.target.value)}
            onBlur={handleInlineRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleInlineRenameSubmit();
              } else if (e.key === 'Escape') {
                handleInlineRenameCancel();
              }
            }}
            style={{ flex: 1 }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </span>
        )}
        
        {/* Request metadata icons (dependencies/conditions) */}
        <RequestMetadataIcons resource={item} />
        
        {/* Three-dots menu */}
        <UnifiedContextMenu
          type="request"
          item={item}
          trigger={
            <button 
              className="hover-visible"
              style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-10)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <EllipsisVerticalIcon className="w-4 h-4" />
            </button>
          }
          onAction={handleMenuAction}
        />
      </div>

      {/* Right-click menu */}
      {rightClickPosition && (
        <UnifiedContextMenu
          type="request"
          item={item}
          open={rightClickMenuOpen}
          onOpenChange={setRightClickMenuOpen}
          position={rightClickPosition}
          onAction={handleMenuAction}
        />
      )}

      {/* Delete Request Dialog */}
      <ConfirmDialog
        open={deletingRequest}
        onOpenChange={setDeletingRequest}
        title="Delete Request"
        description={`Are you sure you want to delete "${item.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteRequest}
      />
    </div>
  );
}

function NewCollectionDialog({ open, onOpenChange }: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const protocols = pluginManagerService.getAllProtocolPlugins();
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { workspace, refreshWorkspace } = useWorkspace();

  const handleCreate = async (protocol: string) => {
    if (!workspace || !name.trim()) return;

    setIsCreating(true);
    try {
      // Use IPC to create collection
      await window.quest.workspace.createCollection(workspace.id, name.trim(), protocol);

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
                  onClick={() => handleCreate(plugin.protocol)}
                  disabled={!name.trim() || isCreating}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', fontSize: '12px', background: 'transparent', borderRadius: '6px', border: '1px solid var(--gray-6)', cursor: !name.trim() || isCreating ? 'not-allowed' : 'pointer', opacity: !name.trim() || isCreating ? 0.5 : 1 }}
                >
                  <span style={{ fontSize: '16px' }}>{plugin.icon}</span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    {/* <div className="font-medium text-gray-900 dark:text-white">{plugin.name}</div> */}
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
        </Dialog.Content>
    </Dialog.Root>
  );
}
