// ConsoleService - Manages console messages from fracture events
// Layer: Services (NO React dependencies)

import type { 
  ConsoleMessage, 
  ConsoleFilter, 
  ConsoleState,
  ConsoleMessageLevel,
  ConsoleMessageSource 
} from '../types/console';
import { EventEmitter } from 'eventemitter3';

export class ConsoleService extends EventEmitter {
  private state: ConsoleState = {
    messages: [],
    filter: {
      levels: ['log', 'info', 'warn', 'error', 'debug'],
      sources: ['system', 'script', 'network', 'test']
    },
    maxMessages: 1000,
    isPaused: false
  };

  /**
   * Add a message to the console
   */
  addMessage(
    level: ConsoleMessageLevel,
    source: ConsoleMessageSource,
    message: string,
    options?: {
      data?: any;
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
  connectToRunner(runner: any): void {
    // Listen to fracture events and convert to console messages
    
    runner.on('console', ({ message, level }: { message: string; level: string }) => {
      this.addMessage(
        (level as ConsoleMessageLevel) || 'log',
        'script',
        message
      );
    });

    runner.on('beforeRequest', ({ request, path }: any) => {
      this.addMessage('info', 'system', `Executing: ${request.name}`, {
        requestId: request.id,
        requestName: request.name
      });
    });

    runner.on('afterRequest', ({ request, response, duration }: any) => {
      const status = response.status?.code || response.status;
      this.addMessage(
        'info',
        'network',
        `${request.name} to ${status} (${duration}ms)`,
        {
          requestId: request.id,
          requestName: request.name,
          data: { status, duration }
        }
      );
    });

    runner.on('assertion', ({ name, passed, error }: any) => {
      this.addMessage(
        passed ? 'log' : 'error',
        'test',
        `${passed ? 'PASS' : 'FAIL'}: ${name}${error ? `: ${error}` : ''}`,
        { data: { passed, error } }
      );
    });

    runner.on('exception', ({ error, phase, request }: any) => {
      this.addMessage(
        'error',
        'system',
        `Error in ${phase}: ${error.message}`,
        {
          requestId: request?.id,
          requestName: request?.name,
          stackTrace: error.stack,
          data: error
        }
      );
    });

    runner.on('beforePreScript', ({ request }: any) => {
      this.addMessage('debug', 'script', `Running pre-request script for ${request.name}`, {
        requestId: request.id,
        scriptType: 'pre-request'
      });
    });

    runner.on('beforePostScript', ({ request }: any) => {
      this.addMessage('debug', 'script', `Running post-request script for ${request.name}`, {
        requestId: request.id,
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
      if (this.state.filter.searchText) {
        const search = this.state.filter.searchText.toLowerCase();
        if (!msg.message.toLowerCase().includes(search)) {
          return false;
        }
      }

      // Filter by request ID
      if (this.state.filter.requestId && msg.requestId !== this.state.filter.requestId) {
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
