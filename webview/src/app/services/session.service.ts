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
    this.setupMessageHandling();
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
    this.createSession(type);
    // Find the most recently added conversation session
    const sessions = Array.from(this.sessionsMap().values()).filter(
      (s): s is ConversationSession => s.type === 'conversation'
    );
    const newSession = sessions[sessions.length - 1];
    return of(newSession);
  }
  
  private setupMessageHandling() {
    effect(() => {
      const message = this.messageService.messageReceived();
      if (message) {
        this.handleExtensionMessage(message);
      }
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
    }
  }
  
  private handleUpdateSession(payload: any) {
    if (payload.sessionId) {
      const sessions = new Map(this.sessionsMap());
      
      if (!sessions.has(payload.sessionId)) {
        // Create new session
        const newSession: SessionTab = {
          id: payload.sessionId,
          title: payload.title || `Session ${payload.sessionId.slice(-4)}`,
          type: payload.type || 'conversation',
          isActive: false,
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
    sessions.delete(sessionId);
    
    // If closing active session, switch to another
    if (this.activeSessionIdSignal() === sessionId) {
      const remainingSessions = Array.from(sessions.values());
      if (remainingSessions.length > 0) {
        const nextSession = remainingSessions[remainingSessions.length - 1];
        this.switchToSession(nextSession.id);
      } else {
        this.activeSessionIdSignal.set(null);
      }
    }
    
    this.sessionsMap.set(sessions);
    this.messageService.closeSession(sessionId);
    this.persistState();
  }
  
  public sendMessage(sessionId: string, message: string, contextItems: any[] = []) {
    this.messageService.sendChatMessage(sessionId, message, contextItems);
  }
  
  public addMessageToSession(sessionId: string, message: ChatMessage) {
    const sessions = new Map(this.sessionsMap());
    const session = sessions.get(sessionId);
    
    if (session && session.type === 'conversation') {
      (session as ConversationSession).messages.push(message);
      session.lastActivity = new Date();
      this.sessionsMap.set(sessions);
      this.persistState();
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
      if (stored) {
        const parsed = JSON.parse(stored);
        const sessions = new Map<string, SessionTab>(parsed.sessions || []);
        
        // Restore dates
        sessions.forEach((session: any) => {
          session.lastActivity = new Date(session.lastActivity);
        });
        
        this.sessionsMap.set(sessions);
        this.activeSessionIdSignal.set(parsed.activeSessionId);
        this.sessionHistorySignal.set(parsed.sessionHistory || []);
      }
    } catch (error) {
      console.warn('Failed to load persisted session state:', error);
    }
  }
  
  public clearAllSessions() {
    this.sessionsMap.set(new Map());
    this.activeSessionIdSignal.set(null);
    this.sessionHistorySignal.set([]);
    this.persistState();
  }
}