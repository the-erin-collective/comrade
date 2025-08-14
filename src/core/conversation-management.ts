/**
 * Conversation Management Service
 * 
 * Integrates export, debugging, analytics, and search capabilities
 * to provide a comprehensive conversation management system.
 */

import * as vscode from 'vscode';
import { Logger } from './logger';
import { ConversationContextManager } from './conversation-context';
import { ConversationExportService, ExportOptions, ExportResult } from './conversation-export';
import { ConversationDebugService, DebugReport, DebugSession } from './conversation-debug';
import { ConversationAnalyticsService, AnalyticsReport, UsageStatistics } from './conversation-analytics';
import { ConversationSearchService, SearchQuery, SearchResults, ConversationFilter } from './conversation-search';
import { AIResponse, ToolCall, AIToolResult } from './ai-agent';

// Create logger instance
const logger = new Logger({ prefix: 'ConversationManagement' });

/**
 * Conversation management configuration
 */
export interface ConversationManagementConfig {
  /** Enable debug tracking */
  enableDebugTracking: boolean;
  /** Enable analytics tracking */
  enableAnalytics: boolean;
  /** Enable search indexing */
  enableSearchIndexing: boolean;
  /** Auto-export conversations */
  autoExportEnabled: boolean;
  /** Auto-export format */
  autoExportFormat: 'json' | 'markdown';
  /** Maximum conversations to keep in memory */
  maxConversationsInMemory: number;
  /** Debug data retention period (days) */
  debugRetentionDays: number;
  /** Analytics data retention period (days) */
  analyticsRetentionDays: number;
}

/**
 * Conversation metadata
 */
export interface ConversationMetadata {
  id: string;
  title: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
  toolExecutionCount: number;
  isActive: boolean;
  hasDebugData: boolean;
  hasAnalyticsData: boolean;
  isSearchIndexed: boolean;
}

/**
 * Comprehensive Conversation Management Service
 */
export class ConversationManagementService {
  private logger: Logger;
  private config: ConversationManagementConfig;
  
  // Service instances
  private exportService: ConversationExportService;
  private debugService: ConversationDebugService;
  private analyticsService: ConversationAnalyticsService;
  private searchService: ConversationSearchService;
  
  // Conversation tracking
  private conversations: Map<string, ConversationContextManager> = new Map();
  private conversationMetadata: Map<string, ConversationMetadata> = new Map();
  private activeConversations: Set<string> = new Set();

  constructor(config?: Partial<ConversationManagementConfig>) {
    this.logger = logger.child({ prefix: 'Service' });
    
    // Set default configuration
    this.config = {
      enableDebugTracking: true,
      enableAnalytics: true,
      enableSearchIndexing: true,
      autoExportEnabled: false,
      autoExportFormat: 'json',
      maxConversationsInMemory: 100,
      debugRetentionDays: 30,
      analyticsRetentionDays: 90,
      ...config
    };

    // Initialize services
    this.exportService = new ConversationExportService();
    this.debugService = new ConversationDebugService();
    this.analyticsService = new ConversationAnalyticsService();
    this.searchService = new ConversationSearchService();

    this.logger.info('Conversation management service initialized', { config: this.config });
  }

  /**
   * Register a new conversation
   */
  registerConversation(
    id: string, 
    contextManager: ConversationContextManager, 
    title?: string
  ): void {
    // Store conversation
    this.conversations.set(id, contextManager);
    
    // Create metadata
    const metadata: ConversationMetadata = {
      id,
      title: title || `Conversation ${id}`,
      createdAt: new Date(),
      lastActivity: new Date(),
      messageCount: contextManager.messages.length,
      toolExecutionCount: contextManager.toolResults.length,
      isActive: true,
      hasDebugData: this.config.enableDebugTracking,
      hasAnalyticsData: this.config.enableAnalytics,
      isSearchIndexed: this.config.enableSearchIndexing
    };
    
    this.conversationMetadata.set(id, metadata);
    this.activeConversations.add(id);

    // Initialize services for this conversation
    if (this.config.enableDebugTracking) {
      this.debugService.startDebugSession(id, metadata.title);
    }

    if (this.config.enableAnalytics) {
      this.analyticsService.trackConversationStart(id, 'unknown'); // Model would be provided separately
    }

    if (this.config.enableSearchIndexing) {
      this.searchService.registerConversation(id, contextManager, metadata.title);
    }

    // Manage memory usage
    this.manageMemoryUsage();

    this.logger.info('Conversation registered', { id, title: metadata.title });
  }

