// ApiQuest Plugin UI Types
// Shared type definitions for desktop plugin UI interfaces
// Used by both desktop app and plugins to avoid circular dependencies

import type { ComponentType, ReactNode } from 'react';
import type { Request, ProtocolResponse } from '@apiquest/types';

/**
 * Variable Resolver Service
 * Resolves {{variable}} references to actual values
 */
export interface VariableResolverService {
  resolve(text: string, variables: Record<string, string>): string;
}

/**
 * Reactive UI State
 * Global app state that triggers re-renders when changed
 */
export interface ReactiveUIState {
  theme: 'light' | 'dark';
  activeEnvironment?: {
    id: string;
    name: string;
    variables: Record<string, string>;
  };
  collectionVariables?: Record<string, string>;
  globalVariables?: Record<string, string>;
}

/**
 * UI Context provided by desktop to plugins
 * Injected dependencies to keep plugin size small
 */
export interface PluginUIContext {
  // React (from desktop, not bundled in plugin)
  React: typeof import('react');
  
  // Monaco editor (singleton instance from desktop)
  Monaco: {
    Editor: ComponentType<{
      value: string;
      onChange: (value: string) => void;
      language?: string;
      readonly?: boolean;
      height?: string | number;
      theme?: 'light' | 'dark';
    }>;
  };
  
  // Variable resolver service
  variableResolver: VariableResolverService;
  
  // Reusable editor components from desktop
  Editors: {
    // Headers editor (key-value with autocomplete)
    Headers: ComponentType<{
      headers: Record<string, string>;
      onChange: (headers: Record<string, string>) => void;
    }>;
    
    // Query params editor (key-value with URL encoding)
    Params: ComponentType<{
      params: Record<string, string>;
      onChange: (params: Record<string, string>) => void;
    }>;
    
    // Form data editor (text/binary inputs)
    FormData: ComponentType<{
      formData: Array<{
        key: string;
        value: string;
        type: 'text' | 'binary';
        description?: string;
        disabled: boolean;
      }>;
      onChange: (formData: any[]) => void;
    }>;
    
    // URL-encoded form data editor (key-value)
    UrlEncoded: ComponentType<{
      data: Array<{
        key: string;
        value: string;
        description?: string;
        disabled: boolean;
      }>;
      onChange: (data: any[]) => void;
    }>;
  };
  
  // Radix Themes - Complete pre-styled component library
  // Pass entire namespace for cleaner context & auto-access to all components
  // Usage in plugins:
  //   const { React, Radix } = uiContext;
  //   React.createElement(Radix.Button, { size: '1' }, 'Click')
  //   React.createElement(Radix.Select.Root, ...)
  //   React.createElement(Radix.TextField, { size: '1' })
  //   React.createElement(Radix.Flex, { gap: '2' }, ...)
  //   React.createElement(Radix.Table.Root, ...)
  //   React.createElement(Radix.Badge, ...)
  Radix: typeof import('@radix-ui/themes');
  
  // Heroicons for plugin UI
  Icons: {
    // Outline icons (24x24)
    outline: any;
    // Solid icons (20x20)
    solid: any;
    // Mini icons (12x12)
    mini: any;
  };

  
  // Current theme
  theme: 'light' | 'dark';
}

/**
 * UI Tab definition
 * Used for protocol-specific and generic tabs
 */
export interface UITab {
  id: string;
  label: string;
  icon?: string;
  position?: number;  // For ordering (lower = earlier)
  
  // Tab component
  component: ComponentType<UITabProps>;
  
  // Optional: show/hide based on condition
  visible?: (request: Request) => boolean;
}

/**
 * Props passed to tab components
 */
export interface UITabProps {
  request: Request;
  onChange: (request: Request) => void;
  uiContext: PluginUIContext;
  uiState: ReactiveUIState;
}

/**
 * Protocol Plugin UI (Desktop-specific)
 * Provides UI for editing protocol-specific requests
 */
export interface IProtocolPluginUI {
  icon? : string;
  // Must match fracture IProtocolPlugin.protocol
  protocol: string;
  
  /**
   * Initialize with UI dependencies from desktop
   * Called once when plugin is loaded
   */
  setup(uiContext: PluginUIContext): void;
  
  /**
   * Create new empty request (for "New Request" dialog)
   * Returns a Request with protocol-specific defaults
   */
  createNewRequest(name: string): Request;
  
