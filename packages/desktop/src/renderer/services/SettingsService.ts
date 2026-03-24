// SettingsService (renderer) - typed wrapper around main-process settings.json via preload IPC
// Layer: Services (NO React dependencies)

import type { AppSettings, ThemeSetting, WorkspaceSecrets } from '../../main/SettingsService.js';

// Re-export for convenience
export type {  AppSettings };

export class SettingsService {
  async getAll(): Promise<AppSettings> {
    return await window.quest.settings.getAll();
  }

  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    return await window.quest.settings.update(partial);
  }

  async getTheme(): Promise<ThemeSetting | undefined> {
    return await window.quest.settings.getTheme();
  }

  async setTheme(theme: ThemeSetting): Promise<AppSettings> {
    return await window.quest.settings.setTheme(theme);
  }

  async getWorkspaceSecrets(workspaceId: string): Promise<WorkspaceSecrets | undefined> {
    return await window.quest.settings.getWorkspaceSecrets(workspaceId);
  }

  async setWorkspaceSecrets(workspaceId: string, secrets: WorkspaceSecrets): Promise<AppSettings> {
    return await window.quest.settings.setWorkspaceSecrets(workspaceId, secrets);
  }
}

export const settingsService = new SettingsService();
