/**
 * Chat communication interfaces and implementation for LLM interactions
 */

import * as vscode from 'vscode';
import { IAgent, AgentConfig, LLMProvider } from './agent';
import { getPersonalityForPrompt } from './personality';

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

  async sendMessage(agent: IAgent, messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
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
        default:
          throw new ChatBridgeError(
            `Unsupported provider: ${agent.provider}`,
            'UNSUPPORTED_PROVIDER',
            agent.provider
          );
      }
    } catch (error) {
      if (error instanceof ChatBridgeError) {
        throw error;
      }
      throw new ChatBridgeError(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
        'SEND_MESSAGE_FAILED',
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
        default:
          throw new ChatBridgeError(
            `Unsupported provider: ${agent.provider}`,
            'UNSUPPORTED_PROVIDER',
            agent.provider
          );
      }
    } catch (error) {
      if (error instanceof ChatBridgeError) {
        throw error;
      }
      throw new ChatBridgeError(
        `Failed to stream message: ${error instanceof Error ? error.message : String(error)}`,
        'STREAM_MESSAGE_FAILED',
        agent.provider
      );
    }
  }

  async validateConnection(agent: IAgent): Promise<boolean> {
    try {
      switch (agent.provider) {
        case 'openai':
          return await this.validateOpenAIConnection(agent);
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

    const response = await this.makeHttpRequest(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: options?.timeout || agent.config.timeout || this.httpTimeout
    });

    return this.parseOpenAIResponse(response);
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

  private async makeHttpRequest(url: string, options: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeout: number;
  }): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new ChatBridgeError(
          `HTTP ${response.status}: ${response.statusText}`,
          'HTTP_ERROR',
          'openai' as LLMProvider,
          response.status
        );
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ChatBridgeError) {
        throw error;
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
    format: 'openai' | 'ollama'
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new ChatBridgeError(
          `HTTP ${response.status}: ${response.statusText}`,
          'HTTP_ERROR',
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
      } finally {
        reader.releaseLock();
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

  private parseStreamChunk(line: string, format: 'openai' | 'ollama'): string | null {
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
        throw new ChatBridgeError(
          data.error.message || 'OpenAI API error',
          data.error.code || 'API_ERROR',
          'openai'
        );
      }

      const choice = data.choices?.[0];
      if (!choice) {
        throw new ChatBridgeError(
          'No choices in OpenAI response',
          'NO_CHOICES',
          'openai'
        );
      }

      return {
        content: choice.message?.content || '',
        finishReason: this.mapOpenAIFinishReason(choice.finish_reason),
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        } : undefined,
        toolCalls: choice.message?.tool_calls?.map((call: any) => ({
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
      throw new ChatBridgeError(
        `Failed to parse OpenAI response: ${error instanceof Error ? error.message : String(error)}`,
        'PARSE_ERROR',
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

  private mapOpenAIFinishReason(reason: string | undefined): 'stop' | 'length' | 'tool_calls' | 'error' {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'tool_calls': return 'tool_calls';
      default: return 'error';
    }
  }
}