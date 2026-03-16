// Window control IPC handlers
import { ipcMain, BrowserWindow } from 'electron';

export function registerWindowHandlers(mainWindow: BrowserWindow | null): void {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    const isMaximized = mainWindow?.isMaximized() === true;
    if (isMaximized) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false;
  });
}
