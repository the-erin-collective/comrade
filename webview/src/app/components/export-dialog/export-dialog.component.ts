import { Component, Inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';

export interface ExportDialogData {
  conversationId: string;
  conversationTitle: string;
}

export interface ExportOptions {
  format: 'json' | 'markdown' | 'csv' | 'html' | 'txt';
  includeToolExecutions: boolean;
  includeMetadata: boolean;
  includeSystemPrompts: boolean;
  includeStatistics: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  senderFilter?: ('user' | 'assistant' | 'system' | 'tool')[];
  successfulToolsOnly?: boolean;
  prettyPrint?: boolean;
}

@Component({
  selector: 'app-export-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatIconModule
  ],
  template: `
    <div class="export-dialog">
      <h2 mat-dialog-title>
        <mat-icon>download</mat-icon>
        Export Conversation
      </h2>
      
      <mat-dialog-content class="export-content">
        <div class="conversation-info">
          <h3>{{ data.conversationTitle }}</h3>
          <p class="conversation-id">ID: {{ data.conversationId }}</p>
        </div>

        <div class="export-options">
          <!-- Format Selection -->
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Export Format</mat-label>
            <mat-select [(value)]="exportOptions.format">
              <mat-option value="json">JSON</mat-option>
              <mat-option value="markdown">Markdown</mat-option>
              <mat-option value="csv">CSV</mat-option>
              <mat-option value="html">HTML</mat-option>
              <mat-option value="txt">Plain Text</mat-option>
            </mat-select>
            <mat-hint>Choose the format for your exported conversation</mat-hint>
          </mat-form-field>

          <!-- Content Options -->
          <div class="content-options">
            <h4>Content Options</h4>
            
            <mat-checkbox [(ngModel)]="exportOptions.includeToolExecutions">
              Include Tool Executions
            </mat-checkbox>
            
            <mat-checkbox [(ngModel)]="exportOptions.includeMetadata">
              Include Metadata (timestamps, token counts)
            </mat-checkbox>
            
            <mat-checkbox [(ngModel)]="exportOptions.includeSystemPrompts">
              Include System Prompts
            </mat-checkbox>
            
            <mat-checkbox [(ngModel)]="exportOptions.includeStatistics">
              Include Statistics
            </mat-checkbox>

            <mat-checkbox 
              [(ngModel)]="exportOptions.prettyPrint"
              [disabled]="exportOptions.format !== 'json'">
              Pretty Print JSON
            </mat-checkbox>
          </div>

          <!-- Filter Options -->
          <div class="filter-options">
            <h4>Filter Options</h4>
            
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Message Senders</mat-label>
              <mat-select [(value)]="exportOptions.senderFilter" multiple>
                <mat-option value="user">User</mat-option>
                <mat-option value="assistant">Assistant</mat-option>
                <mat-option value="system">System</mat-option>
                <mat-option value="tool">Tool</mat-option>
              </mat-select>
              <mat-hint>Leave empty to include all message types</mat-hint>
            </mat-form-field>

            <mat-checkbox [(ngModel)]="useDateRange">
              Filter by Date Range
            </mat-checkbox>

            @if (useDateRange()) {
              <div class="date-range">
                <mat-form-field appearance="outline">
                  <mat-label>Start Date</mat-label>
                  <input matInput [matDatepicker]="startPicker" [(ngModel)]="startDate">
                  <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
                  <mat-datepicker #startPicker></mat-datepicker>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>End Date</mat-label>
                  <input matInput [matDatepicker]="endPicker" [(ngModel)]="endDate">
                  <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
                  <mat-datepicker #endPicker></mat-datepicker>
                </mat-form-field>
              </div>
            }

            @if (exportOptions.includeToolExecutions) {
              <mat-checkbox [(ngModel)]="exportOptions.successfulToolsOnly">
                Include Only Successful Tool Executions
              </mat-checkbox>
            }
          </div>
        </div>

        @if (isExporting()) {
          <div class="export-progress">
            <mat-spinner diameter="24"></mat-spinner>
            <span>Exporting conversation...</span>
          </div>
        }

        @if (exportResult()) {
          <div class="export-result" [class.success]="exportResult()!.success" [class.error]="!exportResult()!.success">
            @if (exportResult()!.success) {
              <mat-icon>check_circle</mat-icon>
              <div>
                <p><strong>Export Successful!</strong></p>
                @if (exportResult()!.filePath) {
                  <p class="file-path">Saved to: {{ exportResult()!.filePath }}</p>
                }
                <p class="stats">
                  {{ exportResult()!.statistics.messageCount }} messages, 
                  {{ exportResult()!.statistics.toolExecutionCount }} tool executions
                  ({{ (exportResult()!.statistics.exportSize / 1024).toFixed(1) }} KB)
                </p>
              </div>
            } @else {
              <mat-icon>error</mat-icon>
              <div>
                <p><strong>Export Failed</strong></p>
                <p class="error-message">{{ exportResult()!.error }}</p>
              </div>
            }
          </div>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="onCancel()" [disabled]="isExporting()">
          Cancel
        </button>
        <button 
          mat-raised-button 
          color="primary" 
          (click)="onExport()"
          [disabled]="isExporting()">
          @if (isExporting()) {
            <mat-spinner diameter="16"></mat-spinner>
          } @else {
            <mat-icon>download</mat-icon>
          }
          Export
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .export-dialog {
      min-width: 500px;
      max-width: 600px;
    }

    .export-content {
      max-height: 70vh;
      overflow-y: auto;
    }

    .conversation-info {
      background: #f5f5f5;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 24px;
    }

    .conversation-info h3 {
      margin: 0 0 8px 0;
      color: #333;
    }

    .conversation-id {
      margin: 0;
      color: #666;
      font-size: 0.9em;
      font-family: monospace;
    }

    .export-options {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .full-width {
      width: 100%;
    }

    .content-options,
    .filter-options {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
    }

    .content-options h4,
    .filter-options h4 {
      margin: 0 0 16px 0;
      color: #333;
      font-size: 1.1em;
    }

    .content-options mat-checkbox,
    .filter-options mat-checkbox {
      display: block;
      margin-bottom: 12px;
    }

    .date-range {
      display: flex;
      gap: 16px;
      margin-top: 16px;
    }

    .date-range mat-form-field {
      flex: 1;
    }

    .export-progress {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: #f0f7ff;
      border-radius: 8px;
      margin-top: 16px;
    }

    .export-result {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      border-radius: 8px;
      margin-top: 16px;
    }

    .export-result.success {
      background: #f0f8f0;
      color: #2e7d32;
    }

    .export-result.error {
      background: #fff3f3;
      color: #d32f2f;
    }

    .export-result mat-icon {
      margin-top: 2px;
    }

    .file-path {
      font-family: monospace;
      font-size: 0.9em;
      background: rgba(0,0,0,0.1);
      padding: 4px 8px;
      border-radius: 4px;
      margin: 8px 0;
    }

    .stats {
      font-size: 0.9em;
      opacity: 0.8;
    }

    .error-message {
      font-family: monospace;
      font-size: 0.9em;
    }

    mat-dialog-actions button {
      margin-left: 8px;
    }

    mat-dialog-actions button mat-spinner {
      margin-right: 8px;
    }
  `]
})
export class ExportDialogComponent {
  exportOptions: ExportOptions = {
    format: 'markdown',
    includeToolExecutions: true,
    includeMetadata: true,
    includeSystemPrompts: false,
    includeStatistics: true,
    prettyPrint: true
  };

