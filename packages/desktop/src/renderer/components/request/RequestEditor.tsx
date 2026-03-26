// RequestEditor - Main request editing component using plugin UI system
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { pluginLoader } from '../../services';
import { useTabEditorBridge, useTabNavigation, useTabStatusActions, type Tab } from '../../contexts/TabContext';
import { useWorkspace, useTheme } from '../../contexts';
import { useAutoSave } from '../../hooks/useAutoSave';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Switch } from '@radix-ui/themes';
import type { Auth, Collection, CollectionItem, Request, VariableValue } from '@apiquest/types';
import type { UITab, UITabProps } from '@apiquest/plugin-ui-types';
import type { ProtocolScript } from '@apiquest/types';
import { ResponseViewer } from '../response/ResponseViewer';
import { OptionsTab } from './OptionsTab';
import { resolveInheritedAuth } from '../../utils/authInheritance';
import { extractVariablePrimitive } from '../../utils/variables';
import type { ProtocolPluginEventDefinition, ProtocolPluginWithEvents } from '../../types/plugin-loader';

interface RequestEditorProps {
  tab: Tab;
}

interface CollectionDependencyItem {
  id: string;
  name: string;
  type: 'folder' | 'request';
}

function isRequestItem(item: CollectionItem): item is Request {
  return item.type === 'request';
}

function findRequestInItems(items: CollectionItem[], requestId: string): Request | null {
  for (const item of items) {
    if (isRequestItem(item) && item.id === requestId) {
      return item;
    }

    if (item.type === 'folder') {
      const found = findRequestInItems(item.items, requestId);
      if (found !== null) {
        return found;
      }
    }
  }

  return null;
}

function extractCollectionItems(items: CollectionItem[]): CollectionDependencyItem[] {
  const allItems: CollectionDependencyItem[] = [];

  for (const item of items) {
    if (item.type === 'request' || item.type === 'folder') {
      allItems.push({ id: item.id, name: item.name, type: item.type });
    }

    if (item.type === 'folder') {
      allItems.push(...extractCollectionItems(item.items));
    }
  }

  return allItems;
}

function isAuth(value: unknown): value is Auth {
  return typeof value === 'object' && value !== null && 'type' in value;
}

function isRequestDraft(value: unknown): value is Request {
  return typeof value === 'object' && value !== null && 'type' in value && 'data' in value && 'id' in value;
}

