import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ConfirmationData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="confirmation-overlay" (click)="onCancel()">
      <div class="confirmation-modal" (click)="$event.stopPropagation()">
        <div class="confirmation-header">
          <h3>{{ data().title }}</h3>
        </div>
        
        <div class="confirmation-body">
          <p>{{ data().message }}</p>
        </div>
        
        <div class="confirmation-footer">
          <button class="secondary-btn" (click)="onCancel()">
            {{ data().cancelText || 'Cancel' }}
          </button>
          <button 
            class="primary-btn"
            [class.danger-btn]="data().type === 'danger'"
            [class.warning-btn]="data().type === 'warning'"
            (click)="onConfirm()">
            {{ data().confirmText || 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .confirmation-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }

    .confirmation-modal {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      width: 90%;
      max-width: 400px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .confirmation-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }

    .confirmation-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .confirmation-body {
      padding: 20px;
    }

    .confirmation-body p {
      margin: 0;
      color: var(--vscode-foreground);
      line-height: 1.5;
    }

    .confirmation-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px 20px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }

    .primary-btn, .secondary-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .primary-btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .primary-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .secondary-btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-button-border);
    }

    .secondary-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .danger-btn {
      background: var(--vscode-errorForeground);
      color: white;
    }

    .danger-btn:hover {
      background: var(--vscode-errorForeground);
      opacity: 0.9;
    }

    .warning-btn {
      background: var(--vscode-warningForeground);
      color: white;
    }

    .warning-btn:hover {
      background: var(--vscode-warningForeground);
      opacity: 0.9;
    }
  `]
})
export class ConfirmationDialogComponent {
  data = input.required<ConfirmationData>();
  
  confirm = output<void>();
  cancel = output<void>();

  onConfirm() {
    this.confirm.emit();
  }

  onCancel() {
    this.cancel.emit();
  }
}