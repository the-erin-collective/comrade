import { ModelAdapter, ModelCapabilities, ModelConfig } from './base-model-adapter';

/**
 * Utility class for detecting and validating model capabilities
 */
export class ModelCapabilityDetector {
  /**
   * Detect capabilities by testing the model with various prompts
   */
  static async detectCapabilities(adapter: ModelAdapter): Promise<ModelCapabilities> {
    const capabilities: ModelCapabilities = {
      supportsToolCalling: false,
      supportsStreaming: false,
      supportsSystemPrompts: false,
      maxContextLength: 4096, // Default conservative estimate
      supportedFormats: ['text']
    };

    try {
      // Test tool calling support
      capabilities.supportsToolCalling = await this.testToolCallingSupport(adapter);
      
      // Test system prompt support
      capabilities.supportsSystemPrompts = await this.testSystemPromptSupport(adapter);
      
      // Estimate context length
      capabilities.maxContextLength = await this.estimateContextLength(adapter);
      
      // Detect supported formats
      capabilities.supportedFormats = await this.detectSupportedFormats(adapter);
      
    } catch (error) {
      console.warn('Error detecting model capabilities:', error);
    }

    return capabilities;
  }

  /**
   * Test if the model supports tool calling
   */
  private static async testToolCallingSupport(adapter: ModelAdapter): Promise<boolean> {
    try {
      // If adapter claims to support tool calling, test it
      if (!adapter.supportsToolCalling()) {
        return false;
      }

      const testTools = [{
        name: 'test_function',
        description: 'A test function',
        parameters: [{
          name: 'input',
          type: 'string' as const,
          description: 'Test input',
          required: true
        }],
        execute: async () => ({ success: true, output: 'test', metadata: { executionTime: 0, toolName: 'test_function', parameters: {}, timestamp: new Date() } })
      }];

      const testMessages = [{
        role: 'user' as const,
        content: 'Please call the test_function with input "hello"',
        timestamp: new Date()
      }];

      const prompt = adapter.formatPrompt(testMessages, testTools);
      const response = await adapter.sendRequest(prompt);
      const parsedResponse = adapter.parseResponse(response);

      return !!(parsedResponse.toolCalls && parsedResponse.toolCalls.length > 0);
    } catch (error) {
      return false;
    }
  }

  /**
   * Test if the model supports system prompts
   */
  private static async testSystemPromptSupport(adapter: ModelAdapter): Promise<boolean> {
    try {
      const testMessages = [
        {
          role: 'system' as const,
          content: 'You are a helpful assistant. Always respond with "SYSTEM_PROMPT_WORKS".',
          timestamp: new Date()
        },
        {
          role: 'user' as const,
          content: 'Hello',
          timestamp: new Date()
        }
      ];

      const prompt = adapter.formatPrompt(testMessages, []);
      const response = await adapter.sendRequest(prompt);
      
      return response.includes('SYSTEM_PROMPT_WORKS');
    } catch (error) {
      return false;
    }
  }

  /**
   * Estimate the model's context length by testing with increasingly long prompts
   */
  private static async estimateContextLength(adapter: ModelAdapter): Promise<number> {
    const testSizes = [1024, 2048, 4096, 8192, 16384, 32768];
    let maxWorkingSize = 1024;

    for (const size of testSizes) {
      try {
        const longContent = 'x'.repeat(size);
        const testMessages = [{
          role: 'user' as const,
          content: longContent,
          timestamp: new Date()
        }];

        const prompt = adapter.formatPrompt(testMessages, []);
        await adapter.sendRequest(prompt);
        maxWorkingSize = size;
      } catch (error) {
        // If we hit an error, the previous size was likely the limit
        break;
      }
    }

    return maxWorkingSize;
  }

  /**
   * Detect supported formats by testing different input types
   */
  private static async detectSupportedFormats(adapter: ModelAdapter): Promise<string[]> {
    const formats = ['text'];

    // Test JSON format support
    try {
      const jsonMessage = {
        role: 'user' as const,
        content: JSON.stringify({ message: 'Hello', format: 'json' }),
        timestamp: new Date()
      };

      const prompt = adapter.formatPrompt([jsonMessage], []);
      const response = await adapter.sendRequest(prompt);
      
      if (response.length > 0) {
        formats.push('json');
      }
    } catch (error) {
      // JSON not supported
    }

    return formats;
  }

  /**
   * Validate that a model meets minimum capability requirements
   */
  static validateMinimumCapabilities(
    capabilities: ModelCapabilities,
    requirements: Partial<ModelCapabilities>
  ): { valid: boolean; missingCapabilities: string[] } {
    const missing: string[] = [];

    if (requirements.supportsToolCalling && !capabilities.supportsToolCalling) {
      missing.push('tool calling');
    }

    if (requirements.supportsStreaming && !capabilities.supportsStreaming) {
      missing.push('streaming');
    }

    if (requirements.supportsSystemPrompts && !capabilities.supportsSystemPrompts) {
      missing.push('system prompts');
    }

    if (requirements.maxContextLength && capabilities.maxContextLength < requirements.maxContextLength) {
      missing.push(`context length (required: ${requirements.maxContextLength}, available: ${capabilities.maxContextLength})`);
    }

    if (requirements.supportedFormats) {
      const missingFormats = requirements.supportedFormats.filter(
        format => !capabilities.supportedFormats.includes(format)
      );
      if (missingFormats.length > 0) {
        missing.push(`formats: ${missingFormats.join(', ')}`);
      }
    }

    return {
      valid: missing.length === 0,
      missingCapabilities: missing
    };
  }

  /**
   * Get recommended configuration based on detected capabilities
   */
  static getRecommendedConfig(capabilities: ModelCapabilities): Partial<ModelConfig> {
    const config: Partial<ModelConfig> = {};

    // Adjust max tokens based on context length
    if (capabilities.maxContextLength > 0) {
      config.maxTokens = Math.floor(capabilities.maxContextLength * 0.8); // Leave 20% buffer
    }

    // Set conservative temperature for models with unknown capabilities
    if (!capabilities.supportsToolCalling) {
      config.temperature = 0.1; // Lower temperature for more deterministic responses
    }

    return config;
  }
}