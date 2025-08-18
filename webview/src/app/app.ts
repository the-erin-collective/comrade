import { Component, computed, effect, signal, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import * as SessionActions from './state/session/session.actions';
import * as SessionSelectors from './state/session/session.selectors';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SessionTabsComponent } from './components/session-tabs/session-tabs.component';
import { ChatOutputComponent } from './components/chat-output/chat-output.component';
import { InputAreaComponent } from './components/input-area/input-area.component';
import { ErrorHandlerComponent } from './components/error-handler/error-handler.component';
import { ProgressIndicatorComponent } from './components/progress-indicator/progress-indicator.component';
import { SettingsComponent } from './components/settings/settings.component';
import { SessionHistoryComponent } from './components/session-history/session-history.component';
import { NotificationComponent } from './components/notification/notification.component';
import { SessionService } from './services/session.service';
import { MessageService } from './services/message.service';
import { ConversationSession, ContextItem, PhaseAlert, ErrorState, ProgressState, TimeoutState } from './models/session.model';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, SessionTabsComponent, ChatOutputComponent, InputAreaComponent, ErrorHandlerComponent, ProgressIndicatorComponent, SettingsComponent, SessionHistoryComponent, NotificationComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected title = 'Comrade';

  // Use session service signals directly instead of NgRx store
  public sessions = this.sessionService.sessions;
  public activeSession = this.sessionService.activeSession;
  public currentMessage = signal('');
  public isLoading = signal(false);
  public loadingMessage = signal('Thinking...');
  public phaseAlert = signal<PhaseAlert | null>(null);
  public errorState = signal<ErrorState | null>(null);
  public progressState = signal<ProgressState | null>(null);
  public timeoutState = signal<TimeoutState | null>(null);
  public availableAgents = signal<any[]>([
    // Start with empty array to show "no agents configured" message
  ]);
  public showSettings = signal(false);
  public showHistory = signal(false);
  public isInitializing = signal(true); // Track initialization state
  public initializationMessage = signal('Loading Comrade...'); // Dynamic loading message

  private destroyRef = inject(DestroyRef);

  constructor(
    private sessionService: SessionService,
    private messageService: MessageService,
    private store: Store<any>
  ) {
    console.log('App constructor called - Angular is running!');
    
    // Initialize the app properly
    this.initializeApp();
  }

  private async initializeApp() {
    try {
      console.log('App: Starting initialization...');
      
      // Wait for Angular to be fully ready
      await this.waitForAngularReady();
      
      // Setup message handling
      this.setupMessageHandling();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Load available agents from configuration
      this.loadAvailableAgents();
      
      // DON'T mark initialization as complete yet - wait for session restoration
      console.log('App: Basic initialization complete, waiting for session restoration...');
      this.initializationMessage.set('Checking for active sessions...');
      
      // Add a fallback timeout in case session restoration never happens
      setTimeout(() => {
        if (this.isInitializing()) {
          console.log('App: Session restoration timeout - completing initialization anyway');
          this.completeInitialization();
        }
      }, 3000); // 3 second timeout
      
    } catch (error) {
      console.error('App: Initialization failed:', error);
      // Still mark as complete to prevent infinite loading
      this.isInitializing.set(false);
    }
  }

  private waitForAngularReady(): Promise<void> {
    return new Promise((resolve) => {
      // Wait for next tick to ensure Angular is fully initialized
      setTimeout(() => {
        console.log('App: Angular ready');
        resolve();
      }, 0);
    });
  }

  private setupMessageHandling() {
    console.log('App: Setting up proper event-driven message handling');
    
    // Subscribe to messages using RxJS Observable - no polling needed!
    this.messageService.messages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(message => {
        console.log('App: Received message via subscription:', message.type);
        this.handleExtensionMessage(message);
      });
  }

  private setupEventListeners() {
    console.log('App: Setting up event listeners');
    
    // Listen for history show events
    window.addEventListener('showHistory', () => {
      this.showHistory.set(true);
    });

    // Listen for settings show events
    window.addEventListener('showSettings', () => {
      this.showSettings.set(true);
    });
  }



  private loadAvailableAgents() {
    console.log('App: Loading available agents from configuration...');
    // Request current agents from VS Code configuration
    this.messageService.sendMessage({
      type: 'getConfig',
      payload: {}
    });
  }

  private sessionRestorationHandled = false;

  private handleSessionRestoration() {
    // Only handle restoration once
    if (this.sessionRestorationHandled) {
      console.log('App: Session restoration already handled, ignoring');
      return;
    }

    // Only restore if user hasn't navigated away
    if (this.showHistory() || this.showSettings()) {
      console.log('App: Skipping session restoration - user has navigated away');
      this.completeInitialization();
      return;
    }

    console.log('App: Processing session restoration (one-time)');
    this.sessionRestorationHandled = true;
    
    const allSessions = this.sessions();
    console.log('App: All sessions:', allSessions);
    
    // Only restore OPEN sessions, not closed ones
    const openSessions = allSessions.filter(session => !session.isClosed);
    console.log('App: Open sessions available for restoration:', openSessions);
    
    if (openSessions.length > 0) {
      // Find the most recent OPEN session
      const mostRecentOpenSession = openSessions
        .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())[0];
      
      console.log('App: Restoring most recent open session:', mostRecentOpenSession.id, mostRecentOpenSession);
      this.initializationMessage.set('Loading previous session...');
      this.sessionService.switchToSession(mostRecentOpenSession.id);
      
      // Wait for session to be fully loaded before completing initialization
      setTimeout(() => {
        console.log('App: Active session after restoration:', this.activeSession());
        console.log('App: Session restored successfully');
        this.completeInitialization();
      }, 200); // Give a bit more time for session to fully load
    } else {
      console.log('App: No open sessions to restore - user will see welcome screen');
      // Make sure no session is marked as active
      this.sessionService.clearActiveSession();
      this.completeInitialization();
    }
  }

  private completeInitialization() {
    console.log('App: Completing initialization - hiding loading screen');
    this.isInitializing.set(false);
  }

  public createNewSession() {
    console.log('createNewSession called - using session service directly');
    
    // Use session service directly instead of NgRx
    this.sessionService.createSession$('conversation').subscribe(session => {
      console.log('New session created:', session);
      // Switch to session view when creating a new session
      this.showHistory.set(false);
      this.showSettings.set(false);
    });
  }

  public testClick() {
    console.log('TEST CLICK WORKS! Angular events are functioning.');
    console.log('Current isInitializing state:', this.isInitializing());
    
    // Debug session state
    const debugInfo = this.sessionService.getDebugInfo();
    console.log('Session Debug Info:', debugInfo);
    
    // Check UI state
    console.log('App UI State:');
    console.log('- showHistory:', this.showHistory());
    console.log('- showSettings:', this.showSettings());
    console.log('- activeSession from UI:', this.activeSession());
    console.log('- sessions from UI:', this.sessions());
    
    if (this.isInitializing()) {
      console.log('Manually completing initialization...');
      this.isInitializing.set(false);
    }
    
    const activeSession = this.activeSession();
    const sessionInfo = activeSession ? `ID: ${activeSession.id}, Type: ${activeSession.type}, Messages: ${activeSession.type === 'conversation' ? (activeSession as any).messages?.length || 0 : 'N/A'}` : 'None';
    
    alert(`Click works!\nSessions: ${debugInfo.sessionsCount}\nActive: ${debugInfo.activeSessionId}\nOpen: ${debugInfo.openSessions.length}\nActive Session: ${sessionInfo}`);
  }



  public formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  public getConversationSession(session: any): ConversationSession | null {
    return session.type === 'conversation' ? session as ConversationSession : null;
  }

  public async onMessageSubmit(data: { message: string; contextItems: ContextItem[] }) {
    const activeSession = this.activeSession();
    if (!activeSession) {
      console.error('No active session for message submission');
      return;
    }

    try {
      // Show loading state
      this.isLoading.set(true);
      this.loadingMessage.set('Checking agent availability...');

      // Use the session service which now includes agent validation
      const result = await this.sessionService.sendMessage(
        activeSession.id,
        data.message,
        data.contextItems
      );

      if (!result.success) {
        // Show error to user
        this.errorState.set({
          message: result.error || 'Failed to send message',
          code: 'agent_availability_error',
          recoverable: true,
          suggestedFix: 'Please configure and activate at least one agent in the settings.',
          configurationLink: 'settings',
          timestamp: new Date(),
          sessionId: activeSession.id
        });
      } else {
        // Message sent successfully, update loading message
        this.loadingMessage.set('Processing your message...');
        // The actual response will be handled by the message service and session service
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.errorState.set({
        message: error instanceof Error ? error.message : 'Failed to send message',
        code: 'message_send_error',
        recoverable: true,
        suggestedFix: 'Please try again or check your configuration.',
        timestamp: new Date(),
        sessionId: activeSession.id
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  public onAgentChange(agentId: string) {
    const activeSession = this.activeSession();
    if (activeSession) {
      this.messageService.switchAgent(activeSession.id, agentId);
    }
  }

  public onContextAdd(data: { type: string; content?: string }) {
    this.messageService.addContext(data.type, data.content);
  }

  public onSettingsOpen() {
    console.log('onSettingsOpen called in main app');
    this.messageService.openConfiguration('agents');
    this.showSettings.set(true);
  }

  public onSettingsClose() {
    this.showSettings.set(false);
  }

  public onHistoryOpen() {
    this.showHistory.set(true);
  }

  public onHistoryClose() {
    this.showHistory.set(false);
  }

  private handleExtensionMessage(message: any) {
    switch (message.type) {
      case 'showProgress':
        this.progressState.set({
          isActive: true,
          message: message.payload.message,
          cancellable: message.payload.cancellable ?? true,
          sessionId: message.payload.sessionId
        });
        break;

      case 'hideProgress':
        this.progressState.set(null);
        break;

      case 'showError':
        this.errorState.set({
          message: message.payload.error.message,
          code: message.payload.error.code,
          recoverable: message.payload.error.recoverable,
          suggestedFix: message.payload.error.suggestedFix,
          configurationLink: message.payload.error.configurationLink,
          timestamp: new Date(),
          sessionId: message.payload.sessionId
        });
        break;

      case 'showTimeout':
        this.timeoutState.set({
          message: message.payload.message,
          allowExtension: message.payload.allowExtension ?? true,
          sessionId: message.payload.sessionId
        });
        break;

      case 'updateSession':
        this.handleSessionUpdate(message.payload);
        break;

      case 'restoreSessions':
        console.log('App: Received session restoration request');
        // Only handle if not already processed
        if (!this.sessionRestorationHandled) {
          this.handleSessionRestoration();
        } else {
          console.log('App: Session restoration already handled, ignoring');
        }
        break;

      case 'configResult':
        this.handleConfigResult(message.payload);
        break;

      case 'configUpdateResult':
        // Reload agents after configuration update
        if (message.payload.success) {
          console.log('App: Configuration updated, reloading agents...');
          this.loadAvailableAgents();
        }
        break;

      case 'agentAvailabilityResult':
        this.handleAgentAvailabilityResult(message.payload);
        break;



      default:
        console.log('Unhandled message type:', message.type);
    }
  }

  private handleConfigResult(payload: { success: boolean; agents?: any[]; providers?: any[]; error?: string }) {
    if (payload.success && payload.agents && payload.providers) {
      console.log('App: Loaded configuration:', { agents: payload.agents.length, providers: payload.providers.length });
      
      // Filter agents that are active and have active providers
      const activeAgents = payload.agents.filter(agent => {
        if (!agent.isActive) {return false;}
        
        const provider = payload.providers!.find(p => p.id === agent.providerId);
        return provider && provider.isActive;
      });
      
      this.availableAgents.set(activeAgents);
      console.log('App: Available active agents updated:', activeAgents.length);
    } else {
      console.log('App: No configuration found or error loading config:', payload.error);
      this.availableAgents.set([]);
    }
  }

  private handleAgentAvailabilityResult(payload: { hasActiveAgents: boolean; activeAgentCount: number; error?: string }) {
    console.log('App: Agent availability result:', payload);
    
    if (!payload.hasActiveAgents && payload.error) {
      // Show error message about agent availability
      this.errorState.set({
        message: payload.error,
        code: 'no_active_agents',
        recoverable: true,
        suggestedFix: 'Please configure and activate at least one agent in the settings.',
        configurationLink: 'settings',
        timestamp: new Date(),
        sessionId: this.activeSession()?.id || 'unknown'
      });
    }
  }

  private handleSessionUpdate(payload: any) {
    console.log('App: Handling session update:', payload);
    
    if (payload.sessionId && payload.message) {
      // Add the message to the session
      this.sessionService.addMessageToSession(payload.sessionId, payload.message);
      console.log('App: Added message to session:', payload.sessionId);
    }
  }

  public onErrorDismissed() {
    this.errorState.set(null);
  }

  public onOperationRetried() {
    this.errorState.set(null);
    // Show progress for retry
    const activeSession = this.activeSession();
    if (activeSession) {
      this.progressState.set({
        isActive: true,
        message: 'Retrying operation...',
        cancellable: true,
        sessionId: activeSession.id
      });
    }
  }

  public onConfigurationOpened(configType: string) {
    console.log('Configuration opened:', configType);
  }

  public onTimeoutExtended() {
    this.timeoutState.set(null);
    // Show progress for extended operation
    const activeSession = this.activeSession();
    if (activeSession) {
      this.progressState.set({
        isActive: true,
        message: 'Continuing operation...',
        cancellable: true,
        sessionId: activeSession.id
      });
    }
  }

  public onOperationCancelled() {
    this.progressState.set(null);
    this.errorState.set(null);
    this.timeoutState.set(null);

    // Show cancellation alert
    this.phaseAlert.set({
      message: 'Operation cancelled',
      actionButton: {
        text: 'Dismiss',
        action: () => this.phaseAlert.set(null)
      },
      type: 'info',
      dismissible: true
    });
  }
}
