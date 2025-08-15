import { describe, it, beforeEach, afterEach } from 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  ModelConfig,
  ModelCapabilities,
  ChatMessage,
  Tool,
  AIResponse,
  AbstractModelAdapter,
  ModelCapabilityDetector
} from '../../core/model-adapters';

// Mock implementation for testing
class MockModelAdapter extends AbstractModelAdapter {
  private mockResponses: string[] = [];
  private responseIndex = 0;

  constructor(capabilities: ModelCapabilities, mockResponses: string[] = []) {
    super(capabilities);
    this.mockResponses = mockResponses;
  }

  setMockResponses(responses: string[]) {
    this.mockResponses = responses;
    this.responseIndex = 0;
  }

  protected async _sendStreamingRequest(
    prompt: string,
    callback: (chunk: { content: string; isComplete: boolean }) => void,
    signal: AbortSignal
  ): Promise<void> {
    const response = this.mockResponses[this.responseIndex] || 'Mock response';
    this.responseIndex = (this.responseIndex + 1) % this.mockResponses.length;
    
    // Simulate streaming by sending chunks
    const chunks = response.split(' ');
    for (let i = 0; i < chunks.length; i++) {
      if (signal.aborted) {
        throw new Error('Request was aborted');
      }
      callback({
        content: chunks[i] + (i < chunks.length - 1 ? ' ' : ''),
        isComplete: i === chunks.length - 1
      });
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  formatPrompt(messages: ChatMessage[], tools: Tool[]): string {
    const messageText = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const toolText = tools.length > 0 ? `\nTools: ${this.formatToolsAsJson(tools)}` : '';
    return messageText + toolText;
  }

  parseResponse(response: string): AIResponse {
    const startTime = Date.now() - 100; // Mock processing time
    const toolCalls = this.parseToolCallsFromContent(response);
    
    return {
      content: response,
      toolCalls,
      metadata: this.createResponseMetadata(startTime, {
        tokensUsed: response.length / 4 // Rough estimate
      })
    };
  }

  async sendRequest(_prompt: string): Promise<string> {
    if (this.responseIndex >= this.mockResponses.length) {
      throw new Error('No more mock responses available');
    }
    
    const response = this.mockResponses[this.responseIndex];
    this.responseIndex++;
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    return response;
  }

  protected async validateProviderConfig(config: ModelConfig): Promise<boolean> {
    return config.name.length > 0 && config.provider === 'mock';
  }
}

describe('Model Adapter System', () => {
  let mockAdapter: MockModelAdapter;
  let testConfig: ModelConfig;
  let testCapabilities: ModelCapabilities;

  beforeEach(() => {
    testCapabilities = {
      supportsToolCalling: true,
      supportsStreaming: false,
      supportsSystemPrompts: true,
      maxContextLength: 4096,
      supportedFormats: ['text', 'json']
    };

    testConfig = {
      name: 'test-model',
      provider: 'mock',
      temperature: 0.7,
      maxTokens: 2048
    };

    mockAdapter = new MockModelAdapter(testCapabilities, ['Hello, how can I help you?']);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('AbstractModelAdapter', () => {
    it('should initialize with valid configuration', async () => {
      await mockAdapter.initialize(testConfig);
      assert.deepStrictEqual(mockAdapter.getCapabilities(), testCapabilities);
    });

    it('should reject invalid configuration', async () => {
      const invalidConfig = { name: '', provider: 'mock' };
      try {
        await mockAdapter.initialize(invalidConfig as ModelConfig);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it('should return correct capabilities', () => {
      const capabilities = mockAdapter.getCapabilities();
      assert.deepStrictEqual(capabilities, testCapabilities);
      assert.strictEqual(mockAdapter.supportsToolCalling(), true);
    });

    it('should test connection successfully', async () => {
      await mockAdapter.initialize(testConfig);
      const connectionTest = await mockAdapter.testConnection();
      assert.strictEqual(connectionTest, true);
    });

    it('should fail connection test without initialization', async () => {
      const connectionTest = await mockAdapter.testConnection();
      assert.strictEqual(connectionTest, false);
    });

    it('should format prompt with messages and tools', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello', timestamp: new Date() }
      ];
      
      const tools: Tool[] = [
        {
          name: 'test_tool',
          description: 'A test tool',
          parameters: [
            { name: 'input', type: 'string', description: 'Test input', required: true }
          ],
          execute: async () => ({ success: true, output: 'test', metadata: { executionTime: 0, toolName: 'test_tool', parameters: {} } })
        }
      ];

      const prompt = mockAdapter.formatPrompt(messages, tools);
      assert.ok(prompt.includes('user: Hello'));
      assert.ok(prompt.includes('test_tool'));
    });

    it('should parse response with tool calls', () => {
      const responseWithToolCall = `Here's the result:
\`\`\`json
{
  "name": "test_function",
  "parameters": {
    "input": "hello"
  }
}
\`\`\``;

      const parsed = mockAdapter.parseResponse(responseWithToolCall);
      assert.strictEqual(parsed.content, responseWithToolCall);
      assert.strictEqual(parsed.toolCalls!.length, 1);
      assert.strictEqual(parsed.toolCalls![0].name, 'test_function');
      assert.strictEqual(parsed.toolCalls![0].parameters.input, 'hello');
      assert.ok(parsed.metadata.processingTime > 0);
    });

    it('should generate unique tool call IDs', () => {
      const id1 = (mockAdapter as any).generateToolCallId();
      const id2 = (mockAdapter as any).generateToolCallId();
      assert.notStrictEqual(id1, id2);
      assert.ok(/^tool_\d+_[a-z0-9]+$/.test(id1));
    });

    it('should validate tool parameters correctly', () => {
      const tools: Tool[] = [
        {
          name: 'test_tool',
          description: 'A test tool',
          parameters: [
            { name: 'required_param', type: 'string', description: 'Required parameter', required: true },
            { name: 'optional_param', type: 'string', description: 'Optional parameter', required: false }
          ],
          execute: async () => ({ success: true, output: 'test', metadata: { executionTime: 0, toolName: 'test_tool', parameters: {} } })
        }
      ];

      const validToolCall = {
        id: 'test_id',
        name: 'test_tool',
        parameters: { required_param: 'value' }
      };

      const invalidToolCall = {
        id: 'test_id',
        name: 'test_tool',
        parameters: {} // Missing required parameter
      };

      assert.strictEqual((mockAdapter as any).validateToolParameters(validToolCall, tools), true);
      assert.strictEqual((mockAdapter as any).validateToolParameters(invalidToolCall, tools), false);
    });

    it('should format tools as JSON correctly', () => {
      const tools: Tool[] = [
        {
          name: 'test_tool',
          description: 'A test tool',
          parameters: [
            { name: 'input', type: 'string', description: 'Test input', required: true }
          ],
          execute: async () => ({ success: true, output: 'test', metadata: { executionTime: 0, toolName: 'test_tool', parameters: {} } })
        }
      ];

      const formatted = (mockAdapter as any).formatToolsAsJson(tools);
      const parsed = JSON.parse(formatted);
      
      assert.strictEqual(parsed.length, 1);
      assert.strictEqual(parsed[0].name, 'test_tool');
      assert.strictEqual(parsed[0].description, 'A test tool');
      assert.strictEqual(parsed[0].parameters.input.type, 'string');
      assert.strictEqual(parsed[0].parameters.input.required, true);
    });
  });

  describe('ModelCapabilityDetector', () => {
    it('should detect basic capabilities', async () => {
      const mockAdapterForDetection = new MockModelAdapter(
        { ...testCapabilities, supportsToolCalling: false },
        ['Hello']
      );
      
      await mockAdapterForDetection.initialize(testConfig);
      
      // Mock the supportsToolCalling method to return false
      sinon.stub(mockAdapterForDetection, 'supportsToolCalling').returns(false);
      
      const detected = await ModelCapabilityDetector.detectCapabilities(mockAdapterForDetection);
      
      assert.strictEqual(detected.supportsToolCalling, false);
      assert.ok(detected.supportedFormats.includes('text'));
    });

    it('should validate minimum capabilities correctly', () => {
      const requirements: Partial<ModelCapabilities> = {
        supportsToolCalling: true,
        maxContextLength: 2048
      };

      const validCapabilities: ModelCapabilities = {
        supportsToolCalling: true,
        supportsStreaming: false,
        supportsSystemPrompts: true,
        maxContextLength: 4096,
        supportedFormats: ['text']
      };

      const invalidCapabilities: ModelCapabilities = {
        supportsToolCalling: false,
        supportsStreaming: false,
        supportsSystemPrompts: true,
        maxContextLength: 1024,
        supportedFormats: ['text']
      };

      const validResult = ModelCapabilityDetector.validateMinimumCapabilities(validCapabilities, requirements);
      assert.strictEqual(validResult.valid, true);
      assert.strictEqual(validResult.missingCapabilities.length, 0);

      const invalidResult = ModelCapabilityDetector.validateMinimumCapabilities(invalidCapabilities, requirements);
      assert.strictEqual(invalidResult.valid, false);
      assert.ok(invalidResult.missingCapabilities.includes('tool calling'));
    });

    it('should generate recommended configuration', () => {
      const capabilities: ModelCapabilities = {
        supportsToolCalling: true,
        supportsStreaming: false,
        supportsSystemPrompts: true,
        maxContextLength: 4096,
        supportedFormats: ['text', 'json']
      };

      const recommended = ModelCapabilityDetector.getRecommendedConfig(capabilities);
      
      assert.strictEqual(recommended.maxTokens, Math.floor(4096 * 0.8));
      assert.strictEqual(recommended.temperature, undefined); // Should not set temperature for tool-calling models
    });

    it('should set conservative temperature for non-tool-calling models', () => {
      const capabilities: ModelCapabilities = {
        supportsToolCalling: false,
        supportsStreaming: false,
        supportsSystemPrompts: true,
        maxContextLength: 2048,
        supportedFormats: ['text']
      };

      const recommended = ModelCapabilityDetector.getRecommendedConfig(capabilities);
      
      assert.strictEqual(recommended.temperature, 0.1);
    });
  });

  describe('Error Handling', () => {
    it('should handle sendRequest failures gracefully', async () => {
      const failingAdapter = new MockModelAdapter(testCapabilities, []);
      await failingAdapter.initialize(testConfig);
      
      try {
        await failingAdapter.sendRequest('test');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('No more mock responses available'));
      }
    });

    it('should handle malformed JSON in tool calls', () => {
      const responseWithBadJson = `Here's the result:
\`\`\`json
{
  "name": "test_function"
  "parameters": {
    "input": "hello"
  // Missing closing brace
\`\`\``;

      const parsed = mockAdapter.parseResponse(responseWithBadJson);
      assert.strictEqual(parsed.toolCalls!.length, 0); // Should ignore malformed JSON
    });

    it('should handle capability detection errors gracefully', async () => {
      const errorAdapter = new MockModelAdapter(testCapabilities, []);
      
      // Don't initialize the adapter to cause errors
      const detected = await ModelCapabilityDetector.detectCapabilities(errorAdapter);
      
      // Should return default capabilities without throwing
      assert.strictEqual(detected.supportsToolCalling, false);
      assert.ok(detected.maxContextLength >= 1024); // Should be at least the minimum
    });
  });
});