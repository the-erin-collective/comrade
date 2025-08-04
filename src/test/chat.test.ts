/**
 * Tests for ChatBridge implementation
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
// Mocha globals are provided by the test environment
import { ChatBridge, ChatBridgeError, ChatMessage } from '../core/chat';
import { IAgent, LLMProvider, AgentConfig, AgentCapabilities } from '../core/agent';

describe('ChatBridge', () => {
  let chatBridge: ChatBridge;
  let mockAgent: IAgent;
  let testMessages: ChatMessage[];
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
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

  afterEach(() => {
    sinon.restore();
  });

  describe('Web Environment Streaming Fallback', () => {
    let webCompatibilityStub: sinon.SinonStub;

    beforeEach(() => {
      // Mock web environment for these tests
      webCompatibilityStub = sinon.stub(require('../core/webcompat').WebCompatibility, 'isWeb').returns(true);
      sinon.stub(require('../core/webcompat').WebCompatibility, 'getStreamingSimulationConfig').returns({
        enabled: true,
        chunkSize: 10,
        delay: 10,
        wordBoundary: true,
        maxChunks: 50
      });
    });

    afterEach(() => {
      webCompatibilityStub.restore();
    });

    it('should simulate streaming in web environment', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Hello world! This is a test response.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 }
      };

      fetchStub.resolves({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResponse),
        headers: new Map([['content-type', 'application/json']])
      });

      const chunks: string[] = [];
      let completed = false;

      const callback = (chunk: string, isComplete: boolean) => {
        if (chunk) {
          chunks.push(chunk);
        }
        if (isComplete) {
          completed = true;
        }
      };

      // Mock the makeHttpRequest method to return our test response
      const makeHttpRequestStub = sinon.stub(chatBridge as any, 'makeHttpRequest').resolves({
        text: async () => JSON.stringify(mockResponse)
      });

      try {
        await (chatBridge as any).makeStreamingRequest(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: testMessages }),
            timeout: 30000
          },
          callback,
          'openai'
        );

        // Verify that streaming simulation worked
        assert.ok(chunks.length > 1, 'Should have received multiple chunks');
        assert.strictEqual(completed, true, 'Should have completed');
        
        // Verify that all chunks combined equal the original content
        const combinedContent = chunks.join('');
        assert.strictEqual(combinedContent, 'Hello world! This is a test response.');
      } finally {
        makeHttpRequestStub.restore();
      }
    });

    it('should handle empty content gracefully', async () => {
      const mockResponse = {
        choices: [{ message: { content: '' } }],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 }
      };

      const chunks: string[] = [];
      let completed = false;

      const callback = (chunk: string, isComplete: boolean) => {
        if (chunk) {
          chunks.push(chunk);
        }
        if (isComplete) {
          completed = true;
        }
      };

      const makeHttpRequestStub = sinon.stub(chatBridge as any, 'makeHttpRequest').resolves({
        text: async () => JSON.stringify(mockResponse)
      });

      try {
        await (chatBridge as any).makeStreamingRequest(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: testMessages }),
            timeout: 30000
          },
          callback,
          'openai'
        );

        // Should complete immediately with empty content
        assert.strictEqual(chunks.length, 0, 'Should have no content chunks');
        assert.strictEqual(completed, true, 'Should have completed');
      } finally {
        makeHttpRequestStub.restore();
      }
    });

    it('should break at word boundaries when possible', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'This is a test sentence with multiple words that should break nicely.' } }]
      };

      const chunks: string[] = [];
      let completed = false;

      const callback = (chunk: string, isComplete: boolean) => {
        if (chunk) {
          chunks.push(chunk);
        }
        if (isComplete) {
          completed = true;
        }
      };

      const makeHttpRequestStub = sinon.stub(chatBridge as any, 'makeHttpRequest').resolves({
        text: async () => JSON.stringify(mockResponse)
      });

      try {
        await (chatBridge as any).makeStreamingRequest(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: testMessages }),
            timeout: 30000
          },
          callback,
          'openai'
        );

        // Verify word boundary breaking
        assert.ok(chunks.length > 1, 'Should have multiple chunks');
        assert.strictEqual(completed, true, 'Should have completed');
        
        // Most chunks should end with spaces or punctuation (word boundaries)
        const chunksEndingWithBoundary = chunks.filter(chunk => 
          chunk.endsWith(' ') || chunk.endsWith('.') || chunk.endsWith(',') || chunk.endsWith('!')
        );
        
        // At least some chunks should respect word boundaries
        assert.ok(chunksEndingWithBoundary.length > 0, 'Some chunks should end at word boundaries');
      } finally {
        makeHttpRequestStub.restore();
      }
    });

  it('should handle different provider formats', async () => {
      // Test Ollama format
      const ollamaResponse = {
        message: { content: 'Ollama response content' },
        done: true
      };

      // Test Anthropic format
      const anthropicResponse = {
        content: [{ text: 'Anthropic response content' }]
      };

      const testCases = [
        { format: 'ollama' as const, response: ollamaResponse, expectedContent: 'Ollama response content' },
        { format: 'anthropic' as const, response: anthropicResponse, expectedContent: 'Anthropic response content' }
      ];

      for (const testCase of testCases) {
        const chunks: string[] = [];
        let completed = false;

        const callback = (chunk: string, isComplete: boolean) => {
          if (chunk) {
            chunks.push(chunk);
          }
          if (isComplete) {
            completed = true;
          }
        };

        const makeHttpRequestStub = sinon.stub(chatBridge as any, 'makeHttpRequest').resolves({
          text: async () => JSON.stringify(testCase.response)
        });

        try {
          await (chatBridge as any).makeStreamingRequest(
            'https://api.example.com/chat',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: testMessages }),
              timeout: 30000
            },
            callback,
            testCase.format
          );

          // Verify content was streamed correctly
          const combinedContent = chunks.join('');
          assert.strictEqual(combinedContent, testCase.expectedContent, `${testCase.format} content should match`);
          assert.strictEqual(completed, true, `${testCase.format} should have completed`);
        } finally {
          makeHttpRequestStub.restore();
        }
      }
    });
  });

  describe('sendMessage', () => {
    it('should send OpenAI message successfully', async () => {
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

    it('should send Ollama message successfully', async () => {
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

    it('should send custom provider message successfully', async () => {
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

    it('should handle OpenAI API errors', async () => {
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

    it('should handle HTTP errors', async () => {
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

    it('should handle network errors', async () => {
      fetchStub.rejects(new Error('Network error'));

      try {
        await chatBridge.sendMessage(mockAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'NETWORK_ERROR');
      }
    });

    it('should throw error for unsupported provider', async () => {
      mockAgent.provider = 'unsupported' as LLMProvider;

      try {
        await chatBridge.sendMessage(mockAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'UNSUPPORTED_PROVIDER');
      }
    });

    it('should throw error for custom provider without endpoint', async () => {
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

  describe('validateConnection', () => {
    it('should validate OpenAI connection successfully', async () => {
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

    it('should validate Ollama connection successfully', async () => {
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

    it('should return false for failed connection validation', async () => {
      fetchStub.rejects(new Error('Connection failed'));

      const result = await chatBridge.validateConnection(mockAgent);
      assert.strictEqual(result, false);
    });

    it('should return false for custom provider without endpoint', async () => {
      mockAgent.provider = 'custom';
      mockAgent.config.endpoint = undefined;

      const result = await chatBridge.validateConnection(mockAgent);
      assert.strictEqual(result, false);
    });
  });

  describe('streamMessage', () => {
    it('should handle streaming errors', async () => {
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

  describe('ChatBridgeError', () => {
    it('should create error with correct properties', () => {
      const error = new ChatBridgeError('Test error', 'TEST_CODE', 'openai', 400);
      
      assert.strictEqual(error.message, 'Test error');
      assert.strictEqual(error.code, 'TEST_CODE');
      assert.strictEqual(error.provider, 'openai');
      assert.strictEqual(error.statusCode, 400);
      assert.strictEqual(error.name, 'ChatBridgeError');
    });
  });
});


