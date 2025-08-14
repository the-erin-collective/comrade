import { Component, Input, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface DebugEvent {
  id: string;
  sessionId: string;
  type: string;
  timestamp: Date;
  data: any;
  metadata: {
    duration?: number;
    tokenCount?: number;
    errorCode?: string;
    stackTrace?: string;
  };
}

export interface DebugSession {
  id: string;
  title: string;
  startTime: Date;
  endTime?: Date;
  messageCount: number;
  toolExecutionCount: number;
  errorCount: number;
  averageResponseTime: number;
  status: 'active' | 'completed' | 'error';
}

export interface PerformanceMetrics {
  responseTime: {
    average: number;
    median: number;
    p95: number;
    p99: number;
  };
  tokenUsage: {
    average: number;
    total: number;
    byModel: Record<string, number>;
  };
  toolPerformance: {
    successRate: number;
    averageExecutionTime: number;
    byTool: Record<string, {
      count: number;
      successRate: number;
      averageTime: number;
    }>;
  };
  errorMetrics: {
    totalErrors: number;
    errorRate: number;
    byType: Record<string, number>;
  };
}

@Component({
  selector: 'app-debug-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule,
    MatTooltipModule
  ],
  template: `
    <div class="debug-panel">
      <div class="debug-header">
        <h3>
          <mat-icon>bug_report</mat-icon>
          Debug Panel
        </h3>
        <div class="debug-actions">
          <button mat-button (click)="refreshDebugData()" [disabled]="isLoading()">
            <mat-icon>refresh</mat-icon>
            Refresh
          </button>
          <button mat-button (click)="generateReport()" [disabled]="isLoading()">
            <mat-icon>assessment</mat-icon>
            Generate Report
          </button>
          <button mat-button (click)="clearDebugData()" [disabled]="isLoading()">
            <mat-icon>clear_all</mat-icon>
            Clear Data
          </button>
        </div>
      </div>

      @if (isLoading()) {
        <div class="loading-container">
          <mat-spinner diameter="32"></mat-spinner>
          <p>Loading debug data...</p>
        </div>
      } @else {
        <mat-tab-group class="debug-tabs">
          <!-- Session Overview -->
          <mat-tab label="Session Overview">
            <div class="tab-content">
              @if (debugSession()) {
                <mat-card class="session-card">
                  <mat-card-header>
                    <mat-card-title>{{ debugSession()!.title }}</mat-card-title>
                    <mat-card-subtitle>Session ID: {{ debugSession()!.id }}</mat-card-subtitle>
                  </mat-card-header>
                  <mat-card-content>
                    <div class="session-stats">
                      <div class="stat-item">
                        <mat-icon>schedule</mat-icon>
                        <div>
                          <span class="stat-label">Duration</span>
                          <span class="stat-value">{{ formatDuration(debugSession()!.startTime, debugSession()!.endTime) }}</span>
                        </div>
                      </div>
                      <div class="stat-item">
                        <mat-icon>chat</mat-icon>
                        <div>
                          <span class="stat-label">Messages</span>
                          <span class="stat-value">{{ debugSession()!.messageCount }}</span>
                        </div>
                      </div>
                      <div class="stat-item">
                        <mat-icon>build</mat-icon>
                        <div>
                          <span class="stat-label">Tool Executions</span>
                          <span class="stat-value">{{ debugSession()!.toolExecutionCount }}</span>
                        </div>
                      </div>
                      <div class="stat-item">
                        <mat-icon>error</mat-icon>
                        <div>
                          <span class="stat-label">Errors</span>
                          <span class="stat-value">{{ debugSession()!.errorCount }}</span>
                        </div>
                      </div>
                      <div class="stat-item">
                        <mat-icon>speed</mat-icon>
                        <div>
                          <span class="stat-label">Avg Response Time</span>
                          <span class="stat-value">{{ debugSession()!.averageResponseTime.toFixed(0) }}ms</span>
                        </div>
                      </div>
                    </div>
                    <div class="session-status">
                      <mat-chip [class]="'status-' + debugSession()!.status">
                        {{ debugSession()!.status.toUpperCase() }}
                      </mat-chip>
                    </div>
                  </mat-card-content>
                </mat-card>
              } @else {
                <mat-card>
                  <mat-card-content>
                    <p>No debug session found for this conversation.</p>
                  </mat-card-content>
                </mat-card>
              }
            </div>
          </mat-tab>

          <!-- Events Log -->
          <mat-tab label="Events Log">
            <div class="tab-content">
              <div class="events-controls">
                <mat-form-field appearance="outline">
                  <mat-label>Filter by Event Type</mat-label>
                  <mat-select [(value)]="selectedEventTypes" multiple>
                    <mat-option value="message_sent">Message Sent</mat-option>
                    <mat-option value="ai_response_received">AI Response</mat-option>
                    <mat-option value="tool_call_started">Tool Started</mat-option>
                    <mat-option value="tool_call_completed">Tool Completed</mat-option>
                    <mat-option value="tool_call_failed">Tool Failed</mat-option>
                    <mat-option value="error_occurred">Error</mat-option>
                  </mat-select>
                </mat-form-field>
                <mat-checkbox [(ngModel)]="showOnlyErrors">Show Only Errors</mat-checkbox>
              </div>

              <div class="events-list">
                @for (event of filteredEvents(); track event.id) {
                  <mat-expansion-panel class="event-panel" [class]="'event-' + event.type">
                    <mat-expansion-panel-header>
                      <mat-panel-title>
                        <mat-icon>{{ getEventIcon(event.type) }}</mat-icon>
                        {{ formatEventType(event.type) }}
                      </mat-panel-title>
                      <mat-panel-description>
                        {{ event.timestamp | date:'medium' }}
                        @if (event.metadata.duration) {
                          <mat-chip class="duration-chip">{{ event.metadata.duration }}ms</mat-chip>
                        }
                      </mat-panel-description>
                    </mat-expansion-panel-header>
                    
                    <div class="event-details">
                      @if (event.metadata.tokenCount) {
                        <div class="event-metadata">
                          <strong>Token Count:</strong> {{ event.metadata.tokenCount }}
                        </div>
                      }
                      @if (event.metadata.errorCode) {
                        <div class="event-metadata error">
                          <strong>Error Code:</strong> {{ event.metadata.errorCode }}
                        </div>
                      }
                      
                      <div class="event-data">
                        <strong>Data:</strong>
                        <pre>{{ formatEventData(event.data) }}</pre>
                      </div>
                      
                      @if (event.metadata.stackTrace) {
                        <div class="stack-trace">
                          <strong>Stack Trace:</strong>
                          <pre>{{ event.metadata.stackTrace }}</pre>
                        </div>
                      }
                    </div>
                  </mat-expansion-panel>
                } @empty {
                  <mat-card>
                    <mat-card-content>
                      <p>No events found matching the current filters.</p>
                    </mat-card-content>
                  </mat-card>
                }
              </div>
            </div>
          </mat-tab>

          <!-- Performance Metrics -->
          <mat-tab label="Performance">
            <div class="tab-content">
              @if (performanceMetrics()) {
                <div class="metrics-grid">
                  <!-- Response Time Metrics -->
                  <mat-card class="metric-card">
                    <mat-card-header>
                      <mat-card-title>Response Time</mat-card-title>
                    </mat-card-header>
                    <mat-card-content>
                      <div class="metric-item">
                        <span class="metric-label">Average:</span>
                        <span class="metric-value">{{ performanceMetrics()!.responseTime.average.toFixed(0) }}ms</span>
                      </div>
                      <div class="metric-item">
                        <span class="metric-label">Median:</span>
                        <span class="metric-value">{{ performanceMetrics()!.responseTime.median.toFixed(0) }}ms</span>
                      </div>
                      <div class="metric-item">
                        <span class="metric-label">95th Percentile:</span>
                        <span class="metric-value">{{ performanceMetrics()!.responseTime.p95.toFixed(0) }}ms</span>
                      </div>
                      <div class="metric-item">
                        <span class="metric-label">99th Percentile:</span>
                        <span class="metric-value">{{ performanceMetrics()!.responseTime.p99.toFixed(0) }}ms</span>
                      </div>
                    </mat-card-content>
                  </mat-card>

                  <!-- Token Usage Metrics -->
                  <mat-card class="metric-card">
                    <mat-card-header>
                      <mat-card-title>Token Usage</mat-card-title>
                    </mat-card-header>
                    <mat-card-content>
                      <div class="metric-item">
                        <span class="metric-label">Total:</span>
                        <span class="metric-value">{{ performanceMetrics()!.tokenUsage.total.toLocaleString() }}</span>
                      </div>
                      <div class="metric-item">
                        <span class="metric-label">Average per Message:</span>
                        <span class="metric-value">{{ performanceMetrics()!.tokenUsage.average.toFixed(0) }}</span>
                      </div>
                      @for (model of getModelList(); track model) {
                        <div class="metric-item">
                          <span class="metric-label">{{ model }}:</span>
                          <span class="metric-value">{{ performanceMetrics()!.tokenUsage.byModel[model]?.toLocaleString() || 0 }}</span>
                        </div>
                      }
                    </mat-card-content>
                  </mat-card>

                  <!-- Tool Performance -->
                  <mat-card class="metric-card">
                    <mat-card-header>
                      <mat-card-title>Tool Performance</mat-card-title>
                    </mat-card-header>
                    <mat-card-content>
                      <div class="metric-item">
                        <span class="metric-label">Success Rate:</span>
                        <span class="metric-value">{{ performanceMetrics()!.toolPerformance.successRate.toFixed(1) }}%</span>
                      </div>
                      <div class="metric-item">
                        <span class="metric-label">Avg Execution Time:</span>
                        <span class="metric-value">{{ performanceMetrics()!.toolPerformance.averageExecutionTime.toFixed(0) }}ms</span>
                      </div>
                      
                      <div class="tool-breakdown">
                        @for (tool of getToolList(); track tool) {
                          <div class="tool-metric">
                            <strong>{{ tool }}</strong>
                            <div class="tool-stats">
                              <span>{{ performanceMetrics()!.toolPerformance.byTool[tool]?.count || 0 }} calls</span>
                              <span>{{ (performanceMetrics()!.toolPerformance.byTool[tool]?.successRate || 0).toFixed(1) }}% success</span>
                              <span>{{ (performanceMetrics()!.toolPerformance.byTool[tool]?.averageTime || 0).toFixed(0) }}ms avg</span>
                            </div>
                          </div>
                        }
                      </div>
                    </mat-card-content>
                  </mat-card>

                  <!-- Error Metrics -->
                  <mat-card class="metric-card">
                    <mat-card-header>
                      <mat-card-title>Error Analysis</mat-card-title>
                    </mat-card-header>
                    <mat-card-content>
                      <div class="metric-item">
                        <span class="metric-label">Total Errors:</span>
                        <span class="metric-value">{{ performanceMetrics()!.errorMetrics.totalErrors }}</span>
                      </div>
                      <div class="metric-item">
                        <span class="metric-label">Error Rate:</span>
                        <span class="metric-value">{{ performanceMetrics()!.errorMetrics.errorRate.toFixed(1) }}%</span>
                      </div>
                      
                      <div class="error-breakdown">
                        @for (errorType of getErrorTypes(); track errorType) {
                          <div class="error-metric">
                            <span class="error-type">{{ errorType }}</span>
                            <span class="error-count">{{ performanceMetrics()!.errorMetrics.byType[errorType] || 0 }}</span>
                          </div>
                        }
                      </div>
                    </mat-card-content>
                  </mat-card>
                </div>
              } @else {
                <mat-card>
                  <mat-card-content>
                    <p>No performance metrics available.</p>
                  </mat-card-content>
                </mat-card>
              }
            </div>
          </mat-tab>
        </mat-tab-group>
      }
    </div>
  `,
  styles: [`
    .debug-panel {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .debug-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid #e0e0e0;
    }

    .debug-header h3 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .debug-actions {
      display: flex;
      gap: 8px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      gap: 16px;
    }

    .debug-tabs {
      flex: 1;
      overflow: hidden;
    }

    .tab-content {
      padding: 16px;
      height: calc(100vh - 200px);
      overflow-y: auto;
    }

    .session-card {
      margin-bottom: 16px;
    }

    .session-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: #f5f5f5;
      border-radius: 8px;
    }

    .stat-item mat-icon {
      color: #666;
    }

    .stat-item div {
      display: flex;
      flex-direction: column;
    }

    .stat-label {
      font-size: 0.9em;
      color: #666;
    }

    .stat-value {
      font-size: 1.1em;
      font-weight: 500;
      color: #333;
    }

    .session-status {
      display: flex;
      justify-content: center;
    }

    .status-active {
      background-color: #4caf50;
      color: white;
    }

    .status-completed {
      background-color: #2196f3;
      color: white;
    }

    .status-error {
      background-color: #f44336;
      color: white;
    }

    .events-controls {
      display: flex;
      gap: 16px;
      align-items: center;
      margin-bottom: 16px;
      padding: 16px;
      background: #f5f5f5;
      border-radius: 8px;
    }

    .events-controls mat-form-field {
      min-width: 200px;
    }

    .events-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .event-panel {
      border-left: 4px solid #e0e0e0;
    }

    .event-panel.event-error_occurred {
      border-left-color: #f44336;
    }

    .event-panel.event-tool_call_failed {
      border-left-color: #ff9800;
    }

    .event-panel.event-ai_response_received {
      border-left-color: #4caf50;
    }

    .event-panel.event-tool_call_completed {
      border-left-color: #2196f3;
    }

    .duration-chip {
      font-size: 0.8em;
      height: 20px;
      margin-left: 8px;
    }

    .event-details {
      padding: 16px 0;
    }

    .event-metadata {
      margin-bottom: 12px;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 4px;
    }

    .event-metadata.error {
      background: #ffebee;
      color: #c62828;
    }

    .event-data pre,
    .stack-trace pre {
      background: #f5f5f5;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.9em;
      margin: 8px 0;
    }

    .stack-trace pre {
      background: #ffebee;
      color: #c62828;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
    }

    .metric-card {
      height: fit-content;
    }

    .metric-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .metric-item:last-child {
      border-bottom: none;
    }

    .metric-label {
      color: #666;
    }

    .metric-value {
      font-weight: 500;
      color: #333;
    }

    .tool-breakdown,
    .error-breakdown {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .tool-metric {
      margin-bottom: 12px;
    }

    .tool-stats {
      display: flex;
      gap: 12px;
      font-size: 0.9em;
      color: #666;
      margin-top: 4px;
    }

    .error-metric {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
    }

    .error-type {
      color: #666;
    }

    .error-count {
      font-weight: 500;
      color: #f44336;
    }
  `]
})
export class DebugPanelComponent implements OnInit, OnDestroy {
  @Input() conversationId!: string;

