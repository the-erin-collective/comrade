/**
 * Integration tests for enhanced error handling in ChatBridge
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ChatBridge, ChatBridgeError, ChatMessage } from '../../core/chat';
import { createMockAgent } from '../mocks/agents';
import { mockAgentConfigurations } from '../mocks/agents';
import { WebNetworkUtils } from '../../core/webcompat';

suite('Enhanced Error Handling Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let chatBridge: ChatBridge;
  let makeRequestStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    chatBridge = new ChatBridge();
    makeRequestStub = sandbox.stub(WebNetworkUtils, 'makeRequest');
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('OpenAI Provider Error Handling', () => {
    test('should handle rate limit with retry-after header and exponential backoff', async () => {
      const agent = createMockAgent(mockAgentConfigurations[0]); // OpenAI agent
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      // First call: rate limit with retry-after
      makeRequestStub.onCall(0).resolves({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '2' },
        body: JSON.stringify({
          error: {
            message: 'Rate limit exceeded',
            code: 'rate_limit_exceeded'
          }
        })
      });

      // Second call: success
      makeRequestStub.onCall(1).resolves({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({
          choices: [{
            message: { content: 'Success after rate limit' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      });

      const startTime = Date.now();
      const result = await chatBridge.sendMessage(agent, messages);
      const endTime = Date.now();

      assert.strictEqual(result.content, 'Success after rate limit');
      assert.ok(endTime - startTime >= 2000, 'Should respect retry-after header');
      assert.strictEqual(makeRequestStub.callCount, 2);
    });

    test('should handle context length exceeded with detailed suggestions', async () => {
      const agent = createMockAgent(mockAgentConfigurations[0]);
      const messages: ChatMessage[] = [{ role: 'user', content: 'Very long message...' }];

      makeRequestStub.resolves({
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        body: JSON.stringify({
          error: {
            message: 'This model\'s maximum context length is 4097 tokens. However, your messages resulted in 5000 tokens.',
            code: 'context_length_exceeded'
          }
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw context length error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'context_length_exceeded');
        assert.strictEqual(error.retryable, false);
        assert.ok(error.suggestedFix?.includes('Current: 5000 tokens'));
        assert.ok(error.suggestedFix?.includes('Maximum: 4097 tokens'));
        assert.ok(error.suggestedFix?.includes('GPT-4 Turbo'));
        assert.ok(error.suggestedFix?.includes('Shortening your message'));
      }
    });

    test('should handle authentication error without retry', async () => {
      const agent = createMockAgent(mockAgentConfigurations[0]);
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.resolves({
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        body: JSON.stringify({
          error: {
            message: 'Invalid API key provided',
            code: 'invalid_api_key'
          }
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw authentication error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'invalid_api_key');
        assert.strictEqual(error.retryable, false);
        assert.ok(error.suggestedFix?.includes('Check your OPENAI API key'));
        assert.strictEqual(makeRequestStub.callCount, 1, 'Should not retry authentication errors');
      }
    });

    test('should handle server error with retry', async () => {
      const agent = createMockAgent(mockAgentConfigurations[0]);
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      // First two calls: server error
      makeRequestStub.onCall(0).resolves({
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        body: JSON.stringify({
          error: {
            message: 'Internal server error',
            code: 'server_error'
          }
        })
      });

      makeRequestStub.onCall(1).resolves({
        status: 503,
        statusText: 'Service Unavailable',
        headers: {},
        body: JSON.stringify({
          error: {
            message: 'Service temporarily unavailable',
            code: 'service_unavailable'
          }
        })
      });

      // Third call: success
      makeRequestStub.onCall(2).resolves({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({
          choices: [{
            message: { content: 'Success after server error' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      });

      const result = await chatBridge.sendMessage(agent, messages);

      assert.strictEqual(result.content, 'Success after server error');
      assert.strictEqual(makeRequestStub.callCount, 3);
    });

    test('should handle quota exceeded error', async () => {
      const agent = createMockAgent(mockAgentConfigurations[0]);
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.resolves({
        status: 429,
        statusText: 'Too Many Requests',
        headers: {},
        body: JSON.stringify({
          error: {
            message: 'You exceeded your current quota, please check your plan and billing details',
            code: 'insufficient_quota'
          }
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw quota exceeded error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'quota_exceeded');
        assert.strictEqual(error.retryable, false);
        assert.ok(error.suggestedFix?.includes('quota has been exceeded'));
        assert.ok(error.suggestedFix?.includes('billing settings'));
      }
    });

    test('should handle model not found error', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[0],
        model: 'gpt-5-nonexistent'
      });
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.resolves({
        status: 404,
        statusText: 'Not Found',
        headers: {},
        body: JSON.stringify({
          error: {
            message: 'The model `gpt-5-nonexistent` does not exist',
            code: 'model_not_found'
          }
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw model not found error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'model_not_found');
        assert.strictEqual(error.retryable, false);
        assert.ok(error.suggestedFix?.includes('model name'));
        assert.ok(error.suggestedFix?.includes('supported by OPENAI'));
      }
    });
  });

  suite('Anthropic Provider Error Handling', () => {
    test('should handle Anthropic rate limit with retry-after', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[1], // Anthropic agent
        provider: 'anthropic'
      });
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      // First call: rate limit
      makeRequestStub.onCall(0).resolves({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '30' },
        body: JSON.stringify({
          error: {
            type: 'rate_limit_error',
            message: 'Rate limit exceeded'
          }
        })
      });

      // Second call: success
      makeRequestStub.onCall(1).resolves({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({
          content: [{ text: 'Success after Anthropic rate limit' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 }
        })
      });

      const startTime = Date.now();
      const result = await chatBridge.sendMessage(agent, messages);
      const endTime = Date.now();

      assert.strictEqual(result.content, 'Success after Anthropic rate limit');
      assert.ok(endTime - startTime >= 30000, 'Should respect Anthropic retry-after header');
      assert.strictEqual(makeRequestStub.callCount, 2);
    });

    test('should handle Anthropic authentication error', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[1],
        provider: 'anthropic'
      });
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.resolves({
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        body: JSON.stringify({
          error: {
            type: 'authentication_error',
            message: 'Invalid API key'
          }
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw authentication error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'invalid_api_key');
        assert.strictEqual(error.retryable, false);
        assert.ok(error.suggestedFix?.includes('ANTHROPIC API key'));
      }
    });

    test('should handle Anthropic context length with Claude-specific suggestions', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[1],
        provider: 'anthropic'
      });
      const messages: ChatMessage[] = [{ role: 'user', content: 'Very long message...' }];

      makeRequestStub.resolves({
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        body: JSON.stringify({
          error: {
            type: 'invalid_request_error',
            message: 'Input is too long. Maximum context length is 200000 tokens.'
          }
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw context length error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'context_length_exceeded');
        assert.ok(error.suggestedFix?.includes('Claude-3 models'));
        assert.ok(error.suggestedFix?.includes('200K tokens'));
      }
    });

    test('should handle Anthropic overloaded error with retry', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[1],
        provider: 'anthropic'
      });
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      // First call: overloaded
      makeRequestStub.onCall(0).resolves({
        status: 503,
        statusText: 'Service Unavailable',
        headers: {},
        body: JSON.stringify({
          error: {
            type: 'overloaded_error',
            message: 'The model is currently overloaded'
          }
        })
      });

      // Second call: success
      makeRequestStub.onCall(1).resolves({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({
          content: [{ text: 'Success after overload' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 }
        })
      });

      const result = await chatBridge.sendMessage(agent, messages);

      assert.strictEqual(result.content, 'Success after overload');
      assert.strictEqual(makeRequestStub.callCount, 2);
    });
  });

  suite('Ollama Provider Error Handling', () => {
    test('should handle Ollama connection refused error', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[3], // Ollama agent
        provider: 'ollama'
      });
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.rejects(new Error('ECONNREFUSED: Connection refused'));

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw connection refused error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'connection_refused');
        assert.strictEqual(error.retryable, true);
        assert.ok(error.suggestedFix?.includes('Ollama server is not running'));
        assert.ok(error.suggestedFix?.includes('ollama serve'));
      }
    });

    test('should handle Ollama model not found error', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[3],
        provider: 'ollama',
        model: 'nonexistent-model'
      });
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.resolves({
        status: 404,
        statusText: 'Not Found',
        headers: {},
        body: JSON.stringify({
          error: 'model "nonexistent-model" not found'
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw model not found error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'model_not_found');
        assert.strictEqual(error.retryable, false);
        assert.ok(error.suggestedFix?.includes('model name'));
      }
    });

    test('should handle Ollama out of memory error', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[3],
        provider: 'ollama'
      });
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.resolves({
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        body: JSON.stringify({
          error: 'Out of memory: failed to allocate tensor'
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw out of memory error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'out_of_memory');
        assert.strictEqual(error.retryable, false);
        assert.ok(error.suggestedFix?.includes('ran out of memory'));
        assert.ok(error.suggestedFix?.includes('smaller model'));
      }
    });
  });

  suite('Custom Provider Error Handling', () => {
    test('should handle custom provider using OpenAI-compatible format', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[4], // Custom provider
        provider: 'custom'
      });
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.resolves({
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '45' },
        body: JSON.stringify({
          error: {
            message: 'Rate limit exceeded',
            code: 'rate_limit_exceeded'
          }
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw rate limit error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'rate_limit_exceeded');
        assert.strictEqual(error.provider, 'custom');
        assert.strictEqual(error.retryAfter, 45);
        assert.ok(error.suggestedFix?.includes('CUSTOM plan'));
      }
    });
  });

  suite('Network Error Handling', () => {
    test('should handle network timeout with retry', async () => {
      const agent = createMockAgent(mockAgentConfigurations[0]);
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      // First two calls: timeout
      makeRequestStub.onCall(0).rejects(new Error('Request timeout'));
      makeRequestStub.onCall(1).rejects(new Error('Request timeout'));

      // Third call: success
      makeRequestStub.onCall(2).resolves({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({
          choices: [{
            message: { content: 'Success after timeout' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      });

      const result = await chatBridge.sendMessage(agent, messages);

      assert.strictEqual(result.content, 'Success after timeout');
      assert.strictEqual(makeRequestStub.callCount, 3);
    });

    test('should handle DNS resolution failure', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[4],
        endpoint: 'https://nonexistent-domain.invalid/api'
      });
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.rejects(new Error('ENOTFOUND nonexistent-domain.invalid'));

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw DNS error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'network_error');
        assert.ok(error.message.includes('ENOTFOUND'));
      }
    });
  });

  suite('Response Parsing Error Handling', () => {
    test('should handle invalid JSON response', async () => {
      const agent = createMockAgent(mockAgentConfigurations[0]);
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.resolves({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'Invalid JSON response'
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw JSON parsing error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'invalid_response');
        assert.ok(error.message.includes('Invalid JSON response'));
        assert.ok(error.suggestedFix?.includes('unexpected response format'));
      }
    });

    test('should handle missing choices in OpenAI response', async () => {
      const agent = createMockAgent(mockAgentConfigurations[0]);
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.resolves({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
          // Missing choices array
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw invalid response error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'invalid_response');
        assert.ok(error.message.includes('No choices'));
        assert.ok(error.suggestedFix?.includes('request parameters'));
      }
    });
  });

  suite('Retry Logic Integration', () => {
    test('should implement exponential backoff with jitter', async () => {
      const agent = createMockAgent(mockAgentConfigurations[0]);
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      // First two calls: server error
      makeRequestStub.onCall(0).resolves({
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        body: JSON.stringify({
          error: { message: 'Server error', code: 'server_error' }
        })
      });

      makeRequestStub.onCall(1).resolves({
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        body: JSON.stringify({
          error: { message: 'Server error', code: 'server_error' }
        })
      });

      // Third call: success
      makeRequestStub.onCall(2).resolves({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({
          choices: [{
            message: { content: 'Success with backoff' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      });

      const startTime = Date.now();
      const result = await chatBridge.sendMessage(agent, messages);
      const endTime = Date.now();

      assert.strictEqual(result.content, 'Success with backoff');
      assert.strictEqual(makeRequestStub.callCount, 3);
      
      // Should have delays: ~1000ms + ~2000ms = ~3000ms minimum
      assert.ok(endTime - startTime >= 3000, 'Should implement exponential backoff delays');
    });

    test('should not retry non-retryable errors', async () => {
      const agent = createMockAgent(mockAgentConfigurations[0]);
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      makeRequestStub.resolves({
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        body: JSON.stringify({
          error: {
            message: 'Invalid API key',
            code: 'invalid_api_key'
          }
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw authentication error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'invalid_api_key');
        assert.strictEqual(makeRequestStub.callCount, 1, 'Should not retry authentication errors');
      }
    });

    test('should allow extra retries for rate limit errors', async () => {
      const agent = createMockAgent(mockAgentConfigurations[0]);
      const messages: ChatMessage[] = [{ role: 'user', content: 'Test message' }];

      // Mock 4 rate limit responses (more than normal max retries)
      for (let i = 0; i < 4; i++) {
        makeRequestStub.onCall(i).resolves({
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '1' },
          body: JSON.stringify({
            error: {
              message: 'Rate limit exceeded',
              code: 'rate_limit_exceeded'
            }
          })
        });
      }

      // Fifth call: success
      makeRequestStub.onCall(4).resolves({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: JSON.stringify({
          choices: [{
            message: { content: 'Success after many rate limits' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      });

      const result = await chatBridge.sendMessage(agent, messages);

      assert.strictEqual(result.content, 'Success after many rate limits');
      assert.strictEqual(makeRequestStub.callCount, 5, 'Should allow extra retries for rate limits');
    });
  });
});