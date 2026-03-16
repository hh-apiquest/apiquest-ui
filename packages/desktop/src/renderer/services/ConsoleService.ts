// ConsoleService - Manages console messages from fracture events
// Layer: Services (NO React dependencies)

import { LogLevel, type EventPayloads } from '@apiquest/types';
import type {
  ConsoleMessage,
  ConsoleFilter,
  ConsoleState,
  ConsoleMessageSource
} from '../types/console';
import { EventEmitter } from 'eventemitter3';
import type { CollectionRunner } from '@apiquest/fracture';

export class ConsoleService extends EventEmitter {
  private state: ConsoleState = {
    messages: [],
    filter: {
      levels: [LogLevel.TRACE, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.DEBUG],
      sources: ['system', 'script', 'network', 'test']
    },
    maxMessages: 1000,
    isPaused: false
  };

  /**
   * Add a message to the console
   */
  addMessage(
    level: LogLevel,
    source: ConsoleMessageSource,
    message: string,
    options?: {
      data?: unknown;
      requestId?: string;
      requestName?: string;
      collectionId?: string;
      stackTrace?: string;
      scriptType?: string;
    }
  ): void {
    if (this.state.isPaused) return;

    const consoleMessage: ConsoleMessage = {
      id: this.generateMessageId(),
      timestamp: new Date(),
      level,
      source,
      message,
      ...options
    };

    this.state.messages.push(consoleMessage);

    // Auto-trim if exceeds max
    if (this.state.messages.length > this.state.maxMessages) {
      this.state.messages = this.state.messages.slice(-this.state.maxMessages);
    }

    this.emit('message', consoleMessage);
  }

  /**
   * Connect to fracture runner events
   */
  connectToRunner(runner: CollectionRunner): void {
    // Listen to fracture events and convert to console messages
    
    runner.on('console', (payload: EventPayloads['console']) => {
      this.addMessage(
        payload.level,
        'script',
        payload.message
      );
    });

    runner.on('beforeRequest', (payload: EventPayloads['beforeRequest']) => {
      this.addMessage(LogLevel.INFO, 'system', `Executing: ${payload.request.name}`, {
        requestId: payload.request.id,
        requestName: payload.request.name
      });
    });

    runner.on('afterRequest', (payload: EventPayloads['afterRequest']) => {
      const summary = payload.response.summary;
      const statusCode = summary.code ?? 'n/a';
      const statusLabel = summary.label ?? '';
      const status = `${String(statusCode)} ${statusLabel}`.trim();
      this.addMessage(
        LogLevel.INFO,
        'network',
        `${payload.request.name} to ${status} (${payload.duration}ms)`,
        {
          requestId: payload.request.id,
          requestName: payload.request.name,
          data: { status, duration: payload.duration }
        }
      );
    });

    runner.on('assertion', (payload: EventPayloads['assertion']) => {
      const passed = payload.test.passed === true;
      const error = payload.test.error;
      this.addMessage(
        passed ? LogLevel.TRACE : LogLevel.ERROR,
        'test',
        `${passed ? 'PASS' : 'FAIL'}: ${payload.test.name}${typeof error === 'string' && error.length > 0 ? `: ${error}` : ''}`,
        { data: { passed, error } }
      );
    });

    runner.on('exception', (payload: EventPayloads['exception']) => {
      this.addMessage(
        LogLevel.ERROR,
        'system',
        `Error in ${payload.phase}: ${payload.error.message}`,
        {
          requestId: payload.request?.id,
          requestName: payload.request?.name,
          stackTrace: payload.error.stack,
          data: payload.error
        }
      );
    });

    runner.on('beforePreScript', (payload: EventPayloads['beforePreScript']) => {
      this.addMessage(LogLevel.DEBUG, 'script', `Running pre-request script for ${payload.request.name}`, {
        requestId: payload.request.id,
        scriptType: 'pre-request'
      });
    });

    runner.on('beforePostScript', (payload: EventPayloads['beforePostScript']) => {
      this.addMessage(LogLevel.DEBUG, 'script', `Running post-request script for ${payload.request.name}`, {
        requestId: payload.request.id,
        scriptType: 'post-request'
      });
    });
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.state.messages = [];
    this.emit('cleared');
  }

  /**
   * Set filter
   */
  setFilter(filter: Partial<ConsoleFilter>): void {
    this.state.filter = { ...this.state.filter, ...filter };
    this.emit('filterChanged', this.state.filter);
  }

  /**
   * Get filtered messages
   */
  getMessages(): ConsoleMessage[] {
    return this.state.messages.filter(msg => {
      // Filter by level
      if (!this.state.filter.levels.includes(msg.level)) {
        return false;
      }

      // Filter by source
      if (!this.state.filter.sources.includes(msg.source)) {
        return false;
      }

      // Filter by search text
      const searchText = this.state.filter.searchText;
      if (typeof searchText === 'string' && searchText.length > 0) {
        const search = searchText.toLowerCase();
        if (!msg.message.toLowerCase().includes(search)) {
          return false;
        }
      }

      // Filter by request ID
      const requestIdFilter = this.state.filter.requestId;
      if (typeof requestIdFilter === 'string' && requestIdFilter.length > 0 && msg.requestId !== requestIdFilter) {
        return false;
      }

      return true;
    });
  }

  /**
   * Pause/resume message collection
   */
  setPaused(isPaused: boolean): void {
    this.state.isPaused = isPaused;
    this.emit('pauseChanged', isPaused);
  }

  /**
   * Get current state
   */
  getState(): ConsoleState {
    return { ...this.state };
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Singleton instance
export const consoleService = new ConsoleService();
