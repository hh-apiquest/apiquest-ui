// Console/Debug Panel types

export type ConsoleMessageLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
export type ConsoleMessageSource = 'system' | 'script' | 'network' | 'test';

/**
 * Console Message
 */
export interface ConsoleMessage {
  id: string;
  timestamp: Date;
  level: ConsoleMessageLevel;
  source: ConsoleMessageSource;
  message: string;
  data?: any;
  
  // Context
  requestId?: string;
  requestName?: string;
  collectionId?: string;
  
  // Metadata
  stackTrace?: string;
  scriptType?: string;  // 'pre-request', 'post-request', etc.
}

/**
 * Console Filter
 */
export interface ConsoleFilter {
  levels: ConsoleMessageLevel[];
  sources: ConsoleMessageSource[];
  searchText?: string;
  requestId?: string;
}

/**
 * Console State
 */
export interface ConsoleState {
  messages: ConsoleMessage[];
  filter: ConsoleFilter;
  maxMessages: number;  // Auto-clear old messages
  isPaused: boolean;    // Pause message collection
}
