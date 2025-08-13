/**
 * Unit tests for AI Agent Service
 */

import assert from 'assert';
import { 
  AIAgentService, 
  ModelConfig, 
  DefaultConversationContext,
  AIMessage,
  ToolCall 
} from '../../core/ai-agent';
import { Tool } from '../../core/types';

describe('AIAgentService', () => {
  let aiService: AIAgentService;

  beforeEach(() => {
    aiService = new AIAgentService();
  });

  describe('Model Configuration', () => {
    it('should set and get model configuration', () => {
      const modelConfig: ModelConfig = {
        provider: 'ollama',
        model: 'llama2',
        endpoint: 'http://localhost:11434',
        temperature: 0.7
      };

      aiService.setModel(modelConfig);
      const currentModel = aiService.getCurrentModel();

      assert.deepStrictEqual(currentModel, modelConfig);
    });

    it('should throw error for invalid model configuration', () => {
      assert.throws(() => {
        aiService.setModel({} as ModelConfig);
      }, /Model provider is required/);

      assert.throws(() => {
        aiService.setModel({ provider: 'ollama' } as ModelConfig);
      }, /Model name is required/);
    });
  });

  describe('Message Processing', () => {
    beforeEach(() => {
      const modelConfig: ModelConfig = {
        provider: 'ollama',
        model: 'llama2'
      };
      aiService.setModel(modelConfig);
    });

    it('should process a message successfully', async () => {
      const response = await aiService.sendMessage('test-session', 'Hello, AI!');

      assert.ok(response);
      assert.ok(response.content);
      assert.ok(response.metadata);
      assert.strictEqual(response.metadata.model, 'llama2');
      assert.ok(response.metadata.processingTime >= 0);
    });

    it('should throw error for empty message', async () => {
      await assert.rejects(aiService.sendMessage('test-session', ''), /Message cannot be empty/);
      await assert.rejects(aiService.sendMessage('test-session', '   '), /Message cannot be empty/);
    });

    it('should throw error for missing session ID', async () => {
      await assert.rejects(aiService.sendMessage('', 'Hello'), /Session ID is required/);
    });

    it('should throw error when no model is configured', async () => {
      const newService = new AIAgentService();
      await assert.rejects(newService.sendMessage('test-session', 'Hello'), /No AI model configured/);
    });
  });

  describe('Tool Execution', () => {
    it('should handle tool call execution', async () => {
      const toolCall: ToolCall = {
        id: 'test-tool-1',
        name: 'test-tool',
        parameters: { param1: 'value1' }
      };

      const result = await aiService.executeToolCall(toolCall);

      assert.ok(result);
      assert.strictEqual(result.success, false); // Expected since 'test-tool' doesn't exist
      assert.ok(result.error?.includes('not found'));
      assert.strictEqual(result.metadata.toolName, 'test-tool');
      assert.ok(result.metadata.executionTime > 0);
    });

    it('should throw error for invalid tool call', async () => {
      const toolCall: ToolCall = {
        id: 'test-tool-1',
        name: '',
        parameters: {}
      };

      const result = await aiService.executeToolCall(toolCall);
      assert.strictEqual(result.success, false);
      assert.ok(result.error && result.error.includes('Tool name is required'));
    });
  });

  describe('Conversation Context Management', () => {
    it('should create and manage conversation contexts', async () => {
      const modelConfig: ModelConfig = {
        provider: 'ollama',
        model: 'llama2'
      };
      aiService.setModel(modelConfig);

      // Send a message to create context
      await aiService.sendMessage('test-session', 'Hello');

      const context = aiService.getConversationContext('test-session');
      assert.ok(context);
      assert.ok(context!.messages.length > 0);
    });

    it('should clear conversation context', async () => {
      const modelConfig: ModelConfig = {
        provider: 'ollama',
        model: 'llama2'
      };
      aiService.setModel(modelConfig);

      // Create context
      await aiService.sendMessage('test-session', 'Hello');
      assert.ok(aiService.getConversationContext('test-session'));

      // Clear context
      aiService.clearConversationContext('test-session');
      assert.strictEqual(aiService.getConversationContext('test-session'), undefined);
    });

    it('should clear all contexts', async () => {
      const modelConfig: ModelConfig = {
        provider: 'ollama',
        model: 'llama2'
      };
      aiService.setModel(modelConfig);

      // Create multiple contexts
      await aiService.sendMessage('session-1', 'Hello');
      await aiService.sendMessage('session-2', 'Hi');

      assert.ok(aiService.getConversationContext('session-1'));
      assert.ok(aiService.getConversationContext('session-2'));

      // Clear all
      aiService.clearAllContexts();
      assert.strictEqual(aiService.getConversationContext('session-1'), undefined);
      assert.strictEqual(aiService.getConversationContext('session-2'), undefined);
    });
  });

  describe('Available Tools', () => {
    it('should return available tools', () => {
      const tools = aiService.getAvailableTools();
      assert.ok(Array.isArray(tools));
      // Should return built-in tools
      assert.strictEqual(tools.length, 3);
      assert.ok(tools.includes('read_file'));
      assert.ok(tools.includes('write_file'));
      assert.ok(tools.includes('list_directory'));
    });
  });
});

