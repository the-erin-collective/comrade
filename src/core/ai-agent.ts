/**
 * Core AI Agent Service Infrastructure
 * 
 * This module provides the foundational interfaces and service class for AI agent functionality,
 * including message processing, tool calling, and conversation context management.
 */

import { Logger } from './logger';
import { ErrorMapper, EnhancedError, ErrorContext } from './error-handler';
import { ToolRegistry } from './tool-registry';
import { ReadFileTool, WriteFileTool, ListDirectoryTool } from './tools/file-operations';

// Create logger instance for AI operations
const logger = new Logger({ prefix: 'AIAgent' });

/**
 * Represents a response from an AI model
 */
export interface AIResponse {
  /** The text content of the AI's response */
  content: string;
  /** Optional tool calls requested by the AI */
  toolCalls?: ToolCall[];
  /** Metadata about the response */
  metadata: ResponseMetadata;
}

/**
 * Metadata associated with an AI response
 */
export interface ResponseMetadata {
  /** The model that generated the response */
  model: string;
  /** Number of tokens used in the request/response */
  tokensUsed: number;
  /** Time taken to process the request in milliseconds */
  processingTime: number;
  /** Optional confidence score for the response */
  confidence?: number;
  /** Timestamp when the response was generated */
  timestamp: Date;
}

/**
 * Represents a tool call request from an AI model
 */
export interface ToolCall {
  /** Unique identifier for the tool call */
  id: string;
  /** Name of the tool to execute */
  name: string;
  /** Parameters to pass to the tool */
  parameters: Record<string, any>;
}

/**
 * Result of an AI tool execution
 */
export interface AIToolResult {
  /** Whether the tool execution was successful */
  success: boolean;
  /** Output from the tool execution (if successful) */
  output?: string;
  /** Error message (if execution failed) */
  error?: string;
  /** Metadata about the tool execution */
  metadata: ToolExecutionMetadata;
}

/**
 * Metadata for tool execution
 */
export interface ToolExecutionMetadata {
  /** Time taken to execute the tool in milliseconds */
  executionTime: number;
  /** Name of the tool that was executed */
  toolName: string;
  /** Parameters that were passed to the tool */
  parameters: Record<string, any>;
  /** Timestamp when the tool was executed */
  timestamp: Date;
  /** Additional metadata specific to the tool (optional) */
  [key: string]: any;
}

/**
 * Represents a message in an AI conversation
 */
export interface AIMessage {
  /** Role of the message sender */
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** Content of the message */
  content: string;
  /** Timestamp when the message was created */
  timestamp: Date;
  /** Optional tool calls associated with the message */
  toolCalls?: ToolCall[];
  /** Optional tool results associated with the message */
  toolResults?: AIToolResult[];
}

/**
 * Manages conversation context and history
 */
export interface ConversationContext {
  /** Array of messages in the conversation */
  messages: AIMessage[];
  /** Results from tool executions */
  toolResults: AIToolResult[];
  /** System prompt for the conversation */
  systemPrompt: string;
  /** Maximum number of tokens allowed in the context */
  maxTokens: number;
  
  /**
   * Truncate the context if it exceeds the token limit
   */
  truncateIfNeeded(): void;
  
  /**
   * Add a message to the conversation
   */
  addMessage(message: AIMessage): void;
  
  /**
   * Add a tool result to the context
   */
  addToolResult(result: AIToolResult): void;
  
  /**
   * Get the current token count estimate
   */
  getTokenCount(): number;
}

/**
 * Configuration for AI model connection
 */
export interface ModelConfig {
  /** Type of model provider */
  provider: 'ollama' | 'openai' | 'anthropic' | 'huggingface' | 'custom';
  /** Model name/identifier */
  model: string;
  /** API endpoint URL */
  endpoint?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Temperature setting for response randomness */
  temperature?: number;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Additional provider-specific options */
  options?: Record<string, any>;
}

/**
 * Core AI Agent Service for managing AI model interactions
 */
export class AIAgentService {
  private logger: Logger;
  private currentModel?: ModelConfig;
  private conversationContexts: Map<string, ConversationContext> = new Map();
  private toolRegistry: ToolRegistry;

  constructor() {
    this.logger = logger.child({ prefix: 'Service' });
    this.toolRegistry = new ToolRegistry();
    
    // Register built-in tools
    this.registerBuiltInTools();
    
    this.logger.info('AI Agent Service initialized', {
      registeredTools: this.toolRegistry.size()
    });
  }

