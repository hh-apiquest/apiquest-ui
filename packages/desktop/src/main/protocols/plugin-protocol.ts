/**
 * Plugin Protocol Handler
 *
 * Registers custom protocols:
 * - `plugin://` - serves plugin files from disk
 * - `vendor://` - serves shared vendor module shims from window.__VENDOR__
 *
 * URL Format:
 * - plugin://short-name/file/path
 * - vendor:///react.js  (triple-slash so filename is in pathname, not hostname)
 *
 * The vendor:// protocol returns JavaScript shim code that re-exports from
 * window.__VENDOR__, which is populated by main.tsx before any plugins load.
 * This guarantees plugins share the exact same React and Radix UI instances as
 * the main app, preventing dual React instance errors (hooks on wrong dispatcher).
 *
 * Only React and Radix UI are shared via vendor://. Other deps (heroicons, etc.)
 * are bundled by each plugin individually.
 */

import { protocol, app } from 'electron';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * Shim code for each shared vendor module.
 * Each shim reads from window.__VENDOR__ which is set by main.tsx.
 * Using window.__VENDOR__ guarantees the same module instance as the main app.
 */
const VENDOR_SHIMS: Record<string, string> = {
  'react.js': `
const __v = window.__VENDOR__.react;
export default __v;
export const {
  Component, PureComponent, Fragment, StrictMode, Suspense,
  createElement, createContext, createRef, forwardRef, lazy, memo,
  useCallback, useContext, useDebugValue, useEffect, useImperativeHandle,
  useLayoutEffect, useMemo, useReducer, useRef, useState,
  useSyncExternalStore, useTransition, startTransition, useId,
  useDeferredValue, Children, cloneElement, isValidElement,
  createFactory, createPortal
} = __v;
`,
  'react-dom.js': `
const __v = window.__VENDOR__.reactDom;
export default __v;
export const { createRoot, hydrateRoot } = __v;
`,
  'react-jsx-runtime.js': `
const __v = window.__VENDOR__.reactJsxRuntime;
export const { jsx, jsxs, Fragment } = __v;
`,
  'react-jsx-dev-runtime.js': `
const __v = window.__VENDOR__.reactJsxDevRuntime;
export const { jsxDEV, Fragment } = __v;
`,
  'radix-ui-themes.js': `
const __v = window.__VENDOR__.radixThemes;
export default __v;
export const {
  AccessibleIcon, AlertDialog, AspectRatio, Avatar, Badge, Blockquote,
  Box, Button, Callout, Card, Checkbox, CheckboxCards, CheckboxGroup,
  ChevronDownIcon, Code, Container, ContextMenu, DataList, Dialog,
  DropdownMenu, Em, Flex, Grid, Heading, HoverCard, IconButton, Inset,
  Kbd, Link, Popover, Portal, Progress, Quote, Radio, RadioCards,
  RadioGroup, Reset, ScrollArea, Section, SegmentedControl, Select,
  Separator, Skeleton, Slider, Slot, Slottable, Spinner, Strong, Switch,
  TabNav, Table, Tabs, Text, TextArea, TextField, Theme, ThemeContext,
  ThemePanel, ThickCheckIcon, ThickChevronRightIcon, ThickDividerHorizontalIcon,
  Tooltip, VisuallyHidden, useThemeContext
} = __v;
`,
};

/**
 * Register the vendor:// protocol to serve vendor module shims.
 * Shims read from window.__VENDOR__ (set by main.tsx) to guarantee
 * a single shared instance of each dependency.
 */
function registerVendorProtocol(): void {
  protocol.handle('vendor', async (request) => {
    try {
      const url = new URL(request.url);
      
      // vendor:///react.js -> pathname=/react.js, hostname=empty (correct)
      // vendor://react.js -> pathname=/, hostname=react.js (wrong - filename in hostname)
      let fileName: string;
      if (url.pathname && url.pathname !== '/') {
        fileName = url.pathname.slice(1); // Remove leading /
      } else {
        fileName = url.hostname; // Fallback: filename was parsed as hostname
      }
      
      if (fileName.endsWith('/')) {
        fileName = fileName.slice(0, -1);
      }
      
      console.log(`[VendorProtocol] Request: ${request.url} -> ${fileName}`);
      
      const shim = VENDOR_SHIMS[fileName];
      if (shim) {
        return new Response(shim.trim(), {
          status: 200,
          headers: {
            'content-type': 'application/javascript',
            'access-control-allow-origin': '*'
          }
        });
      }
      
      console.warn(`[VendorProtocol] No shim for: ${fileName}`);
      return new Response(`// No vendor shim for: ${fileName}\nexport default {};`, {
        status: 200,
        headers: { 'content-type': 'application/javascript' }
      });
    } catch (error: any) {
      console.error(`[VendorProtocol] Error: ${request.url}:`, error.message);
      return new Response(`Vendor error: ${error.message}`, {
        status: 500,
        headers: { 'content-type': 'text/plain' }
      });
    }
  });
  
  console.log('[VendorProtocol] Registered (window.__VENDOR__ shims)');
}

