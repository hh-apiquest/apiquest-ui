// ThemeContext - Manages theme (light/dark/system)
// Layer: Contexts (React layer, wraps no service - just state)

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Theme } from '../types/ui';
import { pluginLoader } from '../services/PluginLoaderService';

interface ThemeContextValue {
  theme: Theme;
  actualTheme: 'light' | 'dark';  // Resolved theme (if system, returns actual)
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light');
  const [isInitialized, setIsInitialized] = useState(false);

  // Load saved theme on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await window.quest.settings.get('ui.theme');
        if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme as string)) {
          setThemeState(savedTheme as Theme);
        }
      } catch (error) {
        console.error('Failed to load theme from settings:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    loadTheme();
  }, []);

  // Listen to system theme changes
  useEffect(() => {
    if (!isInitialized) return;

    if (theme !== 'system') {
      setActualTheme(theme);
      return;
    }

    // Check system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setActualTheme(e.matches ? 'dark' : 'light');
    };

    // Initial check
    handleChange(mediaQuery);

    // Listen for changes
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, isInitialized]);

  // Apply theme to document and Monaco Editor
  useEffect(() => {
    if (!isInitialized) return;
    
    document.documentElement.setAttribute('data-theme', actualTheme);
    document.documentElement.classList.toggle('dark', actualTheme === 'dark');
    
    // Update Monaco Editor theme in plugin loader
    pluginLoader.setTheme(actualTheme);
  }, [actualTheme, isInitialized]);

  // Persist theme preference to settings
  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      await window.quest.settings.set('ui.theme', newTheme);
    } catch (error) {
      console.error('Failed to save theme to settings:', error);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, actualTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
