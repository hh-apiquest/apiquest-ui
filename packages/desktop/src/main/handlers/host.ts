// Plugin Host Bridge — main-process handler
// Manages the VM sandbox loader, file grant registry, and IPC dispatch
// for all plugin types (protocol-ui, importer-ui, exporter-ui, auth-ui, extension-ui).

import vm from 'node:vm';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ipcMain, dialog } from 'electron';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PluginSandboxApi {
  handlers: {
    on(action: string, handler: (payload: unknown) => Promise<unknown>): void;
  };
  file: {
    readText(filePath: string): Promise<string>;
    readBase64(filePath: string): Promise<string>;
  };
  fetch(url: string, options?: { headers?: Record<string, string>; method?: string; body?: string }): Promise<string>;
  console: {
    debug(...args: unknown[]): void;
    log(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    trace(...args: unknown[]): void;
  };
}

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

// pluginId (npm package name) -> Map of action -> async handler function
const pluginHandlerRegistry = new Map<string, Map<string, (payload: unknown) => Promise<unknown>>>();

// pluginId -> Set of absolute file/directory paths granted by the user via dialog
const allowedPaths = new Map<string, Set<string>>();

function getGrantedPaths(packageName: string): Set<string> {
  if (!allowedPaths.has(packageName)) {
    allowedPaths.set(packageName, new Set());
  }
  return allowedPaths.get(packageName)!;
}

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

const INVOKE_TIMEOUT_MS = 30_000;
const FETCH_BODY_LIMIT_BYTES = 5 * 1024 * 1024; // 5 MB

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[PluginHost] ${label} timed out after ${ms}ms`)),
        ms
      )
    ),
  ]);
}

// ---------------------------------------------------------------------------
// VM sandbox loader
// ---------------------------------------------------------------------------

/**
 * Load a plugin's hostBundle CJS file into a vm.createContext sandbox.
 * The bundle calls handlers.on(action, asyncFn) during synchronous init.
 * Sandbox globals: handlers, file, fetch, console — nothing else.
 *
 * @param packageName npm package name, e.g. "@apiquest/plugin-soap-ui"
 * @param bundlePath  absolute path to the plugin's dist/host-bundle.cjs
 */
export async function loadPluginHostBundle(packageName: string, bundlePath: string): Promise<void> {
  let code: string;
  try {
    code = await fs.readFile(bundlePath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PluginHost] Failed to read hostBundle for ${packageName}: ${msg}`);
    return;
  }

  const handlerMap = new Map<string, (payload: unknown) => Promise<unknown>>();
  pluginHandlerRegistry.set(packageName, handlerMap);

  const sandboxApi: PluginSandboxApi = {
    handlers: {
      on(action: string, handler: (payload: unknown) => Promise<unknown>): void {
        if (handlerMap.has(action)) {
          console.warn(`[PluginHost] ${packageName}: duplicate handler for '${action}', overwriting`);
        }
        handlerMap.set(action, handler);
        console.log(`[PluginHost] ${packageName}: registered handler '${action}'`);
      },
    },

    file: {
      async readText(filePath: string): Promise<string> {
        const resolved = path.resolve(filePath);
        const granted = getGrantedPaths(packageName);
        // Accept if the path itself was granted, or if it is a child of a granted directory
        const isAllowed =
          granted.has(resolved) ||
          [...granted].some((grantedPath) => resolved.startsWith(grantedPath + path.sep));
        if (!isAllowed) {
          throw new Error(
            `[PluginHost] Access denied: '${filePath}' was not granted by the user for plugin ${packageName}`
          );
        }
        return fs.readFile(resolved, 'utf-8');
      },

      async readBase64(filePath: string): Promise<string> {
        const resolved = path.resolve(filePath);
        const granted = getGrantedPaths(packageName);
        const isAllowed =
          granted.has(resolved) ||
          [...granted].some((grantedPath) => resolved.startsWith(grantedPath + path.sep));
        if (!isAllowed) {
          throw new Error(
            `[PluginHost] Access denied: '${filePath}' was not granted by the user for plugin ${packageName}`
          );
        }
        const buf = await fs.readFile(resolved);
        return buf.toString('base64');
      },
    },

    async fetch(
      url: string,
      options?: { headers?: Record<string, string>; method?: string; body?: string }
    ): Promise<string> {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`[PluginHost] Only http/https URLs allowed, got: ${parsed.protocol}`);
      }
      const resp = await globalThis.fetch(url, {
        method: options?.method ?? 'GET',
        headers: options?.headers,
        body: options?.body,
      });
      if (!resp.ok) {
        throw new Error(`[PluginHost] Fetch failed: ${resp.status} ${resp.statusText}`);
      }
      const contentLength = resp.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > FETCH_BODY_LIMIT_BYTES) {
        throw new Error(
          `[PluginHost] Response too large: ${contentLength} bytes (limit: ${FETCH_BODY_LIMIT_BYTES})`
        );
      }
      const text = await resp.text();
      if (text.length > FETCH_BODY_LIMIT_BYTES) {
        throw new Error(
          `[PluginHost] Response body exceeded ${FETCH_BODY_LIMIT_BYTES} byte limit`
        );
      }
      return text;
    },

    console: {
      debug: (...args: unknown[]) => console.debug(`  [plugin:${packageName}]`, ...args),
      log:   (...args: unknown[]) => console.log(`  [plugin:${packageName}]`, ...args),
      info:  (...args: unknown[]) => console.info(`  [plugin:${packageName}]`, ...args),
      warn:  (...args: unknown[]) => console.warn(`  [plugin:${packageName}]`, ...args),
      error: (...args: unknown[]) => console.error(`  [plugin:${packageName}]`, ...args),
      trace: (...args: unknown[]) => console.trace(`  [plugin:${packageName}]`, ...args),
    },
  };

  // null-prototype base object: no prototype pollution possible from inside the sandbox
  const contextBase = Object.create(null) as Record<string, unknown>;
  contextBase['handlers'] = Object.freeze(sandboxApi.handlers);
  contextBase['file'] = Object.freeze(sandboxApi.file);
  contextBase['fetch'] = sandboxApi.fetch.bind(sandboxApi);
  contextBase['console'] = Object.freeze({
    debug: sandboxApi.console.debug,
    log:   sandboxApi.console.log,
    info:  sandboxApi.console.info,
    warn:  sandboxApi.console.warn,
    error: sandboxApi.console.error,
    trace: sandboxApi.console.trace,
  });

  const context = vm.createContext(contextBase, {
    name: `plugin:${packageName}`,
    codeGeneration: { strings: false, wasm: false },
  });

  try {
    vm.runInContext(code, context, {
      filename: bundlePath,
      timeout: 5_000, // 5 s init-only timeout (synchronous code)
    });
    console.log(`[PluginHost] Loaded hostBundle for ${packageName}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PluginHost] Error loading hostBundle for ${packageName}: ${msg}`);
    pluginHandlerRegistry.delete(packageName);
  }
}

