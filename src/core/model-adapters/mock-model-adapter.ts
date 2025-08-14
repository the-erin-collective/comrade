import { AbstractModelAdapter } from './abstract-model-adapter';
import { ModelConfig, ModelCapabilities, ChatMessage, Tool, AIResponse, ToolCall, ResponseMetadata } from './base-model-adapter';

/**
 * Mock model adapter for testing streaming functionality
 */
export class MockModelAdapter extends AbstractModelAdapter {
  private responseDelay: number;
  private chunkSize: number;

  constructor() {
    super({
      supportsToolCalling: true,
      supportsStreaming: true,
      supportsSystemPrompts: true,
      maxContextLength: 4000,
      supportedFormats: ['text', 'json']
    });
    
    this.responseDelay = 50; // ms between chunks
    this.chunkSize = 5; // characters per chunk
  }

  /**
   * Format a prompt with messages and available tools
   */
  formatPrompt(messages: ChatMessage[], tools: Tool[] = []): string {
    return JSON.stringify({
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.toolCalls && { tool_calls: m.toolCalls }),
        ...(m.toolResults && { tool_results: m.toolResults })
      })),
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    }, null, 2);
  }

  /**
   * Parse the model's response
   */
  parseResponse(response: string): AIResponse {
    try {
      const parsed = JSON.parse(response);
      return {
        content: parsed.content || '',
        toolCalls: parsed.tool_calls,
        metadata: {
          model: this.config?.name || 'mock',
          processingTime: parsed.processing_time || 0,
          tokensUsed: parsed.tokens_used,
          confidence: parsed.confidence
        }
      };
    } catch (e) {
      // If not JSON, return as plain text
      return {
        content: response,
        metadata: {
          model: this.config?.name || 'mock',
          processingTime: 0,
          tokensUsed: response.length
        }
      };
    }
  }

  /**
   * Send a request to the model (non-streaming)
   */
  async sendRequest(prompt: string): Promise<string> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Return a mock response
    return JSON.stringify({
      content: 'This is a mock response to: ' + prompt.substring(0, 100) + '...',
      processing_time: 500,
      tokens_used: 100
    });
  }

  /**
   * Internal method for handling streaming requests
   */
  protected async _sendStreamingRequest(
    prompt: string,
    callback: (chunk: { content: string; isComplete: boolean; toolCalls?: ToolCall[] }) => void,
    signal: AbortSignal
  ): Promise<void> {
    const response = `This is a streaming mock response to: ${prompt.substring(0, 100)}...`;
    let position = 0;

    // Helper to check if we should abort
    const checkAborted = () => {
      if (signal.aborted) {
        throw new Error('Request was aborted');
      }
    };

    try {
      // Stream the response in chunks
      while (position < response.length) {
        checkAborted();
        
        // Get next chunk
        const chunk = response.substring(position, position + this.chunkSize);
        position += chunk.length;
        
        // Send chunk
        callback({
          content: chunk,
          isComplete: position >= response.length
        });
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, this.responseDelay));
      }
      
      // Final completion
      callback({
        content: '',
        isComplete: true,
        toolCalls: []
      });
      
    } catch (error) {
      if (error instanceof Error && error.message !== 'Request was aborted') {
        console.error('Error in streaming request:', error);
        throw error;
      }
      // Re-throw abort errors
      throw error;
    }
  }

  /**
   * Validate provider-specific configuration
   */
  protected async validateProviderConfig(config: ModelConfig): Promise<boolean> {
    // Mock adapter accepts any configuration
    return true;
  }
}
