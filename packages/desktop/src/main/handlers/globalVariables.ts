// Global Variables IPC handlers
import { ipcMain, app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import type { VariableValue } from '@apiquest/types';

type GlobalVariablesData = Record<string, VariableValue>;

function isNodeErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export function registerGlobalVariablesHandlers(): void {
  ipcMain.handle('globalVariables:load', async () => {
    const userDataPath = app.getPath('userData');
    const globalVarsPath = path.join(userDataPath, 'global-variables.json');
    
    try {
      const content = await fs.readFile(globalVarsPath, 'utf-8');
      return JSON.parse(content) as GlobalVariablesData;
    } catch (error: unknown) {
      if (isNodeErrorWithCode(error) && error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  });

  ipcMain.handle('globalVariables:save', async (_event, variables: GlobalVariablesData) => {
    const userDataPath = app.getPath('userData');
    const globalVarsPath = path.join(userDataPath, 'global-variables.json');
    
    const content = JSON.stringify(variables, null, 2);
    await fs.writeFile(globalVarsPath, content, 'utf-8');
  });
}
