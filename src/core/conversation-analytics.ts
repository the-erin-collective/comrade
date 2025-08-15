/**
 * Conversation Analytics Service
 * 
 * Provides comprehensive analytics and usage tracking for AI conversations
 * including usage patterns, performance metrics, and trend analysis.
 */

import { Logger } from './logger';
import { AIMessage, AIResponse, ToolCall, AIToolResult } from './ai-agent';

// Create logger instance
const logger = new Logger({ prefix: 'ConversationAnalytics' });

/**
 * Analytics event types
 */
export type AnalyticsEventType = 
  | 'conversation_started'
  | 'conversation_ended'
  | 'message_sent'
  | 'ai_response_received'
  | 'tool_executed'
  | 'model_switched'
  | 'error_occurred'
  | 'session_exported'
  | 'feature_used';

/**
 * Analytics event structure
 */
export interface AnalyticsEvent {
  id: string;
  type: AnalyticsEventType;
  timestamp: Date;
  sessionId: string;
  userId?: string;
  data: Record<string, any>;
  metadata: {
    version: string;
    platform: string;
    model?: string;
    duration?: number;
    tokenCount?: number;
  };
}

/**
 * Usage statistics
 */
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

/**
 * Performance metrics
 */
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

/**
 * Usage patterns
 */
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

/**
 * User behavior analysis
 */
export interface UserBehavior {
  sessionDuration: {
    average: number;
    distribution: Record<string, number>; // duration ranges
  };
  messagePatterns: {
    averageLength: number;
    commonPhrases: string[];
    questionTypes: Record<string, number>;
  };
  toolUsage: {
    preferredTools: string[];
    toolSequences: Array<{ sequence: string[]; count: number }>;
  };
  modelPreferences: {
    mostUsed: string;
    switchingFrequency: number;
  };
}

/**
 * Analytics report
 */
export interface AnalyticsReport {
  generatedAt: Date;
  timeRange: {
    start: Date;
    end: Date;
  };
  summary: UsageStatistics;
  performance: PerformanceMetrics;
  patterns: UsagePattern[];
  userBehavior: UserBehavior;
  recommendations: string[];
  trends: {
    conversationGrowth: number; // percentage
    tokenUsageGrowth: number;
    errorRateChange: number;
  };
}

/**
 * Conversation Analytics Service
 */
export class ConversationAnalyticsService {
  private logger: Logger;
  private events: AnalyticsEvent[] = [];
  private maxEvents = 10000; // Limit stored events to prevent memory issues
  private readonly version = '1.0.0';
  private readonly platform = process.platform;

  constructor() {
    this.logger = logger.child({ prefix: 'Service' });
    this.loadPersistedEvents();
  }

