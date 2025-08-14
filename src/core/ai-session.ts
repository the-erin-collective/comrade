import * as vscode from 'vscode';
import { ChatMessage } from './chat';

/**
 * Represents the state of an AI conversation session
 */
export enum AIConversationState {
  /** Session is active and processing messages */
  Active = 'active',
  /** Session is waiting for user input */
  Waiting = 'waiting',
  /** Session is processing a request */
  Processing = 'processing',
  /** Session has encountered an error */
  Error = 'error',
  /** Session has been completed */
  Completed = 'completed',
  /** Session has been cancelled */
  Cancelled = 'cancelled'
}

/**
 * Configuration for AI conversation session
 */
export interface AIConversationConfig {
  /** Maximum number of messages to keep in history */
  maxHistoryLength?: number;
  
  /** Whether to persist conversation history */
  persistHistory?: boolean;
  
  /** Context window size in tokens */
  contextWindowSize?: number;
  
  /** Whether to include file contents in context */
  includeFileContents?: boolean;
  
  /** Whether to include workspace context */
  includeWorkspaceContext?: boolean;
}

/**
 * Represents an AI conversation session
 */
export interface IAIConversationSession {
  /** Unique session ID */
  readonly id: string;
  
  /** Session creation timestamp */
  readonly createdAt: Date;
  
  /** Last activity timestamp */
  lastActivity: Date;
  
  /** Current state of the conversation */
  state: AIConversationState;
  
  /** Conversation messages */
  messages: ChatMessage[];
  
  /** Conversation metadata */
  metadata: Record<string, any>;
  
  /** Session configuration */
  config: AIConversationConfig;
  
  /**
   * Add a message to the conversation
   */
  addMessage(message: ChatMessage): void;
  
  /**
   * Update the session state
   */
  setState(state: AIConversationState): void;
  
  /**
   * Get a summary of the conversation
   */
  getSummary(): string;
  
  /**
   * Clear the conversation history
   */
  clearHistory(): void;
  
  /**
   * Dispose the session and release resources
   */
  dispose(): Promise<void>;
}

/**
 * Manages AI conversation sessions
 */
export class AISessionManager implements vscode.Disposable {
  private static _instance: AISessionManager | null = null;
  private readonly sessions: Map<string, IAIConversationSession> = new Map();
  private readonly sessionStorage: vscode.Memento;
  private readonly SESSION_STORAGE_KEY = 'comrade.ai.sessions';
  private readonly MAX_SESSIONS = 50;
  private _disposables: vscode.Disposable[] = [];
  
