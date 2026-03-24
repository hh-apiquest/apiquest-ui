import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

export type SecretPrimitive = string | number | boolean | null;

export type WorkspaceSecrets = {
  collections?: Record<string, Record<string, SecretPrimitive>>;
  environments?: Record<string, Record<string, SecretPrimitive>>;
};

export type SecretsSettings = {
  workspaces?: Record<string, WorkspaceSecrets>;
};

export type AppSettings = {
  ui?: {
    workspaceDropdownLimit?: number;
  };
  workspace?: {
    rootPath?: string;
    externalPaths?: string[];
    lastActivePath?: string;
  };
  plugins?: Array<{
    name: string;
    enabled: boolean;
    /**
     * Optional plugin-specific persisted settings.
     * Used by desktop plugins (including importer plugins) for custom settings sections.
     */
    settings?: Record<string, unknown>;
  }>;
  tools?: {
    /**
     * Optional absolute path to an npm CLI binary.
     * When set, overrides the bundled npm. Useful only in rare environments where
     * the bundled npm cannot run (e.g., very restrictive app sandboxing).
     * Leave empty to use the bundled npm (recommended).
     */
    npmPath?: string;
    /**
     * Optional absolute path to the git binary.
     * When empty, the app will attempt to find git on the system PATH.
     * Useful when git is installed in a non-standard location.
     */
    gitPath?: string;
  };
  ai?: {
    enabled?: boolean;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
  };
  secrets?: SecretsSettings;
};

export type ThemeSetting = 'light' | 'dark' | 'system';

const DEFAULT_SETTINGS: Required<AppSettings> = {
  ui: {
    workspaceDropdownLimit: 20
  },
  workspace: {
    rootPath: '',
    externalPaths: [],
    lastActivePath: ''
  },
  plugins: [],
  tools: {
    npmPath: '',
    gitPath: ''
  },
  ai: {
    enabled: false,
    baseUrl: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    timeoutMs: 30000
  },
  secrets: {
    workspaces: {}
  }
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, partial: Partial<T>): T {
  if (partial === null || partial === undefined) {
    return base;
  }

  if (!isObjectRecord(base) || !isObjectRecord(partial)) {
    return partial as T;
  }

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(partial)) {
    const baseValue = base[key];
    if (isObjectRecord(value)) {
      const mergeBase = isObjectRecord(baseValue) ? baseValue : {};
      result[key] = deepMerge(mergeBase, value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

export class SettingsService {
  private readonly settingsPath: string;

  constructor() {
    const userData = app.getPath('userData');
    this.settingsPath = path.join(userData, 'settings.json');
  }

  async getAll(): Promise<AppSettings> {
    const stored = await this.readSettingsFile();
    const merged = deepMerge(DEFAULT_SETTINGS, stored);

    // Compute default workspace root lazily (needs app.getPath('userData') which is OS-dictated)
    if ((merged.workspace.rootPath ?? '').trim() === '') {
      merged.workspace.rootPath = path.join(app.getPath('userData'), 'workspaces');
    }

    // Normalize arrays
    merged.workspace.externalPaths = Array.isArray(merged.workspace.externalPaths)
      ? merged.workspace.externalPaths
      : [];

    return merged;
  }

  async update(partial: AppSettings): Promise<AppSettings> {
    const current = await this.getAll();
    const next = deepMerge(current, partial);
    await this.writeSettingsFile(next);
    return next;
  }

  async getTheme(): Promise<ThemeSetting | undefined> {
    return await this.get('ui.theme') as ThemeSetting | undefined;
  }

  async setTheme(theme: ThemeSetting): Promise<AppSettings> {
    return await this.set('ui.theme', theme);
  }

  async getWorkspaceSecrets(workspaceId: string): Promise<WorkspaceSecrets | undefined> {
    return await this.get(`secrets.workspaces.${workspaceId}`) as WorkspaceSecrets | undefined;
  }

  async setWorkspaceSecrets(workspaceId: string, secrets: WorkspaceSecrets): Promise<AppSettings> {
    return await this.set(`secrets.workspaces.${workspaceId}`, secrets);
  }

  async get(pathStr: string): Promise<unknown> {
    const settings = await this.getAll();
    return getByPath(settings, pathStr);
  }

  async set(pathStr: string, value: unknown): Promise<AppSettings> {
    const current = await this.getAll();
    const next = setByPath(current, pathStr, value);
    await this.writeSettingsFile(next);
    return next;
  }

  private async readSettingsFile(): Promise<AppSettings> {
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf-8');
      return JSON.parse(raw) as AppSettings;
    } catch {
      return {};
    }
  }

  private async writeSettingsFile(settings: AppSettings): Promise<void> {
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  }
}

function getByPath(obj: AppSettings, pathStr: string): unknown {
  if (pathStr === '') {
    return obj;
  }

  const parts = pathStr.split('.').filter(Boolean);
  let current: unknown = obj;

  for (const p of parts) {
    if (!isObjectRecord(current)) {
      return undefined;
    }

    current = current[p];
  }

  return current;
}

function setByPath<T extends object>(obj: T, pathStr: string, value: unknown): T {
  const parts = pathStr.split('.').filter(Boolean);
  if (parts.length === 0) {
    return obj;
  }

  const clone: Record<string, unknown> = isObjectRecord(obj) ? { ...obj } : {};
  let current: Record<string, unknown> = clone;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextValue = current[key];
    const nextRecord = isObjectRecord(nextValue) ? { ...nextValue } : {};
    current[key] = nextRecord;
    current = nextRecord;
  }

  current[parts[parts.length - 1]] = value;
  return clone as T;
}

export const settingsService = new SettingsService();