export function RequestEditor({ tab }: RequestEditorProps): React.ReactElement {
  const { saveResourceState, clearResourceState, getResourceState, updateTabExecution, updateTabUIState, clearTemporaryFlag, setTabEditorState, getTabEditorState, clearTabEditorState } = useTabNavigation();
  const { setDirty, setMetadata } = useTabStatusActions();
  const { registerSaveHandler, registerDiscardHandler, registerFlushHandler } = useTabEditorBridge();
  const { workspace, activeEnvironment, loadEnvironment, getCollection, updateRequest } = useWorkspace();
  const { actualTheme } = useTheme();
  const [request, setRequest] = useState<Request | null>(null);
  // Stable ref so handleAutoSave never captures a stale request closure.
  // Without this, every request state change recreates handleAutoSave → executeSave,
  // causing useAutoSave's cleanup to fire on every keystroke, cancelling the timer
  // and resetting hasPendingSaveRef.current — meaning flush() would always be a no-op.
  const requestRef = useRef<Request | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionDependencyItem[]>([]);
  
  const uiState = useMemo(() => ({
    theme: actualTheme
  }), [actualTheme]);
  const [isLoading, setIsLoading] = useState(true);
  const [bypassExecutionControl, setBypassExecutionControl] = useState(false);
 const rootRef = useRef<HTMLDivElement | null>(null);
  const [responseHeight, setResponseHeight] = useState(240);
  const [activeSubTab, setActiveSubTab] = useState<string | null>(null);
  
  // Check if request has execution control (dependencies or conditions)
  const hasExecutionControl = useMemo(() => {
    const hasDependencies = request?.dependsOn !== undefined && request.dependsOn.length > 0;
    const hasCondition = request?.condition !== undefined && request.condition !== '';
    return hasDependencies || hasCondition;
  }, [request?.dependsOn, request?.condition]);
  
  const execution = tab.execution;
  const response = execution?.result ?? null;
  const events = execution?.events ?? [];
  const isSending = execution?.status === 'running';

  console.log('[RequestEditor] Render - execution state:', {
    hasExecution: execution !== undefined,
    status: execution?.status,
    hasResult: response !== null,
    eventsCount: events.length,
    executionId: execution?.executionId
  });

  const pluginUI = useMemo(() => pluginLoader.getProtocolPluginUI(tab.protocol), [tab.protocol]);
  const uiContext = useMemo(() => pluginLoader.getUIContext(), []);

  const supportedAuthTypes = useMemo(() => 
    pluginLoader.getSupportedAuthTypesForProtocol(tab.protocol),
    [tab.protocol]
  );

  const protocolTabs = useMemo(() => {
    if (pluginUI?.getRequestTabs === undefined) {
      return [];
    }

    return pluginUI.getRequestTabs();
  }, [pluginUI]);

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
        collection={collection ?? undefined}
      />
    ),
    [collectionItems, tab.resourceId, collection]
  );

  const allTabs = useMemo<UITab[]>(() => {
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

    return [authTab, ...protocolTabs, scriptsTab, optionsTab].sort((a, b) => (a.position ?? 50) - (b.position ?? 50));
  }, [authTabComponent, scriptsTabComponent, optionsTabComponent, protocolTabs]);

  // Sync local state with tab.uiState on tab changes
  useEffect(() => {
    const newActiveSubTab = tab.uiState?.activeSubTab ?? allTabs[0]?.id ?? null;
    setActiveSubTab(newActiveSubTab);
  }, [tab.id, tab.uiState?.activeSubTab, allTabs]);

  useEffect(() => {
    const loadRequest = async (): Promise<void> => {
      if (workspace === null) {
        return;
      }
      
      try {
        setIsLoading(true);
        
        const loadedCollection = await getCollection(tab.collectionId);
        setCollection(loadedCollection);
        
        setCollectionItems(extractCollectionItems(loadedCollection.items));

        const baseRequest = findRequestInItems(loadedCollection.items, tab.resourceId);
        if (baseRequest === null) {
          throw new Error('Request not found');
        }
        
        // Primary: in-memory state from a previous tab switch (zero IPC overhead, no races).
        // Secondary: IPC session state (app restart recovery, or first load after restart).
        const inMemoryState = getTabEditorState(tab.id);
        const draftRequest = isRequestDraft(inMemoryState) ? inMemoryState : undefined;
        
        let finalRequest: Request;
        if (draftRequest !== undefined) {
          // Use the in-memory state directly — it is always the most recent version.
          finalRequest = draftRequest;
          setDirty(tab.id, true);
        } else {
          const sessionState = await getResourceState(workspace.id, `${tab.collectionId}::${tab.resourceId}`);
          // Session data includes _ui directly (stored together).
          // The collection file-save strips _ui before persisting (see registerSaveHandler).
          finalRequest = {
            type: 'request',
            id: baseRequest.id,
            name: sessionState?.name ?? baseRequest.name,
            description: sessionState?.description ?? baseRequest.description ?? '',
            data: (sessionState?.data as Record<string, unknown>) ?? (baseRequest.data as Record<string, unknown>) ?? {},
            auth: isAuth(sessionState?.auth) ? sessionState.auth : baseRequest.auth,
            preRequestScript: sessionState?.preRequestScript ?? baseRequest.preRequestScript ?? '',
            postRequestScript: sessionState?.postRequestScript ?? baseRequest.postRequestScript ?? '',
            dependsOn: sessionState?.dependsOn ?? baseRequest.dependsOn,
            condition: sessionState?.condition ?? baseRequest.condition
          };
          if (sessionState !== null) {
            setDirty(tab.id, true);
          }
        }
        
        setRequest(finalRequest);
        
        // Set badge metadata from plugin
        if (pluginUI !== undefined) {
          const badge = pluginUI.getRequestBadge(finalRequest);
          setMetadata(tab.id, {
            badge,
            description: finalRequest.description
          });
        }
      } catch (error: unknown) {
        console.error('Failed to load request:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    void loadRequest();
  }, [tab.id, tab.resourceId, tab.collectionId]);

  // Keep requestRef current so handleAutoSave and the save handler always read the
  // latest request without re-creating their useCallback on every state change.
  // If they depended on `request` directly, every user input would recreate
  // executeSave, causing useAutoSave's cleanup to cancel the pending timer and reset
  // hasPendingSaveRef.current — making flush() a no-op for the latest change.
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  useEffect(() => {
    if (workspace === null) return;

    const unregister = registerSaveHandler(tab.id, async () => {
      if (requestRef.current === null) return;
      const currentRequest = requestRef.current;
      // Strip transient _ui state before persisting to the collection file.
      // The session stores data+_ui together but the collection file must not.
      const { _ui: _uiToStrip, ...persistData } = currentRequest.data as Record<string, unknown>;
      const requestToSave = { ...currentRequest, data: persistData };
      await updateRequest(tab.collectionId, tab.resourceId, requestToSave);
      setDirty(tab.id, false);
      clearTabEditorState(tab.id);
      await clearResourceState(workspace.id, `${tab.collectionId}::${tab.resourceId}`);
    });

    return unregister;
  }, [registerSaveHandler, workspace, tab.id, tab.collectionId, tab.resourceId, updateRequest, setDirty, clearResourceState]);

  // Stable auto-save callback — does NOT depend on `request` state directly.
  // It reads requestRef.current to always access the latest data. This stability
  // prevents useAutoSave from resetting its pending-flag on every keystroke.
  const handleAutoSave = useCallback(async () => {
    if (workspace === null || requestRef.current === null) return;
    const currentRequest = requestRef.current;
    
    try {
      // Store the full request.data (including _ui) in the session so that it is
      // available on remount without a merge step. _ui is stripped only when
      // saving to the collection file (see registerSaveHandler).
      await saveResourceState(workspace.id, `${tab.collectionId}::${tab.resourceId}`, {
        name: currentRequest.name,
        description: currentRequest.description,
        data: currentRequest.data as Record<string, unknown>,
        // Normalize "inherit" to undefined - inherit is default behavior and shouldn't create session state
        auth: currentRequest.auth?.type === 'inherit' ? undefined : currentRequest.auth,
        preRequestScript: currentRequest.preRequestScript,
        postRequestScript: currentRequest.postRequestScript,
        dependsOn: currentRequest.dependsOn,
        condition: currentRequest.condition
      });
    } catch (error) {
      console.error('AutoSave failed:', error);
    }
  }, [workspace, tab.collectionId, tab.resourceId, saveResourceState]);

  const { trigger: triggerAutoSave, flush: flushAutoSave, cancel: cancelAutoSave } = useAutoSave({
    onSave: handleAutoSave,
    delay: 1000,
    enabled: workspace !== null && request !== null
  });

  useEffect(() => {
    const unregisterDiscard = registerDiscardHandler(tab.id, async () => {
      clearTabEditorState(tab.id);
      await cancelAutoSave();
    });

    return unregisterDiscard;
  }, [registerDiscardHandler, tab.id, cancelAutoSave, clearTabEditorState]);

  // Register a flush handler so TabBar can await a pending auto-save before
  // switching tabs. This eliminates the IPC race between the debounced write
  // (on the old tab) and the session read (on the new tab after remount).
  useEffect(() => {
    const unregisterFlush = registerFlushHandler(tab.id, async () => {
      await flushAutoSave();
    });

    return unregisterFlush;
  }, [registerFlushHandler, tab.id, flushAutoSave]);

  const handleRequestChange = (updatedRequest: Request): void => {
    setRequest(updatedRequest);
    // Immediately store the updated request in in-memory tab state.
    // This is the primary mechanism for persisting state across tab switches.
    // It is synchronous (no IPC) so there is no race condition.
    setTabEditorState(tab.id, updatedRequest);
    setDirty(tab.id, true);
    
    // Make temporary tab permanent when data changes
    if (tab.isTemporary === true) {
      clearTemporaryFlag(tab.id);
    }
    
    // Update badge metadata from plugin when request changes
    if (pluginUI !== undefined) {
      const badge = pluginUI.getRequestBadge(updatedRequest);
      setMetadata(tab.id, { badge });
    }
    
    triggerAutoSave();
  };

  const handleSend = async (): Promise<void> => {
    if (tab.execution === undefined) {
      console.error('[RequestEditor] Tab has no execution state, this should not happen');
      return;
    }

    if (workspace === null) {
      return;
    }

    if (isSending) {
      try {
        await window.quest.runner.stopRun(tab.execution.executionId);
        updateTabExecution(tab.id, {
          status: 'cancelled',
          endTime: Date.now(),
          error: 'Request cancelled'
        });
      } catch (error: unknown) {
        console.error('Failed to cancel request:', error);
      }
      return;
    }

    if (request === null) return;

    // Make temporary tab permanent when sending request
    if (tab.isTemporary === true) {
      clearTemporaryFlag(tab.id);
    }

    const executionId = tab.execution.executionId;
    
    updateTabExecution(tab.id, {
      status: 'running',
      startTime: Date.now(),
      endTime: undefined,
      events: [],
      result: undefined,
      error: undefined
    });

    try {
      let collectionVariables: Record<string, VariableValue> = {};
      try {
        const collection = await window.quest.workspace.loadCollection(workspace.id, tab.collectionId);
        collectionVariables = Object.entries(collection.variables ?? {}).reduce((acc, [key, value]) => {
          const primitive = extractVariablePrimitive(value);
          if (primitive !== null) {
            acc[key] = primitive;
          }
          return acc;
        }, {} as Record<string, VariableValue>);
        console.log('[RequestEditor] Ephemeral variable build: collection', {
          collectionId: tab.collectionId,
          variables: collectionVariables
        });
      } catch (error: unknown) {
        console.warn('Failed to load collection variables:', error);
      }

      let environmentVariables: Record<string, VariableValue> = {};
      if (activeEnvironment !== null) {
        try {
          const env = await loadEnvironment(activeEnvironment.fileName);
          environmentVariables = Object.entries(env.variables).reduce((acc, [key, value]) => {
            const primitive = extractVariablePrimitive(value);
            if (primitive !== null) {
              acc[key] = primitive;
            }
            return acc;
          }, {} as Record<string, VariableValue>);
          console.log('[RequestEditor] Ephemeral variable build: environment', {
            environmentId: activeEnvironment.fileName,
            variables: environmentVariables
          });
        } catch (error: unknown) {
          console.warn('Failed to load environment variables:', error);
        }
      }

      let globalVariables: Record<string, VariableValue> = {};
      try {
        const globals = await window.quest.globalVariables.load();
        globalVariables = Object.entries(globals).reduce((acc, [key, value]) => {
          const primitive = extractVariablePrimitive(value);
          if (primitive !== null) {
            acc[key] = primitive;
          }
          return acc;
        }, {} as Record<string, VariableValue>);
        console.log('[RequestEditor] Ephemeral variable build: global', {
          variables: globalVariables
        });
      } catch (error: unknown) {
        console.warn('Failed to load global variables:', error);
      }

      console.log('[RequestEditor] Ephemeral variable build: final payload', {
        collectionId: tab.collectionId,
        environmentId: activeEnvironment?.fileName ?? null,
        variables: {
          collection: collectionVariables,
          environment: environmentVariables,
          global: globalVariables
        }
      });

      // Create a modified request if bypassing execution control
      const effectiveRequest = bypassExecutionControl
        ? { ...request, dependsOn: undefined, condition: undefined }
        : request;

      const result = await window.quest.runner.runRequest({
        executionId,
        workspaceId: workspace.id,
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
      
    } catch (error: unknown) {
      console.error('Request failed:', error);

      const wasCancelled =
        error instanceof Error && /abort|cancel/i.test(error.message);
      
      // Update execution state with error
      updateTabExecution(tab.id, {
        status: wasCancelled ? 'cancelled' : 'error',
        endTime: Date.now(),
        error: wasCancelled
          ? 'Request cancelled'
          : (error instanceof Error ? error.message : 'Unknown error')
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm" style={{ color: 'var(--gray-9)' }}>Loading...</div>
      </div>
    );
  }

  if (request === null) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--gray-9)' }}>
        Request not found
      </div>
    );
  }

  if (pluginUI === undefined) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--gray-9)' }}>
        No plugin found for protocol: {tab.protocol}
      </div>
    );
  }

  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

  const startResponseResize = (e: React.PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();

    const rootRect = rootRef.current?.getBoundingClientRect();
    if (rootRect === undefined) return;

    const onMove = (ev: PointerEvent): void => {
      const nextHeight = clamp(rootRect.bottom - ev.clientY, 120, Math.max(120, rootRect.height - 150));
      setResponseHeight(nextHeight);
    };

    const onUp = (): void => {
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
            onClick={() => { void handleSend(); }}
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
            value={activeSubTab ?? allTabs[0]?.id}
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
                .filter((currentTab) => {
                  if (currentTab.visible === undefined) {
                    return true;
                  }

                  return currentTab.visible(request) === true;
                })
                .map((currentTab) => (
                  <Tabs.Trigger
                    key={currentTab.id}
                    value={currentTab.id}
                    className="request-tab-trigger px-4 py-2 text-sm font-medium border-none bg-transparent editor-tab-trigger"
                  >
                    {currentTab.label}
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
        style={{ height: '1px', cursor: 'ns-resize', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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

function ScriptsTab({ request, onChange, uiContext, uiState, protocol }: UITabProps & { protocol: string }): React.ReactElement {
  const { React, Monaco } = uiContext;
  const theme = uiState.theme;
  const protocolPlugin = pluginLoader.getProtocolPluginUI(protocol) as ProtocolPluginWithEvents | undefined;
  const protocolEvents: ProtocolPluginEventDefinition[] = protocolPlugin?.events ?? [];
  
  type ScriptTypeOption = 'pre' | 'post' | string;
  const [scriptType, setScriptType] = React.useState<ScriptTypeOption>('pre');

  // Update Monaco IntelliSense context whenever the script type or protocol changes
  React.useEffect(() => {
    const phase = scriptType === 'pre'
      ? 'pre-request' as const
      : scriptType === 'post'
        ? 'post-request' as const
        : 'plugin-event' as const;

    pluginLoader.setActiveScriptIntellisenseContext({
      protocol,
      ownerType: 'request',
      phase,
      eventName: phase === 'plugin-event' ? scriptType : undefined,
    });
  }, [scriptType, protocol]);
  
  const getScriptValue = (): string => {
    if (scriptType === 'pre') {
      return request.preRequestScript ?? '';
    }

    if (scriptType === 'post') {
      return request.postRequestScript ?? '';
    }

    const eventScript = request.data.scripts?.find((script) => script.event === scriptType);
    return eventScript?.script ?? '';
  };

  const updateScript = (value: string): void => {
    if (scriptType === 'pre') {
      onChange({ ...request, preRequestScript: value });
    } else if (scriptType === 'post') {
      onChange({ ...request, postRequestScript: value });
    } else {
      const scripts: ProtocolScript[] = [...(request.data.scripts ?? [])];
      const existingIndex = scripts.findIndex((script) => script.event === scriptType);
      
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
          <div className="text-xs font-semibold mb-1 px-2 script-tab-label">Per Request</div>
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
              {protocolEvents.map((evt) => (
                <button
                  key={evt.name}
                  onClick={() => setScriptType(evt.name)}
                  className="w-full text-left px-3 py-2 text-sm rounded script-tab-button"
                  data-active={scriptType === evt.name}
                >
                  {evt.name}
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
function AuthTab({ request, onChange, uiContext, supportedAuthTypes, collection }: UITabProps & { supportedAuthTypes: string[]; collection: Collection | null }): React.ReactElement {
  const { React, Radix } = uiContext;
  
  // Compute auth type: none (explicit), inherit (missing/type:'inherit'), or concrete type
  const authType = React.useMemo(() => {
    if (request.auth?.type === 'none') return 'none';
    if (request.auth === undefined || request.auth.type === 'inherit') return 'inherit';
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
    if (authType !== 'inherit' || collection === null) return null;
    return resolveInheritedAuth(collection, request.id);
  }, [authType, collection, request.id]);
  
  // Determine which auth to display
  const displayAuth = authType === 'inherit' ? inheritedAuth?.auth : request.auth;
  const displayAuthType = displayAuth?.type ?? 'none';
  
  const authPluginUI = React.useMemo(() => {
    if (displayAuthType === 'none' || displayAuthType === 'inherit') return undefined;
    const plugin = pluginLoader.getAuthPluginUI(displayAuthType);
    return plugin;
  }, [displayAuthType]);
  
  const authData = React.useMemo(() => {
    if (displayAuthType === 'none' || displayAuthType === 'inherit' || authPluginUI === undefined) {
      return {};
    }
    if (displayAuth?.data !== undefined) {
      return displayAuth.data;
    }
    const defaultData = authPluginUI.createDefault();
    return typeof defaultData === 'object' && defaultData !== null ? defaultData : {};
  }, [displayAuthType, displayAuth, authPluginUI]);

  const handleAuthDataChange = (newData: unknown): void => {
    const normalizedAuthData: Record<string, unknown> =
      typeof newData === 'object' && newData !== null
        ? (newData as Record<string, unknown>)
        : {};

    onChange({
      ...request,
      auth: {
        type: displayAuthType,
        data: normalizedAuthData
      }
    });
  };
  
  const renderAuthForm = (): React.ReactElement => {
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
      if (inheritedAuth?.auth === null || inheritedAuth === null) {
        return (
          <div className="flex items-center justify-center flex-1" style={{ color: 'var(--gray-9)' }}>
            <div className="text-center">
              <div className="text-sm">No authentication set in parent chain.</div>
              <div className="text-xs mt-1">Select an auth type to configure authentication for this request.</div>
            </div>
          </div>
        );
      }
      
      if (authPluginUI === undefined) {
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
    
    if (authPluginUI === undefined) {
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
              const createdAuthData = newAuthPluginUI?.createDefault() ?? {};
              const normalizedAuthData: Record<string, unknown> =
                typeof createdAuthData === 'object' && createdAuthData !== null
                  ? (createdAuthData as Record<string, unknown>)
                  : {};

              onChange({
                ...request,
                auth: {
                  type: value,
                  data: normalizedAuthData
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
