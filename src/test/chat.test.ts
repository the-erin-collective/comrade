/**
 * Tests for ChatBridge implementation
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ChatBridge, ChatBridgeError, ChatMessage } from '../core/chat';
import { IAgent, LLMProvider, AgentConfig, AgentCapabilities } from '../core/agent';

suite('ChatBridge Tests', () => {
  let chatBridge: ChatBridge;
  let mockAgent: IAgent;
  let testMessages: ChatMessage[];
  let fetchStub: sinon.SinonStub;

  setup(() => {
    chatBridge = new ChatBridge();
    fetchStub = sinon.stub(global, 'fetch' as any);

    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      provider: 'openai' as LLMProvider,
      config: {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: 'test-key',
        temperature: 0.7,
        maxTokens: 1000,
        timeout: 30000
      } as AgentConfig,
      capabilities: {
        hasVision: false,
        hasToolUse: false,
        reasoningDepth: 'intermediate',
        speed: 'fast',
        costTier: 'medium',
        maxTokens: 4096,
        supportedLanguages: ['en'],
        specializations: ['code']
      } as AgentCapabilities,
      isEnabledForAssignment: true,
      isAvailable: sinon.stub().resolves(true)
    };

    testMessages = [
      { role: 'user', content: 'Hello, world!' }
    ];
  });

  teardown(() => {
    sinon.restore();
  });

  suite('sendMessage', () => {
    test('should send OpenAI message successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: sinon.stub().resolves({
          choices: [{
            message: { content: 'Hello! How can I help you?' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 15,
            total_tokens: 25
          },
          model: 'gpt-3.5-turbo'
        })
      };

      fetchStub.resolves(mockResponse);

      const result = await chatBridge.sendMessage(mockAgent, testMessages);

      assert.strictEqual(result.content, 'Hello! How can I help you?');
      assert.strictEqual(result.finishReason, 'stop');
      assert.strictEqual(result.usage?.totalTokens, 25);
      assert.strictEqual(result.metadata?.provider, 'openai');
    });

    test('should send Ollama message successfully', async () => {
      mockAgent.provider = 'ollama';
      mockAgent.config.provider = 'ollama';
      mockAgent.config.endpoint = 'http://localhost:11434';

      const mockResponse = {
        ok: true,
        status: 200,
        json: sinon.stub().resolves({
          message: { content: 'Hello from Ollama!' },
          done: true,
          model: 'llama2',
          prompt_eval_count: 10,
          eval_count: 15,
          total_duration: 1000000
        })
      };

      fetchStub.resolves(mockResponse);

      const result = await chatBridge.sendMessage(mockAgent, testMessages);

      assert.strictEqual(result.content, 'Hello from Ollama!');
      assert.strictEqual(result.finishReason, 'stop');
      assert.strictEqual(result.usage?.totalTokens, 25);
      assert.strictEqual(result.metadata?.provider, 'ollama');
    });

    test('should send custom provider message successfully', async () => {
      mockAgent.provider = 'custom';
      mockAgent.config.provider = 'custom';
      mockAgent.config.endpoint = 'https://custom-api.example.com/v1/chat/completions';

      const mockResponse = {
        ok: true,
        status: 200,
        json: sinon.stub().resolves({
          choices: [{
            message: { content: 'Hello from custom provider!' },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          },
          model: 'custom-model'
        })
      };

      fetchStub.resolves(mockResponse);

      const result = await chatBridge.sendMessage(mockAgent, testMessages);

      assert.strictEqual(result.content, 'Hello from custom provider!');
      assert.strictEqual(result.finishReason, 'stop');
      assert.strictEqual(result.usage?.totalTokens, 30);
    });

    test('should handle OpenAI API errors', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: sinon.stub().resolves({
          error: {
            message: 'Invalid API key',
            code: 'invalid_api_key'
          }
        })
      };

      fetchStub.resolves(mockResponse);

      try {
        await chatBridge.sendMessage(mockAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'invalid_api_key');
      }
    });

    test('should handle HTTP errors', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      };

      fetchStub.resolves(mockResponse);

      try {
        await chatBridge.sendMessage(mockAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'HTTP_ERROR');
        assert.strictEqual(error.statusCode, 401);
      }
    });

    test('should handle network errors', async () => {
      fetchStub.rejects(new Error('Network error'));

      try {
        await chatBridge.sendMessage(mockAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'NETWORK_ERROR');
      }
    });

    test('should throw error for unsupported provider', async () => {
      mockAgent.provider = 'unsupported' as LLMProvider;

      try {
        await chatBridge.sendMessage(mockAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'UNSUPPORTED_PROVIDER');
      }
    });

    test('should throw error for custom provider without endpoint', async () => {
      mockAgent.provider = 'custom';
      mockAgent.config.provider = 'custom';
      mockAgent.config.endpoint = undefined;

      try {
        await chatBridge.sendMessage(mockAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'MISSING_ENDPOINT');
      }
    });
  });

  suite('validateConnection', () => {
    test('should validate OpenAI connection successfully', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: sinon.stub().resolves({
          data: [{ id: 'gpt-3.5-turbo' }]
        })
      };

      fetchStub.resolves(mockResponse);

      const result = await chatBridge.validateConnection(mockAgent);
      assert.strictEqual(result, true);
    });

    test('should validate Ollama connection successfully', async () => {
      mockAgent.provider = 'ollama';
      mockAgent.config.provider = 'ollama';

      const mockResponse = {
        ok: true,
        status: 200,
        json: sinon.stub().resolves({
          models: [{ name: 'gpt-3.5-turbo' }]
        })
      };

      fetchStub.resolves(mockResponse);

      const result = await chatBridge.validateConnection(mockAgent);
      assert.strictEqual(result, true);
    });

    test('should return false for failed connection validation', async () => {
      fetchStub.rejects(new Error('Connection failed'));

      const result = await chatBridge.validateConnection(mockAgent);
      assert.strictEqual(result, false);
    });

    test('should return false for custom provider without endpoint', async () => {
      mockAgent.provider = 'custom';
      mockAgent.config.endpoint = undefined;

      const result = await chatBridge.validateConnection(mockAgent);
      assert.strictEqual(result, false);
    });
  });

  suite('streamMessage', () => {
    test('should handle streaming errors', async () => {
      const mockCallback = sinon.stub();
      fetchStub.rejects(new Error('Stream error'));

      try {
        await chatBridge.streamMessage(mockAgent, testMessages, mockCallback);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'STREAM_ERROR');
      }
    });
  });

  suite('ChatBridgeError', () => {
    test('should create error with correct properties', () => {
      const error = new ChatBridgeError('Test error', 'TEST_CODE', 'openai', 400);
      
      assert.strictEqual(error.message, 'Test error');
      assert.strictEqual(error.code, 'TEST_CODE');
      assert.strictEqual(error.provider, 'openai');
      assert.strictEqual(error.statusCode, 400);
      assert.strictEqual(error.name, 'ChatBridgeError');
    });
  });
});