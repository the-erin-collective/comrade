/**
 * Integration tests for Anthropic provider workflow
 * Tests end-to-end Anthropic provider functionality including message formatting,
 * system message handling, streaming, and error handling
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ChatBridge, ChatMessage, ChatResponse } from '../../core/chat';
import { AgentRegistry } from '../../core/registry';
import { ConfigurationManager } from '../../core/config';
import { mockAgentConfigurations, createMockAgent } from '../mocks/agents';
import { getMockResponse } from '../mocks/llm-responses';

describe('Anthropic Provider Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let chatBridge: ChatBridge;
  let agentRegistry: AgentRegistry;
  let configManager: ConfigurationManager;
  let mockSecretStorage: any;  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    
    // Mock secret storage
    mockSecretStorage = {
      store: sandbox.stub(),
      get: sandbox.stub().resolves('test-anthropic-key'),
      delete: sandbox.stub(),
      onDidChange: { dispose: () => {} }
    };

    // Initialize components
    configManager = ConfigurationManager.getInstance(mockSecretStorage);
    agentRegistry = AgentRegistry.getInstance(configManager);
    chatBridge = new ChatBridge();

    // Mock agent configurations with Anthropic agent
    const anthropicConfig = mockAgentConfigurations.find(c => c.provider === 'anthropic')!;
    sandbox.stub(configManager, 'getAllAgents').resolves([createMockAgent(anthropicConfig)]);
    
    await agentRegistry.initialize();
  });  afterEach(() => {
    sandbox.restore();
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
  });

  it('should format Anthropic API requests correctly', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock successful Anthropic response
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        content: [{
          type: 'text',
          text: 'Hello! I can help you with coding tasks.'
        }],
        model: 'claude-3-sonnet-20240229',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 15,
          output_tokens: 12
        }
      })
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful coding assistant.' },
      { role: 'user', content: 'Hello, can you help me with TypeScript?' }
    ];

    const response = await chatBridge.sendMessage(anthropicAgent, messages);

    // Verify request format
    assert.ok(fetchStub.calledOnce, 'Should make one API call');
    const [url, options] = fetchStub.getCall(0).args;
    
    assert.ok(url.includes('anthropic.com'), 'Should call Anthropic API');
    assert.strictEqual(options.method, 'POST', 'Should use POST method');
    
    const requestBody = JSON.parse(options.body);
    
    // Verify Anthropic-specific request format
    assert.ok(requestBody.system, 'Should include system parameter');
    assert.strictEqual(requestBody.system, 'You are a helpful coding assistant.', 'System message should be in system parameter');
    assert.ok(Array.isArray(requestBody.messages), 'Should include messages array');
    assert.strictEqual(requestBody.messages.length, 1, 'Should only include user message in messages array');
    assert.strictEqual(requestBody.messages[0].role, 'user', 'First message should be user message');
    assert.strictEqual(requestBody.model, 'claude-3-sonnet-20240229', 'Should include correct model');
    assert.strictEqual(requestBody.max_tokens, 4000, 'Should include max_tokens');

    // Verify response parsing
    assert.ok(response.success, 'Response should be successful');
    assert.strictEqual(response.content, 'Hello! I can help you with coding tasks.', 'Should parse content correctly');
    assert.strictEqual(response.finishReason, 'stop', 'Should map stop_reason to finishReason');
  });

  it('should handle Anthropic system message conversion', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        content: [{ type: 'text', text: 'System message processed correctly.' }],
        model: 'claude-3-sonnet-20240229',
        role: 'assistant',
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 8 }
      })
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are an expert TypeScript developer with 10 years of experience.' },
      { role: 'user', content: 'Explain interfaces vs types in TypeScript.' },
      { role: 'assistant', content: 'I can explain the differences...' },
      { role: 'user', content: 'Can you provide examples?' }
    ];

    await chatBridge.sendMessage(anthropicAgent, messages);

    const requestBody = JSON.parse(fetchStub.getCall(0).args[1].body);
    
    // Verify system message handling
    assert.strictEqual(
      requestBody.system, 
      'You are an expert TypeScript developer with 10 years of experience.',
      'System message should be extracted to system parameter'
    );
    
    // Verify conversation messages (excluding system)
    assert.strictEqual(requestBody.messages.length, 3, 'Should have 3 conversation messages');
    assert.strictEqual(requestBody.messages[0].role, 'user', 'First message should be user');
    assert.strictEqual(requestBody.messages[1].role, 'assistant', 'Second message should be assistant');
    assert.strictEqual(requestBody.messages[2].role, 'user', 'Third message should be user');
  });

  it('should handle Anthropic streaming responses', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock streaming response
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub()
          .onCall(0).resolves({
            done: false,
            value: new TextEncoder().encode('event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-3-sonnet-20240229","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":15,"output_tokens":0}}}\n\n')
          })
          .onCall(1).resolves({
            done: false,
            value: new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n')
          })
          .onCall(2).resolves({
            done: false,
            value: new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world!"}}\n\n')
          })
          .onCall(3).resolves({
            done: false,
            value: new TextEncoder().encode('event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":3}}\n\n')
          })
          .onCall(4).resolves({ done: true })
      })
    };

    fetchStub.resolves({
      ok: true,
      status: 200,
      body: mockStream,
      headers: new Map([['content-type', 'text/event-stream']])
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Say hello world' }
    ];

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    const response = await chatBridge.streamMessage(anthropicAgent, messages, streamCallback);

    // Verify streaming worked
    assert.ok(response.success, 'Streaming should succeed');
    assert.strictEqual(streamedContent, 'Hello world!', 'Should stream content correctly');
    
    // Verify request included streaming parameter
    const requestBody = JSON.parse(fetchStub.getCall(0).args[1].body);
    assert.strictEqual(requestBody.stream, true, 'Should request streaming');
  });

  it('should handle Anthropic-specific error codes', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Test rate limit error
    fetchStub.onCall(0).resolves({
      ok: false,
      status: 429,
      json: sandbox.stub().resolves({
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded'
        }
      })
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test message' }
    ];

    const response = await chatBridge.sendMessage(anthropicAgent, messages);

    assert.strictEqual(response.success, false, 'Should fail on rate limit');
    assert.ok(response.error, 'Should have error information');
    assert.strictEqual(response.error.code, 'rate_limit_exceeded', 'Should map Anthropic error code');
    assert.ok(response.error.message.includes('Rate limit'), 'Should include error message');

    // Test authentication error
    fetchStub.onCall(1).resolves({
      ok: false,
      status: 401,
      json: sandbox.stub().resolves({
        type: 'error',
        error: {
          type: 'authentication_error',
          message: 'Invalid API key'
        }
      })
    });

    const response2 = await chatBridge.sendMessage(anthropicAgent, messages);

    assert.strictEqual(response2.success, false, 'Should fail on auth error');
    assert.strictEqual(response2.error?.code, 'invalid_api_key', 'Should map auth error code');
  });

  it('should validate Anthropic connection', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock successful validation response
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        content: [{ type: 'text', text: 'Connection test successful' }],
        model: 'claude-3-sonnet-20240229',
        role: 'assistant',
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 4 }
      })
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    const isAvailable = await anthropicAgent.isAvailable();

    assert.strictEqual(isAvailable, true, 'Should validate connection successfully');
    
    // Verify validation request
    const requestBody = JSON.parse(fetchStub.getCall(0).args[1].body);
    assert.ok(requestBody.messages, 'Should send test message');
    assert.strictEqual(requestBody.max_tokens, 10, 'Should use minimal tokens for validation');
  });

  it('should handle Anthropic model variants', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Test different Claude models
    const modelVariants = [
      'claude-3-haiku-20240307',
      'claude-3-sonnet-20240229', 
      'claude-3-opus-20240229'
    ];

    for (const model of modelVariants) {
      fetchStub.resetHistory();
      fetchStub.resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          content: [{ type: 'text', text: `Response from ${model}` }],
          model: model,
          role: 'assistant',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 }
        })
      });

      // Create agent with specific model
      const agentConfig = {
        ...mockAgentConfigurations.find(c => c.provider === 'anthropic')!,
        model: model,
        id: `anthropic-${model.split('-')[2]}`
      };
      
      const agent = createMockAgent(agentConfig);
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test message' }
      ];

      const response = await chatBridge.sendMessage(agent, messages);

      assert.ok(response.success, `Should work with ${model}`);
      
      const requestBody = JSON.parse(fetchStub.getCall(0).args[1].body);
      assert.strictEqual(requestBody.model, model, `Should use correct model: ${model}`);
    }
  });

  it('should handle Anthropic context length limits', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock context length exceeded error
    fetchStub.resolves({
      ok: false,
      status: 400,
      json: sandbox.stub().resolves({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Request too large. Maximum context length exceeded.'
        }
      })
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    const longMessage = 'x'.repeat(200000); // Very long message
    const messages: ChatMessage[] = [
      { role: 'user', content: longMessage }
    ];

    const response = await chatBridge.sendMessage(anthropicAgent, messages);

    assert.strictEqual(response.success, false, 'Should fail on context length exceeded');
    assert.strictEqual(response.error?.code, 'context_length_exceeded', 'Should map to context length error');
    assert.ok(response.error?.message.includes('context length'), 'Should mention context length in error');
  });

  it('should handle Anthropic tool use capabilities', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock tool use response
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        content: [{
          type: 'tool_use',
          id: 'toolu_123',
          name: 'create_file',
          input: {
            path: 'test.ts',
            content: 'console.log("Hello");'
          }
        }],
        model: 'claude-3-sonnet-20240229',
        role: 'assistant',
        stop_reason: 'tool_use',
        usage: { input_tokens: 50, output_tokens: 25 }
      })
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    
    // Ensure agent has tool use capability
    anthropicAgent.capabilities.hasToolUse = true;
    
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Create a TypeScript file that logs hello' }
    ];

    const response = await chatBridge.sendMessage(anthropicAgent, messages, {
      tools: [{
        name: 'create_file',
        description: 'Create a new file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' }
          },
          required: ['path', 'content']
        }
      }]
    });

    assert.ok(response.success, 'Should handle tool use successfully');
    assert.strictEqual(response.finishReason, 'tool_calls', 'Should indicate tool use');
    assert.ok(response.toolCalls, 'Should include tool calls');
    assert.strictEqual(response.toolCalls![0].name, 'create_file', 'Should call correct tool');
    
    // Verify request included tools
    const requestBody = JSON.parse(fetchStub.getCall(0).args[1].body);
    assert.ok(requestBody.tools, 'Should include tools in request');
    assert.strictEqual(requestBody.tools[0].name, 'create_file', 'Should include tool definition');
  });

  it('should handle Anthropic streaming cancellation', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    let readerCancelled = false;
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub().callsFake(() => {
          if (readerCancelled) {
            return Promise.resolve({ done: true });
          }
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                done: false,
                value: new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Streaming..."}}\n\n')
              });
            }, 100);
          });
        }),
        cancel: sandbox.stub().callsFake(() => {
          readerCancelled = true;
        })
      })
    };

    fetchStub.resolves({
      ok: true,
      status: 200,
      body: mockStream,
      headers: new Map([['content-type', 'text/event-stream']])
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Start streaming response' }
    ];

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    // Start streaming and cancel after short delay
    const streamPromise = chatBridge.streamMessage(anthropicAgent, messages, streamCallback);
    
    setTimeout(() => {
      // Simulate cancellation
      readerCancelled = true;
    }, 150);

    const response = await streamPromise;

    // Should handle cancellation gracefully
    assert.ok(response.success || response.error?.code === 'cancelled', 'Should handle cancellation');
  });

  it('should handle Anthropic retry logic with exponential backoff', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // First call fails with rate limit
    fetchStub.onCall(0).resolves({
      ok: false,
      status: 429,
      headers: new Map([['retry-after', '2']]),
      json: sandbox.stub().resolves({
        type: 'error',
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded'
        }
      })
    });

    // Second call succeeds
    fetchStub.onCall(1).resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        content: [{ type: 'text', text: 'Success after retry' }],
        model: 'claude-3-sonnet-20240229',
        role: 'assistant',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 }
      })
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test retry logic' }
    ];

    const startTime = Date.now();
    const response = await chatBridge.sendMessage(anthropicAgent, messages, {
      maxRetries: 1,
      retryDelay: 100 // Short delay for testing
    });
    const endTime = Date.now();

    assert.ok(response.success, 'Should succeed after retry');
    assert.strictEqual(response.content, 'Success after retry', 'Should get successful response');
    assert.ok(endTime - startTime >= 100, 'Should wait before retry');
    assert.strictEqual(fetchStub.callCount, 2, 'Should make two API calls');
  });

  it('should handle Anthropic batch requests efficiently', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock responses for multiple requests
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        content: [{ type: 'text', text: 'Batch response' }],
        model: 'claude-3-sonnet-20240229',
        role: 'assistant',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 }
      })
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    
    // Send multiple requests concurrently
    const requests = Array.from({ length: 5 }, (_, i) => 
      chatBridge.sendMessage(anthropicAgent, [
        { role: 'user', content: `Request ${i + 1}` }
      ])
    );

    const responses = await Promise.all(requests);

    // All requests should succeed
    responses.forEach((response, i) => {
      assert.ok(response.success, `Request ${i + 1} should succeed`);
      assert.strictEqual(response.content, 'Batch response', `Request ${i + 1} should have correct content`);
    });

    assert.strictEqual(fetchStub.callCount, 5, 'Should make 5 API calls');
  });

  it('should handle Anthropic response metadata correctly', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        id: 'msg_123456',
        content: [{ type: 'text', text: 'Response with metadata' }],
        model: 'claude-3-sonnet-20240229',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 25,
          output_tokens: 15
        }
      })
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test metadata handling' }
    ];

    const response = await chatBridge.sendMessage(anthropicAgent, messages);

    assert.ok(response.success, 'Should succeed');
    assert.ok(response.usage, 'Should include usage information');
    assert.strictEqual(response.usage!.promptTokens, 25, 'Should map input_tokens to promptTokens');
    assert.strictEqual(response.usage!.completionTokens, 15, 'Should map output_tokens to completionTokens');
    assert.strictEqual(response.usage!.totalTokens, 40, 'Should calculate total tokens');
    
    assert.ok(response.metadata, 'Should include metadata');
    assert.strictEqual(response.metadata!.provider, 'anthropic', 'Should include provider');
    assert.strictEqual(response.metadata!.model, 'claude-3-sonnet-20240229', 'Should include model');
    assert.ok(response.metadata!.messageId, 'Should include message ID');
  });
});