  /**
   * Register built-in tools
   */
  private registerBuiltInTools(): void {
    try {
      this.toolRegistry.registerTool(new ReadFileTool());
      this.toolRegistry.registerTool(new WriteFileTool());
      this.toolRegistry.registerTool(new ListDirectoryTool());
      
      this.logger.info('Built-in tools registered', {
        toolCount: this.toolRegistry.size()
      });
    } catch (error) {
      this.logger.error('Failed to register built-in tools', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Send a message to the AI model and get a response
   * 
   * @param sessionId - Unique identifier for the conversation session
   * @param message - User message to send to the AI
   * @param context - Optional conversation context to use
   * @returns Promise resolving to AI response
   */
  async sendMessage(
    sessionId: string, 
    message: string, 
    context?: ConversationContext
  ): Promise<AIResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing message', { 
        sessionId, 
        messageLength: message.length,
        hasContext: !!context 
      });

      // Validate inputs
      if (!sessionId) {
        throw new Error('Session ID is required');
      }
      
      if (!message.trim()) {
        throw new Error('Message cannot be empty');
      }

      if (!this.currentModel) {
        throw new Error('No AI model configured. Please configure a model before sending messages.');
      }

      // Get or create conversation context
      const conversationContext = context || this.getOrCreateContext(sessionId);
      
      // Add user message to context
      const userMessage: AIMessage = {
        role: 'user',
        content: message,
        timestamp: new Date()
      };
      conversationContext.addMessage(userMessage);

      // Truncate context if needed
      conversationContext.truncateIfNeeded();

      // TODO: This will be implemented in subsequent tasks
      // For now, return a placeholder response
      const processingTime = Date.now() - startTime;
      const response: AIResponse = {
        content: 'AI Agent Service is ready. Model adapter implementation pending.',
        metadata: {
          model: this.currentModel.model,
          tokensUsed: 0,
          processingTime,
          timestamp: new Date()
        }
      };

      // Add AI response to context
      const assistantMessage: AIMessage = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        toolCalls: response.toolCalls
      };
      conversationContext.addMessage(assistantMessage);

      this.logger.info('Message processed successfully', { 
        sessionId, 
        processingTime,
        responseLength: response.content.length 
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('Failed to process message', { 
        sessionId, 
        error: error instanceof Error ? error.message : String(error),
        processingTime 
      });

      // Map the error using the existing error handler
      const enhancedError = this.mapError(error, {
        operation: 'sendMessage',
        sessionId,
        processingTime
      });

      // Throw a simple Error for better test compatibility
      throw new Error(enhancedError.message);
    }
  }

