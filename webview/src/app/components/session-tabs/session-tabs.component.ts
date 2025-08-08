import { Component, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store, select } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as SessionActions from '../../state/session/session.actions';

@Component({
  selector: 'app-session-tabs',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="session-tabs">
      <ng-container *ngFor="let session of sessions$ | async; trackBy: trackById">
        <button 
          class="session-tab"
          [class.active]="session.isActive"
          (click)="switchToSession(session.id)">
          <span class="session-tab-title">{{ session.title }}</span>
          <button 
            class="session-tab-close" 
            (click)="closeSession($event, session.id)"
            title="Close session">
            &times;
          </button>
        </button>
      </ng-container>
      <div class="session-controls">
        <button 
          class="session-control-btn" 
          (click)="createNewSession()"
          title="Create new session">
          New
        </button>
        <button 
          class="session-control-btn" 
          (click)="showSessionHistory()"
          title="Show session history">
          History
        </button>
      </div>
    </div>
  `,
  styles: [`
    .session-tabs {
      display: flex;
      align-items: center;
      border-bottom: 1px solid var(--vscode-panel-border);
      background-color: var(--vscode-sideBar-background);
      min-height: 40px;
      padding: 0 8px;
      overflow-x: auto;
      flex-shrink: 0;
    }

    .session-tab {
      display: flex;
      align-items: center;
      padding: 8px 16px;
      border: none;
      background: transparent;
      color: var(--vscode-tab-inactiveForeground);
      cursor: pointer;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 500;
      min-width: 0;
      border-radius: 6px 6px 0 0;
      margin-right: 2px;
      transition: all 0.2s ease;
      position: relative;
    }

    .session-tab:hover {
      background-color: var(--vscode-tab-hoverBackground);
      color: var(--vscode-tab-activeForeground);
    }

    .session-tab.active {
      background-color: var(--vscode-tab-activeBackground);
      color: var(--vscode-tab-activeForeground);
      border-bottom: 2px solid var(--vscode-tab-activeBorder);
    }

    .session-tab.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--vscode-focusBorder);
    }

    .session-tab-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-right: 8px;
      max-width: 120px;
    }

    .session-tab-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      border-radius: 3px;
      font-size: 12px;
      line-height: 1;
      opacity: 0.6;
      transition: all 0.2s ease;
    }

    .session-tab-close:hover {
      background-color: var(--vscode-toolbar-hoverBackground);
      opacity: 1;
    }

    .session-controls {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      padding-left: 12px;
    }

    .session-control-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 6px 12px;
      border: 1px solid var(--vscode-button-border);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s ease;
      min-width: 60px;
    }

    .session-control-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      transform: translateY(-1px);
    }

    .session-control-btn:active {
      transform: translateY(0);
    }
  `]
})
export class SessionTabsComponent {
  public sessions$: Observable<any[]>;

  constructor(private store: Store<any>) {
    this.sessions$ = this.store.select(state => state.session.sessions);
  }

  public trackById(index: number, session: any) {
    return session.id;
  }

  public switchToSession(sessionId: string) {
    // Optionally dispatch a switch action here
    // this.store.dispatch(SessionActions.switchToSession({ sessionId }));
  }

  public closeSession(event: Event, sessionId: string) {
    event.stopPropagation();
    // Optionally dispatch a close action here
    // this.store.dispatch(SessionActions.closeSession({ sessionId }));
  }

  public createNewSession() {
    this.store.dispatch(SessionActions.createSession({ sessionType: 'conversation' }));
  }

  public showSessionHistory() {
    // TODO: Implement session history display
    console.log('Show session history');
  }
}