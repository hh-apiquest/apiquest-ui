import { app, BrowserWindow, protocol, type BrowserWindowConstructorOptions } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { workspaceManager } from './WorkspaceManager.js';
import { sessionService } from './SessionService.js';
import { registerWorkspaceHandlers } from './handlers/workspace.js';
import { registerCollectionHandlers } from './handlers/collection.js';
import { registerEnvironmentHandlers } from './handlers/environment.js';
import { registerSessionHandlers } from './handlers/session.js';
import { registerSettingsHandlers } from './handlers/settings.js';
import { registerGlobalVariablesHandlers } from './handlers/globalVariables.js';
import { registerRunnerHandlers } from './handlers/runner.js';
import { registerWindowHandlers } from './handlers/window.js';
import { registerPluginsHandlers } from './handlers/plugins.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ID = 'com.apiquest.desktop';
const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

let mainWindow: BrowserWindow | null = null;

function getDevWindowIconPath(): string | null {
  if (app.isPackaged) return null;
  const buildDir = path.join(app.getAppPath(), 'build');
  if (IS_WINDOWS) return path.join(buildDir, 'icon.ico');
  if (IS_LINUX) return path.join(buildDir, 'icons', '512x512.png');
  return null;
}

function registerDevtoolsHotkey(window: BrowserWindow) {
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      event.preventDefault();
      window.webContents.toggleDevTools();
    }
  });
}

function createWindow() {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js')
    }
  };

  const devIconPath = getDevWindowIconPath();
  if (devIconPath) {
    windowOptions.icon = devIconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Load renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// Register all IPC handlers
function registerHandlers() {
  registerWorkspaceHandlers();
  registerCollectionHandlers();
  registerEnvironmentHandlers();
  registerSessionHandlers();
  registerSettingsHandlers();
  registerGlobalVariablesHandlers();
  registerRunnerHandlers(mainWindow);
  registerWindowHandlers(mainWindow);
  registerPluginsHandlers();
}

// IMPORTANT: Register custom protocol schemes BEFORE app.whenReady()
// This enables the plugin:// and vendor:// protocols to load modules dynamically
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'plugin',
    privileges: {
      standard: true,
      supportFetchAPI: true,
      bypassCSP: false,
      corsEnabled: true,
      stream: true
    }
  },
  {
    scheme: 'vendor',
    privileges: {
      standard: true,
      supportFetchAPI: true,
      bypassCSP: false,
      corsEnabled: true,
      stream: true
    }
  }
]);

// App lifecycle
app.whenReady().then(async () => {
  // Initialize services
  await workspaceManager.initialize();
  await sessionService.initialize();
  
  // Create window first
  createWindow();
  if (mainWindow) {
    registerDevtoolsHotkey(mainWindow);
  }
  
  // Register IPC handlers after window is created
  registerHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
