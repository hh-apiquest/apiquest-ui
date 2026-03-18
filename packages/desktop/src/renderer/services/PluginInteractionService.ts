// PluginInteractionService — Tier 3 renderer-side interaction manager
//
// Receives host:interaction:request events from the main process (via preload),
// maintains a per-plugin FIFO queue to serialize concurrent prompts, exposes
// the active interaction to PluginInteractionPortal via a subscribe/notify pattern,
// and sends the user's response back to main when the portal calls resolveInteraction
// or cancelInteraction.

import type { ComponentType } from 'react';
import type { PluginInteractionRegistration } from '@apiquest/plugin-ui-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The shape of an interaction request received from main. */
export interface IncomingInteractionRequest {
  requestId: string;
  packageName: string;
  promptKey: string;
  payload: unknown;
}

/** The active item currently shown by PluginInteractionPortal. */
export interface ActiveInteraction {
  requestId: string;
  packageName: string;
  promptKey: string;
  payload: unknown;
  /** Resolved React component for the promptKey, or null for the built-in __host_alert. */
  Component: ComponentType<{
    payload: unknown;
    onSubmit: (value: unknown) => void;
    onCancel: () => void;
  }> | null;
}

/** Internal queue item (includes the Component reference). */
interface QueuedInteraction extends IncomingInteractionRequest {
  Component: ActiveInteraction['Component'];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class PluginInteractionService {
  /**
   * Maps packageName -> promptKey -> Component.
   * Populated by registerPlugin() when plugins call setup() in PluginLoaderService.
   */
  private readonly registrations = new Map<
    string,
    Map<string, ComponentType<{ payload: unknown; onSubmit: (value: unknown) => void; onCancel: () => void }>>
  >();

  /**
   * FIFO queue per packageName.
   * Serializes concurrent ui.prompt calls from the same plugin.
   */
  private readonly queues = new Map<string, QueuedInteraction[]>();

  /** Currently active interaction shown by the portal. null = portal is idle. */
  private activeInteraction: ActiveInteraction | null = null;

  /** Portal state change listeners. */
  private readonly subscribers = new Set<() => void>();

  /** Unsubscribe from preload events. Set during initialize(). */
  private unsubscribePreload: (() => void) | null = null;

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Connect to the preload host:interaction:request channel.
   * Must be called once at app startup (before any plugins are loaded).
   */
  initialize(): void {
    if (this.unsubscribePreload !== null) {
      return; // Already initialized
    }
    this.unsubscribePreload = window.quest.host.onInteractionRequest((req) => {
      this.enqueue(req);
    });
    console.log('[PluginInteractionService] Initialized — listening for host:interaction:request events');
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register interaction components for a plugin.
   * Called by PluginLoaderService after each plugin.setup() call when the
   * plugin implements getInteractionRegistrations().
   *
   * @param packageName  npm package name of the plugin
   * @param regs         array of { promptKey, Component } registrations
   */
  registerPlugin(packageName: string, regs: PluginInteractionRegistration[]): void {
    const map = new Map<
      string,
      ComponentType<{ payload: unknown; onSubmit: (value: unknown) => void; onCancel: () => void }>
    >();
    for (const reg of regs) {
      map.set(reg.promptKey, reg.Component);
    }
    this.registrations.set(packageName, map);
    console.log(
      `[PluginInteractionService] Registered ${regs.length} interaction(s) for ${packageName}: ` +
      regs.map((r) => r.promptKey).join(', ')
    );
  }

  // ---------------------------------------------------------------------------
  // Queue management
  // ---------------------------------------------------------------------------

  private enqueue(req: IncomingInteractionRequest): void {
    // '__host_alert' is a built-in key — no Component lookup needed.
    const Component =
      req.promptKey === '__host_alert'
        ? null
        : (this.registrations.get(req.packageName)?.get(req.promptKey) ?? null);

    if (Component === null && req.promptKey !== '__host_alert') {
      console.warn(
        `[PluginInteractionService] No component registered for ${req.packageName}:${req.promptKey}. ` +
        `Sending auto-cancel to unblock main process.`
      );
      this.sendResponse(req.requestId, false, undefined, 'cancelled');
      return;
    }

    const item: QueuedInteraction = { ...req, Component };

    if (!this.queues.has(req.packageName)) {
      this.queues.set(req.packageName, []);
    }
    this.queues.get(req.packageName)!.push(item);

    // If no interaction is currently active, show this one immediately
    if (this.activeInteraction === null) {
      this.showNext(req.packageName);
    }
  }

  /**
   * Dequeue the next item for the given packageName and set it as active.
   * Does nothing if the queue for this package is empty.
   */
  private showNext(packageName: string): void {
    const queue = this.queues.get(packageName);
    if (queue === undefined || queue.length === 0) {
      return;
    }
    const next = queue.shift()!;
    this.activeInteraction = {
      requestId: next.requestId,
      packageName: next.packageName,
      promptKey: next.promptKey,
      payload: next.payload,
      Component: next.Component,
    };
    this.notifySubscribers();
  }

  // ---------------------------------------------------------------------------
  // Portal callbacks
  // ---------------------------------------------------------------------------

  /**
   * Called by PluginInteractionPortal when the user submits the interaction dialog.
   * Sends ok=true with the value and shows the next queued interaction if any.
   */
  resolveInteraction(requestId: string, value: unknown): void {
    if (this.activeInteraction?.requestId !== requestId) {
      console.warn(`[PluginInteractionService] resolveInteraction: requestId mismatch (got ${requestId})`);
      return;
    }
    const packageName = this.activeInteraction.packageName;
    this.sendResponse(requestId, true, value, undefined);
    this.clearActiveAndNext(packageName);
  }

  /**
   * Called by PluginInteractionPortal when the user cancels or dismisses the dialog.
   * Sends ok=false with reason='cancelled' and shows the next queued interaction.
   */
  cancelInteraction(requestId: string): void {
    if (this.activeInteraction?.requestId !== requestId) {
      console.warn(`[PluginInteractionService] cancelInteraction: requestId mismatch (got ${requestId})`);
      return;
    }
    const packageName = this.activeInteraction.packageName;
    this.sendResponse(requestId, false, undefined, 'cancelled');
    this.clearActiveAndNext(packageName);
  }

  private clearActiveAndNext(packageName: string): void {
    this.activeInteraction = null;
    this.notifySubscribers();
    // Show next queued interaction for the same package (if any)
    this.showNext(packageName);
  }

  private sendResponse(
    requestId: string,
    ok: boolean,
    value: unknown,
    reason: 'cancelled' | 'dismissed' | 'timeout' | 'renderer-unavailable' | undefined
  ): void {
    window.quest.host.sendInteractionResponse({ requestId, ok, value, reason });
  }

  // ---------------------------------------------------------------------------
  // State access (for PluginInteractionPortal)
  // ---------------------------------------------------------------------------

  /**
   * Get the currently active interaction. Null when the portal should be hidden.
   */
  getActiveInteraction(): ActiveInteraction | null {
    return this.activeInteraction;
  }

  /**
   * Subscribe to state changes. The callback is called whenever the active
   * interaction changes (new request shown or cleared).
   * Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private notifySubscribers(): void {
    for (const listener of this.subscribers) {
      listener();
    }
  }
}

/**
 * Singleton instance used by PluginLoaderService, App.tsx, and PluginInteractionPortal.
 */
export const pluginInteractionService = new PluginInteractionService();
