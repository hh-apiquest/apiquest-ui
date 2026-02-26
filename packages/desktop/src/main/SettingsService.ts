import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

export type AppSettings = {
  ui?: {
    workspaceDropdownLimit?: number;
  };
  workspace?: {
    rootPath?: string;
    externalPaths?: string[];
    lastActivePath?: string;
  };
  plugins?: Array<{ name: string; enabled: boolean }>;
};

const DEFAULT_SETTINGS: Required<AppSettings> = {
  ui: {
    workspaceDropdownLimit: 20
  },
  workspace: {
    rootPath: '',
    externalPaths: [],
    lastActivePath: ''
  },
  plugins: []
};

function deepMerge<T>(base: T, partial: Partial<T>): T {
  if (partial === null || partial === undefined) return base;
  if (typeof partial !== 'object') return partial as T;
  if (Array.isArray(partial)) return partial as T;

  const result: any = { ...(base as any) };
  for (const [key, value] of Object.entries(partial as any)) {
    const baseValue = (base as any)[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(baseValue ?? {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
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
    if (!merged.workspace) merged.workspace = {};
    if (!merged.workspace.rootPath || merged.workspace.rootPath.trim() === '') {
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

  async get(pathStr: string): Promise<any> {
    const settings = await this.getAll();
    return getByPath(settings, pathStr);
  }

  async set(pathStr: string, value: any): Promise<AppSettings> {
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

function getByPath(obj: any, pathStr: string): any {
  if (!pathStr) return obj;
  const parts = pathStr.split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setByPath<T extends object>(obj: T, pathStr: string, value: any): T {
  const parts = pathStr.split('.').filter(Boolean);
  if (parts.length === 0) return obj;

  const clone: any = Array.isArray(obj) ? [...(obj as any)] : { ...(obj as any) };
  let cur: any = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextVal = cur[key];
    cur[key] = nextVal && typeof nextVal === 'object' && !Array.isArray(nextVal) ? { ...nextVal } : {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
  return clone;
}

export const settingsService = new SettingsService();
