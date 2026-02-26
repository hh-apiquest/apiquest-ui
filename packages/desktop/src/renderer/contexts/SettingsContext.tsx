// SettingsContext - Provides app-wide access to settings.json
// Layer: Contexts (React layer)

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { settingsService, type AppSettings } from '../services/SettingsService';

interface SettingsContextValue {
  settings: AppSettings | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  update: (partial: AppSettings) => Promise<void>;
  set: (path: string, value: any) => Promise<void>;
  get: <T = any>(path: string) => T | undefined;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const s = await settingsService.getAll();
      setSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const update = async (partial: AppSettings) => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await settingsService.update(partial);
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const set = async (path: string, value: any) => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await settingsService.set(path, value);
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const get = useMemo(() => {
    return <T = any,>(pathStr: string): T | undefined => {
      if (!settings) return undefined;
      const parts = pathStr.split('.').filter(Boolean);
      let cur: any = settings;
      for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
      }
      return cur as T;
    };
  }, [settings]);

  useEffect(() => {
    refresh();
  }, []);

  const value: SettingsContextValue = {
    settings,
    isLoading,
    error,
    refresh,
    update,
    set,
    get
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