/**
 * Dispatch a host:invoke action directly from within the main process (no IPC round-trip).
 * Used by workspace:importCollection and similar main-process callers that need to invoke
 * plugin hostBundle handlers without going through the IPC channel.
 */
export async function dispatchPluginHostInvoke(
  packageName: string,
  action: string,
  payload: unknown
): Promise<unknown> {
  const handlers = pluginHandlerRegistry.get(packageName);
  if (!handlers) {
    throw new Error(
      `[PluginHost] Plugin ${packageName} has no hostBundle loaded. ` +
      `Ensure 'apiquest.hostBundle' is declared in package.json and the bundle was scanned.`
    );
  }
  const handler = handlers.get(action);
  if (!handler) {
    throw new Error(
      `[PluginHost] Plugin ${packageName}: no handler registered for action '${action}'`
    );
  }
  return withTimeout(
    handler(payload),
    INVOKE_TIMEOUT_MS,
    `${packageName}:${action}`
  );
}

/**
 * Grant a path to a plugin from within the main process.
 * Used by workspace:importCollection when it shows the dialog itself (no renderer round-trip).
 */
export function grantPath(packageName: string, filePath: string): void {
  getGrantedPaths(packageName).add(path.resolve(filePath));
}

/**
 * Read a file on behalf of a plugin — path must be in the granted set.
 * Used by workspace:importCollection after showing its own dialog.
 */
