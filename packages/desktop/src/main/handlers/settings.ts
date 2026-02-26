// Settings IPC handlers
import { ipcMain } from 'electron';
import { settingsService } from '../SettingsService.js';

export function registerSettingsHandlers() {
  ipcMain.handle('settings:getAll', async () => {
    return await settingsService.getAll();
  });

  ipcMain.handle('settings:update', async (_event, partial: any) => {
    return await settingsService.update(partial);
  });

  ipcMain.handle('settings:get', async (_event, pathStr: string) => {
    return await settingsService.get(pathStr);
  });

  ipcMain.handle('settings:set', async (_event, pathStr: string, value: any) => {
    return await settingsService.set(pathStr, value);
  });
}
