import React from 'react';
import Editor, { loader } from '@monaco-editor/react';
import BlackboardTheme from '../themes/Blackboard.json';
import * as RadixThemes from '@radix-ui/themes';
import type {
  PluginUIContext,
  VariableResolverService,
  PluginHostBridge,
  ScriptIntellisenseContext,
  ScriptIntellisense
} from '@apiquest/plugin-ui-types';
import { pluginManagerService } from './PluginManagerService';
import { ScriptIntellisenseManager } from './ScriptIntellisenseManager';

// Import reusable editors
import {
  HeadersEditor,
  ParamsEditor,
  FormDataEditor,
  UrlEncodedEditor
} from '../components/editors';

class DummyVariableResolverService implements VariableResolverService {
  resolve(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] || match;
    });
  }
}

/**
 * PluginLoaderService
 * Creates per-plugin UI contexts and injects them into every registered plugin.
 * Each plugin receives its own context instance with a host bridge scoped to its npm package name.
 */
class PluginLoaderService {
  private currentTheme: 'light' | 'dark' = 'light';
  private isBlackboardThemeLoaded = false;
  private intellisenseManager = new ScriptIntellisenseManager();
  private currentContext: ScriptIntellisenseContext | null = null;
  
  constructor() {
    this.loadMonacoThemes();
  }
  
  private async loadMonacoThemes() {
    try {
      const monaco = await loader.init();
      monaco.editor.defineTheme('blackboard', BlackboardTheme as any);
      this.isBlackboardThemeLoaded = true;
      console.log('[PluginLoader] Blackboard theme loaded');
    } catch (error) {
      console.error('[PluginLoader] Failed to load Monaco themes:', error);
    }

    this.intellisenseManager.initialize().catch((error) => {
      console.error('[PluginLoader] IntelliSense manager failed to initialize:', error);
    });
  }
  
  /**
   * Initialize: inject per-plugin contexts into all loaded plugins.
   */
  initialize(theme: 'light' | 'dark' = 'light') {
    this.currentTheme = theme;
    this.injectUIContext();
    console.log('[PluginLoader] Per-plugin UI contexts injected');
  }
  
  /**
   * Create a UI context scoped to the given npm package name.
   * The host bridge on this context dispatches to handlers registered by that plugin's
   * hostBundle. packageName must be the full npm package name (e.g. '@apiquest/plugin-soap-ui').
   */
  createUIContext(packageName: string): PluginUIContext {
    const MonacoEditor = (props: any) => {
      const { value, language, onChange, height, theme, readonly, ...otherProps } = props;

      const effectiveTheme = theme || this.currentTheme;
      const editorTheme = effectiveTheme === 'dark'
        ? (this.isBlackboardThemeLoaded ? 'blackboard' : 'vs-dark')
        : 'vs-light';
      
      return React.createElement(Editor, {
        key: effectiveTheme,
        value,
        language: language || 'javascript',
        onChange,
        height: height || '100%',
        theme: editorTheme,
        options: {
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          readOnly: readonly ?? false
        },
        ...otherProps
      });
    };
    
    const variableResolverService = new DummyVariableResolverService();

    const aiService = {
      isConfigured: async () => window.quest.ai.isConfigured(),
      complete: async (request: Parameters<typeof window.quest.ai.complete>[0]) =>
        window.quest.ai.complete(request)
    };

    const host: PluginHostBridge = {
      showOpenDialog: (options) =>
        window.quest.host.showOpenDialog(packageName, options),

      readFile: (path) =>
        window.quest.host.readFile(packageName, path),

      fetchText: (url, options) =>
        window.quest.host.fetchText(packageName, url, options),

      invoke: <T = unknown>(action: string, payload?: unknown) =>
        window.quest.host.invoke<T>(packageName, action, payload),
    };
    
    return {
      React,
      Monaco: { Editor: MonacoEditor },
      variableResolver: variableResolverService,
      ai: aiService,
      host,
      Editors: {
        Headers: HeadersEditor,
        Params: ParamsEditor,
        FormData: FormDataEditor,
        UrlEncoded: UrlEncodedEditor
      },
      Radix: RadixThemes,
      theme: this.currentTheme
    };
  }
  
