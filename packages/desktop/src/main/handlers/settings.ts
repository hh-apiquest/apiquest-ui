// Settings IPC handlers
import { ipcMain } from 'electron';
import { settingsService, type AppSettings } from '../SettingsService.js';

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getAll', async () => {
    return await settingsService.getAll();
  });

  ipcMain.handle('settings:update', async (_event, partial: AppSettings) => {
    return await settingsService.update(partial);
  });

  ipcMain.handle('settings:get', async (_event, pathStr: string) => {
    return (await settingsService.get(pathStr)) as unknown;
  });

  ipcMain.handle('settings:set', async (_event, pathStr: string, value: unknown) => {
    return await settingsService.set(pathStr, value);
  });
}
