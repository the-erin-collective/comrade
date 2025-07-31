import { Component, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SessionTabsComponent } from './components/session-tabs/session-tabs.component';
import { ChatOutputComponent } from './components/chat-output/chat-output.component';
import { InputAreaComponent } from './components/input-area/input-area.component';
import { SessionService } from './services/session.service';
import { MessageService } from './services/message.service';
import { ConversationSession, ContextItem, PhaseAlert } from './models/session.model';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, SessionTabsComponent, ChatOutputComponent, InputAreaComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected title = 'Comrade';
  
  public activeSession = computed(() => this.sessionService.activeSession());
  public sessions = computed(() => this.sessionService.sessions());
  public currentMessage = signal('');
  public isLoading = signal(false);
  public loadingMessage = signal('Thinking...');
  public phaseAlert = signal<PhaseAlert | null>(null);
  public availableAgents = signal([
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'claude', name: 'Claude' },
    { id: 'local-llama', name: 'Local Llama' }
  ]);
  
  constructor(
    private sessionService: SessionService,
    private messageService: MessageService
  ) {
    // Initialize with a demo session after a short delay
    effect(() => {
      if (this.sessions().length === 0) {
        setTimeout(() => {
          this.sessionService.createSession('conversation');
        }, 100);
      }
    });
  }
  
  public createNewSession() {
    this.sessionService.createSession('conversation');
  }
  

  
  public formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString();
  }
  
  public getConversationSession(session: any): ConversationSession | null {
    return session.type === 'conversation' ? session as ConversationSession : null;
  }
  
  public onMessageSubmit(data: { message: string; contextItems: ContextItem[] }) {
    const activeSession = this.activeSession();
    if (activeSession) {
      this.sessionService.sendMessage(activeSession.id, data.message, data.contextItems);
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
    // TODO: Implement settings menu
    console.log('Open settings menu');
  }
}