  /**
   * Get request badge for protocol-specific icons support
   */
  getRequestBadge(request: Request): RequestBadge;
  
  /**
   * Get request/response summary for protocol-specific summary support
   */
  getSummary(request: Request, response?: ProtocolResponse): RequestSummary;
  
  /**
   * Render address bar
   * E.g., GET dropdown + URL input for HTTP, QUERY/MUTATION dropdown + endpoint for GraphQL
   * For protocols without methods (like SSE), render just the connection input (URL/IP/etc)
   * Plugins control the full layout and styling of the address bar
   * Required - return empty/placeholder node if not applicable
   */
  renderAddressBar(
    request: Request,
    onChange: (request: Request) => void
  ): ReactNode;
  
  /**
   * Provide protocol-specific request tabs
   * These tabs only show for THIS protocol
   * E.g., HTTP: Params, Headers, Body
   *       GraphQL: Query, Variables, Headers
   */
  getRequestTabs?(): UITab[];
  
  /**
   * Provide protocol-specific response tabs
   * E.g., GraphQL: Errors tab
   */
  getResponseTabs?(): ResponseUITab[];
  
  /**
   * Render protocol-specific runtime options
   * Shown in the Options tab for protocol-specific configuration
   * E.g., HTTP: keep-alive, compression settings
   *       WebSocket: ping interval, reconnect behavior
   */
  renderRuntimeOptions?(
    pluginOptions: Record<string, unknown> | undefined,
    onChange: (options: Record<string, unknown> | undefined) => void,
    uiContext: PluginUIContext
  ): ReactNode;
  
  /**
   * Validate request before sending (optional)
   * Desktop can use this to show warnings before Send
   */
  validate?(request: Request): {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
  };
}

/**
 * Auth Plugin UI (Desktop-specific)
 * Provides UI for configuring authentication
 */
export interface IAuthPluginUI {
  // Must match fracture IAuthPlugin.type
  type: string;
  
  /**
   * Initialize with UI dependencies from desktop
   * Called once when plugin is loaded
   */
  setup(uiContext: PluginUIContext): void;
  
  /**
   * Create default auth data
   * Used when user selects this auth type
   */
  createDefault(): any;
  
  /**
   * Render auth configuration form
   * Shown in Auth tab when this auth type is selected
   * @param authData - Auth configuration data
   * @param onChange - Callback when data changes
   * @param options - Render options (e.g., readOnly for inherited auth display)
   */
  renderForm(
    authData: any,
    onChange: (data: any) => void,
    options?: { readOnly?: boolean }
  ): ReactNode;
  
  /**
   * Validate auth data (optional)
   * Desktop can show validation errors
   */
  validate?(authData: any): {
    valid: boolean;
    errors?: string[];
  };
}

/**
 * Generic Plugin UI
 * For cross-cutting concerns that aren't protocol or auth specific
 * E.g., Auth tab manager, AI Assistant
 */
export interface IGenericPluginUI {
  id: string;
  name: string;
  type: 'auth-manager' | 'ai-assistant' | 'custom';
  
  /**
   * Initialize with UI dependencies from desktop
   * Called once when plugin is loaded
   */
  setup(uiContext: PluginUIContext): void;
  
  /**
   * Provide global request tabs (show for ALL protocols)
   * E.g., Auth tab, AI tab
   */
  getGlobalRequestTabs?(): UITab[];
  
  /**
   * Provide global response tabs (show for ALL protocols)
   * E.g., AI insights tab
   */
  getGlobalResponseTabs?(): UITab[];
}

/**
 * Plugin metadata for UI display
 * Used in plugin manager, settings, etc.
 */
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  icon?: string;
  bundled: boolean;  // True for built-in plugins
  enabled: boolean;
}

/**
 * ApiQuest metadata in package.json
 * Custom "apiquest" field for plugin discovery and configuration
 */
