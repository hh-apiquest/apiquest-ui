// SettingsService (renderer) - typed wrapper around main-process settings.json via preload IPC
// Layer: Services (NO React dependencies)

import type { AppSettings } from '../../main/SettingsService.js';

// Re-export for convenience
export type {  AppSettings };

export class SettingsService {
  async getAll(): Promise<AppSettings> {
    return await window.quest.settings.getAll();
  }

  async get<T = any>(path: string): Promise<T> {
    return await window.quest.settings.get(path);
  }

  async update(partial: AppSettings): Promise<AppSettings> {
    return await window.quest.settings.update(partial);
  }

  async set(path: string, value: any): Promise<AppSettings> {
    return await window.quest.settings.set(path, value);
  }
}

export const settingsService = new SettingsService();
