// Runner IPC handlers
import { ipcMain, BrowserWindow } from 'electron';
import { runnerService } from '../RunnerService.js';
import type { RunRequestParams } from '../../types/execution.js';
import type { RunCollectionParams } from '../../renderer/types/quest.js';

export function registerRunnerHandlers(mainWindow: BrowserWindow | null) {
  // Set main window for event streaming
  if (mainWindow) {
    runnerService.setMainWindow(mainWindow);
  }
  
  // Remove existing handlers to prevent duplicate registrations (e.g., during hot reload)
  ipcMain.removeHandler('runner:runCollection');
  ipcMain.removeHandler('runner:stopRun');
  ipcMain.removeHandler('runner:getStatus');
  ipcMain.removeHandler('runner:runRequest');
  
  // Run collection with specified configuration
  ipcMain.handle('runner:runCollection', async (event, params: RunCollectionParams) => {
    try {
      console.log('[Main] Running collection:', params.collectionId, 'runId:', params.runId);
      
      const result = await runnerService.executeCollection(params);
      
      console.log('[Main] Collection run started:', params.runId);
      return result;
    } catch (error: any) {
      console.error('[Main] Collection run error:', error);
      throw error;
    }
  });

  // Stop an active collection run
  ipcMain.handle('runner:stopRun', async (event, runId: string) => {
    try {
      console.log('[Main] Stopping run:', runId);
      
      const result = await runnerService.stopRun(runId);
      
      console.log('[Main] Run stopped:', runId);
      return result;
    } catch (error: any) {
      console.error('[Main] Stop run error:', error);
      throw error;
    }
  });

  // Get status of a collection run
  ipcMain.handle('runner:getStatus', async (event, runId: string) => {
    try {
      const status = await runnerService.getRunStatus(runId);
      return status;
    } catch (error: any) {
      console.error('[Main] Get status error:', error);
      throw error;
    }
  });

  ipcMain.handle('runner:runRequest', async (event, params: RunRequestParams) => {
    try {
      // executionId from UI
      console.log('[Main] Running request:', params.request.name, 'executionId:', params.executionId);
      
      const result = await runnerService.executeRequest(params);
      
      console.log('[Main] Request completed for execution:', params.executionId);
      return result;
    } catch (error: any) {
      console.error('[Main] Request execution error:', error);
      throw error;  // Let UI handle error display
    }
  });
}
