import {
  ModelConfig,
  ModelCapabilities,
  ChatMessage,
  Tool,
  AIResponse,
  ToolCall,
  StreamCallback
} from './base-model-adapter';
import { AbstractModelAdapter } from './abstract-model-adapter';

// Polyfill for fetch in Node.js environment
let fetchImpl: typeof globalThis.fetch;
if (typeof fetch === 'undefined') {
  // Dynamic import to avoid bundling issues
  fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    try {
      // Try to use node-fetch if available
      const nodeFetch = await import('node-fetch');
      // Convert input to string for node-fetch compatibility
      const url = typeof input === 'string' ? input : input.toString();
      const response = await nodeFetch.default(url, init as any);
      // Return a Response-compatible object
      return response as any as Response;
    } catch {
      // Fallback to HTTP module for basic requests
      return Promise.reject(new Error('Fetch not available and node-fetch not installed'));
    }
  };
} else {
  fetchImpl = fetch;
}

// Helper function to add timeout to fetch requests
const fetchWithTimeout = async (url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> => {
  const { timeout = 10000, ...fetchOptions } = options; // Default 10 second timeout
  
  console.log(`[fetchWithTimeout] Making request to: ${url} with timeout: ${timeout}ms`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(`[fetchWithTimeout] Request timeout reached (${timeout}ms), aborting request to: ${url}`);
    controller.abort();
  }, timeout);
  
  try {
    console.log('[fetchWithTimeout] Starting fetch request...');
    const response = await fetchImpl(url, {
      ...fetchOptions,
      signal: fetchOptions.signal || controller.signal
    });
    clearTimeout(timeoutId);
    console.log(`[fetchWithTimeout] Request completed successfully, status: ${response.status}`);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[fetchWithTimeout] Request failed:`, error);
    if (error instanceof Error && error.name === 'AbortError') {
      const timeoutError = new Error(`Request timeout after ${timeout}ms`);
      console.error('[fetchWithTimeout] Timeout error:', timeoutError.message);
      throw timeoutError;
    }
    throw error;
  }
};

/**
 * Ollama API response interface
 */
interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama API request interface
 */
interface OllamaRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  context?: number[];
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
  };
}

/**
 * Ollama model information interface
 */
interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
  modified_at: string;
}

/**
 * Model adapter for Ollama local AI models
 * 
 * This adapter connects to a local Ollama instance and handles:
 * - Connection management and health checks
 * - Conversation context formatting
 * - Tool calling support (where available)
 * - Error handling for connection failures
 */
export class OllamaAdapter extends AbstractModelAdapter {
  public baseUrl: string;
  private modelName: string;
  private context: number[] = [];

  constructor() {
    // Default capabilities for Ollama models
    // Note: Tool calling support varies by model
    const capabilities: ModelCapabilities = {
      supportsToolCalling: false, // Will be detected per model
      supportsStreaming: true,
      supportsSystemPrompts: true,
      maxContextLength: 4096, // Will be updated based on model
      supportedFormats: ['text', 'json']
    };

    super(capabilities);
    this.baseUrl = 'http://localhost:11434';
    this.modelName = '';
  }

  /**
   * Initialize the adapter with Ollama configuration
   */
  async initialize(config: ModelConfig): Promise<void> {
    await super.initialize(config);
    
    this.baseUrl = config.endpoint || 'http://localhost:11434';
    this.modelName = (config as any).model || config.name;

    // Test connection and detect model capabilities
    const isConnected = await this.testConnection();
    if (!isConnected) {
      throw new Error(`Failed to connect to Ollama at ${this.baseUrl}. Please ensure Ollama is running and the model '${this.modelName}' is available.`);
    }

    // Update capabilities based on the specific model
    await this.detectModelCapabilities();
  }

  /**
   * Format prompt for Ollama with conversation context and tools
   */
  formatPrompt(messages: ChatMessage[], tools: Tool[]): string {
    let prompt = '';

    // Add system prompt if available
    const systemMessages = messages.filter(m => m.role === 'system');
    if (systemMessages.length > 0) {
      prompt += systemMessages.map(m => m.content).join('\n') + '\n\n';
    }

    // Add available tools if the model supports them
    if (tools.length > 0 && this.supportsToolCalling()) {
      prompt += 'Available tools:\n';
      prompt += this.formatToolsAsJson(tools) + '\n\n';
      prompt += 'To use a tool, respond with JSON in the following format:\n';
      prompt += '```json\n{\n  "name": "tool_name",\n  "parameters": {\n    "param1": "value1"\n  }\n}\n```\n\n';
    }

    // Add conversation history
    const conversationMessages = messages.filter(m => m.role !== 'system');
    for (const message of conversationMessages) {
      if (message.role === 'user') {
        prompt += `Human: ${message.content}\n`;
      } else if (message.role === 'assistant') {
        prompt += `Assistant: ${message.content}\n`;
        
        // Add tool results if available
        if (message.toolResults && message.toolResults.length > 0) {
          for (const result of message.toolResults) {
            prompt += `Tool Result (${result.metadata.toolName}): ${result.success ? result.output : `Error: ${result.error}`}\n`;
          }
        }
      } else if (message.role === 'tool') {
        prompt += `Tool: ${message.content}\n`;
      }
    }

    // Add assistant prompt
    prompt += 'Assistant: ';

    return prompt;
  }

  /**
   * Parse Ollama response into structured AIResponse
   */
  parseResponse(response: string): AIResponse {
    const startTime = Date.now() - 100; // Approximate processing time
    
    // Parse tool calls from the response
    const toolCalls = this.parseToolCallsFromContent(response);
    
    // Extract metadata if available (this would come from the full Ollama response)
    const metadata = this.createResponseMetadata(startTime, {
      tokensUsed: Math.ceil(response.length / 4) // Rough token estimate
    });

    return {
      content: response,
      toolCalls,
      metadata
    };
  }

  /**
   * Send request to Ollama API
   */
  async sendRequest(prompt: string): Promise<string> {
    if (!this.config) {
      throw new Error('Adapter not initialized. Call initialize() first.');
    }

    const requestBody: OllamaRequest = {
      model: this.modelName,
      prompt,
      stream: false,
      context: this.context.length > 0 ? this.context : undefined,
      options: {
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens,
      }
    };

    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        timeout: this.config?.timeout || 30000 // Use configured timeout or 30s default
      });

      if (!response.ok) {
        // Try to parse error response body for more detailed error information
        let errorMessage = `Ollama API error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json() as { error?: string };
          if (errorData.error) {
            errorMessage = errorData.error;
            
            // Provide helpful suggestions for common errors
            if (errorMessage.includes('requires more system memory')) {
              errorMessage += '\n\nSuggestions:\n• Close other applications to free up memory\n• Try a smaller model (e.g., qwen3:1.5b instead of qwen3:4b)\n• Restart your system to clear memory';
            } else if (errorMessage.includes('model') && errorMessage.includes('not found')) {
              errorMessage += '\n\nSuggestion: Run "ollama pull <model-name>" to download the model first';
            }
          }
        } catch (parseError) {
          // If we can't parse the error response, use the original message
          console.warn('Failed to parse Ollama error response:', parseError);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json() as OllamaResponse;
      
      // Update context for next request
      if (data.context) {
        this.context = data.context;
      }

      return data.response;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Failed to connect to Ollama at ${this.baseUrl}. Please ensure Ollama is running.`);
      }
      throw error;
    }
  }

  /**
   * Test basic connection to Ollama without model validation
   */
  async testBasicConnection(): Promise<boolean> {
    console.log(`[OllamaAdapter] Testing basic connection to ${this.baseUrl}/api/tags`);
    try {
      console.log('[OllamaAdapter] Starting basic connection test with 5 second timeout');
      const healthResponse = await fetchWithTimeout(`${this.baseUrl}/api/tags`, {
        timeout: 5000 // 5 second timeout for connection test
      });
      console.log(`[OllamaAdapter] Basic connection test response status: ${healthResponse.status}, ok: ${healthResponse.ok}`);
      return healthResponse.ok;
    } catch (error) {
      console.error('[OllamaAdapter] Basic connection test failed with error:', error);
      return false;
    }
  }

  /**
   * Test connection to Ollama
   */
  async testConnection(): Promise<boolean> {
    console.log(`[OllamaAdapter] Testing connection to ${this.baseUrl}/api/tags`);
    try {
      console.log('[OllamaAdapter] Starting connection test with 5 second timeout');
      // First, check if Ollama is running
      const healthResponse = await fetchWithTimeout(`${this.baseUrl}/api/tags`, {
        timeout: 5000 // 5 second timeout for connection test
      });
      console.log(`[OllamaAdapter] Connection test response status: ${healthResponse.status}, ok: ${healthResponse.ok}`);
      if (!healthResponse.ok) {
        console.log(`[OllamaAdapter] Health check failed with status: ${healthResponse.status}`);
        return false;
      }

      // Then check if the specific model is available
      if (this.modelName) {
        console.log(`[OllamaAdapter] Checking if model '${this.modelName}' exists`);
        const modelsData = await healthResponse.json() as { models?: OllamaModelInfo[] };
        console.log(`[OllamaAdapter] Available models from API:`, modelsData.models?.map((m: OllamaModelInfo) => m.name) || []);
        const modelExists = modelsData.models?.some((model: OllamaModelInfo) => 
          model.name === this.modelName || model.name.startsWith(this.modelName + ':')
        );
        
        if (!modelExists) {
          console.warn(`[OllamaAdapter] Model '${this.modelName}' not found in Ollama. Available models:`, 
            modelsData.models?.map((m: OllamaModelInfo) => m.name) || []);
          return false;
        }
        console.log(`[OllamaAdapter] Model '${this.modelName}' found in available models`);
      }

      console.log('[OllamaAdapter] Connection test successful');
      return true;
    } catch (error) {
      console.error('[OllamaAdapter] Connection test failed with error:', error);
      return false;
    }
  }

  /**
   * Validate Ollama-specific configuration
   */
  protected async validateProviderConfig(config: ModelConfig): Promise<boolean> {
    // Validate provider
    if (config.provider !== 'ollama') {
      return false;
    }

    // Validate model name
    if (!config.name || config.name.trim().length === 0) {
      return false;
    }

    // Validate endpoint format if provided
    if (config.endpoint) {
      try {
        new URL(config.endpoint);
      } catch {
        return false;
      }
    }

    return true;
  }

  /**
   * Detect capabilities of the specific Ollama model
   */
  private async detectModelCapabilities(): Promise<void> {
    try {
      // Get model information from Ollama
      const response = await fetchWithTimeout(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: this.modelName }),
        timeout: 10000 // 10 second timeout for model info
      });

      if (response.ok) {
        const modelInfo = await response.json();
        
        // Update capabilities based on model info
        this.updateCapabilitiesFromModelInfo(modelInfo);
      }
    } catch (error) {
      console.warn('Failed to detect model capabilities:', error);
      // Use default capabilities
    }
  }

  /**
   * Update capabilities based on Ollama model information
   */
  private updateCapabilitiesFromModelInfo(modelInfo: any): void {
    // Detect tool calling support based on model family/type
    const modelName = this.modelName.toLowerCase();
    const supportsTools = this.detectToolCallingSupport(modelName, modelInfo);
    
    // Estimate context length based on model info
    const contextLength = this.estimateContextLength(modelName, modelInfo);

    // Update capabilities
    this.capabilities = {
      ...this.capabilities,
      supportsToolCalling: supportsTools,
      maxContextLength: contextLength
    };
  }

  /**
   * Detect if the model supports tool calling
   */
  private detectToolCallingSupport(modelName: string, modelInfo: any): boolean {
    // Models known to support tool calling or function calling
    const toolSupportedModels = [
      'llama3', 'llama3.1', 'llama3.2',
      'mistral', 'mixtral',
      'qwen', 'qwen2',
      'codellama',
      'deepseek-coder'
    ];

    return toolSupportedModels.some(supportedModel => 
      modelName.includes(supportedModel)
    );
  }

  /**
   * Estimate context length based on model information
   */
  private estimateContextLength(modelName: string, modelInfo: any): number {
    // Try to get context length from model info
    if (modelInfo?.details?.parameter_size) {
      const paramSize = modelInfo.details.parameter_size.toLowerCase();
      
      // Larger models typically have larger context windows
      if (paramSize.includes('70b') || paramSize.includes('65b')) {
        return 8192;
      } else if (paramSize.includes('13b') || paramSize.includes('14b')) {
        return 4096;
      } else if (paramSize.includes('7b') || paramSize.includes('8b')) {
        return 4096;
      }
    }

    // Model-specific context lengths
    if (modelName.includes('llama3.1') || modelName.includes('llama3.2')) {
      return 8192;
    } else if (modelName.includes('codellama')) {
      return 16384; // CodeLlama has larger context
    } else if (modelName.includes('mistral') || modelName.includes('mixtral')) {
      return 8192;
    }

    // Default context length
    return 4096;
  }

  /**
   * Get available models from Ollama
   */
  async getAvailableModels(): Promise<{ name: string; description?: string }[]> {
    console.log(`[OllamaAdapter] Getting available models from ${this.baseUrl}/api/tags`);
    try {
      console.log('[OllamaAdapter] Starting fetch request with 10 second timeout');
      const response = await fetchWithTimeout(`${this.baseUrl}/api/tags`, {
        timeout: 10000 // 10 second timeout for fetching models
      });
      console.log(`[OllamaAdapter] Fetch completed, response status: ${response.status}, ok: ${response.ok}`);
      if (!response.ok) {
        console.error(`[OllamaAdapter] Response not ok: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      console.log('[OllamaAdapter] Parsing JSON response...');
      const data = await response.json() as { models?: OllamaModelInfo[] };
      console.log(`[OllamaAdapter] Parsed response, found ${data.models?.length || 0} models:`, data.models?.map(m => m.name));
      
      const result = data.models?.map((model: OllamaModelInfo) => ({
        name: model.name,
        description: `${model.details.family} (${model.details.parameter_size})`
      })) || [];
      
      console.log('[OllamaAdapter] Returning models:', result);
      return result;
    } catch (error) {
      console.error('[OllamaAdapter] Failed to get available models with error:', error);
      return [];
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName: string): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName }),
        timeout: 60000 // 60 second timeout for model pulling
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to pull model:', error);
      return false;
    }
  }

  /**
   * Clear conversation context
   */
  clearContext(): void {
    this.context = [];
  }

  /**
   * Get current context size
   */
  getContextSize(): number {
    return this.context.length;
  }

  /**
   * Internal streaming request implementation
   */
  protected async _sendStreamingRequest(
    prompt: string,
    callback: StreamCallback,
    signal: AbortSignal
  ): Promise<void> {
    if (!this.config) {
      throw new Error('Adapter not initialized. Call initialize() first.');
    }

    const requestBody: OllamaRequest = {
      model: this.modelName,
      prompt,
      stream: true,
      context: this.context.length > 0 ? this.context : undefined,
      options: {
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens,
      }
    };

    const response = await fetchWithTimeout(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
      timeout: this.config?.timeout || 30000 // Use configured timeout or 30s default
    });

    if (!response.ok) {
      // Try to parse error response body for more detailed error information
      let errorMessage = `Ollama API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json() as { error?: string };
        if (errorData.error) {
          errorMessage = errorData.error;
          
          // Provide helpful suggestions for common errors
          if (errorMessage.includes('requires more system memory')) {
            errorMessage += '\n\nSuggestions:\n• Close other applications to free up memory\n• Try a smaller model (e.g., qwen3:1.5b instead of qwen3:4b)\n• Restart your system to clear memory';
          } else if (errorMessage.includes('model') && errorMessage.includes('not found')) {
            errorMessage += '\n\nSuggestion: Run "ollama pull <model-name>" to download the model first';
          }
        }
      } catch (parseError) {
        // If we can't parse the error response, use the original message
        console.warn('Failed to parse Ollama error response:', parseError);
      }
      throw new Error(errorMessage);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line) as OllamaResponse;
              if (data.response) {
                callback({
                  content: data.response,
                  isComplete: data.done || false,
                  metadata: {
                    model: this.modelName,
                    processingTime: 0
                  }
                });
              }
              
              if (data.done) {
                // Update context for next request
                if (data.context) {
                  this.context = data.context;
                }
                return;
              }
            } catch (parseError) {
              console.warn('Failed to parse Ollama response line:', line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}