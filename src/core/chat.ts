/**
 * Chat communication interfaces and implementation for LLM interactions
 */

import * as vscode from 'vscode';
import { IAgent, AgentConfig, LLMProvider } from './agent';
import { getPersonalityForPrompt } from './personality';
import { WebNetworkUtils, WebCompatibility } from './webcompat';
import { ToolManager, ToolExecutionError } from './tool-manager';
import { ExecutionContext, SecurityLevel } from './tools';
import { EnhancedError, ErrorContext } from './error-handler';

// Type definitions for API responses
interface OpenAIResponse {
  choices?: Array<{
    message?: { content?: string; tool_calls?: any[] };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;
  error?: {
    message: string;
    code: string;
  };
}

interface OllamaResponse {
  message?: { content?: string };
  done?: boolean;
  model?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
  error?: string;
}

interface OllamaModelsResponse {
  models?: Array<{ name: string }>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  retryDelay?: number;
  webEnvironment?: boolean;
  concurrentToolExecution?: boolean;
  executionContext?: any;
  stream?: boolean;
  timeout?: number;
  tools?: ChatTool[];
}

export interface ChatTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ChatResponse {
  success: boolean;
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: ChatToolCall[];
  toolResults?: ChatToolResult[];
  error?: {
    code: string;
    message: string;
  };
  metadata?: Record<string, any>;
}

export interface ChatToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

export interface ChatToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export type StreamCallback = (chunk: string, isComplete: boolean) => void;

export interface IChatBridge {
  sendMessage(agent: IAgent, messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamMessage(agent: IAgent, messages: ChatMessage[], callback: StreamCallback, options?: ChatOptions): Promise<ChatResponse>;

  /**
   * Validates the connection to the agent's LLM provider
   * @param agent The agent to validate connection for
   * @returns A tuple where the first element is a boolean indicating success,
   *          and the second element is an optional error message with details
   */
  validateConnection(agent: IAgent): Promise<[boolean, string?]>;
}

export class ChatBridgeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: LLMProvider,
    public readonly statusCode?: number,
    public readonly retryAfter?: number,
    public readonly suggestedFix?: string,
    public readonly context?: ErrorContext,
    public readonly retryable: boolean = false,
    public readonly originalError?: any
  ) {
    super(message);
    this.name = 'ChatBridgeError';
  }

  static fromEnhancedError(enhancedError: EnhancedError): ChatBridgeError {
    return new ChatBridgeError(
      enhancedError.message,
      enhancedError.code,
      enhancedError.provider,
      enhancedError.statusCode,
      enhancedError.retryAfter,
      enhancedError.suggestedFix,
      enhancedError.context,
      enhancedError.retryable,
      enhancedError.originalError
    );
  }
}

export class ChatBridge implements IChatBridge {
  private readonly httpTimeout: number = 30000; // 30 seconds default
  private readonly toolManager: ToolManager;
  private readonly MEMORY_CHECK_INTERVAL = 5000; // 5 seconds
  private readonly MEMORY_THRESHOLD = 90; // 90% of system memory
  private readonly CHUNK_PROCESSING_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MEMORY_CHECK_CHUNK_COUNT = 10; // Check memory every 10 chunks
  private readonly MEMORY_CHECK_SIZE = 1024 * 1024; // 1MB

  /**
   * Gets current memory usage information
   * @returns Object containing memory usage details
   */
  private getMemoryUsage(): { usedMB: number; totalMB: number; percentage: number } {
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const mem = process.memoryUsage();
        const usedMB = Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100;
        const totalMB = Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100;
        const percentage = Math.round((mem.heapUsed / mem.heapTotal) * 100);

        console.debug('Memory usage', {
          usedMB,
          totalMB,
          percentage,
          rssMB: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
          externalMB: mem.external ? Math.round(mem.external / 1024 / 1024 * 100) / 100 : 0,
          arrayBuffersMB: mem.arrayBuffers ? Math.round(mem.arrayBuffers / 1024 / 1024 * 100) / 100 : 0
        });

        return { usedMB, totalMB, percentage };
      }