export interface ApiquestMetadata {
  // Plugin type
  type: 
    // Fracture plugins (execution/CLI)
    | 'protocol'          // HTTP, GraphQL, gRPC execution
    | 'auth'              // Bearer, Basic, OAuth2 application
    | 'reporter'          // Console, JSON, JUnit output
    | 'vault'             // Variable providers (AWS Secrets, etc.)
    // Desktop plugins (UI only)
    | 'protocol-ui'       // Request editors for protocols
    | 'auth-ui'           // Auth configuration forms
    | 'importer-ui'       // Import collections (Postman, Insomnia, OpenAPI)
    | 'exporter-ui'       // Export collections (Postman, OpenAPI, HAR)
    | 'visualizer-ui'     // Charts, graphs, custom result visualizations
    | 'extension-ui';     // Generic UI extensions (tabs, buttons, panels)
  
  
  // Runtime environment (array for explicitness)
  runtime: ('fracture' | 'desktop')[];
  
  // Capabilities for discovery and dependency resolution
  capabilities?: {
    // What this plugin supports (inputs/compatibility)
    supports?: {
      authTypes?: string[];       // Protocol: which auth types it accepts ['bearer', 'basic']
      protocols?: string[];       // Auth: which protocols it works with ['http', 'grpc']
      strictAuthList?: boolean;   // Protocol: if true, ONLY listed auth types allowed
    };
    
    // What this plugin provides (outputs/functionality)
    provides?: {
      authTypes?: string[];       // Auth bundle: which auth types it provides ['bearer', 'basic']
      protocols?: string[];       // Protocol bundle: which protocols it provides (rare)
      reportTypes?: string[];     // Reporter: which report formats ['console', 'json', 'html', 'junit']
      importFormats?: string[];   // Importer-UI: which formats it imports ['postman', 'insomnia', 'openapi']
      exportFormats?: string[];   // Exporter-UI: which formats it exports ['postman', 'openapi', 'har']
      visualizations?: string[];  // Visualizer-UI: what it visualizes ['timeline', 'graphs', 'diff', 'coverage']
    };
  };
}

/**
 * Helper interface for reading plugin package.json
 */
export interface PluginPackageJson {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  main?: string;
  module?: string;
  homepage?: string;
  repository?: string | { type: string; url: string };
  
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  
  // ApiQuest plugin metadata
  apiquest: ApiquestMetadata;
}

/**
 * Response tab props
 */
export interface ResponseTabProps {
  response: ProtocolResponse | null;
  request: Request;
  uiContext: PluginUIContext;
  uiState: ReactiveUIState;
}

/**
 * Response UI Tab definition
 */
export interface ResponseUITab {
  id: string;
  label: string;
  icon?: string;
  position?: number;
  component: ComponentType<ResponseTabProps>;
  visible?: (response: ProtocolResponse | null) => boolean;
}

/**
 * Request badge data
 */
export interface RequestBadge {
  primary: string;
  color: string;
  secondary?: string;
}

/**
 * Common props for protocol-specific UI components
 * Used for summaryLine (compact), detailView (full), and other views
 * Events are optional and populated for streaming protocols (SSE, WebSocket)
 */
export interface ProtocolViewProps {
  request?: Request;
  response?: ProtocolResponse;
  events?: any[];
  uiContext: PluginUIContext;
  uiState: ReactiveUIState;
}

export type SummaryLineComponent = ComponentType<ProtocolViewProps>;
export type DetailViewComponent = ComponentType<ProtocolViewProps>;

export interface SummaryField {
  name: string;
  value: string | number;
  color?: string;
  emphasis?: 'normal' | 'bold';
  order?: number;
}

export interface RequestSummary {
  summaryLine?: SummaryLineComponent;
  detailView?: DetailViewComponent;
  fields?: SummaryField[];
  statusLevel?: 'success' | 'warning' | 'error' | 'info';
  sortKey?: string | number;
}

/**
 * Importer Plugin UI (Desktop-specific)
 * Provides UI for importing collections from various formats
 */
export interface IImporterPluginUI {
  // Identity
  name: string;
  version: string;
  description: string;
  
  // What formats does this plugin import?
  // Example: ['postman'], ['insomnia'], ['openapi-3.0', 'openapi-3.1']
  importFormats: string[];
  
  /**
   * File extensions for each format (for file picker dialog)
   * Maps format name to allowed extensions
   * Example: { 'postman': ['.json'], 'openapi-3.0': ['.json', '.yaml', '.yml'] }
   */
  fileExtensions: Record<string, string[]>;
  
  /**
   * Initialize with UI dependencies from desktop
   */
  setup(uiContext: PluginUIContext): void;
  
