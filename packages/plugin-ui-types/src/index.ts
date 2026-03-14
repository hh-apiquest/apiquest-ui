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
 * AI completion request payload sent through desktop-managed AI service.
 * Plugins never receive API keys directly.
 */
export interface AICompletionRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

/**
 * AI completion response returned by desktop-managed AI service.
 */
export interface AICompletionResponse {
  text: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * AI service exposed by desktop to plugins.
 * Uses global app settings and keeps provider credentials in main process.
 */
export interface AIService {
  isConfigured(): Promise<boolean>;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}

/**
 * A single user-editable header/param entry with enabled state.
 * This is the persisted model for headers and params - using an array
 * preserves insertion order, disabled state, and allows duplicate keys.
 */
export interface HeaderEntry {
  key: string;
  value: string;
  enabled: boolean;
  /** Optional description/comment for the header */
  description?: string;
}

/**
 * A generated (read-only) header entry derived from request state.
 * Computed by the protocol plugin from body mode, auth type, etc.
 * Never persisted - always derived.
 */
export interface GeneratedHeaderEntry {
  key: string;
  value: string;
  /** TBD - Quick Actions, for now human-readable source attribution, e.g. "Body mode (urlencoded)", "Bearer auth" */
  source: string;
  /** Optional description/tooltip for this generated header */
  description?: string;
  /**
   * Whether the user can edit this generated entry.
   * true = shown but user cannot modify (e.g. Authorization from auth plugin)
   * false (default) = shown and user can override by adding a manual entry with the same key
   */
  readonly?: boolean;
}

/**
 * Transient UI state for the headers editor panel.
 * Stored in request.data._ui.headersEditorState.
 * Extensible: add new panel-level UI state here without a schema change.
 */
export interface HeadersEditorState {
  /** Whether the generated (auto) headers section is expanded. Default: false. */
  generatedVisible?: boolean;
}

/**
 * Transient UI state for the params editor panel.
 * Stored in request.data._ui.paramsEditorState.
 * Extensible: add new panel-level UI state here without a schema change.
 */
export interface ParamsEditorState {
  /** Whether the generated (auto) params section is expanded. Default: false. */
  generatedVisible?: boolean;
}

/**
 * A generated (read-only) query parameter entry derived from request state.
 * Computed by the protocol plugin from auth type, etc.
 * Never persisted - always derived. Mirrors GeneratedHeaderEntry for params.
 */
export interface GeneratedParamEntry {
  key: string;
  value: string;
  /** Human-readable source attribution, e.g. "API Key auth" */
  source: string;
  /** Optional description/tooltip */
  description?: string;
  /** true = user cannot override via a manual entry */
  readonly?: boolean;
}

/**
 * A single user-editable query parameter entry with enabled state.
 * Mirrors HeaderEntry for consistency. The execution layer uses Record<string,string>
 * (only enabled, non-empty entries); this array is persisted in _ui.paramsRows.
 */
export interface ParamEntry {
  key: string;
  value: string;
  enabled: boolean;
  /** Optional description/comment for the parameter */
  description?: string;
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
 * Options for the native OS dialog shown by host.showOpenDialog.
 * Supports both file and directory pickers.
 */
export interface PluginOpenDialogOptions {
  /**
   * Whether to show a file picker or a folder picker.
   * Defaults to 'file' when omitted.
   * Use 'directory' for formats like Bruno that import from a folder.
   */
  kind?: 'file' | 'directory';
  title?: string;
  buttonLabel?: string;
  /**
   * File extension filters — relevant only when kind === 'file'.
   * Example: [{ name: 'WSDL', extensions: ['wsdl', 'xml'] }]
   */
  filters?: Array<{ name: string; extensions: string[] }>;
  /**
   * Allow selecting multiple files or folders.
   * Defaults to false.
   */
  multiSelections?: boolean;
}

/**
 * A file or directory path the user explicitly granted the plugin access to via showOpenDialog.
 * Only paths originating from a dialog call are accepted by host.readFile / host.readDir.
 */
export type GrantedPath = string;

/**
 * Host bridge injected into PluginUIContext as host?.
 * All methods route through IPC to the Electron main process.
 * Available to all plugin types that receive a PluginUIContext: protocol-ui, auth-ui,
 * importer-ui, exporter-ui, extension-ui.
 */
export interface PluginHostBridge {
  /**
   * Show the native OS file or directory picker.
   * Returns an array of granted paths, or null if the user cancelled.
   * Returned paths are automatically allowlisted for subsequent readFile / readDir calls.
   * Set options.kind === 'directory' to show a folder picker instead of a file picker.
   */
  showOpenDialog(options: PluginOpenDialogOptions): Promise<GrantedPath[] | null>;

