// TabContext - Manages open request tabs
// Layer: Contexts (React layer)

import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode, useCallback } from 'react';
import type { Request } from '../types/request';
import { consoleService } from '../services';
import type { TabSessionInfo, ResourceSessionState } from '../types/quest';
import type { ExecutionData } from '../../types/execution';
import type { RequestBadge } from '@apiquest/plugin-ui-types';

export type TabType = 'request' | 'collection' | 'folder' | 'runner';

// UI state for editor (preserves subtab selection, etc.)
export interface EditorUIState {
  activeSubTab?: string;  // Which subtab is selected (auth, scripts, body, etc.)
}

// Metadata for request tabs (used for display, can be updated without marking dirty)
export interface RequestMetadata {
  badge?: RequestBadge;
  description?: string;
}

// Metadata for runner execution tabs
export interface RunnerMetadata {
  runId: string;
  runNumber: number;
  collectionId: string;
  collectionName: string;
  selectedRequests: string[];
  config: import('../types/quest').RunConfig;
  status: 'pending' | 'running' | 'completed' | 'stopped' | 'error';
  startedAt?: Date;
  completedAt?: Date;
}

// Tab only stores metadata - data is loaded from workspace
export interface Tab {
  id: string;
  name: string;
  type: TabType;
  resourceId: string;      // ID of the request/collection/folder
  collectionId: string;    // Parent collection
  protocol: string;        // Protocol for requests/collections
  isTemporary?: boolean;   // If true, tab was opened by single-click and will be overwritten unless tab clicked
  uiState?: EditorUIState; // Preserve UI state across tab switches
  metadata?: RequestMetadata | RunnerMetadata; // Metadata for display (type-specific)
  execution?: ExecutionData; // Execution state (persists across tab changes)
}

// ---------------------------------------------------------------------------
// New Architecture
// 1) TabNavigation: tabs + activeTabId + open/close/switch + session
// 2) TabStatus: per-tab status (dirty/name/method) used by TabBar
// 3) TabEditorBridge: editor registers save handler; TabBar can invoke on close
//
// Important: Editors/MainLayout must NOT subscribe to TabStatus state.
// ---------------------------------------------------------------------------

export interface TabStatus {
  isDirtyByTabId: Record<string, boolean>;
  nameByTabId: Record<string, string>;
  badgeByTabId: Record<string, RequestBadge | undefined>;
}

interface TabNavigationContextValue {
  tabs: Tab[];
  activeTabId: string | null;

  openRequest: (collectionId: string, protocol: string, requestId: string, name: string, metadata?: RequestMetadata, isTemporary?: boolean, initialSubTab?: string, clearSessionOnOpen?: boolean) => void;
  openCollection: (collectionId: string, protocol: string, name: string, isTemporary?: boolean, initialSubTab?: string, clearSessionOnOpen?: boolean) => void;
  openFolder: (collectionId: string, protocol: string, folderId: string, name: string, isTemporary?: boolean, initialSubTab?: string, clearSessionOnOpen?: boolean) => void;
  openRunnerExecution: (
    collectionId: string,
    protocol: string,
    collectionName: string,
    config: import('../types/quest').RunConfig,
    selectedRequests: string[]
  ) => string;  // Returns runId

  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  clearTemporaryFlag: (tabId: string) => void;
  getActiveTab: () => Tab | null;

  // Session management
  loadSession: (workspaceId: string) => Promise<void>;
  saveSession: (workspaceId: string) => Promise<void>;

  // Resource state in session (for unsaved changes)
  saveResourceState: (workspaceId: string, resourceId: string, state: ResourceSessionState) => Promise<void>;
  clearResourceState: (workspaceId: string, resourceId: string) => Promise<void>;
  getResourceState: (workspaceId: string, resourceId: string) => Promise<ResourceSessionState | null>;
  
  // Execution state management
  updateTabExecution: (tabId: string, updates: Partial<ExecutionData>) => void;
  appendTabExecutionEvent: (tabId: string, event: import('../../types/execution').ExecutionEvent) => void;
  clearTabExecution: (tabId: string) => void;
  