      // Fallback for web environments
      return { usedMB: 0, totalMB: 0, percentage: 0 };
    } catch (error) {
      console.error('Failed to get memory usage', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Return safe defaults
      return { usedMB: 0, totalMB: 0, percentage: 0 };
    }
  }

  /**
   * Checks current memory usage and throws an error if over threshold
   * @param context Additional context for error reporting
   * @throws {ChatBridgeError} If memory usage exceeds the threshold
   */
  private checkMemoryUsage(context: Record<string, any> = {}): void {
    try {
      const { usedMB, totalMB, percentage } = this.getMemoryUsage();
      const memoryInfo = { usedMB, totalMB, percentage, threshold: this.MEMORY_THRESHOLD };

      // Log memory usage for monitoring
      if (percentage > this.MEMORY_THRESHOLD * 0.8) {
        // Log warning at 80% of threshold
        console.warn('High memory usage detected', { ...memoryInfo, ...context });
      } else {
        console.debug('Memory check', memoryInfo);
      }

      // Check if we're over the memory threshold
      if (percentage > this.MEMORY_THRESHOLD) {
        const errorMessage = `Memory usage (${percentage}%) exceeds threshold (${this.MEMORY_THRESHOLD}%)`;
        console.error(errorMessage, { ...memoryInfo, ...context });

        // Try to free up memory before throwing
        try {
          if (global.gc) {
            console.info('Running garbage collection to free up memory');
            global.gc();

            // Check memory again after GC
            const afterGC = this.getMemoryUsage();
            if (afterGC.percentage <= this.MEMORY_THRESHOLD) {
              console.info('Memory usage after GC', afterGC);
              return; // GC helped, no need to throw
            }
          }
        } catch (gcError) {
          console.warn('Failed to run garbage collection', {
            error: gcError instanceof Error ? gcError.message : String(gcError)
          });
        }

        throw new ChatBridgeError(
          errorMessage,
          'memory_limit_exceeded',
          'openai',
          undefined,
          undefined,
          'Try reducing the response size or processing data in smaller chunks.'
        );
      }
    } catch (error) {
      // Only rethrow if it's our memory limit error
      if (error instanceof ChatBridgeError && error.code === 'memory_limit_exceeded') {
        throw error;
      }

      // Log other errors but don't fail the operation
      console.error('Error checking memory usage', {
        error: error instanceof Error ? error.message : String(error),
        ...context
      });
    }
  }
  // Example: private someService = inject(SomeService);

  constructor() {
    this.toolManager = ToolManager.getInstance();

    // Register built-in tools if not already registered
    try {
      const { BuiltInTools } = require('./tool-manager');
      const registry = require('./tools').ToolRegistry.getInstance();

      // Only register if no tools are registered yet
      if (registry.getAllTools().length === 0) {
        BuiltInTools.registerAll();
      }
    } catch (error) {
      console.error('Failed to register built-in tools', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async sendMessage(agent: IAgent, messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    // Validate request before processing
    this.validateRequest(messages, options);

    // Inject personality into messages
    const messagesWithPersonality = await this.injectPersonality(messages);

    try {
      switch (agent.provider) {
        case 'openai':
          return await this.sendOpenAIMessage(agent, messagesWithPersonality, options);
        case 'ollama':
          return await this.sendOllamaMessage(agent, messagesWithPersonality, options);
        case 'custom':
          return await this.sendCustomMessage(agent, messagesWithPersonality, options);
        case 'anthropic':
          return await this.sendAnthropicMessage(agent, messagesWithPersonality, options);
        default:
          throw new ChatBridgeError(
            `Unsupported provider: ${agent.provider}`,
            'unsupported_provider',
            agent.provider
          );
      }
    } catch (error) {
      if (error instanceof ChatBridgeError) {
        throw error;
      }
      throw new ChatBridgeError(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
        'send_message_failed',
        agent.provider
      );
    }
  }

  async streamMessage(
    agent: IAgent,
    messages: ChatMessage[],
    callback: StreamCallback,
    options?: ChatOptions
  ): Promise<ChatResponse> {
    // Validate request before processing
    this.validateRequest(messages, options);

    // Inject personality into messages
    const messagesWithPersonality = await this.injectPersonality(messages);

    try {
      switch (agent.provider) {
        case 'openai':
          return await this.streamOpenAIMessage(agent, messagesWithPersonality, callback, options);
        case 'ollama':
          return await this.streamOllamaMessage(agent, messagesWithPersonality, callback, options);
        case 'custom':
          return await this.streamCustomMessage(agent, messagesWithPersonality, callback, options);
        case 'anthropic':
          return await this.streamAnthropicMessage(agent, messagesWithPersonality, callback, options);
        default:
          throw new ChatBridgeError(
            `Unsupported provider: ${agent.provider}`,
            'unsupported_provider',
            agent.provider
          );
      }
    } catch (error) {
      if (error instanceof ChatBridgeError) {
        throw error;
      }
      throw new ChatBridgeError(
        `Failed to stream message: ${error instanceof Error ? error.message : String(error)}`,
        'STREAM_ERROR',
        agent.provider
      );
    }
  }

  /**
   * Validates the connection to the agent's LLM provider
   * @param agent The agent to validate connection for
   * @returns A tuple where the first element is a boolean indicating success,
   *          and the second element is an optional error message with details
   */
  async validateConnection(agent: IAgent): Promise<[boolean, string?]> {
    if (!agent || !agent.config) {
      return [false, 'Invalid agent or agent configuration'];
    }

    try {
      let isValid: boolean;
      switch (agent.config.provider) {
        case 'openai':
          isValid = await this.validateOpenAIConnection(agent);
          return [isValid, isValid ? undefined : 'Failed to validate OpenAI connection'];
        case 'anthropic':
          isValid = await this.validateAnthropicConnection(agent);
          return [isValid, isValid ? undefined : 'Failed to validate Anthropic connection'];
        case 'ollama':
          isValid = await this.validateOllamaConnection(agent);
          return [isValid, isValid ? undefined : 'Failed to validate Ollama connection'];
        case 'custom':
          isValid = await this.validateCustomConnection(agent);
          return [isValid, isValid ? undefined : 'Failed to validate custom connection'];
        default:
          const errorMsg = `Unsupported provider: ${agent.config.provider}`;
          console.warn(errorMsg);
          return [false, errorMsg];
      }
    } catch (error) {
      let errorMsg = 'Connection validation failed';

      if (error instanceof ChatBridgeError) {
        errorMsg = error.message;
        if (error.suggestedFix) {
          errorMsg += `\nSuggestion: ${error.suggestedFix}`;
        }
      } else if (error instanceof Error) {
        errorMsg = error.message;
      }

      console.error('Connection validation error:', error);
      return [false, errorMsg];
    }
  }

  /**
   * Inject personality content into messages
   */
  private async injectPersonality(messages: ChatMessage[]): Promise<ChatMessage[]> {
    try {
      // Get current workspace
      const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;

      // Get personality content for prompt injection
      const personalityContent = await getPersonalityForPrompt(workspaceUri);

      // Find the first system message or create one
      const messagesWithPersonality = [...messages];
      const systemMessageIndex = messagesWithPersonality.findIndex(msg => msg.role === 'system');

      if (systemMessageIndex >= 0) {
        // Append personality to existing system message
        messagesWithPersonality[systemMessageIndex] = {
          ...messagesWithPersonality[systemMessageIndex],
          content: messagesWithPersonality[systemMessageIndex].content + personalityContent
        };
      } else {
        // Create new system message with personality
        messagesWithPersonality.unshift({
          role: 'system',
          content: `You are a helpful coding assistant.${personalityContent}`,
          timestamp: new Date()
        });
      }

      return messagesWithPersonality;
    } catch (error) {
      // If personality injection fails, return original messages
      console.warn('Failed to inject personality:', error);
      return messages;
    }
  }

  private async sendOpenAIMessage(
    agent: IAgent,
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const endpoint = agent.config.endpoint || 'https://api.openai.com/v1/chat/completions';
    const headers = this.getOpenAIHeaders(agent.config);

    // Add available tools to the request if tools are enabled
    const enhancedOptions = await this.addAvailableTools(agent, options);
    const body = this.buildOpenAIRequestBody(agent, messages, enhancedOptions);

    return this.executeWithRetry(async () => {
      const response = await this.makeHttpRequest(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        timeout: options?.timeout || agent.config.timeout || this.httpTimeout
      });

      const chatResponse = await this.parseOpenAIResponse(response);

      // Handle tool calls if present
      if (chatResponse.finishReason === 'tool_calls' && chatResponse.toolCalls) {
        return await this.handleToolCalls(agent, messages, chatResponse, options);
      }

      return chatResponse;
    }, 3, 1000);
  }

  private async streamOpenAIMessage(
    agent: IAgent,
    messages: ChatMessage[],
    callback: StreamCallback,
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const endpoint = agent.config.endpoint || 'https://api.openai.com/v1/chat/completions';
    const headers = this.getOpenAIHeaders(agent.config);
    const body = this.buildOpenAIRequestBody(agent, messages, { ...options, stream: true });

    let streamedContent = '';
    const wrappedCallback: StreamCallback = (chunk, isComplete) => {
      streamedContent += chunk;
      callback(chunk, isComplete);
    };

    await this.makeStreamingRequest(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: options?.timeout || agent.config.timeout || this.httpTimeout
    }, wrappedCallback, 'openai');

    return {
      success: true,
      content: streamedContent,
      finishReason: 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        provider: 'openai',
        model: agent.config.model,
        streaming: true
      }
    };
  }

  private async sendOllamaMessage(
    agent: IAgent,
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const endpoint = `${agent.config.endpoint || 'http://localhost:11434'}/api/chat`;
    const headers = { 'Content-Type': 'application/json' };
    const body = this.buildOllamaRequestBody(agent, messages, options);

    const response = await this.makeHttpRequest(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: options?.timeout || agent.config.timeout || this.httpTimeout
    });

    return this.parseOllamaResponse(response);
  }

  private async streamOllamaMessage(
    agent: IAgent,
    messages: ChatMessage[],
    callback: StreamCallback,
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const endpoint = `${agent.config.endpoint || 'http://localhost:11434'}/api/chat`;
    const headers = { 'Content-Type': 'application/json' };
    const body = this.buildOllamaRequestBody(agent, messages, { ...options, stream: true });

    let streamedContent = '';
    const wrappedCallback: StreamCallback = (chunk, isComplete) => {
      streamedContent += chunk;
      callback(chunk, isComplete);
    };

    await this.makeStreamingRequest(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: options?.timeout || agent.config.timeout || this.httpTimeout
    }, wrappedCallback, 'ollama');

    return {
      success: true,
      content: streamedContent,
      finishReason: 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        provider: 'ollama',
        model: agent.config.model,
        streaming: true
      }
    };
  }

  private async sendCustomMessage(
    agent: IAgent,
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    if (!agent.config.endpoint) {
      throw new ChatBridgeError(
        'Custom provider requires endpoint configuration',
        'MISSING_ENDPOINT',
        'custom'
      );
    }

    const headers = this.getCustomHeaders(agent.config);
    const body = this.buildOpenAIRequestBody(agent, messages, options); // Use OpenAI format for compatibility

    const response = await this.makeHttpRequest(agent.config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: options?.timeout || agent.config.timeout || this.httpTimeout
    });

    return this.parseOpenAIResponse(response); // Assume OpenAI-compatible response format
  }

  private async sendAnthropicMessage(
    agent: IAgent,
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const endpoint = agent.config.endpoint || 'https://api.anthropic.com/v1/messages';
    const headers = this.getAnthropicHeaders(agent.config);
    const body = this.buildAnthropicRequestBody(agent, messages, options);

    return this.executeWithRetry(async () => {
      const response = await this.makeHttpRequest(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        timeout: options?.timeout || agent.config.timeout || this.httpTimeout
      });

      return this.parseAnthropicResponse(response);
    }, 3, 1000);
  }

  private async streamCustomMessage(
    agent: IAgent,
    messages: ChatMessage[],
    callback: StreamCallback,
    options?: ChatOptions
  ): Promise<ChatResponse> {
    if (!agent.config.endpoint) {
      throw new ChatBridgeError(
        'Custom provider requires endpoint configuration',
        'MISSING_ENDPOINT',
        'custom'
      );
    }

    const headers = this.getCustomHeaders(agent.config);
    const body = this.buildOpenAIRequestBody(agent, messages, { ...options, stream: true });

    let streamedContent = '';
    const wrappedCallback: StreamCallback = (chunk, isComplete) => {
      streamedContent += chunk;
      callback(chunk, isComplete);
    };

    await this.makeStreamingRequest(agent.config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: options?.timeout || agent.config.timeout || this.httpTimeout
    }, wrappedCallback, 'openai'); // Use OpenAI streaming format

    return {
      success: true,
      content: streamedContent,
      finishReason: 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        provider: 'custom',
        model: agent.config.model,
        streaming: true
      }
    };
  }

  private async streamAnthropicMessage(
    agent: IAgent,
    messages: ChatMessage[],
    callback: StreamCallback,
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const endpoint = agent.config.endpoint || 'https://api.anthropic.com/v1/messages';
    const headers = this.getAnthropicHeaders(agent.config);
    const body = this.buildAnthropicRequestBody(agent, messages, { ...options, stream: true });

    let streamedContent = '';
    const wrappedCallback: StreamCallback = (chunk, isComplete) => {
      streamedContent += chunk;
      callback(chunk, isComplete);
    };

    await this.makeStreamingRequest(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: options?.timeout || agent.config.timeout || this.httpTimeout
    }, wrappedCallback, 'anthropic');

    return {
      success: true,
      content: streamedContent,
      finishReason: 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      },
      metadata: {
        provider: 'anthropic',
        model: agent.config.model,
        streaming: true
      }
    };
  }

  /**
   * Validates the connection to the OpenAI API
   * @param agent The agent with OpenAI configuration
   * @returns A boolean indicating if the connection is valid
   * @throws {ChatBridgeError} If there's a validation error with details
   */
  private async validateOpenAIConnection(agent: IAgent): Promise<boolean> {
    const endpoint = `${agent.config.endpoint || 'https://api.openai.com'}/v1/models`;
    const headers = this.getOpenAIHeaders(agent.config);

    try {
      const response = await this.makeHttpRequest(endpoint, {
        method: 'GET',
        headers,
        timeout: 10000 // 10 seconds for validation
      });

      // Check for successful response (2xx)
      if (response.status >= 200 && response.status < 300) {
        return true;
      }

      // Handle 401 Unauthorized (invalid API key)
      if (response.status === 401) {
        throw new ChatBridgeError(
          'Invalid OpenAI API key provided',
          'INVALID_API_KEY',
          'openai',
          response.status,
          undefined,
          'Please verify your OpenAI API key in the extension settings.'
        );
      }

      // Handle 404 Not Found (invalid endpoint)
      if (response.status === 404) {
        throw new ChatBridgeError(
          'Invalid OpenAI API endpoint',
          'INVALID_ENDPOINT',
          'openai',
          response.status,
          undefined,
          'Please verify the OpenAI API endpoint in the extension settings.'
        );
      }

      // Handle other 4xx/5xx errors
      if (response.status >= 400) {
        let errorMessage = `API request failed with status ${response.status}`;
        try {
          // Define the expected error response shape
          interface ErrorResponse {
            error?: {
              message?: string;
              code?: string;
            };
          }

          const errorData = await response.json() as ErrorResponse;
          if (errorData?.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch (e) {
          // Ignore JSON parse errors
        }

        throw new ChatBridgeError(
          errorMessage,
          'API_REQUEST_FAILED',
          'openai',
          response.status,
          undefined,
          'Please check your network connection and API configuration.'
        );
      }

      return false;
    } catch (error) {
      // Re-throw ChatBridgeError as is
      if (error instanceof ChatBridgeError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        // Handle common network errors
        if (errorMessage.includes('fetch failed') || errorMessage.includes('networkerror')) {
          throw new ChatBridgeError(
            'Network error while connecting to OpenAI API',
            'NETWORK_ERROR',
            'openai',
            undefined,
            undefined,
            'Please check your internet connection and try again.'
          );
        }

        // Handle timeouts
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          throw new ChatBridgeError(
            'Connection to OpenAI API timed out',
            'TIMEOUT',
            'openai',
            408,
            undefined,
            'Please check your network connection and try again. You may need to increase the timeout in the settings.'
          );
        }
      }

      // Fallback for unknown errors
      throw new ChatBridgeError(
        `Failed to validate OpenAI connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'VALIDATION_FAILED',
        'openai'
      );
    }
  }

  /**
   * Validates the connection to the Anthropic API
   * @param agent The agent with Anthropic configuration
   * @returns A boolean indicating if the connection is valid
   * @throws {ChatBridgeError} If there's a validation error with details
   */
  private async validateAnthropicConnection(agent: IAgent): Promise<boolean> {
    const endpoint = agent.config.endpoint || 'https://api.anthropic.com/v1/messages';
    const headers = this.getAnthropicHeaders(agent.config);

    // Minimal test request to validate the API key
    const testBody = {
      model: agent.config.model || 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'test' }]
    };

    try {
      const response = await this.makeHttpRequest(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(testBody),
        timeout: 10000 // 10 second timeout for validation
      });

      // Handle successful response (2xx)
      if (response.status >= 200 && response.status < 300) {
        return true;
      }

      // Handle 401 Unauthorized (invalid API key)
      if (response.status === 401) {
        throw new ChatBridgeError(
          'Invalid Anthropic API key provided',
          'INVALID_API_KEY',
          'anthropic',
          response.status,
          undefined,
          'Please verify your Anthropic API key in the extension settings.'
        );
      }

      // Handle 404 Not Found (invalid endpoint)
      if (response.status === 404) {
        throw new ChatBridgeError(
          'Invalid Anthropic API endpoint',
          'INVALID_ENDPOINT',
          'anthropic',
          response.status,
          undefined,
          'Please verify the Anthropic API endpoint in the extension settings.'
        );
      }

      // Handle other 4xx/5xx errors
      if (response.status >= 400) {
        let errorMessage = `API request failed with status ${response.status}`;
        try {
          const errorData = await response.json() as Record<string, any>;
          if (errorData?.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch (e) {
          // Ignore JSON parse errors
        }

        throw new ChatBridgeError(
          errorMessage,
          'API_REQUEST_FAILED',
          'anthropic',
          response.status,
          undefined,
          'Please check your network connection and API configuration.'
        );
      }

      return false;
    } catch (error) {
      // Re-throw ChatBridgeError as is
      if (error instanceof ChatBridgeError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        // Handle common network errors
        if (errorMessage.includes('fetch failed') || errorMessage.includes('networkerror')) {
          throw new ChatBridgeError(
            'Network error while connecting to Anthropic API',
            'NETWORK_ERROR',
            'anthropic',
            undefined,
            undefined,
            'Please check your internet connection and try again.'
          );
        }

        // Handle timeouts
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          throw new ChatBridgeError(
            'Connection to Anthropic API timed out',
            'TIMEOUT',
            'anthropic',
            408,
            undefined,
            'Please check your network connection and try again. You may need to increase the timeout in the settings.'
          );
        }
      }

      // Fallback for unknown errors
      throw new ChatBridgeError(
        `Failed to validate Anthropic connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'VALIDATION_FAILED',
        'anthropic'
      );
    }
  }

  private async validateOllamaConnection(agent: IAgent): Promise<boolean> {
    const endpoint = `${agent.config.endpoint || 'http://localhost:11434'}/api/tags`;

    try {
      const response = await this.makeHttpRequest(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      if (response.status >= 200 && response.status < 300) {
        const data = await response.json() as OllamaModelsResponse;
        // Check if the specified model is available
        return data.models?.some((model: any) => model.name === agent.config.model) || false;
      }

      // Handle non-2xx responses
      throw new ChatBridgeError(
        `Ollama API returned status ${response.status}`,
        'API_ERROR',
        'ollama',
        response.status,
        undefined,
        'Please check your Ollama server is running and accessible.'
      );
    } catch (error) {
      // Re-throw ChatBridgeError as is
      if (error instanceof ChatBridgeError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        // Handle connection refused (Ollama not running)
        if (errorMessage.includes('econnrefused') || errorMessage.includes('connection refused')) {
          throw new ChatBridgeError(
            'Could not connect to Ollama server',
            'CONNECTION_REFUSED',
            'ollama',
            undefined,
            undefined,
            'Please make sure Ollama is running and accessible at the specified endpoint.'
          );
        }

        // Handle timeouts
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          throw new ChatBridgeError(
            'Connection to Ollama server timed out',
            'TIMEOUT',
            'ollama',
            408,
            undefined,
            'Please check your Ollama server is running and accessible.'
          );
        }
      }

      // Fallback for unknown errors
      throw new ChatBridgeError(
        `Failed to validate Ollama connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'VALIDATION_FAILED',
        'ollama'
      );
    }
  }

  /**
   * Validates the connection to a custom LLM provider
   * @param agent The agent with custom configuration
   * @returns A boolean indicating if the connection is valid
   * @throws {ChatBridgeError} If there's a validation error with details
   */
  private async validateCustomConnection(agent: IAgent): Promise<boolean> {
    if (!agent.config.endpoint) {
      throw new ChatBridgeError(
        'No endpoint configured for custom LLM provider',
        'MISSING_ENDPOINT',
        'custom',
        undefined,
        undefined,
        'Please configure an endpoint for the custom LLM provider in the extension settings.'
      );
    }

    try {
      // Try a simple test message to validate the connection
      const testMessages: ChatMessage[] = [
        { role: 'user', content: 'test' }
      ];

      await this.sendCustomMessage(agent, testMessages, { maxTokens: 1 });
      return true;
    } catch (error) {
      // Re-throw ChatBridgeError as is
      if (error instanceof ChatBridgeError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        // Handle common network errors
        if (errorMessage.includes('fetch failed') || errorMessage.includes('networkerror')) {
          throw new ChatBridgeError(
            'Network error while connecting to custom LLM provider',
            'NETWORK_ERROR',
            'custom',
            undefined,
            undefined,
            'Please check your internet connection and try again.'
          );
        }

        // Handle timeouts
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          throw new ChatBridgeError(
            'Connection to custom LLM provider timed out',
            'TIMEOUT',
            'custom',
            408,
            undefined,
            'Please check your network connection and try again. You may need to increase the timeout in the settings.'
          );
        }

        // Handle connection refused
        if (errorMessage.includes('econnrefused') || errorMessage.includes('connection refused')) {
          throw new ChatBridgeError(
            'Could not connect to the custom LLM provider',
            'CONNECTION_REFUSED',
            'custom',
            undefined,
            undefined,
            'Please verify the endpoint URL and ensure the service is running and accessible.'
          );
        }
      }

      // Fallback for unknown errors
      throw new ChatBridgeError(
        `Failed to validate custom LLM connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'VALIDATION_FAILED',
        'custom'
      );
    }
  }

  private getOpenAIHeaders(config: AgentConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    return headers;
  }

  private getCustomHeaders(config: AgentConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    return headers;
  }

  private buildOpenAIRequestBody(agent: IAgent, messages: ChatMessage[], options?: ChatOptions): any {
    const body: any = {
      model: agent.config.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: options?.temperature ?? agent.config.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? agent.config.maxTokens,
      stream: options?.stream ?? false
    };

    // Add tools if available
    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = 'auto'; // Let the model decide when to use tools
    }

    return body;
  }

  private buildOllamaRequestBody(agent: IAgent, messages: ChatMessage[], options?: ChatOptions): any {
    return {
      model: agent.config.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      stream: options?.stream ?? false,
      options: {
        temperature: options?.temperature ?? agent.config.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? agent.config.maxTokens
      }
    };
  }

  private getAnthropicHeaders(config: AgentConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    };

    if (config.apiKey) {
      headers['x-api-key'] = config.apiKey;
    }

    return headers;
  }

  private buildAnthropicRequestBody(agent: IAgent, messages: ChatMessage[], options?: ChatOptions): any {
    // Separate system messages from conversation messages
    const systemMessages = messages.filter(msg => msg.role === 'system');
    const conversationMessages = messages.filter(msg => msg.role !== 'system');

    // Combine system messages into a single system parameter
    const systemContent = systemMessages.map(msg => msg.content).join('\n\n');

    const body: any = {
      model: agent.config.model,
      max_tokens: options?.maxTokens ?? agent.config.maxTokens ?? 4096,
      messages: conversationMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };

    // Add system parameter if we have system content
    if (systemContent) {
      body.system = systemContent;
    }

    // Add optional parameters
    if (options?.temperature !== undefined || agent.config.temperature !== undefined) {
      body.temperature = options?.temperature ?? agent.config.temperature ?? 0.7;
    }

    return body;
  }

  /**
   * Makes an HTTP request with streaming support and memory monitoring
   */
  /**
   * Makes an HTTP request with streaming support and memory monitoring
   * @param url The endpoint URL to make the request to
   * @param options Request configuration options
   * @param callback Callback function to handle streaming chunks
   * @param format The format of the streaming response (openai, ollama, anthropic)
   * @throws {ChatBridgeError} If there's an error during the streaming request
   */
  /**
   * Makes an HTTP request with streaming support and memory monitoring
   * @param url The endpoint URL to make the request to
   * @param options Request configuration options
   * @param callback Callback function to handle streaming chunks
   * @param format The format of the streaming response (openai, ollama, anthropic)
   * @throws {ChatBridgeError} If there's an error during the streaming request
   */


  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
        }
      }
    }

    throw new ChatBridgeError(
      `Failed after ${maxRetries} retries: ${lastError?.message}`,
      'MAX_RETRIES_EXCEEDED',
      'openai',
      undefined,
      undefined,
      undefined,
      undefined,
      false,
      lastError
    );
  }

  private parseStreamChunk(chunk: string, format: 'openai' | 'ollama' | 'anthropic'): string | null {
    try {
      if (!chunk.trim()) return null;

      if (format === 'openai') {
        if (chunk.startsWith('data: ')) {
          const data = chunk.slice(6).trim();
          if (data === '[DONE]') return null;
          try {
            const parsed = JSON.parse(data);
            return parsed.choices?.[0]?.delta?.content || '';
          } catch (e) {
            return null;
          }
        }
      } else if (format === 'anthropic') {
        // Handle Anthropic's streaming format
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return null;
            try {
              const parsed = JSON.parse(data);
              return parsed.completion || '';
            } catch (e) {
              return null;
            }
          }
        }
      } else if (format === 'ollama') {
        // Handle Ollama's streaming format
        try {
          const parsed = JSON.parse(chunk);
          return parsed.response || '';
        } catch (e) {
          return null;
        }
      }

      return null;
    } catch (error) {
      console.error('Error parsing stream chunk', { error, chunk });
      return null;
    }
  }



  private async makeStreamingRequest(
    url: string,
    options: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      headers: Record<string, string>;
      body?: string;
      timeout: number;
    },
    callback: StreamCallback,
    format: 'openai' | 'ollama' | 'anthropic'
  ): Promise<void> {
    // Check if we're in web environment and should simulate streaming
    if (WebCompatibility.isWeb()) {
      try {
        // Make a regular HTTP request and simulate streaming
        const response = await this.makeHttpRequest(url, options);
        const responseText = await response.text();
        const parsedResponse = JSON.parse(responseText);
        
        // Extract content based on format
        let content = '';
        if (format === 'openai' && parsedResponse.choices?.[0]?.message?.content) {
          content = parsedResponse.choices[0].message.content;
        } else if (format === 'ollama' && parsedResponse.message?.content) {
          content = parsedResponse.message.content;
        } else if (format === 'anthropic' && parsedResponse.content?.[0]?.text) {
          content = parsedResponse.content[0].text;
        }
        
        // Simulate streaming with the content
        await this.simulateStreaming(content, callback, {
          chunkSize: 10,
          delay: 50,
          wordBoundary: true
        });
        
        return;
      } catch (error) {
        // If simulation fails, fall back to regular streaming
        console.warn('Streaming simulation failed, falling back to regular streaming:', error);
      }
    }

    // Initialize tracking variables
    let controller: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let receivedBytes = 0;
    let receivedChunks = 0;
    let responseSize = 0;
    let isComplete = false;
    const startTime = Date.now();
    let response: Response | null = null;
    // Validate input parameters
    if (!url) {
      throw new ChatBridgeError('URL is required', 'invalid_parameters', format as LLMProvider);
    }

    if (!callback || typeof callback !== 'function') {
      throw new ChatBridgeError('Callback function is required', 'invalid_parameters', format as LLMProvider);
    }

    try {
      // Create abort controller for request timeout
      controller = new AbortController();

      // Set up timeout
      timeoutId = setTimeout(() => {
        controller?.abort(new ChatBridgeError(
          `Request timed out after ${options.timeout}ms`,
          'timeout',
          format as LLMProvider
        ));
      }, options.timeout);

      // Make the HTTP request
      response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal
      });

      // Clear the timeout since we got a response
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      // Check for non-OK status
      if (!response.ok) {
        await this.parseErrorResponse(response);
      }

      // Check for response body
      if (!response.body) {
        throw new ChatBridgeError(
          'Empty response body',
          'empty_response',
          format as LLMProvider
        );
      }

      // Process the streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let lastMemoryCheck = Date.now();
      const memoryCheckInterval = 5000; // 5 seconds

      // Process each chunk of data
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          isComplete = true;
          break;
        }

        // Update received bytes and chunks
        receivedBytes += value.length;
        receivedChunks++;

        // Check memory usage periodically
        const now = Date.now();
        if (now - lastMemoryCheck > memoryCheckInterval) {
          this.checkMemoryUsage();
          lastMemoryCheck = now;
        }

        // Decode and process the chunk
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === '') continue;

          try {
            const content = this.parseStreamChunk(line, format);
            if (content !== null) {
              await callback(content, false);
            }
          } catch (error) {
            console.error('Error processing stream chunk', {
              error: error instanceof Error ? error.message : String(error),
              line,
              format
            });
            // Continue processing other lines even if one fails
          }
        }
      }

      // Process any remaining data in the buffer
      if (buffer.trim()) {
        try {
          const content = this.parseStreamChunk(buffer, format);
          if (content !== null) {
            await callback(content, false);
          }
        } catch (error) {
          console.error('Error processing final buffer', {
            error: error instanceof Error ? error.message : String(error),
            buffer,
            format
          });
        }
      }

      // Signal completion
      await callback('', true);
      isComplete = true;

    } catch (error) {
      // Handle errors
      if (!isComplete) {
        if (error instanceof ChatBridgeError) {
          throw error;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ChatBridgeError(
          `Streaming request failed: ${errorMessage}`,
          'streaming_error',
          format as LLMProvider
        );
      }
    } finally {
      // Clean up resources
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Log completion
      console.info('Streaming request completed', {
        url,
        method: options.method,
        status: response?.status,
        receivedBytes,
        receivedChunks,
        duration: Date.now() - startTime
      });
    }

    // Track memory usage at the start
    let buffer = '';
    const initialMemory = this.getMemoryUsage();
    let lastChunkTime = Date.now();

    // Monitor memory usage periodically
    const memoryMonitor = setInterval(() => {
      const mem = this.getMemoryUsage();
      if (mem.percentage > this.MEMORY_THRESHOLD) {
        console.warn(`High memory usage: ${mem.percentage}% (${mem.usedMB}MB/${mem.totalMB}MB)`);
      }
    }, this.MEMORY_CHECK_INTERVAL);

    // Clean up resources
    const cleanup = () => {
      clearInterval(memoryMonitor);
      if (timeoutId) clearTimeout(timeoutId);
      if (controller && !controller.signal.aborted) {
        try {
          controller.abort();
        } catch (e) {
          console.warn('Failed to abort controller:', e);
        }
      }
    };

    try {
      // Create abort controller for the fetch request
      controller = new AbortController();

      // Set up timeout
      if (options.timeout > 0) {
        timeoutId = setTimeout(() => {
          controller?.abort();
        }, options.timeout);
      }

      // Make the fetch request
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new ChatBridgeError(
          `Request failed with status ${response.status}: ${errorText}`,
          'REQUEST_FAILED',
          format as LLMProvider,
          response.status
        );
      }

      if (!response.body) {
        throw new ChatBridgeError(
          'Response body is null',
          'EMPTY_RESPONSE',
          format as LLMProvider
        );
      }

      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Update tracking variables
        receivedChunks++;
        receivedBytes += value?.byteLength || 0;
        responseSize += value?.byteLength || 0;
        lastChunkTime = Date.now();

        // Check response size limit
        if (responseSize > this.MAX_RESPONSE_SIZE) {
          throw new ChatBridgeError(
            `Response size limit exceeded (${this.MAX_RESPONSE_SIZE / 1024 / 1024}MB)`,
            'RESPONSE_SIZE_LIMIT_EXCEEDED',
            format as LLMProvider
          );
        }

        // Process the chunk
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line) {
            const content = this.parseStreamChunk(line, format);
            if (content !== null) {
              callback(content, false);
            }
          }
        }

        // Check memory usage periodically
        if (receivedChunks % this.MEMORY_CHECK_CHUNK_COUNT === 0 ||
          responseSize % this.MEMORY_CHECK_SIZE === 0) {
          const currentMemory = this.getMemoryUsage();

          if (currentMemory.percentage > this.MEMORY_THRESHOLD) {
            throw new ChatBridgeError(
              `High memory usage detected (${currentMemory.percentage}%). Aborting to prevent memory exhaustion.`,
              'MEMORY_LIMIT_EXCEEDED',
              format as LLMProvider
            );
          }
        }

        // Check for timeout in chunk processing
        if (Date.now() - lastChunkTime > this.CHUNK_PROCESSING_TIMEOUT) {
          throw new ChatBridgeError(
            'Stream processing timeout',
            'STREAM_TIMEOUT',
            format as LLMProvider
          );
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        const content = this.parseStreamChunk(buffer, format);
        if (content !== null) {
          callback(content, false);
        }
      }

      // Signal completion
      isComplete = true;
      callback('', true);

      // Log final memory usage
      const finalMemory = this.getMemoryUsage();
      console.log(`Stream completed. Memory delta: ${finalMemory.usedMB - initialMemory.usedMB}MB`);

    } catch (error) {
      // Handle errors
      if (!isComplete) {
        if (error instanceof ChatBridgeError) {
          throw error;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorContext: ErrorContext = {
          provider: format as LLMProvider,
          operation: 'streaming_request',
          retryCount: 0,
          timestamp: new Date()
        };

        let errorToThrow: ChatBridgeError;
        const errorStr = errorMessage.toLowerCase();

        if (errorStr.includes('aborted') || errorStr.includes('cancel')) {
          errorToThrow = new ChatBridgeError(
            'Request was aborted',
            'ABORTED',
            format as LLMProvider,
            undefined,
            undefined,
            'The request was cancelled by the user or due to a timeout',
            errorContext
          );
        } else if (errorStr.includes('network')) {
          errorToThrow = new ChatBridgeError(
            'Network error occurred',
            'NETWORK_ERROR',
            format as LLMProvider,
            undefined,
            undefined,
            'Please check your internet connection and try again',
            errorContext,
            true // retryable
          );
        } else {
          errorToThrow = new ChatBridgeError(
            `Streaming request failed: ${errorMessage}`,
            'STREAM_ERROR',
            format as LLMProvider,
            undefined,
            undefined,
            'An error occurred while processing the stream',
            errorContext,
            false,
            error instanceof Error ? error : undefined
          );
        }

        throw errorToThrow;
      }
    } finally {
      cleanup();
    }
  }

  private async makeHttpRequest(url: string, options: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeout: number;
  }): Promise<Response> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      // Check web accessibility before making request
      if (WebCompatibility.isWeb() && !WebNetworkUtils.isWebAccessible(url)) {
        throw new ChatBridgeError(
          `URL ${url} is not accessible in VS Code web environment due to CORS restrictions`,
          'WEB_CORS_ERROR',
          'openai' as LLMProvider
        );
      }

      // Create a promise that rejects on timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new ChatBridgeError(
            `Request timeout after ${options.timeout}ms`,
            'TIMEOUT',
            'openai' as LLMProvider,
            undefined,
            undefined,
            'Try increasing the timeout value or check your network connection'
          ));
        }, options.timeout);
      });

      // Make the actual fetch request
      const fetchPromise = fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: AbortSignal.timeout(options.timeout)
      });

      // Race the fetch against the timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]);

      // Clear timeout if request completed
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      return response;

    } catch (error) {
      // Clear timeout on error
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (error instanceof ChatBridgeError) {
        throw error;
      }

      // Create a detailed error context for unhandled errors
      const errorContext: ErrorContext = {
        provider: 'openai' as LLMProvider,
        operation: 'http_request',
        retryCount: 0,
        timestamp: new Date(),
        errorType: error instanceof Error ? error.name : 'UnknownError',
        responseText: error instanceof Error ? error.message : String(error)
      };

      // Create an appropriate error
      let errorToThrow: ChatBridgeError;

      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        if (errorMessage.includes('abort') || errorMessage.includes('cancel')) {
          errorToThrow = new ChatBridgeError(
            'Request was cancelled',
            'CANCELLED',
            'openai' as LLMProvider,
            undefined,
            undefined,
            'The request was cancelled by the user or due to a timeout',
            errorContext
          );
        } else if (errorMessage.includes('timeout')) {
          errorToThrow = new ChatBridgeError(
            'Request timed out',
            'TIMEOUT',
            'openai' as LLMProvider,
            undefined,
            undefined,
            'The request took too long to complete. Try increasing the timeout value.',
            errorContext,
            true // retryable
          );
        } else if (errorMessage.includes('network')) {
          errorToThrow = new ChatBridgeError(
            'Network error',
            'NETWORK_ERROR',
            'openai' as LLMProvider,
            undefined,
            undefined,
            'Please check your internet connection and try again',
            errorContext,
            true // retryable
          );
        } else {
          // Generic error
          errorToThrow = new ChatBridgeError(
            `Request failed: ${error.message}`,
            'REQUEST_FAILED',
            'openai' as LLMProvider,
            undefined,
            undefined,
            'An error occurred while making the request',
            errorContext
          );
        }
      } else {
        // Non-Error object thrown
        errorToThrow = new ChatBridgeError(
          `Request failed: ${String(error)}`,
          'REQUEST_FAILED',
          'openai' as LLMProvider,
          undefined,
          undefined,
          'An unknown error occurred',
          errorContext
        );
      }

      throw errorToThrow;
    }
  }



  private async parseErrorResponse(response: Response): Promise<never> {
    let errorData: any = {};

    try {
      const responseText = await response.text();
      if (responseText) {
        errorData = JSON.parse(responseText);
      }
    } catch (parseError) {
      // If we can't parse the error response, use the status text
      errorData = { message: response.statusText || 'Unknown error' };
    }

    const errorMessage = errorData?.error?.message || errorData?.message || 'Unknown error';
    const errorCode = errorData?.error?.code || errorData?.code || 'UNKNOWN_ERROR';
    const statusCode = response.status;

    // Create error context for better debugging
    const errorContext: ErrorContext = {
      provider: 'openai',
      operation: 'http_request',
      retryCount: 0,
      timestamp: new Date()
    };

    // Map common HTTP status codes to more specific error types
    if (statusCode === 401) {
      throw new ChatBridgeError(
        'Authentication failed. Please check your API key and permissions.',
        'AUTHENTICATION_ERROR',
        'openai',
        statusCode,
        undefined,
        'Check your API key and ensure it has the correct permissions.',
        errorContext
      );
    } else if (statusCode === 429) {
      // Extract retry-after header if available
      const retryAfter = response.headers.get('retry-after');
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;

      throw new ChatBridgeError(
        'Rate limit exceeded. Please try again later.',
        'RATE_LIMIT_EXCEEDED',
        'openai',
        statusCode,
        retryAfterMs,
        'Wait for rate limits to reset or upgrade your plan for higher limits.',
        errorContext,
        true // retryable
      );
    } else if (statusCode >= 500) {
      throw new ChatBridgeError(
        'Server error. Please try again later.',
        'SERVER_ERROR',
        'openai',
        statusCode,
        undefined,
        'The server encountered an error. Please try again later.',
        errorContext,
        true // retryable
      );
    } else {
      // Generic error for other status codes
      throw new ChatBridgeError(
        `Request failed with status ${statusCode}: ${errorMessage}`,
        errorCode,
        'openai',
        statusCode,
        undefined,
        'An unexpected error occurred while making the request.',
        errorContext
      );
    }
  }

  // Cleanup method kept for future use
  // @ts-ignore - TS6133: 'cleanup' is declared but its value is never read
  private cleanup(): void {
    // Clean up any resources, timeouts, intervals, etc.
    // This method is called when the chat bridge is being disposed
    console.debug('Cleaning up chat bridge resources');
    // Add any additional cleanup logic here
  }

  /**
   * Check if an error is retryable
   */
  // Retry logic kept for future use
  // @ts-ignore - TS6133: 'isRetryableError' is declared but its value is never read
  private isRetryableError(error: ChatBridgeError): boolean {
    if (Boolean((error as any).retryable)) return true;
    if (error.code === 'NETWORK_ERROR') return true;
    if (error.code === 'TIMEOUT') return true;
    if (error.code === 'RATE_LIMIT_EXCEEDED') return true;
    if (error.statusCode && error.statusCode >= 500) return true;
    return false;
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  // Backoff calculation kept for future use
  // @ts-ignore - TS6133: 'calculateBackoff' is declared but its value is never read
  private calculateBackoff(attempt: number, baseDelay: number): number {
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Delay helper function
   */
  // Delay helper kept for future use
  // @ts-ignore - TS6133: 'delay' is declared but its value is never read
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }



  /**
   * Simulate streaming by breaking content into chunks and sending them with delays
   * This provides a streaming-like experience in web environments where real streaming isn't available
   */
  // Simulate streaming kept for future use
  private async simulateStreaming(
    content: string,
    callback: StreamCallback,
    options: {
      chunkSize?: number;
      delay?: number;
      wordBoundary?: boolean;
      maxChunks?: number;
    } = {}
  ): Promise<void> {
    const chunkSize = Math.max(1, options.chunkSize || 50); // Ensure minimum chunk size
    const delay = Math.max(0, options.delay || 50); // Ensure non-negative delay
    const wordBoundary = options.wordBoundary !== false; // Default to true
    const maxChunks = options.maxChunks || 200; // Prevent infinite loops

    if (!content || content.length === 0) {
      callback('', true);
      return;
    }

    let position = 0;
    let chunkCount = 0;

    while (position < content.length && chunkCount < maxChunks) {
      let endPosition = Math.min(position + chunkSize, content.length);

      // If we're not at the end and word boundary is enabled, try to break at word boundaries
      if (wordBoundary && endPosition < content.length) {
        const lookAheadLength = Math.min(20, content.length - endPosition);
        const remainingText = content.slice(position, endPosition + lookAheadLength);

        const lastSpaceIndex = remainingText.lastIndexOf(' ');
        const lastNewlineIndex = remainingText.lastIndexOf('\n');
        const lastPunctuationIndex = Math.max(
          remainingText.lastIndexOf('.'),
          remainingText.lastIndexOf(','),
          remainingText.lastIndexOf(';'),
          remainingText.lastIndexOf('!'),
          remainingText.lastIndexOf('?')
        );

        // Use the best break point within our chunk size (but not too far back)
        const bestBreakPoint = Math.max(lastSpaceIndex, lastNewlineIndex, lastPunctuationIndex);
        const minAcceptablePosition = Math.floor(chunkSize * 0.6); // Don't go back more than 40%

        if (bestBreakPoint >= minAcceptablePosition && bestBreakPoint < remainingText.length) {
          endPosition = position + bestBreakPoint + 1;
        }
      }

      // Ensure we always make progress
      if (endPosition <= position) {
        endPosition = position + 1;
      }

      const chunk = content.slice(position, endPosition);
      const isComplete = endPosition >= content.length;

      try {
        callback(chunk, false);
      } catch (error) {
        // If callback throws, still signal completion to prevent hanging
        callback('', true);
        throw new ChatBridgeError(
          `Streaming callback error: ${error instanceof Error ? error.message : String(error)}`,
          'STREAMING_CALLBACK_ERROR',
          'openai' as LLMProvider
        );
      }

      position = endPosition;
      chunkCount++;

      // Add delay between chunks (except for the last chunk)
      if (!isComplete && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Handle case where we hit max chunks limit
    if (chunkCount >= maxChunks && position < content.length) {
      // Send remaining content as final chunk
      const remainingContent = content.slice(position);
      callback(remainingContent, false);
    }

    // Signal completion
    callback('', true);
  }

  private async parseOpenAIResponse(response: Response): Promise<ChatResponse> {
    try {
      const data = await response.json() as OpenAIResponse;

      if (data.error) {
        throw new ChatBridgeError(
          data.error.message || 'Unknown error from OpenAI',
          data.error.code || 'OPENAI_API_ERROR',
          'openai',
          response.status
        );
      }

      if (!data.choices || data.choices.length === 0) {
        throw new ChatBridgeError(
          'No choices returned from OpenAI',
          'NO_CHOICES',
          'openai',
          response.status
        );
      }

      const choice = data.choices[0];
      const content = choice.message?.content || '';
      const finishReason = this.mapOpenAIFinishReason(choice.finish_reason);

      // Handle tool calls if present
      let toolCalls: ChatToolCall[] = [];
      if (choice.message?.tool_calls?.length) {
        toolCalls = choice.message.tool_calls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          parameters: JSON.parse(tc.function.arguments || '{}')
        }));
      }

      return {
        success: true,
        content,
        finishReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        } : undefined,
        metadata: {
          model: data.model,
          id: (data as any).id,
          created: (data as any).created
        }
      };
    } catch (error) {
      if (error instanceof ChatBridgeError) {
        throw error;
      }

      // Handle JSON parsing errors
      if (error instanceof SyntaxError) {
        throw new ChatBridgeError(
          'Failed to parse OpenAI response',
          'INVALID_RESPONSE',
          'openai',
          response.status,
          undefined,
          'The response from OpenAI could not be parsed as JSON.',
          undefined,
          false,
          error
        );
      }

      // Re-throw other errors
      throw new ChatBridgeError(
        error instanceof Error ? error.message : 'Unknown error parsing OpenAI response',
        'PARSE_ERROR',
        'openai',
        response.status,
        undefined,
        'An error occurred while processing the response from OpenAI.',
        undefined,
        false,
        error
      );
    }

  }

  private async parseOllamaResponse(response: Response): Promise<ChatResponse> {
    try {
      const data = await response.json() as OllamaResponse;

      if (data.error) {
        throw new ChatBridgeError(
          data.error || 'Unknown error from Ollama',
          'OLLAMA_API_ERROR',
          'ollama',
          response.status
        );
      }

      // Ollama responses are simpler than OpenAI's
      const content = data.message?.content || '';

      // Ollama doesn't provide a direct equivalent to finish_reason
      // We'll use done flag if available, otherwise assume 'stop'
      const finishReason: 'stop' | 'length' | 'tool_calls' | 'error' = 'stop';

      return {
        success: true,
        content,
        finishReason,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        },
        metadata: {
          model: data.model,
          totalDuration: data.total_duration,
          loadDuration: data.load_duration,
          promptEvalDuration: data.prompt_eval_duration,
          evalDuration: data.eval_duration
        }
      };
    } catch (error) {
      if (error instanceof ChatBridgeError) {
        throw error;
      }

      // Handle JSON parsing errors
      if (error instanceof SyntaxError) {
        throw new ChatBridgeError(
          'Failed to parse Ollama response',
          'INVALID_RESPONSE',
          'ollama',
          response.status,
          undefined,
          'The response from Ollama could not be parsed as JSON.',
          undefined,
          false,
          error
        );
      }

      // Re-throw other errors
      throw new ChatBridgeError(
        error instanceof Error ? error.message : 'Unknown error parsing Ollama response',
        'PARSE_ERROR',
        'ollama',
        response.status,
        undefined,
        'An error occurred while processing the response from Ollama.',
        undefined,
        false,
        error
      );
    }

  }

  private async parseAnthropicResponse(response: Response): Promise<ChatResponse> {
    try {
      const data = await response.json() as any;

      if (data.error) {
        throw new ChatBridgeError(
          data.error.message || 'Unknown error from Anthropic',
          data.error.type || 'ANTHROPIC_API_ERROR',
          'anthropic',
          response.status
        );
      }

      // Anthropic's response structure is different from OpenAI's
      const content = data.content?.[0]?.text || '';

      // Map Anthropic's stop reason to our finish reason
      let finishReason: 'stop' | 'length' | 'tool_calls' | 'error' = 'stop';
      if (data.stop_reason === 'max_tokens') {
        finishReason = 'length';
      } else if (data.stop_reason === 'tool_use') {
        finishReason = 'tool_calls';
      } else if (data.stop_reason === 'error') {
        finishReason = 'error';
      }

      // Handle tool calls if present
      let toolCalls: ChatToolCall[] = [];
      if (data.content?.[0]?.type === 'tool_use') {
        toolCalls = data.content
          .filter((item: any) => item.type === 'tool_use')
          .map((toolUse: any) => ({
            id: toolUse.id,
            name: toolUse.name,
            parameters: toolUse.input || {}
          }));
      }

      return {
        success: true,
        content,
        finishReason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: data.usage ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
        } : undefined,
        metadata: {
          model: data.model,
          id: data.id,
          type: data.type,
          role: data.role
        }
      };
    } catch (error) {
      if (error instanceof ChatBridgeError) {
        throw error;
      }

      // Handle JSON parsing errors
      if (error instanceof SyntaxError) {
        throw new ChatBridgeError(
          'Failed to parse Anthropic response',
          'INVALID_RESPONSE',
          'anthropic',
          response.status,
          undefined,
          'The response from Anthropic could not be parsed as JSON.',
          undefined,
          false,
          error
        );
      }

      // Re-throw other errors
      throw new ChatBridgeError(
        error instanceof Error ? error.message : 'Unknown error parsing Anthropic response',
        'PARSE_ERROR',
        'anthropic',
        response.status,
        undefined,
        'An error occurred while processing the response from Anthropic.',
        undefined,
        false,
        error
      );
    }

  }

  private mapOpenAIFinishReason(reason: string | undefined): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'tool_calls': return 'tool_calls';
      default: return 'error';
    }
  }

  // Anthropic finish reason mapping kept for future use
  // @ts-ignore - TS6133: 'mapAnthropicFinishReason' is declared but its value is never read
  private mapAnthropicFinishReason(reason: string | undefined): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (reason) {
      case 'end_turn': return 'stop';
      case 'max_tokens': return 'length';
      case 'tool_use': return 'tool_calls';
      case 'stop_sequence': return 'stop';
      default: return 'error';
    }
  }







  /**
   * Validate request format before sending
   * @param messages Array of chat messages to validate
   * @param options Optional chat options to validate
   * @throws {ChatBridgeError} If validation fails
   */
  private validateRequest(messages: ChatMessage[], options?: ChatOptions): void {
    // Validate messages array
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new ChatBridgeError(
        'Messages array cannot be empty',
        'invalid_request',
        'openai'
      );
    }

    // Validate each message
    messages.forEach((message) => {
      if (!message || typeof message !== 'object') {
        throw new ChatBridgeError(
          'Invalid message format: message must be an object',
          'invalid_request',
          'openai'
        );
      }

      // Validate message role
      if (!message.role || !['system', 'user', 'assistant'].includes(message.role)) {
        throw new ChatBridgeError(
          `Invalid message role: ${message.role}. Must be 'system', 'user', or 'assistant'`,
          'invalid_request',
          'openai'
        );
      }

      // For non-function messages, content must be a non-empty string
      if (typeof message.content !== 'string') {
        throw new ChatBridgeError(
          'Invalid message content: content must be a string',
          'invalid_request',
          'openai'
        );
      }

      if (message.content.trim().length === 0) {
        throw new ChatBridgeError(
          'Invalid message content: content cannot be empty',
          'invalid_request',
          'openai'
        );
      }
    });

    // Validate options if provided
    if (options) {
      if (options.temperature !== undefined && (options.temperature < 0 || options.temperature > 2)) {
        throw new ChatBridgeError(
          'Invalid temperature: must be between 0 and 2',
          'invalid_request',
          'openai'
        );
      }

      if (options.maxTokens !== undefined && options.maxTokens <= 0) {
        throw new ChatBridgeError(
          'Invalid maxTokens: must be greater than 0',
          'invalid_request',
          'openai'
        );
      }

      if (options.timeout !== undefined && options.timeout <= 0) {
        throw new ChatBridgeError(
          'Invalid timeout: must be greater than 0',
          'invalid_request',
          'openai'
        );
      }
    }
  }



  /**
   * Add available tools to chat options based on agent configuration
   */
  private async addAvailableTools(agent: IAgent, options?: ChatOptions): Promise<ChatOptions> {
    // Check if tools are enabled for this agent
    const toolsEnabled = agent.config.tools?.enabled !== false; // Default to true if not specified

    if (!toolsEnabled || options?.tools) {
      return options || {};
    }

    try {
      // Create execution context for tool filtering
      const context: ExecutionContext = {
        agentId: agent.id,
        sessionId: 'chat-session', // TODO: Get actual session ID
        workspaceUri: vscode.workspace.workspaceFolders?.[0]?.uri,
        user: {
          id: 'current-user', // TODO: Get actual user ID
          permissions: agent.config.tools?.allowedTools || []
        },
        security: {
          level: agent.config.tools?.requireApproval ? SecurityLevel.NORMAL : SecurityLevel.ELEVATED,
          allowDangerous: agent.config.tools?.requireApproval !== true
        }
      };

      // Get available tools for this context
      const availableTools = this.toolManager.getAvailableTools(context);

      // Filter tools based on agent configuration
      const allowedTools = agent.config.tools?.allowedTools;
      const filteredTools = allowedTools
        ? availableTools.filter(tool => allowedTools.includes(tool.name))
        : availableTools;

      // Convert to ChatTool format
      const chatTools: ChatTool[] = filteredTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }));

      return {
        ...options,
        tools: chatTools.length > 0 ? chatTools : undefined
      };
    } catch (error) {
      console.warn('Failed to add available tools:', error);
      return options || {};
    }
  }

  /**
   * Handle tool calls from OpenAI response
   */
  private async handleToolCalls(
    agent: IAgent,
    originalMessages: ChatMessage[],
    response: ChatResponse,
    options?: ChatOptions
  ): Promise<ChatResponse> {
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return response;
    }

    try {
      // Create execution context
      const context: ExecutionContext = {
        agentId: agent.id,
        sessionId: 'chat-session', // TODO: Get actual session ID
        workspaceUri: vscode.workspace.workspaceFolders?.[0]?.uri,
        user: {
          id: 'current-user', // TODO: Get actual user ID
          permissions: agent.config.tools?.allowedTools || []
        },
        security: {
          level: agent.config.tools?.requireApproval ? SecurityLevel.NORMAL : SecurityLevel.ELEVATED,
          allowDangerous: agent.config.tools?.requireApproval !== true
        }
      };

      // Execute tool calls
      const toolResults = await this.toolManager.executeToolCalls(response.toolCalls, context);

      // Create new messages with assistant's tool calls and tool results
      const updatedMessages: ChatMessage[] = [
        ...originalMessages,
        {
          role: 'assistant',
          content: response.content,
          metadata: {
            toolCalls: response.toolCalls
          }
        }
      ];

      // Add tool results as separate messages
      for (const { call, result } of toolResults) {
        updatedMessages.push({
          role: 'user', // Tool results are sent as user messages in OpenAI format
          content: `Tool "${call.name}" result: ${result.success ? JSON.stringify(result.data) : `Error: ${result.error}`}`,
          metadata: {
            toolCallId: call.id,
            toolName: call.name,
            toolResult: result
          }
        });
      }

      // Make a follow-up request to get the final response
      const followUpResponse = await this.sendOpenAIMessage(agent, updatedMessages, {
        ...options,
        tools: undefined // Don't include tools in follow-up to avoid infinite loops
      });

      // Combine the responses
      return {
        success: followUpResponse.success,
        content: followUpResponse.content,
        finishReason: followUpResponse.finishReason,
        usage: {
          promptTokens: (response.usage?.promptTokens || 0) + (followUpResponse.usage?.promptTokens || 0),
          completionTokens: (response.usage?.completionTokens || 0) + (followUpResponse.usage?.completionTokens || 0),
          totalTokens: (response.usage?.totalTokens || 0) + (followUpResponse.usage?.totalTokens || 0)
        },
        toolCalls: response.toolCalls, // Keep original tool calls for reference
        metadata: {
          ...response.metadata,
          toolResults: toolResults.map(({ call, result }) => ({ call, result })),
          followUpResponse: followUpResponse.metadata
        }
      };
    } catch (error) {
      // If tool execution fails, return an error response
      const errorMessage = error instanceof ToolExecutionError
        ? `Tool execution failed: ${error.message}`
        : `Unexpected error during tool execution: ${error instanceof Error ? error.message : String(error)}`;

      throw new ChatBridgeError(
        errorMessage,
        'tool_execution_failed',
        'openai'
      );
    }
  }
}