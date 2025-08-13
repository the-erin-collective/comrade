import {
  ModelConfig,
  ModelCapabilities,
  ChatMessage,
  Tool,
  AIResponse,
  ToolCall
} from './base-model-adapter';
import { AbstractModelAdapter } from './abstract-model-adapter';

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
  private baseUrl: string;
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
    this.modelName = config.name;

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
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
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
   * Test connection to Ollama
   */
  async testConnection(): Promise<boolean> {
    try {
      // First, check if Ollama is running
      const healthResponse = await fetch(`${this.baseUrl}/api/tags`);
      if (!healthResponse.ok) {
        return false;
      }

      // Then check if the specific model is available
      if (this.modelName) {
        const modelsData = await healthResponse.json() as { models?: OllamaModelInfo[] };
        const modelExists = modelsData.models?.some((model: OllamaModelInfo) => 
          model.name === this.modelName || model.name.startsWith(this.modelName + ':')
        );
        
        if (!modelExists) {
          console.warn(`Model '${this.modelName}' not found in Ollama. Available models:`, 
            modelsData.models?.map((m: OllamaModelInfo) => m.name) || []);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Ollama connection test failed:', error);
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
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: this.modelName }),
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
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json() as { models?: OllamaModelInfo[] };
      return data.models?.map((model: OllamaModelInfo) => model.name) || [];
    } catch (error) {
      console.error('Failed to get available models:', error);
      return [];
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: modelName }),
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
}