/**
 * Register the plugin:// protocol handler
 * @param pluginsDir Path to plugins directory (e.g., appData/plugins)
 */
export function registerPluginProtocol(pluginsDir: string): void {
  // Register vendor protocol first
  registerVendorProtocol();
  
  protocol.handle('plugin', async (request) => {
    try {
      const url = new URL(request.url);
      
      // URL structure: plugin://http-ui/dist/index.js
      const pluginShortName = url.hostname; // "http-ui"
      const filePath = url.pathname.slice(1); // "dist/index.js" (remove leading /)
      
      // Reconstruct full folder name: plugin-http-ui
      const pluginFolderName = `plugin-${pluginShortName}`;
      
      // Full path: {pluginsDir}/plugin-http-ui/dist/index.js
      const fullPath = path.join(pluginsDir, pluginFolderName, filePath);
      
      console.log(`[PluginProtocol] Loading: ${request.url}`);
      console.log(`[PluginProtocol] Resolved to: ${fullPath}`);
      
      // Read file content
      let content = await readFile(fullPath, 'utf-8');
      
      // Determine content type from extension
      const ext = path.extname(filePath).toLowerCase();
      const contentType = getContentType(ext);
      
      // For JavaScript files, transform imports to use vendor modules
      if (ext === '.js' || ext === '.mjs') {
        const originalContent = content;
        content = transformPluginImports(content);
        
        if (content !== originalContent) {
          console.log(`[PluginProtocol] Transformed imports in ${filePath}`);
        }
      }
      
      return new Response(content, {
        status: 200,
        headers: {
          'content-type': contentType,
          'access-control-allow-origin': '*'
        }
      });
      
    } catch (error: any) {
      console.error(`[PluginProtocol] Error loading ${request.url}:`, error.message);
      
      return new Response(`Plugin file not found: ${error.message}`, {
        status: 404,
        headers: { 'content-type': 'text/plain' }
      });
    }
  });
  
  console.log(`[PluginProtocol] Registered - serving from: ${pluginsDir}`);
}

/**
 * Map file extension to MIME type
 */
function getContentType(ext: string): string {
  const contentTypes: Record<string, string> = {
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.cjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };
  
  return contentTypes[ext] || 'text/plain';
}

/**
 * Transform plugin code to replace bare imports with vendor module paths.
 * Only React and Radix UI are redirected to vendor:// (shared instances).
 * Other deps (heroicons, etc.) are bundled by the plugin itself.
 */
function transformPluginImports(code: string): string {
  // Determine if we're in production (packaged) or development
  const isProduction = app.isPackaged;
  
  // Use vendor:/// protocol for production (triple-slash so filename goes in pathname, not hostname)
  // Use Vite dev server for development with a trailing slash separator
  const vendorBasePath = isProduction ? 'vendor:///' : 'http://localhost:5173/vendor/';
  const fileExtension = isProduction ? '.js' : '.ts';
  
  // Only shared React + Radix UI deps are redirected to vendor://
  // Heroicons, colors, plugin-ui-types are bundled by each plugin
  const importMap: Record<string, string> = {
    'react': `${vendorBasePath}react${fileExtension}`,
    'react-dom': `${vendorBasePath}react-dom${fileExtension}`,
    'react/jsx-runtime': `${vendorBasePath}react-jsx-runtime${fileExtension}`,
    'react/jsx-dev-runtime': `${vendorBasePath}react-jsx-dev-runtime${fileExtension}`,
    '@radix-ui/themes': `${vendorBasePath}radix-ui-themes${fileExtension}`,
  };
  
  let transformed = code;
  
  // Replace import statements
  for (const [module, vendorPath] of Object.entries(importMap)) {
    // Match: import ... from "module" or import ... from 'module' (with optional trailing slash)
    const importRegex = new RegExp(
      `(import\\s+.*?\\s+from\\s+['"])${module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?(['"])`,
      'g'
    );
    transformed = transformed.replace(importRegex, `$1${vendorPath}$2`);
    
    // Match: import("module") or import('module') - dynamic imports (with optional trailing slash)
    const dynamicImportRegex = new RegExp(
      `(import\\s*\\(\\s*['"])${module.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?(['"]\\s*\\))`,
      'g'
    );
    transformed = transformed.replace(dynamicImportRegex, `$1${vendorPath}$2`);
  }
  
  return transformed;
}
