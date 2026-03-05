// Environment IPC handlers
import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import { workspaceRegistry } from './workspace.js';
import { secretVariableService } from '../SecretVariableService.js';

export function registerEnvironmentHandlers() {
  ipcMain.handle('environment:load', async (_event, workspaceId: string, fileName: string) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    const filePath = path.join(workspacePath, 'environments', `${fileName}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    const environment = JSON.parse(content);
    const environmentSecrets = await secretVariableService.getEnvironmentSecrets(workspaceId, fileName);
    environment.variables = secretVariableService.hydrateVariables(environment.variables, environmentSecrets);
    return environment;
  });

  ipcMain.handle('environment:save', async (_event, workspaceId: string, fileName: string, environment: any) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    const filePath = path.join(workspacePath, 'environments', `${fileName}.json`);
    const { sanitizedVariables, secrets } = secretVariableService.splitVariablesForSave(environment.variables);
    const environmentForFile = {
      ...environment,
      variables: sanitizedVariables
    };

    const content = JSON.stringify(environmentForFile, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
    await secretVariableService.setEnvironmentSecrets(workspaceId, fileName, secrets);
  });

  ipcMain.handle('environment:create', async (_event, workspaceId: string, name: string) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    const envFolder = path.join(workspacePath, 'environments');
    await fs.mkdir(envFolder, { recursive: true });
    
    const sanitizedName = name.trim().replace(/[^a-z0-9-_\s]/gi, '-');
    const fileName = `${sanitizedName}.json`;
    const filePath = path.join(envFolder, fileName);
    
    const envData = {
      name: name.trim(),
      variables: {}
    };
    
    const content = JSON.stringify(envData, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle('environment:rename', async (_event, workspaceId: string, oldFileName: string, newFileName: string) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    const oldFilePath = path.join(workspacePath, 'environments', `${oldFileName}.json`);
    const sanitizedName = newFileName.trim().replace(/[^a-z0-9-_\s]/gi, '-');
    const newFilePath = path.join(workspacePath, 'environments', `${sanitizedName}.json`);
    
    await fs.rename(oldFilePath, newFilePath);
    await secretVariableService.moveEnvironmentSecrets(workspaceId, oldFileName, sanitizedName);
  });

  ipcMain.handle('environment:delete', async (_event, workspaceId: string, fileName: string) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    const filePath = path.join(workspacePath, 'environments', `${fileName}.json`);
    await fs.unlink(filePath);
    await secretVariableService.deleteEnvironmentSecrets(workspaceId, fileName);
  });

  ipcMain.handle('environment:duplicate', async (_event, workspaceId: string, sourceFileName: string, newFileName: string) => {
    const workspacePath = workspaceRegistry.get(workspaceId);
    if (!workspacePath) throw new Error(`Workspace not found: ${workspaceId}`);
    
    const sourceFilePath = path.join(workspacePath, 'environments', `${sourceFileName}.json`);
    const content = await fs.readFile(sourceFilePath, 'utf-8');
    const data = JSON.parse(content);
    
    const sanitizedName = newFileName.trim().replace(/[^a-z0-9-_\s]/gi, '-');
    const newFilePath = path.join(workspacePath, 'environments', `${sanitizedName}.json`);
    
    const newContent = JSON.stringify(data, null, 2);
    await fs.writeFile(newFilePath, newContent, 'utf-8');
    await secretVariableService.copyEnvironmentSecrets(workspaceId, sourceFileName, sanitizedName);
  });
}