  /**
   * Track analytics event
   */
  trackEvent(
    type: AnalyticsEventType,
    sessionId: string,
    data: Record<string, any> = {},
    metadata: Partial<AnalyticsEvent['metadata']> = {}
  ): void {
    const event: AnalyticsEvent = {
      id: `analytics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: new Date(),
      sessionId,
      data,
      metadata: {
        version: this.version,
        platform: this.platform,
        ...metadata
      }
    };

    this.events.push(event);

    // Maintain event limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    this.persistEvents();
    this.logger.debug('Analytics event tracked', { type, sessionId, eventId: event.id });
  }

  /**
   * Track conversation start
   */
  trackConversationStart(sessionId: string, model: string, userId?: string): void {
    this.trackEvent('conversation_started', sessionId, {
      model,
      userId
    }, {
      model
    });
  }

  /**
   * Track conversation end
   */
  trackConversationEnd(sessionId: string, duration: number, messageCount: number, tokenCount: number): void {
    this.trackEvent('conversation_ended', sessionId, {
      messageCount,
      tokenCount
    }, {
      duration,
      tokenCount
    });
  }

  /**
   * Track message sent
   */
  trackMessageSent(sessionId: string, messageLength: number, hasContext: boolean): void {
    this.trackEvent('message_sent', sessionId, {
      messageLength,
      hasContext,
      messageType: this.categorizeMessage(messageLength)
    }, {
      tokenCount: this.estimateTokens(messageLength)
    });
  }

  /**
   * Track AI response
   */
  trackAIResponse(sessionId: string, response: AIResponse, responseTime: number): void {
    this.trackEvent('ai_response_received', sessionId, {
      responseLength: response.content.length,
      toolCallCount: response.toolCalls?.length || 0,
      hasToolCalls: (response.toolCalls?.length || 0) > 0
    }, {
      model: response.metadata.model,
      duration: responseTime,
      tokenCount: this.estimateTokens(response.content.length)
    });
  }

  /**
   * Track tool execution
   */
  trackToolExecution(sessionId: string, toolCall: ToolCall, result: AIToolResult, executionTime: number): void {
    this.trackEvent('tool_executed', sessionId, {
      toolName: toolCall.name,
      parameterCount: Object.keys(toolCall.parameters).length,
      success: result.success,
      outputLength: result.output?.length || 0,
      errorType: result.error ? this.categorizeError(result.error) : null
    }, {
      duration: executionTime
    });
  }

  /**
   * Track model switch
   */
  trackModelSwitch(sessionId: string, fromModel: string, toModel: string): void {
    this.trackEvent('model_switched', sessionId, {
      fromModel,
      toModel,
      reason: 'user_initiated' // Could be enhanced to track reasons
    }, {
      model: toModel
    });
  }

  /**
   * Track error occurrence
   */
  trackError(sessionId: string, error: Error, context: any = {}): void {
    this.trackEvent('error_occurred', sessionId, {
      errorName: error.name,
      errorMessage: error.message,
      errorType: this.categorizeError(error.message),
      context
    });
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(sessionId: string, feature: string, data: Record<string, any> = {}): void {
    this.trackEvent('feature_used', sessionId, {
      feature,
      ...data
    });
  }

  /**
   * Generate usage statistics
   */
  getUsageStatistics(timeRange?: { start: Date; end: Date }): UsageStatistics {
    const filteredEvents = this.filterEventsByTimeRange(timeRange);
    
    const conversationStarts = filteredEvents.filter(e => e.type === 'conversation_started');
    const conversationEnds = filteredEvents.filter(e => e.type === 'conversation_ended');
    const messages = filteredEvents.filter(e => e.type === 'message_sent');
    const responses = filteredEvents.filter(e => e.type === 'ai_response_received');
    const toolExecutions = filteredEvents.filter(e => e.type === 'tool_executed');
    const errors = filteredEvents.filter(e => e.type === 'error_occurred');

    // Calculate totals
    const totalTokens = filteredEvents
      .filter(e => e.metadata.tokenCount)
      .reduce((sum, e) => sum + (e.metadata.tokenCount || 0), 0);

    const totalResponseTime = responses
      .filter(e => e.metadata.duration)
      .reduce((sum, e) => sum + (e.metadata.duration || 0), 0);

    const averageResponseTime = responses.length > 0 ? totalResponseTime / responses.length : 0;

    // Calculate conversation length
    const conversationLengths = conversationEnds
      .filter(e => e.data.messageCount)
      .map(e => e.data.messageCount);
    const averageConversationLength = conversationLengths.length > 0 
      ? conversationLengths.reduce((a, b) => a + b, 0) / conversationLengths.length 
      : 0;

    // Most used tools
    const toolCounts: Record<string, number> = {};
    toolExecutions.forEach(e => {
      const toolName = e.data.toolName;
      toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
    });
    const mostUsedTools = Object.entries(toolCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Most used models
    const modelCounts: Record<string, number> = {};
    responses.forEach(e => {
      const model = e.metadata.model || 'unknown';
      modelCounts[model] = (modelCounts[model] || 0) + 1;
    });
    const mostUsedModels = Object.entries(modelCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Error rate
    const totalOperations = responses.length + toolExecutions.length;
    const errorRate = totalOperations > 0 ? (errors.length / totalOperations) * 100 : 0;

    // Active users (simplified - based on unique session IDs)
    const uniqueSessions = new Set(filteredEvents.map(e => e.sessionId));
    const activeUsers = uniqueSessions.size;

    return {
      totalConversations: conversationStarts.length,
      totalMessages: messages.length,
      totalTokensUsed: totalTokens,
      totalToolExecutions: toolExecutions.length,
      averageConversationLength,
      averageResponseTime,
      mostUsedTools,
      mostUsedModels,
      errorRate,
      activeUsers,
      timeRange: timeRange || {
        start: filteredEvents.length > 0 ? filteredEvents[0].timestamp : new Date(),
        end: filteredEvents.length > 0 ? filteredEvents[filteredEvents.length - 1].timestamp : new Date()
      }
    };
  }

  /**
   * Generate performance metrics
   */
  getPerformanceMetrics(timeRange?: { start: Date; end: Date }): PerformanceMetrics {
    const filteredEvents = this.filterEventsByTimeRange(timeRange);
    
    const responses = filteredEvents.filter(e => e.type === 'ai_response_received');
    const toolExecutions = filteredEvents.filter(e => e.type === 'tool_executed');
    const errors = filteredEvents.filter(e => e.type === 'error_occurred');

    // Response time metrics
    const responseTimes = responses
      .filter(e => e.metadata.duration)
      .map(e => e.metadata.duration!)
      .sort((a, b) => a - b);

    const responseTimeMetrics = {
      average: responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      median: responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length / 2)] : 0,
      p95: responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.95)] : 0,
      p99: responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.99)] : 0
    };

    // Token usage metrics
    const tokenCounts = filteredEvents
      .filter(e => e.metadata.tokenCount)
      .map(e => e.metadata.tokenCount!);

    const totalTokens = tokenCounts.reduce((a, b) => a + b, 0);
    const averageTokens = tokenCounts.length > 0 ? totalTokens / tokenCounts.length : 0;

    const tokensByModel: Record<string, number> = {};
    responses.forEach(e => {
      const model = e.metadata.model || 'unknown';
      const tokens = e.metadata.tokenCount || 0;
      tokensByModel[model] = (tokensByModel[model] || 0) + tokens;
    });

    // Tool performance metrics
    const successfulTools = toolExecutions.filter(e => e.data.success).length;
    const toolSuccessRate = toolExecutions.length > 0 ? (successfulTools / toolExecutions.length) * 100 : 0;

    const toolExecutionTimes = toolExecutions
      .filter(e => e.metadata.duration)
      .map(e => e.metadata.duration!);
    const averageToolExecutionTime = toolExecutionTimes.length > 0 
      ? toolExecutionTimes.reduce((a, b) => a + b, 0) / toolExecutionTimes.length 
      : 0;

    const toolPerformanceByTool: Record<string, any> = {};
    toolExecutions.forEach(e => {
      const toolName = e.data.toolName;
      if (!toolPerformanceByTool[toolName]) {
        toolPerformanceByTool[toolName] = {
          count: 0,
          successCount: 0,
          totalTime: 0
        };
      }
      
      toolPerformanceByTool[toolName].count++;
      if (e.data.success) {
        toolPerformanceByTool[toolName].successCount++;
      }
      if (e.metadata.duration) {
        toolPerformanceByTool[toolName].totalTime += e.metadata.duration;
      }
    });

    // Convert to final format
    const toolPerformanceFormatted: Record<string, any> = {};
    Object.entries(toolPerformanceByTool).forEach(([toolName, data]: [string, any]) => {
      toolPerformanceFormatted[toolName] = {
        count: data.count,
        successRate: (data.successCount / data.count) * 100,
        averageTime: data.totalTime / data.count
      };
    });

    // Error metrics
    const errorsByType: Record<string, number> = {};
    errors.forEach(e => {
      const errorType = e.data.errorType || 'unknown';
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    });

    const totalOperations = responses.length + toolExecutions.length;
    const errorRate = totalOperations > 0 ? (errors.length / totalOperations) * 100 : 0;

    return {
      responseTime: responseTimeMetrics,
      tokenUsage: {
        average: averageTokens,
        total: totalTokens,
        byModel: tokensByModel
      },
      toolPerformance: {
        successRate: toolSuccessRate,
        averageExecutionTime: averageToolExecutionTime,
        byTool: toolPerformanceFormatted
      },
      errorMetrics: {
        totalErrors: errors.length,
        errorRate,
        byType: errorsByType
      }
    };
  }

  /**
   * Analyze usage patterns
   */
  analyzeUsagePatterns(timeRange?: { start: Date; end: Date }): UsagePattern[] {
    const filteredEvents = this.filterEventsByTimeRange(timeRange);
    const patterns: UsagePattern[] = [];

    // Daily usage pattern
    const dailyUsage = this.groupEventsByDay(filteredEvents);
    patterns.push({
      type: 'daily',
      name: 'Daily Conversation Activity',
      data: Object.entries(dailyUsage).map(([date, count]) => ({
        label: date,
        value: count,
        timestamp: new Date(date)
      })),
      trend: this.calculateTrend(Object.values(dailyUsage)),
      insights: this.generateDailyInsights(dailyUsage)
    });

    // Hourly usage pattern
    const hourlyUsage = this.groupEventsByHour(filteredEvents);
    patterns.push({
      type: 'hourly',
      name: 'Hourly Usage Distribution',
      data: Object.entries(hourlyUsage).map(([hour, count]) => ({
        label: `${hour}:00`,
        value: count
      })),
      trend: 'stable', // Hourly patterns are typically stable
      insights: this.generateHourlyInsights(hourlyUsage)
    });

    // Feature usage pattern
    const featureUsage = this.analyzeFeatureUsage(filteredEvents);
    patterns.push({
      type: 'feature',
      name: 'Feature Usage',
      data: Object.entries(featureUsage).map(([feature, count]) => ({
        label: feature,
        value: count
      })),
      trend: 'stable',
      insights: this.generateFeatureInsights(featureUsage)
    });

    return patterns;
  }

  /**
   * Analyze user behavior
   */
  analyzeUserBehavior(timeRange?: { start: Date; end: Date }): UserBehavior {
    const filteredEvents = this.filterEventsByTimeRange(timeRange);
    
    // Session duration analysis
    const conversationEnds = filteredEvents.filter(e => e.type === 'conversation_ended');
    const durations = conversationEnds
      .filter(e => e.metadata.duration)
      .map(e => e.metadata.duration!);

    const averageSessionDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0;

    const durationDistribution = this.categorizeDurations(durations);

    // Message pattern analysis
    const messages = filteredEvents.filter(e => e.type === 'message_sent');
    const messageLengths = messages.map(e => e.data.messageLength || 0);
    const averageMessageLength = messageLengths.length > 0 
      ? messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length 
      : 0;

    // Tool usage patterns
    const toolExecutions = filteredEvents.filter(e => e.type === 'tool_executed');
    const toolCounts: Record<string, number> = {};
    toolExecutions.forEach(e => {
      const toolName = e.data.toolName;
      toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;
    });

    const preferredTools = Object.entries(toolCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name]) => name);

    // Model preferences
    const responses = filteredEvents.filter(e => e.type === 'ai_response_received');
    const modelCounts: Record<string, number> = {};
    responses.forEach(e => {
      const model = e.metadata.model || 'unknown';
      modelCounts[model] = (modelCounts[model] || 0) + 1;
    });

    const mostUsedModel = Object.entries(modelCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'unknown';

    const modelSwitches = filteredEvents.filter(e => e.type === 'model_switched').length;
    const switchingFrequency = responses.length > 0 ? modelSwitches / responses.length : 0;

    return {
      sessionDuration: {
        average: averageSessionDuration,
        distribution: durationDistribution
      },
      messagePatterns: {
        averageLength: averageMessageLength,
        commonPhrases: [], // Would require more sophisticated text analysis
        questionTypes: {} // Would require NLP analysis
      },
      toolUsage: {
        preferredTools,
        toolSequences: [] // Would require sequence analysis
      },
      modelPreferences: {
        mostUsed: mostUsedModel,
        switchingFrequency
      }
    };
  }

  /**
   * Generate comprehensive analytics report
   */
  generateAnalyticsReport(timeRange?: { start: Date; end: Date }): AnalyticsReport {
    const summary = this.getUsageStatistics(timeRange);
    const performance = this.getPerformanceMetrics(timeRange);
    const patterns = this.analyzeUsagePatterns(timeRange);
    const userBehavior = this.analyzeUserBehavior(timeRange);

    // Calculate trends (simplified)
    const previousPeriod = this.calculatePreviousPeriod(timeRange);
    const previousSummary = this.getUsageStatistics(previousPeriod);

    const trends = {
      conversationGrowth: this.calculateGrowthRate(previousSummary.totalConversations, summary.totalConversations),
      tokenUsageGrowth: this.calculateGrowthRate(previousSummary.totalTokensUsed, summary.totalTokensUsed),
      errorRateChange: performance.errorMetrics.errorRate - (previousSummary.errorRate || 0)
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(summary, performance, patterns);

    return {
      generatedAt: new Date(),
      timeRange: timeRange || {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        end: new Date()
      },
      summary,
      performance,
      patterns,
      userBehavior,
      recommendations,
      trends
    };
  }

  /**
   * Clear analytics data
   */
  clearAnalyticsData(): void {
    this.events = [];
    this.persistEvents();
    this.logger.info('Analytics data cleared');
  }

  /**
   * Export analytics data
   */
  exportAnalyticsData(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify({
        events: this.events,
        exportedAt: new Date(),
        version: this.version
      }, null, 2);
    } else {
      // CSV format
      const headers = ['timestamp', 'type', 'sessionId', 'model', 'duration', 'tokenCount', 'data'];
      const rows = this.events.map(event => [
        event.timestamp.toISOString(),
        event.type,
        event.sessionId,
        event.metadata.model || '',
        event.metadata.duration || '',
        event.metadata.tokenCount || '',
        JSON.stringify(event.data).replace(/"/g, '""')
      ]);

      return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }
  }

  /**
   * Private helper methods
   */
  private filterEventsByTimeRange(timeRange?: { start: Date; end: Date }): AnalyticsEvent[] {
    if (!timeRange) {
      return this.events;
    }

    return this.events.filter(event => 
      event.timestamp >= timeRange.start && event.timestamp <= timeRange.end
    );
  }

  private groupEventsByDay(events: AnalyticsEvent[]): Record<string, number> {
    const dailyGroups: Record<string, number> = {};
    
    events.forEach(event => {
      const date = event.timestamp.toISOString().split('T')[0];
      dailyGroups[date] = (dailyGroups[date] || 0) + 1;
    });

    return dailyGroups;
  }

  private groupEventsByHour(events: AnalyticsEvent[]): Record<string, number> {
    const hourlyGroups: Record<string, number> = {};
    
    events.forEach(event => {
      const hour = event.timestamp.getHours().toString();
      hourlyGroups[hour] = (hourlyGroups[hour] || 0) + 1;
    });

    return hourlyGroups;
  }

  private analyzeFeatureUsage(events: AnalyticsEvent[]): Record<string, number> {
    const featureUsage: Record<string, number> = {};
    
    events.forEach(event => {
      let feature = event.type;
      
      // Map event types to user-friendly feature names
      switch (event.type) {
        case 'tool_executed':
          feature = event.type;
          break;
        case 'model_switched':
          feature = event.type;
          break;
        case 'session_exported':
          feature = event.type;
          break;
        case 'feature_used':
          feature = event.data.feature;
          break;
      }
      
      featureUsage[feature] = (featureUsage[feature] || 0) + 1;
    });

    return featureUsage;
  }

  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const change = (secondAvg - firstAvg) / firstAvg;
    
    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  private generateDailyInsights(dailyUsage: Record<string, number>): string[] {
    const insights: string[] = [];
    const values = Object.values(dailyUsage);
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    
    const peakDay = Object.entries(dailyUsage)
      .sort(([, a], [, b]) => b - a)[0];
    
    if (peakDay) {
      insights.push(`Peak usage day: ${peakDay[0]} with ${peakDay[1]} conversations`);
    }
    
    if (average > 0) {
      insights.push(`Average daily conversations: ${Math.round(average)}`);
    }
    
    return insights;
  }

  private generateHourlyInsights(hourlyUsage: Record<string, number>): string[] {
    const insights: string[] = [];
    const peakHour = Object.entries(hourlyUsage)
      .sort(([, a], [, b]) => b - a)[0];
    
    if (peakHour) {
      insights.push(`Peak usage hour: ${peakHour[0]}:00 with ${peakHour[1]} activities`);
    }
    
    return insights;
  }

  private generateFeatureInsights(featureUsage: Record<string, number>): string[] {
    const insights: string[] = [];
    const topFeature = Object.entries(featureUsage)
      .sort(([, a], [, b]) => b - a)[0];
    
    if (topFeature) {
      insights.push(`Most used feature: ${topFeature[0]} (${topFeature[1]} times)`);
    }
    
    return insights;
  }

  private categorizeDurations(durations: number[]): Record<string, number> {
    const categories = {
      'Short (< 5 min)': 0,
      'Medium (5-15 min)': 0,
      'Long (15-30 min)': 0,
      'Very Long (> 30 min)': 0
    };

    durations.forEach(duration => {
      const minutes = duration / (1000 * 60);
      if (minutes < 5) {
        categories['Short (< 5 min)']++;
      } else if (minutes < 15) {
        categories['Medium (5-15 min)']++;
      } else if (minutes < 30) {
        categories['Long (15-30 min)']++;
      } else {
        categories['Very Long (> 30 min)']++;
      }
    });

    return categories;
  }

  private calculatePreviousPeriod(timeRange?: { start: Date; end: Date }): { start: Date; end: Date } {
    if (!timeRange) {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      return { start: sixtyDaysAgo, end: thirtyDaysAgo };
    }

    const duration = timeRange.end.getTime() - timeRange.start.getTime();
    return {
      start: new Date(timeRange.start.getTime() - duration),
      end: timeRange.start
    };
  }

  private calculateGrowthRate(previous: number, current: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  private generateRecommendations(
    summary: UsageStatistics,
    performance: PerformanceMetrics,
    patterns: UsagePattern[]
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    if (performance.responseTime.average > 5000) {
      recommendations.push('Consider optimizing AI response times - current average is above 5 seconds');
    }

    if (performance.errorMetrics.errorRate > 5) {
      recommendations.push('Error rate is above 5% - review error handling and tool implementations');
    }

    // Usage recommendations
    if (summary.averageConversationLength < 3) {
      recommendations.push('Short conversation lengths detected - consider improving user engagement');
    }

    if (summary.totalToolExecutions / summary.totalMessages > 2) {
      recommendations.push('High tool usage ratio - consider optimizing tool selection and execution');
    }

    // Pattern-based recommendations
    const dailyPattern = patterns.find(p => p.type === 'daily');
    if (dailyPattern && dailyPattern.trend === 'decreasing') {
      recommendations.push('Daily usage is decreasing - consider user engagement strategies');
    }

    return recommendations;
  }

  private categorizeMessage(length: number): string {
    if (length < 50) return 'short';
    if (length < 200) return 'medium';
    return 'long';
  }

  private categorizeError(error: string): string {
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('network') || error.includes('connection')) return 'network';
    if (error.includes('validation') || error.includes('parameter')) return 'validation';
    if (error.includes('permission') || error.includes('access')) return 'permission';
    return 'unknown';
  }

  private estimateTokens(textLength: number): number {
    // Simple token estimation (approximately 4 characters per token)
    return Math.ceil(textLength / 4);
  }

  private persistEvents(): void {
    try {
      // In a real implementation, this would persist to a database or file
      // For now, we'll use a simple in-memory approach
      this.logger.debug('Events persisted', { count: this.events.length });
    } catch (error) {
      this.logger.error('Failed to persist analytics events', { error });
    }
  }

  private loadPersistedEvents(): void {
    try {
      // In a real implementation, this would load from a database or file
      this.logger.debug('Analytics events loaded');
    } catch (error) {
      this.logger.error('Failed to load persisted analytics events', { error });
    }
  }
}