  /**
   * Read a text file at a path previously returned by showOpenDialog (kind=file).
   * Throws if the path was not granted by a prior showOpenDialog call in this session.
   */
  readFile(path: GrantedPath): Promise<string>;

  /**
   * Fetch a remote URL from the main process (no CORS restrictions, no renderer CSP).
   * Restricted to http:// and https:// schemes only.
   * Response body is capped at 5 MB.
   */
  fetchText(url: string, options?: { headers?: Record<string, string> }): Promise<string>;

  /**
   * Invoke a handler registered by this plugin's hostBundle module.
   * The action string must match a handlers.on(action, ...) call in the bundle.
   * Throws if no handler is registered for the action or if the main-process handler fails.
   * Subject to a 30-second per-call timeout.
   */
  invoke<T = unknown>(action: string, payload?: unknown): Promise<T>;
}

/**
 * Console interface available inside a plugin's hostBundle VM sandbox.
 * Matches Node.js console levels that the desktop console panel records.
 */
export interface PluginSandboxConsole {
  debug(...args: unknown[]): void;
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  trace(...args: unknown[]): void;
}

/**
 * Full API injected as globals into a plugin's hostBundle VM sandbox.
 * These identifiers are the only globals accessible in the bundle.
 * Use this type to typecheck your hostBundle entry module during development.
 */
export interface PluginSandboxGlobals {
  /** Register privileged action handlers callable from the renderer via host.invoke(). */
  handlers: {
    on(action: string, handler: (payload: unknown) => Promise<unknown>): void;
  };
  /** Privileged file I/O — only paths granted by the user's dialog are accepted. */
  file: {
    readText(filePath: string): Promise<string>;
    readBase64(filePath: string): Promise<string>;
  };
  /** HTTP/HTTPS fetch from main process — no CORS, no renderer CSP. 5 MB cap. */
  fetch(url: string, options?: { headers?: Record<string, string>; method?: string; body?: string }): Promise<string>;
  /** Scoped console — all output is tagged with the plugin package name. */
  console: PluginSandboxConsole;
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

  // Desktop-managed AI service (global settings, no plugin-level API key override)
  ai: AIService;

  /**
   * Host bridge for privileged operations: file I/O, native dialogs, outbound fetch,
   * and dispatch to this plugin's desktopMain module running in the main process.
   * Optional during migration; will become required once all plugins are updated.
   * Scoped to this plugin's npm package name — host.invoke dispatches only to
   * handlers registered by this plugin's own desktopMain bundle.
   */
  host?: PluginHostBridge;
  
