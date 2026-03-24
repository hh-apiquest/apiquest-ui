// Settings IPC handlers
import { ipcMain } from 'electron';
import { settingsService, type AppSettings, type ThemeSetting, type WorkspaceSecrets } from '../SettingsService.js';

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getAll', async () => {
    return await settingsService.getAll();
  });

  ipcMain.handle('settings:update', async (_event, partial: Partial<AppSettings>) => {
    return await settingsService.update(partial);
  });

  ipcMain.handle('settings:getTheme', async () => {
    return await settingsService.getTheme();
  });

  ipcMain.handle('settings:setTheme', async (_event, theme: ThemeSetting) => {
    return await settingsService.setTheme(theme);
  });

  ipcMain.handle('settings:getWorkspaceSecrets', async (_event, workspaceId: string) => {
    return await settingsService.getWorkspaceSecrets(workspaceId);
  });

  ipcMain.handle('settings:setWorkspaceSecrets', async (_event, workspaceId: string, secrets: WorkspaceSecrets) => {
    return await settingsService.setWorkspaceSecrets(workspaceId, secrets);
  });
}
