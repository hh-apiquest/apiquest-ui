// ScreenModeContext - Manages which full-screen mode is active (request-editor vs workspace-manager vs settings)
import { createContext, useContext, useState, ReactNode } from 'react';

export type ScreenMode = 'request-editor' | 'workspace-manager' | 'settings';

type ScreenModeContextType = {
  mode: ScreenMode;
  setMode: (mode: ScreenMode) => void;
};

const ScreenModeContext = createContext<ScreenModeContextType | undefined>(undefined);

export function ScreenModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ScreenMode>('request-editor');

  return (
    <ScreenModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ScreenModeContext.Provider>
  );
}

export function useScreenMode() {
  const context = useContext(ScreenModeContext);
  if (!context) {
    throw new Error('useScreenMode must be used within ScreenModeProvider');
  }
  return context;
}
