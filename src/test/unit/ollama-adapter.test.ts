import * as assert from 'assert';
import * as sinon from 'sinon';
import { OllamaAdapter } from '../../core/model-adapters/ollama-adapter';
import { ModelConfig, ChatMessage, Tool } from '../../core/model-adapters';

describe('OllamaAdapter', () => {
  let adapter: OllamaAdapter;
  let fetchStub: sinon.SinonStub;
  let testConfig: ModelConfig;

  beforeEach(() => {
    adapter = new OllamaAdapter();
    
    testConfig = {
      name: 'llama3.1',
      provider: 'ollama',
      endpoint: 'http://localhost:11434',
      temperature: 0.7,
      maxTokens: 2048
    };

    // Stub fetch globally
    fetchStub = sinon.stub(global, 'fetch' as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Initialization', () => {
    it('should initialize with valid Ollama configuration', async () => {
      // Mock successful connection test
      fetchStub.onFirstCall().resolves({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.1:latest' }]
        })
      } as Response);

      // Mock model info request
      fetchStub.onSecondCall().resolves({
        ok: true,
        json: async () => ({
          details: {
            parameter_size: '8B',
            family: 'llama'
          }
        })
      } as Response);

      await adapter.initialize(testConfig);
      
      const capabilities = adapter.getCapabilities();
      assert.strictEqual(capabilities.supportsStreaming, true);
      assert.strictEqual(capabilities.supportsSystemPrompts, true);
    });

    it('should reject invalid provider configuration', async () => {
      const invalidConfig = { ...testConfig, provider: 'openai' };
      
      try {
        await adapter.initialize(invalidConfig);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Invalid configuration'));
      }
    });

    it('should reject empty model name', async () => {
      const invalidConfig = { ...testConfig, name: '' };
      
      try {
        await adapter.initialize(invalidConfig);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    });

    it('should handle connection failure during initialization', async () => {
      // Mock failed connection
      fetchStub.resolves({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response);

      try {
        await adapter.initialize(testConfig);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Failed to connect to Ollama'));
      }
    });

    it('should handle missing model during initialization', async () => {
      // Mock successful connection but missing model
      fetchStub.resolves({
        ok: true,
        json: async () => ({
          models: [{ name: 'different-model:latest' }]
        })
      } as Response);

      try {
        await adapter.initialize(testConfig);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Failed to connect to Ollama'));
      }
    });
  });

  describe('Prompt Formatting', () => {
    beforeEach(async () => {
      // Mock successful initialization
      fetchStub.onFirstCall().resolves({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.1:latest' }]
        })
      } as Response);

      fetchStub.onSecondCall().resolves({
        ok: true,
        json: async () => ({
          details: { parameter_size: '8B' }
        })
      } as Response);

      await adapter.initialize(testConfig);
    });

    it('should format basic conversation prompt', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello, how are you?', timestamp: new Date() }
      ];

      const prompt = adapter.formatPrompt(messages, []);
      
      assert.ok(prompt.includes('Human: Hello, how are you?'));
      assert.ok(prompt.includes('Assistant: '));
    });

    it('should include system prompts', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.', timestamp: new Date() },
        { role: 'user', content: 'Hello', timestamp: new Date() }
      ];

      const prompt = adapter.formatPrompt(messages, []);
      
      assert.ok(prompt.includes('You are a helpful assistant.'));
      assert.ok(prompt.includes('Human: Hello'));
    });

    it('should include tools when model supports tool calling', () => {
      // Force tool calling support for this test
      (adapter as any).capabilities.supportsToolCalling = true;

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Help me read a file', timestamp: new Date() }
      ];

      const tools: Tool[] = [
        {
          name: 'read_file',
          description: 'Read contents of a file',
          parameters: [
            { name: 'path', type: 'string', description: 'File path', required: true }
          ],
          execute: async () => ({ success: true, output: 'file content', metadata: { executionTime: 0, toolName: 'read_file', parameters: {} } })
        }
      ];

      const prompt = adapter.formatPrompt(messages, tools);
      
      assert.ok(prompt.includes('Available tools:'));
      assert.ok(prompt.includes('read_file'));
      assert.ok(prompt.includes('To use a tool, respond with JSON'));
    });

    it('should format conversation history correctly', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'First message', timestamp: new Date() },
        { role: 'assistant', content: 'First response', timestamp: new Date() },
        { role: 'user', content: 'Second message', timestamp: new Date() }
      ];

      const prompt = adapter.formatPrompt(messages, []);
      
      assert.ok(prompt.includes('Human: First message'));
      assert.ok(prompt.includes('Assistant: First response'));
      assert.ok(prompt.includes('Human: Second message'));
      assert.ok(prompt.endsWith('Assistant: '));
    });

    it('should include tool results in conversation history', () => {
      const toolResult = {
        success: true,
        output: 'File contents here',
        metadata: {
          executionTime: 100,
          toolName: 'read_file',
          parameters: { path: 'test.txt' }
        }
      };

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Read the file', timestamp: new Date() },
        { 
          role: 'assistant', 
          content: 'I\'ll read the file for you', 
          timestamp: new Date(),
          toolResults: [toolResult]
        }
      ];

      const prompt = adapter.formatPrompt(messages, []);
      
      assert.ok(prompt.includes('Tool Result (read_file): File contents here'));
    });
  });

  describe('Response Parsing', () => {
    it('should parse basic text response', () => {
      const responseText = 'Hello! How can I help you today?';
      const parsed = adapter.parseResponse(responseText);
      
      assert.strictEqual(parsed.content, responseText);
      assert.strictEqual(parsed.toolCalls?.length || 0, 0);
      assert.ok(parsed.metadata.processingTime >= 0);
      assert.ok(parsed.metadata.tokensUsed && parsed.metadata.tokensUsed > 0);
    });

    it('should parse response with tool calls', () => {
      const responseWithTool = `I'll help you read that file.

\`\`\`json
{
  "name": "read_file",
  "parameters": {
    "path": "test.txt"
  }
}
\`\`\``;

      const parsed = adapter.parseResponse(responseWithTool);
      
      assert.strictEqual(parsed.content, responseWithTool);
      assert.strictEqual(parsed.toolCalls!.length, 1);
      assert.strictEqual(parsed.toolCalls![0].name, 'read_file');
      assert.strictEqual(parsed.toolCalls![0].parameters.path, 'test.txt');
      assert.ok(parsed.toolCalls![0].id.startsWith('tool_'));
    });

    it('should handle multiple tool calls in response', () => {
      const responseWithMultipleTools = `I'll help you with both tasks.

\`\`\`json
{
  "name": "read_file",
  "parameters": {
    "path": "file1.txt"
  }
}
\`\`\`

\`\`\`json
{
  "name": "write_file",
  "parameters": {
    "path": "file2.txt",
    "content": "Hello world"
  }
}
\`\`\``;

      const parsed = adapter.parseResponse(responseWithMultipleTools);
      
      assert.strictEqual(parsed.toolCalls!.length, 2);
      assert.strictEqual(parsed.toolCalls![0].name, 'read_file');
      assert.strictEqual(parsed.toolCalls![1].name, 'write_file');
    });

    it('should ignore malformed JSON tool calls', () => {
      const responseWithBadJson = `Here's the result:

\`\`\`json
{
  "name": "read_file"
  "parameters": {
    "path": "test.txt"
  // Missing closing brace
\`\`\``;

      const parsed = adapter.parseResponse(responseWithBadJson);
      
      assert.strictEqual(parsed.toolCalls!.length, 0);
    });
  });

  describe('API Communication', () => {
    beforeEach(async () => {
      // Mock successful initialization
      fetchStub.onFirstCall().resolves({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.1:latest' }]
        })
      } as Response);

      fetchStub.onSecondCall().resolves({
        ok: true,
        json: async () => ({
          details: { parameter_size: '8B' }
        })
      } as Response);

      await adapter.initialize(testConfig);
      fetchStub.reset(); // Reset to clear initialization calls
    });

    it('should send request to Ollama API successfully', async () => {
      const mockResponse = {
        model: 'llama3.1',
        created_at: '2024-01-01T00:00:00Z',
        response: 'Hello! How can I help you?',
        done: true,
        context: [1, 2, 3, 4, 5]
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockResponse
      } as Response);

      const result = await adapter.sendRequest('Hello');
      
      assert.strictEqual(result, 'Hello! How can I help you?');
      assert.ok(fetchStub.calledOnce);
      
      const [url, options] = fetchStub.firstCall.args;
      assert.strictEqual(url, 'http://localhost:11434/api/generate');
      assert.strictEqual(options.method, 'POST');
      
      const requestBody = JSON.parse(options.body);
      assert.strictEqual(requestBody.model, 'llama3.1');
      assert.strictEqual(requestBody.prompt, 'Hello');
      assert.strictEqual(requestBody.stream, false);
    });

    it('should handle API errors gracefully', async () => {
      fetchStub.resolves({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response);

      try {
        await adapter.sendRequest('Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Ollama API error: 500'));
      }
    });

    it('should parse detailed error messages from Ollama API', async () => {
      fetchStub.resolves({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'model requires more system memory (11.3 GiB) than is available (6.3 GiB)' })
      } as Response);

      try {
        await adapter.sendRequest('Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('model requires more system memory'));
        assert.ok(error.message.includes('Close other applications to free up memory'));
        assert.ok(error.message.includes('Try a smaller model'));
      }
    });

    it('should provide helpful suggestions for model not found errors', async () => {
      fetchStub.resolves({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'model "nonexistent:latest" not found' })
      } as Response);

      try {
        await adapter.sendRequest('Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('model "nonexistent:latest" not found'));
        assert.ok(error.message.includes('ollama pull'));
      }
    });

    it('should handle network connection errors', async () => {
      fetchStub.rejects(new TypeError('Failed to fetch'));

      try {
        await adapter.sendRequest('Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Failed to connect to Ollama'));
      }
    });

    it('should include context in subsequent requests', async () => {
      const mockResponse1 = {
        model: 'llama3.1',
        response: 'First response',
        done: true,
        context: [1, 2, 3, 4, 5]
      };

      const mockResponse2 = {
        model: 'llama3.1',
        response: 'Second response',
        done: true,
        context: [1, 2, 3, 4, 5, 6, 7]
      };

      fetchStub.onFirstCall().resolves({
        ok: true,
        json: async () => mockResponse1
      } as Response);

      fetchStub.onSecondCall().resolves({
        ok: true,
        json: async () => mockResponse2
      } as Response);

      await adapter.sendRequest('First message');
      await adapter.sendRequest('Second message');

      // Check that second request includes context from first
      const secondRequestBody = JSON.parse(fetchStub.secondCall.args[1].body);
      assert.deepStrictEqual(secondRequestBody.context, [1, 2, 3, 4, 5]);
    });

    it('should throw error when not initialized', async () => {
      const uninitializedAdapter = new OllamaAdapter();
      
      try {
        await uninitializedAdapter.sendRequest('Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Adapter not initialized'));
      }
    });
  });

  describe('Connection Testing', () => {
    it('should test connection successfully', async () => {
      fetchStub.resolves({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.1:latest' }]
        })
      } as Response);

      const result = await adapter.testConnection();
      assert.strictEqual(result, true);
    });

    it('should fail connection test when Ollama is not running', async () => {
      fetchStub.rejects(new TypeError('Failed to fetch'));

      const result = await adapter.testConnection();
      assert.strictEqual(result, false);
    });

    it('should fail connection test when API returns error', async () => {
      fetchStub.resolves({
        ok: false,
        status: 500
      } as Response);

      const result = await adapter.testConnection();
      assert.strictEqual(result, false);
    });
  });

  describe('Model Management', () => {
    beforeEach(async () => {
      // Mock successful initialization
      fetchStub.onFirstCall().resolves({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.1:latest' }]
        })
      } as Response);

      fetchStub.onSecondCall().resolves({
        ok: true,
        json: async () => ({
          details: { parameter_size: '8B' }
        })
      } as Response);

      await adapter.initialize(testConfig);
      fetchStub.reset();
    });

    it('should get available models', async () => {
      const mockModels = {
        models: [
          { name: 'llama3.1:latest' },
          { name: 'codellama:7b' },
          { name: 'mistral:latest' }
        ]
      };

      fetchStub.resolves({
        ok: true,
        json: async () => mockModels
      } as Response);

      const models = await adapter.getAvailableModels();
      
      assert.deepStrictEqual(models, ['llama3.1:latest', 'codellama:7b', 'mistral:latest']);
    });

    it('should handle errors when getting models', async () => {
      fetchStub.resolves({
        ok: false,
        statusText: 'Not Found'
      } as Response);

      const models = await adapter.getAvailableModels();
      assert.deepStrictEqual(models, []);
    });

    it('should pull model successfully', async () => {
      fetchStub.resolves({
        ok: true
      } as Response);

      const result = await adapter.pullModel('llama3.1');
      assert.strictEqual(result, true);
    });

    it('should handle pull model errors', async () => {
      fetchStub.resolves({
        ok: false
      } as Response);

      const result = await adapter.pullModel('nonexistent-model');
      assert.strictEqual(result, false);
    });
  });

  describe('Context Management', () => {
    it('should clear context', () => {
      // Set some context first
      (adapter as any).context = [1, 2, 3, 4, 5];
      
      adapter.clearContext();
      
      assert.strictEqual(adapter.getContextSize(), 0);
    });

    it('should track context size', () => {
      // Set some context
      (adapter as any).context = [1, 2, 3, 4, 5];
      
      assert.strictEqual(adapter.getContextSize(), 5);
    });
  });

  describe('Capability Detection', () => {
    it('should detect tool calling support for supported models', () => {
      const supportedModels = ['llama3.1', 'mistral', 'qwen2', 'codellama'];
      
      for (const modelName of supportedModels) {
        const result = (adapter as any).detectToolCallingSupport(modelName, {});
        assert.strictEqual(result, true, `${modelName} should support tool calling`);
      }
    });

    it('should not detect tool calling for unsupported models', () => {
      const unsupportedModels = ['llama2', 'vicuna', 'alpaca'];
      
      for (const modelName of unsupportedModels) {
        const result = (adapter as any).detectToolCallingSupport(modelName, {});
        assert.strictEqual(result, false, `${modelName} should not support tool calling`);
      }
    });

    it('should estimate context length based on model size', () => {
      const testCases = [
        { modelName: 'llama3.1', modelInfo: { details: { parameter_size: '70B' } }, expected: 8192 },
        { modelName: 'llama3.1', modelInfo: { details: { parameter_size: '13B' } }, expected: 4096 },
        { modelName: 'llama3.1', modelInfo: { details: { parameter_size: '7B' } }, expected: 4096 },
        { modelName: 'codellama', modelInfo: {}, expected: 16384 },
        { modelName: 'mistral', modelInfo: {}, expected: 8192 }
      ];

      for (const testCase of testCases) {
        const result = (adapter as any).estimateContextLength(testCase.modelName, testCase.modelInfo);
        assert.strictEqual(result, testCase.expected, 
          `${testCase.modelName} should have context length ${testCase.expected}`);
      }
    });
  });
});