  debugSession = signal<DebugSession | null>(null);
  debugEvents = signal<DebugEvent[]>([]);
  performanceMetrics = signal<PerformanceMetrics | null>(null);
  isLoading = signal(false);

  selectedEventTypes: string[] = [];
  showOnlyErrors = false;

  filteredEvents = computed(() => {
    let events = this.debugEvents();

    if (this.selectedEventTypes.length > 0) {
      events = events.filter(event => this.selectedEventTypes.includes(event.type));
    }

    if (this.showOnlyErrors) {
      events = events.filter(event => 
        event.type === 'error_occurred' || 
        event.type === 'tool_call_failed' ||
        event.metadata.errorCode
      );
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  });

  ngOnInit(): void {
    this.loadDebugData();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async loadDebugData(): Promise<void> {
    if (!this.conversationId) return;

    this.isLoading.set(true);
    try {
      const data = await this.requestDebugData();
      this.debugSession.set(data.session);
      this.debugEvents.set(data.events);
      this.performanceMetrics.set(data.metrics);
    } catch (error) {
      console.error('Failed to load debug data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async refreshDebugData(): Promise<void> {
    await this.loadDebugData();
  }

  async generateReport(): Promise<void> {
    try {
      const vscode = (window as any).acquireVsCodeApi();
      vscode.postMessage({
        type: 'generateDebugReport',
        conversationId: this.conversationId
      });
    } catch (error) {
      console.error('Failed to generate debug report:', error);
    }
  }

  async clearDebugData(): Promise<void> {
    try {
      const vscode = (window as any).acquireVsCodeApi();
      vscode.postMessage({
        type: 'clearDebugData',
        conversationId: this.conversationId
      });
      
      // Clear local data
      this.debugSession.set(null);
      this.debugEvents.set([]);
      this.performanceMetrics.set(null);
    } catch (error) {
      console.error('Failed to clear debug data:', error);
    }
  }

  formatDuration(start: Date, end?: Date): string {
    const endTime = end || new Date();
    const duration = endTime.getTime() - start.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  formatEventType(type: string): string {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  getEventIcon(type: string): string {
    const icons: Record<string, string> = {
      'message_sent': 'send',
      'ai_response_received': 'smart_toy',
      'tool_call_started': 'play_arrow',
      'tool_call_completed': 'check_circle',
      'tool_call_failed': 'error',
      'error_occurred': 'warning',
      'context_truncated': 'content_cut',
      'model_switched': 'swap_horiz'
    };
    return icons[type] || 'info';
  }

  formatEventData(data: any): string {
    return JSON.stringify(data, null, 2);
  }

  getModelList(): string[] {
    const metrics = this.performanceMetrics();
    return metrics ? Object.keys(metrics.tokenUsage.byModel) : [];
  }

  getToolList(): string[] {
    const metrics = this.performanceMetrics();
    return metrics ? Object.keys(metrics.toolPerformance.byTool) : [];
  }

  getErrorTypes(): string[] {
    const metrics = this.performanceMetrics();
    return metrics ? Object.keys(metrics.errorMetrics.byType) : [];
  }

  private async requestDebugData(): Promise<any> {
    return new Promise((resolve, reject) => {
      const vscode = (window as any).acquireVsCodeApi();
      const messageId = Date.now().toString();

      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'debugDataResponse' && message.messageId === messageId) {
          window.removeEventListener('message', handleMessage);
          if (message.success) {
            resolve(message.data);
          } else {
            reject(new Error(message.error));
          }
        }
      };

      window.addEventListener('message', handleMessage);

      vscode.postMessage({
        type: 'getDebugData',
        messageId,
        conversationId: this.conversationId
      });

      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        reject(new Error('Debug data request timed out'));
      }, 10000);
    });
  }
}