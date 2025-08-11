import { Component, output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SessionService } from '../../services/session.service';
import { SessionTab, ConversationSession } from '../../models/session.model';
import * as SessionActions from '../../state/session/session.actions';
import { ConfirmationDialogComponent, ConfirmationData } from '../confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-session-history',
  standalone: true,
  imports: [CommonModule, ConfirmationDialogComponent],
  template: `
    <div class="history-container">
      <div class="history-header">
        <h3>Session History</h3>
        <div class="header-actions">
          <button class="danger-btn" (click)="onClearAll()" title="Clear All Sessions">
            Clear All
          </button>
          <button class="close-btn" (click)="onClose()" title="Back">
            <span class="icon">←</span>
          </button>
        </div>
      </div>
        
      <div class="history-content">
        @if (allSessions().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">📝</div>
            <h4>No sessions yet</h4>
            <p>Your conversation history will appear here.</p>
          </div>
        } @else {
          <div class="sessions-list">
            @for (session of allSessions(); track session.id) {
              <div class="session-item" 
                   [class.active]="!session.isClosed"
                   (click)="onSessionSelect(session)">
                <div class="session-main">
                  <div class="session-info">
                    <h4 class="session-title">{{ session.title }}</h4>
                    <div class="session-meta">
                      <span class="session-date">{{ formatDate(session.lastActivity) }}</span>
                      @if (getSessionPreview(session)) {
                        <span class="session-preview">{{ getSessionPreview(session) }}</span>
                      }
                    </div>
                    @if (session.type === 'conversation' && getAgentInfo(session)) {
                      <div class="session-agent">
                        <span class="agent-info">{{ getAgentInfo(session) }}</span>
                      </div>
                    }
                  </div>
                  
                  <div class="session-actions">
                    @if (!session.isClosed) {
                      <span class="status-badge active">Active</span>
                      <button class="action-btn close-btn-small" 
                              (click)="onCloseSession($event, session.id)"
                              title="Close session">
                        ×
                      </button>
                    } @else {
                      <span class="status-badge closed">Closed</span>
                      <button class="action-btn reopen-btn" 
                              (click)="onReopenSession($event, session.id)"
                              title="Reopen session">
                        ↻
                      </button>
                    }
                    <button class="action-btn delete-btn" 
                            (click)="onDeleteSession($event, session.id)"
                            title="Delete session permanently">
                      🗑️
                    </button>
                  </div>
                </div>
                
                @if (session.type === 'conversation') {
                  <div class="session-stats">
                    <span class="stat">{{ getMessageCount(session) }} messages</span>
                    <span class="stat">{{ session.type }}</span>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
      
      <div class="history-footer">
        <div class="footer-stats">
          <span>{{ getActiveCount() }} active, {{ getClosedCount() }} closed</span>
        </div>
      </div>

      <!-- Confirmation Dialog -->
      @if (confirmationData()) {
        <app-confirmation-dialog
          [data]="confirmationData()!"
          (confirm)="onConfirmationConfirm()"
          (cancel)="onConfirmationCancel()">
        </app-confirmation-dialog>
      }
    </div>
  `,
  styles: [`
    .history-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--vscode-editor-background);
    }

    .history-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
      flex-shrink: 0;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .history-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      border-radius: 4px;
      font-size: 18px;
      transition: background-color 0.2s;
    }

    .close-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .history-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-state h4 {
      margin: 0 0 8px 0;
      font-size: 16px;
      color: var(--vscode-foreground);
    }

    .empty-state p {
      margin: 0;
      color: var(--vscode-descriptionForeground);
    }

    .sessions-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .session-item {
      padding: 16px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-input-background);
      cursor: pointer;
      transition: all 0.2s;
    }

    .session-item:hover {
      background: var(--vscode-list-hoverBackground);
      border-color: var(--vscode-focusBorder);
    }

    .session-item.active {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-activeSelectionBackground);
    }

    .session-main {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .session-info {
      flex: 1;
      min-width: 0;
    }

    .session-title {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .session-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 4px;
    }

    .session-date {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .session-preview {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 300px;
    }

    .session-agent {
      margin-top: 4px;
    }

    .agent-info {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 6px;
      border-radius: 3px;
    }

    .session-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .status-badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
      font-weight: 500;
    }

    .status-badge.active {
      background: var(--vscode-terminal-ansiGreen);
      color: white;
    }

    .status-badge.closed {
      background: var(--vscode-descriptionForeground);
      color: var(--vscode-editor-background);
    }

    .action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      border-radius: 3px;
      font-size: 12px;
      transition: background-color 0.2s;
    }

    .action-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    .close-btn-small:hover {
      background: var(--vscode-errorForeground);
      color: white;
    }

    .reopen-btn:hover {
      background: var(--vscode-terminal-ansiGreen);
      color: white;
    }

    .delete-btn:hover {
      background: var(--vscode-errorForeground);
      color: white;
    }

    .danger-btn {
      padding: 6px 12px;
      border: 1px solid var(--vscode-errorForeground);
      background: transparent;
      color: var(--vscode-errorForeground);
      cursor: pointer;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .danger-btn:hover {
      background: var(--vscode-errorForeground);
      color: white;
    }

    .session-stats {
      display: flex;
      gap: 12px;
      padding-top: 8px;
      border-top: 1px solid var(--vscode-panel-border);
    }

    .stat {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .history-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }

    .footer-stats {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .primary-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .primary-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
  `]
})
export class SessionHistoryComponent {
  close = output<void>();

