// NetworkContext - Manages network history
// Layer: Contexts (React layer, wraps NetworkService)

import React, { createContext, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { NetworkEntry } from '../types/network';
import { networkService } from '../services/NetworkService';

interface NetworkContextValue {
  entries: NetworkEntry[];
  clear: () => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

interface NetworkProviderProps {
  children: ReactNode;
}

export function NetworkProvider({ children }: NetworkProviderProps): ReactElement {
  const [entries, setEntries] = useState<NetworkEntry[]>(networkService.getEntries());
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);

  useEffect((): (() => void) => {
    const handleUpdated = (updatedEntries: NetworkEntry[]): void => {
      setEntries(updatedEntries);
    };

    const handleCleared = (): void => {
      setEntries([]);
    };

    networkService.on('updated', handleUpdated);
    networkService.on('cleared', handleCleared);

    unsubscribeRef.current ??= networkService.connectToExecutionStream(
        window.quest.runner.onExecutionEvent
      );

    return () => {
      networkService.off('updated', handleUpdated);
      networkService.off('cleared', handleCleared);
    };
  }, []);

  const clear = (): void => {
    networkService.clear();
  };

  return (
    <NetworkContext.Provider value={{ entries, clear }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  const context = useContext(NetworkContext);
  if (context === null) {
    throw new Error('useNetwork must be used within NetworkProvider');
  }
  return context;
}
