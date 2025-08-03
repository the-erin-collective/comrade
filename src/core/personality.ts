/**
 * Personality configuration system for maintaining consistent tone across different LLM models
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { WebFileSystem } from './webcompat';

/**
 * Interface for personality configuration
 */
export interface PersonalityConfig {
  content: string;
  lastModified: Date;
  source: 'file' | 'default';
}

/**
 * Default personality content for MVP
 */
const DEFAULT_PERSONALITY_CONTENT = `# Personality

Respond in a concise, friendly, and slightly informal tone. Be helpful and direct while maintaining a conversational style that feels natural and approachable.

## Guidelines
- Keep responses focused and actionable
- Use clear, simple language
- Be encouraging and supportive
- Avoid overly technical jargon unless necessary
- Maintain consistency across different interactions
`;

/**
 * PersonalityManager handles reading, creating, and managing personality configuration
 */
export class PersonalityManager {
  private static instance: PersonalityManager;
  private cachedPersonality: PersonalityConfig | null = null;
  private fileWatcher: vscode.FileSystemWatcher | null = null;

  private constructor() {}

  /**
   * Get singleton instance of PersonalityManager
   */
  public static getInstance(): PersonalityManager {
    if (!PersonalityManager.instance) {
      PersonalityManager.instance = new PersonalityManager();
    }
    return PersonalityManager.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    PersonalityManager.instance = undefined as any;
  }

  /**
   * Clear all workspace initializations
   */
  public clearAllWorkspaces(): void {
    // Implementation for clearing workspace data
    // This is a placeholder - implement based on actual requirements
  }



  /**
   * Initialize personality system for a workspace
   */
  public async initialize(workspaceUri: vscode.Uri): Promise<void> {
    // Create .comrade directory if it doesn't exist
    const comradeDir = vscode.Uri.joinPath(workspaceUri, '.comrade');
    try {
      await vscode.workspace.fs.stat(comradeDir);
    } catch {
      await vscode.workspace.fs.createDirectory(comradeDir);
    }

    // Create default personality file if it doesn't exist
    const personalityFile = vscode.Uri.joinPath(comradeDir, 'personality.md');
    try {
      await vscode.workspace.fs.stat(personalityFile);
    } catch {
      // File doesn't exist, create it with default content
      await vscode.workspace.fs.writeFile(
        personalityFile,
        Buffer.from(DEFAULT_PERSONALITY_CONTENT, 'utf8')
      );
    }

    // Set up file watcher for personality changes
    this.setupFileWatcher(personalityFile);

    // Load initial personality
    await this.loadPersonality(workspaceUri);
  }

  /**
   * Get current personality configuration
   */
  public async getPersonality(workspaceUri?: vscode.Uri): Promise<PersonalityConfig> {
    if (!this.cachedPersonality && workspaceUri) {
      await this.loadPersonality(workspaceUri);
    }

    return this.cachedPersonality || {
      content: DEFAULT_PERSONALITY_CONTENT,
      lastModified: new Date(),
      source: 'default'
    };
  }

  /**
   * Get personality content for injection into prompts
   */
  public async getPersonalityForPrompt(workspaceUri?: vscode.Uri): Promise<string> {
    const personality = await this.getPersonality(workspaceUri);
    return `\n\n## Personality Guidelines\n${personality.content}\n\nPlease follow these personality guidelines in your response.`;
  }

  /**
   * Load personality from file
   */
  private async loadPersonality(workspaceUri: vscode.Uri): Promise<void> {
    const personalityFile = vscode.Uri.joinPath(workspaceUri, '.comrade', 'personality.md');
    
    try {
      const fileContent = await vscode.workspace.fs.readFile(personalityFile);
      const content = Buffer.from(fileContent).toString('utf8');
      const stat = await vscode.workspace.fs.stat(personalityFile);
      
      this.cachedPersonality = {
        content,
        lastModified: new Date(stat.mtime),
        source: 'file'
      };
    } catch (error) {
      // File doesn't exist or can't be read, use default
      this.cachedPersonality = {
        content: DEFAULT_PERSONALITY_CONTENT,
        lastModified: new Date(),
        source: 'default'
      };
    }
  }

  /**
   * Set up file watcher for personality file changes
   */
  private setupFileWatcher(personalityFile: vscode.Uri): void {
    // Dispose existing watcher if any
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }

    // Create new watcher
    const pattern = new vscode.RelativePattern(
      vscode.Uri.joinPath(personalityFile, '..'),
      'personality.md'
    );
    
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    
    // Handle file changes
    this.fileWatcher.onDidChange(async () => {
      this.cachedPersonality = null; // Clear cache to force reload
    });

    this.fileWatcher.onDidCreate(async () => {
      this.cachedPersonality = null; // Clear cache to force reload
    });

    this.fileWatcher.onDidDelete(async () => {
      // File was deleted, fall back to default
      this.cachedPersonality = {
        content: DEFAULT_PERSONALITY_CONTENT,
        lastModified: new Date(),
        source: 'default'
      };
    });
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }
  }

  /**
   * Check if personality file exists in workspace
   */
  public async hasPersonalityFile(workspaceUri: vscode.Uri): Promise<boolean> {
    const personalityFile = vscode.Uri.joinPath(workspaceUri, '.comrade', 'personality.md');
    try {
      await vscode.workspace.fs.stat(personalityFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create personality file with default content
   */
  public async createDefaultPersonalityFile(workspaceUri: vscode.Uri): Promise<void> {
    const comradeDir = vscode.Uri.joinPath(workspaceUri, '.comrade');
    const personalityFile = vscode.Uri.joinPath(comradeDir, 'personality.md');

    // Ensure .comrade directory exists
    try {
      await vscode.workspace.fs.stat(comradeDir);
    } catch {
      await vscode.workspace.fs.createDirectory(comradeDir);
    }

    // Write default personality content
    await vscode.workspace.fs.writeFile(
      personalityFile,
      Buffer.from(DEFAULT_PERSONALITY_CONTENT, 'utf8')
    );

    // Clear cache to force reload
    this.cachedPersonality = null;
  }
}

/**
 * Utility function to get personality content for prompt injection
 */
export async function getPersonalityForPrompt(workspaceUri?: vscode.Uri): Promise<string> {
  const manager = PersonalityManager.getInstance();
  return await manager.getPersonalityForPrompt(workspaceUri);
}

/**
 * Utility function to initialize personality system
 */
export async function initializePersonality(workspaceUri: vscode.Uri): Promise<void> {
  const manager = PersonalityManager.getInstance();
  await manager.initialize(workspaceUri);
}