  private store = inject(Store);
  private sessionService = inject(SessionService);

  public confirmationData = signal<ConfirmationData | null>(null);
  private pendingAction: (() => void) | null = null;

  public allSessions(): SessionTab[] {
    const sessions = this.sessionService.getAllSessions();
    return sessions.sort((a, b) => {
      // Sort by active status first, then by last activity
      if (!a.isClosed && b.isClosed) { return -1; }
      if (a.isClosed && !b.isClosed) { return 1; }
      return b.lastActivity.getTime() - a.lastActivity.getTime();
    });
  }

  public onClose() {
    this.close.emit();
  }

  public onSessionSelect(session: SessionTab) {
    if (session.isClosed) {
      // Reopen the session using session service directly
      console.log('SessionHistory: Reopening session:', session.id);
      this.sessionService.reopenSession(session.id);
    } else {
      // Switch to the active session using session service directly
      console.log('SessionHistory: Switching to session:', session.id);
      this.sessionService.switchToSession(session.id);
    }
    this.onClose();
  }

  public onCloseSession(event: Event, sessionId: string) {
    event.stopPropagation();
    console.log('SessionHistory: Closing session:', sessionId);
    this.sessionService.closeSession(sessionId);
  }

  public onReopenSession(event: Event, sessionId: string) {
    event.stopPropagation();
    console.log('SessionHistory: Reopening session:', sessionId);
    this.sessionService.reopenSession(sessionId);
    // Automatically close the history view and switch to the chat
    this.onClose();
  }

  public onDeleteSession(event: Event, sessionId: string) {
    event.stopPropagation();
    this.confirmationData.set({
      title: 'Delete Session',
      message: 'Are you sure you want to permanently delete this session? This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    this.pendingAction = () => {
      console.log('SessionHistory: Deleting session:', sessionId);
      this.sessionService.deleteSession(sessionId);
    };
  }

  public onClearAll() {
    this.confirmationData.set({
      title: 'Clear All Sessions',
      message: 'Are you sure you want to delete all sessions? This will permanently remove all conversation history and cannot be undone.',
      confirmText: 'Clear All',
      cancelText: 'Cancel',
      type: 'danger'
    });
    this.pendingAction = () => {
      console.log('SessionHistory: Clearing all sessions');
      this.sessionService.clearAllSessions();
    };
  }

  public onConfirmationConfirm() {
    if (this.pendingAction) {
      this.pendingAction();
      this.pendingAction = null;
    }
    this.confirmationData.set(null);
  }

  public onConfirmationCancel() {
    this.pendingAction = null;
    this.confirmationData.set(null);
  }

  public formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) { return 'Just now'; }
    if (minutes < 60) { return `${minutes}m ago`; }
    if (hours < 24) { return `${hours}h ago`; }
    if (days < 7) { return `${days}d ago`; }

    return date.toLocaleDateString();
  }

  public getSessionPreview(session: SessionTab): string {
    if (session.type === 'conversation') {
      const convSession = session as ConversationSession;
      if (convSession.messages && convSession.messages.length > 0) {
        const firstUserMessage = convSession.messages.find(m => m.sender === 'user');
        if (firstUserMessage) {
          return firstUserMessage.content.substring(0, 100) + (firstUserMessage.content.length > 100 ? '...' : '');
        }
      }
    }
    return '';
  }

  public getAgentInfo(session: SessionTab): string {
    if (session.type === 'conversation') {
      const convSession = session as ConversationSession;
      if (convSession.agentConfig) {
        return `${convSession.agentConfig.provider} - ${convSession.agentConfig.model}`;
      }
    }
    return '';
  }

  public getMessageCount(session: SessionTab): number {
    if (session.type === 'conversation') {
      const convSession = session as ConversationSession;
      return convSession.messages ? convSession.messages.length : 0;
    }
    return 0;
  }

  public getActiveCount(): number {
    return this.allSessions().filter(s => !s.isClosed).length;
  }

  public getClosedCount(): number {
    return this.allSessions().filter(s => s.isClosed).length;
  }
}