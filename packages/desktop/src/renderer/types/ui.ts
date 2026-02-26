// General UI state types

/**
 * Open Tab
 */
export interface OpenTab {
  id: string;
  type: 'request' | 'collection' | 'environment' | 'settings';
  title: string;
  collectionId?: string;
  requestId?: string;
  isDirty: boolean;  // Has unsaved changes
  data?: any;        // Tab-specific data
}

/**
 * Panel State
 */
export interface PanelState {
  isVisible: boolean;
  size: number;  // Height/width in pixels or percentage
  position: 'bottom' | 'right' | 'left';
}

/**
 * Sidebar State
 */
export interface SidebarState {
  isCollapsed: boolean;
  width: number;
  activeView: 'collections' | 'history' | 'environments';
}

/**
 * Console Panel State
 */
export interface ConsolePanelState extends PanelState {
  activeTab: 'console' | 'network' | 'tests';
}

/**
 * Layout State (per workspace)
 */
export interface LayoutState {
  sidebar: SidebarState;
  console: ConsolePanelState;
  openTabs: OpenTab[];
  activeTabId: string | null;
}

/**
 * Theme
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * Workspace UI State (persisted per workspace)
 */
export interface WorkspaceUIState {
  workspaceId: string;
  layout: LayoutState;
  theme: Theme;
  lastOpenedCollectionId?: string;
  recentCollections: string[];  // Collection IDs
}

/**
 * Modal State
 */
export interface ModalState {
  type: 'new-request' | 'new-collection' | 'settings' | 'plugin-manager' | null;
  data?: any;
}
