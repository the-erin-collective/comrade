/**
 * Conversation Debugging Tools
 * 
 * Provides comprehensive debugging capabilities for AI responses and tool executions
 * including performance analysis, error tracking, and conversation flow visualization.
 */

import { Logger } from './logger';
import { AIMessage, AIResponse, ToolCall, AIToolResult, ResponseMetadata } from './ai-agent';
import { ConversationContextManager } from './conversation-context';

// Create logger instance
const logger = new Logger({ prefix: 'ConversationDebug' });

/**
 * Debug session information
 */
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

/**
 * Debug event types
 */
export type DebugEventType = 
  | 'message_sent'
  | 'ai_response_received'
  | 'tool_call_started'
  | 'tool_call_completed'
  | 'tool_call_failed'
  | 'context_truncated'
  | 'model_switched'
  | 'error_occurred'
  | 'session_started'
  | 'session_ended';

/**
 * Debug event structure
 */
export interface DebugEvent {
  id: string;
  sessionId: string;
  type: DebugEventType;
  timestamp: Date;
  data: any;
  metadata: {
    duration?: number;
    tokenCount?: number;
    errorCode?: string;
    stackTrace?: string;
  };
}

/**
 * Performance metrics for AI responses
 */
export interface AIResponseMetrics {
  responseTime: number;
  tokenCount: number;
  tokensPerSecond: number;
  modelUsed: string;
  toolCallCount: number;
  contextSize: number;
  truncationOccurred: boolean;
}

/**
 * Tool execution metrics
 */
export interface ToolExecutionMetrics {
  toolName: string;
  executionTime: number;
  success: boolean;
  parameterCount: number;
  outputSize: number;
  errorType?: string;
  retryCount: number;
}

/**
 * Conversation flow analysis
 */
export interface ConversationFlow {
  sessionId: string;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  toolExecutions: number;
  averageResponseTime: number;
  conversationPatterns: ConversationPattern[];
  errorPatterns: ErrorPattern[];
  performanceIssues: PerformanceIssue[];
}

/**
 * Conversation pattern detection
 */
export interface ConversationPattern {
  type: 'repetitive_questions' | 'tool_heavy' | 'context_switching' | 'error_recovery';
  description: string;
  occurrences: number;
  examples: string[];
  severity: 'low' | 'medium' | 'high';
}

/**
 * Error pattern analysis
 */
export interface ErrorPattern {
  type: string;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  affectedTools: string[];
  commonCauses: string[];
  suggestedFixes: string[];
}

/**
 * Performance issue detection
 */
export interface PerformanceIssue {
  type: 'slow_response' | 'high_token_usage' | 'frequent_truncation' | 'tool_timeout';
  description: string;
  severity: 'low' | 'medium' | 'high';
  occurrences: number;
  impact: string;
  recommendations: string[];
}

/**
 * Debug report structure
 */
export interface DebugReport {
  sessionId: string;
  generatedAt: Date;
  timeRange: {
    start: Date;
    end: Date;
  };
  summary: {
    totalEvents: number;
    errorCount: number;
    averageResponseTime: number;
    totalTokensUsed: number;
    toolExecutionSuccess: number;
  };
  conversationFlow: ConversationFlow;
  performanceMetrics: AIResponseMetrics[];
  toolMetrics: ToolExecutionMetrics[];
  errorAnalysis: ErrorPattern[];
  recommendations: string[];
}

/**
 * Conversation Debugging Service
 */
export class ConversationDebugService {
  private logger: Logger;
  private debugEvents: Map<string, DebugEvent[]> = new Map();
  private activeSessions: Map<string, DebugSession> = new Map();
  private performanceThresholds = {
    slowResponseTime: 10000, // 10 seconds
    highTokenUsage: 2000,
    frequentTruncation: 5 // times per session
  };

  constructor() {
    this.logger = logger.child({ prefix: 'Service' });
  }

  /**
   * Start debugging session
   */
  startDebugSession(sessionId: string, title: string): DebugSession {
    const session: DebugSession = {
      id: sessionId,
      title,
      startTime: new Date(),
      messageCount: 0,
      toolExecutionCount: 0,
      errorCount: 0,
      averageResponseTime: 0,
      status: 'active'
    };

    this.activeSessions.set(sessionId, session);
    this.debugEvents.set(sessionId, []);

    this.recordEvent(sessionId, 'session_started', { title });

    this.logger.info('Debug session started', { sessionId, title });
    return session;
  }

  /**
   * End debugging session
   */
  endDebugSession(sessionId: string): DebugSession | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.endTime = new Date();
    session.status = 'completed';

