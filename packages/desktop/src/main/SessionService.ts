// SessionService - Manages workspace session state (tabs, UI state)
import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

export type TabSession = {
  id: string;
  collectionId: string;
  collectionPath: string;
  requestId: string;
  protocol: string;
  unsavedChanges?: {
    name?: string;
    description?: string;
    data?: any; // Protocol-specific data
  };
};

export type WorkspaceSession = {
  lastAccessed: string;
  openTabs: TabSession[];
  activeTabId: string | null;
  expandedFolders: Record<string, string[]>; // collectionId -> folder IDs
};

export type SessionsData = {
  sessions: Record<string, WorkspaceSession>; // workspace path -> session
};

export class SessionService {
  private appDataPath: string;
  private sessionsFilePath: string;
  private sessionsCache: SessionsData | null = null;

  constructor() {
    this.appDataPath = app.getPath('userData');
    this.sessionsFilePath = path.join(this.appDataPath, 'sessions.json');
  }

  /**
   * Initialize sessions file
   */
  async initialize(): Promise<void> {
    try {
      await fs.access(this.sessionsFilePath);
    } catch {
      // File doesn't exist, create it
      await this.saveSessions({ sessions: {} });
    }
  }

  /**
   * Load all sessions
   */
  private async loadSessions(): Promise<SessionsData> {
    if (this.sessionsCache) {
      return this.sessionsCache;
    }

    try {
      const content = await fs.readFile(this.sessionsFilePath, 'utf-8');
      this.sessionsCache = JSON.parse(content);
      return this.sessionsCache!;
    } catch (error) {
      console.error('Failed to load sessions.json:', error);
      // Return empty sessions on error
      const empty: SessionsData = { sessions: {} };
      this.sessionsCache = empty;
      return empty;
    }
  }

  /**
   * Save sessions to disk
   */
  private async saveSessions(data: SessionsData): Promise<void> {
    try {
      const content = JSON.stringify(data, null, 2);
      await fs.writeFile(this.sessionsFilePath, content, 'utf-8');
      this.sessionsCache = data;
    } catch (error) {
      console.error('Failed to save sessions.json:', error);
      throw error;
    }
  }

  /**
   * Get session for a workspace
   */
  async getSession(workspacePath: string): Promise<WorkspaceSession | null> {
    const data = await this.loadSessions();
    return data.sessions[workspacePath] || null;
  }

  /**
   * Save session for a workspace
   */
  async saveSession(workspacePath: string, session: WorkspaceSession): Promise<void> {
    const data = await this.loadSessions();
    data.sessions[workspacePath] = {
      ...session,
      lastAccessed: new Date().toISOString()
    };
    await this.saveSessions(data);
  }

  /**
   * Update session partially
   */
  async updateSession(workspacePath: string, updates: Partial<WorkspaceSession>): Promise<void> {
    const data = await this.loadSessions();
    const existing = data.sessions[workspacePath] || {
      lastAccessed: new Date().toISOString(),
      openTabs: [],
      activeTabId: null,
      expandedFolders: {}
    };

    data.sessions[workspacePath] = {
      ...existing,
      ...updates,
      lastAccessed: new Date().toISOString()
    };

    await this.saveSessions(data);
  }

  /**
   * Delete session for a workspace
   */
  async deleteSession(workspacePath: string): Promise<void> {
    const data = await this.loadSessions();
    delete data.sessions[workspacePath];
    await this.saveSessions(data);
  }

  /**
   * Get all sessions (for cleanup/management)
   */
  async getAllSessions(): Promise<SessionsData> {
    return await this.loadSessions();
  }

  /**
   * Clean up old sessions (older than 30 days)
   */
  async cleanupOldSessions(daysOld: number = 30): Promise<number> {
    const data = await this.loadSessions();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    let cleaned = 0;
    for (const [workspacePath, session] of Object.entries(data.sessions)) {
      const lastAccessed = new Date(session.lastAccessed);
      if (lastAccessed < cutoffDate) {
        delete data.sessions[workspacePath];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.saveSessions(data);
    }

    return cleaned;
  }
}

// Singleton instance
export const sessionService = new SessionService();
