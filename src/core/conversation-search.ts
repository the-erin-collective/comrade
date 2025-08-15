/**
 * Conversation Search and Filter Service
 * 
 * Provides comprehensive search and filtering capabilities for conversations
 * including full-text search, metadata filtering, and advanced query support.
 */

import { Logger } from './logger';
import { AIMessage, ToolCall, AIToolResult } from './ai-agent';
import { ConversationContextManager, SerializableConversationContext } from './conversation-context';

// Create logger instance
const logger = new Logger({ prefix: 'ConversationSearch' });

/**
 * Search query structure
 */
export interface SearchQuery {
  /** Text to search for */
  text?: string;
  /** Search in specific message roles */
  roles?: ('user' | 'assistant' | 'system' | 'tool')[];
  /** Date range filter */
  dateRange?: {
    start: Date;
    end: Date;
  };
  /** Tool name filter */
  tools?: string[];
  /** Model filter */
  models?: string[];
  /** Message length filter */
  messageLength?: {
    min?: number;
    max?: number;
  };
  /** Token count filter */
  tokenCount?: {
    min?: number;
    max?: number;
  };
  /** Search only successful tool executions */
  successfulToolsOnly?: boolean;
  /** Search only failed tool executions */
  failedToolsOnly?: boolean;
  /** Case sensitive search */
  caseSensitive?: boolean;
  /** Use regular expressions */
  useRegex?: boolean;
  /** Search in tool parameters */
  searchToolParameters?: boolean;
  /** Search in tool results */
  searchToolResults?: boolean;
  /** Limit number of results */
  limit?: number;
  /** Sort order */
  sortBy?: 'timestamp' | 'relevance' | 'length';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Search result structure
 */
export interface SearchResult {
  /** Unique result ID */
  id: string;
  /** Conversation/session ID */
  conversationId: string;
  /** Message that matched */
  message: AIMessage;
  /** Match details */
  matches: SearchMatch[];
  /** Relevance score (0-1) */
  relevanceScore: number;
  /** Context around the match */
  context: {
    previousMessage?: AIMessage;
    nextMessage?: AIMessage;
  };
}

/**
 * Individual search match
 */
export interface SearchMatch {
  /** Type of match */
  type: 'content' | 'tool_name' | 'tool_parameter' | 'tool_result';
  /** Matched text */
  text: string;
  /** Position in the text */
  position: {
    start: number;
    end: number;
  };
  /** Highlighted text with match markers */
  highlighted: string;
}

/**
 * Filter criteria for conversations
 */
export interface ConversationFilter {
  /** Filter by conversation title */
  title?: string;
  /** Filter by date range */
  dateRange?: {
    start: Date;
    end: Date;
  };
  /** Filter by message count */
  messageCount?: {
    min?: number;
    max?: number;
  };
  /** Filter by tool execution count */
  toolExecutionCount?: {
    min?: number;
    max?: number;
  };
  /** Filter by conversation duration */
  duration?: {
    min?: number; // in milliseconds
    max?: number;
  };
  /** Filter by models used */
  modelsUsed?: string[];
  /** Filter by tools used */
  toolsUsed?: string[];
  /** Filter by error presence */
  hasErrors?: boolean;
  /** Filter by completion status */
  isCompleted?: boolean;
}

/**
 * Conversation summary for filtering
 */
export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  toolExecutionCount: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  modelsUsed: string[];
  toolsUsed: string[];
  hasErrors: boolean;
  isCompleted: boolean;
  tokenCount: number;
  lastActivity: Date;
}

/**
 * Search and filter results
 */
export interface SearchResults {
  /** Search results */
  results: SearchResult[];
  /** Total number of matches found */
  totalMatches: number;
  /** Search query used */
  query: SearchQuery;
  /** Search execution time */
  executionTime: number;
  /** Search statistics */
  statistics: {
    conversationsSearched: number;
    messagesSearched: number;
    toolExecutionsSearched: number;
  };
}

/**
 * Conversation Search Service
 */
export class ConversationSearchService {
  private logger: Logger;
  private conversations: Map<string, ConversationContextManager> = new Map();
  private conversationSummaries: Map<string, ConversationSummary> = new Map();

  constructor() {
    this.logger = logger.child({ prefix: 'Service' });
  }

