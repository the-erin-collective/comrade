import { Component, EventEmitter, signal, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ErrorState, TimeoutState } from '../../models/session.model';
import { MessageService } from '../../services/message.service';

@Component({
  selector: 'app-error-handler',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (errorState()) {
      <div class="error-container" [class.recoverable]="errorState()?.recoverable">
        <div class="error-header">
          <span class="error-icon">⚠️</span>
          <span class="error-title">Operation Failed</span>
          <button class="error-close" (click)="dismissError()" aria-label="Dismiss error">×</button>
        </div>
        <div class="error-content">
          <p class="error-message">{{ errorState()?.message }}</p>
          @if (errorState()?.suggestedFix) {
            <div class="error-suggestion">
              <span class="suggestion-icon">💡</span>
              <span class="suggestion-text">{{ errorState()?.suggestedFix }}</span>
            </div>
          }
        </div>
        <div class="error-actions">
          @if (errorState()?.recoverable) {
            <button class="error-btn retry-btn" (click)="retryOperation()">
              <span class="btn-icon">🔄</span>
              Retry
            </button>
          }
          @if (errorState()?.configurationLink) {
            <button class="error-btn config-btn" (click)="openConfiguration()">
              <span class="btn-icon">⚙️</span>
              Configure
            </button>
          }
          <button class="error-btn dismiss-btn" (click)="dismissError()">
            Dismiss
          </button>
        </div>
      </div>
    }
    @if (timeoutState()) {
      <div class="timeout-container">
        <div class="timeout-header">
          <span class="timeout-icon">⏱️</span>
          <span class="timeout-title">Operation Taking Longer Than Expected</span>
        </div>
        <div class="timeout-content">
          <p class="timeout-message">{{ timeoutState()?.message }}</p>
        </div>
        <div class="timeout-actions">
          @if (timeoutState()?.allowExtension) {
            <button class="timeout-btn extend-btn" (click)="extendTimeout()">
              <span class="btn-icon">⏰</span>
              Extend Timeout
            </button>
          }
          <button class="timeout-btn cancel-btn" (click)="cancelOperation()">
            <span class="btn-icon">✖️</span>
            Cancel Operation
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .error-container, .timeout-container {
      background: var(--vscode-editorError-background);
      border: 1px solid var(--vscode-editorError-border);
      border-radius: 6px;
      margin: 8px 0;
      animation: slideIn 0.3s ease-out;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .error-container.recoverable {
      background: var(--vscode-editorWarning-background);
      border-color: var(--vscode-editorWarning-border);
    }

    .timeout-container {
      background: var(--vscode-editorInfo-background);
      border-color: var(--vscode-editorInfo-border);
    }

    @keyframes slideIn {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .error-header, .timeout-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 8px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .error-title, .timeout-title {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-editorError-foreground);
      margin-left: 8px;
      flex: 1;
    }

    .timeout-title {
      color: var(--vscode-editorInfo-foreground);
    }

    .error-icon, .timeout-icon {
      font-size: 16px;
    }

    .error-close {
      background: none;
      border: none;
      color: var(--vscode-editorError-foreground);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 0;
      opacity: 0.7;
      transition: opacity 0.2s;
    }

    .error-close:hover {
      opacity: 1;
    }

    .error-content, .timeout-content {
      padding: 8px 16px;
    }

    .error-message, .timeout-message {
      margin: 0;
      font-size: 12px;
      line-height: 1.4;
      color: var(--vscode-editorError-foreground);
    }

    .timeout-message {
      color: var(--vscode-editorInfo-foreground);
    }

    .error-suggestion {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 8px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
      border-left: 3px solid var(--vscode-editorInfo-border);
    }

    .suggestion-icon {
      font-size: 14px;
      margin-top: 1px;
    }

    .suggestion-text {
      font-size: 11px;
      line-height: 1.4;
      color: var(--vscode-editorInfo-foreground);
    }

    .error-actions, .timeout-actions {
      display: flex;
      gap: 8px;
      padding: 8px 16px 12px 16px;
      flex-wrap: wrap;
    }

    .error-btn, .timeout-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.1);
      color: inherit;
      cursor: pointer;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .error-btn:hover, .timeout-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
    }

    .retry-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    .retry-btn:hover {
      background: var(--vscode-button-hoverBackground);
      border-color: var(--vscode-button-hoverBackground);
    }

    .config-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border-color: var(--vscode-button-secondaryBackground);
    }

    .config-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      border-color: var(--vscode-button-secondaryHoverBackground);
    }

    .extend-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: var(--vscode-button-background);
    }

    .extend-btn:hover {
      background: var(--vscode-button-hoverBackground);
      border-color: var(--vscode-button-hoverBackground);
    }

    .cancel-btn {
      background: var(--vscode-editorError-background);
      color: var(--vscode-editorError-foreground);
      border-color: var(--vscode-editorError-border);
    }

    .cancel-btn:hover {
      background: rgba(255, 0, 0, 0.2);
      border-color: rgba(255, 0, 0, 0.4);
    }

    .dismiss-btn {
      opacity: 0.8;
    }

    .dismiss-btn:hover {
      opacity: 1;
    }

    .btn-icon {
      font-size: 12px;
    }
  `]
})
export class ErrorHandlerComponent {
  errorState = input<ErrorState | null>(null);
  timeoutState = input<TimeoutState | null>(null);

  errorDismissed = output<void>();
  operationRetried = output<void>();
  configurationOpened = output<string>();
  timeoutExtended = output<void>();
  operationCancelled = output<void>();

  constructor(private messageService: MessageService) {}

  public dismissError() {
    // No direct mutation of input signal, just emit
    this.errorDismissed.emit();
  }

  public retryOperation() {
    const error = this.errorState();
    if (error) {
      this.messageService.retryOperation(error.sessionId);
      this.errorDismissed.emit();
      this.operationRetried.emit();
    }
  }

  public openConfiguration() {
    const error = this.errorState();
    if (error?.configurationLink) {
      // Extract configuration type from link
      const configType = this.extractConfigType(error.configurationLink);
      this.messageService.openConfiguration(configType, error.sessionId);
      this.configurationOpened.emit(configType);
    }
  }

  public extendTimeout() {
    const timeout = this.timeoutState();
    if (timeout) {
      this.messageService.extendTimeout(timeout.sessionId);
      this.timeoutExtended.emit();
    }
  }

  public cancelOperation() {
    const timeout = this.timeoutState();
    const error = this.errorState();
    const sessionId = timeout?.sessionId || error?.sessionId;

    if (sessionId) {
      this.messageService.cancelOperation(sessionId);
      this.operationCancelled.emit();
    }
  }

  private extractConfigType(configurationLink: string): string {
    if (configurationLink.includes('api')) { return 'api'; }
    if (configurationLink.includes('agent')) { return 'agents'; }
    if (configurationLink.includes('mcp')) { return 'mcp'; }
    return 'general';
  }
}