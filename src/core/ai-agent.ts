/**
 * Core AI Agent Service Infrastructure
 * 
 * This module provides the foundational interfaces and service class for AI agent functionality,
 * including message processing, tool calling, and conversation context management.
 */

import { Logger } from './logger';
import { ErrorMapper, EnhancedError, ErrorContext } from './error-handler';
import { ToolRegistry } from './tool-registry';
import { registerBuiltInTools as registerAllBuiltInTools } from './tools/index';
import { createCodingConversationContext } from './conversation-context';
import { ModelManager } from './model-manager';
import { ModelAdapter } from './model-adapters';
import { ModelConfig as BaseModelConfig } from './model-adapters/base-model-adapter';

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
export interface ModelConfig extends BaseModelConfig {
  /** Type of model provider */
  provider: 'ollama' | 'openai' | 'anthropic' | 'huggingface' | 'custom';
  /** Model name/identifier */
  model: string;
}

/**
 * Core AI Agent Service for managing AI model interactions
 */
export class AIAgentService {
  private logger: Logger;
  private modelManager: ModelManager;
  private currentModelAdapter: ModelAdapter | null = null;
  private currentModel: ModelConfig | null = null;
  private conversationContexts: Map<string, ConversationContext> = new Map();
  private toolRegistry: ToolRegistry;
  private isStreaming: boolean = false;
  private currentStreamAbortController: AbortController | null = null;
  private modelInitialized: boolean = false;

  constructor() {
    this.logger = logger.child({ prefix: 'Service' });
    this.toolRegistry = new ToolRegistry();
    this.modelManager = new ModelManager();
    
    // Register built-in tools
    this.registerBuiltInTools();
    
    this.logger.info('AI Agent Service initialized', {
      registeredTools: this.toolRegistry.size(),
      availableModels: this.modelManager.getModelConfigs().length
    });
  }