  /**
   * Register a conversation for searching
   */
  registerConversation(id: string, contextManager: ConversationContextManager, title?: string): void {
    this.conversations.set(id, contextManager);
    
    // Generate summary
    const summary = this.generateConversationSummary(id, contextManager, title);
    this.conversationSummaries.set(id, summary);
    
    this.logger.debug('Conversation registered for search', { id, messageCount: contextManager.messages.length });
  }

  /**
   * Unregister a conversation
   */
  unregisterConversation(id: string): void {
    this.conversations.delete(id);
    this.conversationSummaries.delete(id);
    this.logger.debug('Conversation unregistered from search', { id });
  }

  /**
   * Search across all registered conversations
   */
  async searchConversations(query: SearchQuery): Promise<SearchResults> {
    const startTime = Date.now();
    const results: SearchResult[] = [];
    let totalMatches = 0;
    let conversationsSearched = 0;
    let messagesSearched = 0;
    let toolExecutionsSearched = 0;

    this.logger.info('Starting conversation search', { query });

    for (const [conversationId, contextManager] of this.conversations) {
      conversationsSearched++;
      
      // Apply conversation-level filters first
      if (!this.matchesConversationFilters(conversationId, query)) {
        continue;
      }

      // Search within this conversation
      const conversationResults = await this.searchSingleConversation(
        conversationId, 
        contextManager, 
        query
      );

      results.push(...conversationResults);
      totalMatches += conversationResults.length;
      messagesSearched += contextManager.messages.length;
      toolExecutionsSearched += contextManager.toolResults.length;
    }

    // Sort results
    this.sortResults(results, query.sortBy || 'relevance', query.sortOrder || 'desc');

    // Apply limit
    const limitedResults = query.limit ? results.slice(0, query.limit) : results;

    const executionTime = Date.now() - startTime;

    this.logger.info('Conversation search completed', {
      totalMatches,
      executionTime,
      conversationsSearched
    });

    return {
      results: limitedResults,
      totalMatches,
      query,
      executionTime,
      statistics: {
        conversationsSearched,
        messagesSearched,
        toolExecutionsSearched
      }
    };
  }

  /**
   * Search within a single conversation
   */
  async searchSingleConversation(
    conversationId: string,
    contextManager: ConversationContextManager,
    query: SearchQuery
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const messages = contextManager.messages;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      // Apply message-level filters
      if (!this.matchesMessageFilters(message, query)) {
        continue;
      }

      // Search for matches in this message
      const matches = this.findMatches(message, query);
      
      if (matches.length > 0) {
        const relevanceScore = this.calculateRelevanceScore(message, matches, query);
        
        results.push({
          id: `${conversationId}-${i}`,
          conversationId,
          message,
          matches,
          relevanceScore,
          context: {
            previousMessage: i > 0 ? messages[i - 1] : undefined,
            nextMessage: i < messages.length - 1 ? messages[i + 1] : undefined
          }
        });
      }
    }

