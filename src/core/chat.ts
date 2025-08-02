/**
 * Chat communication interfaces and implementation for LLM interactions
 */

import * as vscode from 'vscode';
import { IAgent, AgentConfig, LLMProvider } from './agent';
import { getPersonalityForPrompt } from './personality';
import { WebNetworkUtils, WebCompatibility } from './webcompat';
import { ToolManager, ToolExecutionError } from './tool-manager';
import { ExecutionContext, SecurityLevel } from './tools';
import { ErrorMapper, ErrorRecovery, EnhancedError, ErrorContext } from './error-handler';

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
  stream?: boolean;
  timeout?: number;
  tools?: ChatTool[];
}

export interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ChatResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: ChatToolCall[];
  metadata?: Record<string, any>;
}

export interface ChatToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export type StreamCallback = (chunk: string, isComplete: boolean) => void;

export interface IChatBridge {
  sendMessage(agent: IAgent, messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamMessage(agent: IAgent, messages: ChatMessage[], callback: StreamCallback, options?: ChatOptions): Promise<void>;
  validateConnection(agent: IAgent): Promise<boolean>;
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
  // If ChatBridge needs to inject dependencies, use inject() here
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
      console.warn('Failed to register built-in tools:', error);
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
  ): Promise<void> {
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
        'stream_message_failed',
        agent.provider
      );
    }
  }

  async validateConnection(agent: IAgent): Promise<boolean> {
    try {
      switch (agent.provider) {
        case 'openai':
          return await this.validateOpenAIConnection(agent);
        case 'anthropic':
          return await this.validateAnthropicConnection(agent);
        case 'ollama':
          return await this.validateOllamaConnection(agent);
        case 'custom':
          return await this.validateCustomConnection(agent);
        default:
          return false;
      }
    } catch (error) {
      console.error(`Connection validation failed for ${agent.provider}:`, error);
      return false;
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
    }, 3, 1000, 'openai');
  }

  private async streamOpenAIMessage(
    agent: IAgent,
    messages: ChatMessage[],
    callback: StreamCallback,
    options?: ChatOptions
  ): Promise<void> {
    const endpoint = agent.config.endpoint || 'https://api.openai.com/v1/chat/completions';
    const headers = this.getOpenAIHeaders(agent.config);
    const body = this.buildOpenAIRequestBody(agent, messages, { ...options, stream: true });

    await this.makeStreamingRequest(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: options?.timeout || agent.config.timeout || this.httpTimeout
    }, callback, 'openai');
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
  ): Promise<void> {
    const endpoint = `${agent.config.endpoint || 'http://localhost:11434'}/api/chat`;
    const headers = { 'Content-Type': 'application/json' };
    const body = this.buildOllamaRequestBody(agent, messages, { ...options, stream: true });

    await this.makeStreamingRequest(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: options?.timeout || agent.config.timeout || this.httpTimeout
    }, callback, 'ollama');
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
    }, 3, 1000, 'anthropic');
  }

  private async streamCustomMessage(
    agent: IAgent,
    messages: ChatMessage[],
    callback: StreamCallback,
    options?: ChatOptions
  ): Promise<void> {
    if (!agent.config.endpoint) {
      throw new ChatBridgeError(
        'Custom provider requires endpoint configuration',
        'MISSING_ENDPOINT',
        'custom'
      );
    }

    const headers = this.getCustomHeaders(agent.config);
    const body = this.buildOpenAIRequestBody(agent, messages, { ...options, stream: true });

    await this.makeStreamingRequest(agent.config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: options?.timeout || agent.config.timeout || this.httpTimeout
    }, callback, 'openai'); // Use OpenAI streaming format
  }

  private async streamAnthropicMessage(
    agent: IAgent,
    messages: ChatMessage[],
    callback: StreamCallback,
    options?: ChatOptions
  ): Promise<void> {
    const endpoint = agent.config.endpoint || 'https://api.anthropic.com/v1/messages';
    const headers = this.getAnthropicHeaders(agent.config);
    const body = this.buildAnthropicRequestBody(agent, messages, { ...options, stream: true });

    await this.makeStreamingRequest(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: options?.timeout || agent.config.timeout || this.httpTimeout
    }, callback, 'anthropic');
  }

  private async validateOpenAIConnection(agent: IAgent): Promise<boolean> {
    try {
      const endpoint = agent.config.endpoint || 'https://api.openai.com/v1/models';
      const headers = this.getOpenAIHeaders(agent.config);

      const response = await this.makeHttpRequest(endpoint, {
        method: 'GET',
        headers,
        timeout: 10000 // 10 second timeout for validation
      });

      return response.status >= 200 && response.status < 300;
    } catch (error) {
      return false;
    }
  }

  private async validateAnthropicConnection(agent: IAgent): Promise<boolean> {
    try {
      // Anthropic doesn't have a models endpoint, so we'll make a minimal test request
      const endpoint = agent.config.endpoint || 'https://api.anthropic.com/v1/messages';
      const headers = this.getAnthropicHeaders(agent.config);
      
      // Make a minimal test request to validate the API key
      const testBody = {
        model: agent.config.model || 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      };

      const response = await this.makeHttpRequest(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(testBody),
        timeout: 10000 // 10 second timeout for validation
      });

      // Accept both success (200) and client errors (400) as valid connections
      // 400 might occur due to minimal request, but it means the API key is valid
      return (response.status >= 200 && response.status < 300) || response.status === 400;
    } catch (error) {
      return false;
    }
  }

  private async validateOllamaConnection(agent: IAgent): Promise<boolean> {
    try {
      const endpoint = `${agent.config.endpoint || 'http://localhost:11434'}/api/tags`;
      
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
      return false;
    } catch (error) {
      return false;
    }
  }

  private async validateCustomConnection(agent: IAgent): Promise<boolean> {
    if (!agent.config.endpoint) {
      return false;
    }

    try {
      // Try a simple test message to validate the connection
      const testMessages: ChatMessage[] = [
        { role: 'user', content: 'test' }
      ];
      
      await this.sendCustomMessage(agent, testMessages, { maxTokens: 1 });
      return true;
    } catch (error) {
      return false;
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

  private async makeHttpRequest(url: string, options: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeout: number;
  }): Promise<Response> {
    try {
      // Check web accessibility before making request
      if (WebCompatibility.isWeb() && !WebNetworkUtils.isWebAccessible(url)) {
        throw new ChatBridgeError(
          `URL ${url} is not accessible in VS Code web environment due to CORS restrictions`,
          'WEB_CORS_ERROR',
          'openai' as LLMProvider
        );
      }

      const response = await WebNetworkUtils.makeRequest(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        timeout: options.timeout
      });

      if (response.status < 200 || response.status >= 300) {
        // Parse error response body
        let errorBody;
        try {
          errorBody = JSON.parse(response.body);
        } catch {
          errorBody = { message: response.statusText };
        }

        // Create error context
        const context: ErrorContext = {
          provider: 'openai' as LLMProvider, // Will be overridden by caller
          operation: 'http_request',
          retryCount: 0,
          timestamp: new Date()
        };

        // Map error using enhanced error handler
        const enhancedError = ErrorMapper.mapProviderError('openai' as LLMProvider, {
          status: response.status,
          statusText: response.statusText,
          error: errorBody,
          headers: response.headers
        }, context);
        
        throw ChatBridgeError.fromEnhancedError(enhancedError);
      }

      // Convert our response format to fetch Response format
      const headers = new Headers();
      if (response.headers && typeof response.headers === 'object') {
        Object.entries(response.headers).forEach(([key, value]) => {
          if (typeof value === 'string') {
            headers.set(key, value);
          }
        });
      }
      
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: response.statusText,
        headers: headers,
        json: async () => {
          try {
            return JSON.parse(response.body);
          } catch (error) {
            throw new ChatBridgeError(
              `Invalid JSON response: ${error instanceof Error ? error.message : String(error)}`,
              'invalid_response',
              'openai' as LLMProvider
            );
          }
        },
        text: async () => response.body,
        body: null // Streaming not supported in our WebNetworkUtils yet
      } as Response;
    } catch (error) {
      if (error instanceof ChatBridgeError) {
        throw error;
      }
      
      // Handle timeout errors specifically
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new ChatBridgeError(
          `Request timeout: ${error.message}`,
          'TIMEOUT',
          'openai' as LLMProvider
        );
      }
      
      throw new ChatBridgeError(
        `Network request failed: ${error instanceof Error ? error.message : String(error)}`,
        'NETWORK_ERROR',
        'openai' as LLMProvider
      );
    }
  }

  private async makeStreamingRequest(
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body: string;
      timeout: number;
    },
    callback: StreamCallback,
    format: 'openai' | 'ollama' | 'anthropic'
  ): Promise<void> {
    // Check web accessibility
    if (WebCompatibility.isWeb() && !WebNetworkUtils.isWebAccessible(url)) {
      throw new ChatBridgeError(
        `Streaming not supported for ${url} in VS Code web environment`,
        'WEB_STREAMING_ERROR',
        'openai' as LLMProvider
      );
    }

    // For web environment, fall back to non-streaming request with simulated streaming
    if (WebCompatibility.isWeb()) {
      try {
        // Make a regular request and simulate streaming by breaking response into chunks
        const response = await this.makeHttpRequest(url, options);
        const text = await response.text(); // Get the response body as text
        
        // Parse the response to extract content
        let content = '';
        if (format === 'openai') {
          const data = JSON.parse(text) as OpenAIResponse;
          content = data.choices?.[0]?.message?.content || '';
        } else if (format === 'ollama') {
          const data = JSON.parse(text) as OllamaResponse;
          content = data.message?.content || '';
        } else if (format === 'anthropic') {
          const data = JSON.parse(text) as any;
          content = data.content?.[0]?.text || '';
        }
        
        // Simulate streaming by sending content in chunks with delays
        const streamingConfig = WebCompatibility.getStreamingSimulationConfig();
        await this.simulateStreaming(content, callback, {
          chunkSize: streamingConfig.chunkSize,
          delay: streamingConfig.delay,
          wordBoundary: streamingConfig.wordBoundary
        });
        
        return;
      } catch (error) {
        throw new ChatBridgeError(
          `Web streaming fallback failed: ${error instanceof Error ? error.message : String(error)}`,
          'WEB_STREAMING_FALLBACK_ERROR',
          'openai' as LLMProvider
        );
      }
    }

    // Desktop environment - use actual streaming
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    try {
      // Use fetch directly for streaming since WebNetworkUtils doesn't support streaming yet
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Create error context
        const context: ErrorContext = {
          provider: 'openai' as LLMProvider,
          operation: 'streaming_request',
          retryCount: 0,
          timestamp: new Date()
        };

        // Map error using enhanced error handler
        const enhancedError = ErrorMapper.mapProviderError('openai' as LLMProvider, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        }, context);
        
        throw ChatBridgeError.fromEnhancedError(enhancedError);
      }

      if (!response.body) {
        throw new ChatBridgeError(
          'No response body for streaming',
          'NO_STREAM_BODY',
          'openai' as LLMProvider
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let readerReleased = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              const chunk = this.parseStreamChunk(line, format);
              if (chunk) {
                callback(chunk, false);
              }
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const chunk = this.parseStreamChunk(buffer, format);
          if (chunk) {
            callback(chunk, false);
          }
        }

        callback('', true); // Signal completion
      } catch (streamError) {
        // Release reader before throwing
        if (!readerReleased) {
          try {
            reader.releaseLock();
            readerReleased = true;
          } catch (releaseError) {
            // Ignore release errors
          }
        }
        
        throw new ChatBridgeError(
          `Stream processing error: ${streamError instanceof Error ? streamError.message : String(streamError)}`,
          'stream_error',
          'openai' as LLMProvider
        );
      } finally {
        if (!readerReleased) {
          try {
            reader.releaseLock();
          } catch (releaseError) {
            // Ignore release errors in finally block
          }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ChatBridgeError) {
        throw error;
      }
      throw new ChatBridgeError(
        `Streaming request failed: ${error instanceof Error ? error.message : String(error)}`,
        'STREAM_ERROR',
        'openai' as LLMProvider
      );
    }
  }

  private parseStreamChunk(line: string, format: 'openai' | 'ollama' | 'anthropic'): string | null {
    try {
      if (format === 'openai') {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return null;
          }
          
          const parsed = JSON.parse(data);
          return parsed.choices?.[0]?.delta?.content || null;
        }
      } else if (format === 'ollama') {
        const parsed = JSON.parse(line);
        if (parsed.done) {
          return null;
        }
        return parsed.message?.content || null;
      } else if (format === 'anthropic') {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return null;
          }
          
          const parsed = JSON.parse(data);
          // Anthropic streaming format: event: content_block_delta, data: { delta: { text: "content" } }
          if (parsed.type === 'content_block_delta') {
            return parsed.delta?.text || null;
          }
          // Also handle message_delta events
          if (parsed.type === 'message_delta') {
            return parsed.delta?.content?.[0]?.text || null;
          }
        }
      }
    } catch (error) {
      // Ignore parsing errors for individual chunks
    }
    return null;
  }

  /**
   * Simulate streaming by breaking content into chunks and sending them with delays
   * This provides a streaming-like experience in web environments where real streaming isn't available
   */
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
        // Create error context
        const context: ErrorContext = {
          provider: 'openai',
          operation: 'parse_response',
          retryCount: 0,
          timestamp: new Date()
        };

        // Map OpenAI-specific error using enhanced error handler
        const enhancedError = ErrorMapper.mapProviderError('openai', { error: data.error }, context);
        throw ChatBridgeError.fromEnhancedError(enhancedError);
      }

      const choice = data.choices?.[0];
      if (!choice) {
        throw new ChatBridgeError(
          'No choices in OpenAI response',
          'invalid_response',
          'openai',
          undefined,
          undefined,
          'Check your request parameters and try again. This may indicate an issue with the model or request format.'
        );
      }

      // Validate response structure
      if (!choice.message) {
        throw new ChatBridgeError(
          'Invalid response structure: missing message',
          'invalid_response',
          'openai',
          undefined,
          undefined,
          'The OpenAI API returned an unexpected response format. This may be a temporary issue.'
        );
      }

      return {
        content: choice.message.content || '',
        finishReason: this.mapOpenAIFinishReason(choice.finish_reason),
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        } : undefined,
        toolCalls: choice.message.tool_calls?.map((call: any) => ({
          id: call.id,
          name: call.function?.name,
          parameters: JSON.parse(call.function?.arguments || '{}')
        })),
        metadata: { provider: 'openai', model: data.model }
      };
    } catch (error) {
      if (error instanceof ChatBridgeError) {
        throw error;
      }
      
      // Create error context
      const context: ErrorContext = {
        provider: 'openai',
        operation: 'parse_response',
        retryCount: 0,
        timestamp: new Date()
      };

      // Handle JSON parsing errors specifically
      if (error instanceof SyntaxError) {
        const enhancedError = ErrorMapper.mapProviderError('openai', {
          message: `Invalid JSON response: ${error.message}`,
          code: 'invalid_response'
        }, context);
        throw ChatBridgeError.fromEnhancedError(enhancedError);
      }
      
      // Handle other parsing errors
      const enhancedError = ErrorMapper.mapProviderError('openai', {
        message: `Failed to parse response: ${error instanceof Error ? error.message : String(error)}`,
        code: 'parse_error'
      }, context);
      throw ChatBridgeError.fromEnhancedError(enhancedError);
    }
  }

  private async parseOllamaResponse(response: Response): Promise<ChatResponse> {
    try {
      const data = await response.json() as OllamaResponse;
      
      if (data.error) {
        throw new ChatBridgeError(
          data.error,
          'API_ERROR',
          'ollama'
        );
      }

      return {
        content: data.message?.content || '',
        finishReason: data.done ? 'stop' : 'length',
        usage: data.prompt_eval_count || data.eval_count ? {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        } : undefined,
        metadata: { 
          provider: 'ollama', 
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
      throw new ChatBridgeError(
        `Failed to parse Ollama response: ${error instanceof Error ? error.message : String(error)}`,
        'PARSE_ERROR',
        'ollama'
      );
    }
  }

  private async parseAnthropicResponse(response: Response): Promise<ChatResponse> {
    try {
      const data = await response.json() as any;
      
      if (data.error) {
        // Create error context
        const context: ErrorContext = {
          provider: 'anthropic',
          operation: 'parse_response',
          retryCount: 0,
          timestamp: new Date()
        };

        // Map Anthropic-specific error using enhanced error handler
        const enhancedError = ErrorMapper.mapProviderError('anthropic', { error: data.error }, context);
        throw ChatBridgeError.fromEnhancedError(enhancedError);
      }

      // Anthropic response format: { content: [{ text: "response" }], stop_reason: "end_turn", usage: {...} }
      const content = data.content?.[0]?.text || '';
      const finishReason = this.mapAnthropicFinishReason(data.stop_reason);

      return {
        content,
        finishReason,
        usage: data.usage ? {
          promptTokens: data.usage.input_tokens || 0,
          completionTokens: data.usage.output_tokens || 0,
          totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)
        } : undefined,
        metadata: { 
          provider: 'anthropic', 
          model: data.model,
          stopReason: data.stop_reason
        }
      };
    } catch (error) {
      if (error instanceof ChatBridgeError) {
        throw error;
      }
      
      // Create error context
      const context: ErrorContext = {
        provider: 'anthropic',
        operation: 'parse_response',
        retryCount: 0,
        timestamp: new Date()
      };

      // Handle JSON parsing errors specifically
      if (error instanceof SyntaxError) {
        const enhancedError = ErrorMapper.mapProviderError('anthropic', {
          message: `Invalid JSON response: ${error.message}`,
          code: 'invalid_response'
        }, context);
        throw ChatBridgeError.fromEnhancedError(enhancedError);
      }
      
      // Handle other parsing errors
      const enhancedError = ErrorMapper.mapProviderError('anthropic', {
        message: `Failed to parse response: ${error instanceof Error ? error.message : String(error)}`,
        code: 'parse_error'
      }, context);
      throw ChatBridgeError.fromEnhancedError(enhancedError);
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
   */
  private validateRequest(messages: ChatMessage[], options?: ChatOptions): void {
    // Validate messages array
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new ChatBridgeError(
        'Messages array cannot be empty',
        'invalid_request',
        'openai' as LLMProvider
      );
    }

    // Validate each message
    for (const message of messages) {
      if (!message || typeof message !== 'object') {
        throw new ChatBridgeError(
          'Invalid message format: message must be an object',
          'invalid_request',
          'openai' as LLMProvider
        );
      }

      if (!message.role || !['system', 'user', 'assistant'].includes(message.role)) {
        throw new ChatBridgeError(
          `Invalid message role: ${message.role}. Must be 'system', 'user', or 'assistant'`,
          'invalid_request',
          'openai' as LLMProvider
        );
      }

      if (typeof message.content !== 'string') {
        throw new ChatBridgeError(
          'Invalid message content: content must be a string',
          'invalid_request',
          'openai' as LLMProvider
        );
      }

      if (message.content.trim().length === 0) {
        throw new ChatBridgeError(
          'Invalid message content: content cannot be empty',
          'invalid_request',
          'openai' as LLMProvider
        );
      }
    }

    // Validate options if provided
    if (options) {
      if (options.temperature !== undefined && (options.temperature < 0 || options.temperature > 2)) {
        throw new ChatBridgeError(
          'Invalid temperature: must be between 0 and 2',
          'invalid_request',
          'openai' as LLMProvider
        );
      }

      if (options.maxTokens !== undefined && options.maxTokens <= 0) {
        throw new ChatBridgeError(
          'Invalid maxTokens: must be greater than 0',
          'invalid_request',
          'openai' as LLMProvider
        );
      }

      if (options.timeout !== undefined && options.timeout <= 0) {
        throw new ChatBridgeError(
          'Invalid timeout: must be greater than 0',
          'invalid_request',
          'openai' as LLMProvider
        );
      }
    }
  }



  /**
   * Execute request with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    provider: LLMProvider = 'openai'
  ): Promise<T> {
    let lastError: ChatBridgeError | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (!(error instanceof ChatBridgeError)) {
          // Convert non-ChatBridge errors to enhanced errors
          const context: ErrorContext = {
            provider,
            operation: 'retry_operation',
            retryCount: attempt,
            timestamp: new Date()
          };
          
          const enhancedError = ErrorMapper.mapProviderError(provider, error, context);
          lastError = ChatBridgeError.fromEnhancedError(enhancedError);
        } else {
          lastError = error;
          // Update retry count in context
          if (lastError.context) {
            lastError.context.retryCount = attempt;
          }
        }
        
        // Check if we should retry using enhanced error recovery
        if (!ErrorRecovery.shouldRetry(lastError, attempt, maxRetries)) {
          throw lastError;
        }
        
        // Calculate delay with enhanced retry logic
        const delay = ErrorRecovery.getRetryDelayWithHeader(attempt, lastError.retryAfter, baseDelay);
        
        console.log(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms: ${lastError.message}`);
        if (lastError.suggestedFix) {
          console.log(`Suggested fix: ${lastError.suggestedFix}`);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
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

      // Convert to OpenAI tools format
      const openaiTools: ChatTool[] = filteredTools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));

      return {
        ...options,
        tools: openaiTools.length > 0 ? openaiTools : undefined
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