// RequestEditor - Main request editing component using plugin UI system
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { pluginLoader } from '../../services';
import { useTabEditorBridge, useTabNavigation, useTabStatusActions, type Tab } from '../../contexts/TabContext';
import { useWorkspace, useTheme } from '../../contexts';
import { useAutoSave } from '../../hooks/useAutoSave';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Switch } from '@radix-ui/themes';
import type { Request, Collection } from '@apiquest/types';
import type { UITabProps } from '@apiquest/plugin-ui-types';
import { ResponseViewer } from '../response/ResponseViewer';
import { OptionsTab } from './OptionsTab';
import { resolveInheritedAuth } from '../../utils/authInheritance';

interface RequestEditorProps {
  tab: Tab;
}

export function RequestEditor({ tab }: RequestEditorProps) {
  const { saveResourceState, clearResourceState, getResourceState, updateTabExecution, updateTabUIState, clearTemporaryFlag } = useTabNavigation();
  const { setDirty, setMetadata } = useTabStatusActions();
  const { registerSaveHandler } = useTabEditorBridge();
  const { workspace, activeEnvironment, loadEnvironment, getCollection, updateRequest } = useWorkspace();
  const { actualTheme } = useTheme();
  const [request, setRequest] = useState<Request | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<Array<{ id: string; name: string; type: 'folder' | 'request' }>>([]);
  
  const uiState = useMemo(() => ({
    theme: actualTheme
  }), [actualTheme]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [bypassExecutionControl, setBypassExecutionControl] = useState(false);
 const rootRef = useRef<HTMLDivElement | null>(null);
  const [responseHeight, setResponseHeight] = useState(240);
  const [activeSubTab, setActiveSubTab] = useState<string | null>(null);
  
  // Check if request has execution control (dependencies or conditions)
  const hasExecutionControl = useMemo(() =>
    (request?.dependsOn && request.dependsOn.length > 0) || !!request?.condition,
    [request?.dependsOn, request?.condition]
  );
  
  const execution = tab.execution;
  const response = execution?.result;
  const events = execution?.events || [];

  console.log('[RequestEditor] Render - execution state:', {
    hasExecution: !!execution,
    status: execution?.status,
    hasResult: !!response,
    eventsCount: events.length,
    executionId: execution?.executionId
  });

  const pluginUI = useMemo(() => pluginLoader.getProtocolPluginUI(tab.protocol), [tab.protocol]);
  const uiContext = useMemo(() => pluginLoader.getUIContext(), []);

  const supportedAuthTypes = useMemo(() => 
    pluginLoader.getSupportedAuthTypesForProtocol(tab.protocol),
    [tab.protocol]
  );

  const protocolTabs = useMemo(() => (pluginUI?.getRequestTabs ? pluginUI.getRequestTabs() : []), [pluginUI]);

  const authTabComponent = useCallback(
    (props: UITabProps) => (
      <AuthTab {...props} supportedAuthTypes={supportedAuthTypes} collection={collection} />
    ),
    [supportedAuthTypes, collection]
  );

  const scriptsTabComponent = useCallback(
    (props: UITabProps) => (
      <ScriptsTab {...props} protocol={tab.protocol} />
    ),
    [tab.protocol]
  );

  const optionsTabComponent = useCallback(
    (props: UITabProps) => (
      <OptionsTab
        resource={props.request}
        onChange={props.onChange}
        uiContext={props.uiContext}
        uiState={props.uiState}
        allItems={collectionItems}
        currentItemId={tab.resourceId}
        resourceType="request"
        collection={collection || undefined}
      />
    ),
    [collectionItems, tab.resourceId, collection]
  );

  const allTabs = useMemo(() => {
    const authTab = {
      id: 'auth',
      label: 'Auth',
      position: 5,
      component: authTabComponent
    };

    const scriptsTab = {
      id: 'scripts',
      label: 'Scripts',
      position: 100,
      component: scriptsTabComponent
    };

    const optionsTab = {
      id: 'options',
      label: 'Options',
      position: 101,
      component: optionsTabComponent
    };

    return [authTab, ...protocolTabs, scriptsTab, optionsTab].sort((a, b) => (a.position || 50) - (b.position || 50));
  }, [authTabComponent, scriptsTabComponent, optionsTabComponent, protocolTabs]);

  // Sync local state with tab.uiState on tab changes
  useEffect(() => {
    const newActiveSubTab = tab.uiState?.activeSubTab || (allTabs[0]?.id ?? null);
    setActiveSubTab(newActiveSubTab);
  }, [tab.id, tab.uiState?.activeSubTab, allTabs]);

  useEffect(() => {
    const loadRequest = async () => {
      if (!workspace) return;
      
      try {
        setIsLoading(true);
        
        const loadedCollection = await getCollection(tab.collectionId);
        setCollection(loadedCollection);
        
        const findRequest = (items: any[]): any => {
          for (const item of items) {
            if (item.id === tab.resourceId) return item;
            if (item.items) {
              const found = findRequest(item.items);
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
        
        const baseRequest = findRequest(loadedCollection.items);
        if (!baseRequest) throw new Error('Request not found');
        
        const sessionState = await getResourceState(workspace.id, tab.resourceId);
        
        const finalRequest: Request = {
          type: 'request',
          id: baseRequest.id,
          name: sessionState?.name || baseRequest.name,
          description: sessionState?.description || baseRequest.description || '',
          data: sessionState?.data || baseRequest.data || {},
          auth: sessionState?.auth ?? baseRequest.auth,
          preRequestScript: sessionState?.preRequestScript ?? baseRequest.preRequestScript ?? '',
          postRequestScript: sessionState?.postRequestScript ?? baseRequest.postRequestScript ?? '',
          dependsOn: sessionState?.dependsOn ?? baseRequest.dependsOn,
          condition: sessionState?.condition ?? baseRequest.condition
        };
        
        setRequest(finalRequest);
        
        if (sessionState) {
          setDirty(tab.id, true);
        }
        
        // Set badge metadata from plugin
        if (pluginUI) {
          const badge = pluginUI.getRequestBadge(finalRequest);
          setMetadata(tab.id, {
            badge,
            description: finalRequest.description
          });
        }
      } catch (error) {
        console.error('Failed to load request:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadRequest();
  }, [tab.id, tab.resourceId, tab.collectionId]);

  useEffect(() => {
    if (!workspace) return;

    const unregister = registerSaveHandler(tab.id, async () => {
      if (!request) return;
      await updateRequest(tab.collectionId, tab.resourceId, request);
      setDirty(tab.id, false);
      await clearResourceState(workspace.id, tab.resourceId);
    });

    return unregister;
  }, [registerSaveHandler, workspace, tab.id, tab.collectionId, tab.resourceId, request, updateRequest, setDirty, clearResourceState]);

  const handleAutoSave = useCallback(async () => {
    if (!workspace || !request) return;
    
    try {
      await saveResourceState(workspace.id, tab.resourceId, {
        name: request.name,
        description: request.description,
        data: request.data,
        // Normalize "inherit" to undefined - inherit is default behavior and shouldn't create session state
        auth: request.auth?.type === 'inherit' ? undefined : request.auth,
        preRequestScript: request.preRequestScript,
        postRequestScript: request.postRequestScript,
        dependsOn: request.dependsOn,
        condition: request.condition
      });
    } catch (error) {
      console.error('AutoSave failed:', error);
    }
  }, [workspace, request, tab.resourceId, saveResourceState]);

  const autoSave = useAutoSave({
    onSave: handleAutoSave,
    delay: 2000,
    enabled: !!workspace && !!request
  });

  const handleRequestChange = (updatedRequest: Request) => {
    setRequest(updatedRequest);
    setDirty(tab.id, true);
    
    // Make temporary tab permanent when data changes
    if (tab.isTemporary) {
      clearTemporaryFlag(tab.id);
    }
    
    // Update badge metadata from plugin when request changes
    if (pluginUI) {
      const badge = pluginUI.getRequestBadge(updatedRequest);
      setMetadata(tab.id, { badge });
    }
    
    autoSave.trigger();
  };

  const handleSend = async () => {
    if (isSending || !request || !workspace) return;
    if (!tab.execution) {
      console.error('[RequestEditor] Tab has no execution state, this should not happen');
      return;
    }

    // Make temporary tab permanent when sending request
    if (tab.isTemporary) {
      clearTemporaryFlag(tab.id);
    }

    const executionId = tab.execution.executionId;
    
    updateTabExecution(tab.id, {
      status: 'running',
      startTime: Date.now(),
      events: [],
      result: undefined,
      error: undefined
    });

    setIsSending(true);

    try {
      let collectionVariables = {};
      try {
        const collection = await window.quest.workspace.loadCollection(workspace.id, tab.collectionId);
        collectionVariables = collection.variables || {};
      } catch (error) {
        console.warn('Failed to load collection variables:', error);
      }

      let environmentVariables = {};
      if (activeEnvironment) {
        try {
          const env = await loadEnvironment(activeEnvironment.fileName);
          environmentVariables = Object.entries(env.variables || {}).reduce((acc, [key, value]) => {
            if (typeof value === 'object' && 'value' in value && value.enabled !== false) {
              acc[key] = value.value;
            } else if (typeof value === 'string') {
              acc[key] = value;
            }
            return acc;
          }, {} as Record<string, string>);
        } catch (error) {
          console.warn('Failed to load environment variables:', error);
        }
      }

      let globalVariables = {};
      try {
        const globals = await window.quest.globalVariables.load();
        globalVariables = Object.entries(globals || {}).reduce((acc, [key, value]) => {
          if (typeof value === 'object' && value !== null && 'value' in value) {
            const varObj = value as { value: unknown; enabled?: boolean };
            if (varObj.enabled !== false && typeof varObj.value === 'string') {
              acc[key] = varObj.value;
            }
          } else if (typeof value === 'string') {
            acc[key] = value;
          }
          return acc;
        }, {} as Record<string, string>);
      } catch (error) {
        console.warn('Failed to load global variables:', error);
      }

      // Create a modified request if bypassing execution control
      const effectiveRequest = bypassExecutionControl
        ? { ...request, dependsOn: undefined, condition: undefined }
        : request;

      const result = await window.quest.runner.runRequest({
        executionId,
        workspaceId: workspace!.id,
        collectionId: tab.collectionId,
        protocol: tab.protocol,
        request: effectiveRequest,
        variables: {
          collection: collectionVariables,
          environment: environmentVariables,
          global: globalVariables
        }
      });

      // Update execution state with result
      updateTabExecution(tab.id, {
        status: 'complete',
        endTime: Date.now(),
        result: result.response,
        error: undefined
      });
      
    } catch (error) {
      console.error('Request failed:', error);
      
      // Update execution state with error
      updateTabExecution(tab.id, {
        status: 'error',
        endTime: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm" style={{ color: 'var(--gray-9)' }}>Loading...</div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--gray-9)' }}>
        Request not found
      </div>
    );
  }

  if (!pluginUI) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--gray-9)' }}>
        No plugin found for protocol: {tab.protocol}
      </div>
    );
  }

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const startResponseResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rootRect = rootRef.current?.getBoundingClientRect();
    if (!rootRect) return;

    const onMove = (ev: PointerEvent) => {
      const nextHeight = clamp(rootRect.bottom - ev.clientY, 120, Math.max(120, rootRect.height - 150));
      setResponseHeight(nextHeight);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div ref={rootRef} className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex gap-2 p-2 border-b">
          <div className="flex-1">
            {pluginUI.renderAddressBar(request, handleRequestChange)}
          </div>

          <button
            onClick={handleSend}
            className="text-sm font-medium rounded border-none cursor-pointer"
            style={{
              flexShrink: 0,
              width: '80px',
              background: isSending ? '#dc2626' : 'var(--accent-9)',
              color: 'white'
            }}
          >
            {isSending ? 'Cancel' : 'Send'}
          </button>
        </div>

        <div className="flex-1 overflow-hidden min-h-0">
          <Tabs.Root
            value={activeSubTab || allTabs[0]?.id}
            onValueChange={(value) => {
              setActiveSubTab(value);
              updateTabUIState(tab.id, { activeSubTab: value });
            }}
            className="flex flex-col h-full"
          >
            <style>{`
              .request-tab-trigger[data-state=active] {
                border-bottom: 2px solid var(--accent-9);
                color: var(--accent-9);
              }
            `}</style>
          <Tabs.List className="flex items-center border-b px-4 editor-tabs-list" style={{ borderColor: 'var(--gray-6)', width: '100%' }}>
            <div className="flex items-center flex-1">
              {allTabs
                .filter(tab => !('visible' in tab) || !tab.visible || tab.visible(request))
                .map(tab => (
                  <Tabs.Trigger
                    key={tab.id}
                    value={tab.id}
                    className="request-tab-trigger px-4 py-2 text-sm font-medium border-none bg-transparent editor-tab-trigger"
                  >
                    {tab.label}
                  </Tabs.Trigger>
                ))}
            </div>
            
            {/* Bypass Execution Control Toggle */}
            {hasExecutionControl && (
              <Tooltip.Provider delayDuration={300}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <div className="flex items-center" style={{ paddingRight: '25px', cursor: 'help' }}>
                      <Switch
                        checked={bypassExecutionControl}
                        onCheckedChange={(checked: boolean) => setBypassExecutionControl(checked)}
                        size="1"
                      />
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="select-none rounded px-2 py-1 text-xs leading-none shadow-md"
                      style={{
                        backgroundColor: 'var(--gray-12)',
                        color: 'var(--gray-1)',
                        maxWidth: '250px'
                      }}
                      sideOffset={5}
                    >
                      Bypass execution control: When enabled, dependencies and conditions will be ignored. Useful for testing individual requests.
                      <Tooltip.Arrow style={{ fill: 'var(--gray-12)' }} />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            )}
          </Tabs.List>

            <div className="flex-1 overflow-hidden min-h-0" style={{ paddingBottom: '35px' }}>
              {allTabs.map(tab => {
                const TabComponent = tab.component;
                return (
                  <Tabs.Content key={tab.id} value={tab.id} className="h-full p-4 overflow-auto">
                    <TabComponent request={request} onChange={handleRequestChange} uiContext={uiContext} uiState={uiState} />
                  </Tabs.Content>
                );
              })}
            </div>
          </Tabs.Root>
        </div>

      </div>

      <div
        className="resize-bar"
        onPointerDown={startResponseResize}
        style={{ height:'1px', cursor: 'ns-resize', WebkitAppRegion: 'no-drag' } as any}
      />

      <div className="border-t" style={{ height: responseHeight }}>
        <ResponseViewer
          request={request}
          response={response}
          events={events}
          error={execution?.error}
          pluginUI={pluginUI}
          uiContext={uiContext}
          uiState={uiState}
        />
      </div>
    </div>
  );
}

function ScriptsTab({ request, onChange, uiContext, uiState, protocol }: UITabProps & { protocol: string }) {
  const { React, Monaco } = uiContext;
  const theme = uiState.theme;
  
  const protocolEvents: any[] = [];
  
  type ScriptTypeOption = 'pre' | 'post' | string;
  const [scriptType, setScriptType] = React.useState<ScriptTypeOption>('pre');
  
  const getScriptValue = () => {
    if (scriptType === 'pre') return request.preRequestScript || '';
    if (scriptType === 'post') return request.postRequestScript || '';
    
    const eventScript = request.data.scripts?.find(s => s.event === scriptType);
    return eventScript?.script || '';
  };
  
  const updateScript = (value: string) => {
    if (scriptType === 'pre') {
      onChange({ ...request, preRequestScript: value });
    } else if (scriptType === 'post') {
      onChange({ ...request, postRequestScript: value });
    } else {
      const scripts = request.data.scripts || [];
      const existingIndex = scripts.findIndex(s => s.event === scriptType);
      
      if (existingIndex >= 0) {
        scripts[existingIndex] = { event: scriptType, script: value };
      } else {
        scripts.push({ event: scriptType, script: value });
      }
      
      onChange({
        ...request,
        data: { ...request.data, scripts }
      });
    }
  };
    
  return (
    <div className="flex h-full">
      <div className="w-48 pr-2 border-r flex flex-col" style={{ borderColor: 'var(--gray-6)', gap: '12px' }}>
        <div>
          <div className="text-xs font-semibold mb-1 px-2 script-tab-label">Universal</div>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setScriptType('pre')}
              className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
              data-active={scriptType === 'pre'}
            >
              Pre-request
            </button>
            <button
              onClick={() => setScriptType('post')}
              className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
              data-active={scriptType === 'post'}
            >
              Post-request
            </button>
          </div>
        </div>

        {protocolEvents.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-1 px-2 script-tab-label">
              {protocol.toUpperCase()} Events
            </div>
            <div className="flex flex-col gap-1">
              {protocolEvents.map((evt: any) => (
                <button
                  key={evt.name}
                  onClick={() => setScriptType(evt.name)}
                  className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
                  data-active={scriptType === evt.name}
                  title={evt.description}
                >
                  {evt.name}{evt.required ? ' *' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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


// Auth Tab Component
function AuthTab({ request, onChange, uiContext, supportedAuthTypes, collection }: UITabProps & { supportedAuthTypes: string[]; collection: Collection | null }) {
  const { React, Radix } = uiContext;
  
  // Compute auth type: none (explicit), inherit (missing/type:'inherit'), or concrete type
  const authType = React.useMemo(() => {
    if (request.auth?.type === 'none') return 'none';
    if (!request.auth || request.auth.type === 'inherit') return 'inherit';
    return request.auth.type;
  }, [request.auth]);
  
  const loadedAuthTypes = React.useMemo(() => {
    const loaded = pluginLoader.getAllAuthPluginUIs().map(ui => ui.type);
    return loaded;
  }, []);
  
  const authOptions = React.useMemo(() => {
    const available = ['inherit', 'none', ...supportedAuthTypes.filter(t => t !== 'none' && t !== 'inherit' && loadedAuthTypes.includes(t))];
    return available;
  }, [supportedAuthTypes, loadedAuthTypes]);
  
  // Resolve inherited auth when type is 'inherit'
  const inheritedAuth = React.useMemo(() => {
    if (authType !== 'inherit' || !collection) return null;
    return resolveInheritedAuth(collection, request.id);
  }, [authType, collection, request.id]);
  
  // Determine which auth to display
  const displayAuth = authType === 'inherit' ? inheritedAuth?.auth : request.auth;
  const displayAuthType = displayAuth?.type || 'none';
  
  const authPluginUI = React.useMemo(() => {
    if (displayAuthType === 'none' || displayAuthType === 'inherit') return null;
    const plugin = pluginLoader.getAuthPluginUI(displayAuthType);
    return plugin;
  }, [displayAuthType]);
  
  const authData = React.useMemo(() => {
    if (displayAuthType === 'none' || displayAuthType === 'inherit' || !authPluginUI) {
      return {};
    }
    if (displayAuth?.data) {
      return displayAuth.data;
    }
    const defaultData = authPluginUI.createDefault ? authPluginUI.createDefault() : {};
    return defaultData;
  }, [displayAuthType, displayAuth, authPluginUI]);
  
  const handleAuthDataChange = (newData: any) => {
    onChange({
      ...request,
      auth: {
        type: displayAuthType,
        data: newData
      }
    });
  };
  
  const renderAuthForm = () => {
    if (authType === 'none') {
      return (
        <div className="flex items-center justify-center flex-1" style={{ color: 'var(--gray-9)' }}>
          <div className="text-center">
            <div className="text-sm">This request explicitly uses no authentication.</div>
            <div className="text-xs mt-1">This overrides any authentication set in parent folders or collection.</div>
          </div>
        </div>
      );
    }
    
    if (authType === 'inherit') {
      if (!inheritedAuth || !inheritedAuth.auth) {
        return (
          <div className="flex items-center justify-center flex-1" style={{ color: 'var(--gray-9)' }}>
            <div className="text-center">
              <div className="text-sm">No authentication set in parent chain.</div>
              <div className="text-xs mt-1">Select an auth type to configure authentication for this request.</div>
            </div>
          </div>
        );
      }
      
      if (!authPluginUI) {
        return (
          <div className="flex items-center justify-center flex-1" style={{ color: '#ef4444' }}>
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
        <div className="flex items-center justify-center flex-1" style={{ color: '#ef4444' }}>
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
      <div className="w-64 pr-4 border-r" style={{ borderRight: '1px solid var(--gray-6)' }}>
        <label className="block text-sm font-medium mb-2">Type</label>
        <Radix.Select.Root
          value={authType}
          onValueChange={(value: string) => {
            if (value === 'inherit') {
              // Clear auth to inherit from parent
              onChange({
                ...request,
                auth: undefined
              });
            } else if (value === 'none') {
              // Explicit no auth
              onChange({
                ...request,
                auth: { type: 'none' }
              });
            } else {
              // Concrete auth type
              const newAuthPluginUI = pluginLoader.getAuthPluginUI(value);
              onChange({
                ...request,
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

      <div className="flex-1 pl-4">
        {renderAuthForm()}
      </div>
    </div>
  );
}
