// Plugin Host Bridge — main-process handler
// Manages the VM sandbox loader, file grant registry, IPC dispatch, and
// the two-way interaction bridge (Tier 3) for all plugin types.

import vm from 'node:vm';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ipcMain, dialog } from 'electron';
import type { WebContents } from 'electron';

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

/** Deferred promise used to await renderer interaction responses. */
interface Deferred {
  resolve(result: InteractionResponse): void;
  reject(reason: Error): void;
}

/** Raw interaction result sent back from the renderer. */
interface InteractionResponse {
  requestId: string;
  ok: boolean;
  value?: unknown;
  reason?: 'cancelled' | 'dismissed' | 'timeout' | 'renderer-unavailable';
}

/**
 * Per-call dispatch context stored in AsyncLocalStorage.
 * Only carries packageName — all ui.prompt/ui.alert calls are routed to the
 * single main application window regardless of how the handler was invoked.
 */
interface DispatchContext {
  packageName: string;
}

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

// pluginId (npm package name) -> Map of action -> async handler function
const pluginHandlerRegistry = new Map<string, Map<string, (payload: unknown) => Promise<unknown>>>();

// pluginId -> Set of absolute file/directory paths granted by the user via dialog
const allowedPaths = new Map<string, Set<string>>();

/**
 * The main application window's WebContents.
 * Set once at startup via setInteractionWindow().
 * ui.prompt and ui.alert always target this window — it hosts PluginInteractionPortal.
 */
let interactionWebContents: WebContents | null = null;

/**
 * Register the main BrowserWindow as the interaction portal host.
 * Must be called from the main window setup code (index.ts).
 * The destroyed event handler is attached here so all pending interactions
 * are rejected if the renderer reloads or the window is closed.
 */
export function setInteractionWindow(window: { webContents: WebContents }): void {
  interactionWebContents = window.webContents;
  const wc = window.webContents;
  // Reject pending interactions when the renderer is destroyed or reloaded.
  wc.on('destroyed', () => {
    rejectInteractionsForWebContents(wc);
    interactionWebContents = null;
  });
  wc.on('did-start-loading', () => {
    rejectInteractionsForWebContents(wc);
  });
}

function getGrantedPaths(packageName: string): Set<string> {
  if (!allowedPaths.has(packageName)) {
    allowedPaths.set(packageName, new Set());
  }
  return allowedPaths.get(packageName)!;
}

// ---------------------------------------------------------------------------
// Tier 3 — Host-to-renderer interaction bridge
// ---------------------------------------------------------------------------

/**
 * Propagates the renderer WebContents through async call chains so that
 * vm sandbox code can reach it without explicitly threading it as an argument.
 * Automatically flows through Promise chains via async_hooks.
 */
const dispatchContext = new AsyncLocalStorage<DispatchContext>();

/**
 * Pending renderer interactions keyed by requestId (UUID).
 * Populated by ui.prompt; resolved by the host:interaction:response IPC handler.
 */
const pendingInteractionRequests = new Map<string, Deferred>();

/**
 * Maximum time (ms) the renderer has to respond to a ui.prompt or ui.alert.
 * If the user takes longer than this the prompt rejects with reason='timeout'.
 */