    this.recordEvent(sessionId, 'session_ended', {
      duration: session.endTime.getTime() - session.startTime.getTime(),
      messageCount: session.messageCount,
      toolExecutionCount: session.toolExecutionCount,
      errorCount: session.errorCount
    });

    this.logger.info('Debug session ended', { sessionId, duration: session.endTime.getTime() - session.startTime.getTime() });
    return session;
  }

  /**
   * Record debug event
   */
  recordEvent(sessionId: string, type: DebugEventType, data: any, metadata: Partial<DebugEvent['metadata']> = {}): void {
    const event: DebugEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      type,
      timestamp: new Date(),
      data,
      metadata
    };

    const events = this.debugEvents.get(sessionId) || [];
    events.push(event);
    this.debugEvents.set(sessionId, events);

    // Update session statistics
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.updateSessionStats(session, event);
    }

    this.logger.debug('Debug event recorded', { sessionId, type, eventId: event.id });
  }

  /**
   * Record AI message sent
   */
  recordMessageSent(sessionId: string, message: string, contextSize: number): void {
    this.recordEvent(sessionId, 'message_sent', {
      message: message.substring(0, 200) + (message.length > 200 ? '...' : ''),
      messageLength: message.length,
      contextSize
    }, {
      tokenCount: this.estimateTokens(message)
    });
  }

  /**
   * Record AI response received
   */
  recordAIResponse(sessionId: string, response: AIResponse, responseTime: number, contextSize: number): void {
    const metrics: AIResponseMetrics = {
      responseTime,
      tokenCount: this.estimateTokens(response.content),
      tokensPerSecond: this.estimateTokens(response.content) / (responseTime / 1000),
      modelUsed: response.metadata.model || 'unknown',
      toolCallCount: response.toolCalls?.length || 0,
      contextSize,
      truncationOccurred: false // This would be set by context manager
    };

    this.recordEvent(sessionId, 'ai_response_received', {
      response: response.content.substring(0, 200) + (response.content.length > 200 ? '...' : ''),
      responseLength: response.content.length,
      toolCalls: response.toolCalls?.map(tc => tc.name) || [],
      metadata: response.metadata
    }, {
      duration: responseTime,
      tokenCount: metrics.tokenCount
    });

    // Check for performance issues
    this.analyzeResponsePerformance(sessionId, metrics);
  }

  /**
   * Record tool call execution
   */
  recordToolExecution(sessionId: string, toolCall: ToolCall, result: AIToolResult, executionTime: number): void {
    const metrics: ToolExecutionMetrics = {
      toolName: toolCall.name,
      executionTime,
      success: result.success,
      parameterCount: Object.keys(toolCall.parameters).length,
      outputSize: result.output?.length || 0,
      errorType: result.error ? this.categorizeError(result.error) : undefined,
      retryCount: 0 // Would be tracked separately
    };

    const eventType = result.success ? 'tool_call_completed' : 'tool_call_failed';
    
    this.recordEvent(sessionId, eventType, {
      toolName: toolCall.name,
      parameters: toolCall.parameters,
      result: {
        success: result.success,
        output: result.output?.substring(0, 200) + (result.output && result.output.length > 200 ? '...' : ''),
        error: result.error
      }
    }, {
      duration: executionTime,
      errorCode: result.error ? this.getErrorCode(result.error) : undefined
    });

    // Analyze tool performance
    this.analyzeToolPerformance(sessionId, metrics);
  }

  /**
   * Record error occurrence
   */
  recordError(sessionId: string, error: Error, context: any = {}): void {
    this.recordEvent(sessionId, 'error_occurred', {
      message: error.message,
      name: error.name,
      context
    }, {
      errorCode: error.name,
      stackTrace: error.stack
    });

    // Update session error count
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.errorCount++;
      session.status = 'error';
    }
  }

  /**
   * Record context truncation
   */
  recordContextTruncation(sessionId: string, beforeSize: number, afterSize: number, strategy: string): void {
    this.recordEvent(sessionId, 'context_truncated', {
      beforeSize,
      afterSize,
      reduction: beforeSize - afterSize,
      strategy
    });
  }

  /**
   * Generate debug report
   */
  generateDebugReport(sessionId: string): DebugReport | null {
    const events = this.debugEvents.get(sessionId);
    const session = this.activeSessions.get(sessionId);

    if (!events || !session) {
      return null;
    }

    const timeRange = {
      start: session.startTime,
      end: session.endTime || new Date()
    };

    // Analyze events
    const conversationFlow = this.analyzeConversationFlow(sessionId, events);
    const performanceMetrics = this.extractPerformanceMetrics(events);
    const toolMetrics = this.extractToolMetrics(events);
    const errorAnalysis = this.analyzeErrorPatterns(events);

    // Generate summary
    const summary = {
      totalEvents: events.length,
      errorCount: events.filter(e => e.type === 'error_occurred').length,
      averageResponseTime: this.calculateAverageResponseTime(events),
      totalTokensUsed: this.calculateTotalTokens(events),
      toolExecutionSuccess: this.calculateToolSuccessRate(events)
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations(conversationFlow, performanceMetrics, errorAnalysis);

    const report: DebugReport = {
      sessionId,
      generatedAt: new Date(),
      timeRange,
      summary,
      conversationFlow,
      performanceMetrics,
      toolMetrics,
      errorAnalysis,
      recommendations
    };

    this.logger.info('Debug report generated', { sessionId, eventCount: events.length });
    return report;
  }

  /**
   * Get debug session information
   */
  getDebugSession(sessionId: string): DebugSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get all debug events for a session
   */
  getDebugEvents(sessionId: string): DebugEvent[] {
    return this.debugEvents.get(sessionId) || [];
  }

  /**
   * Clear debug data for a session
   */
  clearDebugData(sessionId: string): void {
    this.debugEvents.delete(sessionId);
    this.activeSessions.delete(sessionId);
    this.logger.info('Debug data cleared', { sessionId });
  }

  /**
   * Export debug data
   */
  exportDebugData(sessionId: string, format: 'json' | 'csv' = 'json'): string {
    const events = this.debugEvents.get(sessionId) || [];
    const session = this.activeSessions.get(sessionId);

    if (format === 'json') {
      return JSON.stringify({
        session,
        events,
        exportedAt: new Date()
      }, null, 2);
    } else {
      // CSV format
      const headers = ['timestamp', 'type', 'duration', 'tokenCount', 'errorCode', 'data'];
      const rows = events.map(event => [
        event.timestamp.toISOString(),
        event.type,
        event.metadata.duration || '',
        event.metadata.tokenCount || '',
        event.metadata.errorCode || '',
        JSON.stringify(event.data).replace(/"/g, '""')
      ]);

      return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }
  }

  /**
   * Private helper methods
   */
  private updateSessionStats(session: DebugSession, event: DebugEvent): void {
    switch (event.type) {
      case 'message_sent':
        session.messageCount++;
        break;
      case 'tool_call_completed':
      case 'tool_call_failed':
        session.toolExecutionCount++;
        break;
      case 'error_occurred':
        session.errorCount++;
        break;
    }

    // Update average response time
    if (event.metadata.duration) {
      const totalTime = session.averageResponseTime * (session.messageCount - 1) + event.metadata.duration;
      session.averageResponseTime = totalTime / session.messageCount;
    }
  }

  private analyzeResponsePerformance(sessionId: string, metrics: AIResponseMetrics): void {
    if (metrics.responseTime > this.performanceThresholds.slowResponseTime) {
      this.logger.warn('Slow AI response detected', { sessionId, responseTime: metrics.responseTime });
    }

    if (metrics.tokenCount > this.performanceThresholds.highTokenUsage) {
      this.logger.warn('High token usage detected', { sessionId, tokenCount: metrics.tokenCount });
    }
  }

  private analyzeToolPerformance(sessionId: string, metrics: ToolExecutionMetrics): void {
    if (!metrics.success) {
      this.logger.warn('Tool execution failed', { 
        sessionId, 
        toolName: metrics.toolName, 
        errorType: metrics.errorType 
      });
    }

    if (metrics.executionTime > 5000) { // 5 seconds
      this.logger.warn('Slow tool execution', { 
        sessionId, 
        toolName: metrics.toolName, 
        executionTime: metrics.executionTime 
      });
    }
  }

  private analyzeConversationFlow(sessionId: string, events: DebugEvent[]): ConversationFlow {
    const messageEvents = events.filter(e => e.type === 'message_sent' || e.type === 'ai_response_received');
    const toolEvents = events.filter(e => e.type.startsWith('tool_call_'));
    
    const userMessages = events.filter(e => e.type === 'message_sent').length;
    const assistantMessages = events.filter(e => e.type === 'ai_response_received').length;
    const toolExecutions = toolEvents.length;

    const responseTimes = events
      .filter(e => e.metadata.duration)
      .map(e => e.metadata.duration!);
    const averageResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;

    // Detect patterns
    const patterns = this.detectConversationPatterns(events);
    const errorPatterns = this.analyzeErrorPatterns(events);
    const performanceIssues = this.detectPerformanceIssues(events);

    return {
      sessionId,
      totalMessages: messageEvents.length,
      userMessages,
      assistantMessages,
      toolExecutions,
      averageResponseTime,
      conversationPatterns: patterns,
      errorPatterns,
      performanceIssues
    };
  }

  private detectConversationPatterns(events: DebugEvent[]): ConversationPattern[] {
    const patterns: ConversationPattern[] = [];

    // Detect tool-heavy conversations
    const toolEvents = events.filter(e => e.type.startsWith('tool_call_'));
    const messageEvents = events.filter(e => e.type === 'message_sent');
    
    if (toolEvents.length > messageEvents.length * 2) {
      patterns.push({
        type: 'tool_heavy',
        description: 'Conversation has significantly more tool executions than messages',
        occurrences: toolEvents.length,
        examples: toolEvents.slice(0, 3).map(e => e.data.toolName || 'unknown'),
        severity: 'medium'
      });
    }

    // Detect repetitive questions (simplified)
    const userMessages = events.filter(e => e.type === 'message_sent');
    const messageLengths = userMessages.map(e => e.data.messageLength);
    const avgLength = messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length;
    
    if (messageLengths.filter(len => Math.abs(len - avgLength) < avgLength * 0.1).length > messageLengths.length * 0.7) {
      patterns.push({
        type: 'repetitive_questions',
        description: 'User messages have similar lengths, possibly repetitive',
        occurrences: messageLengths.length,
        examples: [],
        severity: 'low'
      });
    }

    return patterns;
  }

  private analyzeErrorPatterns(events: DebugEvent[]): ErrorPattern[] {
    const errorEvents = events.filter(e => e.type === 'error_occurred' || e.type === 'tool_call_failed');
    const errorsByType: Map<string, DebugEvent[]> = new Map();

    // Group errors by type
    for (const event of errorEvents) {
      const errorType = event.metadata.errorCode || event.data.name || 'unknown';
      const existing = errorsByType.get(errorType) || [];
      existing.push(event);
      errorsByType.set(errorType, existing);
    }

    // Convert to error patterns
    const patterns: ErrorPattern[] = [];
    for (const [type, typeEvents] of errorsByType) {
      const timestamps = typeEvents.map(e => e.timestamp);
      const affectedTools = typeEvents
        .filter(e => e.data.toolName)
        .map(e => e.data.toolName);

      patterns.push({
        type,
        count: typeEvents.length,
        firstOccurrence: new Date(Math.min(...timestamps.map(t => t.getTime()))),
        lastOccurrence: new Date(Math.max(...timestamps.map(t => t.getTime()))),
        affectedTools: [...new Set(affectedTools)],
        commonCauses: this.identifyCommonCauses(typeEvents),
        suggestedFixes: this.generateErrorFixes(type, typeEvents)
      });
    }

    return patterns;
  }

  private detectPerformanceIssues(events: DebugEvent[]): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];

    // Slow responses
    const slowResponses = events.filter(e => 
      e.metadata.duration && e.metadata.duration > this.performanceThresholds.slowResponseTime
    );
    
    if (slowResponses.length > 0) {
      issues.push({
        type: 'slow_response',
        description: `${slowResponses.length} responses took longer than ${this.performanceThresholds.slowResponseTime}ms`,
        severity: slowResponses.length > 3 ? 'high' : 'medium',
        occurrences: slowResponses.length,
        impact: 'Poor user experience due to slow AI responses',
        recommendations: [
          'Consider using a faster model',
          'Reduce context size',
          'Optimize system prompts'
        ]
      });
    }

    // High token usage
    const highTokenEvents = events.filter(e => 
      e.metadata.tokenCount && e.metadata.tokenCount > this.performanceThresholds.highTokenUsage
    );
    
    if (highTokenEvents.length > 0) {
      issues.push({
        type: 'high_token_usage',
        description: `${highTokenEvents.length} events used more than ${this.performanceThresholds.highTokenUsage} tokens`,
        severity: 'medium',
        occurrences: highTokenEvents.length,
        impact: 'Increased API costs and slower responses',
        recommendations: [
          'Implement more aggressive context truncation',
          'Use shorter system prompts',
          'Summarize conversation history'
        ]
      });
    }

    return issues;
  }

  private extractPerformanceMetrics(events: DebugEvent[]): AIResponseMetrics[] {
    return events
      .filter(e => e.type === 'ai_response_received')
      .map(e => ({
        responseTime: e.metadata.duration || 0,
        tokenCount: e.metadata.tokenCount || 0,
        tokensPerSecond: e.metadata.tokenCount && e.metadata.duration 
          ? (e.metadata.tokenCount / (e.metadata.duration / 1000)) 
          : 0,
        modelUsed: e.data.metadata?.model || 'unknown',
        toolCallCount: e.data.toolCalls?.length || 0,
        contextSize: e.data.contextSize || 0,
        truncationOccurred: false
      }));
  }

  private extractToolMetrics(events: DebugEvent[]): ToolExecutionMetrics[] {
    return events
      .filter(e => e.type === 'tool_call_completed' || e.type === 'tool_call_failed')
      .map(e => ({
        toolName: e.data.toolName,
        executionTime: e.metadata.duration || 0,
        success: e.type === 'tool_call_completed',
        parameterCount: Object.keys(e.data.parameters || {}).length,
        outputSize: e.data.result?.output?.length || 0,
        errorType: e.data.result?.error ? this.categorizeError(e.data.result.error) : undefined,
        retryCount: 0
      }));
  }

  private calculateAverageResponseTime(events: DebugEvent[]): number {
    const responseTimes = events
      .filter(e => e.type === 'ai_response_received' && e.metadata.duration)
      .map(e => e.metadata.duration!);
    
    return responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;
  }

  private calculateTotalTokens(events: DebugEvent[]): number {
    return events
      .filter(e => e.metadata.tokenCount)
      .reduce((total, e) => total + (e.metadata.tokenCount || 0), 0);
  }

  private calculateToolSuccessRate(events: DebugEvent[]): number {
    const toolEvents = events.filter(e => e.type.startsWith('tool_call_'));
    const successfulTools = events.filter(e => e.type === 'tool_call_completed').length;
    
    return toolEvents.length > 0 ? (successfulTools / toolEvents.length) * 100 : 0;
  }

  private generateRecommendations(
    flow: ConversationFlow, 
    metrics: AIResponseMetrics[], 
    errors: ErrorPattern[]
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    if (flow.averageResponseTime > this.performanceThresholds.slowResponseTime) {
      recommendations.push('Consider using a faster AI model or reducing context size to improve response times');
    }

    // Tool usage recommendations
    if (flow.toolExecutions > flow.userMessages * 3) {
      recommendations.push('High tool usage detected - consider consolidating tool calls or optimizing tool selection');
    }

    // Error recommendations
    if (errors.length > 0) {
      recommendations.push('Multiple error patterns detected - review error handling and tool implementations');
    }

    // Token usage recommendations
    const avgTokens = metrics.reduce((sum, m) => sum + m.tokenCount, 0) / metrics.length;
    if (avgTokens > this.performanceThresholds.highTokenUsage) {
      recommendations.push('High token usage detected - implement context compression or more aggressive truncation');
    }

    return recommendations;
  }

  private identifyCommonCauses(events: DebugEvent[]): string[] {
    // Simplified common cause identification
    const causes: string[] = [];
    
    const hasNetworkErrors = events.some(e => 
      e.data.message?.includes('network') || e.data.message?.includes('connection')
    );
    if (hasNetworkErrors) {
      causes.push('Network connectivity issues');
    }

    const hasTimeoutErrors = events.some(e => 
      e.data.message?.includes('timeout') || e.data.message?.includes('timed out')
    );
    if (hasTimeoutErrors) {
      causes.push('Operation timeouts');
    }

    return causes;
  }

  private generateErrorFixes(type: string, events: DebugEvent[]): string[] {
    const fixes: string[] = [];

    if (type.includes('timeout')) {
      fixes.push('Increase timeout values for operations');
      fixes.push('Implement retry mechanisms with exponential backoff');
    }

    if (type.includes('network') || type.includes('connection')) {
      fixes.push('Check network connectivity');
      fixes.push('Implement connection pooling and retry logic');
    }

    if (type.includes('validation') || type.includes('parameter')) {
      fixes.push('Add parameter validation before tool execution');
      fixes.push('Provide better error messages for invalid parameters');
    }

    return fixes;
  }

  private categorizeError(error: string): string {
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('network') || error.includes('connection')) return 'network';
    if (error.includes('validation') || error.includes('parameter')) return 'validation';
    if (error.includes('permission') || error.includes('access')) return 'permission';
    return 'unknown';
  }

  private getErrorCode(error: string): string {
    // Extract error codes from error messages
    const codeMatch = error.match(/\b[A-Z_]+_ERROR\b/);
    return codeMatch ? codeMatch[0] : 'UNKNOWN_ERROR';
  }

  private estimateTokens(text: string): number {
    // Simple token estimation (approximately 4 characters per token)
    return Math.ceil(text.length / 4);
  }
}