import {
  ModelConfig,
  ModelCapabilities,
  ChatMessage,
  Tool,
  AIResponse,
  ToolCall,
  ToolParameter,
  StreamCallback
} from './base-model-adapter';
import { AbstractModelAdapter } from './abstract-model-adapter';

/**
 * Hugging Face API response interface
 */
interface HuggingFaceResponse {
  generated_text?: string;
  error?: string;
  estimated_time?: number;
}

/**
 * Hugging Face API request interface
 */
interface HuggingFaceRequest {
  inputs: string;
  parameters?: {
    temperature?: number;
    max_new_tokens?: number;
    top_p?: number;
    top_k?: number;
    do_sample?: boolean;
    stop?: string[];
    return_full_text?: boolean;
    stream?: boolean;
  };
  options?: {
    wait_for_model?: boolean;
    use_cache?: boolean;
  };
}

/**
 * Tool function schema for Hugging Face format
 */
interface HuggingFaceToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

/**
 * Model adapter for Hugging Face Inference API and compatible models
 * 
 * This adapter implements the specific tool calling format:
 * <AVAILABLE_TOOLS>{functions}</AVAILABLE_TOOLS>{user_prompt}
 * 
 * Features:
 * - Hugging Face Inference API integration
 * - Tool calling with specific XML-like format
 * - Tool call parsing from model responses
 * - Function schema generation
 * - Error handling for API failures
 */
export class HuggingFaceAdapter extends AbstractModelAdapter {
  private apiKey: string;
  private modelName: string;
  private baseUrl: string;

  constructor() {
    // Default capabilities for Hugging Face models
    const capabilities: ModelCapabilities = {
      supportsToolCalling: true,
      supportsStreaming: false, // Most HF models don't support streaming via Inference API
      supportsSystemPrompts: true,
      maxContextLength: 4096, // Will be updated based on model
      supportedFormats: ['text', 'json', 'xml']
    };

    super(capabilities);
    this.apiKey = '';
    this.modelName = '';
    this.baseUrl = 'https://api-inference.huggingface.co/models';
  }

  /**
   * Initialize the adapter with Hugging Face configuration
   */
  async initialize(config: ModelConfig): Promise<void> {
    await super.initialize(config);
    
    this.apiKey = config.apiKey || '';
    this.modelName = config.name;
    this.baseUrl = config.endpoint || 'https://api-inference.huggingface.co/models';

    // Test connection if API key is provided
    if (this.apiKey) {
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error(`Failed to connect to Hugging Face model '${this.modelName}'. Please check your API key and model name.`);
      }
    }

