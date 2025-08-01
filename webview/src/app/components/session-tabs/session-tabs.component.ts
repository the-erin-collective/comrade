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
      border-bottom: 1px solid var(--border-color);
      background-color: var(--secondary-background);
      min-height: 32px;
      overflow-x: auto;
    }

    .session-tab {
      display: flex;
      align-items: center;
      padding: 6px 12px;
      border: none;
      background: transparent;
      color: var(--text-color);
      cursor: pointer;
      white-space: nowrap;
      border-right: 1px solid var(--border-color);
      font-size: 12px;
      min-width: 0;
      transition: background-color 0.2s;
    }

    .session-tab:hover {
      background-color: var(--primary-hover-color);
    }

    .session-tab.active {
      background-color: var(--primary-color);
      color: var(--vscode-button-foreground);
    }

    .session-tab-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-right: 6px;
    }

    .session-tab-close {
      padding: 2px 4px;
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      border-radius: 2px;
      font-size: 14px;
      line-height: 1;
      opacity: 0.7;
      transition: all 0.2s;
    }

    .session-tab-close:hover {
      background-color: rgba(255, 255, 255, 0.2);
      opacity: 1;
    }

    .session-controls {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      gap: 4px;
      margin-left: auto;
    }

    .session-control-btn {
      padding: 4px 8px;
      border: 1px solid var(--border-color);
      background: var(--input-background);
      color: var(--text-color);
      cursor: pointer;
      border-radius: 2px;
      font-size: 11px;
      transition: background-color 0.2s;
    }

    .session-control-btn:hover {
      background: var(--primary-hover-color);
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