  /**
   * Unregister a conversation
   */
  unregisterConversation(id: string): void {
    const metadata = this.conversationMetadata.get(id);
    if (!metadata) {
      return;
    }

    // Auto-export if enabled
    if (this.config.autoExportEnabled) {
      this.autoExportConversation(id);
    }

    // End debug session
    if (this.config.enableDebugTracking) {
      this.debugService.endDebugSession(id);
    }

    // Track conversation end
    if (this.config.enableAnalytics) {
      const duration = Date.now() - metadata.createdAt.getTime();
      this.analyticsService.trackConversationEnd(
        id, 
        duration, 
        metadata.messageCount, 
        0 // Token count would be calculated
      );
    }

    // Remove from search index
    if (this.config.enableSearchIndexing) {
      this.searchService.unregisterConversation(id);
    }

    // Clean up
    this.conversations.delete(id);
    this.conversationMetadata.delete(id);
    this.activeConversations.delete(id);

    this.logger.info('Conversation unregistered', { id });
  }

  /**
   * Track message sent
   */
  trackMessageSent(sessionId: string, message: string, contextSize: number): void {
    this.updateLastActivity(sessionId);

    if (this.config.enableDebugTracking) {
      this.debugService.recordMessageSent(sessionId, message, contextSize);
    }

    if (this.config.enableAnalytics) {
      this.analyticsService.trackMessageSent(sessionId, message.length, contextSize > 0);
    }
  }

  /**
   * Track AI response received
   */
  trackAIResponse(sessionId: string, response: AIResponse, responseTime: number, contextSize: number): void {
    this.updateLastActivity(sessionId);

    if (this.config.enableDebugTracking) {
      this.debugService.recordAIResponse(sessionId, response, responseTime, contextSize);
    }

    if (this.config.enableAnalytics) {
      this.analyticsService.trackAIResponse(sessionId, response, responseTime);
    }
  }

  /**
   * Track tool execution
   */
  trackToolExecution(sessionId: string, toolCall: ToolCall, result: AIToolResult, executionTime: number): void {
    this.updateLastActivity(sessionId);

    if (this.config.enableDebugTracking) {
      this.debugService.recordToolExecution(sessionId, toolCall, result, executionTime);
    }

    if (this.config.enableAnalytics) {
      this.analyticsService.trackToolExecution(sessionId, toolCall, result, executionTime);
    }
  }

  /**
   * Track error occurrence
   */
  trackError(sessionId: string, error: Error, context: any = {}): void {
    this.updateLastActivity(sessionId);

    if (this.config.enableDebugTracking) {
      this.debugService.recordError(sessionId, error, context);
    }

    if (this.config.enableAnalytics) {
      this.analyticsService.trackError(sessionId, error, context);
    }
  }

  /**
   * Export conversation
   */
  async exportConversation(
    sessionId: string, 
    options: ExportOptions, 
    filePath?: string
  ): Promise<ExportResult> {
    const contextManager = this.conversations.get(sessionId);
    const metadata = this.conversationMetadata.get(sessionId);
    
    if (!contextManager || !metadata) {
      throw new Error(`Conversation ${sessionId} not found`);
    }

    const result = await this.exportService.exportToFile(
      contextManager,
      options,
      sessionId,
      filePath,
      metadata.title
    );

    // Track export
    if (this.config.enableAnalytics) {
      this.analyticsService.trackFeatureUsage(sessionId, 'conversation_export', {
        format: options.format,
        success: result.success
      });
    }

    this.logger.info('Conversation exported', { sessionId, success: result.success });
    return result;
  }