  // Reusable editor components from desktop
  Editors: {
    // Headers editor (key-value with autocomplete, enable/disable, generated section)
    Headers: ComponentType<{
      headers: HeaderEntry[];
      onChange: (headers: HeaderEntry[]) => void;
      /** Read-only generated headers from protocol plugin (body mode, auth, etc.) */
      generatedHeaders?: GeneratedHeaderEntry[];
      /**
       * Controlled UI state for the headers editor panel.
       * Stored in request.data._ui.headersEditorState so it survives tab switches.
       * Extensible: add future panel states here without breaking existing code.
       */
      editorState?: HeadersEditorState;
      /** Called when any editor panel state changes (e.g. visibility toggle). */
      onEditorStateChange?: (state: HeadersEditorState) => void;
    }>;
    
    // Query params editor (key-value with enable/disable, description column, generated params)
    Params: ComponentType<{
      params: ParamEntry[];
      onChange: (params: ParamEntry[]) => void;
      /** Read-only generated query params from protocol plugin (auth type, etc.) */
      generatedParams?: GeneratedParamEntry[];
      /** Controlled editor panel state (stored in request.data._ui.paramsEditorState). */
      editorState?: ParamsEditorState;
      /** Called when any editor panel state changes (e.g. generated section toggle). */
      onEditorStateChange?: (state: ParamsEditorState) => void;
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
 * Identifies which kind of editor owns a script.
 * - request: the Request editor's scripts tab
 * - folder: the Folder editor's scripts tab
 * - collection: the Collection editor's scripts tab
 */
export type ScriptOwnerType = 'request' | 'folder' | 'collection';

/**
 * Identifies the execution phase of a script within an owner.
 * - pre-request: runs before the request is executed
 * - post-request: runs after the request returns a response
 * - folder-pre: runs before the folder iteration begins
 * - folder-post: runs after the folder iteration ends
 * - collection-pre: runs before the collection run begins
 * - collection-post: runs after the collection run ends
 * - plugin-event: runs when a named protocol event fires (e.g. onMessage)
 */
export type ScriptPhase =
  | 'pre-request'
  | 'post-request'
  | 'folder-pre'
  | 'folder-post'
  | 'collection-pre'
  | 'collection-post'
  | 'plugin-event';

/**
 * The full context describing which script editor is currently active.
 * Passed to IProtocolPluginUI.getScriptIntellisense() so the plugin
 * can return the right declarations for the phase.
 *
 * - protocol: the active request protocol (e.g. 'http', 'sse')
 * - ownerType: which kind of editor is showing the script
 * - phase: which execution phase the user is editing
 * - eventName: present only when phase === 'plugin-event'
 */
export interface ScriptIntellisenseContext {
  protocol: string;
  ownerType: ScriptOwnerType;
  phase: ScriptPhase;
  eventName?: string;
}

/**
 * A single Monaco IntelliSense declaration contribution.
 * Each entry is registered via monaco.languages.typescript.javascriptDefaults.addExtraLib().
 *
 * - content: raw .d.ts text (typically imported from a compiled declaration file via Vite ?raw)
 * - uri: a unique virtual URI for this lib, e.g. 'ts:quest-http-request.d.ts'
 *   Monaco uses the URI to detect duplicate registrations and for error messages.
 */
export interface ScriptIntellisense {
  content: string;
  uri: string;
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

  /**
   * Provide Monaco IntelliSense declarations for script editors.
   * Called by the desktop ScriptIntellisenseManager when the active script
   * editor context changes to this protocol. Return an empty array to opt out.
   *
   * Each contribution is a raw .d.ts string registered via addExtraLib().
   * Contributions are scoped to the active context: protocol + ownerType + phase.
   */
  getScriptIntellisense?(context: ScriptIntellisenseContext): ScriptIntellisense[];
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

  /**
   * Optional path (relative to the plugin root) to a fully self-contained CJS bundle
   * that the desktop host loads at scan time into an isolated vm.createContext sandbox
   * running in the Electron main process.
   *
   * The loaded bundle registers privileged action handlers via the injected
   * sandbox globals (handlers.on, file, fetch, console). These handlers are then
   * reachable from the renderer-side PluginHostBridge.invoke() call.
   *
   * The bundle must be fully self-contained — all dependencies must be inlined by the
   * bundler. No require() or dynamic import() calls are permitted after bundling.
   *
   * Naming convention: "dist/host-bundle.cjs"
   */
  hostBundle?: string;
  
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
   * Import source configuration per format.
   * - kind=file: use file picker (extensions are required)
   * - kind=directory: use folder picker (extensions ignored)
   * Maps format name to source kind + allowed extensions.
   * Example:
   * {
   *   'postman-v2.1': { kind: 'file', extensions: ['.json'] },
   *   'openapi-3.0': { kind: 'file', extensions: ['.json', '.yaml', '.yml'] },
   *   'bruno': { kind: 'directory', extensions: [] }
   * }
   */
  fileExtensions: Record<string, {
    kind: 'file' | 'directory';
    extensions: string[];
  }>;
  
  /**
   * Initialize with UI dependencies from desktop
   */
  setup(uiContext: PluginUIContext): void;

  /**
   * Render plugin-specific settings section in Desktop Settings > Importers.
   * Settings are persisted by desktop and passed back on each render.
   */
  renderSettings?(
    pluginSettings: Record<string, unknown> | undefined,
    onChange: (settings: Record<string, unknown> | undefined) => void,
    uiContext: PluginUIContext
  ): ReactNode;

  /**
   * Optional defaults for plugin-specific settings persisted by desktop.
   */
  getDefaultSettings?(): Record<string, unknown>;
  
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
    options?: {
      pluginSettings?: Record<string, unknown>;
      [key: string]: unknown;
    }
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
   * Export target configuration per format.
   * - kind=file: save to a single file (defaultExtension required)
   * - kind=directory: export to a folder (defaultExtension ignored)
   * Maps format name to target kind + default extension.
   * Example:
   * {
   *   'postman-v2.1': { kind: 'file', defaultExtension: '.json' },
   *   'openapi-3.1': { kind: 'file', defaultExtension: '.yaml' },
   *   'bruno': { kind: 'directory', defaultExtension: '' }
   * }
   */
  fileExtensions: Record<string, {
    kind: 'file' | 'directory';
    defaultExtension: string;
  }>;
  
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