  /**
   * Inject per-plugin scoped UI contexts into all plugins from PluginManagerService.
   * Each plugin type uses its npm package name as the host bridge scope key.
   */
  private injectUIContext() {
    // Protocol plugins — use getAllProtocolPluginEntries() for packageName
    pluginManagerService.getAllProtocolPluginEntries().forEach(({ packageName, plugin }) => {
      plugin.setup(this.createUIContext(packageName));
      console.log(`[PluginLoader] Injected context into protocol plugin: ${packageName}`);
    });
    
    // Auth plugins — use getAllAuthPluginEntries() for packageName
    pluginManagerService.getAllAuthPluginEntries().forEach(({ packageName, plugin }) => {
      plugin.setup(this.createUIContext(packageName));
      console.log(`[PluginLoader] Injected context into auth plugin: ${packageName}`);
    });

    // Importer plugins — map key IS the packageName
    pluginManagerService.getAllImporterPluginEntries().forEach(({ packageName, plugin }) => {
      plugin.setup(this.createUIContext(packageName));
      console.log(`[PluginLoader] Injected context into importer plugin: ${packageName}`);
    });
    
    // Listen for new plugins and auto-setup with scoped context
    pluginManagerService.on('protocolPluginRegistered', (plugin: any) => {
      const packageName = pluginManagerService.getPackageNameForProtocol(plugin.protocol) ?? plugin.protocol;
      plugin.setup(this.createUIContext(packageName));
      console.log(`[PluginLoader] Auto-setup protocol plugin: ${packageName}`);
    });
    
    pluginManagerService.on('authPluginRegistered', (plugin: any) => {
      const packageName = pluginManagerService.getPackageNameForAuthType(plugin.type) ?? plugin.type;
      plugin.setup(this.createUIContext(packageName));
      console.log(`[PluginLoader] Auto-setup auth plugin: ${packageName}`);
    });

    pluginManagerService.on('importerPluginRegistered', (plugin: any, packageName?: string) => {
      // importerPluginRegistered is emitted from registerImporterPlugin(packageName, plugin)
      // The packageName is available from the importer entries map
      const allEntries = pluginManagerService.getAllImporterPluginEntries();
      const entry = allEntries.find(e => e.plugin === plugin);
      const resolvedPackageName = entry?.packageName ?? packageName ?? 'unknown';
      plugin.setup(this.createUIContext(resolvedPackageName));
      console.log(`[PluginLoader] Auto-setup importer plugin: ${resolvedPackageName}`);
    });

    // After a full plugin reload, re-apply the current IntelliSense context
    pluginManagerService.on('pluginsReloaded', () => {
      if (this.currentContext !== null) {
        console.log('[PluginLoader] Plugins reloaded — refreshing IntelliSense context');
        this.setActiveScriptIntellisenseContext(this.currentContext);
      }
    });
  }
  
  /**
   * Set the active script editor context and apply protocol-specific IntelliSense.
   */
  setActiveScriptIntellisenseContext(context: ScriptIntellisenseContext): void {
    this.currentContext = context;

    const protocolPlugin = pluginManagerService.getProtocolPlugin(context.protocol);
    const contributions: ScriptIntellisense[] = [];
    let canEventHaveTests = false;
    let protocolHasTestableEvents = false;

    if (protocolPlugin !== null && protocolPlugin !== undefined) {
      try {
        const pluginContributions = protocolPlugin.getScriptIntellisense?.(context) ?? [];
        contributions.push(...pluginContributions);

        const pluginEvents = (protocolPlugin as any).events as Array<{ name: string; canHaveTests?: boolean }> | undefined;
        protocolHasTestableEvents = Array.isArray(pluginEvents)
          ? pluginEvents.some((eventDef) => eventDef?.canHaveTests === true)
          : false;

        if (context.phase === 'plugin-event' && context.eventName !== undefined) {
          canEventHaveTests = Array.isArray(pluginEvents)
            ? pluginEvents.some((eventDef) => eventDef?.name === context.eventName && eventDef?.canHaveTests === true)
            : false;
        }
      } catch (error) {
        console.error(`[PluginLoader] Failed to get IntelliSense contributions from protocol ${context.protocol}:`, error);
      }
    }

    this.intellisenseManager.setContext(context, contributions, {
      canEventHaveTests,
      protocolHasTestableEvents,
    });
  }

  /**
   * Get a UI context scoped to the given protocol's npm package name.
   * Used by desktop renderer components (RequestEditor, CollectionEditor, ConsolePanel, Runner, etc.)
   * to construct the uiContext passed into plugin tab component props (UITabProps).
   * When protocol is provided and registered, the context's host bridge dispatches to that
   * plugin's handlers. When omitted, the host bridge is unscoped (host.invoke will throw at
   * dispatch time, which is acceptable for generic desktop rendering callers).
   */
  getUIContext(protocol?: string): PluginUIContext {
    if (protocol) {
      const packageName = pluginManagerService.getPackageNameForProtocol(protocol);
      if (packageName) {
        return this.createUIContext(packageName);
      }
    }
    return this.createUIContext('');
  }

  /**
   * Update theme — propagates to newly created contexts.
   * Existing plugin contexts that captured theme at setup time will not auto-update;
   * a plugin reload is needed for theme-sensitive plugin UI to pick up the change.
   */
  setTheme(theme: 'light' | 'dark') {
    if (this.currentTheme === theme) return;
    console.log(`[PluginLoader] Theme updated: ${this.currentTheme} -> ${theme}`);
    this.currentTheme = theme;
  }
  
  // Plugin queries delegate to PluginManagerService
  getProtocolPluginUI(protocol: string) {
    return pluginManagerService.getProtocolPlugin(protocol);
  }
  
  getAuthPluginUI(type: string) {
    return pluginManagerService.getAuthPlugin(type);
  }
  
  getAllProtocolPluginUIs() {
    return pluginManagerService.getAllProtocolPlugins();
  }
  
  getAllAuthPluginUIs() {
    return pluginManagerService.getAllAuthPlugins();
  }
  
  getAuthPluginUIsForProtocol(protocol: string) {
    const supportedAuthTypes = pluginManagerService.getSupportedAuthTypesForProtocol(protocol);
    return pluginManagerService.getAllAuthPlugins().filter(
      auth => supportedAuthTypes.includes(auth.type)
    );
  }
  
  getSupportedAuthTypesForProtocol(protocol: string): string[] {
    return pluginManagerService.getSupportedAuthTypesForProtocol(protocol);
  }
}

export const pluginLoader = new PluginLoaderService();
export type { PluginLoaderService };