describe('DefaultConversationContext', () => {
  let context: DefaultConversationContext;

  beforeEach(() => {
    context = new DefaultConversationContext();
  });

  it('should initialize with default values', () => {
    assert.deepStrictEqual(context.messages, []);
    assert.deepStrictEqual(context.toolResults, []);
    assert.strictEqual(context.systemPrompt, 'You are a helpful AI coding assistant.');
    assert.strictEqual(context.maxTokens, 4000);
  });

  it('should add messages to context', () => {
    const message: AIMessage = {
      role: 'user',
      content: 'Hello',
      timestamp: new Date()
    };

    context.addMessage(message);
    assert.strictEqual(context.messages.length, 1);
    assert.deepStrictEqual(context.messages[0], message);
  });

  it('should estimate token count', () => {
    const message: AIMessage = {
      role: 'user',
      content: 'This is a test message with some content',
      timestamp: new Date()
    };

    context.addMessage(message);
    const tokenCount = context.getTokenCount();
    assert.ok(tokenCount > 0);
  });

  it('should truncate context when needed', () => {
    // Set a very low token limit
    context.maxTokens = 50;

    // Add many messages
    for (let i = 0; i < 10; i++) {
      const message: AIMessage = {
        role: 'user',
        content: `This is a long message number ${i} with lots of content to exceed the token limit`,
        timestamp: new Date()
      };
      context.addMessage(message);
    }

    const initialMessageCount = context.messages.length;
    context.truncateIfNeeded();
    
    // Should have fewer messages after truncation
    assert.ok(context.messages.length < initialMessageCount);
    assert.ok(context.getTokenCount() <= context.maxTokens);
  });
});

describe('Tool Registry Integration', () => {
  let aiService: AIAgentService;

  beforeEach(() => {
    aiService = new AIAgentService();
  });

  describe('Built-in Tools', () => {
    it('should register built-in tools on initialization', () => {
      const availableTools = aiService.getAvailableTools();
      
      assert.ok(availableTools.length > 0);
      assert.ok(availableTools.includes('read_file'));
      assert.ok(availableTools.includes('write_file'));
      assert.ok(availableTools.includes('list_directory'));
    });

    it('should provide tool schemas for AI consumption', () => {
      const schemas = aiService.getToolSchemas();
      
      assert.ok(schemas.length > 0);
      
      const readFileSchema = schemas.find(s => s.name === 'read_file');
      assert.ok(readFileSchema);
      assert.strictEqual(readFileSchema.description, 'Read the contents of a file');
      assert.ok(readFileSchema.parameters);
      assert.ok(readFileSchema.parameters.properties);
      assert.ok(readFileSchema.parameters.required);
    });
  });

  describe('Tool Execution', () => {
    it('should execute tool calls successfully', async () => {
      const toolCall: ToolCall = {
        id: 'test_call_1',
        name: 'list_directory',
        parameters: { path: '.' }
      };

      const result = await aiService.executeToolCall(toolCall);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.output);
      assert.strictEqual(result.metadata.toolName, 'list_directory');
      assert.ok(result.metadata.executionTime > 0);
    });

    it('should handle tool execution errors', async () => {
      const toolCall: ToolCall = {
        id: 'test_call_2',
        name: 'read_file',
        parameters: { path: 'non-existent-file.txt' }
      };

      const result = await aiService.executeToolCall(toolCall);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.strictEqual(result.metadata.toolName, 'read_file');
    });

    it('should handle invalid tool names', async () => {
      const toolCall: ToolCall = {
        id: 'test_call_3',
        name: 'non_existent_tool',
        parameters: {}
      };

      const result = await aiService.executeToolCall(toolCall);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('not found'));
      assert.strictEqual(result.metadata.toolName, 'non_existent_tool');
    });
  });

  describe('Custom Tool Registration', () => {
    it('should register custom tools', () => {
      const customTool: Tool = {
        name: 'custom_test_tool',
        description: 'A custom test tool',
        parameters: [],
        async execute() {
          return {
            success: true,
            output: 'Custom tool executed',
            metadata: {
              executionTime: 1,
              toolName: 'custom_test_tool',
              parameters: {},
              timestamp: new Date()
            }
          };
        }
      };

      aiService.registerTool(customTool);
      
      const availableTools = aiService.getAvailableTools();
      assert.ok(availableTools.includes('custom_test_tool'));
    });

    it('should throw error for invalid tool registration', () => {
      const invalidTool = {
        name: '',
        description: 'Invalid tool',
        parameters: []
      };

      assert.throws(() => {
        aiService.registerTool(invalidTool);
      }, /Tool name is required/);
    });
  });
});