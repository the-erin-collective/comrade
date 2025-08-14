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

      // If streaming is requested, use the streaming method
      if (onChunk) {
        return this.streamMessage(sessionId, message, onChunk, conversationContext);
      }

      // Fall back to non-streaming if no callback provided
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
}

