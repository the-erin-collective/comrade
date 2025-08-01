import { Component, EventEmitter, signal, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressState } from '../../models/session.model';
import { MessageService } from '../../services/message.service';

@Component({
  selector: 'app-progress-indicator',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  @if (progressState() && progressState()!.isActive) {
      <div class="progress-container">
        <div class="progress-content">
          <div class="progress-spinner">
            <div class="spinner"></div>
          </div>
          
          <div class="progress-info">
            <span class="progress-message">{{ progressState()?.message }}</span>
            <div class="progress-details">
              <span class="progress-status">Processing...</span>
            </div>
          </div>
          
          @if (progressState()?.cancellable) {
            <button 
              class="progress-cancel-btn" 
              (click)="cancelOperation()"
              title="Cancel Operation"
              aria-label="Cancel current operation">
              <span class="cancel-icon">✖️</span>
              <span class="cancel-text">Cancel</span>
            </button>
          }
        </div>
        
        <div class="progress-bar">
          <div class="progress-bar-fill"></div>
        </div>
      </div>
    }
  `,
  styles: [`
    .progress-container {
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 6px;
      margin: 8px 0;
      animation: slideDown 0.3s ease-out;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    @keyframes slideDown {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .progress-content {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      gap: 12px;
    }

    .progress-spinner {
      flex-shrink: 0;
    }

    .spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--vscode-progressBar-background);
      border-top: 2px solid var(--vscode-button-background);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .progress-info {
      flex: 1;
      min-width: 0;
    }

    .progress-message {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--vscode-foreground);
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .progress-details {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .progress-status {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .progress-cancel-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border: 1px solid var(--vscode-button-border);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.2s;
      flex-shrink: 0;
    }

    .progress-cancel-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      border-color: var(--vscode-button-secondaryHoverBackground);
      transform: translateY(-1px);
    }

    .progress-cancel-btn:active {
      transform: translateY(0);
    }

    .cancel-icon {
      font-size: 10px;
    }

    .cancel-text {
      font-weight: 500;
    }

    .progress-bar {
      height: 3px;
      background: var(--vscode-progressBar-background);
      border-radius: 0 0 6px 6px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: var(--vscode-button-background);
      animation: progressPulse 2s ease-in-out infinite;
      transform-origin: left;
    }

    @keyframes progressPulse {
      0% { transform: scaleX(0.3); opacity: 0.6; }
      50% { transform: scaleX(0.8); opacity: 1; }
      100% { transform: scaleX(0.3); opacity: 0.6; }
    }

    /* Status bar style variant */
    .progress-container.status-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      margin: 0;
      border-radius: 0;
      border-left: none;
      border-right: none;
      border-bottom: none;
      z-index: 1000;
      animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    .progress-container.status-bar .progress-content {
      padding: 8px 16px;
    }

    .progress-container.status-bar .progress-message {
      font-size: 12px;
    }

    .progress-container.status-bar .progress-cancel-btn {
      padding: 4px 8px;
      font-size: 10px;
    }
  `]
})
export class ProgressIndicatorComponent {
  progressState = input<ProgressState | null>(null);
  variant = input<'inline' | 'status-bar'>('inline');
  operationCancelled = output<void>();

  constructor(private messageService: MessageService) {}

  public cancelOperation() {
    const progress = this.progressState();
    if (progress && progress.cancellable) {
      this.messageService.cancelOperation(progress.sessionId);
      this.operationCancelled.emit();
    }
  }
}