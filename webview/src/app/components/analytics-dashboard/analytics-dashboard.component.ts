import { Component, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface UsageStatistics {
  totalConversations: number;
  totalMessages: number;
  totalTokensUsed: number;
  totalToolExecutions: number;
  averageConversationLength: number;
  averageResponseTime: number;
  mostUsedTools: Array<{ name: string; count: number }>;
  mostUsedModels: Array<{ name: string; count: number }>;
  errorRate: number;
  activeUsers: number;
  timeRange: {
    start: Date;
    end: Date;
  };
}

export interface UsagePattern {
  type: 'daily' | 'weekly' | 'hourly' | 'feature';
  name: string;
  data: Array<{
    label: string;
    value: number;
    timestamp?: Date;
  }>;
  trend: 'increasing' | 'decreasing' | 'stable';
  insights: string[];
}

export interface AnalyticsReport {
  generatedAt: Date;
  timeRange: {
    start: Date;
    end: Date;
  };
  summary: UsageStatistics;
  patterns: UsagePattern[];
  recommendations: string[];
  trends: {
    conversationGrowth: number;
    tokenUsageGrowth: number;
    errorRateChange: number;
  };
}

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTableModule,
    MatTooltipModule
  ],
  template: `
    <div class="analytics-dashboard">
      <div class="dashboard-header">
        <h3>
          <mat-icon>analytics</mat-icon>
          Analytics Dashboard
        </h3>
        <div class="dashboard-actions">
          <mat-form-field appearance="outline" class="time-range-select">
            <mat-label>Time Range</mat-label>
            <mat-select [(value)]="selectedTimeRange" (selectionChange)="onTimeRangeChange()">
              <mat-option value="7d">Last 7 days</mat-option>
              <mat-option value="30d">Last 30 days</mat-option>
              <mat-option value="90d">Last 90 days</mat-option>
              <mat-option value="custom">Custom Range</mat-option>
            </mat-select>
          </mat-form-field>
          
          @if (selectedTimeRange === 'custom') {
            <mat-form-field appearance="outline">
              <mat-label>Start Date</mat-label>
              <input matInput [matDatepicker]="startPicker" [(ngModel)]="customStartDate" (ngModelChange)="onCustomDateChange()">
              <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
              <mat-datepicker #startPicker></mat-datepicker>
            </mat-form-field>
            
            <mat-form-field appearance="outline">
              <mat-label>End Date</mat-label>
              <input matInput [matDatepicker]="endPicker" [(ngModel)]="customEndDate" (ngModelChange)="onCustomDateChange()">
              <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
              <mat-datepicker #endPicker></mat-datepicker>
            </mat-form-field>
          }
          
          <button mat-button (click)="refreshData()" [disabled]="isLoading()">
            <mat-icon>refresh</mat-icon>
            Refresh
          </button>
          <button mat-button (click)="exportReport()" [disabled]="isLoading()">
            <mat-icon>download</mat-icon>
            Export Report
          </button>
        </div>
      </div>

      @if (isLoading()) {
        <div class="loading-container">
          <mat-spinner diameter="32"></mat-spinner>
          <p>Loading analytics data...</p>
        </div>
      } @else if (analyticsReport()) {
        <mat-tab-group class="analytics-tabs">
          <!-- Overview -->
          <mat-tab label="Overview">
            <div class="tab-content">
              <!-- Key Metrics -->
              <div class="metrics-grid">
                <mat-card class="metric-card">
                  <mat-card-content>
                    <div class="metric-header">
                      <mat-icon>chat</mat-icon>
                      <span class="metric-title">Conversations</span>
                    </div>
                    <div class="metric-value">{{ analyticsReport()!.summary.totalConversations.toLocaleString() }}</div>
                    <div class="metric-change" [class]="getTrendClass(analyticsReport()!.trends.conversationGrowth)">
                      <mat-icon>{{ getTrendIcon(analyticsReport()!.trends.conversationGrowth) }}</mat-icon>
                      {{ Math.abs(analyticsReport()!.trends.conversationGrowth).toFixed(1) }}%
                    </div>
                  </mat-card-content>
                </mat-card>

                <mat-card class="metric-card">
                  <mat-card-content>
                    <div class="metric-header">
                      <mat-icon>message</mat-icon>
                      <span class="metric-title">Messages</span>
                    </div>
                    <div class="metric-value">{{ analyticsReport()!.summary.totalMessages.toLocaleString() }}</div>
                    <div class="metric-subtitle">
                      Avg {{ analyticsReport()!.summary.averageConversationLength.toFixed(1) }} per conversation
                    </div>
                  </mat-card-content>
                </mat-card>

                <mat-card class="metric-card">
                  <mat-card-content>
                    <div class="metric-header">
                      <mat-icon>token</mat-icon>
                      <span class="metric-title">Tokens Used</span>
                    </div>
                    <div class="metric-value">{{ formatLargeNumber(analyticsReport()!.summary.totalTokensUsed) }}</div>
                    <div class="metric-change" [class]="getTrendClass(analyticsReport()!.trends.tokenUsageGrowth)">
                      <mat-icon>{{ getTrendIcon(analyticsReport()!.trends.tokenUsageGrowth) }}</mat-icon>
                      {{ Math.abs(analyticsReport()!.trends.tokenUsageGrowth).toFixed(1) }}%
                    </div>
                  </mat-card-content>
                </mat-card>

                <mat-card class="metric-card">
                  <mat-card-content>
                    <div class="metric-header">
                      <mat-icon>build</mat-icon>
                      <span class="metric-title">Tool Executions</span>
                    </div>
                    <div class="metric-value">{{ analyticsReport()!.summary.totalToolExecutions.toLocaleString() }}</div>
                    <div class="metric-subtitle">
                      {{ (100 - analyticsReport()!.summary.errorRate).toFixed(1) }}% success rate
                    </div>
                  </mat-card-content>
                </mat-card>

                <mat-card class="metric-card">
                  <mat-card-content>
                    <div class="metric-header">
                      <mat-icon>speed</mat-icon>
                      <span class="metric-title">Avg Response Time</span>
                    </div>
                    <div class="metric-value">{{ analyticsReport()!.summary.averageResponseTime.toFixed(0) }}ms</div>
                    <div class="metric-subtitle">
                      {{ getResponseTimeCategory(analyticsReport()!.summary.averageResponseTime) }}
                    </div>
                  </mat-card-content>
                </mat-card>

                <mat-card class="metric-card">
                  <mat-card-content>
                    <div class="metric-header">
                      <mat-icon>error</mat-icon>
                      <span class="metric-title">Error Rate</span>
                    </div>
                    <div class="metric-value">{{ analyticsReport()!.summary.errorRate.toFixed(1) }}%</div>
                    <div class="metric-change" [class]="getTrendClass(-analyticsReport()!.trends.errorRateChange)">
                      <mat-icon>{{ getTrendIcon(-analyticsReport()!.trends.errorRateChange) }}</mat-icon>
                      {{ Math.abs(analyticsReport()!.trends.errorRateChange).toFixed(1) }}%
                    </div>
                  </mat-card-content>
                </mat-card>
              </div>

              <!-- Top Tools and Models -->
              <div class="top-items-grid">
                <mat-card class="top-items-card">
                  <mat-card-header>
                    <mat-card-title>Most Used Tools</mat-card-title>
                  </mat-card-header>
                  <mat-card-content>
                    @for (tool of analyticsReport()!.summary.mostUsedTools.slice(0, 5); track tool.name) {
                      <div class="top-item">
                        <span class="item-name">{{ tool.name }}</span>
                        <div class="item-bar">
                          <div class="item-fill" [style.width.%]="getPercentage(tool.count, analyticsReport()!.summary.mostUsedTools[0].count)"></div>
                        </div>
                        <span class="item-count">{{ tool.count }}</span>
                      </div>
                    } @empty {
                      <p class="no-data">No tool usage data available</p>
                    }
                  </mat-card-content>
                </mat-card>

                <mat-card class="top-items-card">
                  <mat-card-header>
                    <mat-card-title>Most Used Models</mat-card-title>
                  </mat-card-header>
                  <mat-card-content>
                    @for (model of analyticsReport()!.summary.mostUsedModels.slice(0, 5); track model.name) {
                      <div class="top-item">
                        <span class="item-name">{{ model.name }}</span>
                        <div class="item-bar">
                          <div class="item-fill" [style.width.%]="getPercentage(model.count, analyticsReport()!.summary.mostUsedModels[0].count)"></div>
                        </div>
                        <span class="item-count">{{ model.count }}</span>
                      </div>
                    } @empty {
                      <p class="no-data">No model usage data available</p>
                    }
                  </mat-card-content>
                </mat-card>
              </div>
            </div>
          </mat-tab>

          <!-- Usage Patterns -->
          <mat-tab label="Usage Patterns">
            <div class="tab-content">
              @for (pattern of analyticsReport()!.patterns; track pattern.name) {
                <mat-card class="pattern-card">
                  <mat-card-header>
                    <mat-card-title>{{ pattern.name }}</mat-card-title>
                    <mat-card-subtitle>
                      <mat-chip [class]="'trend-' + pattern.trend">
                        <mat-icon>{{ getTrendIcon(pattern.trend === 'increasing' ? 1 : pattern.trend === 'decreasing' ? -1 : 0) }}</mat-icon>
                        {{ pattern.trend }}
                      </mat-chip>
                    </mat-card-subtitle>
                  </mat-card-header>
                  <mat-card-content>
                    <div class="pattern-chart">
                      @for (dataPoint of pattern.data; track dataPoint.label) {
                        <div class="chart-bar">
                          <div class="bar-fill" [style.height.%]="getPatternPercentage(dataPoint.value, pattern.data)"></div>
                          <span class="bar-label">{{ dataPoint.label }}</span>
                          <span class="bar-value">{{ dataPoint.value }}</span>
                        </div>
                      }
                    </div>
                    
                    @if (pattern.insights.length > 0) {
                      <div class="pattern-insights">
                        <h4>Insights:</h4>
                        <ul>
                          @for (insight of pattern.insights; track insight) {
                            <li>{{ insight }}</li>
                          }
                        </ul>
                      </div>
                    }
                  </mat-card-content>
                </mat-card>
              }
            </div>
          </mat-tab>

          <!-- Recommendations -->
          <mat-tab label="Recommendations">
            <div class="tab-content">
              <mat-card class="recommendations-card">
                <mat-card-header>
                  <mat-card-title>
                    <mat-icon>lightbulb</mat-icon>
                    Optimization Recommendations
                  </mat-card-title>
                </mat-card-header>
                <mat-card-content>
                  @if (analyticsReport()!.recommendations.length > 0) {
                    <div class="recommendations-list">
                      @for (recommendation of analyticsReport()!.recommendations; track recommendation; let i = $index) {
                        <div class="recommendation-item">
                          <div class="recommendation-icon">
                            <mat-icon>{{ getRecommendationIcon(i) }}</mat-icon>
                          </div>
                          <div class="recommendation-content">
                            <p>{{ recommendation }}</p>
                          </div>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="no-recommendations">
                      <mat-icon>check_circle</mat-icon>
                      <p>Great job! No specific recommendations at this time. Your AI usage patterns look optimal.</p>
                    </div>
                  }
                </mat-card-content>
              </mat-card>

              <!-- Performance Summary -->
              <mat-card class="performance-summary">
                <mat-card-header>
                  <mat-card-title>Performance Summary</mat-card-title>
                </mat-card-header>
                <mat-card-content>
                  <div class="performance-metrics">
                    <div class="performance-item">
                      <span class="performance-label">Conversation Efficiency</span>
                      <div class="performance-bar">
                        <div class="performance-fill" [style.width.%]="getEfficiencyScore()"></div>
                      </div>
                      <span class="performance-score">{{ getEfficiencyScore() }}%</span>
                    </div>
                    
                    <div class="performance-item">
                      <span class="performance-label">Tool Success Rate</span>
                      <div class="performance-bar">
                        <div class="performance-fill" [style.width.%]="100 - analyticsReport()!.summary.errorRate"></div>
                      </div>
                      <span class="performance-score">{{ (100 - analyticsReport()!.summary.errorRate).toFixed(1) }}%</span>
                    </div>
                    
                    <div class="performance-item">
                      <span class="performance-label">Response Speed</span>
                      <div class="performance-bar">
                        <div class="performance-fill" [style.width.%]="getSpeedScore()"></div>
                      </div>
                      <span class="performance-score">{{ getSpeedScore() }}%</span>
                    </div>
                  </div>
                </mat-card-content>
              </mat-card>
            </div>
          </mat-tab>
        </mat-tab-group>
      } @else {
        <mat-card class="no-data-card">
          <mat-card-content>
            <mat-icon>analytics</mat-icon>
            <h3>No Analytics Data Available</h3>
            <p>Start using the AI assistant to generate analytics data.</p>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .analytics-dashboard {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid #e0e0e0;
      flex-wrap: wrap;
      gap: 16px;
    }

    .dashboard-header h3 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dashboard-actions {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .time-range-select {
      min-width: 150px;
    }

    .loading-container,
    .no-data-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      gap: 16px;
      text-align: center;
    }

    .no-data-card mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #ccc;
    }

    .analytics-tabs {
      flex: 1;
      overflow: hidden;
    }

    .tab-content {
      padding: 16px;
      height: calc(100vh - 200px);
      overflow-y: auto;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .metric-card {
      text-align: center;
    }

    .metric-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .metric-header mat-icon {
      color: #666;
    }

    .metric-title {
      font-size: 0.9em;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .metric-value {
      font-size: 2em;
      font-weight: 500;
      color: #333;
      margin-bottom: 8px;
    }

    .metric-subtitle {
      font-size: 0.9em;
      color: #666;
    }

    .metric-change {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      font-size: 0.9em;
      font-weight: 500;
    }

    .metric-change.positive {
      color: #4caf50;
    }

    .metric-change.negative {
      color: #f44336;
    }

    .metric-change.neutral {
      color: #666;
    }

    .top-items-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .top-items-card {
      height: fit-content;
    }

    .top-item {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .item-name {
      min-width: 100px;
      font-size: 0.9em;
      color: #333;
    }

    .item-bar {
      flex: 1;
      height: 8px;
      background: #f0f0f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .item-fill {
      height: 100%;
      background: linear-gradient(90deg, #2196f3, #4caf50);
      transition: width 0.3s ease;
    }

    .item-count {
      min-width: 40px;
      text-align: right;
      font-size: 0.9em;
      font-weight: 500;
      color: #333;
    }

    .no-data {
      text-align: center;
      color: #666;
      font-style: italic;
    }

    .pattern-card {
      margin-bottom: 24px;
    }

    .trend-increasing {
      background-color: #4caf50;
      color: white;
    }

    .trend-decreasing {
      background-color: #f44336;
      color: white;
    }

    .trend-stable {
      background-color: #2196f3;
      color: white;
    }

    .pattern-chart {
      display: flex;
      align-items: end;
      gap: 8px;
      height: 200px;
      padding: 16px 0;
      margin-bottom: 16px;
    }

    .chart-bar {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
    }

    .bar-fill {
      width: 24px;
      background: linear-gradient(180deg, #2196f3, #4caf50);
      border-radius: 2px 2px 0 0;
      margin-bottom: 8px;
      transition: height 0.3s ease;
    }

    .bar-label {
      font-size: 0.8em;
      color: #666;
      margin-bottom: 4px;
      text-align: center;
    }

    .bar-value {
      font-size: 0.9em;
      font-weight: 500;
      color: #333;
    }

    .pattern-insights {
      background: #f5f5f5;
      padding: 16px;
      border-radius: 8px;
    }

    .pattern-insights h4 {
      margin: 0 0 12px 0;
      color: #333;
    }

    .pattern-insights ul {
      margin: 0;
      padding-left: 20px;
    }

    .pattern-insights li {
      margin-bottom: 8px;
      color: #666;
    }

    .recommendations-card,
    .performance-summary {
      margin-bottom: 24px;
    }

    .recommendations-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .recommendation-item {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #2196f3;
    }

    .recommendation-icon {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      background: #2196f3;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }

    .recommendation-content p {
      margin: 0;
      color: #333;
      line-height: 1.5;
    }

    .no-recommendations {
      text-align: center;
      padding: 32px;
      color: #4caf50;
    }

    .no-recommendations mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
    }

    .performance-metrics {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .performance-item {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .performance-label {
      min-width: 150px;
      color: #666;
    }

    .performance-bar {
      flex: 1;
      height: 12px;
      background: #f0f0f0;
      border-radius: 6px;
      overflow: hidden;
    }

    .performance-fill {
      height: 100%;
      background: linear-gradient(90deg, #ff9800, #4caf50);
      transition: width 0.3s ease;
    }

    .performance-score {
      min-width: 50px;
      text-align: right;
      font-weight: 500;
      color: #333;
    }
  `]
})
export class AnalyticsDashboardComponent implements OnInit, OnDestroy {
  analyticsReport = signal<AnalyticsReport | null>(null);
  isLoading = signal(false);
  
