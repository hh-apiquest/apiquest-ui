// TabContext - Manages open request tabs
// Layer: Contexts (React layer)

import React, { createContext, useContext, useState, useEffect, useMemo, useRef, type ReactElement, type ReactNode, useCallback } from 'react';
import { LogLevel } from '@apiquest/types';
import type { CollectionItem, Request } from '../types/request';
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

  // In-memory editor state (survives tab switches without IPC; primary source of truth for unsaved changes)
  setTabEditorState: (tabId: string, state: unknown) => void;
  getTabEditorState: (tabId: string) => unknown;
  clearTabEditorState: (tabId: string) => void;
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
  registerDiscardHandler: (tabId: string, handler: () => Promise<void>) => () => void;
  registerFlushHandler: (tabId: string, handler: () => Promise<void>) => () => void;
  invokeSaveHandler: (tabId: string) => Promise<void>;
  invokeFlushHandler: (tabId: string) => Promise<void>;
  invokeDiscardHandler: (tabId: string) => Promise<void>;
}

const TabNavigationContext = createContext<TabNavigationContextValue | null>(null);
const TabStatusStateContext = createContext<TabStatusStateContextValue | null>(null);
const TabStatusActionsContext = createContext<TabStatusActionsContextValue | null>(null);
const TabEditorBridgeContext = createContext<TabEditorBridgeContextValue | null>(null);

function isRunnerMetadata(metadata: Tab['metadata']): metadata is RunnerMetadata {
  return metadata !== undefined && 'runId' in metadata;
}

