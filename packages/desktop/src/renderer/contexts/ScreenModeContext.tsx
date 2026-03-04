// ScreenModeContext - Manages which full-screen mode is active (request-editor vs workspace-manager vs settings)
import { createContext, useContext, useState, ReactNode } from 'react';

export type ScreenMode = 'request-editor' | 'workspace-manager' | 'settings';
export type SettingsTab = 'general' | 'plugins' | 'tools' | 'appearance' | 'shortcuts';

type ScreenModeContextType = {
  mode: ScreenMode;
  settingsInitialTab: SettingsTab;
  setMode: (mode: ScreenMode, settingsTab?: SettingsTab) => void;
};

const ScreenModeContext = createContext<ScreenModeContextType | undefined>(undefined);

export function ScreenModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ScreenMode>('request-editor');
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('general');

  const setMode = (newMode: ScreenMode, settingsTab?: SettingsTab) => {
    if (newMode === 'settings' && settingsTab) {
      setSettingsInitialTab(settingsTab);
    }
    setModeState(newMode);
  };

  return (
    <ScreenModeContext.Provider value={{ mode, settingsInitialTab, setMode }}>
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
