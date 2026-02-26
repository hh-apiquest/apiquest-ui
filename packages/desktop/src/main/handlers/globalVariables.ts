// Global Variables IPC handlers
import { ipcMain, app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

export function registerGlobalVariablesHandlers() {
  ipcMain.handle('globalVariables:load', async () => {
    const userDataPath = app.getPath('userData');
    const globalVarsPath = path.join(userDataPath, 'global-variables.json');
    
    try {
      const content = await fs.readFile(globalVarsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  });

  ipcMain.handle('globalVariables:save', async (_event, variables: any) => {
    const userDataPath = app.getPath('userData');
    const globalVarsPath = path.join(userDataPath, 'global-variables.json');
    
    const content = JSON.stringify(variables, null, 2);
    await fs.writeFile(globalVarsPath, content, 'utf-8');
  });
}
