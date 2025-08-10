import { Component, computed, effect, signal } from '@angular/core';
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
import { SessionService } from './services/session.service';
import { MessageService } from './services/message.service';
import { ConversationSession, ContextItem, PhaseAlert, ErrorState, ProgressState, TimeoutState } from './models/session.model';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, SessionTabsComponent, ChatOutputComponent, InputAreaComponent, ErrorHandlerComponent, ProgressIndicatorComponent, SettingsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected title = 'Comrade';

  public sessions$: Observable<any[]>;
  public activeSession$: Observable<any>;
  public currentMessage = signal('');
  public isLoading = signal(false);
  public loadingMessage = signal('Thinking...');
  public phaseAlert = signal<PhaseAlert | null>(null);
  public errorState = signal<ErrorState | null>(null);
  public progressState = signal<ProgressState | null>(null);
  public timeoutState = signal<TimeoutState | null>(null);
  public availableAgents = signal([
    // Start with empty array to show "no agents configured" message
    // { id: 'gpt-4', name: 'GPT-4' },
    // { id: 'claude', name: 'Claude' },
    // { id: 'local-llama', name: 'Local Llama' }
  ]);
  public showSettings = signal(false);

  constructor(
    private sessionService: SessionService,
    private messageService: MessageService,
    private store: Store<any>
  ) {
    console.log('App constructor called - Angular is running!');
    this.sessions$ = this.store.select(SessionSelectors.selectSessions);
    this.activeSession$ = this.store.select(SessionSelectors.selectActiveSession);

    // Add debugging to see what's happening
    setTimeout(() => {
      console.log('DOM check - looking for elements...');
      const buttons = document.querySelectorAll('button');
      console.log('Found buttons:', buttons.length);
      buttons.forEach((btn, i) => {
        console.log(`Button ${i}:`, btn.textContent, btn.onclick);
      });
    }, 2000);

    // Initialize with a demo session after a short delay
    this.sessions$.subscribe(sessions => {
      if (sessions.length === 0) {
        setTimeout(() => {
          this.store.dispatch(SessionActions.createSession({ sessionType: 'conversation' }));
        }, 100);
      }
    });

    // Handle incoming messages from extension
    effect(() => {
      const message = this.messageService.messageReceived();
      if (message) {
        this.handleExtensionMessage(message);
      }
    });
  }

  public createNewSession() {
    console.log('createNewSession called');
    this.store.dispatch(SessionActions.createSession({ sessionType: 'conversation' }));
  }

  public testClick() {
    console.log('TEST CLICK WORKS! Angular events are functioning.');
    alert('Click event works!');
  }



  public formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  public getConversationSession(session: any): ConversationSession | null {
    return session.type === 'conversation' ? session as ConversationSession : null;
  }

  public onMessageSubmit(data: { message: string; contextItems: ContextItem[] }) {
    this.activeSession$.subscribe(activeSession => {
      if (activeSession) {
        this.sessionService.sendMessage(activeSession.id, data.message, data.contextItems);
      }
    }).unsubscribe();
  }

  public onAgentChange(agentId: string) {
    this.activeSession$.subscribe(activeSession => {
      if (activeSession) {
        this.messageService.switchAgent(activeSession.id, agentId);
      }
    }).unsubscribe();
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
        // Handle session updates
        break;

      default:
        console.log('Unhandled message type:', message.type);
    }
  }

  public onErrorDismissed() {
    this.errorState.set(null);
  }

  public onOperationRetried() {
    this.errorState.set(null);
    // Show progress for retry
    this.activeSession$.subscribe(activeSession => {
      if (activeSession) {
        this.progressState.set({
          isActive: true,
          message: 'Retrying operation...',
          cancellable: true,
          sessionId: activeSession.id
        });
      }
    }).unsubscribe();
  }

  public onConfigurationOpened(configType: string) {
    console.log('Configuration opened:', configType);
  }

  public onTimeoutExtended() {
    this.timeoutState.set(null);
    // Show progress for extended operation
    this.activeSession$.subscribe(activeSession => {
      if (activeSession) {
        this.progressState.set({
          isActive: true,
          message: 'Continuing operation...',
          cancellable: true,
          sessionId: activeSession.id
        });
      }
    }).unsubscribe();
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