  selectedTimeRange = '30d';
  customStartDate: Date | null = null;
  customEndDate: Date | null = null;

  ngOnInit(): void {
    this.loadAnalyticsData();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async loadAnalyticsData(): Promise<void> {
    this.isLoading.set(true);
    try {
      const timeRange = this.getTimeRange();
      const report = await this.requestAnalyticsReport(timeRange);
      this.analyticsReport.set(report);
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async refreshData(): Promise<void> {
    await this.loadAnalyticsData();
  }

  onTimeRangeChange(): void {
    this.loadAnalyticsData();
  }

  onCustomDateChange(): void {
    if (this.selectedTimeRange === 'custom' && this.customStartDate && this.customEndDate) {
      this.loadAnalyticsData();
    }
  }

  async exportReport(): Promise<void> {
    try {
      const vscode = (window as any).acquireVsCodeApi();
      vscode.postMessage({
        type: 'exportAnalyticsReport',
        timeRange: this.getTimeRange()
      });
    } catch (error) {
      console.error('Failed to export analytics report:', error);
    }
  }

  getTrendClass(value: number): string {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  }

  getTrendIcon(value: number): string {
    if (value > 0) return 'trending_up';
    if (value < 0) return 'trending_down';
    return 'trending_flat';
  }

  formatLargeNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  }

  getResponseTimeCategory(time: number): string {
    if (time < 1000) return 'Excellent';
    if (time < 3000) return 'Good';
    if (time < 5000) return 'Fair';
    return 'Needs Improvement';
  }

  getPercentage(value: number, max: number): number {
    return max > 0 ? (value / max) * 100 : 0;
  }

  getPatternPercentage(value: number, data: Array<{ value: number }>): number {
    const max = Math.max(...data.map(d => d.value));
    return max > 0 ? (value / max) * 100 : 0;
  }

  getRecommendationIcon(index: number): string {
    const icons = ['speed', 'security', 'tune', 'psychology', 'trending_up'];
    return icons[index % icons.length];
  }

  getEfficiencyScore(): number {
    const report = this.analyticsReport();
    if (!report) return 0;
    
    // Calculate efficiency based on messages per conversation and response time
    const avgMessages = report.summary.averageConversationLength;
    const responseTime = report.summary.averageResponseTime;
    
    let score = 50; // Base score
    
    // Bonus for good conversation length (3-10 messages is optimal)
    if (avgMessages >= 3 && avgMessages <= 10) {
      score += 25;
    } else if (avgMessages > 10) {
      score += 15;
    }
    
    // Bonus for good response time (< 3 seconds is optimal)
    if (responseTime < 3000) {
      score += 25;
    } else if (responseTime < 5000) {
      score += 15;
    }
    
    return Math.min(100, score);
  }

  getSpeedScore(): number {
    const report = this.analyticsReport();
    if (!report) return 0;
    
    const responseTime = report.summary.averageResponseTime;
    
    // Score based on response time (lower is better)
    if (responseTime < 1000) return 100;
    if (responseTime < 2000) return 90;
    if (responseTime < 3000) return 80;
    if (responseTime < 5000) return 70;
    if (responseTime < 10000) return 50;
    return 30;
  }

  private getTimeRange(): { start: Date; end: Date } | undefined {
    const now = new Date();
    
    switch (this.selectedTimeRange) {
      case '7d':
        return {
          start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          end: now
        };
      case '30d':
        return {
          start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          end: now
        };
      case '90d':
        return {
          start: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          end: now
        };
      case 'custom':
        if (this.customStartDate && this.customEndDate) {
          return {
            start: this.customStartDate,
            end: this.customEndDate
          };
        }
        return undefined;
      default:
        return undefined;
    }
  }

  private async requestAnalyticsReport(timeRange?: { start: Date; end: Date }): Promise<AnalyticsReport> {
    return new Promise((resolve, reject) => {
      const vscode = (window as any).acquireVsCodeApi();
      const messageId = Date.now().toString();

      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'analyticsReportResponse' && message.messageId === messageId) {
          window.removeEventListener('message', handleMessage);
          if (message.success) {
            resolve(message.report);
          } else {
            reject(new Error(message.error));
          }
        }
      };

      window.addEventListener('message', handleMessage);

      vscode.postMessage({
        type: 'getAnalyticsReport',
        messageId,
        timeRange
      });

      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        reject(new Error('Analytics report request timed out'));
      }, 15000);
    });
  }
}