import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MigrationExecutorService, MigrationStatus } from '../../services/migration-executor.service';

@Component({
  selector: 'app-migration-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="migration-status" *ngIf="migrationStatus().isRunning || showCompleted()">
      <div class="migration-header">
        <h3>Configuration Migration</h3>
        <div class="migration-progress">
          <div class="progress-bar">
            <div 
              class="progress-fill" 
              [style.width.%]="migrationStatus().progress">
            </div>
          </div>
          <span class="progress-text">{{ migrationStatus().progress }}%</span>
        </div>
      </div>
      
      <div class="migration-content">
        <p class="migration-step">{{ migrationStatus().currentStep }}</p>
        
        <div class="migration-details" *ngIf="migrationStatus().results">
          <div class="detail-item">
            <span class="detail-label">Providers Created:</span>
            <span class="detail-value">{{ migrationStatus().results!.providersCreated.length }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Agents Updated:</span>
            <span class="detail-value">{{ migrationStatus().results!.agentsUpdated.length }}</span>
          </div>
          <div class="detail-item" *ngIf="migrationStatus().results!.errors.length > 0">
            <span class="detail-label">Errors:</span>
            <span class="detail-value error">{{ migrationStatus().results!.errors.length }}</span>
          </div>
          <div class="detail-item" *ngIf="migrationStatus().results!.warnings.length > 0">
            <span class="detail-label">Warnings:</span>
            <span class="detail-value warning">{{ migrationStatus().results!.warnings.length }}</span>
          </div>
        </div>
        
        <div class="migration-actions" *ngIf="migrationStatus().isComplete">
          <button 
            class="btn btn-primary" 
            (click)="onDismiss()"
            *ngIf="!migrationStatus().hasErrors">
            Continue
          </button>
          <button 
            class="btn btn-secondary" 
            (click)="onRetry()"
            *ngIf="migrationStatus().hasErrors">
            Retry Migration
          </button>
          <button 
            class="btn btn-tertiary" 
            (click)="onViewReport()"
            *ngIf="migrationStatus().report">
            View Report
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .migration-status {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 20px;
      min-width: 400px;
      max-width: 500px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .migration-header {
      margin-bottom: 16px;
    }

    .migration-header h3 {
      margin: 0 0 12px 0;
      color: var(--vscode-foreground);
      font-size: 16px;
      font-weight: 600;
    }

    .migration-progress {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .progress-bar {
      flex: 1;
      height: 8px;
      background: var(--vscode-progressBar-background);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--vscode-progressBar-foreground);
      transition: width 0.3s ease;
    }

    .progress-text {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      min-width: 35px;
      text-align: right;
    }

    .migration-content {
      color: var(--vscode-foreground);
    }

    .migration-step {
      margin: 0 0 16px 0;
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
    }

    .migration-details {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 16px;
    }

    .detail-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .detail-item:last-child {
      margin-bottom: 0;
    }

    .detail-label {
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
    }

    .detail-value {
      font-size: 13px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .detail-value.error {
      color: var(--vscode-errorForeground);
    }

    .detail-value.warning {
      color: var(--vscode-warningForeground);
    }

    .migration-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .btn-tertiary {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border: 1px solid var(--vscode-button-border);
    }

    .btn-tertiary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
  `]
})
export class MigrationStatusComponent {
  public migrationStatus = signal<MigrationStatus>({
    isRunning: false,
    isComplete: false,
    hasErrors: false,
    currentStep: 'Not started',
    progress: 0
  });

  public showCompleted = signal(false);

  constructor(private migrationExecutor: MigrationExecutorService) {
    // Subscribe to migration status updates
    this.migrationExecutor.migrationStatus$.subscribe(status => {
      this.migrationStatus.set(status);
      
      // Show completed status for a few seconds
      if (status.isComplete && !status.hasErrors) {
        this.showCompleted.set(true);
        setTimeout(() => {
          this.showCompleted.set(false);
        }, 5000);
      }
    });
  }

  public onDismiss() {
    this.showCompleted.set(false);
  }

  public onRetry() {
    this.migrationExecutor.forceMigration();
  }

  public onViewReport() {
    const status = this.migrationStatus();
    if (status.report) {
      // Show report in a dialog or console
      console.log('Migration Report:', status.report);
      alert(status.report);
    }
  }
}