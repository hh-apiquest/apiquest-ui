// SettingsContext - Provides app-wide access to settings.json
// Layer: Contexts (React layer)

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { settingsService, type AppSettings } from '../services/SettingsService';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setValueByPath(settings: AppSettings, path: string, value: unknown): AppSettings {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) {
    return settings;
  }

  const clone: Record<string, unknown> = { ...settings };
  let current: Record<string, unknown> = clone;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const nextValue = current[key];
    const nextRecord = isObjectRecord(nextValue) ? { ...nextValue } : {};
    current[key] = nextRecord;
    current = nextRecord;
  }

  current[parts[parts.length - 1]] = value;
  return clone as AppSettings;
}

interface SettingsContextValue {
  settings: AppSettings | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  update: (partial: Partial<AppSettings>) => Promise<void>;
  set: (path: string, value: unknown) => Promise<void>;
  get: <T>(path: string) => T | undefined;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
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

  const update = async (partial: Partial<AppSettings>): Promise<void> => {
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

  const set = async (path: string, value: unknown): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      if (settings === null) {
        return;
      }

      const next = await settingsService.update(setValueByPath(settings, path, value));
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const get = useMemo(() => {
    return <T,>(pathStr: string): T | undefined => {
      if (settings === null) {
        return undefined;
      }

      const parts = pathStr.split('.').filter(Boolean);
      let current: unknown = settings;
      for (const p of parts) {
        if (!isObjectRecord(current)) {
          return undefined;
        }

        current = current[p];
      }

      return current as T;
    };
  }, [settings]);

  useEffect((): void => {
    void refresh();
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

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (ctx === null) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
}