export async function readGrantedFile(packageName: string, filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  const granted = getGrantedPaths(packageName);
  const isAllowed =
    granted.has(resolved) ||
    [...granted].some((grantedPath) => resolved.startsWith(grantedPath + path.sep));
  if (!isAllowed) {
    throw new Error(
      `[PluginHost] Access denied: path not granted for plugin ${packageName}`
    );
  }
  return fs.readFile(resolved, 'utf-8');
}

/**
 * Clear all handler registrations and path grants for a plugin.
 * Call this when a plugin is removed or before reloading it.
 */
export function clearPluginHostBundle(packageName: string): void {
  pluginHandlerRegistry.delete(packageName);
  allowedPaths.delete(packageName);
  console.log(`[PluginHost] Cleared host bundle state for ${packageName}`);
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

export function registerHostHandlers(): void {
  // Show OS file or directory picker and allowlist the selected paths for the plugin
  ipcMain.handle(
    'host:showOpenDialog',
    async (_event, packageName: string, options: {
      kind?: 'file' | 'directory';
      title?: string;
      buttonLabel?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
      multiSelections?: boolean;
    }): Promise<string[] | null> => {
      const isDirectory = options.kind === 'directory';

      const result = await dialog.showOpenDialog({
        title: options.title,
        buttonLabel: options.buttonLabel,
        properties: [
          isDirectory ? 'openDirectory' : 'openFile',
          ...(options.multiSelections ? (['multiSelections'] as const) : []),
        ],
        filters: isDirectory ? undefined : options.filters,
      });

      if (result.canceled || result.filePaths.length === 0) return null;

      const granted = getGrantedPaths(packageName);
      result.filePaths.forEach((p) => granted.add(path.resolve(p)));

      return result.filePaths;
    }
  );

  // Read a text file — path must have been granted via showOpenDialog
  ipcMain.handle(
    'host:readFile',
    async (_event, packageName: string, filePath: string): Promise<string> => {
      const resolved = path.resolve(filePath);
      const granted = getGrantedPaths(packageName);
      const isAllowed =
        granted.has(resolved) ||
        [...granted].some((grantedPath) => resolved.startsWith(grantedPath + path.sep));
      if (!isAllowed) {
        throw new Error(
          `[PluginHost] Access denied: path not granted by user for plugin ${packageName}`
        );
      }
      return fs.readFile(resolved, 'utf-8');
    }
  );

  // Fetch a remote URL from the main process — http/https only, 5 MB cap
  ipcMain.handle(
    'host:fetchText',
    async (
      _event,
      _packageName: string,
      url: string,
      options?: { headers?: Record<string, string> }
    ): Promise<string> => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`[PluginHost] Only http/https URLs allowed`);
      }
      const resp = await globalThis.fetch(url, { headers: options?.headers });
      if (!resp.ok) {
        throw new Error(`[PluginHost] Fetch failed: ${resp.status} ${resp.statusText}`);
      }
      const contentLength = resp.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > FETCH_BODY_LIMIT_BYTES) {
        throw new Error(
          `[PluginHost] Response too large: ${contentLength} bytes (limit: ${FETCH_BODY_LIMIT_BYTES})`
        );
      }
      const text = await resp.text();
      if (text.length > FETCH_BODY_LIMIT_BYTES) {
        throw new Error(
          `[PluginHost] Response body exceeded ${FETCH_BODY_LIMIT_BYTES} byte limit`
        );
      }
      return text;
    }
  );

  // Dispatch to a handler registered by the plugin's hostBundle module
  ipcMain.handle(
    'host:invoke',
    async (_event, packageName: string, action: string, payload: unknown): Promise<unknown> => {
      const handlers = pluginHandlerRegistry.get(packageName);
      if (!handlers) {
        throw new Error(
          `[PluginHost] Plugin ${packageName} has no hostBundle loaded. ` +
          `Ensure 'apiquest.hostBundle' is declared in package.json and the bundle was scanned.`
        );
      }
      const handler = handlers.get(action);
      if (!handler) {
        throw new Error(
          `[PluginHost] Plugin ${packageName}: no handler registered for action '${action}'`
        );
      }
      return withTimeout(
        handler(payload),
        INVOKE_TIMEOUT_MS,
        `${packageName}:${action}`
      );
    }
  );
}
