// Context layer exports
// All contexts are React providers with hooks

export { ThemeProvider, useTheme } from './ThemeContext';
export { SettingsProvider, useSettings } from './SettingsContext';
export { WorkspaceProvider, useWorkspace } from './WorkspaceContext';
export { ConsoleProvider, useConsole } from './ConsoleContext';
export { NetworkProvider, useNetwork } from './NetworkContext';
export { TrashProvider, useTrash } from './TrashContext';
export { TabProvider, useTabNavigation, useTabStatusState, useTabStatusActions, useTabEditorBridge } from './TabContext';
export { ScreenModeProvider, useScreenMode } from './ScreenModeContext';
export type { ScreenMode } from './ScreenModeContext';

// Combined provider for easy app wrapping
import React, { ReactNode } from 'react';
import { ThemeProvider } from './ThemeContext';
import { SettingsProvider } from './SettingsContext';
import { WorkspaceProvider } from './WorkspaceContext';
import { ConsoleProvider } from './ConsoleContext';
import { NetworkProvider } from './NetworkContext';
import { TrashProvider } from './TrashContext';
import { TabProvider } from './TabContext';
import { ScreenModeProvider } from './ScreenModeContext';
import { SessionSync } from './SessionSync';

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Combines all context providers in the correct order
 * Wrap your App component with this
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <ScreenModeProvider>
          <WorkspaceProvider>
              <TabProvider>
                <SessionSync />
                <ConsoleProvider>
                  <NetworkProvider>
                    <TrashProvider>
                      {children}
                    </TrashProvider>
                  </NetworkProvider>
                </ConsoleProvider>
              </TabProvider>
          </WorkspaceProvider>
        </ScreenModeProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