function findRequestInItems(items: CollectionItem[], requestId: string): Request | null {
  for (const item of items) {
    if (item.type === 'request' && item.id === requestId) {
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

interface TabProviderProps {
  children: ReactNode;
}

export function TabProvider({ children }: TabProviderProps): ReactElement {
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

  // Editor save/discard/flush handlers (imperative registry; does not trigger renders)
  const saveHandlersRef = useRef<Map<string, () => Promise<void>>>(new Map());
  const discardHandlersRef = useRef<Map<string, () => Promise<void>>>(new Map());
  // Flush handlers are called before a tab switch to ensure any pending debounced
  // auto-save is written to session state before the next tab mounts and reads it.
  const flushHandlersRef = useRef<Map<string, () => Promise<void>>>(new Map());
  // In-memory editor state per tab (survives tab switches without any IPC).
  // This is the primary source of truth for unsaved changes between tab switches.
  // The IPC session (saveResourceState) is kept as a secondary backup for app restarts.
  // Using a ref map (not React state) avoids re-renders on every keystroke.
  const tabEditorStateRef = useRef<Map<string, unknown>>(new Map());

  // Use useRef to maintain stable tab object references
  const tabsRef = useRef<Map<string, Tab>>(new Map());
  
  const tabs = useMemo((): Tab[] => {
    return tabsData.map((tab) => {
      const existing = tabsRef.current.get(tab.id);
      if (existing?.name === tab.name &&
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
  const clearResourceState = useCallback(async (workspaceId: string, resourceId: string): Promise<void> => {
    try {
      const session = await window.quest.session.get(workspaceId);
      if (session === null) {
        return;
      }

      const { [resourceId]: _, ...remainingResources } = session.resources;
      
      await window.quest.session.update(workspaceId, {
        resources: remainingResources
      });
    } catch (error: unknown) {
      console.error('Failed to clear resource state:', error);
    }
  }, []);

  const openRequest = useCallback(async (collectionId: string, protocol: string, requestId: string, name: string, metadata?: RequestMetadata, isTemporary: boolean = false, initialSubTab?: string, clearSessionOnOpen: boolean = true): Promise<void> => {
    // Clear session state when opening from sidebar (default), but preserve when restoring tabs on app start
    // Use a composite key so that requests with the same ID in different collections are stored separately.
    if (clearSessionOnOpen && currentWorkspaceId !== null && currentWorkspaceId !== '') {
      void clearResourceState(currentWorkspaceId, `${collectionId}::${requestId}`);
    }

    setTabsData(prev => {
      // Check if tab already exists
      const existingTab = prev.find(
        tab => tab.type === 'request' && tab.collectionId === collectionId && tab.resourceId === requestId
      );

      if (existingTab !== undefined) {
        setActiveTabId(existingTab.id);
        // Update initial sub tab if provided
        const updates: Partial<Tab> = { isTemporary: isTemporary === false && existingTab.isTemporary === true ? false : existingTab.isTemporary };
        if (initialSubTab !== undefined && initialSubTab !== '') {
          updates.uiState = { ...existingTab.uiState, activeSubTab: initialSubTab };
        }
        return prev.map(t => t.id === existingTab.id ? { ...t, ...updates } : t);
      }

      // Find a temporary tab to overwrite (for any single-click OR double-click after temp tab exists)
      const tempTab = prev.find((tab) => tab.isTemporary === true);
      
      if (tempTab !== undefined) {
        const updatedTab: Tab = {
          ...tempTab,
          type: 'request',
          name,
          resourceId: requestId,
          collectionId,
          protocol,
          metadata,
          isTemporary, // Use the parameter value (true for single-click, false for double-click)
          uiState: initialSubTab !== undefined && initialSubTab !== '' ? { activeSubTab: initialSubTab } : undefined,
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
      if (currentWorkspaceId !== null && currentWorkspaceId !== '') {
        void clearResourceState(currentWorkspaceId, `${collectionId}::${requestId}`);
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
        uiState: initialSubTab !== undefined && initialSubTab !== '' ? { activeSubTab: initialSubTab } : undefined,
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

  const openCollection = useCallback((collectionId: string, protocol: string, name: string, isTemporary: boolean = false, initialSubTab?: string, clearSessionOnOpen: boolean = true): void => {
    // Clear session state when opening from sidebar (default), but preserve when restoring tabs on app start
    // For collections the resourceId IS the collectionId - composite key is collectionId::collectionId.
    if (clearSessionOnOpen && currentWorkspaceId !== null && currentWorkspaceId !== '') {
      void clearResourceState(currentWorkspaceId, `${collectionId}::${collectionId}`);
    }

    setTabsData(prev => {
      // Check if tab already exists
      const existingTab = prev.find(
        tab => tab.type === 'collection' && tab.collectionId === collectionId
      );

      if (existingTab !== undefined) {
        setActiveTabId(existingTab.id);
        // Update initial sub tab if provided, or keep existing UI state
        const updates: Partial<Tab> = { isTemporary: isTemporary === false && existingTab.isTemporary === true ? false : existingTab.isTemporary };
        if (initialSubTab !== undefined && initialSubTab !== '') {
          updates.uiState = { ...existingTab.uiState, activeSubTab: initialSubTab };
        }
        return prev.map(t => t.id === existingTab.id ? { ...t, ...updates } : t);
      }

      // Find a temporary tab to overwrite (for any single-click OR double-click after temp tab exists)
      const tempTab = prev.find((tab) => tab.isTemporary === true);
      
      if (tempTab !== undefined) {
        const updatedTab: Tab = {
          ...tempTab,
          type: 'collection',
          name,
          collectionId,
          resourceId: collectionId,
          protocol,
          isTemporary, // Use the parameter value (true for single-click, false for double-click)
          uiState: initialSubTab !== undefined && initialSubTab !== '' ? { activeSubTab: initialSubTab } : undefined,
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
      if (currentWorkspaceId !== null && currentWorkspaceId !== '') {
        void clearResourceState(currentWorkspaceId, `${collectionId}::${collectionId}`);
      }

      const newTab: Tab = {
        id: `tab-${Date.now()}-${Math.random()}`,
        type: 'collection',
        name,
        collectionId,
        resourceId: collectionId,
        protocol,
        isTemporary,
        uiState: initialSubTab !== undefined && initialSubTab !== '' ? { activeSubTab: initialSubTab } : undefined,
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

  const openFolder = useCallback((collectionId: string, protocol: string, folderId: string, name: string, isTemporary: boolean = false, initialSubTab?: string, clearSessionOnOpen: boolean = true): void => {
    // Clear session state when opening from sidebar (default), but preserve when restoring tabs on app start
    if (clearSessionOnOpen && currentWorkspaceId !== null && currentWorkspaceId !== '') {
      void clearResourceState(currentWorkspaceId, `${collectionId}::${folderId}`);
    }

    setTabsData(prev => {
      // Check if tab already exists
      const existingTab = prev.find(
        tab => tab.type === 'folder' && tab.collectionId === collectionId && tab.resourceId === folderId
      );

      if (existingTab !== undefined) {
        setActiveTabId(existingTab.id);
        // Update initial sub tab if provided, or keep existing UI state
        const updates: Partial<Tab> = { isTemporary: isTemporary === false && existingTab.isTemporary === true ? false : existingTab.isTemporary };
        if (initialSubTab !== undefined && initialSubTab !== '') {
          updates.uiState = { ...existingTab.uiState, activeSubTab: initialSubTab };
        }
        return prev.map(t => t.id === existingTab.id ? { ...t, ...updates } : t);
      }

      // Find a temporary tab to overwrite (for any single-click OR double-click after temp tab exists)
      const tempTab = prev.find((tab) => tab.isTemporary === true);
      
      if (tempTab !== undefined) {
        const updatedTab: Tab = {
          ...tempTab,
          type: 'folder',
          name,
          collectionId,
          resourceId: folderId,
          protocol,
          isTemporary, // Use the parameter value (true for single-click, false for double-click)
          uiState: initialSubTab !== undefined && initialSubTab !== '' ? { activeSubTab: initialSubTab } : undefined,
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
      if (currentWorkspaceId !== null && currentWorkspaceId !== '') {
        void clearResourceState(currentWorkspaceId, `${collectionId}::${folderId}`);
      }

      const newTab: Tab = {
        id: `tab-${Date.now()}-${Math.random()}`,
        type: 'folder',
        name,
        collectionId,
        resourceId: folderId,
        protocol,
        isTemporary,
        uiState: initialSubTab !== undefined && initialSubTab !== '' ? { activeSubTab: initialSubTab } : undefined,
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
  ): string => {
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

  const closeTab = useCallback((tabId: string): void => {
    setTabsData((prev) => {
      const newTabs = prev.filter((t) => t.id !== tabId);
      
      // If closing active tab, switch to another
      if (activeTabId === tabId && newTabs.length > 0) {
        const closedIndex = prev.findIndex((t) => t.id === tabId);
        const newActiveIndex = Math.max(0, closedIndex - 1);
        setActiveTabId(newTabs[newActiveIndex]?.id ?? null);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
      }
      
      return newTabs;
    });
    // cleanup status + save handler
    setStatus((prev) => {
      const { [tabId]: _, ...dirtyRest } = prev.isDirtyByTabId;
      const { [tabId]: __, ...nameRest } = prev.nameByTabId;
      const { [tabId]: ___, ...badgeRest } = prev.badgeByTabId;
      return { ...prev, isDirtyByTabId: dirtyRest, nameByTabId: nameRest, badgeByTabId: badgeRest };
    });
    saveHandlersRef.current.delete(tabId);
    discardHandlersRef.current.delete(tabId);
    flushHandlersRef.current.delete(tabId);
    tabEditorStateRef.current.delete(tabId);
  }, [activeTabId]);

  // Status actions (editors call these; editors must NOT consume TabStatusState)
  // Both setters bail out when the value is unchanged. Editors call them on every
  // keystroke; without the bail-out each call produced a new status/tabs object,
  // re-rendering every context consumer and re-running effects that depend on them.
  const setDirty = useCallback((tabId: string, isDirty: boolean): void => {
    setStatus((prev) => {
      if (prev.isDirtyByTabId[tabId] === isDirty) {
        return prev;
      }
      return {
        ...prev,
        isDirtyByTabId: { ...prev.isDirtyByTabId, [tabId]: isDirty }
      };
    });
  }, []);

  const setName = useCallback((tabId: string, name: string): void => {
    setStatus((prev) => {
      if (prev.nameByTabId[tabId] === name) {
        return prev;
      }
      return {
        ...prev,
        nameByTabId: { ...prev.nameByTabId, [tabId]: name }
      };
    });
    // Also keep navigation tab name in sync for existing UI expectations
    setTabsData((prev) => (
      prev.some((t) => t.id === tabId && t.name !== name)
        ? prev.map((t) => (t.id === tabId ? { ...t, name } : t))
        : prev
    ));
  }, []);

  const setMetadata = useCallback((tabId: string, metadata: RequestMetadata | RunnerMetadata): void => {
    // Keep metadata on Tab so existing code relying on tab.metadata continues working during migration
    setTabsData((prev) => prev.map((t) => (t.id === tabId ? { ...t, metadata: { ...t.metadata, ...metadata } } : t)));
    
    // Update status for badge if provided (RequestMetadata only)
    if ('badge' in metadata && metadata.badge !== undefined) {
      setStatus((prev) => ({
        ...prev,
        badgeByTabId: { ...prev.badgeByTabId, [tabId]: metadata.badge }
      }));
    }
  }, []);

  const saveTabUIState = (tabId: string, uiState: EditorUIState): void => {
    setTabsData((prev) => prev.map((tab) =>
      tab.id === tabId ? { ...tab, uiState } : tab
    ));
  };

  const updateTabMetadata = (tabId: string, metadata: RequestMetadata | RunnerMetadata): void => {
    setMetadata(tabId, metadata);
  };

  const clearTemporaryFlag = useCallback((tabId: string): void => {
    setTabsData((prev) => prev.map((tab) =>
      tab.id === tabId ? { ...tab, isTemporary: false } : tab
    ));
  }, []);

  const getActiveTab = (): Tab | null => {
    return tabs.find((tab) => tab.id === activeTabId) ?? null;
  };

  // Load session from storage.
  // Stable identity: editors and SessionSync list this (via the nav context value) as an
  // effect dependency, so it must not be recreated on every provider render.
  const loadSession = useCallback(async (workspaceId: string): Promise<void> => {
    setIsLoadingSession(true);
    try {
      const session = await window.quest.session.get(workspaceId);
      if (session === null || session.tabs.openTabs.length === 0) {
        setTabsData([]);
        setActiveTabId(null);
        setCurrentWorkspaceId(workspaceId);
        setIsLoadingSession(false);
        return;
      }

      // Filter out runner tabs (transient) and restore only persistent tabs
      const restoredTabs: Tab[] = session.tabs.openTabs
        .filter((tabInfo) => tabInfo.type !== 'runner')
        .map((tabInfo) => {
          // Resource state is keyed as collectionId::resourceId to prevent cross-collection ID collisions.
          const stateKey = `${tabInfo.collectionId}::${tabInfo.resourceId}`;
          const hasUnsavedData = session.resources[stateKey];
          return {
            id: tabInfo.id,
            type: tabInfo.type,
            name: hasUnsavedData?.name ?? tabInfo.name,
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
      setStatus((prev) => {
        const nextDirty: Record<string, boolean> = { ...prev.isDirtyByTabId };
        const nextNames: Record<string, string> = { ...prev.nameByTabId };
        const nextBadges: Record<string, RequestBadge | undefined> = { ...prev.badgeByTabId };

        restoredTabs.forEach((t) => {
          const stateKey = `${t.collectionId}::${t.resourceId}`;
          const resourceState = session.resources[stateKey];
          nextDirty[t.id] = resourceState !== undefined;
          nextNames[t.id] = resourceState?.name ?? t.name;
          nextBadges[t.id] = (t.metadata as RequestMetadata)?.badge;
        });

        return { ...prev, isDirtyByTabId: nextDirty, nameByTabId: nextNames, badgeByTabId: nextBadges };
      });
      setActiveTabId(
        session.tabs.activeTabId !== null && restoredTabs.find((t) => t.id === session.tabs.activeTabId) !== undefined
          ? session.tabs.activeTabId 
          : (restoredTabs.length > 0 ? restoredTabs[0].id : null)
      );
      setCurrentWorkspaceId(workspaceId);
    } catch (error: unknown) {
      console.error('Failed to load session:', error);
      setTabsData([]);
      setActiveTabId(null);
      setCurrentWorkspaceId(workspaceId);
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  // Save session to storage
  const saveSession = useCallback(async (workspaceId: string): Promise<void> => {
    if (workspaceId === '') {
      return;
    }

    try {
      // Filter out runner tabs and temporary tabs - they are transient and should not be persisted across sessions
      const tabInfos: TabSessionInfo[] = tabs
        .filter((tab) => tab.type !== 'runner' && tab.isTemporary !== true)
        .map((tab) => ({
          id: tab.id,
          type: tab.type,
          collectionId: tab.collectionId,
          resourceId: tab.resourceId,
          protocol: tab.protocol,
          name: status.nameByTabId[tab.id] ?? tab.name,
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
    } catch (error: unknown) {
      console.error('Failed to save session:', error);
    }
  }, [tabs, activeTabId, status.nameByTabId]);

  // Resource state management (for unsaved changes) - saveResourceState and getResourceState.
  // resourceId must be a composite key of the form collectionId::itemId (constructed by the caller)
  // so that items with the same ID across different collections are stored separately.
  // Both are pure IPC wrappers with no provider state, so they are stable for the provider's lifetime.
  // Editors depend on them from effects and useAutoSave callbacks; an unstable identity here
  // re-ran the CollectionEditor load effect on every keystroke (continuous "Loading..." flicker).
  const saveResourceState = useCallback(async (workspaceId: string, resourceId: string, state: ResourceSessionState): Promise<void> => {
    try {
      const session = await window.quest.session.get(workspaceId);
      if (session === null) {
        return;
      }

      await window.quest.session.update(workspaceId, {
        resources: {
          ...session.resources,
          [resourceId]: state
        }
      });
    } catch (error: unknown) {
      console.error('Failed to save resource state:', error);
    }
  }, []);

  const getResourceState = useCallback(async (workspaceId: string, resourceId: string): Promise<ResourceSessionState | null> => {
    try {
      const session = await window.quest.session.get(workspaceId);
      return session?.resources?.[resourceId] ?? null;
    } catch (error: unknown) {
      console.error('Failed to get resource state:', error);
      return null;
    }
  }, []);

  // Auto-save on tab changes (aggressive persistence).
  // saveSession is memoized on tabs/activeTabId/nameByTabId, so it changes exactly when they do.
  useEffect(() => {
    // Don't save while loading session to avoid race conditions
    if (currentWorkspaceId !== null && currentWorkspaceId !== '' && !isLoadingSession) {
      void saveSession(currentWorkspaceId);
    }
  }, [saveSession, currentWorkspaceId, isLoadingSession]);

  // Helper to find request in collection
  const findRequestInCollection = (collection: { items: CollectionItem[] }, requestId: string): Request | null => {
    return findRequestInItems(collection.items, requestId);
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
      if (tab.id === tabId && tab.execution !== undefined) {
        // Skip duplicate events based on unique ID (dev react strict)
        const eventId = event.data?.id;
        if (eventId !== undefined && eventId !== '' && tab.execution.events.some((e) => e.data?.id === eventId)) {
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

  const registerDiscardHandler = useCallback((tabId: string, handler: () => Promise<void>) => {
    discardHandlersRef.current.set(tabId, handler);
    return () => {
      const current = discardHandlersRef.current.get(tabId);
      if (current === handler) {
        discardHandlersRef.current.delete(tabId);
      }
    };
  }, []);

  const invokeSaveHandler = useCallback(async (tabId: string): Promise<void> => {
    const handler = saveHandlersRef.current.get(tabId);
    if (handler === undefined) {
      throw new Error(`No save handler registered for tab: ${tabId}`);
    }
    await handler();
  }, []);

  const invokeDiscardHandler = useCallback(async (tabId: string): Promise<void> => {
    const handler = discardHandlersRef.current.get(tabId);
    if (handler === undefined) {
      return;
    }
    await handler();
  }, []);

  const registerFlushHandler = useCallback((tabId: string, handler: () => Promise<void>) => {
    flushHandlersRef.current.set(tabId, handler);
    return () => {
      const current = flushHandlersRef.current.get(tabId);
      if (current === handler) {
        flushHandlersRef.current.delete(tabId);
      }
    };
  }, []);

  // Invoked by TabBar before switching to a different tab. If there is a pending
  // debounced auto-save it is flushed synchronously so the session is up-to-date
  // before the next tab mounts and reads it. No-ops when no flush handler is
  // registered (e.g. collection/folder/runner tabs that have no auto-save).
  const invokeFlushHandler = useCallback(async (tabId: string): Promise<void> => {
    const handler = flushHandlersRef.current.get(tabId);
    if (handler !== undefined) {
      await handler();
    }
  }, []);

  // In-memory editor state — stored in a ref map so writes don't cause re-renders.
  // This is the primary source of truth for unsaved request state during a session.
  // The IPC session (saveResourceState) remains as a secondary backup for app restarts.
  const setTabEditorState = useCallback((tabId: string, state: unknown) => {
    tabEditorStateRef.current.set(tabId, state);
  }, []);

  const getTabEditorState = useCallback((tabId: string): unknown => {
    return tabEditorStateRef.current.get(tabId);
  }, []);

  const clearTabEditorState = useCallback((tabId: string) => {
    tabEditorStateRef.current.delete(tabId);
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
    updateTabUIState,
    setTabEditorState,
    getTabEditorState,
    clearTabEditorState
  }), [tabs, activeTabId, openRequest, openCollection, openFolder, openRunnerExecution, closeTab, clearTemporaryFlag, loadSession, saveSession, saveResourceState, clearResourceState, getResourceState, updateTabExecution, appendTabExecutionEvent, clearTabExecution, updateTabUIState, setTabEditorState, getTabEditorState, clearTabEditorState]);

  const statusStateValue: TabStatusStateContextValue = useMemo(() => ({ status }), [status]);

  const statusActionsValue: TabStatusActionsContextValue = useMemo(() => ({
    setDirty,
    setName,
    setMetadata
  }), [setDirty, setName, setMetadata]);

  const bridgeValue: TabEditorBridgeContextValue = useMemo(() => ({
    registerSaveHandler,
    registerDiscardHandler,
    registerFlushHandler,
    invokeSaveHandler,
    invokeFlushHandler,
    invokeDiscardHandler
  }), [registerSaveHandler, registerDiscardHandler, registerFlushHandler, invokeSaveHandler, invokeFlushHandler, invokeDiscardHandler]);

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
        const level = event.data?.level ?? LogLevel.INFO;
        consoleService.addMessage(level, 'script', message);
      }
      
      // Find tab by executionId (request tabs) or runId (runner tabs)
      const tab = tabs.find((t) => 
        t.execution?.executionId === event.executionId || 
        (t.type === 'runner' && isRunnerMetadata(t.metadata) && t.metadata.runId === event.executionId)
      );
      
      if (tab !== undefined) {
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
export function useTabNavigation(): TabNavigationContextValue {
  const context = useContext(TabNavigationContext);
  if (context === null) {
    throw new Error('useTabNavigation must be used within TabProvider');
  }
  return context;
}

// TabBar state only (dirty dot, method label, name)
export function useTabStatusState(): TabStatusStateContextValue {
  const context = useContext(TabStatusStateContext);
  if (context === null) {
    throw new Error('useTabStatusState must be used within TabProvider');
  }
  return context;
}

// Editor actions (setDirty/setName/setMethod) - this context holds functions only
export function useTabStatusActions(): TabStatusActionsContextValue {
  const context = useContext(TabStatusActionsContext);
  if (context === null) {
    throw new Error('useTabStatusActions must be used within TabProvider');
  }
  return context;
}

// Editor bridge for save-on-close
export function useTabEditorBridge(): TabEditorBridgeContextValue {
  const context = useContext(TabEditorBridgeContext);
  if (context === null) {
    throw new Error('useTabEditorBridge must be used within TabProvider');
  }
  return context;
}
