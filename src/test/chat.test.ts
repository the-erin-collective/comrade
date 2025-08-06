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

  // Helper function to create a deep copy of the mockAgent object
  function createMockAgentCopy(): IAgent {
    return JSON.parse(JSON.stringify(mockAgent));
  }

  beforeEach(() => {
    chatBridge = new ChatBridge();
    // Create a proper fetch stub
    fetchStub = sinon.stub();
    // Assign it to global fetch
    (global as any).fetch = fetchStub;

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
    // Clean up the global fetch mock
    delete (global as any).fetch;
  });

  describe('Web Environment Streaming Fallback', () => {
    let webCompatibilityStub: sinon.SinonStub;
    let streamingConfigStub: sinon.SinonStub;

    beforeEach(() => {
      // Mock web environment for these tests
      webCompatibilityStub = sinon.stub(require('../core/webcompat').WebCompatibility, 'isWeb').returns(true);
      streamingConfigStub = sinon.stub(require('../core/webcompat').WebCompatibility, 'getStreamingSimulationConfig').returns({
        enabled: true,
        chunkSize: 10,
        delay: 10,
        wordBoundary: true,
        maxChunks: 50
      });
    });

    afterEach(() => {
      webCompatibilityStub.restore();
      streamingConfigStub.restore();
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
      // Mock the sendOpenAIMessage method directly
      const sendOpenAIStub = sinon.stub(chatBridge as any, 'sendOpenAIMessage').resolves({
        content: 'Hello! How can I help you?',
        finishReason: 'stop',
        usage: {
          promptTokens: 10,
          completionTokens: 15,
          totalTokens: 25
        },
        metadata: {
          provider: 'openai',
          model: 'gpt-3.5-turbo'
        }
      });

      const result = await chatBridge.sendMessage(mockAgent, testMessages);

      assert.strictEqual(result.content, 'Hello! How can I help you?');
      assert.strictEqual(result.finishReason, 'stop');
      assert.strictEqual(result.usage?.totalTokens, 25);
      assert.strictEqual(result.metadata?.provider, 'openai');
      
      sendOpenAIStub.restore();
    });

    it('should send Ollama message successfully', async () => {
      // Create a copy of mockAgent for this test
      const testAgent = createMockAgentCopy();
      testAgent.provider = 'ollama';
      testAgent.config.provider = 'ollama';
      testAgent.config.endpoint = 'http://localhost:11434';

      // Mock the sendOllamaMessage method directly
      const sendOllamaStub = sinon.stub(chatBridge as any, 'sendOllamaMessage').resolves({
        content: 'Hello from Ollama!',
        finishReason: 'stop',
        usage: {
          promptTokens: 10,
          completionTokens: 15,
          totalTokens: 25
        },
        metadata: {
          provider: 'ollama',
          model: 'llama2'
        }
      });

      const result = await chatBridge.sendMessage(testAgent, testMessages);

      assert.strictEqual(result.content, 'Hello from Ollama!');
      assert.strictEqual(result.finishReason, 'stop');
      assert.strictEqual(result.usage?.totalTokens, 25);
      assert.strictEqual(result.metadata?.provider, 'ollama');
      
      sendOllamaStub.restore();
    });

    it('should send custom provider message successfully', async () => {
      // Create a copy of mockAgent for this test
      const testAgent = createMockAgentCopy();
      testAgent.provider = 'custom';
      testAgent.config.provider = 'custom';
      testAgent.config.endpoint = 'https://custom-api.example.com/v1/chat/completions';

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

      const result = await chatBridge.sendMessage(testAgent, testMessages);

      assert.strictEqual(result.content, 'Hello from custom provider!');
      assert.strictEqual(result.finishReason, 'stop');
      assert.strictEqual(result.usage?.totalTokens, 30);
    });

    it('should handle OpenAI API errors', async () => {
      // Mock the sendOpenAIMessage method to throw a ChatBridgeError
      const apiError = new ChatBridgeError('Invalid API key', 'invalid_api_key', 'openai');
      const sendOpenAIStub = sinon.stub(chatBridge as any, 'sendOpenAIMessage').rejects(apiError);

      try {
        await chatBridge.sendMessage(mockAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'invalid_api_key');
      } finally {
        sendOpenAIStub.restore();
      }
    });

    it('should handle HTTP errors', async () => {
      // Mock the makeHttpRequest method to throw an HTTP error
      const httpError = new Error('HTTP 401: Unauthorized') as any;
      httpError.code = 'HTTP_ERROR';
      httpError.statusCode = 401;
      const makeHttpRequestStub = sinon.stub(chatBridge as any, 'makeHttpRequest').rejects(httpError);

      try {
        await chatBridge.sendMessage(mockAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('401') || error.message.includes('Unauthorized'));
      } finally {
        makeHttpRequestStub.restore();
      }
    });

    it('should handle network errors', async () => {
      // Mock the makeHttpRequest method to throw a network error
      const networkError = new Error('Network error') as any;
      networkError.code = 'NETWORK_ERROR';
      const makeHttpRequestStub = sinon.stub(chatBridge as any, 'makeHttpRequest').rejects(networkError);

      try {
        await chatBridge.sendMessage(mockAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Network error'));
      } finally {
        makeHttpRequestStub.restore();
      }
    });

    it('should throw error for unsupported provider', async () => {
      // Create a copy of mockAgent for this test
      const testAgent = createMockAgentCopy();
      
      testAgent.provider = 'unsupported' as LLMProvider;
      testAgent.config.provider = 'unsupported' as any;

      // Mock console.warn to silence the expected warning log
      const consoleWarnStub = sinon.stub(console, 'warn');

      try {
        await chatBridge.sendMessage(testAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'UNSUPPORTED_PROVIDER');
      } finally {
        consoleWarnStub.restore();
      }
    });

    it('should throw error for custom provider without endpoint', async () => {
      // Create a copy of mockAgent for this test
      const testAgent = createMockAgentCopy();
      
      testAgent.provider = 'custom';
      testAgent.config.provider = 'custom';
      testAgent.config.endpoint = undefined;

      try {
        await chatBridge.sendMessage(testAgent, testMessages);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'MISSING_ENDPOINT');
      }
    });
  });

  describe('validateConnection', () => {
    beforeEach(() => {
      // Ensure agent is reset to OpenAI provider before each test
      mockAgent.provider = 'openai';
      mockAgent.config.provider = 'openai';
      mockAgent.config.endpoint = undefined;
    });

    it('should validate OpenAI connection successfully', async () => {
      // Mock the validateOpenAIConnection method directly
      const validateOpenAIStub = sinon.stub(chatBridge as any, 'validateOpenAIConnection').resolves(true);

      const [isValid, errorMsg] = await chatBridge.validateConnection(mockAgent);
      assert.strictEqual(isValid, true);
      assert.strictEqual(errorMsg, undefined);
      
      validateOpenAIStub.restore();
    });

    it('should validate Ollama connection successfully', async () => {
      // Mock the validateOllamaConnection method directly
      const validateOllamaStub = sinon.stub(chatBridge as any, 'validateOllamaConnection').resolves(true);
      
      // Create a copy of mockAgent for this test
      const testAgent = createMockAgentCopy();
      
      // Set agent to Ollama provider
      testAgent.provider = 'ollama';
      testAgent.config.provider = 'ollama';

      const [isValid, errorMsg] = await chatBridge.validateConnection(testAgent);
      assert.strictEqual(isValid, true);
      assert.strictEqual(errorMsg, undefined);
      
      // Cleanup
      validateOllamaStub.restore();
    });

    it('should return false for failed connection validation', async () => {
      // Mock console.error to silence the expected error log
      const consoleErrorStub = sinon.stub(console, 'error');
      
      // Create a copy of mockAgent for this test
      const testAgent = createMockAgentCopy();
      
      // Set up a custom provider with an invalid endpoint
      testAgent.provider = 'custom';
      testAgent.config.provider = 'custom';
      testAgent.config.endpoint = 'http://invalid-endpoint';
      
      // Mock the makeHttpRequest method to throw a network error
      const networkError = new Error('Network error') as any;
      networkError.code = 'ECONNREFUSED';
      
      // Mock the sendCustomMessage method to throw a network error
      const sendCustomMessageStub = sinon.stub(chatBridge as any, 'sendCustomMessage')
        .rejects(networkError);

      try {
        const [isValid, errorMsg] = await chatBridge.validateConnection(testAgent);
        
        // Verify the connection was marked as invalid
        assert.strictEqual(isValid, false);
        assert.ok(
          errorMsg && errorMsg.includes('Could not connect to the custom LLM provider'),
          'Should include the connection refused error message'
        );
        
        // Verify the error was logged
        assert.strictEqual(consoleErrorStub.callCount, 1, 'Expected error to be logged');
      } finally {
        // Cleanup
        sendCustomMessageStub.restore();
        consoleErrorStub.restore();
      }
      
      // Verify error was logged (but silenced in test)
      assert.ok(consoleErrorStub.called, 'Error should have been logged');
    });

    it('should return false for custom provider without endpoint', async () => {
      // Mock console.error to silence the expected error log
      const consoleErrorStub = sinon.stub(console, 'error');
      
      // Create a copy of mockAgent for this test
      const testAgent = createMockAgentCopy();
      
      // Set agent to custom provider without endpoint
      testAgent.provider = 'custom';
      testAgent.config.provider = 'custom';
      testAgent.config.endpoint = undefined;

      try {
        const [isValid, errorMsg] = await chatBridge.validateConnection(testAgent);
        
        // Verify the connection was marked as invalid and contains the expected error message
        assert.strictEqual(isValid, false);
        assert.ok(
          errorMsg && errorMsg.includes('No endpoint configured for custom LLM provider'),
          `Should include the missing endpoint error message, got: ${errorMsg}`
        );
      } catch (error) {
        // If it's a ChatBridgeError, check the message
        if (error instanceof Error && error.name === 'ChatBridgeError') {
          assert.ok(
            error.message.includes('No endpoint configured for custom LLM provider'),
            `Should include the missing endpoint error message, got: ${error.message}`
          );
        } else {
          // Re-throw if it's not the expected error
          throw error;
        }
      } finally {
        consoleErrorStub.restore();
      }
    });
  });

  describe('streamMessage', () => {
    it('should handle streaming errors', async () => {
      const mockCallback = sinon.stub();
      
      // Mock the makeStreamingRequest method to throw an error
      const makeStreamingRequestStub = sinon.stub(chatBridge as any, 'makeStreamingRequest').rejects(new Error('Stream error'));

      try {
        await chatBridge.streamMessage(mockAgent, testMessages, mockCallback);
        assert.fail('Expected ChatBridgeError to be thrown');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Stream error'));
      } finally {
        makeStreamingRequestStub.restore();
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