  /**
   * Generate debug report
   */
  generateDebugReport(sessionId: string): DebugReport | null {
    if (!this.config.enableDebugTracking) {
      return null;
    }

    const report = this.debugService.generateDebugReport(sessionId);
    
    if (report && this.config.enableAnalytics) {
      this.analyticsService.trackFeatureUsage(sessionId, 'debug_report_generated');
    }

    return report;
  }

  /**
   * Generate analytics report
   */
  generateAnalyticsReport(timeRange?: { start: Date; end: Date }): AnalyticsReport | null {
    if (!this.config.enableAnalytics) {
      return null;
    }

    return this.analyticsService.generateAnalyticsReport(timeRange);
  }

  /**
   * Search conversations
   */
  async searchConversations(query: SearchQuery): Promise<SearchResults> {
    if (!this.config.enableSearchIndexing) {
      throw new Error('Search indexing is disabled');
    }

    const results = await this.searchService.searchConversations(query);
    
    // Track search usage
    if (this.config.enableAnalytics) {
      this.analyticsService.trackFeatureUsage('search', 'conversation_search', {
        queryText: query.text?.substring(0, 50),
        resultsCount: results.totalMatches
      });
    }

    return results;
  }

  /**
   * Filter conversations
   */
  filterConversations(filter: ConversationFilter) {
    if (!this.config.enableSearchIndexing) {
      throw new Error('Search indexing is disabled');
    }

    return this.searchService.filterConversations(filter);
  }

  /**
   * Get conversation metadata
   */
  getConversationMetadata(sessionId: string): ConversationMetadata | null {
    return this.conversationMetadata.get(sessionId) || null;
  }

