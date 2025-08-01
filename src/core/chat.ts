/**
 * Chat communication interfaces and implementation for LLM interactions
 */

import * as vscode from 'vscode';
import { IAgent, AgentConfig, LLMProvider } from './agent';
import { getPersonalityForPrompt } from './personality';
import { WebNetworkUtils, WebCompatibility } from './webcompat';

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
  name: string;
  description: string;
  parameters: Record<string, any>;
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
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'ChatBridgeError';
  }
}

export class ChatBridge implements IChatBridge {
  private readonly httpTimeout: number = 30000; // 30 seconds default
  // If ChatBridge needs to inject dependencies, use inject() here
  // Example: private someService = inject(SomeService);

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
    const body = this.buildOpenAIRequestBody(agent, messages, options);

    return this.executeWithRetry(async () => {
      const response = await this.makeHttpRequest(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        timeout: options?.timeout || agent.config.timeout || this.httpTimeout
      });

      return this.parseOpenAIResponse(response);
    });
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
    });
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
    return {
      model: agent.config.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: options?.temperature ?? agent.config.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? agent.config.maxTokens,
      stream: options?.stream ?? false,
      ...(options?.tools && { tools: options.tools })
    };
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
        // Map specific HTTP status codes to meaningful error codes
        const errorCode = this.mapHttpStatusToErrorCode(response.status, response.body);
        const retryAfter = response.headers ? response.headers['retry-after'] : undefined;
        
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        if (retryAfter) {
          errorMessage += ` (retry after ${retryAfter} seconds)`;
        }
        
        throw new ChatBridgeError(
          errorMessage,
          errorCode,
          'openai' as LLMProvider,
          response.status
        );
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

    // For web environment, fall back to non-streaming request
    if (WebCompatibility.isWeb()) {
      try {
        // Make a regular request and simulate streaming by sending the full response
        const response = await this.makeHttpRequest(url, options);
        const text = await response.text(); // Get the response body as text
        
        // Parse the response and send as a single chunk
        if (format === 'openai') {
          const data = JSON.parse(text) as OpenAIResponse;
          const content = data.choices?.[0]?.message?.content || '';
          callback(content, false);
        } else if (format === 'ollama') {
          const data = JSON.parse(text) as OllamaResponse;
          const content = data.message?.content || '';
          callback(content, false);
        } else if (format === 'anthropic') {
          const data = JSON.parse(text) as any;
          const content = data.content?.[0]?.text || '';
          callback(content, false);
        }
        
        callback('', true); // Signal completion
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
        // Map HTTP status codes to meaningful error codes
        const errorCode = this.mapHttpStatusToErrorCode(response.status);
        throw new ChatBridgeError(
          `HTTP ${response.status}: ${response.statusText}`,
          errorCode,
          'openai' as LLMProvider,
          response.status
        );
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

  private async parseOpenAIResponse(response: Response): Promise<ChatResponse> {
    try {
      const data = await response.json() as OpenAIResponse;
      
      if (data.error) {
        // Map OpenAI-specific error codes to our standard codes
        const errorCode = this.mapOpenAIErrorCode(data.error.code, data.error.message);
        throw new ChatBridgeError(
          data.error.message || 'OpenAI API error',
          errorCode,
          'openai'
        );
      }

      const choice = data.choices?.[0];
      if (!choice) {
        throw new ChatBridgeError(
          'No choices in OpenAI response',
          'invalid_response',
          'openai'
        );
      }

      // Validate response structure
      if (!choice.message) {
        throw new ChatBridgeError(
          'Invalid response structure: missing message',
          'invalid_response',
          'openai'
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
      
      // Handle JSON parsing errors specifically
      if (error instanceof SyntaxError) {
        throw new ChatBridgeError(
          `Invalid JSON response from OpenAI: ${error.message}`,
          'invalid_response',
          'openai'
        );
      }
      
      throw new ChatBridgeError(
        `Failed to parse OpenAI response: ${error instanceof Error ? error.message : String(error)}`,
        'parse_error',
        'openai'
      );
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
        // Map Anthropic-specific error codes to our standard codes
        const errorCode = this.mapAnthropicErrorCode(data.error.type, data.error.message);
        throw new ChatBridgeError(
          data.error.message || 'Anthropic API error',
          errorCode,
          'anthropic'
        );
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
      
      // Handle JSON parsing errors specifically
      if (error instanceof SyntaxError) {
        throw new ChatBridgeError(
          `Invalid JSON response from Anthropic: ${error.message}`,
          'invalid_response',
          'anthropic'
        );
      }
      
      throw new ChatBridgeError(
        `Failed to parse Anthropic response: ${error instanceof Error ? error.message : String(error)}`,
        'parse_error',
        'anthropic'
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

  private mapAnthropicFinishReason(reason: string | undefined): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (reason) {
      case 'end_turn': return 'stop';
      case 'max_tokens': return 'length';
      case 'tool_use': return 'tool_calls';
      case 'stop_sequence': return 'stop';
      default: return 'error';
    }
  }

  private mapAnthropicErrorCode(type?: string, message?: string): string {
    if (!type) {
      // Fallback to message-based detection
      if (message) {
        const messageLower = message.toLowerCase();
        if (messageLower.includes('context length') || messageLower.includes('maximum context')) {
          return 'context_length_exceeded';
        }
        if (messageLower.includes('rate limit') || messageLower.includes('too many requests')) {
          return 'rate_limit_exceeded';
        }
        if (messageLower.includes('api key') || messageLower.includes('authentication')) {
          return 'invalid_api_key';
        }
      }
      return 'api_error';
    }

    switch (type) {
      case 'invalid_request_error':
        if (message && message.toLowerCase().includes('context length')) {
          return 'context_length_exceeded';
        }
        return 'invalid_request';
      case 'authentication_error':
        return 'invalid_api_key';
      case 'permission_error':
        return 'forbidden';
      case 'not_found_error':
        return 'not_found';
      case 'rate_limit_error':
        return 'rate_limit_exceeded';
      case 'api_error':
        return 'server_error';
      case 'overloaded_error':
        return 'server_overloaded';
      default:
        return 'api_error';
    }
  }

  /**
   * Map HTTP status codes to specific error codes based on response content
   */
  private mapHttpStatusToErrorCode(status: number, responseBody?: string): string {
    switch (status) {
      case 401:
        return 'invalid_api_key';
      case 429:
        return 'rate_limit_exceeded';
      case 400:
        // Check if it's a context length error
        if (responseBody && responseBody.toLowerCase().includes('context length')) {
          return 'context_length_exceeded';
        }
        return 'invalid_request';
      case 403:
        return 'forbidden';
      case 404:
        return 'not_found';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'server_error';
      default:
        return 'http_error';
    }
  }

  /**
   * Map OpenAI-specific error codes to our standard error codes
   */
  private mapOpenAIErrorCode(code?: string, message?: string): string {
    if (!code) {
      // Fallback to message-based detection
      if (message) {
        const messageLower = message.toLowerCase();
        if (messageLower.includes('context length') || messageLower.includes('maximum context')) {
          return 'context_length_exceeded';
        }
        if (messageLower.includes('rate limit') || messageLower.includes('too many requests')) {
          return 'rate_limit_exceeded';
        }
        if (messageLower.includes('api key') || messageLower.includes('authentication')) {
          return 'invalid_api_key';
        }
      }
      return 'api_error';
    }

    switch (code) {
      case 'context_length_exceeded':
      case 'max_tokens_exceeded':
        return 'context_length_exceeded';
      case 'rate_limit_exceeded':
      case 'rate_limit_error':
        return 'rate_limit_exceeded';
      case 'invalid_api_key':
      case 'authentication_error':
        return 'invalid_api_key';
      case 'invalid_request_error':
        // Check message for more specific error
        if (message && message.toLowerCase().includes('context length')) {
          return 'context_length_exceeded';
        }
        return 'invalid_request';
      case 'insufficient_quota':
        return 'quota_exceeded';
      case 'model_not_found':
        return 'model_not_found';
      case 'server_error':
      case 'service_unavailable':
        return 'server_error';
      default:
        return code;
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
   * Check if an error is retryable
   */
  private isRetryableError(error: ChatBridgeError): boolean {
    const retryableCodes = [
      'network_error',
      'timeout',
      'server_error',
      'rate_limit_exceeded' // Can be retried with backoff
    ];
    
    return retryableCodes.includes(error.code.toLowerCase()) || 
           (error.statusCode !== undefined && error.statusCode >= 500);
  }

  /**
   * Execute request with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 100
  ): Promise<T> {
    let lastError: ChatBridgeError | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (!(error instanceof ChatBridgeError)) {
          throw error;
        }
        
        lastError = error;
        
        // Don't retry on the last attempt or for non-retryable errors
        if (attempt === maxRetries || !this.isRetryableError(error)) {
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
        const totalDelay = delay + jitter;
        
        console.log(`Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(totalDelay)}ms: ${error.message}`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }
    
    throw lastError;
  }
}