  /**
   * Detect format from file content (before user selects format)
   * Useful for auto-detecting format when user drags a file
   * @returns format string or null if cannot detect
   */
  detectFormat?(data: string | any): string | null;
  
  /**
   * Validate import data before processing
   * Called before importCollection to ensure data is valid for the format
   */
  validate(data: string | any, format: string): {
    valid: boolean;
    errors?: string[];
    warnings?: string[];
  };
  
  /**
   * Import a collection from the specified format
   * @param data - Raw data to import (string or parsed object)
   * @param format - Specific format being imported
   * @param options - Format-specific import options
   * @returns Collection object
   */
  importCollection(
    data: string | any,
    format: string,
    options?: any
  ): Promise<any>; // Returns Collection from @apiquest/types
  
  /**
   * Get import options schema for a specific format
   * Defines what options the user can configure for import
   */
  getOptionsSchema?(format: string): any;
}

/**
 * Exporter Plugin UI (Desktop-specific)
 * Provides UI for exporting collections to various formats
 */
export interface IExporterPluginUI {
  // Identity
  name: string;
  version: string;
  description: string;
  
  // What formats does this plugin export?
  // Example: ['postman'], ['openapi-3.1'], ['har']
  exportFormats: string[];
  
  /**
   * File extensions for each format (for save file dialog)
   * Maps format name to default extension
   * Example: { 'postman': '.json', 'openapi-3.1': '.yaml', 'har': '.har' }
   */
  fileExtensions: Record<string, string>;
  
  /**
   * Initialize with UI dependencies from desktop
   */
  setup(uiContext: PluginUIContext): void;
  
  /**
   * Export a collection to the specified format
   * @param collection - Collection object to export
   * @param format - Target format
   * @param options - Format-specific export options
   * @returns Exported data as string
   */
  exportCollection(
    collection: any, // Collection from @apiquest/types
    format: string,
    options?: any
  ): Promise<string>;
  
  /**
   * Get export options schema for a specific format
   * Defines what options the user can configure for export
   */
  getOptionsSchema?(format: string): any;
  
  /**
   * Render custom export options UI (optional)
   * If not provided, desktop will auto-generate from schema
   */
  renderExportOptions?(
    format: string,
    options: any,
    onChange: (options: any) => void
  ): ReactNode;
}

/**
 * Visualizer Plugin UI (Desktop-specific)
 * Provides custom visualizations for test results, timelines, etc.
 */
export interface IVisualizerPluginUI {
  // Identity
  name: string;
  version: string;
  description: string;
  
  // What visualizations does this plugin provide?
  // Example: ['timeline'], ['request-graph'], ['coverage-report']
  visualizations: string[];
  
  /**
   * Initialize with UI dependencies from desktop
   */
  setup(uiContext: PluginUIContext): void;
  
  /**
   * Render a visualization
   * @param type - Visualization type
   * @param data - Data to visualize (RunResult, RequestResult[], etc.)
   * @param options - Visualization options
   */
  renderVisualization(
    type: string,
    data: any,
    options?: any
  ): ReactNode;
  
  /**
   * Get options schema for a visualization type
   * Defines configuration options for the visualization
   */
  getOptionsSchema?(type: string): any;
}

/**
 * Extension Plugin UI (Desktop-specific)
 * Provides generic UI extensions (tabs, buttons, panels, etc.)
 * Injection points are predefined by desktop
 */
export interface IExtensionPluginUI {
  // Identity
  id: string;
  name: string;
  version: string;
  description: string;
  
  /**
   * Initialize with UI dependencies from desktop
   */
  setup(uiContext: PluginUIContext): void;
  
  /**
   * Get components for injection points
   * Desktop defines available injection points
   * 
   * Available injection points (examples):
   * - 'request-tabs' - Additional tabs in request editor
   * - 'response-tabs' - Additional tabs in response viewer
   * - 'collection-sidebar' - Panels in collection sidebar
   * - 'toolbar' - Buttons in main toolbar
   * - 'status-bar' - Widgets in status bar
   * - 'context-menu-request' - Context menu items for requests
   * - 'context-menu-folder' - Context menu items for folders
   */
  getInjections?(): {
    [injectionPoint: string]: {
      id: string;
      label: string;
      icon?: string;
      position?: number;
      component: ComponentType<any>;
      visible?: (context: any) => boolean;
    }[];
  };
}