    // Update capabilities based on the specific model
    this.updateCapabilitiesFromModel();
  }

  /**
   * Format prompt for Hugging Face with the specific tool calling format:
   * <AVAILABLE_TOOLS>{functions}</AVAILABLE_TOOLS>{user_prompt}
   */
  formatPrompt(messages: ChatMessage[], tools: Tool[]): string {
    let prompt = '';

    // Add system prompt if available
    const systemMessages = messages.filter(m => m.role === 'system');
    if (systemMessages.length > 0) {
      prompt += systemMessages.map(m => m.content).join('\n') + '\n\n';
    }

    // Add available tools in the specific Hugging Face format
    if (tools.length > 0) {
      const toolFunctions = this.generateToolFunctionSchemas(tools);
      prompt += `<AVAILABLE_TOOLS>${JSON.stringify(toolFunctions)}</AVAILABLE_TOOLS>`;
    }

    // Get the latest user message
    const conversationMessages = messages.filter(m => m.role !== 'system');
    const latestUserMessage = conversationMessages
      .filter(m => m.role === 'user')
      .pop();

    if (latestUserMessage) {
      prompt += latestUserMessage.content;
    }

    // Add conversation context if there are previous messages
    if (conversationMessages.length > 1) {
      prompt += '\n\nConversation history:\n';
      
      // Add previous messages (excluding the latest user message)
      const previousMessages = conversationMessages.slice(0, -1);
      for (const message of previousMessages) {
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
        }
      }
    }

    return prompt;
  }

  /**
   * Parse Hugging Face response into structured AIResponse
   */
  parseResponse(response: string): AIResponse {
    const startTime = Date.now() - 100; // Approximate processing time
    
    // Parse tool calls from the response using multiple patterns
    const toolCalls = this.parseToolCallsFromResponse(response);
    
    // Clean the response content by removing tool call JSON blocks
    let cleanContent = response;
    if (toolCalls.length > 0) {
      // Remove JSON blocks that were parsed as tool calls
      cleanContent = this.removeToolCallsFromContent(response, toolCalls);
    }

    const metadata = this.createResponseMetadata(startTime, {
      tokensUsed: Math.ceil(response.length / 4) // Rough token estimate
    });

    return {
      content: cleanContent.trim(),
      toolCalls,
      metadata
    };
  }

  /**
   * Send request to Hugging Face Inference API
   */
  async sendRequest(prompt: string): Promise<string> {
    if (!this.config) {
      throw new Error('Adapter not initialized. Call initialize() first.');
    }

    const requestBody: HuggingFaceRequest = {
      inputs: prompt,
      parameters: {
        temperature: this.config.temperature || 0.7,
        max_new_tokens: this.config.maxTokens || 512,
        do_sample: true,
        return_full_text: false,
        stop: ['<|endoftext|>', '</s>', '<|end|>']
      },
      options: {
        wait_for_model: true,
        use_cache: false
      }
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/${this.modelName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hugging Face API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as HuggingFaceResponse | HuggingFaceResponse[];
      
      // Handle different response formats
      if (Array.isArray(data) && data.length > 0) {
        const result = data[0];
        if (result.error) {
          throw new Error(`Hugging Face model error: ${result.error}`);
        }
        return result.generated_text || '';
      } else if (!Array.isArray(data)) {
        if (data.error) {
          throw new Error(`Hugging Face model error: ${data.error}`);
        }
        return data.generated_text || '';
      }

      return '';
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Failed to connect to Hugging Face API. Please check your internet connection.`);
      }
      throw error;
    }
  }

  /**
   * Test connection to Hugging Face API
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        // Without API key, we can't test the connection properly
        return true; // Assume it will work
      }

      // Send a simple test request
      const testPrompt = 'Hello';
      const response = await this.sendRequest(testPrompt);
      return response.length > 0;
    } catch (error) {
      console.error('Hugging Face connection test failed:', error);
      return false;
    }
  }

  /**
   * Validate Hugging Face-specific configuration
   */
  protected async validateProviderConfig(config: ModelConfig): Promise<boolean> {
    // Validate provider
    if (config.provider !== 'huggingface') {
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

    // API key is optional for public models
    return true;
  }

  /**
   * Generate tool function schemas in Hugging Face format
   */
  private generateToolFunctionSchemas(tools: Tool[]): HuggingFaceToolFunction[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object' as const,
        properties: this.convertParametersToSchema(tool.parameters),
        required: tool.parameters.filter(p => p.required).map(p => p.name)
      }
    }));
  }

  /**
   * Convert tool parameters to JSON schema format
   */
  private convertParametersToSchema(parameters: ToolParameter[]): Record<string, any> {
    const schema: Record<string, any> = {};
    
    for (const param of parameters) {
      schema[param.name] = {
        type: param.type,
        description: param.description
      };
      
      if (param.enum) {
        schema[param.name].enum = param.enum;
      }
    }
    
    return schema;
  }

  /**
   * Parse tool calls from Hugging Face model response
   * Supports multiple formats: JSON blocks, function calls, etc.
   */
  private parseToolCallsFromResponse(response: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    
    // Pattern 1: JSON code blocks
    const jsonBlockPattern = /```json\s*(\{[^`]*\})\s*```/g;
    let match;
    
    while ((match = jsonBlockPattern.exec(response)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (this.isValidToolCall(parsed)) {
          toolCalls.push({
            id: this.generateToolCallId(),
            name: parsed.name,
            parameters: parsed.parameters || {}
          });
        }
      } catch (error) {
        // Ignore invalid JSON
      }
    }

    // Pattern 2: Direct JSON objects (without code blocks)
    if (toolCalls.length === 0) {
      // Find potential JSON objects by looking for opening braces and trying to parse
      const braceIndices: number[] = [];
      for (let i = 0; i < response.length; i++) {
        if (response[i] === '{') {
          braceIndices.push(i);
        }
      }
      
      for (const startIndex of braceIndices) {
        // Try to find a valid JSON object starting from this brace
        let braceCount = 0;
        let inString = false;
        let escaped = false;
        
        for (let i = startIndex; i < response.length; i++) {
          const char = response[i];
          
          if (escaped) {
            escaped = false;
            continue;
          }
          
          if (char === '\\') {
            escaped = true;
            continue;
          }
          
          if (char === '"') {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              
              if (braceCount === 0) {
                // Found a complete JSON object
                const jsonStr = response.substring(startIndex, i + 1);
                try {
                  const parsed = JSON.parse(jsonStr);
                  if (this.isValidToolCall(parsed)) {
                    toolCalls.push({
                      id: this.generateToolCallId(),
                      name: parsed.name,
                      parameters: parsed.parameters || {}
                    });
                  }
                } catch (error) {
                  // Ignore invalid JSON
                }
                break;
              }
            }
          }
        }
      }
    }

    // Pattern 3: Function call format: function_name(param1="value1", param2="value2")
    if (toolCalls.length === 0) {
      const functionCallPattern = /(\w+)\s*\(([^)]*)\)/g;
      
      while ((match = functionCallPattern.exec(response)) !== null) {
        const functionName = match[1];
        const paramsString = match[2];
        
        try {
          const parameters = this.parseFunctionParameters(paramsString);
          toolCalls.push({
            id: this.generateToolCallId(),
            name: functionName,
            parameters
          });
        } catch (error) {
          // Ignore invalid function calls
        }
      }
    }

    return toolCalls;
  }

  /**
   * Check if a parsed object is a valid tool call
   */
  private isValidToolCall(obj: any): boolean {
    return obj && 
           typeof obj === 'object' && 
           typeof obj.name === 'string' && 
           obj.name.length > 0;
  }

  /**
   * Parse function parameters from string format
   * Example: 'param1="value1", param2=123, param3=true'
   */
  private parseFunctionParameters(paramsString: string): Record<string, any> {
    const parameters: Record<string, any> = {};
    
    if (!paramsString.trim()) {
      return parameters;
    }

    // Split by comma, but be careful with quoted strings
    const paramPairs = paramsString.split(',').map(p => p.trim());
    
    for (const pair of paramPairs) {
      const equalIndex = pair.indexOf('=');
      if (equalIndex === -1) continue;
      
      const key = pair.substring(0, equalIndex).trim();
      let value = pair.substring(equalIndex + 1).trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Try to parse as number or boolean
      if (value === 'true') {
        parameters[key] = true;
      } else if (value === 'false') {
        parameters[key] = false;
      } else if (!isNaN(Number(value))) {
        parameters[key] = Number(value);
      } else {
        parameters[key] = value;
      }
    }
    
    return parameters;
  }

  /**
   * Remove tool call JSON blocks from response content
   */
  private removeToolCallsFromContent(content: string, toolCalls: ToolCall[]): string {
    let cleanContent = content;
    
    // Remove JSON code blocks
    cleanContent = cleanContent.replace(/```json\s*\{[^`]*\}\s*```/g, '');
    
    // Remove direct JSON objects that match tool calls
    for (const toolCall of toolCalls) {
      const jsonPattern = new RegExp(`\\{[^{}]*"name"\\s*:\\s*"${toolCall.name}"[^{}]*\\}`, 'g');
      cleanContent = cleanContent.replace(jsonPattern, '');
    }
    
    // Clean up extra whitespace
    cleanContent = cleanContent.replace(/\n\s*\n/g, '\n').trim();
    
    return cleanContent;
  }

  /**
   * Update capabilities based on the specific Hugging Face model
   */
  private updateCapabilitiesFromModel(): void {
    const modelName = this.modelName.toLowerCase();
    
    // Estimate context length based on model name
    let contextLength = 4096; // Default
    
    if (modelName.includes('llama') || modelName.includes('mistral')) {
      contextLength = 8192;
    } else if (modelName.includes('gpt') || modelName.includes('claude')) {
      contextLength = 8192;
    } else if (modelName.includes('code') || modelName.includes('starcoder')) {
      contextLength = 8192;
    }

    // Most modern models support tool calling
    const supportsTools = !modelName.includes('gpt2') && !modelName.includes('bert');

    this.capabilities = {
      ...this.capabilities,
      supportsToolCalling: supportsTools,
      maxContextLength: contextLength
    };
  }

  /**
   * Get the formatted tool schema for debugging
   */
  getToolSchema(tools: Tool[]): string {
    const toolFunctions = this.generateToolFunctionSchemas(tools);
    return JSON.stringify(toolFunctions, null, 2);
  }

  /**
   * Format a single tool for the AVAILABLE_TOOLS section
   */
  formatSingleTool(tool: Tool): HuggingFaceToolFunction {
    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: this.convertParametersToSchema(tool.parameters),
        required: tool.parameters.filter(p => p.required).map(p => p.name)
      }
    };
  }

  /**
   * Internal streaming request implementation
   */
  protected async _sendStreamingRequest(
    prompt: string,
    callback: StreamCallback,
    signal: AbortSignal
  ): Promise<void> {
    if (!this.config?.apiKey) {
      throw new Error('HuggingFace API key not configured');
    }

    const requestBody: HuggingFaceRequest = {
      inputs: prompt,
      parameters: {
        max_new_tokens: this.config.maxTokens || 512,
        temperature: this.config.temperature || 0.7,
        return_full_text: false,
        stream: true
      }
    };

    const response = await fetch(`${this.baseUrl}/${this.modelName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HuggingFace API error: ${response.status} ${response.statusText} - ${errorText}`);
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
          if (line.trim() && line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6); // Remove 'data: ' prefix
              if (jsonStr === '[DONE]') {
                return;
              }
              
              const data = JSON.parse(jsonStr);
              if (data.token && data.token.text) {
                callback({
                  content: data.token.text,
                  isComplete: data.generated_text !== undefined,
                  metadata: {
                    model: this.config.name || 'huggingface',
                    processingTime: 0
                  }
                });
              }
            } catch (parseError) {
              console.warn('Failed to parse HuggingFace response line:', line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}