    return results;
  }

  /**
   * Filter conversations by criteria
   */
  filterConversations(filter: ConversationFilter): ConversationSummary[] {
    const results: ConversationSummary[] = [];

    for (const [id, summary] of this.conversationSummaries) {
      if (this.matchesConversationFilter(summary, filter)) {
        results.push(summary);
      }
    }

    return results.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  /**
   * Get conversation summary
   */
  getConversationSummary(id: string): ConversationSummary | null {
    return this.conversationSummaries.get(id) || null;
  }

  /**
   * Get all conversation summaries
   */
  getAllConversationSummaries(): ConversationSummary[] {
    return Array.from(this.conversationSummaries.values())
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  /**
   * Search for similar conversations
   */
  findSimilarConversations(conversationId: string, limit: number = 5): ConversationSummary[] {
    const targetSummary = this.conversationSummaries.get(conversationId);
    if (!targetSummary) {
      return [];
    }

    const similarities: Array<{ summary: ConversationSummary; score: number }> = [];

    for (const [id, summary] of this.conversationSummaries) {
      if (id === conversationId) continue;

      const score = this.calculateSimilarityScore(targetSummary, summary);
      similarities.push({ summary, score });
    }

    return similarities
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.summary);
  }

  /**
   * Get search suggestions based on query
   */
  getSearchSuggestions(partialQuery: string): string[] {
    const suggestions: Set<string> = new Set();
    const lowerQuery = partialQuery.toLowerCase();

    // Collect suggestions from message content
    for (const contextManager of this.conversations.values()) {
      for (const message of contextManager.messages) {
        const words = message.content.toLowerCase().split(/\s+/);
        for (const word of words) {
          if (word.length > 3 && word.startsWith(lowerQuery)) {
            suggestions.add(word);
          }
        }
      }
    }

    // Collect suggestions from tool names
    for (const contextManager of this.conversations.values()) {
      for (const result of contextManager.toolResults) {
        const toolName = result.metadata.toolName.toLowerCase();
        if (toolName.includes(lowerQuery)) {
          suggestions.add(result.metadata.toolName);
        }
      }
    }

    return Array.from(suggestions).slice(0, 10);
  }

  /**
   * Export search results
   */
  exportSearchResults(results: SearchResults, format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify({
        ...results,
        exportedAt: new Date()
      }, null, 2);
    } else {
      // CSV format
      const headers = [
        'conversationId', 'messageRole', 'messageContent', 'matchType', 
        'matchText', 'relevanceScore', 'timestamp'
      ];
      
      const rows = results.results.flatMap(result => 
        result.matches.map(match => [
          result.conversationId,
          result.message.role,
          `"${result.message.content.replace(/"/g, '""').substring(0, 100)}..."`,
          match.type,
          `"${match.text.replace(/"/g, '""')}"`,
          result.relevanceScore.toFixed(3),
          result.message.timestamp.toISOString()
        ])
      );

      return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }
  }

  /**
   * Private helper methods
   */
  private generateConversationSummary(
    id: string, 
    contextManager: ConversationContextManager, 
    title?: string
  ): ConversationSummary {
    const stats = contextManager.getStats();
    const messages = contextManager.messages;
    
    // Extract models used
    const modelsUsed = new Set<string>();
    messages.forEach(msg => {
      if ((msg as any).model) {
        modelsUsed.add((msg as any).model);
      }
    });

    // Extract tools used
    const toolsUsed = new Set<string>();
    contextManager.toolResults.forEach(result => {
      toolsUsed.add(result.metadata.toolName);
    });

    // Check for errors
    const hasErrors = contextManager.toolResults.some(result => !result.success) ||
                     messages.some(msg => (msg as any).error);

    // Calculate duration
    const timestamps = messages.map(m => m.timestamp.getTime());
    const startTime = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : new Date();
    const endTime = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;
    const duration = endTime ? endTime.getTime() - startTime.getTime() : undefined;

    return {
      id,
      title: title || `Conversation ${id}`,
      messageCount: messages.length,
      toolExecutionCount: contextManager.toolResults.length,
      startTime,
      endTime,
      duration,
      modelsUsed: Array.from(modelsUsed),
      toolsUsed: Array.from(toolsUsed),
      hasErrors,
      isCompleted: endTime !== undefined,
      tokenCount: stats.tokenCount,
      lastActivity: stats.lastUpdated
    };
  }

  private matchesConversationFilters(conversationId: string, query: SearchQuery): boolean {
    const summary = this.conversationSummaries.get(conversationId);
    if (!summary) return false;

    // Date range filter
    if (query.dateRange) {
      if (summary.startTime < query.dateRange.start || 
          summary.startTime > query.dateRange.end) {
        return false;
      }
    }

    // Models filter
    if (query.models && query.models.length > 0) {
      if (!query.models.some(model => summary.modelsUsed.includes(model))) {
        return false;
      }
    }

    // Tools filter
    if (query.tools && query.tools.length > 0) {
      if (!query.tools.some(tool => summary.toolsUsed.includes(tool))) {
        return false;
      }
    }

    return true;
  }

  private matchesMessageFilters(message: AIMessage, query: SearchQuery): boolean {
    // Role filter
    if (query.roles && query.roles.length > 0) {
      if (!query.roles.includes(message.role)) {
        return false;
      }
    }

    // Message length filter
    if (query.messageLength) {
      const length = message.content.length;
      if (query.messageLength.min && length < query.messageLength.min) {
        return false;
      }
      if (query.messageLength.max && length > query.messageLength.max) {
        return false;
      }
    }

    // Token count filter (estimated)
    if (query.tokenCount) {
      const tokenCount = this.estimateTokens(message.content);
      if (query.tokenCount.min && tokenCount < query.tokenCount.min) {
        return false;
      }
      if (query.tokenCount.max && tokenCount > query.tokenCount.max) {
        return false;
      }
    }

    return true;
  }

  private matchesConversationFilter(summary: ConversationSummary, filter: ConversationFilter): boolean {
    // Title filter
    if (filter.title) {
      const titleMatch = filter.title.toLowerCase();
      if (!summary.title.toLowerCase().includes(titleMatch)) {
        return false;
      }
    }

    // Date range filter
    if (filter.dateRange) {
      if (summary.startTime < filter.dateRange.start || 
          summary.startTime > filter.dateRange.end) {
        return false;
      }
    }

    // Message count filter
    if (filter.messageCount) {
      if (filter.messageCount.min && summary.messageCount < filter.messageCount.min) {
        return false;
      }
      if (filter.messageCount.max && summary.messageCount > filter.messageCount.max) {
        return false;
      }
    }

    // Tool execution count filter
    if (filter.toolExecutionCount) {
      if (filter.toolExecutionCount.min && summary.toolExecutionCount < filter.toolExecutionCount.min) {
        return false;
      }
      if (filter.toolExecutionCount.max && summary.toolExecutionCount > filter.toolExecutionCount.max) {
        return false;
      }
    }

    // Duration filter
    if (filter.duration && summary.duration) {
      if (filter.duration.min && summary.duration < filter.duration.min) {
        return false;
      }
      if (filter.duration.max && summary.duration > filter.duration.max) {
        return false;
      }
    }

    // Models used filter
    if (filter.modelsUsed && filter.modelsUsed.length > 0) {
      if (!filter.modelsUsed.some(model => summary.modelsUsed.includes(model))) {
        return false;
      }
    }

    // Tools used filter
    if (filter.toolsUsed && filter.toolsUsed.length > 0) {
      if (!filter.toolsUsed.some(tool => summary.toolsUsed.includes(tool))) {
        return false;
      }
    }

    // Has errors filter
    if (filter.hasErrors !== undefined) {
      if (summary.hasErrors !== filter.hasErrors) {
        return false;
      }
    }

    // Is completed filter
    if (filter.isCompleted !== undefined) {
      if (summary.isCompleted !== filter.isCompleted) {
        return false;
      }
    }

    return true;
  }

  private findMatches(message: AIMessage, query: SearchQuery): SearchMatch[] {
    const matches: SearchMatch[] = [];

    if (!query.text) {
      return matches;
    }

    const searchText = query.caseSensitive ? query.text : query.text.toLowerCase();
    const messageContent = query.caseSensitive ? message.content : message.content.toLowerCase();

    // Search in message content
    if (query.useRegex) {
      try {
        const regex = new RegExp(searchText, query.caseSensitive ? 'g' : 'gi');
        let match;
        while ((match = regex.exec(messageContent)) !== null) {
          matches.push({
            type: 'content',
            text: message.content.substring(match.index, match.index + match[0].length),
            position: {
              start: match.index,
              end: match.index + match[0].length
            },
            highlighted: this.highlightMatch(message.content, match.index, match[0].length)
          });
        }
      } catch (error) {
        // Invalid regex, fall back to simple search
        this.findSimpleMatches(message.content, searchText, 'content', matches);
      }
    } else {
      this.findSimpleMatches(messageContent, searchText, 'content', matches, message.content);
    }

    // Search in tool calls
    if (query.searchToolParameters && message.toolCalls) {
      for (const toolCall of message.toolCalls) {
        // Search tool name
        const toolName = query.caseSensitive ? toolCall.name : toolCall.name.toLowerCase();
        if (toolName.includes(searchText)) {
          matches.push({
            type: 'tool_name',
            text: toolCall.name,
            position: { start: 0, end: toolCall.name.length },
            highlighted: this.highlightText(toolCall.name, query.text, query.caseSensitive || false)
          });
        }

        // Search tool parameters
        const paramString = JSON.stringify(toolCall.parameters);
        const searchableParams = query.caseSensitive ? paramString : paramString.toLowerCase();
        if (searchableParams.includes(searchText)) {
          matches.push({
            type: 'tool_parameter',
            text: paramString,
            position: { start: 0, end: paramString.length },
            highlighted: this.highlightText(paramString, query.text, query.caseSensitive || false)
          });
        }
      }
    }

    // Search in tool results
    if (query.searchToolResults && message.toolResults) {
      for (const result of message.toolResults) {
        const resultText = result.output || result.error || '';
        const searchableResult = query.caseSensitive ? resultText : resultText.toLowerCase();
        if (searchableResult.includes(searchText)) {
          matches.push({
            type: 'tool_result',
            text: resultText,
            position: { start: 0, end: resultText.length },
            highlighted: this.highlightText(resultText, query.text, query.caseSensitive || false)
          });
        }
      }
    }

    return matches;
  }

  private findSimpleMatches(
    text: string, 
    searchText: string, 
    type: SearchMatch['type'], 
    matches: SearchMatch[],
    originalText?: string
  ): void {
    let index = 0;
    const sourceText = originalText || text;
    
    while ((index = text.indexOf(searchText, index)) !== -1) {
      matches.push({
        type,
        text: sourceText.substring(index, index + searchText.length),
        position: {
          start: index,
          end: index + searchText.length
        },
        highlighted: this.highlightMatch(sourceText, index, searchText.length)
      });
      index += searchText.length;
    }
  }

  private highlightMatch(text: string, start: number, length: number): string {
    const before = text.substring(Math.max(0, start - 50), start);
    const match = text.substring(start, start + length);
    const after = text.substring(start + length, Math.min(text.length, start + length + 50));
    
    return `${before}<mark>${match}</mark>${after}`;
  }

  private highlightText(text: string, searchText: string, caseSensitive: boolean): string {
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(this.escapeRegex(searchText), flags);
    return text.replace(regex, '<mark>$&</mark>');
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private calculateRelevanceScore(message: AIMessage, matches: SearchMatch[], query: SearchQuery): number {
    let score = 0;

    // Base score for having matches
    score += matches.length * 0.1;

    // Bonus for content matches
    const contentMatches = matches.filter(m => m.type === 'content').length;
    score += contentMatches * 0.3;

    // Bonus for tool matches if searching tools
    if (query.searchToolParameters || query.searchToolResults) {
      const toolMatches = matches.filter(m => m.type.startsWith('tool_')).length;
      score += toolMatches * 0.2;
    }

    // Bonus for exact matches
    if (query.text) {
      const exactMatches = matches.filter(m => 
        m.text.toLowerCase() === query.text!.toLowerCase()
      ).length;
      score += exactMatches * 0.4;
    }

    // Penalty for very long messages (less focused)
    if (message.content.length > 1000) {
      score *= 0.8;
    }

    // Bonus for recent messages
    const daysSinceMessage = (Date.now() - message.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceMessage < 7) {
      score *= 1.2;
    }

    return Math.min(1, score); // Cap at 1.0
  }

  private calculateSimilarityScore(target: ConversationSummary, candidate: ConversationSummary): number {
    let score = 0;

    // Similar message count
    const messageDiff = Math.abs(target.messageCount - candidate.messageCount);
    const maxMessages = Math.max(target.messageCount, candidate.messageCount);
    score += (1 - messageDiff / maxMessages) * 0.2;

    // Similar tool usage
    const commonTools = target.toolsUsed.filter(tool => candidate.toolsUsed.includes(tool));
    const totalTools = new Set([...target.toolsUsed, ...candidate.toolsUsed]).size;
    if (totalTools > 0) {
      score += (commonTools.length / totalTools) * 0.3;
    }

    // Similar models
    const commonModels = target.modelsUsed.filter(model => candidate.modelsUsed.includes(model));
    const totalModels = new Set([...target.modelsUsed, ...candidate.modelsUsed]).size;
    if (totalModels > 0) {
      score += (commonModels.length / totalModels) * 0.2;
    }

    // Similar duration
    if (target.duration && candidate.duration) {
      const durationDiff = Math.abs(target.duration - candidate.duration);
      const maxDuration = Math.max(target.duration, candidate.duration);
      score += (1 - durationDiff / maxDuration) * 0.1;
    }

    // Similar error status
    if (target.hasErrors === candidate.hasErrors) {
      score += 0.1;
    }

    // Time proximity
    const timeDiff = Math.abs(target.startTime.getTime() - candidate.startTime.getTime());
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
    if (daysDiff < 7) {
      score += 0.1;
    }

    return score;
  }

  private sortResults(results: SearchResult[], sortBy: string, sortOrder: string): void {
    results.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'timestamp':
          comparison = a.message.timestamp.getTime() - b.message.timestamp.getTime();
          break;
        case 'relevance':
          comparison = a.relevanceScore - b.relevanceScore;
          break;
        case 'length':
          comparison = a.message.content.length - b.message.content.length;
          break;
        default:
          comparison = a.relevanceScore - b.relevanceScore;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }

  private estimateTokens(text: string): number {
    // Simple token estimation (approximately 4 characters per token)
    return Math.ceil(text.length / 4);
  }
}