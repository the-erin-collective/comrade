import {
  ModelAdapter,
  ModelConfig,
  ModelCapabilities,
  ChatMessage,
  Tool,
  AIResponse,
  ToolCall,
  ResponseMetadata
} from './base-model-adapter';

/**
 * Abstract base class providing common functionality for model adapters
 */
export abstract class AbstractModelAdapter implements ModelAdapter {
  protected config: ModelConfig | null = null;
  protected capabilities: ModelCapabilities;

  constructor(capabilities: ModelCapabilities) {
    this.capabilities = capabilities;
  }

  /**
   * Initialize the adapter with configuration
   */
  async initialize(config: ModelConfig): Promise<void> {
    const isValid = await this.validateConfig(config);
    if (!isValid) {
      throw new Error(`Invalid configuration for model adapter: ${config.name}`);
    }
    this.config = config;
  }

  /**
   * Get the model's capabilities
   */
  getCapabilities(): ModelCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Check if the model supports tool calling
   */
  supportsToolCalling(): boolean {
    return this.capabilities.supportsToolCalling;
  }

  /**
   * Validate basic configuration requirements
   */
  async validateConfig(config: ModelConfig): Promise<boolean> {
    try {
      // Basic validation
      if (!config.name || !config.provider) {
        return false;
      }

      // Provider-specific validation should be implemented by subclasses
      return await this.validateProviderConfig(config);
    } catch (error) {
      console.error('Configuration validation error:', error);
      return false;
    }
  }

  /**
   * Test connection to the model
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.config) {
        return false;
      }

      // Send a simple test message
      const testPrompt = this.formatPrompt([{
        role: 'user',
        content: 'Hello',
        timestamp: new Date()
      }], []);

      const response = await this.sendRequest(testPrompt);
      return response.length > 0;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  /**
   * Create response metadata with timing information
   */
  protected createResponseMetadata(startTime: number, additionalMetadata?: Partial<ResponseMetadata>): ResponseMetadata {
    const processingTime = Date.now() - startTime;
    
    return {
      model: this.config?.name || 'unknown',
      processingTime,
      ...additionalMetadata
    };
  }

  /**
   * Parse tool calls from response content using common patterns
   */
  protected parseToolCallsFromContent(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    
    // Look for JSON tool call patterns
    const jsonPattern = /```json\s*(\{[^`]*\})\s*```/g;
    let match;
    
    while ((match = jsonPattern.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.name && parsed.parameters) {
          toolCalls.push({
            id: this.generateToolCallId(),
            name: parsed.name,
            parameters: parsed.parameters
          });
        }
      } catch (error) {
        // Ignore invalid JSON
      }
    }

    return toolCalls;
  }

  /**
   * Generate a unique tool call ID
   */
  protected generateToolCallId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitize and validate tool parameters
   */
  protected validateToolParameters(toolCall: ToolCall, availableTools: Tool[]): boolean {
    const tool = availableTools.find(t => t.name === toolCall.name);
    if (!tool) {
      return false;
    }

    // Check required parameters
    for (const param of tool.parameters) {
      if (param.required && !(param.name in toolCall.parameters)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Format tools for inclusion in prompts (basic JSON format)
   */
  protected formatToolsAsJson(tools: Tool[]): string {
    return JSON.stringify(tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters.reduce((acc, param) => {
        acc[param.name] = {
          type: param.type,
          description: param.description,
          required: param.required,
          ...(param.enum && { enum: param.enum })
        };
        return acc;
      }, {} as Record<string, any>)
    })), null, 2);
  }

  // Abstract methods that must be implemented by subclasses

  /**
   * Format a prompt with messages and available tools for the specific model
   */
  abstract formatPrompt(messages: ChatMessage[], tools: Tool[]): string;

  /**
   * Parse the model's response into a structured AIResponse
   */
  abstract parseResponse(response: string): AIResponse;

  /**
   * Send a request to the model and get the raw response
   */
  abstract sendRequest(prompt: string): Promise<string>;

  /**
   * Validate provider-specific configuration
   */
  protected abstract validateProviderConfig(config: ModelConfig): Promise<boolean>;
}