import React from 'react';
import Editor, { loader } from '@monaco-editor/react';
import BlackboardTheme from '../themes/Blackboard.json';
import * as RadixThemes from '@radix-ui/themes';
import * as HeroIconsOutline from '@heroicons/react/24/outline';
import * as HeroIconsSolid from '@heroicons/react/24/solid';
import * as HeroIconsMini from '@heroicons/react/20/solid';
import type { PluginUIContext, VariableResolverService } from '@apiquest/plugin-ui-types';
import { pluginManagerService } from './PluginManagerService';

// Import reusable editors
import {
  HeadersEditor,
  ParamsEditor,
  FormDataEditor,
  UrlEncodedEditor
} from '../components/editors';

/**
 * Dummy Variable Resolver Service
 * TODO: Implement actual variable resolution
 */
class DummyVariableResolverService implements VariableResolverService {
  resolve(text: string, variables: Record<string, string>): string {
    // Simple {{variable}} replacement
    return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] || match;
    });
  }
}

/**
 * PluginLoaderService
 * Creates UI context and injects it into plugins from PluginManagerService
 */
class PluginLoaderService {
  private uiContext: PluginUIContext | null = null;
  private currentTheme: 'light' | 'dark' = 'light';
  private isBlackboardThemeLoaded = false;
  
  constructor() {
    this.loadMonacoThemes();
  }
  
  /**
   * Load custom Monaco themes
   */
  private async loadMonacoThemes() {
    try {
      const monaco = await loader.init();
      monaco.editor.defineTheme('blackboard', BlackboardTheme as any);
      this.isBlackboardThemeLoaded = true;
      console.log('[PluginLoader] Blackboard theme loaded');
    } catch (error) {
      console.error('[PluginLoader] Failed to load Monaco themes:', error);
    }
  }
  
  /**
   * Initialize: create UI context and inject into all plugins
   */
  initialize(theme: 'light' | 'dark' = 'light') {
    this.currentTheme = theme;
    this.uiContext = this.createUIContext();
    
    // Inject UI context into all loaded plugins
    this.injectUIContext();
    
    console.log('[PluginLoader] UI context injected into plugins');
  }
  
  /**
   * Create UI context with all dependencies
   */
  private createUIContext(): PluginUIContext {
    const MonacoEditor = (props: any) => {
      const { value, language, onChange, height, theme, readonly, ...otherProps } = props;

      console.log('[Monaco] Wrapper called:', {
        propsTheme: theme,
        currentTheme: this.currentTheme,
        uiContextTheme: this.uiContext?.theme
      });

      // Use props.theme if provided (from uiState), otherwise fall back
      const effectiveTheme = theme || this.uiContext?.theme || this.currentTheme;
      const editorTheme = effectiveTheme === 'dark' 
        ? (this.isBlackboardThemeLoaded ? 'blackboard' : 'vs-dark')
        : 'vs-light';
      
      console.log('[Monaco] Computed editorTheme:', editorTheme);
      
      return React.createElement(Editor, {
        key: effectiveTheme, // Force re-mount on theme change
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
          readOnly: readonly ?? false  // Support readonly prop
        },
        ...otherProps
      });
    };
    
    const variableResolverService = new DummyVariableResolverService();
    
    return {
      React,
      Monaco: { Editor: MonacoEditor },
      variableResolver: variableResolverService,
      Editors: {
        Headers: HeadersEditor,
        Params: ParamsEditor,
        FormData: FormDataEditor,
        UrlEncoded: UrlEncodedEditor
      },
      Radix: RadixThemes,
      Icons: {
        outline: HeroIconsOutline,
        solid: HeroIconsSolid,
        mini: HeroIconsMini
      },
      theme: this.currentTheme
    };
  }
  
  /**
   * Inject UI context into all plugins from PluginManagerService
   */
  private injectUIContext() {
    if (!this.uiContext) {
      throw new Error('UI context not created');
    }
    
    // Get all plugins from manager and call setup()
    pluginManagerService.getAllProtocolPlugins().forEach(plugin => {
      plugin.setup(this.uiContext!);
      console.log(`[PluginLoader] Injected UI context into protocol: ${plugin.protocol}`);
    });
    
    pluginManagerService.getAllAuthPlugins().forEach(plugin => {
      plugin.setup(this.uiContext!);
      console.log(`[PluginLoader] Injected UI context into auth: ${plugin.type}`);
    });
    
    // Listen for new plugins being registered and auto-setup
    pluginManagerService.on('protocolPluginRegistered', (plugin: any) => {
      if (this.uiContext) {
        plugin.setup(this.uiContext);
        console.log(`[PluginLoader] Auto-setup protocol plugin: ${plugin.protocol}`);
      }
    });
    
    pluginManagerService.on('authPluginRegistered', (plugin: any) => {
      if (this.uiContext) {
        plugin.setup(this.uiContext);
        console.log(`[PluginLoader] Auto-setup auth plugin: ${plugin.type}`);
      }
    });
  }
  
  /**
   * Get UI context for passing to plugin components
   */
  getUIContext(): PluginUIContext {
    if (!this.uiContext) {
      throw new Error('PluginLoaderService not initialized');
    }
    return this.uiContext;
  }
  
  /**
   * Update theme - just update the existing context, don't reinitialize
   */
  setTheme(theme: 'light' | 'dark') {
    console.log(`[PluginLoader] setTheme called: ${this.currentTheme} to ${theme}`);
    if (this.currentTheme === theme) {
      console.log('[PluginLoader] Theme unchanged, skipping');
      return;
    }
    this.currentTheme = theme;
    
    // Update theme in existing context - DON'T reinitialize
    if (this.uiContext) {
      console.log('[PluginLoader] Updating theme in existing context to:', theme);
      this.uiContext.theme = theme;
    }
  }
  
  // Delegate all plugin queries to PluginManagerService
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
    // Filter by protocol's supported auth types from metadata
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
