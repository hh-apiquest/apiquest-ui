import { LogLevel } from '@apiquest/types';

export function toConsoleLevel(level: unknown): LogLevel {
  if (typeof level === 'number') {
    if (
      level === LogLevel.ERROR ||
      level === LogLevel.WARN ||
      level === LogLevel.INFO ||
      level === LogLevel.DEBUG ||
      level === LogLevel.TRACE
    ) {
      return level;
    }
  }

  if (typeof level === 'string') {
    switch (level.toLowerCase()) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
      case 'warning':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      case 'trace':
      case 'log':
        return LogLevel.TRACE;
      default:
        return LogLevel.INFO;
    }
  }

  return LogLevel.INFO;
}

export function logLevelToLabel(level: LogLevel): string {
  switch (level) {
    case LogLevel.ERROR:
      return 'error';
    case LogLevel.WARN:
      return 'warn';
    case LogLevel.INFO:
      return 'info';
    case LogLevel.DEBUG:
      return 'debug';
    case LogLevel.TRACE:
      return 'trace';
    default:
      return 'info';
  }
}

export function logLevelToColor(level: LogLevel): string {
  switch (level) {
    case LogLevel.ERROR:
      return '#ef4444';
    case LogLevel.WARN:
      return '#f59e0b';
    case LogLevel.INFO:
      return '#3b82f6';
    case LogLevel.DEBUG:
      return '#10b981';
    case LogLevel.TRACE:
      return 'var(--gray-10)';
    default:
      return 'var(--gray-10)';
  }
}
