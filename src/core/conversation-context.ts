/**
 * Conversation Context Manager
 * 
 * This module provides comprehensive conversation context management including
 * message history, context truncation strategies, system prompt integration,
 * and session persistence capabilities.
 */

import { Logger } from './logger';
import { AIMessage, AIToolResult, ConversationContext } from './ai-agent';

// Create logger instance for conversation context operations
const logger = new Logger({ prefix: 'ConversationContext' });

/**
 * Truncation strategy for managing context size
 */
export type TruncationStrategy = 'recent' | 'sliding_window' | 'summarize' | 'priority_based';

/**
 * Configuration for conversation context management
 */
export interface ConversationContextConfig {
  /** Maximum number of tokens allowed in the context */
  maxTokens: number;
  /** Strategy to use when truncating context */
  truncationStrategy: TruncationStrategy;
  /** System prompt for the conversation */
  systemPrompt: string;
  /** Whether to preserve tool results across truncations */
  preserveToolResults: boolean;
  /** Minimum number of recent messages to always keep */
  minRecentMessages: number;
  /** Buffer percentage to leave when truncating (0.1 = 10% buffer) */
  truncationBuffer: number;
}

/**
 * Serializable representation of conversation context
 */
export interface SerializableConversationContext {
  messages: AIMessage[];
  toolResults: AIToolResult[];
  systemPrompt: string;
  maxTokens: number;
  config: ConversationContextConfig;
  metadata: {
    createdAt: Date;
    lastUpdated: Date;
    messageCount: number;
    tokenCount: number;
  };
}

/**
 * Enhanced conversation context manager with advanced features
 */
export class ConversationContextManager implements ConversationContext {
  public messages: AIMessage[] = [];
  public toolResults: AIToolResult[] = [];
  public systemPrompt: string;
  public maxTokens: number;
  
  private config: ConversationContextConfig;
  private createdAt: Date;
  private lastUpdated: Date;
  private logger: Logger;

  constructor(config?: Partial<ConversationContextConfig>) {
    this.logger = logger.child({ prefix: 'Manager' });
    this.createdAt = new Date();
    this.lastUpdated = new Date();
    
    // Set default configuration
    this.config = {
      maxTokens: 4000,
      truncationStrategy: 'recent',
      systemPrompt: 'You are a helpful AI coding assistant.',
      preserveToolResults: true,
      minRecentMessages: 2,
      truncationBuffer: 0.2,
      ...config
    };
    
    this.systemPrompt = this.config.systemPrompt;
    this.maxTokens = this.config.maxTokens;
    
    this.logger.debug('Conversation context manager created', {
      maxTokens: this.maxTokens,
      strategy: this.config.truncationStrategy
    });
  }

  /**
   * Add a message to the conversation
   */
  addMessage(message: AIMessage): void {
    this.messages.push(message);
    this.lastUpdated = new Date();
    
    this.logger.debug('Message added to context', {
      role: message.role,
      contentLength: message.content.length,
      totalMessages: this.messages.length
    });
    
    // Auto-truncate if needed
    this.truncateIfNeeded();
  }

  /**
   * Add a tool result to the context
   */
  addToolResult(result: AIToolResult): void {
    this.toolResults.push(result);
    this.lastUpdated = new Date();
    
    this.logger.debug('Tool result added to context', {
      toolName: result.metadata.toolName,
      success: result.success,
      totalResults: this.toolResults.length
    });
  }