  /**
   * Get all conversation metadata
   */
  getAllConversationMetadata(): ConversationMetadata[] {
    return Array.from(this.conversationMetadata.values())
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  /**
   * Get usage statistics
   */
  getUsageStatistics(timeRange?: { start: Date; end: Date }): UsageStatistics | null {
    if (!this.config.enableAnalytics) {
      return null;
    }

    return this.analyticsService.getUsageStatistics(timeRange);
  }

  /**
   * Get debug session info
   */
  getDebugSession(sessionId: string): DebugSession | null {
    if (!this.config.enableDebugTracking) {
      return null;
    }

    return this.debugService.getDebugSession(sessionId);
  }

  /**
   * Clear conversation data
   */
  clearConversationData(sessionId: string): void {
    // Clear debug data
    if (this.config.enableDebugTracking) {
      this.debugService.clearDebugData(sessionId);
    }

    // Remove from search index
    if (this.config.enableSearchIndexing) {
      this.searchService.unregisterConversation(sessionId);
    }

    // Remove from local storage
    this.conversations.delete(sessionId);
    this.conversationMetadata.delete(sessionId);
    this.activeConversations.delete(sessionId);

    this.logger.info('Conversation data cleared', { sessionId });
  }

  /**
   * Clear all data
   */
  clearAllData(): void {
    // Clear analytics
    if (this.config.enableAnalytics) {
      this.analyticsService.clearAnalyticsData();
    }

    // Clear debug data for all sessions
    if (this.config.enableDebugTracking) {
      for (const sessionId of this.activeConversations) {
        this.debugService.clearDebugData(sessionId);
      }
    }

    // Clear search index
    if (this.config.enableSearchIndexing) {
      for (const sessionId of this.activeConversations) {
        this.searchService.unregisterConversation(sessionId);
      }
    }

    // Clear local data
    this.conversations.clear();
    this.conversationMetadata.clear();
    this.activeConversations.clear();

    this.logger.info('All conversation data cleared');
  }

  /**
   * Export all conversations
   */
  async exportAllConversations(
    options: ExportOptions, 
    outputDir?: string
  ): Promise<ExportResult[]> {
    const conversations = Array.from(this.conversations.entries()).map(([id, contextManager]) => ({
      contextManager,
      id,
      title: this.conversationMetadata.get(id)?.title
    }));

    const results = await this.exportService.exportMultipleConversations(
      conversations,
      options,
      outputDir
    );

    // Track bulk export
    if (this.config.enableAnalytics) {
      this.analyticsService.trackFeatureUsage('bulk_export', 'export_all_conversations', {
        conversationCount: conversations.length,
        format: options.format
      });
    }

    return results;
  }

  /**
   * Update configuration
   */
  updateConfiguration(newConfig: Partial<ConversationManagementConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Handle configuration changes
    if (!newConfig.enableDebugTracking && oldConfig.enableDebugTracking) {
      // Disable debug tracking for all active sessions
      for (const sessionId of this.activeConversations) {
        this.debugService.endDebugSession(sessionId);
      }
    }

    if (!newConfig.enableSearchIndexing && oldConfig.enableSearchIndexing) {
      // Remove all conversations from search index
      for (const sessionId of this.activeConversations) {
        this.searchService.unregisterConversation(sessionId);
      }
    }

    this.logger.info('Configuration updated', { newConfig });
  }

  /**
   * Get service status
   */
  getServiceStatus() {
    return {
      activeConversations: this.activeConversations.size,
      totalConversations: this.conversations.size,
      debugTrackingEnabled: this.config.enableDebugTracking,
      analyticsEnabled: this.config.enableAnalytics,
      searchIndexingEnabled: this.config.enableSearchIndexing,
      autoExportEnabled: this.config.autoExportEnabled,
      memoryUsage: {
        conversations: this.conversations.size,
        maxAllowed: this.config.maxConversationsInMemory
      }
    };
  }

  /**
   * Private helper methods
   */
  private updateLastActivity(sessionId: string): void {
    const metadata = this.conversationMetadata.get(sessionId);
    if (metadata) {
      metadata.lastActivity = new Date();
      
      // Update message/tool counts if conversation exists
      const contextManager = this.conversations.get(sessionId);
      if (contextManager) {
        metadata.messageCount = contextManager.messages.length;
        metadata.toolExecutionCount = contextManager.toolResults.length;
      }
    }
  }

  private async autoExportConversation(sessionId: string): Promise<void> {
    try {
      const options: ExportOptions = {
        format: this.config.autoExportFormat,
        includeToolExecutions: true,
        includeMetadata: true,
        includeSystemPrompts: false,
        includeStatistics: true,
        prettyPrint: true
      };

      await this.exportConversation(sessionId, options);
      this.logger.info('Auto-export completed', { sessionId });
    } catch (error) {
      this.logger.error('Auto-export failed', { sessionId, error });
    }
  }

  private manageMemoryUsage(): void {
    if (this.conversations.size <= this.config.maxConversationsInMemory) {
      return;
    }

    // Find oldest inactive conversations to remove
    const inactiveConversations = Array.from(this.conversationMetadata.entries())
      .filter(([id]) => !this.activeConversations.has(id))
      .sort(([, a], [, b]) => a.lastActivity.getTime() - b.lastActivity.getTime());

    const toRemove = this.conversations.size - this.config.maxConversationsInMemory;
    
    for (let i = 0; i < Math.min(toRemove, inactiveConversations.length); i++) {
      const [sessionId] = inactiveConversations[i];
      this.clearConversationData(sessionId);
    }

    this.logger.info('Memory management completed', { 
      removed: Math.min(toRemove, inactiveConversations.length),
      remaining: this.conversations.size 
    });
  }
}