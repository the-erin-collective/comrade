/**
 * Notification Component
 * 
 * Displays notifications from the MessageService with proper close button functionality
 * and accessibility attributes.
 */

import { Component, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MessageService, NotificationMessage } from '../../services/message.service';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="notifications-container">
      @for (notification of notifications$ | async; track notification.id) {
        <div 
          class="notification"
          [ngClass]="'notification-' + notification.type"
          [attr.data-notification-id]="notification.id"
          role="alert"
          [attr.aria-live]="notification.type === 'error' ? 'assertive' : 'polite'"
        >
          <div class="notification-content">
            <span class="notification-icon" [ngClass]="getIconClass(notification.type)" aria-hidden="true">
              {{ getNotificationIcon(notification.type) }}
            </span>
            <span class="notification-message">{{ notification.message }}</span>
          </div>
          @if (notification.dismissible) {
            <button 
              class="notification-close"
              (click)="dismissNotification(notification.id)"
              aria-label="Close notification"
              title="Close notification"
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .notifications-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      max-width: 400px;
      pointer-events: none;
    }

    .notification {
      display: flex;
      align-items: flex-start;
      padding: 12px 16px;
      margin-bottom: 8px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      border-left: 4px solid;
      pointer-events: auto;
      
      /* Dark theme colors */
      background-color: var(--vscode-notifications-background, #2d2d30);
      color: var(--vscode-notifications-foreground, #cccccc);
      border-color: var(--vscode-notifications-border, #454545);
    }

    .notification-success {
      border-left-color: var(--vscode-notificationsInfoIcon-foreground, #75beff);
      background-color: var(--vscode-notifications-background, #2d2d30);
    }

    .notification-error {
      border-left-color: var(--vscode-notificationsErrorIcon-foreground, #f48771);
      background-color: var(--vscode-notifications-background, #2d2d30);
    }

    .notification-info {
      border-left-color: var(--vscode-notificationsInfoIcon-foreground, #75beff);
      background-color: var(--vscode-notifications-background, #2d2d30);
    }

    .notification-warning {
      border-left-color: var(--vscode-notificationsWarningIcon-foreground, #ffcc02);
      background-color: var(--vscode-notifications-background, #2d2d30);
    }

    .notification-content {
      display: flex;
      align-items: center;
      flex: 1;
      gap: 8px;
    }

    .notification-icon {
      font-size: 16px;
      line-height: 1;
    }

    .notification-message {
      flex: 1;
      word-wrap: break-word;
    }

    .notification-close {
      background: none;
      border: none;
      color: var(--vscode-notifications-foreground, #cccccc);
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      margin-left: 12px;
      opacity: 0.7;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 2px;
      
      &:hover {
        opacity: 1;
        background-color: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
      }
      
      &:focus {
        outline: 1px solid var(--vscode-focusBorder, #007acc);
        outline-offset: 2px;
        opacity: 1;
      }
    }

    /* Animation for new notifications */
    .notification {
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  
  public notifications$: Observable<NotificationMessage[]>;

  constructor(private messageService: MessageService) {
    this.notifications$ = this.messageService.notifications$.pipe(
      takeUntil(this.destroy$)
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Get icon for notification type
   */
  getNotificationIcon(type: 'success' | 'error' | 'info' | 'warning'): string {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'info':
        return 'ℹ';
      case 'warning':
        return '⚠';
      default:
        return '•';
    }
  }

  /**
   * Get CSS class for notification icon
   */
  getIconClass(type: 'success' | 'error' | 'info' | 'warning'): string {
    return `icon-${type}`;
  }

  /**
   * Dismiss a notification
   */
  dismissNotification(notificationId: string): void {
    this.messageService.dismissMessage(notificationId);
  }
}