  useDateRange = signal(false);
  startDate: Date | null = null;
  endDate: Date | null = null;
  isExporting = signal(false);
  exportResult = signal<any>(null);

  constructor(
    public dialogRef: MatDialogRef<ExportDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ExportDialogData
  ) {}

  onCancel(): void {
    this.dialogRef.close();
  }

  async onExport(): Promise<void> {
    this.isExporting.set(true);
    this.exportResult.set(null);

    try {
      // Prepare export options
      const options: ExportOptions = { ...this.exportOptions };

      // Add date range if specified
      if (this.useDateRange() && this.startDate && this.endDate) {
        options.dateRange = {
          start: this.startDate,
          end: this.endDate
        };
      }

      // Send export request to extension
      const result = await this.sendExportRequest(options);
      this.exportResult.set(result);

      // Close dialog after successful export (with delay to show result)
      if (result.success) {
        setTimeout(() => {
          this.dialogRef.close(result);
        }, 2000);
      }
    } catch (error) {
      this.exportResult.set({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown export error',
        statistics: {
          messageCount: 0,
          toolExecutionCount: 0,
          exportSize: 0,
          processingTime: 0
        }
      });
    } finally {
      this.isExporting.set(false);
    }
  }

  private async sendExportRequest(options: ExportOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      // Send message to VS Code extension
      const vscode = (window as any).acquireVsCodeApi();
      
      const messageId = Date.now().toString();
      
      // Listen for response
      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'exportResult' && message.messageId === messageId) {
          window.removeEventListener('message', handleMessage);
          if (message.success) {
            resolve(message.result);
          } else {
            reject(new Error(message.error));
          }
        }
      };

      window.addEventListener('message', handleMessage);

      // Send export request
      vscode.postMessage({
        type: 'exportConversation',
        messageId,
        conversationId: this.data.conversationId,
        options
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        reject(new Error('Export request timed out'));
      }, 30000);
    });
  }
} 