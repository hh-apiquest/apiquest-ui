// FolderEditor - Editor for folder-level settings (Auth, Scripts)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { pluginLoader } from '../../services';
import { useTabEditorBridge, useTabStatusActions, useTabNavigation } from '../../contexts';
import { useWorkspace, useTheme } from '../../contexts';
import { useAutoSave } from '../../hooks/useAutoSave';
import * as Tabs from '@radix-ui/react-tabs';
import type { Tab } from '../../contexts/TabContext';
import type { Collection } from '@apiquest/types';
import { OptionsTab } from '../request/OptionsTab';
import { resolveInheritedAuth } from '../../utils/authInheritance';

interface FolderEditorProps {
  tab: Tab;
}

export function FolderEditor({ tab }: FolderEditorProps) {
  const { setDirty, setName } = useTabStatusActions();
  const { registerSaveHandler } = useTabEditorBridge();
  const { saveResourceState, clearResourceState, getResourceState, updateTabUIState } = useTabNavigation();
  const { workspace, getCollection, updateFolder, clearCollectionCache, refreshWorkspace } = useWorkspace();
  const { actualTheme } = useTheme();
  const [folder, setFolder] = useState<any>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<Array<{ id: string; name: string; type: 'folder' | 'request' }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<string>(tab.uiState?.activeSubTab || 'auth');
  
  // Get UI context for tab components (memoized to prevent re-creating on every render)
  const uiContext = useMemo(() => pluginLoader.getUIContext(), []);

  // Sync local state with tab.uiState on tab changes
  useEffect(() => {
    const newActiveSubTab = tab.uiState?.activeSubTab || 'auth';
    setActiveSubTab(newActiveSubTab);
  }, [tab.id, tab.uiState?.activeSubTab]);

  // Load folder from workspace
  useEffect(() => {
    const loadFolder = async () => {
      if (!workspace) return;
      
      try {
        setIsLoading(true);
        const loadedCollection = await getCollection(tab.collectionId);
        setCollection(loadedCollection);
        
        const findFolder = (items: any[]): any => {
          for (const item of items) {
            if (item.id === tab.resourceId && item.items) return item;
            if (item.items) {
              const found = findFolder(item.items);
              if (found) return found;
            }
          }
          return null;
        };
        
        // Extract all items (folders and requests) from collection for dependencies
        const extractAllItems = (items: any[]): Array<{ id: string; name: string; type: 'folder' | 'request' }> => {
          const allItems: Array<{ id: string; name: string; type: 'folder' | 'request' }> = [];
          for (const item of items) {
            if (item.type === 'request' || item.type === 'folder') {
              allItems.push({ id: item.id, name: item.name, type: item.type });
            }
            if (item.type === 'folder' && item.items) {
              allItems.push(...extractAllItems(item.items));
            }
          }
          return allItems;
        };
        
        setCollectionItems(extractAllItems(loadedCollection.items));
        
        const baseFolder = findFolder(loadedCollection.items);
        if (!baseFolder) throw new Error('Folder not found');
        
        const sessionState = await getResourceState(workspace.id, tab.resourceId);
        
        const finalFolder = {
          ...baseFolder,
          name: sessionState?.name || baseFolder.name,
          auth: sessionState?.auth ?? baseFolder.auth,
          folderPreScript: sessionState?.folderPreScript ?? baseFolder.folderPreScript ?? '',
          folderPostScript: sessionState?.folderPostScript ?? baseFolder.folderPostScript ?? '',
          preRequestScript: sessionState?.preRequestScript ?? baseFolder.preRequestScript ?? '',
          postRequestScript: sessionState?.postRequestScript ?? baseFolder.postRequestScript ?? ''
        };
        
        setFolder(finalFolder);
        
        if (sessionState) {
          setDirty(tab.id, true);
        }
      } catch (error) {
        console.error('Failed to load folder:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadFolder();
  }, [tab.id]);

  // Register save handler for TabBar close flow
  useEffect(() => {
    if (!workspace) return;

    const unregister = registerSaveHandler(tab.id, async () => {
      if (!folder) return;
      await updateFolder(tab.collectionId, tab.resourceId, folder);
      setDirty(tab.id, false);
      clearCollectionCache(tab.collectionId);
      await refreshWorkspace();
      await clearResourceState(workspace.id, tab.resourceId);
    });

    return unregister;
  }, [workspace, registerSaveHandler, tab.id, tab.collectionId, tab.resourceId, folder, updateFolder, setDirty, clearCollectionCache, refreshWorkspace, clearResourceState]);

  // Auto-save to session state
  const handleAutoSave = useCallback(async () => {
    if (!workspace || !folder) return;
    
    try {
      await saveResourceState(workspace.id, tab.resourceId, {
        name: folder.name,
        // Normalize "inherit" to undefined - inherit is default behavior and shouldn't create session state
        auth: folder.auth?.type === 'inherit' ? undefined : folder.auth,
        folderPreScript: folder.folderPreScript,
        folderPostScript: folder.folderPostScript,
        preRequestScript: folder.preRequestScript,
        postRequestScript: folder.postRequestScript
      });
    } catch (error) {
      console.error('AutoSave failed:', error);
    }
  }, [workspace, folder, tab.resourceId, saveResourceState]);

  const autoSave = useAutoSave({
    onSave: handleAutoSave,
    delay: 2000,
    enabled: !!workspace && !!folder
  });

  const handleFolderChange = (updatedFolder: any) => {
    setFolder(updatedFolder);
    setDirty(tab.id, true);
    if (updatedFolder?.name) {
      setName(tab.id, updatedFolder.name);
    }
    autoSave.trigger();
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="text-sm text-gray-500">Loading...</div></div>;
  }

  if (!folder) {
    return <div className="flex items-center justify-center h-full text-gray-500">Folder not found</div>;
  }

  // Get supported auth types from metadata
  const supportedAuthTypes = pluginLoader.getSupportedAuthTypesForProtocol(tab.protocol);

  const tabs = [
    { id: 'auth', label: 'Auth', position: 1 },
    { id: 'scripts', label: 'Scripts', position: 2 },
    { id: 'options', label: 'Options', position: 3 }
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--color-background)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: 'var(--gray-6)' }}>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{folder.name || 'Folder'}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--gray-9)' }}>
            Configure folder-level authentication and scripts
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden min-h-0">
        <Tabs.Root
          value={activeSubTab}
          onValueChange={(value) => {
            setActiveSubTab(value);
            // Save the active sub tab to the tab's UI state
            updateTabUIState(tab.id, { activeSubTab: value });
          }}
          className="flex flex-col h-full"
        >
          {/* Tab List */}
          <Tabs.List className="flex items-center border-b px-4 editor-tabs-list" style={{ borderColor: 'var(--gray-6)' }}>
            {tabs.map(tabItem => (
              <Tabs.Trigger
                key={tabItem.id}
                value={tabItem.id}
                className="px-4 py-2 text-sm font-medium transition-colors editor-tab-trigger"
              >
                {tabItem.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden min-h-0" style={{ paddingBottom: '35px' }}>
            <Tabs.Content value="auth" className="h-full p-4 overflow-auto">
              <AuthTab
                folder={folder}
                onChange={handleFolderChange}
                uiContext={uiContext}
                supportedAuthTypes={supportedAuthTypes}
                collection={collection}
              />
            </Tabs.Content>

            <Tabs.Content value="scripts" className="h-full p-4 overflow-auto">
              <ScriptsTab
                folder={folder}
                onChange={handleFolderChange}
                uiContext={uiContext}
                protocol={tab.protocol}
                theme={actualTheme}
              />
            </Tabs.Content>

            <Tabs.Content value="options" className="h-full p-4 overflow-auto">
              <OptionsTab
                resource={folder}
                onChange={handleFolderChange}
                uiContext={uiContext}
                resourceType="folder"
                allItems={collectionItems}
                currentItemId={tab.resourceId}
                collection={collection || undefined}
              />
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </div>
    </div>
  );
}

// Auth Tab Component for Folder
function AuthTab({ folder, onChange, uiContext, supportedAuthTypes, collection }: any) {
  const { React, Radix } = uiContext;
  
  // Compute auth type: none (explicit), inherit (missing/type:'inherit'), or concrete type
  const authType = React.useMemo(() => {
    if (folder.auth?.type === 'none') return 'none';
    if (!folder.auth || folder.auth.type === 'inherit') return 'inherit';
    return folder.auth.type;
  }, [folder.auth]);
  
  // Get loaded auth plugin UIs
  const loadedAuthTypes = React.useMemo(() => {
    const loaded = pluginLoader.getAllAuthPluginUIs().map(ui => ui.type);
    return loaded;
  }, []);
  
  // Filter auth options (include inherit for folders)
  const authOptions = React.useMemo(() => {
    const available = ['inherit', 'none', ...supportedAuthTypes.filter((t: string) => t !== 'none' && t !== 'inherit' && loadedAuthTypes.includes(t))];
    return available;
  }, [supportedAuthTypes, loadedAuthTypes]);
  
  // Resolve inherited auth when type is 'inherit'
 const inheritedAuth = React.useMemo(() => {
    if (authType !== 'inherit' || !collection) return null;
    return resolveInheritedAuth(collection, folder.id);
   }, [authType, collection, folder.id]);
  
  // Determine which auth to display
  const displayAuth = authType === 'inherit' ? inheritedAuth?.auth : folder.auth;
  const displayAuthType = displayAuth?.type || 'none';
  
  // Get the auth plugin UI
  const authPluginUI = React.useMemo(() => {
    if (displayAuthType === 'none' || displayAuthType === 'inherit') return null;
    return pluginLoader.getAuthPluginUI(displayAuthType);
  }, [displayAuthType]);
  
  // Get auth data
  const authData = React.useMemo(() => {
    if (displayAuthType === 'none' || displayAuthType === 'inherit' || !authPluginUI) return {};
    if (displayAuth?.data) return displayAuth.data;
    return authPluginUI.createDefault ? authPluginUI.createDefault() : {};
  }, [displayAuthType, displayAuth, authPluginUI]);
  
  // Handle auth data change
  const handleAuthDataChange = (newData: any) => {
    onChange({
      ...folder,
      auth: {
        type: displayAuthType,
        data: newData
      }
    });
  };
  
  // Render auth form
  const renderAuthForm = () => {
    if (authType === 'none') {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-sm">This folder explicitly uses no authentication.</div>
            <div className="text-xs mt-1">This overrides any authentication set in the parent collection.</div>
          </div>
        </div>
      );
    }
    
    if (authType === 'inherit') {
      if (!inheritedAuth || !inheritedAuth.auth) {
        return (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-sm">No authentication set in parent collection.</div>
              <div className="text-xs mt-1">Select an auth type to configure authentication for this folder.</div>
            </div>
          </div>
        );
      }
      
      if (!authPluginUI) {
        return (
          <div className="flex-1 flex items-center justify-center text-red-500">
            <div className="text-sm">Auth plugin UI not found for type: {displayAuthType}</div>
          </div>
        );
      }
      
      return (
        <div className="flex-1">
          <div className="mb-3 p-2 rounded" style={{ background: 'var(--amber-3)', border: '1px solid var(--amber-6)' }}>
            <div className="text-xs" style={{ color: 'var(--amber-11)' }}>
              Inherited from {inheritedAuth.source?.type}: <strong>{inheritedAuth.source?.name}</strong>
            </div>
          </div>
          {authPluginUI.renderForm(authData, () => {}, { readOnly: true })}
        </div>
      );
    }

    if (!authPluginUI) {
      return (
        <div className="flex-1 flex items-center justify-center text-red-500">
          <div className="text-sm">Auth plugin UI not found for type: {authType}</div>
        </div>
      );
    }

    return (
      <div className="flex-1">
        {authPluginUI.renderForm(authData, handleAuthDataChange)}
      </div>
    );
  };

  return (
    <div className="flex h-full">
      {/* Left: Auth type selector */}
      <div className="w-64 border-r pr-4" style={{ borderColor: 'var(--gray-6)' }}>
        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--gray-12)' }}>Type</label>
        <Radix.Select.Root
          value={authType}
          onValueChange={(value: string) => {
            if (value === 'inherit') {
              // Clear auth to inherit from parent
              onChange({
                ...folder,
                auth: undefined
              });
            } else if (value === 'none') {
              // Explicit no auth
              onChange({
                ...folder,
                auth: { type: 'none' }
              });
            } else {
              // Concrete auth type
              const newAuthPluginUI = pluginLoader.getAuthPluginUI(value);
              onChange({
                ...folder,
                auth: {
                  type: value,
                  data: newAuthPluginUI?.createDefault ? newAuthPluginUI.createDefault() : {}
                }
              });
            }
          }}
          size="2"
        >
          <Radix.Select.Trigger style={{ width: '100%' }} />
          <Radix.Select.Content>
            {authOptions.map((type: string) => (
              <Radix.Select.Item key={`auth-${type}`} value={type}>
                {type === 'none' ? 'No Auth' : type === 'inherit' ? 'Inherit' : type.charAt(0).toUpperCase() + type.slice(1)}
              </Radix.Select.Item>
            ))}
          </Radix.Select.Content>
        </Radix.Select.Root>
      </div>

      {/* Right: Auth configuration form */}
      <div className="flex-1 pl-4">
        {renderAuthForm()}
      </div>
    </div>
  );
}

// Scripts Tab Component for Folder
function ScriptsTab({ folder, onChange, uiContext, protocol, theme }: any) {
  const { React, Monaco } = uiContext;
  
  // Protocol-specific events (none defined yet)
  const protocolEvents: any[] = [];
  
  // type ScriptTypeOption = 'folderPre' | 'folderPost' | 'pre' | 'post' | string;
  const [scriptType, setScriptType] = React.useState('folderPre');
  
  // Get script value based on type
  const getScriptValue = () => {
    if (scriptType === 'folderPre') return folder.folderPreScript || '';
    if (scriptType === 'folderPost') return folder.folderPostScript || '';
    if (scriptType === 'pre') return folder.preRequestScript || '';
    if (scriptType === 'post') return folder.postRequestScript || '';
    
    // Protocol event script
    const eventScript = folder.scripts?.find((s: any) => s.event === scriptType);
    return eventScript?.script || '';
  };
  
  // Update script value
  const updateScript = (value: string) => {
    if (scriptType === 'folderPre') {
      onChange({ ...folder, folderPreScript: value });
    } else if (scriptType === 'folderPost') {
      onChange({ ...folder, folderPostScript: value });
    } else if (scriptType === 'pre') {
      onChange({ ...folder, preRequestScript: value });
    } else if (scriptType === 'post') {
      onChange({ ...folder, postRequestScript: value });
    } else {
      // Update protocol event script
      const scripts = folder.scripts || [];
      const existingIndex = scripts.findIndex((s: any) => s.event === scriptType);
      
      if (existingIndex >= 0) {
        scripts[existingIndex] = { event: scriptType, script: value };
      } else {
        scripts.push({ event: scriptType, script: value });
      }
      
      onChange({ ...folder, scripts });
    }
  };
    
  return (
      <div className="flex h-full">
      {/* Left sidebar for script type selection */}
      <div className="w-48 border-r pr-2 space-y-3" style={{ borderColor: 'var(--gray-6)' }}>
        {/* Folder lifecycle scripts */}
        <div>
          <div className="text-xs font-semibold mb-1 px-2 script-tab-label">Folder Lifecycle</div>
          <div className="space-y-1">
            <button
              onClick={() => setScriptType('folderPre')}
              className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
              data-active={scriptType === 'folderPre'}
              title="Runs ONCE when entering folder"
              type="button"
            >
              Pre-script
            </button>
            <button
              onClick={() => setScriptType('folderPost')}
              className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
              data-active={scriptType === 'folderPost'}
              title="Runs ONCE when leaving folder"
              type="button"
            >
              Post-script
            </button>
          </div>
        </div>

        {/* Per-request scripts */}
        <div>
          <div className="text-xs font-semibold mb-1 px-2 script-tab-label">Per Request</div>
          <div className="space-y-1">
            <button
              onClick={() => setScriptType('pre')}
              className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
              data-active={scriptType === 'pre'}
              title="Runs before EACH request"
              type="button"
            >
              Pre-script
            </button>
            <button
              onClick={() => setScriptType('post')}
              className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
              data-active={scriptType === 'post'}
              title="Runs after EACH request"
              type="button"
            >
              Post-script
            </button>
          </div>
        </div>

        {/* Protocol-specific event scripts */}
        {protocolEvents.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-1 px-2 script-tab-label">
              {protocol.toUpperCase()} Events
            </div>
            <div className="space-y-1">
              {protocolEvents.map(evt => (
                <button
                  key={evt.name}
                  onClick={() => setScriptType(evt.name)}
                  className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
                  data-active={scriptType === evt.name}
                  title={evt.description}
                  type="button"
                >
                  {evt.name + (evt.required ? ' *' : '')}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Monaco editor */}
      <div className="flex-1 pl-2">
        <Monaco.Editor
          value={getScriptValue()}
          language="javascript"
          onChange={updateScript}
          height="100%"
          theme={theme}
        />
      </div>
    </div>
  );
}
