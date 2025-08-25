import { Observable, of } from 'rxjs';
import { Injectable, signal, computed, effect } from '@angular/core';
import { SessionTab, ConversationSession, ConfigurationSession, SessionState, ChatMessage } from '../models/session.model';
import { MessageService } from './message.service';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  // Session state signals
  private sessionsMap = signal<Map<string, SessionTab>>(new Map());
  private activeSessionIdSignal = signal<string | null>(null);
  private sessionHistorySignal = signal<string[]>([]);
  
  // Computed values
  public sessions = computed(() => Array.from(this.sessionsMap().values()));
  public activeSession = computed(() => {
    const activeId = this.activeSessionIdSignal();
    return activeId ? this.sessionsMap().get(activeId) : null;
  });
  public activeSessionId = computed(() => this.activeSessionIdSignal());
  public sessionHistory = computed(() => this.sessionHistorySignal());
  
  constructor(private messageService: MessageService) {
    // Temporarily disabled to fix unresponsiveness - messages handled in app component
    // this.setupMessageHandling();
    this.loadPersistedState();
  }

  // Observable-based API for NgRx integration
  public getSessions(): Observable<ConversationSession[]> {
    // Filter only conversation sessions
    const sessions = Array.from(this.sessionsMap().values()).filter(
      (s): s is ConversationSession => s.type === 'conversation'
    );
    return of(sessions);
  }

  public createSession$(type: 'conversation' | 'configuration' = 'conversation'): Observable<ConversationSession> {
    console.log('createSession$ called with type:', type);
    
    // Create session directly instead of relying on message handling
    const sessionId = Date.now().toString();
    const newSession: ConversationSession = {
      id: sessionId,
      title: 'New Session',
      type: 'conversation',
      isActive: true,
      isClosed: false,
      lastActivity: new Date(),
      metadata: {},
      messages: [],
      currentPhase: 'context',
      agentConfig: {
        id: 'default',
        name: 'Default Agent',
        provider: 'openai',
        model: 'gpt-4',
        capabilities: {
          hasVision: false,
          hasToolUse: true,
          reasoningDepth: 'advanced',
          speed: 'medium',
          costTier: 'high'
        }
      }
    };

    // Add to sessions map
    const sessions = new Map(this.sessionsMap());
    
    // Deactivate all other sessions
    sessions.forEach(session => session.isActive = false);
    
    // Add new session
    sessions.set(sessionId, newSession);
    this.sessionsMap.set(sessions);
    this.activeSessionIdSignal.set(sessionId);
    this.persistState();
    
    // Also send message to extension for consistency
    this.createSession(type);
    
    console.log('Created new session:', newSession);
    return of(newSession);
  }
  
  private setupMessageHandling() {
    console.log('SessionService: Setting up event-driven message handling');
    // Subscribe to messages using RxJS Observable
    this.messageService.messages$.subscribe(message => {
      console.log('SessionService: Received message:', message.type);
      this.handleExtensionMessage(message);
    });
  }
  
  private handleExtensionMessage(message: any) {
    switch (message.type) {
      case 'updateSession':
        this.handleUpdateSession(message.payload);
        break;
      case 'showProgress':
        this.handleShowProgress(message.payload);
        break;
      case 'renderMarkdown':
        this.handleRenderMarkdown(message.payload);
        break;
      case 'updateConfig':
        this.handleUpdateConfig(message.payload);
        break;
      case 'showError':
        this.handleShowError(message.payload);
        break;
      case 'restoreSessions':
        this.handleRestoreSessions(message.payload);
        break;
    }
  }
  
  private handleUpdateSession(payload: any) {
    if (payload.sessionId) {
      const sessions = new Map(this.sessionsMap());
      
      if (!sessions.has(payload.sessionId)) {
        // Create new session
        const newSession: SessionTab = {
          id: payload.sessionId,
          title: payload.title || 'New Session',
          type: payload.type || 'conversation',
          isActive: false,
          isClosed: false,
          lastActivity: new Date(),
          metadata: payload.metadata || {}
        };
        
        if (newSession.type === 'conversation') {
          (newSession as ConversationSession).messages = [];
          (newSession as ConversationSession).currentPhase = 'context';
          (newSession as ConversationSession).agentConfig = payload.agentConfig;
        } else {
          (newSession as ConfigurationSession).configurationType = payload.configurationType;
          (newSession as ConfigurationSession).formData = payload.formData || {};
          (newSession as ConfigurationSession).isDirty = false;
        }
        
        sessions.set(payload.sessionId, newSession);
      }
      
      // Update existing session
      const session = sessions.get(payload.sessionId)!;
      Object.assign(session, payload);
      session.lastActivity = new Date();
      
      // Add message if provided
      if (payload.message && session.type === 'conversation') {
        (session as ConversationSession).messages.push(payload.message);
      }
      
      // Update active session
      if (payload.isActive) {
        // Deactivate all sessions
        sessions.forEach(s => s.isActive = false);
        session.isActive = true;
        this.activeSessionIdSignal.set(payload.sessionId);
      }
      
      this.sessionsMap.set(sessions);
      this.persistState();
    }
  }
  
  private handleShowProgress(payload: any) {
    // TODO: Implement progress display
    console.log('Show progress:', payload);
  }
  
  private handleRenderMarkdown(payload: any) {
    // TODO: Implement markdown rendering
    console.log('Render markdown:', payload);
  }
  
  private handleUpdateConfig(payload: any) {
    // TODO: Implement config updates
    console.log('Update config:', payload);
  }
  
  private handleShowError(payload: any) {
    // TODO: Implement error display
    console.error('Extension error:', payload);
  }

  private handleRestoreSessions(payload: any) {
    console.log('SessionService: Handling session restoration...');
    
    // Simple approach: just check and restore without complex flows
    setTimeout(() => {
      if (this.hasOpenSessions()) {
        const openSessions = this.getOpenSessions();
        console.log('SessionService: Found open sessions to restore:', openSessions.length);
        
        if (openSessions.length > 0) {
          // Find the most recently active session
          const mostRecentSession = openSessions
            .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())[0];
          
          console.log('SessionService: Restoring most recent session:', mostRecentSession.id);
          
          // Simply activate it
          this.switchToSession(mostRecentSession.id);
          
          console.log('SessionService: Session restored successfully');
        }
      } else {
        console.log('SessionService: No sessions to restore - user will see welcome page');
      }
    }, 500); // Small delay to ensure everything is initialized
  }
  
  // Session management methods
  public createSession(type: 'conversation' | 'configuration' = 'conversation') {
    this.messageService.createSession(type);
  }
  
  public switchToSession(sessionId: string) {
    const sessions = new Map(this.sessionsMap());
    
    // Deactivate all sessions
    sessions.forEach(session => session.isActive = false);
    
    // Activate target session
    const targetSession = sessions.get(sessionId);
    if (targetSession) {
      targetSession.isActive = true;
      this.activeSessionIdSignal.set(sessionId);
      this.sessionsMap.set(sessions);
      this.messageService.switchSession(sessionId);
      this.persistState();
    }
  }
  
  public closeSession(sessionId: string) {
    const sessions = new Map(this.sessionsMap());
    const session = sessions.get(sessionId);
    
    if (session) {
      // Mark session as closed instead of deleting
      session.isClosed = true;
      session.isActive = false;
      sessions.set(sessionId, session);
      
      // Update the sessions map immediately
      this.sessionsMap.set(sessions);
      this.persistState();
      
      console.log('Closed session:', sessionId, 'Session is now closed:', session.isClosed);
    }
    
    // If closing active session, switch to another active session
    if (this.activeSessionIdSignal() === sessionId) {
      const activeSessions = Array.from(sessions.values()).filter(s => !s.isClosed);
      if (activeSessions.length > 0) {
        const nextSession = activeSessions[activeSessions.length - 1];
        this.switchToSession(nextSession.id);
      } else {
        this.activeSessionIdSignal.set(null);
      }
    }
    
    this.messageService.closeSession(sessionId);
  }
  
  public async sendMessage(sessionId: string, message: string, contextItems: any[] = []): Promise<{ success: boolean; error?: string }> {
    try {
      // Use the new message service with agent validation
      const result = await this.messageService.sendChatMessageWithValidation(
        sessionId,
        message,
        contextItems,
        undefined, // No streaming callback for now
        true // Enable agent validation
      );

      if (result.error) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      console.error('SessionService: Error sending message:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to send message' 
      };
    }
  }
  
  public addMessageToSession(sessionId: string, message: ChatMessage) {
    const sessions = new Map(this.sessionsMap());
    const session = sessions.get(sessionId);
    
    if (session && session.type === 'conversation') {
      const conversationSession = session as ConversationSession;
      
      // Check if message with same ID already exists to prevent duplicates
      const existingMessageIndex = conversationSession.messages.findIndex(m => m.id === message.id);
      
      if (existingMessageIndex !== -1) {
        console.log('SessionService: Message with ID', message.id, 'already exists, skipping duplicate');
        return;
      }
      
      // Create a new session object with a new messages array to trigger change detection
      const updatedSession = {
        ...session,
        messages: [...conversationSession.messages, message],
        lastActivity: new Date()
      } as ConversationSession;
      
      sessions.set(sessionId, updatedSession);
      
      // Force signal update to trigger change detection
      this.sessionsMap.set(new Map(sessions));
      this.persistState();
      console.log('SessionService: Added message to session, new message count:', updatedSession.messages.length);
      console.log('SessionService: Forced signal update for change detection');
    }
  }
  
  public updateSessionTitle(sessionId: string, title: string) {
    const sessions = new Map(this.sessionsMap());
    const session = sessions.get(sessionId);
    
    if (session) {
      session.title = title;
      this.sessionsMap.set(sessions);
      this.persistState();
    }
  }

  public updateSessionAgent(sessionId: string, agentConfig: any) {
    const sessions = new Map(this.sessionsMap());
    const session = sessions.get(sessionId);
    
    if (session && session.type === 'conversation') {
      console.log('SessionService: Updating agent config for session:', sessionId, 'to:', agentConfig);
      
      // Create a new session object to trigger change detection
      const updatedSession = {
        ...session,
        agentConfig: agentConfig,
        lastActivity: new Date()
      } as ConversationSession;
      
      sessions.set(sessionId, updatedSession);
      
      // Force signal update to trigger change detection
      this.sessionsMap.set(new Map(sessions));
      this.persistState();
      
      console.log('SessionService: Agent config updated successfully');
    }
  }

  public getSessionHistory(): SessionTab[] {
    const sessions = Array.from(this.sessionsMap().values());
    return sessions
      .filter(session => session.isClosed)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  public reopenSession(sessionId: string) {
    console.log('SessionService: reopenSession called with ID:', sessionId);
    const sessions = new Map(this.sessionsMap());
    const session = sessions.get(sessionId);
    
    console.log('SessionService: Found session:', session);
    console.log('SessionService: Session is closed:', session?.isClosed);
    
    if (session && session.isClosed) {
      console.log('SessionService: Reopening session...');
      
      // Deactivate all other sessions
      sessions.forEach(s => s.isActive = false);
      
      // Reopen and activate the session
      session.isClosed = false;
      session.isActive = true;
      session.lastActivity = new Date();
      sessions.set(sessionId, session);
      
      // Update state
      this.sessionsMap.set(sessions);
      this.activeSessionIdSignal.set(sessionId);
      this.persistState();
      
      console.log('SessionService: Session reopened successfully');
      console.log('SessionService: Active session ID now:', this.activeSessionIdSignal());
      console.log('SessionService: Active session object:', this.activeSession());
      
      // Also send message to extension
      this.messageService.switchSession(sessionId);
      
      console.log('SessionService: Reopened session:', session);
    } else {
      console.log('SessionService: Cannot reopen session - not found or not closed');
    }
  }

  public getAllSessions(): SessionTab[] {
    return Array.from(this.sessionsMap().values());
  }

  public deleteSession(sessionId: string) {
    const sessions = new Map(this.sessionsMap());
    sessions.delete(sessionId);
    
    // Update local state - let NgRx handle active session switching
    this.sessionsMap.set(sessions);
    this.persistState();
    
    console.log('Deleted session:', sessionId);
  }

  public clearAllSessions() {
    this.sessionsMap.set(new Map());
    this.activeSessionIdSignal.set(null);
    this.persistState();
    
    console.log('Cleared all sessions');
  }

  public clearActiveSession() {
    console.log('SessionService: Clearing active session');
    this.activeSessionIdSignal.set(null);
    
    // Also make sure no session is marked as active
    const sessions = new Map(this.sessionsMap());
    sessions.forEach(session => {
      session.isActive = false;
    });
    this.sessionsMap.set(sessions);
    this.persistState();
  }

  // Debug method to check session state
  public getDebugInfo() {
    return {
      sessionsCount: this.sessionsMap().size,
      sessions: Array.from(this.sessionsMap().entries()),
      activeSessionId: this.activeSessionIdSignal(),
      activeSession: this.activeSession(),
      openSessions: this.getOpenSessions(),
      hasOpenSessions: this.hasOpenSessions()
    };
  }

  public getOpenSessions(): SessionTab[] {
    return Array.from(this.sessionsMap().values()).filter(session => !session.isClosed);
  }

  public hasOpenSessions(): boolean {
    return this.getOpenSessions().length > 0;
  }

  public restoreOpenSessions(): ConversationSession | null {
    console.log('SessionService: Attempting to restore open sessions');
    const openSessions = this.getOpenSessions();
    console.log('SessionService: Found open sessions:', openSessions.length, openSessions);
    
    if (openSessions.length === 0) {
      console.log('SessionService: No open sessions to restore');
      return null;
    }

    // Find the most recently active session
    const mostRecentSession = openSessions
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())[0];

    console.log('SessionService: Most recent session:', mostRecentSession);

    // Activate the most recent session
    this.switchToSession(mostRecentSession.id);
    
    console.log('SessionService: Restored session:', mostRecentSession.id, 'Total open sessions:', openSessions.length);
    
    // Return as ConversationSession if it's a conversation type, otherwise null
    const result = mostRecentSession.type === 'conversation' ? mostRecentSession as ConversationSession : null;
    console.log('SessionService: Returning restored session:', result);
    return result;
  }
  
  // Persistence methods
  private persistState() {
    const state: SessionState = {
      sessions: this.sessionsMap(),
      activeSessionId: this.activeSessionIdSignal(),
      sessionHistory: this.sessionHistorySignal()
    };
    
    try {
      localStorage.setItem('comrade-session-state', JSON.stringify({
        sessions: Array.from(state.sessions.entries()),
        activeSessionId: state.activeSessionId,
        sessionHistory: state.sessionHistory
      }));
    } catch (error) {
      console.warn('Failed to persist session state:', error);
    }
  }
  
  private loadPersistedState() {
    try {
      const stored = localStorage.getItem('comrade-session-state');
      console.log('SessionService: Loading persisted state from localStorage:', stored);
      
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('SessionService: Parsed state:', parsed);
        
        const sessions = new Map<string, SessionTab>(parsed.sessions || []);
        console.log('SessionService: Restored sessions map:', sessions);
        
        // Restore dates
        sessions.forEach((session: any) => {
          session.lastActivity = new Date(session.lastActivity);
        });
        
        this.sessionsMap.set(sessions);
        this.activeSessionIdSignal.set(parsed.activeSessionId);
        this.sessionHistorySignal.set(parsed.sessionHistory || []);
        
        console.log('SessionService: State loaded successfully. Sessions:', sessions.size, 'Active:', parsed.activeSessionId);
      } else {
        console.log('SessionService: No persisted state found in localStorage');
      }
    } catch (error) {
      console.warn('SessionService: Failed to load persisted session state:', error);
    }
  }
}