  /**
   * Register built-in tools
   */
  private registerBuiltInTools(): void {
    try {
      // Register the full built-in tool suite (file ops, command execution, workspace navigation)
      registerAllBuiltInTools(this.toolRegistry);
      
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
  /**
   * Send a message to the AI model with streaming support
   * 
   * @param sessionId - Unique identifier for the conversation session
   * @param message - User message to send to the AI
   * @param onChunk - Callback for streaming chunks
   * @param context - Optional conversation context to use
   * @returns Promise resolving to AI response
   */
  async sendMessage(
    sessionId: string, 
    message: string, 
    onChunk?: (chunk: { content: string; isComplete: boolean }) => void,
    context?: ConversationContext
  ): Promise<AIResponse> {
    const startTime = Date.now();
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount <= maxRetries) {
      try {
        this.logger.info('Processing message', { 
          sessionId, 
          messageLength: message.length,
          hasContext: !!context,
          retryCount
        });

        // Validate inputs
        if (!sessionId) {
          throw new Error('Session ID is required');
        }
        
        if (!message.trim()) {
          throw new Error('Message cannot be empty');
        }

        if (!this.currentModel) {
          const error = new Error('No AI model configured. Please configure a model before sending messages.');
          (error as any).code = 'model_not_configured';
          (error as any).recoverable = true;
          (error as any).suggestedFix = 'Configure an AI model in the extension settings';
          throw error;
        }

        // Test model connection before processing
        await this.ensureModelConnection();

        // Get or create conversation context
        const conversationContext = context || this.getOrCreateContext(sessionId);
        
        // Handle context overflow before adding new message
        const contextTokens = conversationContext.getTokenCount();
        const messageTokens = this.estimateTokens(message);
        const totalTokens = contextTokens + messageTokens;
        
        if (totalTokens > conversationContext.maxTokens) {
          this.logger.warn('Context overflow detected, applying intelligent truncation', {
            sessionId,
            contextTokens,
            messageTokens,
            totalTokens,
            maxTokens: conversationContext.maxTokens
          });
          
          // Apply intelligent truncation before adding the new message
          await this.handleContextOverflow(conversationContext, messageTokens);
        }
        
        // Add user message to context
        const userMessage: AIMessage = {
          role: 'user',
          content: message,
          timestamp: new Date()
        };
        conversationContext.addMessage(userMessage);

        // Truncate context if needed (additional safety check)
        conversationContext.truncateIfNeeded();

        // If streaming is requested, use the streaming method
        if (onChunk) {
          return await this.streamMessageWithRetry(sessionId, message, onChunk, conversationContext, retryCount);
        }

        // Get model adapter and send request
        const adapter = await this.getOrCreateModelAdapter();
        const prompt = this.formatPromptForModel(conversationContext);
        const response = await adapter.sendRequest(prompt);
        const parsedResponse = adapter.parseResponse(response);

        // Add AI response to context
        const assistantMessage: AIMessage = {
          role: 'assistant',
          content: parsedResponse.content,
          timestamp: new Date(),
          toolCalls: parsedResponse.toolCalls
        };
        conversationContext.addMessage(assistantMessage);

        this.logger.info('Message processed successfully', { 
          sessionId, 
          processingTime: Date.now() - startTime,
          responseLength: parsedResponse.content.length,
          retryCount
        });

        return parsedResponse;

      } catch (error) {
        const processingTime = Date.now() - startTime;
        
        this.logger.error('Failed to process message', { 
          sessionId, 
          error: error instanceof Error ? error.message : String(error),
          processingTime,
          retryCount
        });

        // Map the error using the existing error handler
        const enhancedError = this.mapError(error, {
          operation: 'sendMessage',
          sessionId,
          processingTime
        });

        // Check if we should retry
        if (this.shouldRetryError(enhancedError, retryCount, maxRetries)) {
          retryCount++;
          const retryDelay = this.calculateRetryDelay(retryCount, enhancedError.retryAfter);
          
          this.logger.info('Retrying message processing', {
            sessionId,
            retryCount,
            retryDelay,
            errorCode: enhancedError.code
          });
          
          await this.delay(retryDelay);
          continue;
        }

        // If not retryable or max retries exceeded, throw enhanced error
        const finalError = new Error(enhancedError.message);
        (finalError as any).code = enhancedError.code;
        (finalError as any).provider = enhancedError.provider;
        (finalError as any).recoverable = enhancedError.retryable;
        (finalError as any).suggestedFix = enhancedError.suggestedFix;
        (finalError as any).retryCount = retryCount;
        
        throw finalError;
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error('Maximum retries exceeded');
  }

  /**
   * Stream a message to the AI model and receive chunks of the response
   * 
   * @param sessionId - Unique identifier for the conversation session
   * @param message - User message to send to the AI
   * @param onChunk - Callback for streaming chunks
   * @param context - Conversation context to use
   * @returns Promise resolving to complete AI response
   */
  private async streamMessage(
    sessionId: string,
    message: string,
    onChunk: (chunk: { content: string; isComplete: boolean; toolCalls?: ToolCall[] }) => void,
    context: ConversationContext
  ): Promise<AIResponse> {
    const startTime = Date.now();
    let fullResponse = '';
    let toolCalls: ToolCall[] = [];
    
    try {
      if (this.isStreaming) {
        throw new Error('A streaming operation is already in progress');
      }

      this.isStreaming = true;
      this.currentStreamAbortController = new AbortController();

      // TODO: Replace with actual model adapter streaming implementation
      // This is a mock implementation that simulates streaming
      const words = 'This is a simulated streaming response from the AI model. '.split(' ');
      
      for (let i = 0; i < words.length; i++) {
        if (this.currentStreamAbortController.signal.aborted) {
          throw new Error('Streaming was aborted');
        }

        const word = words[i] + (i < words.length - 1 ? ' ' : '');
        fullResponse += word;
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Send chunk to the callback
        onChunk({
          content: word,
          isComplete: i === words.length - 1,
          toolCalls: i === words.length - 1 ? toolCalls : undefined
        });
      }

      const processingTime = Date.now() - startTime;
      
      // Create the final response
      const response: AIResponse = {
        content: fullResponse,
        toolCalls,
        metadata: {
          model: this.currentModel?.model || 'unknown',
          tokensUsed: fullResponse.length / 4, // Rough estimate
          processingTime,
          timestamp: new Date()
        }
      };

      // Add AI response to context
      const assistantMessage: AIMessage = {
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date(),
        toolCalls
      };
      context.addMessage(assistantMessage);

      this.logger.info('Streaming message processed', {
        sessionId,
        processingTime,
        responseLength: fullResponse.length
      });

      return response;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Error in streaming message', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        processingTime
      });
      
      // Ensure we clean up the streaming state
      this.isStreaming = false;
      this.currentStreamAbortController = null;
      
      throw error;
    } finally {
      this.isStreaming = false;
      this.currentStreamAbortController = null;
    }
  }

  /**
   * Abort the current streaming operation if one is in progress
   */
  public abortStreaming(): void {
    if (this.isStreaming && this.currentStreamAbortController) {
      this.currentStreamAbortController.abort();
      this.isStreaming = false;
      this.currentStreamAbortController = null;
      this.logger.info('Streaming operation aborted');
    }
  }

  /**
   * Execute a tool call requested by the AI with retry logic
   * 
   * @param toolCall - Tool call to execute
   * @returns Promise resolving to tool execution result
   */
  async executeToolCall(toolCall: ToolCall): Promise<AIToolResult> {
    const startTime = Date.now();
    let retryCount = 0;
    const maxRetries = 2; // Fewer retries for tool calls to avoid long delays
    
    while (retryCount <= maxRetries) {
      try {
        this.logger.info('Executing tool call', { 
          toolId: toolCall.id,
          toolName: toolCall.name,
          parameterCount: Object.keys(toolCall.parameters).length,
          retryCount
        });

        // Validate tool call
        if (!toolCall.name) {
          throw new Error('Tool name is required');
        }

        // Check if tool exists before execution
        const tool = this.toolRegistry.getTool(toolCall.name);
        if (!tool) {
          const error = new Error(`Tool '${toolCall.name}' not found`);
          (error as any).code = 'tool_not_found';
          (error as any).recoverable = false;
          throw error;
        }

        // Execute the tool using the tool registry with enhanced error handling
        const result = await this.executeToolWithRecovery(toolCall, retryCount);

        this.logger.info('Tool call completed', { 
          toolId: toolCall.id,
          success: result.success,
          executionTime: result.metadata.executionTime,
          retryCount
        });

        return result;

      } catch (error) {
        const executionTime = Date.now() - startTime;
        
        this.logger.error('Tool execution failed', { 
          toolId: toolCall.id,
          toolName: toolCall.name,
          error: error instanceof Error ? error.message : String(error),
          executionTime,
          retryCount
        });

        // Check if we should retry tool execution
        if (this.shouldRetryToolExecution(error, retryCount, maxRetries)) {
          retryCount++;
          const retryDelay = this.calculateToolRetryDelay(retryCount);
          
          this.logger.info('Retrying tool execution', {
            toolId: toolCall.id,
            toolName: toolCall.name,
            retryCount,
            retryDelay
          });
          
          await this.delay(retryDelay);
          continue;
        }

        // Return error result with enhanced information
        return {
          success: false,
          error: this.formatToolError(error, toolCall.name, retryCount),
          metadata: {
            executionTime: Math.max(executionTime, 1),
            toolName: toolCall.name,
            parameters: toolCall.parameters,
            timestamp: new Date(),
            retryCount,
            errorCode: (error as any).code || 'execution_error'
          }
        };
      }
    }

    // This should never be reached, but TypeScript requires it
    const executionTime = Date.now() - startTime;
    return {
      success: false,
      error: `Tool execution failed after ${maxRetries} retries`,
      metadata: {
        executionTime,
        toolName: toolCall.name,
        parameters: toolCall.parameters,
        timestamp: new Date(),
        retryCount: maxRetries
      }
    };
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

      // Store the model configuration
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
      context = createCodingConversationContext();
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

  /**
   * Ensure model connection is available and working
   */
  private async ensureModelConnection(): Promise<void> {
    if (!this.currentModel) {
      const error = new Error('No AI model configured');
      (error as any).code = 'model_not_configured';
      throw error;
    }

    try {
      const adapter = await this.getOrCreateModelAdapter();
      
      // Test connection for adapters that support it
      if ('testConnection' in adapter && typeof adapter.testConnection === 'function') {
        const isConnected = await adapter.testConnection();
        if (!isConnected) {
          const error = new Error(`Failed to connect to ${this.currentModel.provider} model '${this.currentModel.model}'`);
          (error as any).code = 'connection_failed';
          (error as any).provider = this.currentModel.provider;
          throw error;
        }
      }
    } catch (error) {
      // Enhance connection errors with user guidance
      if (error instanceof Error) {
        const enhancedError = this.enhanceConnectionError(error);
        throw enhancedError;
      }
      throw error;
    }
  }

  /**
   * Enhance connection errors with user guidance
   */
  private enhanceConnectionError(error: Error): Error {
    const provider = this.currentModel?.provider;
    let message = error.message;
    let suggestedFix = '';

    switch (provider) {
      case 'ollama':
        if (message.includes('connection') || message.includes('ECONNREFUSED')) {
          message = 'Cannot connect to Ollama server. Please ensure Ollama is running.';
          suggestedFix = 'Start Ollama by running "ollama serve" in your terminal, or check if Ollama is installed and the endpoint is correct.';
        } else if (message.includes('model') && message.includes('not found')) {
          suggestedFix = `The model '${this.currentModel?.model}' is not available. Pull it with "ollama pull ${this.currentModel?.model}" or choose a different model.`;
        }
        break;
      
      case 'openai':
        if (message.includes('API key') || message.includes('authentication')) {
          suggestedFix = 'Check your OpenAI API key in the extension settings. Ensure it\'s valid and has the necessary permissions.';
        } else if (message.includes('quota') || message.includes('billing')) {
          suggestedFix = 'Your OpenAI quota has been exceeded. Check your billing settings or upgrade your plan.';
        }
        break;
      
      case 'anthropic':
        if (message.includes('API key') || message.includes('authentication')) {
          suggestedFix = 'Check your Anthropic API key in the extension settings. Ensure it\'s valid and has the necessary permissions.';
        }
        break;
      
      case 'huggingface':
        if (message.includes('API key') || message.includes('authentication')) {
          suggestedFix = 'Check your Hugging Face API key in the extension settings, or try using a public model that doesn\'t require authentication.';
        } else if (message.includes('model') && message.includes('not found')) {
          suggestedFix = `The model '${this.currentModel?.model}' is not available on Hugging Face. Check the model name or try a different model.`;
        }
        break;
    }

    const enhancedError = new Error(message);
    (enhancedError as any).code = (error as any).code || 'connection_error';
    (enhancedError as any).provider = provider;
    (enhancedError as any).recoverable = true;
    (enhancedError as any).suggestedFix = suggestedFix;
    (enhancedError as any).originalError = error;

    return enhancedError;
  }

  /**
   * Handle context overflow with intelligent truncation
   */
  private async handleContextOverflow(context: ConversationContext, additionalTokens: number): Promise<void> {
    const currentTokens = context.getTokenCount();
    const targetTokens = Math.max(
      context.maxTokens - additionalTokens - 500, // Leave buffer for response
      context.maxTokens * 0.5 // Don't truncate more than 50%
    );

    this.logger.info('Applying intelligent context truncation', {
      currentTokens,
      targetTokens,
      additionalTokens,
      maxTokens: context.maxTokens
    });

    // Use the context's built-in truncation, but with more aggressive settings
    const originalConfig = (context as any).config;
    if (originalConfig) {
      // Temporarily adjust truncation settings for more aggressive truncation
      (context as any).updateConfig({
        truncationBuffer: 0.1, // Reduce buffer to 10%
        minRecentMessages: 1 // Keep fewer messages
      });
    }

    // Apply truncation
    context.truncateIfNeeded();

    // Restore original config
    if (originalConfig) {
      (context as any).updateConfig(originalConfig);
    }

    const newTokens = context.getTokenCount();
    this.logger.info('Context truncation completed', {
      originalTokens: currentTokens,
      newTokens,
      tokensRemoved: currentTokens - newTokens
    });
  }

  /**
   * Check if an error should be retried
   */
  private shouldRetryError(error: EnhancedError, retryCount: number, maxRetries: number): boolean {
    if (retryCount >= maxRetries) {
      return false;
    }

    // Don't retry configuration errors
    if (error.code === 'model_not_configured' || error.code === 'invalid_api_key') {
      return false;
    }

    // Always retry connection errors (up to max retries)
    if (error.code === 'connection_failed' || error.code === 'network_error') {
      return true;
    }

    // Retry rate limit errors with longer delays
    if (error.code === 'rate_limit_exceeded') {
      return retryCount < 5; // Allow more retries for rate limits
    }

    // Retry server errors
    if (error.code === 'server_error' || error.code === 'service_unavailable') {
      return true;
    }

    // Use the error's retryable flag
    return error.retryable;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number, retryAfter?: number): number {
    if (retryAfter) {
      // Respect retry-after header (convert seconds to milliseconds)
      return retryAfter * 1000;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    const baseDelay = 1000;
    const maxDelay = 30000; // Cap at 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
    
    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    
    return Math.max(delay + jitter, baseDelay);
  }

  /**
   * Delay execution for the specified number of milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get or create model adapter with error handling
   */
  private async getOrCreateModelAdapter(): Promise<any> {
    if (!this.currentModelAdapter || !this.modelInitialized) {
      if (!this.currentModel) {
        throw new Error('No model configured');
      }

      try {
        this.currentModelAdapter = await this.createModelAdapter(this.currentModel);
        this.modelInitialized = true;
        
        this.logger.info('Model adapter initialized', {
          provider: this.currentModel.provider,
          model: this.currentModel.model
        });
      } catch (error) {
        this.logger.error('Failed to initialize model adapter', {
          provider: this.currentModel.provider,
          model: this.currentModel.model,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }

    return this.currentModelAdapter;
  }

  /**
   * Create model adapter based on provider
   */
  private async createModelAdapter(config: ModelConfig): Promise<any> {
    const { OllamaAdapter } = await import('./model-adapters/ollama-adapter');
    const { HuggingFaceAdapter } = await import('./model-adapters/huggingface-adapter');

    switch (config.provider) {
      case 'ollama':
        const ollamaAdapter = new OllamaAdapter();
        await ollamaAdapter.initialize(config);
        return ollamaAdapter;
      
      case 'huggingface':
        const hfAdapter = new HuggingFaceAdapter();
        await hfAdapter.initialize(config);
        return hfAdapter;
      
      case 'openai':
      case 'anthropic':
      case 'custom':
        // For now, use a mock adapter for these providers
        return {
          testConnection: async () => true,
          formatPrompt: (messages: any[], tools: any[]) => messages.map((m: any) => `${m.role}: ${m.content}`).join('\n'),
          parseResponse: (response: string) => ({
            content: response,
            metadata: {
              model: config.model,
              tokensUsed: Math.ceil(response.length / 4),
              processingTime: 100,
              timestamp: new Date()
            }
          }),
          sendRequest: async (prompt: string) => `Mock response to: ${prompt}`,
          supportsToolCalling: () => false,
          capabilities: { supportsToolCalling: false }
        };
      
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  /**
   * Format prompt for the current model with graceful degradation
   */
  private formatPromptForModel(context: ConversationContext): string {
    const adapter = this.currentModelAdapter;
    if (!adapter || !('formatPrompt' in adapter)) {
      // Fallback to simple formatting
      return this.formatPromptFallback(context);
    }

    try {
      const tools = this.getAvailableToolsForModel();
      return adapter.formatPrompt(context.messages, tools);
    } catch (error) {
      this.logger.warn('Failed to format prompt with adapter, using fallback', {
        error: error instanceof Error ? error.message : String(error),
        provider: this.currentModel?.provider
      });
      
      return this.formatPromptFallback(context);
    }
  }

  /**
   * Get available tools for the current model with feature detection
   */
  private getAvailableToolsForModel(): any[] {
    const adapter = this.currentModelAdapter;
    
    // Check if the model supports tool calling
    if (!adapter || !this.supportsToolCalling(adapter)) {
      this.logger.info('Model does not support tool calling, providing empty tool list', {
        provider: this.currentModel?.provider,
        model: this.currentModel?.model
      });
      return [];
    }

    // Return all available tools for models that support them
    return this.toolRegistry.getAllTools();
  }

  /**
   * Check if the current model supports tool calling
   */
  private supportsToolCalling(adapter: any): boolean {
    try {
      // Check if adapter has tool calling capability
      if ('supportsToolCalling' in adapter && typeof adapter.supportsToolCalling === 'function') {
        return adapter.supportsToolCalling();
      }
      
      // Check capabilities object
      if (adapter.capabilities && typeof adapter.capabilities.supportsToolCalling === 'boolean') {
        return adapter.capabilities.supportsToolCalling;
      }
      
      // Fallback: assume basic models don't support tool calling
      const modelName = this.currentModel?.model?.toLowerCase() || '';
      const unsupportedModels = ['gpt-3.5-turbo-instruct', 'text-davinci', 'text-curie', 'text-babbage', 'text-ada'];
      
      return !unsupportedModels.some(unsupported => modelName.includes(unsupported));
    } catch (error) {
      this.logger.warn('Error checking tool calling support, assuming not supported', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Fallback prompt formatting for models without adapter support
   */
  private formatPromptFallback(context: ConversationContext): string {
    let prompt = '';
    
    // Add system prompt
    if (context.systemPrompt) {
      prompt += `System: ${context.systemPrompt}\n\n`;
    }
    
    // Add conversation messages
    for (const message of context.messages) {
      const role = this.normalizeRole(message.role);
      prompt += `${role}: ${message.content}\n`;
      
      // Add tool results if available (even for non-tool-calling models)
      if (message.toolResults && message.toolResults.length > 0) {
        for (const result of message.toolResults) {
          const status = result.success ? 'Success' : 'Error';
          const output = result.success ? result.output : result.error;
          prompt += `Tool Result (${result.metadata.toolName}) - ${status}: ${output}\n`;
        }
      }
    }
    
    // Add assistant prompt
    prompt += 'Assistant: ';
    
    return prompt;
  }

  /**
   * Normalize message roles for different model formats
   */
  private normalizeRole(role: string): string {
    switch (role) {
      case 'system':
        return 'System';
      case 'user':
        return 'Human';
      case 'assistant':
        return 'Assistant';
      case 'tool':
        return 'Tool';
      default:
        return role.charAt(0).toUpperCase() + role.slice(1);
    }
  }

  /**
   * Handle unsupported model features gracefully
   */
  private async handleUnsupportedFeatures(sessionId: string, message: string): Promise<AIResponse> {
    const startTime = Date.now();
    
    this.logger.info('Handling request with unsupported model features', {
      sessionId,
      provider: this.currentModel?.provider,
      model: this.currentModel?.model
    });

    // Get conversation context
    const context = this.getOrCreateContext(sessionId);
    
    // Format prompt without tool calling features
    const prompt = this.formatPromptFallback(context);
    
    try {
      // Try to get a basic response from the model
      const adapter = await this.getOrCreateModelAdapter();
      let response: string;
      
      if ('sendRequest' in adapter && typeof adapter.sendRequest === 'function') {
        response = await adapter.sendRequest(prompt);
      } else {
        // Ultimate fallback
        response = 'I apologize, but I cannot process your request due to model limitations. Please check your model configuration.';
      }
      
      const processingTime = Date.now() - startTime;
      
      // Create response without tool calls
      const aiResponse: AIResponse = {
        content: response,
        metadata: {
          model: this.currentModel?.model || 'unknown',
          tokensUsed: this.estimateTokens(response),
          processingTime,
          timestamp: new Date()
        }
      };
      
      // Add response to context
      const assistantMessage: AIMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };
      context.addMessage(assistantMessage);
      
      return aiResponse;
      
    } catch (error) {
      this.logger.error('Failed to handle request with degraded features', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return a helpful error response
      const processingTime = Date.now() - startTime;
      return {
        content: 'I encountered an error while processing your request. This may be due to model limitations or configuration issues. Please check your model settings and try again.',
        metadata: {
          model: this.currentModel?.model || 'unknown',
          tokensUsed: 0,
          processingTime,
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Stream message with retry logic
   */
  private async streamMessageWithRetry(
    sessionId: string,
    message: string,
    onChunk: (chunk: { content: string; isComplete: boolean }) => void,
    context: ConversationContext,
    retryCount: number
  ): Promise<AIResponse> {
    // For now, fall back to the existing streaming implementation
    // TODO: Add retry logic to streaming when model adapters support it
    return this.streamMessage(sessionId, message, onChunk, context);
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Execute tool with recovery mechanisms
   */
  private async executeToolWithRecovery(toolCall: ToolCall, retryCount: number): Promise<AIToolResult> {
    try {
      // Add safety validations for tool parameters
      const validatedParameters = this.validateAndSanitizeToolParameters(toolCall);
      
      // Create a new tool call with validated parameters
      const safeToolCall: ToolCall = {
        ...toolCall,
        parameters: validatedParameters
      };

      // Execute the tool
      const result = await this.toolRegistry.executeToolCall(safeToolCall);
      
      // Enhance result with recovery information
      return {
        ...result,
        metadata: {
          ...result.metadata,
          retryCount,
          validated: true
        }
      };
    } catch (error) {
      // Apply tool-specific error recovery
      const recoveredError = this.applyToolErrorRecovery(error, toolCall, retryCount);
      throw recoveredError;
    }
  }

  /**
   * Validate and sanitize tool parameters
   */
  private validateAndSanitizeToolParameters(toolCall: ToolCall): Record<string, any> {
    const tool = this.toolRegistry.getTool(toolCall.name);
    if (!tool) {
      throw new Error(`Tool '${toolCall.name}' not found`);
    }

    const sanitized: Record<string, any> = {};

    // Apply parameter validation and sanitization
    for (const param of tool.parameters) {
      const value = toolCall.parameters[param.name];
      
      // Handle required parameters
      if (param.required && (value === undefined || value === null)) {
        throw new Error(`Required parameter '${param.name}' is missing for tool '${toolCall.name}'`);
      }

      // Skip optional parameters that are not provided
      if (value === undefined || value === null) {
        continue;
      }

      // Apply type-specific sanitization
      sanitized[param.name] = this.sanitizeParameterValue(value, param.type, param.name, toolCall.name);
    }

    return sanitized;
  }

  /**
   * Sanitize parameter value based on type
   */
  private sanitizeParameterValue(value: any, type: string, paramName: string, toolName: string): any {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`Parameter '${paramName}' for tool '${toolName}' must be a string`);
        }
        // Sanitize file paths for file operations
        if (toolName.includes('file') || toolName.includes('File')) {
          return this.sanitizeFilePath(value);
        }
        return value;

      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Parameter '${paramName}' for tool '${toolName}' must be a valid number`);
        }
        return num;

      case 'boolean':
        if (typeof value === 'boolean') {
          return value;
        }
        if (typeof value === 'string') {
          return value.toLowerCase() === 'true';
        }
        throw new Error(`Parameter '${paramName}' for tool '${toolName}' must be a boolean`);

      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`Parameter '${paramName}' for tool '${toolName}' must be an array`);
        }
        return value;

      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new Error(`Parameter '${paramName}' for tool '${toolName}' must be an object`);
        }
        return value;

      default:
        return value;
    }
  }

  /**
   * Sanitize file paths to prevent directory traversal
   */
  private sanitizeFilePath(path: string): string {
    // Remove dangerous path components
    const sanitized = path
      .replace(/\.\./g, '') // Remove parent directory references
      .replace(/\/+/g, '/') // Normalize multiple slashes
      .replace(/^\/+/, ''); // Remove leading slashes
    
    // Ensure the path is not empty after sanitization
    if (!sanitized) {
      throw new Error('Invalid file path: path cannot be empty after sanitization');
    }

    return sanitized;
  }

  /**
   * Apply tool-specific error recovery
   */
  private applyToolErrorRecovery(error: any, toolCall: ToolCall, retryCount: number): Error {
    const toolName = toolCall.name.toLowerCase();
    let recoveredError = error;

    // File operation error recovery
    if (toolName.includes('file') || toolName.includes('read') || toolName.includes('write')) {
      recoveredError = this.recoverFileOperationError(error, toolCall);
    }
    // Command execution error recovery
    else if (toolName.includes('command') || toolName.includes('execute')) {
      recoveredError = this.recoverCommandExecutionError(error, toolCall);
    }
    // Network operation error recovery
    else if (toolName.includes('http') || toolName.includes('request') || toolName.includes('fetch')) {
      recoveredError = this.recoverNetworkError(error, toolCall);
    }

    // Add retry information
    (recoveredError as any).retryCount = retryCount;
    (recoveredError as any).toolName = toolCall.name;

    return recoveredError;
  }

  /**
   * Recover from file operation errors
   */
  private recoverFileOperationError(error: any, toolCall: ToolCall): Error {
    const message = error.message || '';
    
    if (message.includes('ENOENT') || message.includes('not found')) {
      const enhancedError = new Error(`File not found: ${toolCall.parameters.path || 'unknown path'}`);
      (enhancedError as any).code = 'file_not_found';
      (enhancedError as any).recoverable = false;
      (enhancedError as any).suggestedFix = 'Check if the file path is correct and the file exists';
      return enhancedError;
    }
    
    if (message.includes('EACCES') || message.includes('permission denied')) {
      const enhancedError = new Error(`Permission denied: ${toolCall.parameters.path || 'unknown path'}`);
      (enhancedError as any).code = 'permission_denied';
      (enhancedError as any).recoverable = false;
      (enhancedError as any).suggestedFix = 'Check file permissions or run with appropriate privileges';
      return enhancedError;
    }
    
    if (message.includes('ENOSPC') || message.includes('no space')) {
      const enhancedError = new Error('Insufficient disk space');
      (enhancedError as any).code = 'disk_full';
      (enhancedError as any).recoverable = false;
      (enhancedError as any).suggestedFix = 'Free up disk space and try again';
      return enhancedError;
    }

    // Generic file operation error
    (error as any).code = (error as any).code || 'file_operation_error';
    (error as any).recoverable = true;
    return error;
  }

  /**
   * Recover from command execution errors
   */
  private recoverCommandExecutionError(error: any, toolCall: ToolCall): Error {
    const message = error.message || '';
    
    if (message.includes('command not found') || message.includes('not recognized')) {
      const command = toolCall.parameters.command || 'unknown command';
      const enhancedError = new Error(`Command not found: ${command}`);
      (enhancedError as any).code = 'command_not_found';
      (enhancedError as any).recoverable = false;
      (enhancedError as any).suggestedFix = `Install the required command or check if '${command}' is in your PATH`;
      return enhancedError;
    }
    
    if (message.includes('timeout') || message.includes('killed')) {
      const enhancedError = new Error('Command execution timed out');
      (enhancedError as any).code = 'command_timeout';
      (enhancedError as any).recoverable = true;
      (enhancedError as any).suggestedFix = 'Try running the command with a longer timeout or break it into smaller operations';
      return enhancedError;
    }

    // Generic command execution error
    (error as any).code = (error as any).code || 'command_execution_error';
    (error as any).recoverable = true;
    return error;
  }

  /**
   * Recover from network errors
   */
  private recoverNetworkError(error: any, toolCall: ToolCall): Error {
    const message = error.message || '';
    
    if (message.includes('ECONNREFUSED') || message.includes('connection refused')) {
      const enhancedError = new Error('Connection refused - server may be down');
      (enhancedError as any).code = 'connection_refused';
      (enhancedError as any).recoverable = true;
      (enhancedError as any).suggestedFix = 'Check if the server is running and accessible';
      return enhancedError;
    }
    
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      const enhancedError = new Error('Network request timed out');
      (enhancedError as any).code = 'network_timeout';
      (enhancedError as any).recoverable = true;
      (enhancedError as any).suggestedFix = 'Check your network connection and try again';
      return enhancedError;
    }

    // Generic network error
    (error as any).code = (error as any).code || 'network_error';
    (error as any).recoverable = true;
    return error;
  }

  /**
   * Check if tool execution should be retried
   */
  private shouldRetryToolExecution(error: any, retryCount: number, maxRetries: number): boolean {
    if (retryCount >= maxRetries) {
      return false;
    }

    const code = (error as any).code;
    
    // Don't retry non-recoverable errors
    if (code === 'tool_not_found' || code === 'file_not_found' || 
        code === 'permission_denied' || code === 'command_not_found') {
      return false;
    }

    // Retry network and temporary errors
    if (code === 'network_timeout' || code === 'connection_refused' || 
        code === 'command_timeout' || code === 'file_operation_error') {
      return true;
    }

    // Use the error's recoverable flag if available
    return (error as any).recoverable === true;
  }

  /**
   * Calculate retry delay for tool execution
   */
  private calculateToolRetryDelay(retryCount: number): number {
    // Shorter delays for tool execution: 500ms, 1s, 2s
    const baseDelay = 500;
    const maxDelay = 5000; // Cap at 5 seconds for tools
    const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
    
    // Add small jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    
    return Math.max(delay + jitter, baseDelay);
  }

  /**
   * Format tool error message with helpful information
   */
  private formatToolError(error: any, toolName: string, retryCount: number): string {
    const baseMessage = error.message || 'Unknown error';
    const code = (error as any).code;
    const suggestedFix = (error as any).suggestedFix;
    
    let formattedMessage = `Tool '${toolName}' failed: ${baseMessage}`;
    
    if (retryCount > 0) {
      formattedMessage += ` (after ${retryCount} retries)`;
    }
    
    if (code) {
      formattedMessage += ` [${code}]`;
    }
    
    if (suggestedFix) {
      formattedMessage += `\nSuggested fix: ${suggestedFix}`;
    }
    
    return formattedMessage;
  }
}

