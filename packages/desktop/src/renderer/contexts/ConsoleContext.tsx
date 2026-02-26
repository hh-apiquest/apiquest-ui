// ConsoleContext - Manages console messages
// Layer: Contexts (React layer, wraps ConsoleService)

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { ConsoleMessage, ConsoleFilter, ConsoleState } from '../types/console';
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

export function ConsoleProvider({ children }: ConsoleProviderProps) {
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [filter, setFilterState] = useState<ConsoleFilter>(
    consoleService.getState().filter
  );
  const [isPaused, setIsPausedState] = useState(false);

  // Subscribe to console service events
  useEffect(() => {
    const handleMessage = (msg: ConsoleMessage) => {
      setMessages(consoleService.getMessages());
    };

    const handleCleared = () => {
      setMessages([]);
    };

    const handleFilterChanged = (newFilter: ConsoleFilter) => {
      setFilterState(newFilter);
      setMessages(consoleService.getMessages()); // Re-filter
    };

    const handlePauseChanged = (paused: boolean) => {
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

  const clear = () => {
    consoleService.clear();
  };

  const setFilter = (newFilter: Partial<ConsoleFilter>) => {
    consoleService.setFilter(newFilter);
  };

  const setPaused = (paused: boolean) => {
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

export function useConsole() {
  const context = useContext(ConsoleContext);
  if (!context) {
    throw new Error('useConsole must be used within ConsoleProvider');
  }
  return context;
}
