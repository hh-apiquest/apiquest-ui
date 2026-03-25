// CollectionEditor - Editor for collection-level settings (Auth, Scripts, Runner)
import React, { useRef, useState, useEffect, useCallback, useMemo, type JSX } from 'react';
import { pluginLoader } from '../../services';
import { useTabEditorBridge, useTabStatusActions, useTabNavigation } from '../../contexts';
import { useWorkspace, useTheme } from '../../contexts';
import { useAutoSave } from '../../hooks/useAutoSave';
import * as Tabs from '@radix-ui/react-tabs';
import type { Tab } from '../../contexts/TabContext';
import type { Auth, Collection, ProtocolScript } from '@apiquest/types';
import type { PluginUIContext, IAuthPluginUI } from '@apiquest/plugin-ui-types';
import { RunnerTab } from './RunnerTab';
import { OptionsTab } from '../request/OptionsTab';
import type { RunnerCollection } from '../../types/runner-tab';
import type { ProtocolPluginWithEvents } from '../../types/plugin-loader';

interface CollectionEditorProps {
  tab: Tab;
}

type CollectionEditorCollection = RunnerCollection & {
  scripts?: ProtocolScript[];
};

type CollectionEditorSessionState = Pick<
  CollectionEditorCollection,
  'auth' | 'collectionPreScript' | 'collectionPostScript' | 'preRequestScript' | 'postRequestScript'
>;

type CollectionEditorUiContext = PluginUIContext & {
  Radix: typeof import('@radix-ui/themes');
  theme: 'light' | 'dark';
};

type AuthTabProps = {
  collection: CollectionEditorCollection;
  onChange: (collection: CollectionEditorCollection) => void;
  uiContext: CollectionEditorUiContext;
  supportedAuthTypes: string[];
};

type ScriptsTabProps = {
  collection: CollectionEditorCollection;
  onChange: (collection: CollectionEditorCollection) => void;
  uiContext: CollectionEditorUiContext;
  protocol: string;
  theme: 'light' | 'dark';
};

function isAuthDataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function CollectionEditor({ tab }: CollectionEditorProps): JSX.Element {
  const { setDirty, setName } = useTabStatusActions();
  const { registerSaveHandler, registerDiscardHandler } = useTabEditorBridge();
  const { saveResourceState, clearResourceState, getResourceState, updateTabUIState, setTabEditorState, getTabEditorState, clearTabEditorState } = useTabNavigation();
  const { workspace, updateCollection, clearCollectionCache, refreshWorkspace } = useWorkspace();
  const { actualTheme } = useTheme();
  const [collection, setCollection] = useState<CollectionEditorCollection | null>(null);
  // Stable ref so handleAutoSave never captures a stale collection closure.
  const collectionRef = useRef<CollectionEditorCollection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<string>(tab.uiState?.activeSubTab ?? 'auth');
  
  // Get UI context for tab components (memoized to prevent re-creating on every render)
  const uiContext = useMemo(() => pluginLoader.getUIContext() as CollectionEditorUiContext, []);

  // Sync local state with tab.uiState on tab changes
  useEffect((): void => {
    const newActiveSubTab = tab.uiState?.activeSubTab ?? 'auth';
    console.log('[CollectionEditor] Restoring tab state:', {
      tabId: tab.id,
      'tab.uiState': tab.uiState,
      'tab.uiState?.activeSubTab': tab.uiState?.activeSubTab,
      newActiveSubTab,
      currentActiveSubTab: activeSubTab
    });
    setActiveSubTab(newActiveSubTab);
  }, [tab.id, tab.uiState?.activeSubTab]);

  // Keep collectionRef current so handleAutoSave and the save handler always read latest data.
  useEffect((): void => {
    collectionRef.current = collection;
  }, [collection]);

  // Load collection from workspace
  useEffect(() => {
    const loadCollection = async (): Promise<void> => {
      if (workspace === null) {
        return;
      }
      
      try {
        setIsLoading(true);
        const baseCollection = await window.quest.workspace.loadCollection(workspace.id, tab.resourceId) as CollectionEditorCollection;
        
        // Primary: in-memory state from a previous tab switch.
        // Secondary: IPC session state (app restart recovery).
        const inMemoryState = getTabEditorState(tab.id) as CollectionEditorCollection | undefined;
        
        let finalCollection: CollectionEditorCollection;
        if (inMemoryState !== undefined) {
          finalCollection = inMemoryState;
          setDirty(tab.id, true);
        } else {
          // For collections, resourceId equals collectionId. Composite key: collectionId::collectionId.
          const sessionState = await getResourceState(workspace.id, `${tab.collectionId}::${tab.resourceId}`) as CollectionEditorSessionState | null;
          finalCollection = {
            ...baseCollection,
            auth: sessionState?.auth ?? baseCollection.auth,
            collectionPreScript: sessionState?.collectionPreScript ?? baseCollection.collectionPreScript ?? '',
            collectionPostScript: sessionState?.collectionPostScript ?? baseCollection.collectionPostScript ?? '',
            preRequestScript: sessionState?.preRequestScript ?? baseCollection.preRequestScript ?? '',
            postRequestScript: sessionState?.postRequestScript ?? baseCollection.postRequestScript ?? ''
          };
          if (sessionState !== null) {
            setDirty(tab.id, true);
          }
        }
        
        setCollection(finalCollection);
      } catch (error: unknown) {
        console.error('Failed to load collection:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    void loadCollection();
  }, [getResourceState, getTabEditorState, setDirty, tab.collectionId, tab.id, tab.resourceId, workspace]);

  // Register save handler for TabBar close flow
  useEffect(() => {
    if (workspace === null) {
      return;
    }

    const unregister = registerSaveHandler(tab.id, async () => {
      if (collectionRef.current === null) {
        return;
      }
      // Strip transient in-memory fields before persisting to the collection file.
      const { _runnerState: _rs, ...currentCollection } = collectionRef.current;
      await updateCollection(tab.collectionId, currentCollection);
      setDirty(tab.id, false);
      clearTabEditorState(tab.id);
      // refresh cache so editors reload the latest if reopened
      clearCollectionCache(tab.collectionId);
      await refreshWorkspace();
      await clearResourceState(workspace.id, `${tab.collectionId}::${tab.resourceId}`);
    });

    return unregister;
  }, [workspace, registerSaveHandler, tab.id, tab.collectionId, tab.resourceId, updateCollection, setDirty, clearTabEditorState, clearCollectionCache, refreshWorkspace, clearResourceState]);

  // Stable auto-save callback — does NOT depend on `collection` state directly.
  // Reads collectionRef.current to prevent useAutoSave's cleanup from firing on every change.
  // _runnerState is NOT stored in IPC session (File objects can't serialize; use in-memory only).
  const handleAutoSave = useCallback(async () => {
    if (workspace === null || collectionRef.current === null) {
      return;
    }
    const currentCollection = collectionRef.current;
    
    try {
      // For collections, resourceId equals collectionId. Composite key: collectionId::collectionId.
      await saveResourceState(workspace.id, `${tab.collectionId}::${tab.resourceId}`, {
        auth: currentCollection.auth,
        collectionPreScript: currentCollection.collectionPreScript,
        collectionPostScript: currentCollection.collectionPostScript,
        preRequestScript: currentCollection.preRequestScript,
        postRequestScript: currentCollection.postRequestScript
        // _runnerState intentionally omitted — in-memory only, not serialized to IPC session
      });
    } catch (error: unknown) {
      console.error('AutoSave failed:', error);
    }
  }, [workspace, tab.collectionId, tab.resourceId, saveResourceState]);

  const { trigger: triggerAutoSave, cancel: cancelAutoSave } = useAutoSave({
    onSave: handleAutoSave,
    delay: 1000,
    enabled: workspace !== null && collection !== null
  });

  useEffect(() => {
    const unregisterDiscard = registerDiscardHandler(tab.id, async () => {
      clearTabEditorState(tab.id);
      await cancelAutoSave();
    });

    return unregisterDiscard;
  }, [registerDiscardHandler, tab.id, cancelAutoSave, clearTabEditorState]);

  const handleCollectionChange = (updatedCollection: CollectionEditorCollection): void => {
    setCollection(updatedCollection);
    // Immediately store in in-memory tab state — primary persistence mechanism for tab switches.
    setTabEditorState(tab.id, updatedCollection);
    setDirty(tab.id, true);
    if (updatedCollection.info.name !== '') {
      setName(tab.id, updatedCollection.info.name);
    }
    triggerAutoSave();
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="text-sm text-gray-500">Loading...</div></div>;
  }

  if (collection === null) {
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
          <h2 className="text-lg font-semibold">{collection.info.name !== '' ? collection.info.name : 'Collection'}</h2>
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
            {tabs.map((tabItem) => (
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
function AuthTab({ collection, onChange, uiContext, supportedAuthTypes }: AuthTabProps): JSX.Element {
  const { React, Radix } = uiContext;
  const authType = collection.auth === undefined || collection.auth.type === 'inherit' || collection.auth.type === 'none'
    ? 'none'
    : collection.auth.type;
  
  // Get loaded auth plugin UIs
  const loadedAuthTypes = React.useMemo(() => {
    const loaded = pluginLoader.getAllAuthPluginUIs().map((ui) => ui.type);
    return loaded;
  }, []);
  
  // Filter auth options
  const authOptions = React.useMemo(() => {
    const available = ['none', ...supportedAuthTypes.filter((t: string) => t !== 'none' && loadedAuthTypes.includes(t))];
    return available;
  }, [supportedAuthTypes, loadedAuthTypes]);
  
  // Get the auth plugin UI
  const authPluginUI = React.useMemo<IAuthPluginUI | null>(() => {
    if (authType === 'none') return null;
    return pluginLoader.getAuthPluginUI(authType) ?? null;
  }, [authType]);
  
  // Get auth data
  const authData = React.useMemo<Record<string, unknown>>(() => {
    if (authType === 'none' || authPluginUI === null) {
      return {};
    }

    const authData = collection.auth?.data;
    if (authData !== undefined && isAuthDataRecord(authData)) {
      return authData;
    }

    const defaultData = authPluginUI.createDefault();
    return isAuthDataRecord(defaultData) ? defaultData : {};
  }, [authType, collection.auth?.data, authPluginUI]);
  
  // Handle auth data change
  const handleAuthDataChange = (newData: unknown): void => {
    onChange({
      ...collection,
      auth: {
        type: authType,
        data: isAuthDataRecord(newData) ? newData : {}
      }
    });
  };
  
  // Render auth form
  const renderAuthForm = (): JSX.Element => {
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

    if (authPluginUI === null) {
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
                : (() => {
                    const defaultData = newAuthPluginUI?.createDefault();
                    return {
                      type: value,
                      data: isAuthDataRecord(defaultData) ? defaultData : {}
                    } satisfies Auth;
                  })()
            });
          }}
          size="2"
        >
          <Radix.Select.Trigger style={{ width: '100%' }} />
          <Radix.Select.Content>
            {authOptions.map((type) => (
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
function ScriptsTab({ collection, onChange, uiContext, protocol, theme }: ScriptsTabProps): JSX.Element {
  const { React, Monaco } = uiContext;
  
  // Get protocol plugin to check for custom events
  const protocolPlugin = pluginLoader.getProtocolPluginUI(protocol) as ProtocolPluginWithEvents | undefined;
  const protocolEvents = protocolPlugin?.events ?? [];
  
  type ScriptTypeOption = 'collectionPre' | 'collectionPost' | 'pre' | 'post' | string;
  const [scriptType, setScriptType] = React.useState<ScriptTypeOption>('collectionPre');

  // Update Monaco IntelliSense context when script type or protocol changes
  React.useEffect(() => {
    const phase =
      scriptType === 'collectionPre' ? 'collection-pre' :
      scriptType === 'collectionPost' ? 'collection-post' :
      scriptType === 'pre' ? 'pre-request' :
      scriptType === 'post' ? 'post-request' :
      'plugin-event';

    pluginLoader.setActiveScriptIntellisenseContext({
      protocol,
      ownerType: 'collection',
      phase,
      eventName: phase === 'plugin-event' ? scriptType : undefined,
    });
  }, [scriptType, protocol]);

  // Get script value based on type
  const getScriptValue = (): string => {
    if (scriptType === 'collectionPre') return collection.collectionPreScript ?? '';
    if (scriptType === 'collectionPost') return collection.collectionPostScript ?? '';
    if (scriptType === 'pre') return collection.preRequestScript ?? '';
    if (scriptType === 'post') return collection.postRequestScript ?? '';
    
    // Protocol event script
    const eventScript = collection.scripts?.find((script) => script.event === scriptType);
    return eventScript?.script ?? '';
  };
  
  // Update script value
  const updateScript = (value: string): void => {
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
      const scripts = [...(collection.scripts ?? [])];
      const existingIndex = scripts.findIndex((script) => script.event === scriptType);
      
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
              {protocolEvents.map((evt) => (
                <button
                  key={evt.name}
                  onClick={() => setScriptType(evt.name)}
                  className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
                  data-active={scriptType === evt.name}
                  type="button"
                >
                  {evt.name}
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
