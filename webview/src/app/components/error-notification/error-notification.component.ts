/**
 * Error Notification Component
 * 
 * Displays error messages, warnings, and info notifications to users.
 * Integrates with the ErrorHandlerService for centralized error management.
 */

import { Component, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ErrorHandlerService, ErrorInfo, ErrorStats } from '../../services/error-handler.service';

@Component({
  selector: 'app-error-notification',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="error-notification-container">
      <!-- Error Statistics (for debugging/admin) -->
      @if (showStats && (errorStats$ | async); as stats) {
        <div class="error-stats" [class.has-errors]="stats.totalErrors > 0">
          <div class="stats-summary">
            <span class="stat-item">
              <span class="stat-value">{{ stats.totalErrors }}</span>
              <span class="stat-label">Total</span>
            </span>
            <span class="stat-item">
              <span class="stat-value">{{ stats.recentErrors }}</span>
              <span class="stat-label">Recent</span>
            </span>
          </div>
          @if (stats.totalErrors > 0) {
            <button class="clear-all-btn" (click)="clearAllErrors()">
              Clear All
            </button>
          }
        </div>
      }

      <!-- Error List -->
      <div class="error-list">
        @for (error of visibleErrors$ | async; track error.id) {
          <div 
            class="error-item" 
            [class]="getErrorClasses(error)"
            [attr.data-error-id]="error.id"
          >
            <div class="error-header">
              <div class="error-icon">
                {{ getErrorIcon(error.type) }}
              </div>
              <div class="error-content">
                <div class="error-title">{{ error.title }}</div>
                <div class="error-message">{{ error.message }}</div>
                @if (error.context) {
                  <div class="error-context">{{ error.context }}</div>
                }
              </div>
              <div class="error-controls">
                @if (error.details && !isDetailsExpanded(error.id)) {
                  <button 
                    class="details-btn" 
                    (click)="toggleDetails(error.id)"
                    title="Show details"
                  >
                    <span class="icon">ⓘ</span>
                  </button>
                }
                @if (error.details && isDetailsExpanded(error.id)) {
                  <button 
                    class="details-btn expanded" 
                    (click)="toggleDetails(error.id)"
                    title="Hide details"
                  >
                    <span class="icon">ⓘ</span>
                  </button>
                }
                <button 
                  class="dismiss-btn" 
                  (click)="dismissError(error.id)"
                  title="Dismiss"
                >
                  <span class="icon">×</span>
                </button>
              </div>
            </div>

            <!-- Error Details -->
            @if (error.details && isDetailsExpanded(error.id)) {
              <div class="error-details">
                <pre>{{ error.details }}</pre>
              </div>
            }

            <!-- Error Actions -->
            @if (error.actions && error.actions.length > 0) {
              <div class="error-actions">
                @for (action of error.actions; track action.label) {
                  <button 
                    class="action-btn"
                    [class.primary]="action.primary"
                    (click)="executeAction(action, error.id)"
                  >
                    {{ action.label }}
                  </button>
                }
              </div>
            }

            <!-- Timestamp -->
            <div class="error-timestamp">
              {{ formatTimestamp(error.timestamp) }}
            </div>
          </div>
        }
      </div>

      <!-- Empty State -->
      @if ((visibleErrors$ | async)?.length === 0) {
        <div class="empty-state">
          <div class="empty-icon">✅</div>
          <div class="empty-message">No errors or notifications</div>
        </div>
      }
    </div>
  `,
  styles: [`
    .error-notification-container {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 400px;
      overflow-y: auto;
    }

    /* Error Statistics */
    .error-stats {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.75rem;
      background: var(--background-secondary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-size: 0.75rem;
    }

    .error-stats.has-errors {
      border-color: var(--error-color, #f44336);
      background: var(--error-bg, #fee);
    }

    .stats-summary {
      display: flex;
      gap: 1rem;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.125rem;
    }

    .stat-value {
      font-weight: 600;
      color: var(--text-color);
    }

    .stat-label {
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .clear-all-btn {
      padding: 0.25rem 0.5rem;
      background: var(--error-color, #f44336);
      color: white;
      border: none;
      border-radius: 3px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: opacity 0.2s ease;
    }

    .clear-all-btn:hover {
      opacity: 0.8;
    }

    /* Error List */
    .error-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .error-item {
      background: var(--background-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 0.75rem;
      transition: all 0.2s ease;
    }

    .error-item.error {
      border-color: var(--error-color, #f44336);
      background: var(--error-bg, #fee);
    }

    .error-item.warning {
      border-color: var(--warning-color, #ff9800);
      background: var(--warning-bg, #fff3e0);
    }

    .error-item.info {
      border-color: var(--info-color, #2196f3);
      background: var(--info-bg, #e3f2fd);
    }

    .error-item:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    /* Error Header */
    .error-header {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .error-icon {
      font-size: 1.25rem;
      line-height: 1;
      margin-top: 0.125rem;
    }

    .error-content {
      flex: 1;
      min-width: 0;
    }

    .error-title {
      font-weight: 600;
      color: var(--text-color);
      margin-bottom: 0.25rem;
    }

    .error-message {
      color: var(--text-color);
      line-height: 1.4;
      word-wrap: break-word;
    }

    .error-context {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
      font-style: italic;
    }

    .error-controls {
      display: flex;
      gap: 0.25rem;
      margin-left: 0.5rem;
    }

    .details-btn,
    .dismiss-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: none;
      border: 1px solid var(--border-color);
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 0.875rem;
    }

    .details-btn:hover,
    .dismiss-btn:hover {
      background: var(--hover-bg);
      border-color: var(--primary-color);
    }

    .details-btn.expanded {
      background: var(--primary-color);
      color: white;
      border-color: var(--primary-color);
    }

    .dismiss-btn:hover {
      background: var(--error-color, #f44336);
      color: white;
      border-color: var(--error-color, #f44336);
    }

    /* Error Details */
    .error-details {
      margin-top: 0.75rem;
      padding: 0.75rem;
      background: var(--background-tertiary, #f5f5f5);
      border: 1px solid var(--border-color);
      border-radius: 4px;
    }

    .error-details pre {
      margin: 0;
      font-family: 'Courier New', monospace;
      font-size: 0.75rem;
      line-height: 1.4;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    /* Error Actions */
    .error-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border-color);
    }

    .action-btn {
      padding: 0.375rem 0.75rem;
      background: var(--background-color);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .action-btn:hover {
      background: var(--hover-bg);
      border-color: var(--primary-color);
    }

    .action-btn.primary {
      background: var(--primary-color);
      color: white;
      border-color: var(--primary-color);
    }

    .action-btn.primary:hover {
      background: var(--primary-hover);
    }

    /* Error Timestamp */
    .error-timestamp {
      font-size: 0.625rem;
      color: var(--text-tertiary, var(--text-secondary));
      margin-top: 0.5rem;
      text-align: right;
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary);
    }

    .empty-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    .empty-message {
      font-size: 0.875rem;
    }

    /* Scrollbar Styling */
    .error-notification-container::-webkit-scrollbar {
      width: 6px;
    }

    .error-notification-container::-webkit-scrollbar-track {
      background: var(--background-secondary);
    }

    .error-notification-container::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 3px;
    }

    .error-notification-container::-webkit-scrollbar-thumb:hover {
      background: var(--text-secondary);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorNotificationComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private expandedDetails = new Set<string>();

  public errors$: Observable<ErrorInfo[]>;
  public visibleErrors$: Observable<ErrorInfo[]>;
  public errorStats$: Observable<ErrorStats>;
  public showStats = false; // Can be toggled for debugging

  constructor(private errorHandler: ErrorHandlerService) {
    this.errors$ = this.errorHandler.errors$;
    this.errorStats$ = this.errorHandler.errorStats$;
    
    // Filter out dismissed errors
    this.visibleErrors$ = this.errors$.pipe(
      takeUntil(this.destroy$)
    );
  }

  ngOnInit(): void {
    // Auto-dismiss info messages after 5 seconds
    this.errors$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(errors => {
      errors.forEach(error => {
        if (error.type === 'info' && !error.dismissed) {
          setTimeout(() => {
            this.errorHandler.dismissError(error.id);
          }, 5000);
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Get CSS classes for error item
   */
  getErrorClasses(error: ErrorInfo): string {
    const classes: string[] = [error.type];
    if (error.dismissed) {
      classes.push('dismissed');
    }
    return classes.join(' ');
  }

  /**
   * Get icon for error type
   */
  getErrorIcon(type: 'error' | 'warning' | 'info'): string {
    switch (type) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '❓';
    }
  }

  /**
   * Check if error details are expanded
   */
  isDetailsExpanded(errorId: string): boolean {
    return this.expandedDetails.has(errorId);
  }

  /**
   * Toggle error details visibility
   */
  toggleDetails(errorId: string): void {
    if (this.expandedDetails.has(errorId)) {
      this.expandedDetails.delete(errorId);
    } else {
      this.expandedDetails.add(errorId);
    }
  }

  /**
   * Dismiss an error
   */
  dismissError(errorId: string): void {
    this.errorHandler.dismissError(errorId);
    this.expandedDetails.delete(errorId);
  }

  /**
   * Clear all errors
   */
  clearAllErrors(): void {
    this.errorHandler.clearAllErrors();
    this.expandedDetails.clear();
  }

  /**
   * Execute error action
   */
  executeAction(action: any, errorId: string): void {
    try {
      action.action();
      // Optionally dismiss the error after successful action
      this.dismissError(errorId);
    } catch (error) {
      this.errorHandler.handleError(error, 'Error Action Execution');
    }
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    
    if (diff < 60000) { // Less than 1 minute
      return 'Just now';
    } else if (diff < 3600000) { // Less than 1 hour
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diff < 86400000) { // Less than 1 day
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      return timestamp.toLocaleDateString();
    }
  }

  /**
   * Toggle stats visibility (for debugging)
   */
  toggleStats(): void {
    this.showStats = !this.showStats;
  }
}