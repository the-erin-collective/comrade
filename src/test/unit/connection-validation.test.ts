/**
 * Tests for connection validation error handling
 */

import { strict as assert } from 'assert';
import * as sinon from 'sinon';
import { ChatBridge, ChatBridgeError } from '../../core/chat';
import { createMockAgent, mockAgentConfigurations } from '../mocks/agents';
import { WebNetworkUtils } from '../../core/webcompat';

suite('Connection Validation Tests', () => {
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

  suite('OpenAI Connection Validation', () => {
    test('should validate successful OpenAI connection', async () => {
      const agent = createMockAgent(mockAgentConfigurations.find(c => c.provider === 'openai')!);
      
      // Mock successful response
      makeRequestStub.resolves({
        status: 200,
        json: async () => ({}),
        text: async () => '{}'
      });

      const [isValid] = await chatBridge.validateConnection(agent);
      assert.strictEqual(isValid, true);
    });

    test('should handle invalid OpenAI API key', async () => {
      const agent = createMockAgent(mockAgentConfigurations.find(c => c.provider === 'openai')!);
      
      // Mock 401 response
      makeRequestStub.resolves({
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: {
            message: 'Incorrect API key provided',
            type: 'invalid_request_error'
          }
        }),
        text: async () => JSON.stringify({
          error: {
            message: 'Incorrect API key provided',
            type: 'invalid_request_error'
          }
        })
      });

      try {
        await chatBridge.validateConnection(agent);
        assert.fail('Should throw error for invalid API key');
      } catch (error: unknown) {
        assert(error instanceof ChatBridgeError);
        const chatBridgeError = error as ChatBridgeError;
        assert.strictEqual(chatBridgeError.code, 'INVALID_API_KEY');
        assert(chatBridgeError.message.includes('Invalid OpenAI API key'));
        assert(chatBridgeError.suggestedFix);
      }
    });

    test('should handle OpenAI API timeouts', async () => {
      const agent = createMockAgent(mockAgentConfigurations.find(c => c.provider === 'openai')!);
      
      // Mock timeout error
      const timeoutError = new Error('The operation was aborted due to timeout');
      timeoutError.name = 'AbortError';
      makeRequestStub.rejects(timeoutError);

      try {
        await chatBridge.validateConnection(agent);
        assert.fail('Should throw error for timeout');
      } catch (error) {
        assert(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'TIMEOUT');
        assert(error.message.includes('timed out'));
        assert(error.suggestedFix);
      }
    });
  });

  suite('Anthropic Connection Validation', () => {
    test('should validate successful Anthropic connection', async () => {
      const agent = createMockAgent(mockAgentConfigurations.find(c => c.provider === 'anthropic')!);
      
      // Mock successful response
      makeRequestStub.resolves({
        status: 200,
        json: async () => ({}),
        text: async () => '{}'
      });

      const [isValid] = await chatBridge.validateConnection(agent);
      assert.strictEqual(isValid, true);
    });

    test('should handle invalid Anthropic endpoint', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations.find(c => c.provider === 'anthropic')!,
        endpoint: 'https://invalid.anthropic.com/v1/messages'
      });
      
      // Mock 404 response
      makeRequestStub.resolves({
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: {
            type: 'not_found_error',
            message: 'Not found'
          }
        }),
        text: async () => JSON.stringify({
          error: {
            type: 'not_found_error',
            message: 'Not found'
          }
        })
      });

      try {
        await chatBridge.validateConnection(agent);
        assert.fail('Should throw error for invalid endpoint');
      } catch (error: unknown) {
        assert(error instanceof ChatBridgeError);
        const chatBridgeError = error as ChatBridgeError;
        assert.strictEqual(chatBridgeError.code, 'INVALID_ENDPOINT');
        assert(chatBridgeError.message.includes('Invalid Anthropic API endpoint'));
        assert(chatBridgeError.suggestedFix);
      }
    });
  });

  suite('Ollama Connection Validation', () => {
    test('should validate successful Ollama connection with matching model', async () => {
      const agent = createMockAgent(mockAgentConfigurations.find(c => c.provider === 'ollama')!);
      
      // Mock successful response with models list
      makeRequestStub.resolves({
        status: 200,
        json: async () => ({
          models: [
            { name: 'llama2' },
            { name: agent.config.model || 'llama2' },
            { name: 'mistral' }
          ]
        }),
        text: async () => JSON.stringify({
          models: [
            { name: 'llama2' },
            { name: agent.config.model || 'llama2' },
            { name: 'mistral' }
          ]
        })
      });

      const [isValid] = await chatBridge.validateConnection(agent);
      assert.strictEqual(isValid, true);
    });

    test('should handle missing Ollama model', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations.find(c => c.provider === 'ollama')!,
        model: 'non-existent-model'
      });
      
      // Mock successful response but without the requested model
      makeRequestStub.resolves({
        status: 200,
        json: async () => ({
          models: [
            { name: 'llama2' },
            { name: 'mistral' }
          ]
        }),
        text: async () => JSON.stringify({
          models: [
            { name: 'llama2' },
            { name: 'mistral' }
          ]
        })
      });

      try {
        await chatBridge.validateConnection(agent);
        assert.fail('Should throw error for missing model');
      } catch (error: unknown) {
        assert(error instanceof ChatBridgeError);
        const chatBridgeError = error as ChatBridgeError;
        assert.strictEqual(chatBridgeError.code, 'MODEL_NOT_FOUND');
        assert(chatBridgeError.message.includes('non-existent-model'));
      }
    });
  });

  suite('Custom Provider Validation', () => {
    test('should validate successful custom provider connection', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations.find(c => c.provider === 'custom')!,
        endpoint: 'https://custom-llm.example.com/v1/chat'
      });
      
      // Stub the sendCustomMessage method for testing
      const originalValidateCustomConnection = chatBridge['validateCustomConnection'].bind(chatBridge);
      const validateCustomConnectionStub = sandbox.stub(chatBridge as any, 'validateCustomConnection').resolves(true);

      try {
        const [isValid] = await chatBridge.validateConnection(agent);
        assert.strictEqual(isValid, true);
        assert(validateCustomConnectionStub.calledOnce);
      } finally {
        // Restore original method
        chatBridge['validateCustomConnection'] = originalValidateCustomConnection;
      }
    });

    test('should handle missing endpoint for custom provider', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations.find(c => c.provider === 'custom')!,
        endpoint: ''
      });

      try {
        await chatBridge.validateConnection(agent);
        assert.fail('Should throw error for missing endpoint');
      } catch (error) {
        assert(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'MISSING_ENDPOINT');
        assert(error.message.includes('No endpoint configured'));
        assert(error.suggestedFix);
      }
    });
  });

  test('should handle network errors with user-friendly messages', async () => {
    const agent = createMockAgent(mockAgentConfigurations.find(c => c.provider === 'openai')!);
    
    // Mock network error (e.g., DNS resolution failure)
    const networkError = new Error('getaddrinfo ENOTFOUND api.openai.com');
    makeRequestStub.rejects(networkError);

    try {
      await chatBridge.validateConnection(agent);
      assert.fail('Should throw error for network error');
    } catch (error: unknown) {
      assert(error instanceof ChatBridgeError);
      const chatBridgeError = error as ChatBridgeError;
      assert.strictEqual(chatBridgeError.code, 'NETWORK_ERROR');
      assert(chatBridgeError.message.includes('Network error'));
      assert(chatBridgeError.suggestedFix);
    }
  });
});
