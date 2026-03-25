// ConsoleContext - Manages console messages
// Layer: Contexts (React layer, wraps ConsoleService)

import React, { createContext, useContext, useState, useEffect, type ReactElement, type ReactNode } from 'react';
import type { ConsoleMessage, ConsoleFilter } from '../types/console';
import { consoleService } from '../services';

interface ConsoleContextValue {
  messages: ConsoleMessage[];
  filter: ConsoleFilter;
  isPaused: boolean;
  
  // Actions
  clear: () => void;
  setFilter: (filter: Partial<ConsoleFilter>) => void;
  setPaused: (isPaused: boolean) => void;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

interface ConsoleProviderProps {
  children: ReactNode;
}

export function ConsoleProvider({ children }: ConsoleProviderProps): ReactElement {
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [filter, setFilterState] = useState<ConsoleFilter>(
    consoleService.getState().filter
  );
  const [isPaused, setIsPausedState] = useState(false);

  // Subscribe to console service events
  useEffect((): (() => void) => {
    const handleMessage = (_msg: ConsoleMessage): void => {
      setMessages(consoleService.getMessages());
    };

    const handleCleared = (): void => {
      setMessages([]);
    };

    const handleFilterChanged = (newFilter: ConsoleFilter): void => {
      setFilterState(newFilter);
      setMessages(consoleService.getMessages()); // Re-filter
    };

    const handlePauseChanged = (paused: boolean): void => {
      setIsPausedState(paused);
    };

    consoleService.on('message', handleMessage);
    consoleService.on('cleared', handleCleared);
    consoleService.on('filterChanged', handleFilterChanged);
    consoleService.on('pauseChanged', handlePauseChanged);

    // Initial load
    setMessages(consoleService.getMessages());

    return () => {
      consoleService.off('message', handleMessage);
      consoleService.off('cleared', handleCleared);
      consoleService.off('filterChanged', handleFilterChanged);
      consoleService.off('pauseChanged', handlePauseChanged);
    };
  }, []);

  const clear = (): void => {
    consoleService.clear();
  };

  const setFilter = (newFilter: Partial<ConsoleFilter>): void => {
    consoleService.setFilter(newFilter);
  };

  const setPaused = (paused: boolean): void => {
    consoleService.setPaused(paused);
  };

  return (
    <ConsoleContext.Provider
      value={{
        messages,
        filter,
        isPaused,
        clear,
        setFilter,
        setPaused
      }}
    >
      {children}
    </ConsoleContext.Provider>
  );
}

export function useConsole(): ConsoleContextValue {
  const context = useContext(ConsoleContext);
  if (context === null) {
    throw new Error('useConsole must be used within ConsoleProvider');
  }
  return context;
}
