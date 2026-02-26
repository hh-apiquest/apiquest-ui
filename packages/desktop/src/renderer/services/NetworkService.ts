// NetworkService - Captures HTTP request/response history from execution events
// Layer: Services (NO React dependencies)

import { EventEmitter } from 'eventemitter3';
import type { ExecutionEvent } from '../../types/execution';
import type { NetworkEntry, NetworkState } from '../types/network';
import { pluginLoader } from './PluginLoaderService';
import { buildSummary } from '../utils/responseAdapters';

type NetworkServiceEvents = {
  updated: (entries: NetworkEntry[]) => void;
  cleared: () => void;
};

export class NetworkService extends EventEmitter<NetworkServiceEvents> {
  private state: NetworkState = {
    entries: [],
    maxEntries: 1000
  };

  // Use composite key: executionId + requestId to handle collection runs where multiple requests share same executionId
  private entriesByKey = new Map<string, NetworkEntry>();

  private makeEntryKey(executionId: string, requestId?: string): string {
    return requestId ? `${executionId}:${requestId}` : executionId;
  }

  connectToExecutionStream(subscribe: (callback: (event: ExecutionEvent) => void) => () => void): () => void {
    const unsubscribe = subscribe((event) => this.handleExecutionEvent(event));
    return unsubscribe;
  }

  clear(): void {
    this.state.entries = [];
    this.entriesByKey.clear();
    this.emit('cleared');
  }

  getEntries(): NetworkEntry[] {
    return [...this.state.entries];
  }

  private handleExecutionEvent(event: ExecutionEvent): void {
    switch (event.type) {
      case 'beforeRequest':
        this.handleBeforeRequest(event);
        break;
      case 'afterRequest':
        this.handleAfterRequest(event);
        break;
      case 'requestCompleted':
        this.handleRequestCompleted(event);
        break;
      case 'exception':
        this.handleException(event);
        break;
      default:
        this.handleCustomEvent(event);
        break;
    }
  }

  private handleBeforeRequest(event: ExecutionEvent): void {
    const request = event.data?.request as any;
    if (!request) return;

    // Protocol comes from event.data.protocol (passed by RunnerService), not request.protocol
    // Request interface doesn't have protocol field - it's inherited from collection
    const protocol = event.data?.protocol;

    const entry: NetworkEntry = {
      id: `net-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      executionId: event.executionId,
      requestId: request.id,
      requestName: request.name,
      path: event.data?.path,
      protocol,
      startTime: event.timestamp || Date.now(),
      request
    };

    this.state.entries.unshift(entry);
    const entryKey = this.makeEntryKey(event.executionId, request.id);
    this.entriesByKey.set(entryKey, entry);

    if (this.state.entries.length > this.state.maxEntries) {
      const trimmed = this.state.entries.slice(0, this.state.maxEntries);
      this.state.entries = trimmed;
    }

    this.emit('updated', this.getEntries());
  }

  private handleAfterRequest(event: ExecutionEvent): void {
    const entry = this.getOrCreateEntry(event);
    if (!entry) return;

    const request = event.data?.request;
    const response = event.data?.response;
    
    // Use plugin presenter to extract response summary
    const protocol = event.data?.protocol || request?.protocol;
    const plugin = protocol ? pluginLoader.getProtocolPluginUI(protocol) : null;
    const summaryView = buildSummary(request, response, plugin);
    
    entry.response = response;
    entry.responseSummary = summaryView;
    entry.endTime = event.timestamp || Date.now();
    if (!entry.requestName && request) {
      entry.requestName = request.name;
    }
    if (!entry.requestId && request) {
      entry.requestId = request.id;
    }

    this.emit('updated', this.getEntries());
  }

  private handleRequestCompleted(event: ExecutionEvent): void {
    const entry = this.getOrCreateEntry(event);
    if (!entry) return;

    const result = event.data;
    if (result?.response) {
      entry.response = result.response;
    }
    if (entry.request) {
      const summaryView = buildSummary(entry.request, entry.response);
      entry.responseSummary = summaryView;
    }
    if (typeof result?.requestId === 'string') {
      entry.requestId = result.requestId;
    }
    if (typeof result?.requestName === 'string') {
      entry.requestName = result.requestName;
    }
    if (!entry.endTime) {
      entry.endTime = event.timestamp || Date.now();
    }

    this.emit('updated', this.getEntries());
  }

  private handleException(event: ExecutionEvent): void {
    const entry = this.getOrCreateEntry(event);
    if (!entry) return;

    const error = event.data?.error;
    entry.error = error?.message || String(error || 'Unknown error');
    entry.endTime = event.timestamp || Date.now();

    this.emit('updated', this.getEntries());
  }

  private handleCustomEvent(event: ExecutionEvent): void {
    if (!event.type) return;
    if (!event.type.includes(':')) return;

    const entry = this.getOrCreateEntry(event);
    if (!entry) return;

    if (!entry.customEvents) {
      entry.customEvents = [];
    }
    entry.customEvents.push(event);

    const payload = JSON.stringify({ type: event.type, data: event.data }, null, 2);
    const responseData = entry.response?.data as { events?: string[] } | undefined;
    const existingEvents = Array.isArray(responseData?.events) ? responseData?.events : [];

    entry.response = entry.response ?? {
      summary: {
        outcome: 'success',
        label: 'Event Stream',
        duration: 0
      },
      data: { events: existingEvents }
    };

    const nextEvents = [...existingEvents, payload];
    entry.response.data = { events: nextEvents };
    entry.responseSummary = entry.request ? buildSummary(entry.request, entry.response, null) : null;
    entry.endTime = event.timestamp || Date.now();

    this.emit('updated', this.getEntries());
  }

  private getOrCreateEntry(event: ExecutionEvent): NetworkEntry | null {
    // Try with requestId first (collection runs), then fall back to executionId only
    const request = event.data?.request as any;
    const requestId = request?.id;
    const entryKey = this.makeEntryKey(event.executionId, requestId);
    
    const existing = this.entriesByKey.get(entryKey);
    if (existing) return existing;

    // Try fallback with just executionId (for single request executions)
    if (requestId) {
      const fallbackKey = event.executionId;
      const fallbackEntry = this.entriesByKey.get(fallbackKey);
      if (fallbackEntry) return fallbackEntry;
    }

    // No existing entry found - create new one (shouldn't happen if beforeRequest fired)
    const entry: NetworkEntry = {
      id: `net-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      executionId: event.executionId,
      startTime: event.timestamp || Date.now()
    };

    this.state.entries.unshift(entry);
    this.entriesByKey.set(entryKey, entry);

    if (this.state.entries.length > this.state.maxEntries) {
      this.state.entries = this.state.entries.slice(0, this.state.maxEntries);
    }

    return entry;
  }
}

export const networkService = new NetworkService();
