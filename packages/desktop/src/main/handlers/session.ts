// Session IPC handlers
import { ipcMain } from 'electron';
import { sessionService } from '../SessionService.js';
import { workspaceRegistry } from './workspace.js';

export function registerSessionHandlers() {
  ipcMain.handle('session:get', async (_event, workspaceId: string) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    return await sessionService.getSession(workspacePath);
  });

  ipcMain.handle('session:save', async (_event, workspaceId: string, session: any) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    await sessionService.saveSession(workspacePath, session);
  });

  ipcMain.handle('session:update', async (_event, workspaceId: string, updates: any) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    await sessionService.updateSession(workspacePath, updates);
  });
}