  private constructor(context: vscode.ExtensionContext) {
    this.sessionStorage = context.globalState;
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('comrade.ai.sessions')) {
          this.cleanupInactiveSessions();
        }
      })
    );
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(context?: vscode.ExtensionContext): AISessionManager {
    if (!AISessionManager._instance && context) {
      AISessionManager._instance = new AISessionManager(context);
    } else if (!AISessionManager._instance) {
      throw new Error('AISessionManager must be initialized with a context first');
    }
    return AISessionManager._instance;
  }
  
  /**
   * Create a new AI conversation session
   */
  public createSession(config: Partial<AIConversationConfig> = {}): IAIConversationSession {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const defaultConfig: AIConversationConfig = {
      maxHistoryLength: 100,
      persistHistory: true,
      contextWindowSize: 8000,
      includeFileContents: true,
      includeWorkspaceContext: true,
      ...config
    };
    
    const session: IAIConversationSession = {
      id: sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      state: AIConversationState.Active,
      messages: [],
      metadata: {},
      config: defaultConfig,
      
      addMessage: (message: ChatMessage) => {
        session.messages.push(message);
        session.lastActivity = new Date();
        
        // Enforce max history length
        if (session.messages.length > session.config.maxHistoryLength!) {
          session.messages = session.messages.slice(-session.config.maxHistoryLength!);
        }
      },
      
      setState: (state: AIConversationState) => {
        session.state = state;
        session.lastActivity = new Date();
      },
      
      getSummary: () => {
        const messageCount = session.messages.length;
        const lastMessage = messageCount > 0 
          ? session.messages[messageCount - 1].content.substring(0, 50) + '...' 
          : 'No messages';
          
        return `Session ${session.id} (${messageCount} messages, last: ${lastMessage})`;
      },
      
      clearHistory: () => {
        session.messages = [];
      },
      
      dispose: async () => {
        if (session.config.persistHistory) {
          await this.persistSession(session);
        }
        this.sessions.delete(sessionId);
      }
    };
    
    // Add system message if configured
    if (config.persistHistory) {
      session.messages.push({
        role: 'system',
        content: 'AI conversation session started',
        timestamp: new Date()
      });
    }
    
    this.sessions.set(sessionId, session);
    this.cleanupInactiveSessions();
    
    return session;
  }
  
  /**
   * Get a session by ID
   */
  public getSession(sessionId: string): IAIConversationSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
    return session;
  }
  
  /**
   * Get all active sessions
   */
  public getActiveSessions(): IAIConversationSession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.state !== AIConversationState.Completed && 
                        session.state !== AIConversationState.Cancelled);
  }
  
  /**
   * End a session
   */
  public async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.state === AIConversationState.Active) {
        session.state = AIConversationState.Completed;
      }
      await session.dispose();
    }
  }
  
  /**
   * Clean up inactive sessions
   */
  private cleanupInactiveSessions(): void {
    const now = Date.now();
    const maxAge = vscode.workspace.getConfiguration('comrade.ai.sessions').get<number>('maxInactiveTime', 24 * 60 * 60 * 1000);
    
    for (const [id, session] of this.sessions.entries()) {
      const inactiveTime = now - session.lastActivity.getTime();
      if (inactiveTime > maxAge) {
        this.sessions.delete(id);
      }
    }
    
    // Enforce max sessions limit
    const sessions = Array.from(this.sessions.entries())
      .sort((a, b) => b[1].lastActivity.getTime() - a[1].lastActivity.getTime());
      
    while (sessions.length > this.MAX_SESSIONS) {
      const [id] = sessions.pop()!;
      this.sessions.delete(id);
    }
  }
  
  /**
   * Persist session to storage
   */
  private async persistSession(session: IAIConversationSession): Promise<void> {
    if (!session.config.persistHistory) return;
    
    const sessions = this.sessionStorage.get<Record<string, any>>(this.SESSION_STORAGE_KEY, {});
    sessions[session.id] = {
      id: session.id,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      state: session.state,
      messages: session.messages,
      metadata: session.metadata,
      config: session.config
    };
    
    await this.sessionStorage.update(this.SESSION_STORAGE_KEY, sessions);
  }
  
  /**
   * Restore sessions from storage
   */
  public async restoreSessions(): Promise<void> {
    const sessions = this.sessionStorage.get<Record<string, any>>(this.SESSION_STORAGE_KEY, {});
    
    for (const [id, data] of Object.entries(sessions)) {
      if (this.sessions.has(id)) continue;
      
      const session = this.createSession(data.config);
      session.messages = data.messages || [];
      session.metadata = data.metadata || {};
      session.state = data.state || AIConversationState.Active;
      session.createdAt = new Date(data.createdAt);
      session.lastActivity = new Date(data.lastActivity || data.createdAt);
    }
    
    this.cleanupInactiveSessions();
  }
  
  /**
   * Dispose the session manager
   */
  public async dispose(): Promise<void> {
    // Persist all sessions before disposing
    await Promise.all(
      Array.from(this.sessions.values())
        .filter(session => session.config.persistHistory)
        .map(session => this.persistSession(session))
    );
    
    this._disposables.forEach(d => d.dispose());
    this.sessions.clear();
    AISessionManager._instance = null;
  }
}

// Extension activation hook
export function activateAISessionManager(context: vscode.ExtensionContext): AISessionManager {
  const manager = AISessionManager.getInstance(context);
  manager.restoreSessions().catch(console.error);
  return manager;
}

// Extension deactivation hook
export function deactivateAISessionManager(): Thenable<void> {
  return AISessionManager.getInstance().dispose();
}
