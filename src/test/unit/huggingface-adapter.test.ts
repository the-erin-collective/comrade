import assert from 'assert';
import sinon from 'sinon';
import { HuggingFaceAdapter } from '../../core/model-adapters/huggingface-adapter';
import {
  ModelConfig,
  ChatMessage,
  Tool
} from '../../core/model-adapters/base-model-adapter';

// Mock fetch globally
const fetchStub = sinon.stub(global, 'fetch' as any);

describe('HuggingFaceAdapter', () => {
  let adapter: HuggingFaceAdapter;
  let mockConfig: ModelConfig;
  let mockTools: Tool[];
  let mockMessages: ChatMessage[];

  beforeEach(() => {
    adapter = new HuggingFaceAdapter();
    
    mockConfig = {
      name: 'microsoft/DialoGPT-medium',
      provider: 'huggingface',
      apiKey: 'test-api-key',
      temperature: 0.7,
      maxTokens: 512
    };

    mockTools = [
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: [
          {
            name: 'path',
            type: 'string',
            description: 'The file path to read',
            required: true
          }
        ],
        execute: sinon.stub()
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        parameters: [
          {
            name: 'path',
            type: 'string',
            description: 'The file path to write to',
            required: true
          },
          {
            name: 'content',
            type: 'string',
            description: 'The content to write',
            required: true
          },
          {
            name: 'append',
            type: 'boolean',
            description: 'Whether to append to the file',
            required: false
          }
        ],
        execute: sinon.stub()
      }
    ];

    mockMessages = [
      {
        role: 'system',
        content: 'You are a helpful coding assistant.',
        timestamp: new Date()
      },
      {
        role: 'user',
        content: 'Please read the README.md file',
        timestamp: new Date()
      }
    ];

    // Reset and setup fetch mock with default successful response
    fetchStub.reset();
    fetchStub.resolves({
      ok: true,
      json: () => Promise.resolve([{ generated_text: 'Hello' }])
    } as any);
  });

  describe('initialization', () => {
    it('should initialize with default capabilities', () => {
      const capabilities = adapter.getCapabilities();
      
      assert.strictEqual(capabilities.supportsToolCalling, true);
      assert.strictEqual(capabilities.supportsStreaming, false);
      assert.strictEqual(capabilities.supportsSystemPrompts, true);
      assert.strictEqual(capabilities.maxContextLength, 4096);
      assert.ok(capabilities.supportedFormats.includes('text'));
      assert.ok(capabilities.supportedFormats.includes('json'));
      assert.ok(capabilities.supportedFormats.includes('xml'));
    });

    it('should initialize with valid configuration', async () => {
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve([{ generated_text: 'Hello' }])
      } as any);

      await adapter.initialize(mockConfig);
      // If no error is thrown, the test passes
      assert.ok(true);
    });

    it('should throw error for invalid provider', async () => {
      const invalidConfig = { ...mockConfig, provider: 'invalid' };
      
      await assert.rejects(adapter.initialize(invalidConfig));
    });

    it('should throw error for empty model name', async () => {
      const invalidConfig = { ...mockConfig, name: '' };
      
      await assert.rejects(adapter.initialize(invalidConfig));
    });
  });

  describe('formatPrompt', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('should format prompt with AVAILABLE_TOOLS format', () => {
      const prompt = adapter.formatPrompt(mockMessages, mockTools);
      
      assert.ok(prompt.includes('<AVAILABLE_TOOLS>'));
      assert.ok(prompt.includes('</AVAILABLE_TOOLS>'));
      assert.ok(prompt.includes('read_file'));
      assert.ok(prompt.includes('write_file'));
      assert.ok(prompt.includes('Please read the README.md file'));
    });

    it('should include system prompt', () => {
      const prompt = adapter.formatPrompt(mockMessages, mockTools);
      
      assert.ok(prompt.includes('You are a helpful coding assistant.'));
    });

    it('should format tools as JSON schema', () => {
      const prompt = adapter.formatPrompt(mockMessages, mockTools);
      
      // Parse the tools section
      const toolsMatch = prompt.match(/<AVAILABLE_TOOLS>(.*?)<\/AVAILABLE_TOOLS>/s);
      assert.ok(toolsMatch);
      
      const toolsJson = JSON.parse(toolsMatch![1]);
      assert.ok(Array.isArray(toolsJson));
      assert.strictEqual(toolsJson.length, 2);
      
      const readFileTool = toolsJson.find((t: any) => t.name === 'read_file');
      assert.ok(readFileTool);
      assert.strictEqual(readFileTool.description, 'Read the contents of a file');
      assert.strictEqual(readFileTool.parameters.type, 'object');
      assert.ok(readFileTool.parameters.properties.path);
      assert.ok(readFileTool.parameters.required.includes('path'));
    });

    it('should handle empty tools array', () => {
      const prompt = adapter.formatPrompt(mockMessages, []);
      
      assert.ok(!prompt.includes('<AVAILABLE_TOOLS>'));
      assert.ok(prompt.includes('Please read the README.md file'));
    });

    it('should handle conversation history', () => {
      const messagesWithHistory = [
        ...mockMessages,
        {
          role: 'assistant' as const,
          content: 'I can help you read the file.',
          timestamp: new Date()
        },
        {
          role: 'user' as const,
          content: 'Now write to config.json',
          timestamp: new Date()
        }
      ];

      const prompt = adapter.formatPrompt(messagesWithHistory, mockTools);
      
      assert.ok(prompt.includes('Now write to config.json'));
      assert.ok(prompt.includes('Conversation history:'));
      assert.ok(prompt.includes('Human: Please read the README.md file'));
      assert.ok(prompt.includes('Assistant: I can help you read the file.'));
    });
  });

  describe('parseResponse', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('should parse response with JSON tool call', () => {
      const response = `I'll read the file for you.

\`\`\`json
{
  "name": "read_file",
  "parameters": {
    "path": "README.md"
  }
}
\`\`\`

Let me check the contents.`;

      const aiResponse = adapter.parseResponse(response);
      
      assert.ok(aiResponse.content.includes("I'll read the file for you."));
      assert.ok(aiResponse.content.includes("Let me check the contents."));
      assert.ok(!aiResponse.content.includes('```json'));
      
      assert.strictEqual(aiResponse.toolCalls!.length, 1);
      assert.strictEqual(aiResponse.toolCalls![0].name, 'read_file');
      assert.strictEqual(aiResponse.toolCalls![0].parameters.path, 'README.md');
      assert.ok(aiResponse.toolCalls![0].id);
    });

    it('should parse response with direct JSON tool call', () => {
      const response = `I'll help you with that. {"name": "write_file", "parameters": {"path": "config.json", "content": "{\\"test\\": true}"}}`;

      const aiResponse = adapter.parseResponse(response);
      
      assert.strictEqual(aiResponse.toolCalls!.length, 1);
      assert.strictEqual(aiResponse.toolCalls![0].name, 'write_file');
      assert.strictEqual(aiResponse.toolCalls![0].parameters.path, 'config.json');
      assert.strictEqual(aiResponse.toolCalls![0].parameters.content, '{"test": true}');
    });

    it('should parse response with function call format', () => {
      const response = `I'll execute the command for you: read_file(path="README.md")`;

      const aiResponse = adapter.parseResponse(response);
      
      assert.strictEqual(aiResponse.toolCalls!.length, 1);
      assert.strictEqual(aiResponse.toolCalls![0].name, 'read_file');
      assert.strictEqual(aiResponse.toolCalls![0].parameters.path, 'README.md');
    });

    it('should parse multiple tool calls', () => {
      const response = `I'll do both operations:

\`\`\`json
{
  "name": "read_file",
  "parameters": {
    "path": "input.txt"
  }
}
\`\`\`

\`\`\`json
{
  "name": "write_file",
  "parameters": {
    "path": "output.txt",
    "content": "processed data"
  }
}
\`\`\``;

      const aiResponse = adapter.parseResponse(response);
      
      assert.strictEqual(aiResponse.toolCalls!.length, 2);
      assert.strictEqual(aiResponse.toolCalls![0].name, 'read_file');
      assert.strictEqual(aiResponse.toolCalls![1].name, 'write_file');
    });

    it('should handle response without tool calls', () => {
      const response = 'This is just a regular response without any tool calls.';

      const aiResponse = adapter.parseResponse(response);
      
      assert.strictEqual(aiResponse.content, response);
      assert.strictEqual(aiResponse.toolCalls!.length, 0);
      assert.strictEqual(aiResponse.metadata.model, 'microsoft/DialoGPT-medium');
      assert.ok(aiResponse.metadata.processingTime > 0);
    });

    it('should handle malformed JSON gracefully', () => {
      const response = `Here's a broken JSON: \`\`\`json
{
  "name": "read_file"
  "parameters": {
    "path": "test.txt"
  }
}
\`\`\``;

      const aiResponse = adapter.parseResponse(response);
      
      assert.strictEqual(aiResponse.toolCalls!.length, 0);
      assert.ok(aiResponse.content.includes('broken JSON'));
    });
  });

  describe('sendRequest', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('should send request to Hugging Face API', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve([{ generated_text: 'Hello, world!' }])
      };
      fetchStub.resolves(mockResponse as any);

      const result = await adapter.sendRequest('Hello');
      
      assert.ok(fetchStub.calledWith(
        'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium'
      ));
      
      const callArgs = fetchStub.getCall(0).args[1] as any;
      assert.strictEqual(callArgs.method, 'POST');
      assert.strictEqual(callArgs.headers['Content-Type'], 'application/json');
      assert.strictEqual(callArgs.headers['Authorization'], 'Bearer test-api-key');
      assert.ok((callArgs.body as string).includes('"inputs":"Hello"'));
      
      assert.strictEqual(result, 'Hello, world!');
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key')
      };
      fetchStub.resolves(mockResponse as any);

      await assert.rejects(
        adapter.sendRequest('Hello'),
        /Hugging Face API error: 401 Unauthorized/
      );
    });

    it('should handle model errors', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve([{ error: 'Model is currently loading' }])
      };
      fetchStub.resolves(mockResponse as any);

      await assert.rejects(
        adapter.sendRequest('Hello'),
        /Hugging Face model error: Model is currently loading/
      );
    });

    it('should handle network errors', async () => {
      fetchStub.rejects(new TypeError('Failed to fetch'));

      await assert.rejects(
        adapter.sendRequest('Hello'),
        /Failed to connect to Hugging Face API/
      );
    });

    it('should work without API key for public models', async () => {
      // Create a fresh adapter for this test
      const freshAdapter = new HuggingFaceAdapter();
      const configWithoutKey = { ...mockConfig, apiKey: undefined };
      
      // Reset fetch stub for this test
      fetchStub.reset();
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve([{ generated_text: 'Public response' }])
      };
      fetchStub.resolves(mockResponse as any);
      
      await freshAdapter.initialize(configWithoutKey);
      const result = await freshAdapter.sendRequest('Hello');
      
      const callArgs = fetchStub.getCall(0).args[1] as any;
      assert.ok(!callArgs.headers.hasOwnProperty('Authorization'));
      
      assert.strictEqual(result, 'Public response');
    });
  });

  describe('tool function schema generation', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('should generate correct tool schema', () => {
      const schema = adapter.getToolSchema(mockTools);
      const parsed = JSON.parse(schema);
      
      assert.ok(Array.isArray(parsed));
      assert.strictEqual(parsed.length, 2);
      
      const readFileTool = parsed.find((t: any) => t.name === 'read_file');
      assert.deepStrictEqual(readFileTool, {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The file path to read'
            }
          },
          required: ['path']
        }
      });
      
      const writeFileTool = parsed.find((t: any) => t.name === 'write_file');
      assert.deepStrictEqual(writeFileTool.parameters.required, ['path', 'content']);
      assert.strictEqual(writeFileTool.parameters.properties.append.type, 'boolean');
    });

    it('should handle tools with enum parameters', () => {
      const toolWithEnum: Tool = {
        name: 'set_log_level',
        description: 'Set the logging level',
        parameters: [
          {
            name: 'level',
            type: 'string',
            description: 'The log level to set',
            required: true,
            enum: ['debug', 'info', 'warn', 'error']
          }
        ],
        execute: sinon.stub()
      };

      const schema = adapter.getToolSchema([toolWithEnum]);
      const parsed = JSON.parse(schema);
      
      assert.deepStrictEqual(parsed[0].parameters.properties.level.enum, ['debug', 'info', 'warn', 'error']);
    });

    it('should format single tool correctly', () => {
      const singleTool = adapter.formatSingleTool(mockTools[0]);
      
      assert.deepStrictEqual(singleTool, {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The file path to read'
            }
          },
          required: ['path']
        }
      });
    });
  });

  describe('configuration validation', () => {
    it('should validate correct configuration', async () => {
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve([{ generated_text: 'Hello' }])
      } as any);
      
      await adapter.initialize(mockConfig);
      // If no error is thrown, the test passes
      assert.ok(true);
    });

    it('should reject invalid provider', async () => {
      const invalidConfig = { ...mockConfig, provider: 'openai' };
      await assert.rejects(adapter.initialize(invalidConfig));
    });

    it('should reject empty model name', async () => {
      const invalidConfig = { ...mockConfig, name: '' };
      await assert.rejects(adapter.initialize(invalidConfig));
    });

    it('should reject invalid endpoint URL', async () => {
      const invalidConfig = { ...mockConfig, endpoint: 'not-a-url' };
      await assert.rejects(adapter.initialize(invalidConfig));
    });

    it('should accept valid custom endpoint', async () => {
      const validConfig = { ...mockConfig, endpoint: 'https://custom-endpoint.com/api' };
      
      fetchStub.resolves({
        ok: true,
        json: () => Promise.resolve([{ generated_text: 'Hello' }])
      } as any);

      await adapter.initialize(validConfig);
      // If no error is thrown, the test passes
      assert.ok(true);
    });
  });

  describe('capabilities detection', () => {
    it('should detect tool calling support for modern models', async () => {
      const modernConfig = { ...mockConfig, name: 'microsoft/DialoGPT-large' };
      await adapter.initialize(modernConfig);
      
      assert.strictEqual(adapter.supportsToolCalling(), true);
    });

    it('should disable tool calling for older models', async () => {
      const oldConfig = { ...mockConfig, name: 'gpt2' };
      await adapter.initialize(oldConfig);
      
      assert.strictEqual(adapter.supportsToolCalling(), false);
    });

    it('should set appropriate context length for different models', async () => {
      const llamaConfig = { ...mockConfig, name: 'meta-llama/Llama-2-7b-chat-hf' };
      await adapter.initialize(llamaConfig);
      
      const capabilities = adapter.getCapabilities();
      assert.strictEqual(capabilities.maxContextLength, 8192);
    });
  });

  describe('function parameter parsing', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig);
    });

    it('should parse function parameters correctly', () => {
      const response = 'write_file(path="test.txt", content="Hello World", append=true)';
      const aiResponse = adapter.parseResponse(response);
      
      assert.strictEqual(aiResponse.toolCalls!.length, 1);
      assert.deepStrictEqual(aiResponse.toolCalls![0].parameters, {
        path: 'test.txt',
        content: 'Hello World',
        append: true
      });
    });

    it('should handle numeric parameters', () => {
      const response = 'set_timeout(duration=30, retries=3)';
      const aiResponse = adapter.parseResponse(response);
      
      assert.deepStrictEqual(aiResponse.toolCalls![0].parameters, {
        duration: 30,
        retries: 3
      });
    });

    it('should handle boolean parameters', () => {
      const response = 'configure(enabled=true, debug=false)';
      const aiResponse = adapter.parseResponse(response);
      
      assert.deepStrictEqual(aiResponse.toolCalls![0].parameters, {
        enabled: true,
        debug: false
      });
    });

    it('should handle empty parameters', () => {
      const response = 'list_files()';
      const aiResponse = adapter.parseResponse(response);
      
      assert.deepStrictEqual(aiResponse.toolCalls![0].parameters, {});
    });
  });

  // Clean up after all tests
  after(() => {
    fetchStub.restore();
  });
});