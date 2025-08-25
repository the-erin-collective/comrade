/**
 * Base interfaces and types for AI model adapters
 */

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  isStreaming?: boolean;
  isComplete?: boolean;
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
    timestamp: Date;
    // Additional properties for specific tools
    stderr?: string;
    exitCode?: number;
    [key: string]: any; // Allow additional metadata
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
  default?: any; // Default value for the parameter
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
  timeout?: number;
  additionalParams?: Record<string, any>;
}

export interface ModelCapabilities {
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  supportsSystemPrompts: boolean;
  maxContextLength: number;
  supportedFormats: string[];
  preferStreaming?: boolean; // Whether this model works better with streaming
}

/**
 * Callback for streaming responses
 */
export type StreamCallback = (chunk: {
  content: string;
  isComplete: boolean;
  toolCalls?: ToolCall[];
  metadata?: Partial<ResponseMetadata>;
}) => void;

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
   * Send a streaming request to the model
   * @param prompt The prompt to send
   * @param callback Callback for streamed chunks
   * @returns Promise that resolves when streaming is complete
   */
  sendStreamingRequest(prompt: string, callback: StreamCallback): Promise<void>;

  /**
   * Check if the model supports tool calling
   */
  supportsToolCalling(): boolean;
  
  /**
   * Check if the model supports streaming responses
   */
  supportsStreaming(): boolean;

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