/**
 * Integration tests for streaming across all providers
 * Tests streaming functionality for OpenAI, Anthropic, Ollama, and Custom providers
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ChatBridge, ChatMessage } from '../../core/chat';
import { AgentRegistry } from '../../core/registry';
import { ConfigurationManager } from '../../core/config';
import { mockAgentConfigurations, createMockAgent } from '../mocks/agents';

describe('Streaming Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let chatBridge: ChatBridge;
  let agentRegistry: AgentRegistry;
  let configManager: ConfigurationManager;
  let mockSecretStorage: any;  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    
    mockSecretStorage = {
      store: sandbox.stub(),
      get: sandbox.stub().resolves('test-api-key'),
      delete: sandbox.stub(),
      onDidChange: { dispose: () => {} }
    };

    configManager = ConfigurationManager.getInstance(mockSecretStorage);
    agentRegistry = AgentRegistry.getInstance(configManager);
    chatBridge = new ChatBridge();

    // Mock all agent configurations
    sandbox.stub(configManager, 'getAllAgents').resolves(
      mockAgentConfigurations.map(createMockAgent)
    );
    
    await agentRegistry.initialize();
  });  afterEach(() => {
    sandbox.restore();
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
  });

  it('should handle OpenAI streaming format', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock OpenAI streaming response
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub()
          .onCall(0).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n')
          })
          .onCall(1).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" world"}}]}\n\n')
          })
          .onCall(2).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"!"}}]}\n\n')
          })
          .onCall(3).resolves({
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n\n')
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

    const openaiAgent = agentRegistry.getAgent('openai-gpt4')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Say hello world' }
    ];

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    const response = await chatBridge.streamMessage(openaiAgent, messages, streamCallback);

    assert.ok(response.success, 'OpenAI streaming should succeed');
    assert.strictEqual(streamedContent, 'Hello world!', 'Should stream OpenAI content correctly');
    
    // Verify request format
    const requestBody = JSON.parse(fetchStub.getCall(0).args[1].body);
    assert.strictEqual(requestBody.stream, true, 'Should request streaming');
    assert.strictEqual(requestBody.model, 'gpt-4', 'Should use correct model');
  });

  it('should handle Anthropic streaming format', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock Anthropic streaming response
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub()
          .onCall(0).resolves({
            done: false,
            value: new TextEncoder().encode('event: message_start\ndata: {"type":"message_start"}\n\n')
          })
          .onCall(1).resolves({
            done: false,
            value: new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Anthropic"}}\n\n')
          })
          .onCall(2).resolves({
            done: false,
            value: new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" response"}}\n\n')
          })
          .onCall(3).resolves({
            done: false,
            value: new TextEncoder().encode('event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n')
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
      { role: 'user', content: 'Test Anthropic streaming' }
    ];

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    const response = await chatBridge.streamMessage(anthropicAgent, messages, streamCallback);

    assert.ok(response.success, 'Anthropic streaming should succeed');
    assert.strictEqual(streamedContent, 'Anthropic response', 'Should stream Anthropic content correctly');
  });

  it('should handle Ollama streaming format', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock Ollama streaming response (JSONL format)
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub()
          .onCall(0).resolves({
            done: false,
            value: new TextEncoder().encode('{"message":{"content":"Ollama"},"done":false}\n')
          })
          .onCall(1).resolves({
            done: false,
            value: new TextEncoder().encode('{"message":{"content":" streaming"},"done":false}\n')
          })
          .onCall(2).resolves({
            done: false,
            value: new TextEncoder().encode('{"message":{"content":" works"},"done":false}\n')
          })
          .onCall(3).resolves({
            done: false,
            value: new TextEncoder().encode('{"message":{"content":""},"done":true}\n')
          })
          .onCall(4).resolves({ done: true })
      })
    };

    fetchStub.resolves({
      ok: true,
      status: 200,
      body: mockStream,
      headers: new Map([['content-type', 'application/x-ndjson']])
    });

    const ollamaAgent = agentRegistry.getAgent('ollama-llama2')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test Ollama streaming' }
    ];

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    const response = await chatBridge.streamMessage(ollamaAgent, messages, streamCallback);

    assert.ok(response.success, 'Ollama streaming should succeed');
    assert.strictEqual(streamedContent, 'Ollama streaming works', 'Should stream Ollama content correctly');
  });

  it('should handle custom provider streaming format', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock custom provider streaming (OpenAI-compatible format)
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub()
          .onCall(0).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Custom"}}]}\n\n')
          })
          .onCall(1).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" provider"}}]}\n\n')
          })
          .onCall(2).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" streaming"}}]}\n\n')
          })
          .onCall(3).resolves({
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n\n')
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

    const customAgent = agentRegistry.getAgent('custom-model')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test custom provider streaming' }
    ];

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    const response = await chatBridge.streamMessage(customAgent, messages, streamCallback);

    assert.ok(response.success, 'Custom provider streaming should succeed');
    assert.strictEqual(streamedContent, 'Custom provider streaming', 'Should stream custom provider content correctly');
  });

  it('should handle streaming errors gracefully across providers', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Test network error during streaming
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub()
          .onCall(0).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n')
          })
          .onCall(1).rejects(new Error('Network error during streaming'))
      })
    };

    fetchStub.resolves({
      ok: true,
      status: 200,
      body: mockStream,
      headers: new Map([['content-type', 'text/event-stream']])
    });

    const openaiAgent = agentRegistry.getAgent('openai-gpt4')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test streaming error handling' }
    ];

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    const response = await chatBridge.streamMessage(openaiAgent, messages, streamCallback);

    assert.strictEqual(response.success, false, 'Should fail on streaming error');
    assert.ok(response.error, 'Should have error information');
    assert.strictEqual(streamedContent, 'Partial', 'Should preserve partial content before error');
  });

  it('should handle streaming cancellation across providers', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    let cancelled = false;
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub().callsFake(() => {
          if (cancelled) {
            return Promise.resolve({ done: true });
          }
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Streaming..."}}]}\n\n')
              });
            }, 100);
          });
        }),
        cancel: sandbox.stub().callsFake(() => {
          cancelled = true;
        })
      })
    };

    fetchStub.resolves({
      ok: true,
      status: 200,
      body: mockStream,
      headers: new Map([['content-type', 'text/event-stream']])
    });

    const agents = [
      agentRegistry.getAgent('openai-gpt4')!,
      agentRegistry.getAgent('anthropic-claude')!,
      agentRegistry.getAgent('custom-model')!
    ];

    for (const agent of agents) {
      cancelled = false;
      fetchStub.resetHistory();
      
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test cancellation' }
      ];

      let streamedContent = '';
      const streamCallback = (chunk: string) => {
        streamedContent += chunk;
      };

      const streamPromise = chatBridge.streamMessage(agent, messages, streamCallback);
      
      // Cancel after short delay
      setTimeout(() => {
        cancelled = true;
      }, 150);

      const response = await streamPromise;

      // Should handle cancellation gracefully
      assert.ok(
        response.success || response.error?.code === 'cancelled',
        `${agent.provider} should handle cancellation gracefully`
      );
    }
  });

  it('should handle web environment streaming fallback', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock CORS error for streaming
    fetchStub.onCall(0).rejects(new Error('CORS error: streaming not allowed'));
    
    // Mock successful non-streaming fallback
    fetchStub.onCall(1).resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: 'Fallback response content' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
    });

    const openaiAgent = agentRegistry.getAgent('openai-gpt4')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test web fallback' }
    ];

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    const response = await chatBridge.streamMessage(openaiAgent, messages, streamCallback, {
      webEnvironment: true
    });

    assert.ok(response.success, 'Should succeed with fallback');
    assert.ok(streamedContent.length > 0, 'Should simulate streaming with chunked delivery');
    assert.strictEqual(fetchStub.callCount, 2, 'Should attempt streaming then fallback');
  });

  it('should handle streaming with large responses efficiently', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Generate large streaming response
    const largeContent = 'This is a large response. '.repeat(1000);
    const chunks = largeContent.match(/.{1,50}/g) || [];
    
    const mockStream = {
      getReader: () => {
        let chunkIndex = 0;
        return {
          read: sandbox.stub().callsFake(() => {
            if (chunkIndex >= chunks.length) {
              return Promise.resolve({ done: true });
            }
            
            const chunk = chunks[chunkIndex++];
            return Promise.resolve({
              done: false,
              value: new TextEncoder().encode(`data: {"choices":[{"delta":{"content":"${chunk}"}}]}\n\n`)
            });
          })
        };
      }
    };

    fetchStub.resolves({
      ok: true,
      status: 200,
      body: mockStream,
      headers: new Map([['content-type', 'text/event-stream']])
    });

    const openaiAgent = agentRegistry.getAgent('openai-gpt4')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Generate a large response' }
    ];

    let streamedContent = '';
    let chunkCount = 0;
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
      chunkCount++;
    };

    const startTime = Date.now();
    const response = await chatBridge.streamMessage(openaiAgent, messages, streamCallback);
    const endTime = Date.now();

    assert.ok(response.success, 'Should handle large streaming response');
    assert.strictEqual(streamedContent, largeContent, 'Should stream all content correctly');
    assert.ok(chunkCount > 10, 'Should receive multiple chunks');
    assert.ok(endTime - startTime < 5000, 'Should complete within reasonable time');
  });

  it('should handle concurrent streaming requests', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock streaming responses for concurrent requests
    fetchStub.callsFake(() => {
      const mockStream = {
        getReader: () => ({
          read: sandbox.stub()
            .onCall(0).resolves({
              done: false,
              value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Concurrent"}}]}\n\n')
            })
            .onCall(1).resolves({
              done: false,
              value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" response"}}]}\n\n')
            })
            .onCall(2).resolves({
              done: false,
              value: new TextEncoder().encode('data: [DONE]\n\n')
            })
            .onCall(3).resolves({ done: true })
        })
      };

      return Promise.resolve({
        ok: true,
        status: 200,
        body: mockStream,
        headers: new Map([['content-type', 'text/event-stream']])
      });
    });

    const openaiAgent = agentRegistry.getAgent('openai-gpt4')!;
    
    // Create multiple concurrent streaming requests
    const streamPromises = Array.from({ length: 3 }, (_, i) => {
      const messages: ChatMessage[] = [
        { role: 'user', content: `Concurrent request ${i + 1}` }
      ];

      let streamedContent = '';
      const streamCallback = (chunk: string) => {
        streamedContent += chunk;
      };

      return chatBridge.streamMessage(openaiAgent, messages, streamCallback)
        .then(response => ({ response, streamedContent }));
    });

    const results = await Promise.all(streamPromises);

    // All concurrent streams should succeed
    results.forEach(({ response, streamedContent }, i) => {
      assert.ok(response.success, `Concurrent stream ${i + 1} should succeed`);
      assert.strictEqual(streamedContent, 'Concurrent response', `Stream ${i + 1} should have correct content`);
    });

    assert.strictEqual(fetchStub.callCount, 3, 'Should make 3 concurrent API calls');
  });

  it('should handle streaming with different chunk sizes', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Test different chunk sizes
    const chunkSizes = [1, 10, 100];
    
    for (const chunkSize of chunkSizes) {
      fetchStub.resetHistory();
      
      const content = 'x'.repeat(chunkSize);
      const mockStream = {
        getReader: () => ({
          read: sandbox.stub()
            .onCall(0).resolves({
              done: false,
              value: new TextEncoder().encode(`data: {"choices":[{"delta":{"content":"${content}"}}]}\n\n`)
            })
            .onCall(1).resolves({
              done: false,
              value: new TextEncoder().encode('data: [DONE]\n\n')
            })
            .onCall(2).resolves({ done: true })
        })
      };

      fetchStub.resolves({
        ok: true,
        status: 200,
        body: mockStream,
        headers: new Map([['content-type', 'text/event-stream']])
      });

      const openaiAgent = agentRegistry.getAgent('openai-gpt4')!;
      const messages: ChatMessage[] = [
        { role: 'user', content: `Test chunk size ${chunkSize}` }
      ];

      let streamedContent = '';
      const streamCallback = (chunk: string) => {
        streamedContent += chunk;
      };

      const response = await chatBridge.streamMessage(openaiAgent, messages, streamCallback);

      assert.ok(response.success, `Should handle chunk size ${chunkSize}`);
      assert.strictEqual(streamedContent, content, `Should stream content correctly for chunk size ${chunkSize}`);
    }
  });

  it('should handle streaming timeout scenarios', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock slow streaming response
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub().callsFake(() => {
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Slow"}}]}\n\n')
              });
            }, 2000); // 2 second delay
          });
        })
      })
    };

    fetchStub.resolves({
      ok: true,
      status: 200,
      body: mockStream,
      headers: new Map([['content-type', 'text/event-stream']])
    });

    const openaiAgent = agentRegistry.getAgent('openai-gpt4')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test streaming timeout' }
    ];

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    const response = await chatBridge.streamMessage(openaiAgent, messages, streamCallback, {
      timeout: 1000 // 1 second timeout
    });

    assert.strictEqual(response.success, false, 'Should timeout on slow streaming');
    assert.ok(response.error?.message.includes('timeout'), 'Should indicate timeout error');
  });

  it('should handle streaming with malformed data', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock streaming response with malformed JSON
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub()
          .onCall(0).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Valid"}}]}\n\n')
          })
          .onCall(1).resolves({
            done: false,
            value: new TextEncoder().encode('data: {invalid json}\n\n')
          })
          .onCall(2).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" content"}}]}\n\n')
          })
          .onCall(3).resolves({
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n\n')
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

    const openaiAgent = agentRegistry.getAgent('openai-gpt4')!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test malformed streaming data' }
    ];

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    const response = await chatBridge.streamMessage(openaiAgent, messages, streamCallback);

    // Should handle malformed data gracefully and continue streaming
    assert.ok(response.success, 'Should handle malformed data gracefully');
    assert.strictEqual(streamedContent, 'Valid content', 'Should skip malformed chunks and continue');
  });

  it('should handle provider-specific streaming headers', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    const providers = [
      { agent: 'openai-gpt4', expectedHeaders: { 'Authorization': 'Bearer test-api-key' } },
      { agent: 'anthropic-claude', expectedHeaders: { 'x-api-key': 'test-api-key', 'anthropic-version': '2023-06-01' } },
      { agent: 'custom-model', expectedHeaders: { 'Authorization': 'Bearer test-api-key' } }
    ];

    for (const { agent: agentId, expectedHeaders } of providers) {
      fetchStub.resetHistory();
      
      const mockStream = {
        getReader: () => ({
          read: sandbox.stub()
            .onCall(0).resolves({
              done: false,
              value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Test"}}]}\n\n')
            })
            .onCall(1).resolves({ done: true })
        })
      };

      fetchStub.resolves({
        ok: true,
        status: 200,
        body: mockStream,
        headers: new Map([['content-type', 'text/event-stream']])
      });

      const agent = agentRegistry.getAgent(agentId)!;
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test headers' }
      ];

      let streamedContent = '';
      const streamCallback = (chunk: string) => {
        streamedContent += chunk;
      };

      await chatBridge.streamMessage(agent, messages, streamCallback);

      // Verify correct headers were sent
      const [, options] = fetchStub.getCall(0).args;
      const headers = options.headers;
      
      Object.entries(expectedHeaders).forEach(([key, value]) => {
        assert.ok(
          headers[key] === value || headers[key.toLowerCase()] === value,
          `${agentId} should send correct ${key} header`
        );
      });
    }
  });
});