const INTERACTION_TIMEOUT_MS = 10 * 60_000; // 10 minutes

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
      if (contentLength != null && parseInt(contentLength, 10) > FETCH_BODY_LIMIT_BYTES) {
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

  // ---------------------------------------------------------------------------
  // Tier 3 — ui bridge injected into the sandbox
  // ---------------------------------------------------------------------------

  /**
   * Helper: create a deferred interaction request and send it to the renderer.
   * Returns a promise that resolves when the renderer sends back a response.
   * Rejects with reason='timeout' if the renderer takes too long.
   * Rejects with an Error if called from a non-renderer-initiated dispatch.
   */
  function sendInteractionRequest(promptKey: string, payload: unknown): Promise<{
    ok: boolean;
    value?: unknown;
    reason?: 'cancelled' | 'dismissed' | 'timeout' | 'renderer-unavailable';
  }> {
    const wc = interactionWebContents;
    if (wc === null) {
      return Promise.reject(new Error(
        `[PluginHost] ui.prompt called before the main window was registered. ` +
        `Ensure setInteractionWindow() is called during app startup.`
      ));
    }

    if (wc.isDestroyed()) {
      return Promise.reject(new Error(
        `[PluginHost] ui.prompt: PluginInteractionPortal renderer was destroyed.`
      ));
    }

    const requestId = randomUUID();

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        if (pendingInteractionRequests.has(requestId)) {
          pendingInteractionRequests.delete(requestId);
          resolve({ ok: false, reason: 'timeout' });
        }
      }, INTERACTION_TIMEOUT_MS);

      // Clean up the timeout when the interaction completes normally
      const deferred: Deferred = {
        resolve: (result: InteractionResponse) => {
          clearTimeout(timeoutHandle);
          pendingInteractionRequests.delete(requestId);
          resolve({ ok: result.ok, value: result.value, reason: result.reason });
        },
        reject: (err: Error) => {
          clearTimeout(timeoutHandle);
          pendingInteractionRequests.delete(requestId);
          reject(err);
        },
      };

      pendingInteractionRequests.set(requestId, deferred);

      wc.send('host:interaction:request', {
        requestId,
        packageName,
        promptKey,
        payload,
      });
    });
  }

  const uiBridge = {
    prompt: async <TResponse = unknown>(request: { promptKey: string; payload?: unknown }) => {
      return sendInteractionRequest(request.promptKey, request.payload ?? null) as Promise<
        { ok: true; value: TResponse } | { ok: false; reason: 'cancelled' | 'dismissed' | 'timeout' | 'renderer-unavailable' }
      >;
    },

    alert: async (request: {
      level: 'info' | 'warning' | 'error' | 'success';
      title: string;
      message: string;
      details?: string[];
    }): Promise<void> => {
      // '__host_alert' is a built-in promptKey handled by PluginInteractionPortal
      // without requiring a plugin-registered component.
      await sendInteractionRequest('__host_alert', request);
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
  contextBase['ui'] = Object.freeze(uiBridge);

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
 *
 * ui.prompt and ui.alert are available to the handler because they target the main window
 * registered via setInteractionWindow(), not the IPC event sender.
 * A 30-second timeout applies to the overall call (not to individual ui.prompt interactions
 * within the handler — those have their own INTERACTION_TIMEOUT_MS).
 */
export async function dispatchPluginHostInvoke(
  packageName: string,
  action: string,
  payload: unknown
): Promise<unknown> {
  const handlers = pluginHandlerRegistry.get(packageName);
  if (handlers === undefined) {
    throw new Error(
      `[PluginHost] Plugin ${packageName} has no hostBundle loaded. ` +
      `Ensure 'apiquest.hostBundle' is declared in package.json and the bundle was scanned.`
    );
  }
  const handler = handlers.get(action);
  if (handler === undefined) {
    throw new Error(
      `[PluginHost] Plugin ${packageName}: no handler registered for action '${action}'`
    );
  }
  return dispatchContext.run(
    { packageName },
    () => handler(payload)
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
          ...(options.multiSelections ?? false ? (['multiSelections'] as const) : []),
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
      if (contentLength != null && parseInt(contentLength, 10) > FETCH_BODY_LIMIT_BYTES) {
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

  // Dispatch to a handler registered by the plugin's hostBundle module.
  // No outer timeout here — the handler may pause waiting for a ui.prompt response.
  // A separate per-interaction timeout applies inside ui.prompt itself.
  ipcMain.handle(
    'host:invoke',
    async (event, packageName: string, action: string, payload: unknown): Promise<unknown> => {
      const handlers = pluginHandlerRegistry.get(packageName);
      if (handlers === undefined) {
        throw new Error(
          `[PluginHost] Plugin ${packageName} has no hostBundle loaded. ` +
          `Ensure 'apiquest.hostBundle' is declared in package.json and the bundle was scanned.`
        );
      }
      const handler = handlers.get(action);
      if (handler === undefined) {
        throw new Error(
          `[PluginHost] Plugin ${packageName}: no handler registered for action '${action}'`
        );
      }
      return dispatchContext.run(
        { packageName },
        () => handler(payload)
      );
    }
  );

  // Tier 3: receive interaction responses from the renderer and resolve the
  // corresponding deferred promise in pendingInteractionRequests.
  ipcMain.on(
    'host:interaction:response',
    (_event, response: InteractionResponse) => {
      const deferred = pendingInteractionRequests.get(response.requestId);
      if (deferred === undefined) {
        console.warn(
          `[PluginHost] Received host:interaction:response for unknown requestId: ${response.requestId}`
        );
        return;
      }
      deferred.resolve(response);
    }
  );
}

// ---------------------------------------------------------------------------
// Tier 3 — WebContents lifecycle cleanup
// ---------------------------------------------------------------------------

/**
 * Reject all pending interaction requests targeted at a destroyed or reloaded
 * renderer window. Call this from the WebContents lifecycle hooks in the main
 * window setup code.
 *
 * @param webContents The renderer WebContents that is being torn down.
 */
export function rejectInteractionsForWebContents(wc: WebContents): void {
  const wcId = wc.id;
  for (const [requestId, deferred] of pendingInteractionRequests) {
    // We don't store the WebContents id per request, so reject all pending
    // requests as a safety measure when any renderer becomes unavailable.
    // In practice, there is only one renderer window.
    console.warn(
      `[PluginHost] Rejecting pending interaction ${requestId} — renderer (id=${wcId}) became unavailable.`
    );
    deferred.reject(
      new Error(`[PluginHost] Renderer (id=${wcId}) became unavailable while waiting for interaction.`)
    );
  }
}
