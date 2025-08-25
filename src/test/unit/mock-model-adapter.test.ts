import { MockModelAdapter } from '../../core/model-adapters/mock-model-adapter';
import { Tool } from '../../core/model-adapters/base-model-adapter';
import { expect } from 'chai';

describe('MockModelAdapter', () => {
  let adapter: MockModelAdapter;
  
  beforeEach(() => {
    adapter = new MockModelAdapter();
  });

  describe('streaming', () => {
    it('should support streaming', () => {
      expect(adapter.supportsStreaming()).to.be.true;
    });

    it('should stream response in chunks', async () => {
      const testPrompt = 'Test prompt';
      const chunks: string[] = [];
      
      await adapter.sendStreamingRequest(testPrompt, (chunk) => {
        chunks.push(chunk.content);
      });

      // Verify we received multiple chunks
      expect(chunks.length).to.be.greaterThan(1);
      
      // Verify the complete response is correct when joined
      const fullResponse = chunks.join('');
      expect(fullResponse).to.include('This is a streaming mock response to: ' + testPrompt);
    });

    it('should handle aborting a streaming request', async () => {
      const testPrompt = 'Test prompt for abort';
      const chunks: string[] = [];
      
      // Start the request but abort it after a short delay
      const streamingPromise = adapter.sendStreamingRequest(testPrompt, (chunk) => {
        chunks.push(chunk.content);
      });
      
      // Abort after a short delay to allow some chunks to be received
      setTimeout(() => adapter.abortStreaming(), 100);
      
      // Should reject with abort error
      try {
        await streamingPromise;
        expect.fail('Expected promise to be rejected');
      } catch (error) {
        expect((error as Error).message).to.include('Request was aborted');
      }
      
      // Should have received some chunks before aborting
      expect(chunks.length).to.be.greaterThan(0);
      
      // The complete response should not have been received
      const fullResponse = chunks.join('');
      expect(fullResponse.length).to.be.lessThan(50); // Arbitrary length check
    });
  });

  describe('tool calling', () => {
    it('should support tool calling', () => {
      expect(adapter.supportsToolCalling()).to.be.true;
    });

    it('should format tools in prompt', () => {
      const tools: Tool[] = [
        {
          name: 'test_tool',
          description: 'A test tool',
          parameters: [
            {
              name: 'param1',
              type: 'string',
              description: 'Test parameter',
              required: true
            }
          ],
          execute: async () => ({ success: true, metadata: { executionTime: 0, toolName: 'test', parameters: {}, timestamp: new Date() } })
        }
      ];
      
      const prompt = adapter.formatPrompt([{
        role: 'user',
        content: 'Hello',
        timestamp: new Date()
      }], tools);
      
      expect(prompt).to.include('test_tool');
      expect(prompt).to.include('A test tool');
      expect(prompt).to.include('param1');
    });
  });

  describe('configuration', () => {
    it('should initialize with valid config', async () => {
      await adapter.initialize({
        name: 'test-model',
        provider: 'mock',
        temperature: 0.7
      });
      // If we get here without throwing, the test passes
    });

    it('should test connection successfully', async () => {
      await adapter.initialize({
        name: 'test-model',
        provider: 'mock'
      });
      
      const isConnected = await adapter.testConnection();
      expect(isConnected).to.be.true;
    });
  });
});
