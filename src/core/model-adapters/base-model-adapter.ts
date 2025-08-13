/**
 * Base interfaces and types for AI model adapters
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata: {
    executionTime: number;
    toolName: string;
    parameters: Record<string, any>;
  };
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute(parameters: Record<string, any>): Promise<ToolResult>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  enum?: string[];
}

export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  metadata: ResponseMetadata;
}

export interface ResponseMetadata {
  model: string;
  tokensUsed?: number;
  processingTime: number;
  confidence?: number;
}

export interface ModelConfig {
  name: string;
  provider: string;
  endpoint?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  additionalParams?: Record<string, any>;
}

export interface ModelCapabilities {
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  supportsSystemPrompts: boolean;
  maxContextLength: number;
  supportedFormats: string[];
}

/**
 * Base interface for all model adapters
 */
export interface ModelAdapter {
  /**
   * Format a prompt with messages and available tools for the specific model
   */
  formatPrompt(messages: ChatMessage[], tools: Tool[]): string;

  /**
   * Parse the model's response into a structured AIResponse
   */
  parseResponse(response: string): AIResponse;

  /**
   * Send a request to the model and get the raw response
   */
  sendRequest(prompt: string): Promise<string>;

  /**
   * Check if the model supports tool calling
   */
  supportsToolCalling(): boolean;

  /**
   * Get the model's capabilities
   */
  getCapabilities(): ModelCapabilities;

  /**
   * Validate the model configuration
   */
  validateConfig(config: ModelConfig): Promise<boolean>;

  /**
   * Initialize the adapter with configuration
   */
  initialize(config: ModelConfig): Promise<void>;

  /**
   * Test connection to the model
   */
  testConnection(): Promise<boolean>;
}