  /**
   * Execute a tool call requested by the AI
   * 
   * @param toolCall - Tool call to execute
   * @returns Promise resolving to tool execution result
   */
  async executeToolCall(toolCall: ToolCall): Promise<AIToolResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Executing tool call', { 
        toolId: toolCall.id,
        toolName: toolCall.name,
        parameterCount: Object.keys(toolCall.parameters).length 
      });

      // Validate tool call
      if (!toolCall.name) {
        throw new Error('Tool name is required');
      }

      // Execute the tool using the tool registry
      const result = await this.toolRegistry.executeToolCall(toolCall);

      this.logger.info('Tool call completed', { 
        toolId: toolCall.id,
        success: result.success,
        executionTime: result.metadata.executionTime 
      });

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      this.logger.error('Tool execution failed', { 
        toolId: toolCall.id,
        toolName: toolCall.name,
        error: error instanceof Error ? error.message : String(error),
        executionTime 
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executionTime: Math.max(executionTime, 1), // Ensure at least 1ms
          toolName: toolCall.name,
          parameters: toolCall.parameters,
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get available tools for the current session
   * 
   * @returns Array of available tool names
   */
  getAvailableTools(): string[] {
    const tools = this.toolRegistry.getAllTools().map(tool => tool.name);
    this.logger.debug('Getting available tools', { toolCount: tools.length });
    return tools;
  }

  /**
   * Get tool schemas for AI model consumption
   * 
   * @returns Array of tool schemas
   */
  getToolSchemas(): any[] {
    const schemas = this.toolRegistry.getToolSchemas();
    this.logger.debug('Getting tool schemas', { schemaCount: schemas.length });
    return schemas;
  }

  /**
   * Register a custom tool
   * 
   * @param tool - Tool to register
   */
  registerTool(tool: any): void {
    try {
      this.toolRegistry.registerTool(tool);
      this.logger.info('Custom tool registered', { toolName: tool.name });
    } catch (error) {
      this.logger.error('Failed to register custom tool', {
        toolName: tool.name,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Set the AI model configuration
   * 
   * @param modelConfig - Configuration for the AI model
   */
  setModel(modelConfig: ModelConfig): void {
    try {
      this.logger.info('Setting AI model', { 
        provider: modelConfig.provider,
        model: modelConfig.model,
        hasApiKey: !!modelConfig.apiKey 
      });

      // Validate model configuration
      if (!modelConfig.provider) {
        throw new Error('Model provider is required');
      }
      
      if (!modelConfig.model) {
        throw new Error('Model name is required');
      }

      this.currentModel = { ...modelConfig };
      
      this.logger.info('AI model configured successfully', { 
        provider: modelConfig.provider,
        model: modelConfig.model 
      });

    } catch (error) {
      this.logger.error('Failed to set AI model', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Get the current model configuration
   * 
   * @returns Current model configuration or undefined if not set
   */
  getCurrentModel(): ModelConfig | undefined {
    return this.currentModel ? { ...this.currentModel } : undefined;
  }

  /**
   * Get conversation context for a session
   * 
   * @param sessionId - Session identifier
   * @returns Conversation context or undefined if not found
   */
  getConversationContext(sessionId: string): ConversationContext | undefined {
    return this.conversationContexts.get(sessionId);
  }

  /**
   * Clear conversation context for a session
   * 
   * @param sessionId - Session identifier
   */
  clearConversationContext(sessionId: string): void {
    this.conversationContexts.delete(sessionId);
    this.logger.debug('Cleared conversation context', { sessionId });
  }

  /**
   * Clear all conversation contexts
   */
  clearAllContexts(): void {
    const contextCount = this.conversationContexts.size;
    this.conversationContexts.clear();
    this.logger.info('Cleared all conversation contexts', { contextCount });
  }

  /**
   * Get or create conversation context for a session
   * 
   * @param sessionId - Session identifier
   * @returns Conversation context
   */
  private getOrCreateContext(sessionId: string): ConversationContext {
    let context = this.conversationContexts.get(sessionId);
    
    if (!context) {
      context = new DefaultConversationContext();
      this.conversationContexts.set(sessionId, context);
      this.logger.debug('Created new conversation context', { sessionId });
    }
    
    return context;
  }

  /**
   * Map errors to enhanced error format
   * 
   * @param error - Original error
   * @param context - Additional context information
   * @returns Enhanced error
   */
  private mapError(error: any, context: { operation: string; sessionId?: string; processingTime?: number }): EnhancedError {
    const errorContext: ErrorContext = {
      provider: this.currentModel?.provider || 'unknown' as any,
      operation: context.operation,
      retryCount: 0,
      timestamp: new Date()
    };

    if (this.currentModel) {
      return ErrorMapper.mapProviderError(this.currentModel.provider as any, error, errorContext);
    }

    // Generic error mapping when no model is configured
    return {
      code: 'configuration_error',
      message: error instanceof Error ? error.message : String(error),
      provider: 'unknown' as any,
      retryable: false,
      context: errorContext,
      originalError: error
    };
  }
}

/**
 * Default implementation of ConversationContext
 */
export class DefaultConversationContext implements ConversationContext {
  public messages: AIMessage[] = [];
  public toolResults: AIToolResult[] = [];
  public systemPrompt: string = 'You are a helpful AI coding assistant.';
  public maxTokens: number = 4000; // Conservative default

  /**
   * Truncate context if it exceeds token limits
   */
  truncateIfNeeded(): void {
    const currentTokens = this.getTokenCount();
    
    if (currentTokens <= this.maxTokens) {
      return;
    }

    logger.debug('Truncating conversation context', { 
      currentTokens, 
      maxTokens: this.maxTokens,
      messageCount: this.messages.length 
    });

    // Keep system message and recent messages
    const systemMessages = this.messages.filter(m => m.role === 'system');
    const otherMessages = this.messages.filter(m => m.role !== 'system');
    
    // Keep the most recent messages that fit within the token limit
    const recentMessages: AIMessage[] = [];
    let tokenCount = this.estimateTokens(this.systemPrompt);
    
    // Add messages from most recent backwards
    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const message = otherMessages[i];
      const messageTokens = this.estimateTokens(message.content);
      
      if (tokenCount + messageTokens > this.maxTokens * 0.8) { // Leave some buffer
        break;
      }
      
      recentMessages.unshift(message);
      tokenCount += messageTokens;
    }

    this.messages = [...systemMessages, ...recentMessages];
    
    logger.debug('Context truncated', { 
      newMessageCount: this.messages.length,
      estimatedTokens: this.getTokenCount() 
    });
  }

  /**
   * Add a message to the conversation
   */
  addMessage(message: AIMessage): void {
    this.messages.push(message);
  }

  /**
   * Add a tool result to the context
   */
  addToolResult(result: AIToolResult): void {
    this.toolResults.push(result);
  }

  /**
   * Get estimated token count for the current context
   */
  getTokenCount(): number {
    let tokenCount = this.estimateTokens(this.systemPrompt);
    
    for (const message of this.messages) {
      tokenCount += this.estimateTokens(message.content);
    }
    
    for (const result of this.toolResults) {
      if (result.output) {
        tokenCount += this.estimateTokens(result.output);
      }
    }
    
    return tokenCount;
  }

  /**
   * Rough token estimation (approximately 4 characters per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}