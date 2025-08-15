/**
 * Tests for AI Agent Service error handling and recovery
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { AIAgentService, AIResponse, ToolCall, AIToolResult } from '../../core/ai-agent';
import { ConversationContextManager } from '../../core/conversation-context';
import { ToolRegistry } from '../../core/tool-registry';
import { ModelManager } from '../../core/model-manager';

describe('AI Agent Service Error Handling', () => {
  let aiAgent: AIAgentService;
  let sandbox: sinon.SinonSandbox;
  let mockCreateAdapter: sinon.SinonStub;
  let mockToolRegistry: sinon.SinonStubbedInstance<ToolRegistry>;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    aiAgent = new AIAgentService();
    
    // Mock the internal components
    mockToolRegistry = sandbox.createStubInstance(ToolRegistry);
    
    // Replace internal instances
    (aiAgent as any).toolRegistry = mockToolRegistry;
    
    // Mock the createModelAdapter method with default behavior
    mockCreateAdapter = sandbox.stub(aiAgent as any, 'createModelAdapter').callsFake(async (config: any) => {
      return {
        testConnection: sandbox.stub().resolves(true),
        formatPrompt: sandbox.stub().returns('test prompt'),
        parseResponse: sandbox.stub().returns({
          content: 'test response',
          metadata: { model: config.model, tokensUsed: 10, processingTime: 100, timestamp: new Date() }
        }),
        sendRequest: sandbox.stub().resolves('test response'),
        supportsToolCalling: sandbox.stub().returns(false),
        capabilities: { supportsToolCalling: false }
      };
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Model Connection Error Handling', () => {
    it('should handle model not configured error', async () => {
      try {
        await aiAgent.sendMessage('test-session', 'Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.strictEqual((error as any).code, 'model_not_configured');
        assert.strictEqual((error as any).recoverable, true);
        assert.ok((error as any).suggestedFix);
      }
    });

    it('should handle Ollama connection failure with guidance', async () => {
      // Configure a model
      aiAgent.setModel({
        provider: 'ollama',
        name: 'llama2',
        model: 'llama2',
        endpoint: 'http://localhost:11434'
      });

      // Override the createModelAdapter mock for this test
      mockCreateAdapter.restore();
      mockCreateAdapter = sandbox.stub(aiAgent as any, 'createModelAdapter').resolves({
        testConnection: sandbox.stub().resolves(false),
        formatPrompt: sandbox.stub(),
        parseResponse: sandbox.stub(),
        sendRequest: sandbox.stub()
      });

      try {
        await aiAgent.sendMessage('test-session', 'Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Failed to connect'));
        assert.strictEqual((error as any).recoverable, true);
        assert.ok((error as any).suggestedFix?.includes('ollama serve'));
      }
    });

    it('should handle OpenAI API key error with guidance', async () => {
      aiAgent.setModel({
        provider: 'openai',
        name: 'gpt-3.5-turbo',
        model: 'gpt-3.5-turbo',
        apiKey: 'invalid-key'
      });

      const mockAdapter = {
        testConnection: sandbox.stub().rejects(new Error('Invalid API key')),
        formatPrompt: sandbox.stub(),
        parseResponse: sandbox.stub(),
        sendRequest: sandbox.stub()
      };
      
      mockCreateAdapter.resolves(mockAdapter);

      try {
        await aiAgent.sendMessage('test-session', 'Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.strictEqual((error as any).recoverable, true);
        assert.ok((error as any).suggestedFix?.includes('API key'));
      }
    });

    it('should retry on connection failures', async () => {
      aiAgent.setModel({
        provider: 'ollama',
        name: 'llama2',
        model: 'llama2'
      });

      const mockAdapter = {
        testConnection: sandbox.stub().resolves(true),
        formatPrompt: sandbox.stub().returns('test prompt'),
        parseResponse: sandbox.stub().returns({
          content: 'test response',
          metadata: { model: 'llama2', tokensUsed: 10, processingTime: 100, timestamp: new Date() }
        }),
        sendRequest: sandbox.stub()
          .onFirstCall().rejects(new Error('Connection failed'))
          .onSecondCall().resolves('test response')
      };
      
      mockCreateAdapter.resolves(mockAdapter);
      mockToolRegistry.getAllTools.returns([]);

      const response = await aiAgent.sendMessage('test-session', 'Hello');
      
      assert.strictEqual(response.content, 'test response');
      assert.strictEqual(mockAdapter.sendRequest.callCount, 2);
    });
  });

  describe('Context Overflow Handling', () => {
    it('should handle context overflow with intelligent truncation', async () => {
      aiAgent.setModel({
        provider: 'ollama',
        name: 'llama2',
        model: 'llama2'
      });

      const mockAdapter = {
        testConnection: sandbox.stub().resolves(true),
        formatPrompt: sandbox.stub().returns('test prompt'),
        parseResponse: sandbox.stub().returns({
          content: 'test response',
          metadata: { model: 'llama2', tokensUsed: 10, processingTime: 100, timestamp: new Date() }
        }),
        sendRequest: sandbox.stub().resolves('test response')
      };
      
      mockCreateAdapter.resolves(mockAdapter);
      mockToolRegistry.getAllTools.returns([]);

      // Create a context with many messages to trigger overflow
      const context = new ConversationContextManager({ maxTokens: 100 });
      
      // Add many messages to exceed token limit
      for (let i = 0; i < 20; i++) {
        context.addMessage({
          role: 'user',
          content: `This is a long message number ${i} that should contribute to context overflow when combined with other messages`,
          timestamp: new Date()
        });
      }

      const response = await aiAgent.sendMessage('test-session', 'Hello', undefined, context);
      
      assert.strictEqual(response.content, 'test response');
      // Context should have been truncated
      assert.ok(context.getTokenCount() <= context.maxTokens);
    });

    it('should preserve important messages during truncation', async () => {
      const context = new ConversationContextManager({ 
        maxTokens: 200,
        minRecentMessages: 2
      });
      
      // Add system message
      context.addMessage({
        role: 'system',
        content: 'You are a helpful assistant',
        timestamp: new Date()
      });
      
      // Add many user/assistant pairs
      for (let i = 0; i < 10; i++) {
        context.addMessage({
          role: 'user',
          content: `User message ${i} with some content`,
          timestamp: new Date()
        });
        context.addMessage({
          role: 'assistant',
          content: `Assistant response ${i} with some content`,
          timestamp: new Date()
        });
      }

      // Trigger truncation
      context.truncateIfNeeded();
      
      // Should preserve system message and at least minimum recent messages
      const systemMessages = context.messages.filter(m => m.role === 'system');
      const otherMessages = context.messages.filter(m => m.role !== 'system');
      
      assert.strictEqual(systemMessages.length, 1);
      assert.ok(otherMessages.length >= 2); // At least minRecentMessages
    });
  });

  describe('Tool Execution Error Handling', () => {
    it('should handle tool not found error', async () => {
      mockToolRegistry.getTool.returns(undefined);
      
      const toolCall: ToolCall = {
        id: 'test-call',
        name: 'nonexistent_tool',
        parameters: {}
      };

      const result = await aiAgent.executeToolCall(toolCall);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('not found'));
      assert.strictEqual((result.metadata as any).errorCode, 'tool_not_found');
    });

    it('should retry tool execution on recoverable errors', async () => {
      const mockTool = {
        name: 'test_tool',
        description: 'Test tool',
        parameters: [] as any[],
        execute: sandbox.stub()
          .onFirstCall().rejects(new Error('Temporary failure'))
          .onSecondCall().resolves({
            success: true,
            output: 'Success',
            metadata: {
              executionTime: 100,
              toolName: 'test_tool',
              parameters: {},
              timestamp: new Date()
            }
          })
      };

      mockToolRegistry.getTool.returns(mockTool);
      mockToolRegistry.executeToolCall
        .onFirstCall().rejects(new Error('Temporary failure'))
        .onSecondCall().resolves({
          success: true,
          output: 'Success',
          metadata: {
            executionTime: 100,
            toolName: 'test_tool',
            parameters: {},
            timestamp: new Date()
          }
        });

      const toolCall: ToolCall = {
        id: 'test-call',
        name: 'test_tool',
        parameters: {}
      };

      const result = await aiAgent.executeToolCall(toolCall);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output, 'Success');
      assert.strictEqual(mockToolRegistry.executeToolCall.callCount, 2);
    });

    it('should handle file operation errors with specific guidance', async () => {
      const mockTool = {
        name: 'read_file',
        description: 'Read file tool',
        parameters: [{ name: 'path', type: 'string' as const, required: true, description: 'File path' }],
        execute: sandbox.stub()
      };

      mockToolRegistry.getTool.returns(mockTool);
      
      const fileError = new Error('ENOENT: no such file or directory');
      mockToolRegistry.executeToolCall.rejects(fileError);

      const toolCall: ToolCall = {
        id: 'test-call',
        name: 'read_file',
        parameters: { path: '/nonexistent/file.txt' }
      };

      const result = await aiAgent.executeToolCall(toolCall);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('File not found'));
      assert.ok(result.error?.includes('Check if the file path is correct'));
    });

    it('should sanitize dangerous file paths', async () => {
      const mockTool = {
        name: 'read_file',
        description: 'Read file tool',
        parameters: [{ name: 'path', type: 'string' as const, required: true, description: 'File path' }],
        execute: sandbox.stub()
      };

      mockToolRegistry.getTool.returns(mockTool);
      mockToolRegistry.executeToolCall.resolves({
        success: true,
        output: 'File content',
        metadata: {
          executionTime: 50,
          toolName: 'read_file',
          parameters: { path: 'safe/path.txt' },
          timestamp: new Date()
        }
      });

      const toolCall: ToolCall = {
        id: 'test-call',
        name: 'read_file',
        parameters: { path: '../../../etc/passwd' }
      };

      const result = await aiAgent.executeToolCall(toolCall);
      
      // Should have sanitized the path
      const executedCall = mockToolRegistry.executeToolCall.getCall(0).args[0];
      assert.ok(!executedCall.parameters.path.includes('..'));
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle models without tool calling support', async () => {
      aiAgent.setModel({
        provider: 'openai',
        name: 'gpt-3.5-turbo-instruct',
        model: 'gpt-3.5-turbo-instruct' // Model without tool calling
      });

      const mockAdapter = {
        testConnection: sandbox.stub().resolves(true),
        capabilities: { supportsToolCalling: false },
        formatPrompt: sandbox.stub().returns('test prompt'),
        parseResponse: sandbox.stub().returns({
          content: 'test response',
          metadata: { model: 'gpt-3.5-turbo-instruct', tokensUsed: 10, processingTime: 100, timestamp: new Date() }
        }),
        sendRequest: sandbox.stub().resolves('test response')
      };
      
      mockCreateAdapter.resolves(mockAdapter);
      mockToolRegistry.getAllTools.returns([
        { name: 'test_tool', description: 'Test tool', parameters: [], execute: sandbox.stub() }
      ]);

      const response = await aiAgent.sendMessage('test-session', 'Hello');
      
      assert.strictEqual(response.content, 'test response');
      // Should have called formatPrompt with empty tools array
      assert.ok(mockAdapter.formatPrompt.calledWith(sinon.match.any, []));
    });

    it('should provide fallback formatting when adapter fails', async () => {
      aiAgent.setModel({
        provider: 'custom',
        name: 'test-model',
        model: 'test-model'
      });

      const mockAdapter = {
        testConnection: sandbox.stub().resolves(true),
        formatPrompt: sandbox.stub().throws(new Error('Formatting failed')),
        parseResponse: sandbox.stub().returns({
          content: 'test response',
          metadata: { model: 'test-model', tokensUsed: 10, processingTime: 100, timestamp: new Date() }
        }),
        sendRequest: sandbox.stub().resolves('test response')
      };
      
      mockCreateAdapter.resolves(mockAdapter);
      mockToolRegistry.getAllTools.returns([]);

      const response = await aiAgent.sendMessage('test-session', 'Hello');
      
      assert.strictEqual(response.content, 'test response');
      // Should have fallen back to basic formatting
      assert.ok(mockAdapter.sendRequest.called);
    });

    it('should handle complete adapter failure gracefully', async () => {
      aiAgent.setModel({
        provider: 'custom',
        name: 'broken-model',
        model: 'broken-model'
      });

      mockCreateAdapter.rejects(new Error('Adapter initialization failed'));

      try {
        await aiAgent.sendMessage('test-session', 'Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Adapter initialization failed'));
      }
    });
  });

  describe('Error Recovery and Retry Logic', () => {
    it('should respect retry-after headers', async () => {
      aiAgent.setModel({
        provider: 'openai',
        name: 'gpt-3.5-turbo',
        model: 'gpt-3.5-turbo'
      });

      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).retryAfter = 2; // 2 seconds

      const mockAdapter = {
        testConnection: sandbox.stub().resolves(true),
        formatPrompt: sandbox.stub().returns('test prompt'),
        parseResponse: sandbox.stub().returns({
          content: 'test response',
          metadata: { model: 'gpt-3.5-turbo', tokensUsed: 10, processingTime: 100, timestamp: new Date() }
        }),
        sendRequest: sandbox.stub()
          .onFirstCall().rejects(rateLimitError)
          .onSecondCall().resolves('test response')
      };
      
      mockCreateAdapter.resolves(mockAdapter);
      mockToolRegistry.getAllTools.returns([]);

      const startTime = Date.now();
      const response = await aiAgent.sendMessage('test-session', 'Hello');
      const endTime = Date.now();
      
      assert.strictEqual(response.content, 'test response');
      // Should have waited at least 2 seconds (retry-after)
      assert.ok(endTime - startTime >= 2000);
    });

    it('should not retry non-recoverable errors', async () => {
      aiAgent.setModel({
        provider: 'openai',
        name: 'gpt-3.5-turbo',
        model: 'gpt-3.5-turbo'
      });

      const authError = new Error('Invalid API key');
      (authError as any).code = 'invalid_api_key';

      const mockAdapter = {
        testConnection: sandbox.stub().rejects(authError)
      };
      
      mockCreateAdapter.resolves(mockAdapter);

      try {
        await aiAgent.sendMessage('test-session', 'Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.strictEqual((error as any).retryCount, 0);
      }
    });

    it('should limit maximum retry attempts', async () => {
      aiAgent.setModel({
        provider: 'ollama',
        name: 'llama2',
        model: 'llama2'
      });

      const mockAdapter = {
        testConnection: sandbox.stub().resolves(true),
        formatPrompt: sandbox.stub().returns('test prompt'),
        parseResponse: sandbox.stub(),
        sendRequest: sandbox.stub().rejects(new Error('Server error'))
      };
      
      mockCreateAdapter.resolves(mockAdapter);
      mockToolRegistry.getAllTools.returns([]);

      try {
        await aiAgent.sendMessage('test-session', 'Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        // Should have tried 4 times (initial + 3 retries)
        assert.strictEqual(mockAdapter.sendRequest.callCount, 4);
      }
    });
  });
});