  /**
   * Get estimated token count for the current context
   */
  getTokenCount(): number {
    let tokenCount = this.estimateTokens(this.systemPrompt);
    
    // Count message tokens
    for (const message of this.messages) {
      tokenCount += this.estimateTokens(message.content);
      
      // Add tokens for tool calls if present
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          tokenCount += this.estimateTokens(JSON.stringify(toolCall));
        }
      }
    }
    
    // Count tool result tokens
    for (const result of this.toolResults) {
      if (result.output) {
        tokenCount += this.estimateTokens(result.output);
      }
      if (result.error) {
        tokenCount += this.estimateTokens(result.error);
      }
    }
    
    return tokenCount;
  }

  /**
   * Truncate context if it exceeds token limits
   */
  truncateIfNeeded(): void {
    const currentTokens = this.getTokenCount();
    const targetTokens = this.maxTokens * (1 - this.config.truncationBuffer);
    
    if (currentTokens <= targetTokens) {
      return;
    }

    this.logger.info('Truncating conversation context', {
      currentTokens,
      targetTokens,
      strategy: this.config.truncationStrategy,
      messageCount: this.messages.length
    });

    switch (this.config.truncationStrategy) {
      case 'recent':
        this.truncateKeepRecent(targetTokens);
        break;
      case 'sliding_window':
        this.truncateSlidingWindow(targetTokens);
        break;
      case 'priority_based':
        this.truncatePriorityBased(targetTokens);
        break;
      case 'summarize':
        // For now, fall back to recent strategy
        // TODO: Implement summarization in future iterations
        this.truncateKeepRecent(targetTokens);
        break;
      default:
        this.truncateKeepRecent(targetTokens);
    }

    this.logger.info('Context truncation completed', {
      newMessageCount: this.messages.length,
      newTokenCount: this.getTokenCount()
    });
  }

  /**
   * Update system prompt
   */
  updateSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
    this.config.systemPrompt = prompt;
    this.lastUpdated = new Date();
    
    this.logger.debug('System prompt updated', {
      promptLength: prompt.length
    });
    
    // Check if truncation is needed after prompt change
    this.truncateIfNeeded();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConversationContextConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };
    
    // Update derived properties
    if (config.maxTokens !== undefined) {
      this.maxTokens = config.maxTokens;
    }
    if (config.systemPrompt !== undefined) {
      this.systemPrompt = config.systemPrompt;
    }
    
    this.lastUpdated = new Date();
    
    this.logger.debug('Configuration updated', {
      oldMaxTokens: oldConfig.maxTokens,
      newMaxTokens: this.config.maxTokens,
      oldStrategy: oldConfig.truncationStrategy,
      newStrategy: this.config.truncationStrategy
    });
    
    // Re-truncate if max tokens changed
    if (config.maxTokens !== undefined && config.maxTokens !== oldConfig.maxTokens) {
      this.truncateIfNeeded();
    }
  }

  /**
   * Clear all messages and tool results
   */
  clear(): void {
    const messageCount = this.messages.length;
    const toolResultCount = this.toolResults.length;
    
    this.messages = [];
    this.toolResults = [];
    this.lastUpdated = new Date();
    
    this.logger.debug('Context cleared', {
      clearedMessages: messageCount,
      clearedToolResults: toolResultCount
    });
  }

  /**
   * Get context statistics
   */
  getStats(): {
    messageCount: number;
    toolResultCount: number;
    tokenCount: number;
    createdAt: Date;
    lastUpdated: Date;
    config: ConversationContextConfig;
  } {
    return {
      messageCount: this.messages.length,
      toolResultCount: this.toolResults.length,
      tokenCount: this.getTokenCount(),
      createdAt: this.createdAt,
      lastUpdated: this.lastUpdated,
      config: { ...this.config }
    };
  }

  /**
   * Serialize context for persistence
   */
  serialize(): SerializableConversationContext {
    return {
      messages: [...this.messages],
      toolResults: [...this.toolResults],
      systemPrompt: this.systemPrompt,
      maxTokens: this.maxTokens,
      config: { ...this.config },
      metadata: {
        createdAt: this.createdAt,
        lastUpdated: this.lastUpdated,
        messageCount: this.messages.length,
        tokenCount: this.getTokenCount()
      }
    };
  }

  /**
   * Deserialize context from persistence
   */
  static deserialize(data: SerializableConversationContext): ConversationContextManager {
    const context = new ConversationContextManager(data.config);
    
    context.messages = data.messages;
    context.toolResults = data.toolResults;
    context.systemPrompt = data.systemPrompt;
    context.maxTokens = data.maxTokens;
    context.createdAt = new Date(data.metadata.createdAt);
    context.lastUpdated = new Date(data.metadata.lastUpdated);
    
    logger.debug('Context deserialized', {
      messageCount: data.metadata.messageCount,
      tokenCount: data.metadata.tokenCount
    });
    
    return context;
  }

  /**
   * Create a copy of the current context
   */
  clone(): ConversationContextManager {
    const serialized = this.serialize();
    return ConversationContextManager.deserialize(serialized);
  }

  /**
   * Truncate keeping only recent messages
   */
  private truncateKeepRecent(targetTokens: number): void {
    // Always preserve system messages
    const systemMessages = this.messages.filter(m => m.role === 'system');
    const otherMessages = this.messages.filter(m => m.role !== 'system');
    
    // Start with system prompt tokens
    let tokenCount = this.estimateTokens(this.systemPrompt);
    
    // Add tool results if configured to preserve them
    if (this.config.preserveToolResults) {
      for (const result of this.toolResults) {
        if (result.output) {tokenCount += this.estimateTokens(result.output);}
        if (result.error) {tokenCount += this.estimateTokens(result.error);}
      }
    } else {
      this.toolResults = [];
    }
    
    // Keep recent messages that fit within token limit
    const recentMessages: AIMessage[] = [];
    
    // Add messages from most recent backwards, checking token limits
    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const message = otherMessages[i];
      const messageTokens = this.estimateTokens(message.content);
      
      // Check if adding this message would exceed the limit
      if (tokenCount + messageTokens > targetTokens) {
        // If we haven't kept minimum messages yet, keep this one anyway
        if (recentMessages.length < this.config.minRecentMessages) {
          recentMessages.unshift(message);
          tokenCount += messageTokens;
        } else {
          break;
        }
      } else {
        recentMessages.unshift(message);
        tokenCount += messageTokens;
      }
    }
    
    this.messages = [...systemMessages, ...recentMessages];
    
    // If still over limit, be more aggressive
    if (this.getTokenCount() > targetTokens && recentMessages.length > 0) {
      // Remove messages one by one until we're under the limit
      while (this.getTokenCount() > targetTokens && this.messages.filter(m => m.role !== 'system').length > 0) {
        // Find the oldest non-system message and remove it
        const nonSystemIndex = this.messages.findIndex(m => m.role !== 'system');
        if (nonSystemIndex !== -1) {
          this.messages.splice(nonSystemIndex, 1);
        } else {
          break;
        }
      }
    }
  }

  /**
   * Truncate using sliding window approach
   */
  private truncateSlidingWindow(targetTokens: number): void {
    const windowSize = Math.floor(this.messages.length * 0.6); // Keep 60% of messages
    const startIndex = Math.max(0, this.messages.length - windowSize);
    
    // Preserve system messages
    const systemMessages = this.messages.filter(m => m.role === 'system');
    const windowMessages = this.messages.slice(startIndex).filter(m => m.role !== 'system');
    
    this.messages = [...systemMessages, ...windowMessages];
    
    // If still too large, fall back to recent strategy
    if (this.getTokenCount() > targetTokens) {
      this.truncateKeepRecent(targetTokens);
    }
  }

  /**
   * Truncate based on message priority
   */
  private truncatePriorityBased(targetTokens: number): void {
    // Priority order: system > tool results > recent user/assistant pairs
    const systemMessages = this.messages.filter(m => m.role === 'system');
    const toolMessages = this.messages.filter(m => m.role === 'tool');
    const conversationMessages = this.messages.filter(m => m.role === 'user' || m.role === 'assistant');
    
    let tokenCount = this.estimateTokens(this.systemPrompt);
    const keptMessages: AIMessage[] = [...systemMessages];
    
    // Add tool results if preserving them
    if (this.config.preserveToolResults) {
      for (const result of this.toolResults) {
        if (result.output) {tokenCount += this.estimateTokens(result.output);}
        if (result.error) {tokenCount += this.estimateTokens(result.error);}
      }
      keptMessages.push(...toolMessages);
    } else {
      this.toolResults = [];
    }
    
    // Add conversation messages from most recent
    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const message = conversationMessages[i];
      const messageTokens = this.estimateTokens(message.content);
      
      if (tokenCount + messageTokens > targetTokens) {
        break;
      }
      
      keptMessages.push(message);
      tokenCount += messageTokens;
    }
    
    // Sort messages by timestamp to maintain chronological order
    this.messages = keptMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Estimate token count for text (approximately 4 characters per token)
   */
  private estimateTokens(text: string): number {
    // More sophisticated estimation considering:
    // - Average 4 chars per token for English
    // - Code tends to have more tokens per character
    // - JSON structure adds overhead
    
    if (!text) {return 0;}
    
    // Basic estimation with slight adjustment for code/JSON content
    let baseTokens = Math.ceil(text.length / 4);
    
    // Add overhead for structured content (JSON, code blocks)
    if (text.includes('{') || text.includes('[') || text.includes('```')) {
      baseTokens = Math.ceil(baseTokens * 1.2); // 20% overhead for structured content
    }
    
    return baseTokens;
  }
}

/**
 * Factory function to create conversation context with default settings
 */
export function createConversationContext(config?: Partial<ConversationContextConfig>): ConversationContextManager {
  return new ConversationContextManager(config);
}

/**
 * Factory function to create conversation context for coding tasks
 */
export function createCodingConversationContext(config?: Partial<ConversationContextConfig>): ConversationContextManager {
  const codingConfig: Partial<ConversationContextConfig> = {
    systemPrompt: `You are an expert AI coding assistant. You help developers with:
- Writing, reviewing, and debugging code
- Explaining complex programming concepts
- Suggesting best practices and optimizations
- Helping with architecture and design decisions
- Providing code examples and documentation

You have access to tools for reading files, executing commands, and modifying code.
Always be precise, helpful, and focus on practical solutions.`,
    maxTokens: 6000, // Larger context for code
    truncationStrategy: 'priority_based',
    preserveToolResults: true,
    minRecentMessages: 4, // Keep more context for coding discussions
    ...config
  };
  
  return new ConversationContextManager(codingConfig);
}