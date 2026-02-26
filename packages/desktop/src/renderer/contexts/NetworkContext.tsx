// NetworkContext - Manages network history
// Layer: Contexts (React layer, wraps NetworkService)

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
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

export function NetworkProvider({ children }: NetworkProviderProps) {
  const [entries, setEntries] = useState<NetworkEntry[]>(networkService.getEntries());
  const unsubscribeRef = useRef<() => void>();

  useEffect(() => {
    const handleUpdated = (updatedEntries: NetworkEntry[]) => {
      setEntries(updatedEntries);
    };

    const handleCleared = () => {
      setEntries([]);
    };

    networkService.on('updated', handleUpdated);
    networkService.on('cleared', handleCleared);

    if (!unsubscribeRef.current) {
      unsubscribeRef.current = networkService.connectToExecutionStream(
        window.quest.runner.onExecutionEvent
      );
    }

    return () => {
      networkService.off('updated', handleUpdated);
      networkService.off('cleared', handleCleared);
    };
  }, []);

  const clear = () => {
    networkService.clear();
  };

  return (
    <NetworkContext.Provider value={{ entries, clear }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within NetworkProvider');
  }
  return context;
}
