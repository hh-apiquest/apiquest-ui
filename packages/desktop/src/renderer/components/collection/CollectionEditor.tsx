// CollectionEditor - Editor for collection-level settings (Auth, Scripts, Runner)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { pluginLoader } from '../../services';
import { useTabEditorBridge, useTabStatusActions, useTabNavigation } from '../../contexts';
import { useWorkspace, useTheme } from '../../contexts';
import { useAutoSave } from '../../hooks/useAutoSave';
import * as Tabs from '@radix-ui/react-tabs';
import type { Tab } from '../../contexts/TabContext';
import { RunnerTab } from './RunnerTab';
import { OptionsTab } from '../request/OptionsTab';

interface CollectionEditorProps {
  tab: Tab;
}

export function CollectionEditor({ tab }: CollectionEditorProps) {
  const { setDirty, setName } = useTabStatusActions();
  const { registerSaveHandler } = useTabEditorBridge();
  const { saveResourceState, clearResourceState, getResourceState, updateTabUIState } = useTabNavigation();
  const { workspace, updateCollection, clearCollectionCache, refreshWorkspace } = useWorkspace();
  const { actualTheme } = useTheme();
  const [collection, setCollection] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<string>(tab.uiState?.activeSubTab || 'auth');
  
  // Get UI context for tab components (memoized to prevent re-creating on every render)
  const uiContext = useMemo(() => pluginLoader.getUIContext(), []);

  // Sync local state with tab.uiState on tab changes
  useEffect(() => {
    const newActiveSubTab = tab.uiState?.activeSubTab || 'auth';
    console.log('[CollectionEditor] Restoring tab state:', {
      tabId: tab.id,
      'tab.uiState': tab.uiState,
      'tab.uiState?.activeSubTab': tab.uiState?.activeSubTab,
      newActiveSubTab,
      currentActiveSubTab: activeSubTab
    });
    setActiveSubTab(newActiveSubTab);
  }, [tab.id, tab.uiState?.activeSubTab]);

  // Load collection from workspace
  useEffect(() => {
    const loadCollection = async () => {
      if (!workspace) return;
      
      try {
        setIsLoading(true);
        const baseCollection = await window.quest.workspace.loadCollection(workspace.id, tab.resourceId);
        
        // For collections, resourceId equals collectionId. Composite key: collectionId::collectionId.
        const sessionState = await getResourceState(workspace.id, `${tab.collectionId}::${tab.resourceId}`);
        
        const finalCollection = {
          ...baseCollection,
          auth: sessionState?.auth ?? baseCollection.auth,
          collectionPreScript: sessionState?.collectionPreScript ?? baseCollection.collectionPreScript ?? '',
          collectionPostScript: sessionState?.collectionPostScript ?? baseCollection.collectionPostScript ?? '',
          preRequestScript: sessionState?.preRequestScript ?? baseCollection.preRequestScript ?? '',
          postRequestScript: sessionState?.postRequestScript ?? baseCollection.postRequestScript ?? ''
        };
        
        setCollection(finalCollection);
        
        if (sessionState) {
          setDirty(tab.id, true);
        }
      } catch (error) {
        console.error('Failed to load collection:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadCollection();
  }, [tab.id]);

  // Register save handler for TabBar close flow
  useEffect(() => {
    if (!workspace) return;

    const unregister = registerSaveHandler(tab.id, async () => {
      if (!collection) return;
      await updateCollection(tab.collectionId, collection);
      setDirty(tab.id, false);
      // refresh cache so editors reload the latest if reopened
      clearCollectionCache(tab.collectionId);
      await refreshWorkspace();
      await clearResourceState(workspace.id, `${tab.collectionId}::${tab.resourceId}`);
    });

    return unregister;
  }, [workspace, registerSaveHandler, tab.id, tab.collectionId, collection, updateCollection, setDirty, clearCollectionCache, refreshWorkspace, clearResourceState]);

  // Auto-save to session state
  const handleAutoSave = useCallback(async () => {
    if (!workspace || !collection) return;
    
    try {
      // For collections, resourceId equals collectionId. Composite key: collectionId::collectionId.
      await saveResourceState(workspace.id, `${tab.collectionId}::${tab.resourceId}`, {
        auth: collection.auth,
        collectionPreScript: collection.collectionPreScript,
        collectionPostScript: collection.collectionPostScript,
        preRequestScript: collection.preRequestScript,
        postRequestScript: collection.postRequestScript
      });
    } catch (error) {
      console.error('AutoSave failed:', error);
    }
  }, [workspace, collection, tab.resourceId, saveResourceState]);

  const autoSave = useAutoSave({
    onSave: handleAutoSave,
    delay: 2000,
    enabled: !!workspace && !!collection
  });

  const handleCollectionChange = (updatedCollection: any) => {
    setCollection(updatedCollection);
    setDirty(tab.id, true);
    if (updatedCollection?.info?.name) {
      setName(tab.id, updatedCollection.info.name);
    }
    autoSave.trigger();
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="text-sm text-gray-500">Loading...</div></div>;
  }

  if (!collection) {
    return <div className="flex items-center justify-center h-full text-gray-500">Collection not found</div>;
  }

  // Get supported auth types from metadata
  const supportedAuthTypes = pluginLoader.getSupportedAuthTypesForProtocol(tab.protocol);

  const tabs = [
    { id: 'auth', label: 'Auth', position: 1 },
    { id: 'scripts', label: 'Scripts', position: 2 },
    { id: 'runner', label: 'Runner', position: 3 },
    { id: 'options', label: 'Options', position: 4 }
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--color-background)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b" style={{ borderColor: 'var(--gray-6)' }}>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{collection.info?.name || 'Collection'}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--gray-9)' }}>
            Configure collection-level authentication, scripts, and runner settings
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden min-h-0">
        <Tabs.Root
          value={activeSubTab}
          onValueChange={(value) => {
            console.log('[CollectionEditor] Tab changed to:', value);
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
                collection={collection}
                onChange={handleCollectionChange}
                uiContext={uiContext}
                supportedAuthTypes={supportedAuthTypes}
              />
            </Tabs.Content>

            <Tabs.Content value="scripts" className="h-full p-4 overflow-auto">
              <ScriptsTab
                collection={collection}
                onChange={handleCollectionChange}
                uiContext={uiContext}
                protocol={tab.protocol}
                theme={actualTheme}
              />
            </Tabs.Content>

            <Tabs.Content value="runner" className="h-full p-4 overflow-auto">
              <RunnerTab
                collection={collection}
                onChange={handleCollectionChange}
                workspace={workspace}
              />
            </Tabs.Content>

            <Tabs.Content value="options" className="h-full p-4 overflow-auto">
              <OptionsTab
                resource={collection}
                onChange={handleCollectionChange}
                uiContext={uiContext}
                resourceType="collection"
              />
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </div>
    </div>
  );
}

// Auth Tab Component for Collection
function AuthTab({ collection, onChange, uiContext, supportedAuthTypes }: any) {
  const { React, Radix } = uiContext;
  const authType = (!collection.auth || collection.auth.type === 'inherit' || collection.auth.type === 'none') ? 'none' : collection.auth.type;
  
  // Get loaded auth plugin UIs
  const loadedAuthTypes = React.useMemo(() => {
    const loaded = pluginLoader.getAllAuthPluginUIs().map(ui => ui.type);
    return loaded;
  }, []);
  
  // Filter auth options
  const authOptions = React.useMemo(() => {
    const available = ['none', ...supportedAuthTypes.filter((t: string) => t !== 'none' && loadedAuthTypes.includes(t))];
    return available;
  }, [supportedAuthTypes, loadedAuthTypes]);
  
  // Get the auth plugin UI
  const authPluginUI = React.useMemo(() => {
    if (authType === 'none') return null;
    return pluginLoader.getAuthPluginUI(authType);
  }, [authType]);
  
  // Get auth data
  const authData = React.useMemo(() => {
    if (authType === 'none' || !authPluginUI) return {};
    if (collection.auth?.data) return collection.auth.data;
    return authPluginUI.createDefault ? authPluginUI.createDefault() : {};
  }, [authType, collection.auth?.data, authPluginUI]);
  
  // Handle auth data change
  const handleAuthDataChange = (newData: any) => {
    onChange({
      ...collection,
      auth: {
        type: authType,
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
            <div className="text-sm">This collection does not use any authentication.</div>
            <div className="text-xs mt-1">Requests can override this setting.</div>
          </div>
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
            const newAuthPluginUI = value !== 'none' ? pluginLoader.getAuthPluginUI(value) : null;
            onChange({
              ...collection,
              auth: value === 'none'
                ? undefined
                : {
                    type: value,
                    data: newAuthPluginUI?.createDefault ? newAuthPluginUI.createDefault() : {}
                  }
            });
          }}
          size="2"
        >
          <Radix.Select.Trigger style={{ width: '100%' }} />
          <Radix.Select.Content>
            {authOptions.map((type: string) => (
              <Radix.Select.Item key={`auth-${type}`} value={type}>
                {type === 'none' ? 'No Auth' : type.charAt(0).toUpperCase() + type.slice(1)}
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

// Scripts Tab Component for Collection
function ScriptsTab({ collection, onChange, uiContext, protocol, theme }: any) {
  const { React, Monaco } = uiContext;
  
  // Get protocol plugin to check for custom events
  // Protocol-specific events (none defined yet)
  const protocolEvents: any[] = [];
  
  type ScriptTypeOption = 'collectionPre' | 'collectionPost' | 'pre' | 'post' | string;
  const [scriptType, setScriptType] = React.useState('collectionPre');
  
  // Get script value based on type
  const getScriptValue = () => {
    if (scriptType === 'collectionPre') return collection.collectionPreScript || '';
    if (scriptType === 'collectionPost') return collection.collectionPostScript || '';
    if (scriptType === 'pre') return collection.preRequestScript || '';
    if (scriptType === 'post') return collection.postRequestScript || '';
    
    // Protocol event script
    const eventScript = collection.scripts?.find((s: any) => s.event === scriptType);
    return eventScript?.script || '';
  };
  
  // Update script value
  const updateScript = (value: string) => {
    if (scriptType === 'collectionPre') {
      onChange({ ...collection, collectionPreScript: value });
    } else if (scriptType === 'collectionPost') {
      onChange({ ...collection, collectionPostScript: value });
    } else if (scriptType === 'pre') {
      onChange({ ...collection, preRequestScript: value });
    } else if (scriptType === 'post') {
      onChange({ ...collection, postRequestScript: value });
    } else {
      // Update protocol event script
      const scripts = collection.scripts || [];
      const existingIndex = scripts.findIndex((s: any) => s.event === scriptType);
      
      if (existingIndex >= 0) {
        scripts[existingIndex] = { event: scriptType, script: value };
      } else {
        scripts.push({ event: scriptType, script: value });
      }
      
      onChange({ ...collection, scripts });
    }
  };
    
  return (
      <div className="flex h-full">
      {/* Left sidebar for script type selection */}
      <div className="w-48 border-r pr-2 space-y-3" style={{ borderColor: 'var(--gray-6)' }}>
        {/* Collection lifecycle scripts */}
        <div>
          <div className="text-xs font-semibold mb-1 px-2 script-tab-label">Collection Lifecycle</div>
          <div className="space-y-1">
            <button
              onClick={() => setScriptType('collectionPre')}
              className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
              data-active={scriptType === 'collectionPre'}
              title="Runs ONCE at collection start"
              type="button"
            >
              Pre-script
            </button>
            <button
              onClick={() => setScriptType('collectionPost')}
              className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
              data-active={scriptType === 'collectionPost'}
              title="Runs ONCE at collection end"
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