  // UI state management
  updateTabUIState: (tabId: string, uiState: Partial<EditorUIState>) => void;
}

interface TabStatusStateContextValue {
  status: TabStatus;
}

interface TabStatusActionsContextValue {
  setDirty: (tabId: string, isDirty: boolean) => void;
  setName: (tabId: string, name: string) => void;
  setMetadata: (tabId: string, metadata: RequestMetadata | RunnerMetadata) => void;
}

interface TabEditorBridgeContextValue {
  registerSaveHandler: (tabId: string, handler: () => Promise<void>) => () => void;
  invokeSaveHandler: (tabId: string) => Promise<void>;
}

const TabNavigationContext = createContext<TabNavigationContextValue | null>(null);
const TabStatusStateContext = createContext<TabStatusStateContextValue | null>(null);
const TabStatusActionsContext = createContext<TabStatusActionsContextValue | null>(null);
const TabEditorBridgeContext = createContext<TabEditorBridgeContextValue | null>(null);

interface TabProviderProps {
  children: ReactNode;
}

export function TabProvider({ children }: TabProviderProps) {
  const [tabsData, setTabsData] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  // High-frequency tab status (TabBar only)
  const [status, setStatus] = useState<TabStatus>({
    isDirtyByTabId: {},
    nameByTabId: {},
    badgeByTabId: {}
  });

  // Editor save handlers (imperative registry; does not trigger renders)
  const saveHandlersRef = useRef<Map<string, () => Promise<void>>>(new Map());

  // Use useRef to maintain stable tab object references
  const tabsRef = useRef<Map<string, Tab>>(new Map());
  
  const tabs = useMemo(() => {
    return tabsData.map(tab => {
      const existing = tabsRef.current.get(tab.id);
      if (existing &&
          existing.name === tab.name &&
          existing.isTemporary === tab.isTemporary &&
          existing.metadata === tab.metadata &&
          existing.execution === tab.execution &&
          existing.uiState === tab.uiState) {
        return existing;
      }
      tabsRef.current.set(tab.id, tab);
      return tab;
    });
  }, [tabsData]);

  // Resource state management (for unsaved changes) - defined early so it can be used in openRequest.
  // resourceId must be a composite key of the form collectionId::itemId so that two different collections
  // that share the same item ID (e.g. after a file-level copy of a collection) never share the same entry.
  const clearResourceState = useCallback(async (workspaceId: string, resourceId: string) => {
    try {
      const session = await window.quest.session.get(workspaceId);
      if (!session || !session.resources) return;

      const { [resourceId]: _, ...remainingResources } = session.resources;
      
      await window.quest.session.update(workspaceId, {
        resources: remainingResources
      });
    } catch (error) {
      console.error('Failed to clear resource state:', error);
    }
  }, []);

  const openRequest = useCallback(async (collectionId: string, protocol: string, requestId: string, name: string, metadata?: RequestMetadata, isTemporary: boolean = false, initialSubTab?: string, clearSessionOnOpen: boolean = true) => {
    // Clear session state when opening from sidebar (default), but preserve when restoring tabs on app start
    // Use a composite key so that requests with the same ID in different collections are stored separately.
    if (clearSessionOnOpen && currentWorkspaceId) {
      clearResourceState(currentWorkspaceId, `${collectionId}::${requestId}`);
    }

    setTabsData(prev => {
      // Check if tab already exists
      const existingTab = prev.find(
        tab => tab.type === 'request' && tab.collectionId === collectionId && tab.resourceId === requestId
      );

      if (existingTab) {
        setActiveTabId(existingTab.id);
        // Update initial sub tab if provided
        const updates: Partial<Tab> = { isTemporary: !isTemporary && existingTab.isTemporary ? false : existingTab.isTemporary };
        if (initialSubTab) {
          updates.uiState = { ...existingTab.uiState, activeSubTab: initialSubTab };
        }
        return prev.map(t => t.id === existingTab.id ? { ...t, ...updates } : t);
      }

      // Find a temporary tab to overwrite (for any single-click OR double-click after temp tab exists)
      const tempTab = prev.find(tab => tab.isTemporary);
      
      if (tempTab) {
        const updatedTab: Tab = {
          ...tempTab,
          type: 'request',
          name,
          resourceId: requestId,
          collectionId,
          protocol,
          metadata,
          isTemporary, // Use the parameter value (true for single-click, false for double-click)
          uiState: initialSubTab ? { activeSubTab: initialSubTab } : undefined,
          execution: {
            executionId: crypto.randomUUID(),
            status: 'idle',
            startTime: 0,
            events: []
          }
        };
        
        setActiveTabId(tempTab.id);
        // Update status
        setStatus(prevStatus => ({
          ...prevStatus,
          isDirtyByTabId: { ...prevStatus.isDirtyByTabId, [tempTab.id]: false },
          nameByTabId: { ...prevStatus.nameByTabId, [tempTab.id]: name },
          badgeByTabId: { ...prevStatus.badgeByTabId, [tempTab.id]: metadata?.badge }
        }));
        
        return prev.map(t => t.id === tempTab.id ? updatedTab : t);
      }

      // Always clear session for new tabs (there shouldn't be any, but ensures clean state)
      if (currentWorkspaceId) {
        clearResourceState(currentWorkspaceId, `${collectionId}::${requestId}`);
      }

      const newTab: Tab = {
        id: `tab-${Date.now()}-${Math.random()}`,
        type: 'request',
        name,
        collectionId,
        resourceId: requestId,
        protocol,
        isTemporary,
        metadata,
        uiState: initialSubTab ? { activeSubTab: initialSubTab } : undefined,
        execution: {
          executionId: crypto.randomUUID(),
          status: 'idle',
          startTime: 0,
          events: []
        }
      };

      setActiveTabId(newTab.id);
      // init status
      setStatus(prev => ({
        ...prev,
        isDirtyByTabId: { ...prev.isDirtyByTabId, [newTab.id]: false },
        nameByTabId: { ...prev.nameByTabId, [newTab.id]: name },
        badgeByTabId: { ...prev.badgeByTabId, [newTab.id]: metadata?.badge }
      }));

      return [...prev, newTab];
    });
  }, []);

  const openCollection = useCallback((collectionId: string, protocol: string, name: string, isTemporary: boolean = false, initialSubTab?: string, clearSessionOnOpen: boolean = true) => {
    // Clear session state when opening from sidebar (default), but preserve when restoring tabs on app start
    // For collections the resourceId IS the collectionId - composite key is collectionId::collectionId.
    if (clearSessionOnOpen && currentWorkspaceId) {
      clearResourceState(currentWorkspaceId, `${collectionId}::${collectionId}`);
    }

    setTabsData(prev => {
      // Check if tab already exists
      const existingTab = prev.find(
        tab => tab.type === 'collection' && tab.collectionId === collectionId
      );

      if (existingTab) {
        setActiveTabId(existingTab.id);
        // Update initial sub tab if provided, or keep existing UI state
        const updates: Partial<Tab> = { isTemporary: !isTemporary && existingTab.isTemporary ? false : existingTab.isTemporary };
        if (initialSubTab) {
          updates.uiState = { ...existingTab.uiState, activeSubTab: initialSubTab };
        }
        return prev.map(t => t.id === existingTab.id ? { ...t, ...updates } : t);
      }

      // Find a temporary tab to overwrite (for any single-click OR double-click after temp tab exists)
      const tempTab = prev.find(tab => tab.isTemporary);
      
      if (tempTab) {
        const updatedTab: Tab = {
          ...tempTab,
          type: 'collection',
          name,
          collectionId,
          resourceId: collectionId,
          protocol,
          isTemporary, // Use the parameter value (true for single-click, false for double-click)
          uiState: initialSubTab ? { activeSubTab: initialSubTab } : undefined,
          execution: {
            executionId: crypto.randomUUID(),
            status: 'idle',
            startTime: 0,
            events: []
          }
        };
        
        setActiveTabId(tempTab.id);
        setStatus(prevStatus => ({
          ...prevStatus,
          isDirtyByTabId: { ...prevStatus.isDirtyByTabId, [tempTab.id]: false },
          nameByTabId: { ...prevStatus.nameByTabId, [tempTab.id]: name },
          badgeByTabId: { ...prevStatus.badgeByTabId, [tempTab.id]: undefined }
        }));
        
        return prev.map(t => t.id === tempTab.id ? updatedTab : t);
      }

      // Always clear session for new tabs (there shouldn't be any, but ensures clean state)
      if (currentWorkspaceId) {
        clearResourceState(currentWorkspaceId, `${collectionId}::${collectionId}`);
      }

      const newTab: Tab = {
        id: `tab-${Date.now()}-${Math.random()}`,
        type: 'collection',
        name,
        collectionId,
        resourceId: collectionId,
        protocol,
        isTemporary,
        uiState: initialSubTab ? { activeSubTab: initialSubTab } : undefined,
        execution: {
          executionId: crypto.randomUUID(),
          status: 'idle',
          startTime: 0,
          events: []
        }
      };

      setActiveTabId(newTab.id);
      setStatus(prev => ({
        ...prev,
        isDirtyByTabId: { ...prev.isDirtyByTabId, [newTab.id]: false },
        nameByTabId: { ...prev.nameByTabId, [newTab.id]: name },
        badgeByTabId: { ...prev.badgeByTabId, [newTab.id]: undefined }
      }));

      return [...prev, newTab];
    });
  }, []);

  const openFolder = useCallback((collectionId: string, protocol: string, folderId: string, name: string, isTemporary: boolean = false, initialSubTab?: string, clearSessionOnOpen: boolean = true) => {
    // Clear session state when opening from sidebar (default), but preserve when restoring tabs on app start
    if (clearSessionOnOpen && currentWorkspaceId) {
      clearResourceState(currentWorkspaceId, `${collectionId}::${folderId}`);
    }

    setTabsData(prev => {
      // Check if tab already exists
      const existingTab = prev.find(
        tab => tab.type === 'folder' && tab.collectionId === collectionId && tab.resourceId === folderId
      );

      if (existingTab) {
        setActiveTabId(existingTab.id);
        // Update initial sub tab if provided, or keep existing UI state
        const updates: Partial<Tab> = { isTemporary: !isTemporary && existingTab.isTemporary ? false : existingTab.isTemporary };
        if (initialSubTab) {
          updates.uiState = { ...existingTab.uiState, activeSubTab: initialSubTab };
        }
        return prev.map(t => t.id === existingTab.id ? { ...t, ...updates } : t);
      }

      // Find a temporary tab to overwrite (for any single-click OR double-click after temp tab exists)
      const tempTab = prev.find(tab => tab.isTemporary);
      
      if (tempTab) {
        const updatedTab: Tab = {
          ...tempTab,
          type: 'folder',
          name,
          collectionId,
          resourceId: folderId,
          protocol,
          isTemporary, // Use the parameter value (true for single-click, false for double-click)
          uiState: initialSubTab ? { activeSubTab: initialSubTab } : undefined,
          execution: {
            executionId: crypto.randomUUID(),
            status: 'idle',
            startTime: 0,
            events: []
          }
        };
        
        setActiveTabId(tempTab.id);
        setStatus(prevStatus => ({
          ...prevStatus,
          isDirtyByTabId: { ...prevStatus.isDirtyByTabId, [tempTab.id]: false },
          nameByTabId: { ...prevStatus.nameByTabId, [tempTab.id]: name },
          badgeByTabId: { ...prevStatus.badgeByTabId, [tempTab.id]: undefined }
        }));
        
        return prev.map(t => t.id === tempTab.id ? updatedTab : t);
      }

      // Always clear session for new tabs (there shouldn't be any, but ensures clean state)
      if (currentWorkspaceId) {
        clearResourceState(currentWorkspaceId, `${collectionId}::${folderId}`);
      }

      const newTab: Tab = {
        id: `tab-${Date.now()}-${Math.random()}`,
        type: 'folder',
        name,
        collectionId,
        resourceId: folderId,
        protocol,
        isTemporary,
        uiState: initialSubTab ? { activeSubTab: initialSubTab } : undefined,
        execution: {
          executionId: crypto.randomUUID(),
          status: 'idle',
          startTime: 0,
          events: []
        }
      };

      setActiveTabId(newTab.id);
      setStatus(prev => ({
        ...prev,
        isDirtyByTabId: { ...prev.isDirtyByTabId, [newTab.id]: false },
        nameByTabId: { ...prev.nameByTabId, [newTab.id]: name },
        badgeByTabId: { ...prev.badgeByTabId, [newTab.id]: undefined }
      }));

      return [...prev, newTab];
    });
  }, []);

  const openRunnerExecution = useCallback((
    collectionId: string,
    protocol: string,
    collectionName: string,
    config: import('../types/quest').RunConfig,
    selectedRequests: string[]
  ) => {
    const runId = `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const runNumber = tabsData.filter(
      t => t.type === 'runner' && t.collectionId === collectionId
    ).length + 1;
    
    const tabId = `runner-${runId}`;
    const tabName = `${collectionName} - Run #${runNumber}`;
    
    const newTab: Tab = {
      id: tabId,
      name: tabName,
      type: 'runner',
      resourceId: collectionId,
      collectionId,
      protocol,
      metadata: {
        runId,
        runNumber,
        collectionId,
        collectionName,
        selectedRequests,
        config,
        status: 'pending'
      } as RunnerMetadata,
      execution: {
        executionId: crypto.randomUUID(),
        status: 'idle',
        startTime: 0,
        events: []
      }
    };
    
    setTabsData(prev => [...prev, newTab]);
    setActiveTabId(tabId);
    setStatus(prev => ({
      ...prev,
      isDirtyByTabId: { ...prev.isDirtyByTabId, [tabId]: false },
      nameByTabId: { ...prev.nameByTabId, [tabId]: tabName },
      badgeByTabId: { ...prev.badgeByTabId, [tabId]: undefined }
    }));
    
    return runId;
  }, [tabsData]);

  const closeTab = useCallback((tabId: string) => {
    setTabsData(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      
      // If closing active tab, switch to another
      if (activeTabId === tabId && newTabs.length > 0) {
        const closedIndex = prev.findIndex(t => t.id === tabId);
        const newActiveIndex = Math.max(0, closedIndex - 1);
        setActiveTabId(newTabs[newActiveIndex].id);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
      }
      
      return newTabs;
    });
    // cleanup status + save handler
    setStatus(prev => {
      const { [tabId]: _, ...dirtyRest } = prev.isDirtyByTabId;
      const { [tabId]: __, ...nameRest } = prev.nameByTabId;
      const { [tabId]: ___, ...badgeRest } = prev.badgeByTabId;
      return { ...prev, isDirtyByTabId: dirtyRest, nameByTabId: nameRest, badgeByTabId: badgeRest };
    });
    saveHandlersRef.current.delete(tabId);
  }, [activeTabId]);

  // Status actions (editors call these; editors must NOT consume TabStatusState)
  const setDirty = useCallback((tabId: string, isDirty: boolean) => {
    setStatus(prev => ({
      ...prev,
      isDirtyByTabId: { ...prev.isDirtyByTabId, [tabId]: isDirty }
    }));
  }, []);

  const setName = useCallback((tabId: string, name: string) => {
    setStatus(prev => ({
      ...prev,
      nameByTabId: { ...prev.nameByTabId, [tabId]: name }
    }));
    // Also keep navigation tab name in sync for existing UI expectations
    setTabsData(prev => prev.map(t => (t.id === tabId ? { ...t, name } : t)));
  }, []);

  const setMetadata = useCallback((tabId: string, metadata: RequestMetadata | RunnerMetadata) => {
    // Keep metadata on Tab so existing code relying on tab.metadata continues working during migration
    setTabsData(prev => prev.map(t => (t.id === tabId ? { ...t, metadata: { ...t.metadata, ...metadata } } : t)));
    
    // Update status for badge if provided (RequestMetadata only)
    if ('badge' in metadata && metadata.badge !== undefined) {
      setStatus(prev => ({
        ...prev,
        badgeByTabId: { ...prev.badgeByTabId, [tabId]: metadata.badge }
      }));
    }
  }, []);

  const saveTabUIState = (tabId: string, uiState: EditorUIState) => {
    setTabsData(prev => prev.map(tab =>
      tab.id === tabId ? { ...tab, uiState } : tab
    ));
  };

  const updateTabMetadata = (tabId: string, metadata: RequestMetadata | RunnerMetadata) => {
    setMetadata(tabId, metadata);
  };

  const clearTemporaryFlag = useCallback((tabId: string) => {
    setTabsData(prev => prev.map(tab =>
      tab.id === tabId ? { ...tab, isTemporary: false } : tab
    ));
  }, []);

  const getActiveTab = (): Tab | null => {
    return tabs.find(tab => tab.id === activeTabId) || null;
  };

  // Load session from storage
  const loadSession = async (workspaceId: string) => {
    setIsLoadingSession(true);
    try {
      const session = await window.quest.session.get(workspaceId);
      if (!session || !session.tabs.openTabs || session.tabs.openTabs.length === 0) {
        setTabsData([]);
        setActiveTabId(null);
        setCurrentWorkspaceId(workspaceId);
        setIsLoadingSession(false);
        return;
      }

      // Filter out runner tabs (transient) and restore only persistent tabs
      const restoredTabs: Tab[] = session.tabs.openTabs
        .filter(tabInfo => tabInfo.type !== 'runner')
        .map(tabInfo => {
          // Resource state is keyed as collectionId::resourceId to prevent cross-collection ID collisions.
          const stateKey = `${tabInfo.collectionId}::${tabInfo.resourceId}`;
          const hasUnsavedData = session.resources[stateKey];
          return {
            id: tabInfo.id,
            type: tabInfo.type,
            name: hasUnsavedData?.name || tabInfo.name,
            collectionId: tabInfo.collectionId,
            resourceId: tabInfo.resourceId,
            protocol: tabInfo.protocol,
            metadata: tabInfo.metadata, // Preserve metadata (badge, description, etc.)
            uiState: tabInfo.uiState,
            execution: {
              executionId: crypto.randomUUID(),
              status: 'idle',
              startTime: 0,
              events: []
            }
          };
        });

      setTabsData(restoredTabs);
      // Restore status from session resources
      setStatus(prev => {
        const nextDirty: Record<string, boolean> = { ...prev.isDirtyByTabId };
        const nextNames: Record<string, string> = { ...prev.nameByTabId };
        const nextBadges: Record<string, RequestBadge | undefined> = { ...prev.badgeByTabId };

        restoredTabs.forEach(t => {
          const stateKey = `${t.collectionId}::${t.resourceId}`;
          const resourceState = session.resources[stateKey];
          nextDirty[t.id] = !!resourceState;
          nextNames[t.id] = resourceState?.name || t.name;
          nextBadges[t.id] = (t.metadata as RequestMetadata)?.badge;
        });

        return { ...prev, isDirtyByTabId: nextDirty, nameByTabId: nextNames, badgeByTabId: nextBadges };
      });
      setActiveTabId(
        session.tabs.activeTabId && restoredTabs.find(t => t.id === session.tabs.activeTabId) 
          ? session.tabs.activeTabId 
          : (restoredTabs.length > 0 ? restoredTabs[0].id : null)
      );
      setCurrentWorkspaceId(workspaceId);
    } catch (error) {
      console.error('Failed to load session:', error);
      setTabsData([]);
      setActiveTabId(null);
      setCurrentWorkspaceId(workspaceId);
    } finally {
      setIsLoadingSession(false);
    }
  };

  // Save session to storage  
  const saveSession = async (workspaceId: string) => {
    if (!workspaceId) return;

    try {
      const existingSession = await window.quest.session.get(workspaceId);
      
      // Filter out runner tabs and temporary tabs - they are transient and should not be persisted across sessions
      const tabInfos: TabSessionInfo[] = tabs
        .filter(tab => tab.type !== 'runner' && !tab.isTemporary)
        .map(tab => ({
          id: tab.id,
          type: tab.type,
          collectionId: tab.collectionId,
          resourceId: tab.resourceId,
          protocol: tab.protocol,
          name: status.nameByTabId[tab.id] || tab.name,
          metadata: tab.metadata, // Preserve metadata (badge, description, etc.)
          uiState: tab.uiState
        }));

      await window.quest.session.update(workspaceId, {
        lastAccessed: new Date().toISOString(),
        tabs: {
          openTabs: tabInfos,
          activeTabId
        }
      });
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  };

  // Resource state management (for unsaved changes) - saveResourceState and getResourceState.
  // resourceId must be a composite key of the form collectionId::itemId (constructed by the caller)
  // so that items with the same ID across different collections are stored separately.
  const saveResourceState = async (workspaceId: string, resourceId: string, state: ResourceSessionState) => {
    try {
      const session = await window.quest.session.get(workspaceId);
      if (!session) return;

      await window.quest.session.update(workspaceId, {
        resources: {
          ...session.resources,
          [resourceId]: state
        }
      });
    } catch (error) {
      console.error('Failed to save resource state:', error);
    }
  };

  const getResourceState = async (workspaceId: string, resourceId: string): Promise<ResourceSessionState | null> => {
    try {
      const session = await window.quest.session.get(workspaceId);
      return session?.resources?.[resourceId] || null;
    } catch (error) {
      console.error('Failed to get resource state:', error);
      return null;
    }
  };

  // Auto-save on tab changes (aggressive persistence)
  useEffect(() => {
    // Don't save while loading session to avoid race conditions
    if (currentWorkspaceId && !isLoadingSession) {
      saveSession(currentWorkspaceId);
    }
  }, [tabs, activeTabId, currentWorkspaceId, isLoadingSession, status.nameByTabId]);

  // Helper to find request in collection
  const findRequestInCollection = (collection: any, requestId: string): Request | null => {
    const findInItems = (items: any[]): Request | null => {
      for (const item of items) {
        if (item.type === 'request' && item.id === requestId) {
          return item;
        }
        if (item.type === 'folder' && item.items) {
          const found = findInItems(item.items);
          if (found) return found;
        }
      }
      return null;
    };

    return collection.items ? findInItems(collection.items) : null;
  };

  // Execution state management
  const updateTabExecution = useCallback((tabId: string, updates: Partial<ExecutionData>) => {
    setTabsData(prev => prev.map(tab =>
      tab.id === tabId
        ? { ...tab, execution: { ...tab.execution, ...updates } as ExecutionData }
        : tab
    ));
  }, []);

  const appendTabExecutionEvent = useCallback((tabId: string, event: import('../../types/execution').ExecutionEvent) => {
    setTabsData(prev => prev.map(tab => {
      if (tab.id === tabId && tab.execution) {
        // Skip duplicate events based on unique ID (dev react strict)
        const eventId = event.data?.id;
        if (eventId && tab.execution.events.some(e => e.data?.id === eventId)) {
          console.log('[TabContext] Skipping duplicate event:', {
            tabId,
            eventId,
            eventType: event.type
          });
          return tab;
        }
        
        const updatedExecution = { ...tab.execution, events: [...tab.execution.events, event] };
        console.log('[TabContext] Appending event to tab:', {
          tabId,
          eventType: event.type,
          eventId,
          eventCount: updatedExecution.events.length
        });
        return { ...tab, execution: updatedExecution };
      }
      return tab;
    }));
  }, []);

  const clearTabExecution = useCallback((tabId: string) => {
    setTabsData(prev => prev.map(tab =>
      tab.id === tabId
        ? { ...tab, execution: undefined }
        : tab
    ));
  }, []);

  const updateTabUIState = useCallback((tabId: string, uiState: Partial<EditorUIState>) => {
    setTabsData(prev => prev.map(tab =>
      tab.id === tabId
        ? { ...tab, uiState: { ...tab.uiState, ...uiState } }
        : tab
    ));
  }, []);

  const registerSaveHandler = useCallback((tabId: string, handler: () => Promise<void>) => {
    saveHandlersRef.current.set(tabId, handler);
    return () => {
      const current = saveHandlersRef.current.get(tabId);
      if (current === handler) {
        saveHandlersRef.current.delete(tabId);
      }
    };
  }, []);

  const invokeSaveHandler = useCallback(async (tabId: string) => {
    const handler = saveHandlersRef.current.get(tabId);
    if (!handler) {
      throw new Error(`No save handler registered for tab: ${tabId}`);
    }
    await handler();
  }, []);

  const navValue: TabNavigationContextValue = useMemo(() => ({
    tabs,
    activeTabId,
    openRequest,
    openCollection,
    openFolder,
    openRunnerExecution,
    closeTab,
    setActiveTab: setActiveTabId,
    clearTemporaryFlag,
    getActiveTab,
    loadSession,
    saveSession,
    saveResourceState,
    clearResourceState,
    getResourceState,
    updateTabExecution,
    appendTabExecutionEvent,
    clearTabExecution,
    updateTabUIState
  }), [tabs, activeTabId, openRequest, openCollection, openFolder, openRunnerExecution, closeTab, clearTemporaryFlag, loadSession, saveSession, saveResourceState, clearResourceState, getResourceState, updateTabExecution, appendTabExecutionEvent, clearTabExecution, updateTabUIState]);

  const statusStateValue: TabStatusStateContextValue = useMemo(() => ({ status }), [status]);

  const statusActionsValue: TabStatusActionsContextValue = useMemo(() => ({
    setDirty,
    setName,
    setMetadata
  }), [setDirty, setName, setMetadata]);

  const bridgeValue: TabEditorBridgeContextValue = useMemo(() => ({
    registerSaveHandler,
    invokeSaveHandler
  }), [registerSaveHandler, invokeSaveHandler]);

  // Subscribe to execution events from main process
  useEffect(() => {
    const unsubscribe = window.quest.runner.onExecutionEvent((event) => {
      console.log('[TabContext] Received execution event:', {
        type: event.type,
        executionId: event.executionId,
        data: event.data
      });

      if (event.type === 'console') {
        const message = event.data?.message ?? '';
        const level = event.data?.level ?? 'log';
        consoleService.addMessage(level, 'script', message);
      }
      
      // Find tab by executionId (request tabs) or runId (runner tabs)
      const tab = tabs.find(t => 
        t.execution?.executionId === event.executionId || 
        (t.type === 'runner' && (t.metadata as any)?.runId === event.executionId)
      );
      
      if (tab) {
        console.log('[TabContext] Routing event to tab:', tab.id);
        appendTabExecutionEvent(tab.id, event);
      } else {
        console.warn('[TabContext] No tab found for executionId:', event.executionId);
      }
    });
    
    return unsubscribe;
  }, [tabs, appendTabExecutionEvent]);

  return (
    <TabNavigationContext.Provider value={navValue}>
      <TabStatusStateContext.Provider value={statusStateValue}>
        <TabStatusActionsContext.Provider value={statusActionsValue}>
          <TabEditorBridgeContext.Provider value={bridgeValue}>
            {children}
          </TabEditorBridgeContext.Provider>
        </TabStatusActionsContext.Provider>
      </TabStatusStateContext.Provider>
    </TabNavigationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

// Navigation (MainLayout + TabBar + Sidebar/CollectionsPanel)
export function useTabNavigation() {
  const context = useContext(TabNavigationContext);
  if (!context) {
    throw new Error('useTabNavigation must be used within TabProvider');
  }
  return context;
}

// TabBar state only (dirty dot, method label, name)
export function useTabStatusState() {
  const context = useContext(TabStatusStateContext);
  if (!context) {
    throw new Error('useTabStatusState must be used within TabProvider');
  }
  return context;
}

// Editor actions (setDirty/setName/setMethod) - this context holds functions only
export function useTabStatusActions() {
  const context = useContext(TabStatusActionsContext);
  if (!context) {
    throw new Error('useTabStatusActions must be used within TabProvider');
  }
  return context;
}

// Editor bridge for save-on-close
export function useTabEditorBridge() {
  const context = useContext(TabEditorBridgeContext);
  if (!context) {
    throw new Error('useTabEditorBridge must be used within TabProvider');
  }
  return context;
}
