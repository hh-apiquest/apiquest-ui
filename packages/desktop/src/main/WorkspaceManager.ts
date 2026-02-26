// WorkspaceManager - Handles app data folder and workspace initialization
import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export type WorkspaceMetadata = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
};

export class WorkspaceManager {
  private appDataPath: string;
  private workspacesPath: string;

  constructor() {
    // Cross-platform app data: %APPDATA%/ApiQuest (Windows), ~/Library/Application Support/ApiQuest (macOS), ~/.config/ApiQuest (Linux)
    this.appDataPath = app.getPath('userData');
    this.workspacesPath = path.join(this.appDataPath, 'workspaces');
  }

  /**
   * Initialize app data structure
   */
  async initialize(): Promise<void> {
    await this.ensureDirectories();
    await this.ensureDefaultWorkspace();
  }

  /**
   * Ensure app data directories exist
   */
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.appDataPath, { recursive: true });
    await fs.mkdir(this.workspacesPath, { recursive: true });
  }

  /**
   * Create or ensure default workspace exists
   */
  private async ensureDefaultWorkspace(): Promise<void> {
    const defaultWorkspacePath = path.join(this.workspacesPath, 'My Workspace');
    
    // Check if already exists
    try {
      await fs.access(defaultWorkspacePath);
      return; // Already exists
    } catch {
      // Doesn't exist, create it
    }

    await this.createWorkspace(defaultWorkspacePath, 'My Workspace');
  }

  /**
   * Create a new workspace with proper structure
   */
  async createWorkspace(workspacePath: string, name: string): Promise<void> {
    // Create directories
    await fs.mkdir(workspacePath, { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'collections'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'environments'), { recursive: true });

    // Create workspace metadata
    const metadata: WorkspaceMetadata = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString()
    };

    await fs.writeFile(
      path.join(workspacePath, 'workspace.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );

    // Create example collection
    const exampleCollection = {
      info: {
        name: 'Example Collection',
        description: 'A sample collection to get you started',
        schema: 'https://apiquest.dev/schema/v1.0.0'
      },
      items: [
        {
          id: 'example-request',
          name: 'Example GET Request',
          protocol: 'http',
          request: {
            method: 'GET',
            url: 'https://jsonplaceholder.typicode.com/users/1',
            headers: {}
          },
          tests: [
            {
              name: 'Status is 200',
              script: 'quest.test(\'Status is 200\', () => { quest.expect(quest.response.status.code).to.equal(200); });'
            }
          ]
        }
      ]
    };

    await fs.writeFile(
      path.join(workspacePath, 'collections', 'Example.apiquest.json'),
      JSON.stringify(exampleCollection, null, 2),
      'utf-8'
    );

    // Create example environments
    const devEnv = {
      name: 'Development',
      values: [
        { key: 'baseUrl', value: 'http://localhost:3000', enabled: true },
        { key: 'apiKey', value: 'dev-key-123', enabled: true }
      ]
    };

    const prodEnv = {
      name: 'Production',
      values: [
        { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
        { key: 'apiKey', value: '', enabled: true }
      ]
    };

    await fs.writeFile(
      path.join(workspacePath, 'environments', 'Development.json'),
      JSON.stringify(devEnv, null, 2),
      'utf-8'
    );

    await fs.writeFile(
      path.join(workspacePath, 'environments', 'Production.json'),
      JSON.stringify(prodEnv, null, 2),
      'utf-8'
    );

    // Create .gitignore
    const gitignore = `# ApiQuest Workspace
# Ignore sensitive data
*.secret.json
.env

# Ignore temp files
.DS_Store
Thumbs.db
`;

    await fs.writeFile(
      path.join(workspacePath, '.gitignore'),
      gitignore,
      'utf-8'
    );

    // Create README
    const readme = `# ${name}

This is an ApiQuest workspace.

## Structure

- \`collections/\` - Your API collections (.apiquest.json files)
- \`environments/\` - Environment variables (.json files)

## Getting Started

1. Open this folder in ApiQuest Desktop
2. Explore the Example Collection
3. Create new requests or import from Postman/Bruno
`;

    await fs.writeFile(
      path.join(workspacePath, 'README.md'),
      readme,
      'utf-8'
    );
  }

  /**
   * Get path to default workspace
   */
  getDefaultWorkspacePath(): string {
    return path.join(this.workspacesPath, 'My Workspace');
  }

  /**
   * Get path to workspaces root
   */
  getWorkspacesRootPath(): string {
    return this.workspacesPath;
  }

  /**
   * Get app data path
   */
  getAppDataPath(): string {
    return this.appDataPath;
  }

  /**
   * List all workspaces in app data
   */
  async listWorkspaces(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.workspacesPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(this.workspacesPath, entry.name));
    } catch {
      return [];
    }
  }

  /**
   * Get workspace metadata from workspace.json
   */
  async getMetadata(workspacePath: string): Promise<WorkspaceMetadata | null> {
    try {
      const metadataPath = path.join(workspacePath, 'workspace.json');
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      // No metadata file or invalid JSON
      return null;
    }
  }

  /**
   * Update workspace metadata
   */
  async updateMetadata(workspacePath: string, updates: Partial<WorkspaceMetadata>): Promise<void> {
    const existing = await this.getMetadata(workspacePath);
    if (!existing) {
      throw new Error('Workspace metadata not found');
    }

    const updated = { ...existing, ...updates };
    const metadataPath = path.join(workspacePath, 'workspace.json');
    await fs.writeFile(metadataPath, JSON.stringify(updated, null, 2), 'utf-8');
  }

  /**
   * List all workspaces with their metadata
   */
  async listWorkspacesWithMetadata(): Promise<Array<{ path: string; metadata: WorkspaceMetadata | null }>> {
    const workspacePaths = await this.listWorkspaces();
    const results = [];

    for (const workspacePath of workspacePaths) {
      const metadata = await this.getMetadata(workspacePath);
      results.push({ path: workspacePath, metadata });
    }

    return results;
  }
}

// Singleton instance
export const workspaceManager = new WorkspaceManager();
