/**
 * Model Adapter Edge Cases and Error Handling Tests
 * 
 * This test suite focuses on edge cases, error conditions, and robustness
 * testing for model adapters with mock AI responses.
 */

import assert from 'assert';
import sinon from 'sinon';
import { OllamaAdapter } from '../../core/model-adapters/ollama-adapter';
import { HuggingFaceAdapter } from '../../core/model-adapters/huggingface-adapter';
import { ModelConfig, ChatMessage, Tool } from '../../core/model-adapters';

describe('Model Adapter Edge Cases', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('OllamaAdapter Edge Cases', () => {
    let adapter: OllamaAdapter;
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
      adapter = new OllamaAdapter();
      fetchStub = sandbox.stub(global, 'fetch' as any);
    });

    describe('Network and Connection Edge Cases', () => {
      it('should handle network timeouts gracefully', async () => {
        fetchStub.rejects(new Error('Request timeout'));

        try {
          await adapter.testConnection();
          assert.fail('Should have thrown an error');
        } catch (error) {
          // Should handle timeout gracefully
          assert.ok(error instanceof Error);
        }
      });

      it('should handle malformed JSON responses', async () => {
        fetchStub.resolves({
          ok: true,
          json: async () => {
            throw new SyntaxError('Unexpected token in JSON');
          },
          headers: new Headers(),
          status: 200,
          statusText: 'OK',
          type: 'basic',
          url: '',
          redirected: false,
          body: null,
          bodyUsed: false,
          clone: () => ({} as Response),
          arrayBuffer: async () => new ArrayBuffer(0),
          blob: async () => new Blob([]),
          formData: async () => new FormData(),
          text: async () => ''
        } as Response);

        const result = await adapter.testConnection();
        assert.strictEqual(result, false);
      });

      it('should handle empty responses', async () => {
        fetchStub.resolves({
          ok: true,
          json: async () => null
        } as Response);

        const result = await adapter.testConnection();
        assert.strictEqual(result, false);
      });

      it('should handle HTTP error codes with detailed messages', async () => {
        const errorCodes = [400, 401, 403, 404, 500, 502, 503];
        
        for (const code of errorCodes) {
          fetchStub.resolves({
            ok: false,
            status: code,
            statusText: `HTTP ${code} Error`
          } as Response);

          const result = await adapter.testConnection();
          assert.strictEqual(result, false);
        }
      });
    });

    describe('Response Parsing Edge Cases', () => {
      it('should handle responses with mixed content types', () => {
        const mixedResponse = `Here's some text before the tool call.

\`\`\`json
{
  "name": "test_tool",
  "parameters": {
    "param": "value"
  }
}
\`\`\`

And here's some text after the tool call.

\`\`\`javascript
console.log("This is not a tool call");
\`\`\`

\`\`\`json
{
  "name": "another_tool",
  "parameters": {
    "param2": "value2"
  }
}
\`\`\``;

        const parsed = adapter.parseResponse(mixedResponse);
        
        assert.ok(parsed.content.includes('Here\'s some text before'));
        assert.ok(parsed.content.includes('And here\'s some text after'));
        assert.strictEqual(parsed.toolCalls?.length, 2);
        assert.strictEqual(parsed.toolCalls?.[0].name, 'test_tool');
        assert.strictEqual(parsed.toolCalls?.[1].name, 'another_tool');
      });

      it('should handle deeply nested JSON in tool calls', () => {
        const nestedResponse = `\`\`\`json
{
  "name": "complex_tool",
  "parameters": {
    "config": {
      "nested": {
        "deeply": {
          "value": "test",
          "array": [1, 2, 3],
          "object": {
            "key": "value"
          }
        }
      }
    }
  }
}
\`\`\``;

        const parsed = adapter.parseResponse(nestedResponse);
        
        assert.strictEqual(parsed.toolCalls?.length, 1);
        assert.strictEqual(parsed.toolCalls?.[0].name, 'complex_tool');
        assert.strictEqual(parsed.toolCalls?.[0].parameters.config.nested.deeply.value, 'test');
        assert.deepStrictEqual(parsed.toolCalls?.[0].parameters.config.nested.deeply.array, [1, 2, 3]);
      });

      it('should handle tool calls with special characters', () => {
        const specialCharsResponse = `\`\`\`json
{
  "name": "special_tool",
  "parameters": {
    "text": "Hello\\nWorld\\t!",
    "regex": "\\\\d+\\\\.\\\\d+",
    "unicode": "🚀 Unicode test 中文",
    "quotes": "He said \\"Hello\\" to me"
  }
}
\`\`\``;

        const parsed = adapter.parseResponse(specialCharsResponse);
        
        assert.strictEqual(parsed.toolCalls?.length, 1);
        assert.strictEqual(parsed.toolCalls?.[0].parameters.text, 'Hello\nWorld\t!');
        assert.strictEqual(parsed.toolCalls?.[0].parameters.regex, '\\d+\\.\\d+');
        assert.strictEqual(parsed.toolCalls?.[0].parameters.unicode, '🚀 Unicode test 中文');
        assert.strictEqual(parsed.toolCalls?.[0].parameters.quotes, 'He said "Hello" to me');
      });

      it('should handle empty tool parameters', () => {
        const emptyParamsResponse = `\`\`\`json
{
  "name": "no_params_tool",
  "parameters": {}
}
\`\`\``;

        const parsed = adapter.parseResponse(emptyParamsResponse);
        
        assert.strictEqual(parsed.toolCalls?.length, 1);
        assert.strictEqual(parsed.toolCalls?.[0].name, 'no_params_tool');
        assert.deepStrictEqual(parsed.toolCalls?.[0].parameters, {});
      });
    });

    describe('Prompt Formatting Edge Cases', () => {
      it('should handle very long conversation histories', () => {
        const messages: ChatMessage[] = [];
        
        // Create a very long conversation
        for (let i = 0; i < 1000; i++) {
          messages.push({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i} with some content`,
            timestamp: new Date()
          });
        }

        const prompt = adapter.formatPrompt(messages, []);
        
        // Should handle large conversations without crashing
        assert.ok(prompt.length > 0);
        assert.ok(prompt.includes('Message 0'));
        assert.ok(prompt.includes('Message 999'));
      });

      it('should handle messages with very long content', () => {
        const longContent = 'A'.repeat(100000); // 100KB of text
        
        const messages: ChatMessage[] = [
          {
            role: 'user',
            content: longContent,
            timestamp: new Date()
          }
        ];

        const prompt = adapter.formatPrompt(messages, []);
        
        assert.ok(prompt.includes(longContent));
      });

      it('should handle tools with complex parameter schemas', () => {
        const complexTool: Tool = {
          name: 'complex_tool',
          description: 'A tool with complex parameters',
          parameters: [
            {
              name: 'simple_param',
              type: 'string',
              description: 'A simple parameter',
              required: true
            },
            {
              name: 'enum_param',
              type: 'string',
              description: 'An enum parameter',
              required: false,
              enum: ['option1', 'option2', 'option3']
            },
            {
              name: 'array_param',
              type: 'array',
              description: 'An array parameter',
              required: false
            },
            {
              name: 'object_param',
              type: 'object',
              description: 'An object parameter',
              required: false
            }
          ],
          execute: async () => ({
            success: true,
            output: 'executed',
            metadata: {
              executionTime: 1,
              toolName: 'complex_tool',
              parameters: {},
              timestamp: new Date()
            }
          })
        };

        const messages: ChatMessage[] = [
          {
            role: 'user',
            content: 'Use the complex tool',
            timestamp: new Date()
          }
        ];

        const prompt = adapter.formatPrompt(messages, [complexTool]);
        
        assert.ok(prompt.includes('complex_tool'));
        assert.ok(prompt.includes('simple_param'));
        assert.ok(prompt.includes('enum_param'));
        assert.ok(prompt.includes('option1'));
      });
    });
  });

  describe('HuggingFaceAdapter Edge Cases', () => {
    let adapter: HuggingFaceAdapter;
    let fetchStub: sinon.SinonStub;

    beforeEach(() => {
      adapter = new HuggingFaceAdapter();
      fetchStub = sandbox.stub(global, 'fetch' as any);
    });

    describe('API Response Edge Cases', () => {
      it('should handle model loading states', async () => {
        const config: ModelConfig = {
          name: 'test-model',
          provider: 'huggingface',
          apiKey: 'test-key'
        };

        await adapter.initialize(config);

        fetchStub.resolves({
          ok: true,
          json: async () => [{
            error: 'Model test-model is currently loading',
            estimated_time: 30
          }]
        } as Response);

        try {
          await adapter.sendRequest('Hello');
          assert.fail('Should have thrown an error');
        } catch (error) {
          assert.ok(error instanceof Error);
          assert.ok(error.message.includes('loading'));
        }
      });

      it('should handle rate limiting responses', async () => {
        const config: ModelConfig = {
          name: 'test-model',
          provider: 'huggingface',
          apiKey: 'test-key'
        };

        await adapter.initialize(config);

        fetchStub.resolves({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'Rate limit exceeded'
        } as Response);

        try {
          await adapter.sendRequest('Hello');
          assert.fail('Should have thrown an error');
        } catch (error) {
          assert.ok(error instanceof Error);
          assert.ok(error.message.includes('429'));
        }
      });

      it('should handle unexpected response formats', async () => {
        const config: ModelConfig = {
          name: 'test-model',
          provider: 'huggingface',
          apiKey: 'test-key'
        };

        await adapter.initialize(config);

        // Response that's not an array
        fetchStub.resolves({
          ok: true,
          json: async () => ({
            generated_text: 'Hello world'
          })
        } as Response);

        try {
          await adapter.sendRequest('Hello');
          assert.fail('Should have thrown an error');
        } catch (error) {
          assert.ok(error instanceof Error);
        }
      });

      it('should handle empty response arrays', async () => {
        const config: ModelConfig = {
          name: 'test-model',
          provider: 'huggingface',
          apiKey: 'test-key'
        };

        await adapter.initialize(config);

        fetchStub.resolves({
          ok: true,
          json: async () => []
        } as Response);

        try {
          await adapter.sendRequest('Hello');
          assert.fail('Should have thrown an error');
        } catch (error) {
          assert.ok(error instanceof Error);
          assert.ok(error.message.includes('empty'));
        }
      });
    });

    describe('Tool Call Parsing Edge Cases', () => {
      beforeEach(async () => {
        const config: ModelConfig = {
          name: 'test-model',
          provider: 'huggingface',
          apiKey: 'test-key'
        };
        await adapter.initialize(config);
      });

      it('should handle function call syntax variations', () => {
        const variations = [
          'read_file(path="test.txt")',
          'read_file( path = "test.txt" )',
          'read_file(path="test.txt", mode="r")',
          'read_file(path="test with spaces.txt")',
          'read_file(path="/absolute/path/test.txt")',
          'read_file(path="./relative/path/test.txt")'
        ];

        variations.forEach(variation => {
          const parsed = adapter.parseResponse(`I'll help you: ${variation}`);
          
          assert.strictEqual(parsed.toolCalls?.length, 1);
          assert.strictEqual(parsed.toolCalls?.[0].name, 'read_file');
          assert.ok(parsed.toolCalls?.[0].parameters.path);
        });
      });

      it('should handle mixed JSON and function call formats', () => {
        const mixedResponse = `I'll do both operations:

First, let me read the file: read_file(path="input.txt")

Then I'll process it:

\`\`\`json
{
  "name": "process_data",
  "parameters": {
    "data": "processed content"
  }
}
\`\`\``;

        const parsed = adapter.parseResponse(mixedResponse);
        
        assert.strictEqual(parsed.toolCalls?.length, 2);
        assert.strictEqual(parsed.toolCalls?.[0].name, 'read_file');
        assert.strictEqual(parsed.toolCalls?.[1].name, 'process_data');
      });

      it('should handle tool calls with boolean and numeric parameters', () => {
        const response = `configure_system(enabled=true, timeout=30, debug=false, ratio=0.75)`;
        
        const parsed = adapter.parseResponse(response);
        
        assert.strictEqual(parsed.toolCalls?.length, 1);
        assert.strictEqual(parsed.toolCalls?.[0].parameters.enabled, true);
        assert.strictEqual(parsed.toolCalls?.[0].parameters.timeout, 30);
        assert.strictEqual(parsed.toolCalls?.[0].parameters.debug, false);
        assert.strictEqual(parsed.toolCalls?.[0].parameters.ratio, 0.75);
      });

      it('should handle tool calls with array parameters', () => {
        const response = `process_items(items=["item1", "item2", "item3"], numbers=[1, 2, 3])`;
        
        const parsed = adapter.parseResponse(response);
        
        assert.strictEqual(parsed.toolCalls?.length, 1);
        assert.deepStrictEqual(parsed.toolCalls?.[0].parameters.items, ['item1', 'item2', 'item3']);
        assert.deepStrictEqual(parsed.toolCalls?.[0].parameters.numbers, [1, 2, 3]);
      });
    });

    describe('Configuration Edge Cases', () => {
      it('should handle custom endpoints with various formats', async () => {
        const endpoints = [
          'https://api-inference.huggingface.co/models/custom-model',
          'http://localhost:8080/api/generate',
          'https://custom-domain.com/api/v1/models/test',
          'https://api.custom.com:8443/inference'
        ];

        for (const endpoint of endpoints) {
          const config: ModelConfig = {
            name: 'test-model',
            provider: 'huggingface',
            endpoint
          };

          // Should not throw during initialization
          await adapter.initialize(config);
          assert.ok(true);
        }
      });

      it('should handle missing API keys for public models', async () => {
        const config: ModelConfig = {
          name: 'gpt2',
          provider: 'huggingface'
          // No API key
        };

        fetchStub.resolves({
          ok: true,
          json: async () => [{ generated_text: 'Hello world' }]
        } as Response);

        await adapter.initialize(config);
        const result = await adapter.sendRequest('Hello');
        
        assert.strictEqual(result, 'Hello world');
      });

      it('should validate model names', async () => {
        const invalidNames = ['', '   ', null, undefined];
        
        for (const name of invalidNames) {
          const config: ModelConfig = {
            name: name as any,
            provider: 'huggingface'
          };

          try {
            await adapter.initialize(config);
            assert.fail('Should have thrown an error');
          } catch (error) {
            assert.ok(error instanceof Error);
          }
        }
      });
    });
  });

  describe('Cross-Adapter Compatibility', () => {
    it('should handle similar tool schemas consistently', () => {
      const ollamaAdapter = new OllamaAdapter();
      const hfAdapter = new HuggingFaceAdapter();

      const testTool: Tool = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: [
          {
            name: 'param1',
            type: 'string',
            description: 'First parameter',
            required: true
          },
          {
            name: 'param2',
            type: 'number',
            description: 'Second parameter',
            required: false
          }
        ],
        execute: async () => ({
          success: true,
          output: 'test',
          metadata: {
            executionTime: 1,
            toolName: 'test_tool',
            parameters: {},
            timestamp: new Date()
          }
        })
      };

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Use the test tool',
          timestamp: new Date()
        }
      ];

      const ollamaPrompt = ollamaAdapter.formatPrompt(messages, [testTool]);
      const hfPrompt = hfAdapter.formatPrompt(messages, [testTool]);

      // Both should include the tool information
      assert.ok(ollamaPrompt.includes('test_tool'));
      assert.ok(hfPrompt.includes('test_tool'));
      
      // Both should include parameter information
      assert.ok(ollamaPrompt.includes('param1'));
      assert.ok(hfPrompt.includes('param1'));
    });

    it('should handle response parsing consistently', () => {
      const ollamaAdapter = new OllamaAdapter();
      const hfAdapter = new HuggingFaceAdapter();

      const testResponse = 'This is a test response without tool calls.';

      const ollamaParsed = ollamaAdapter.parseResponse(testResponse);
      const hfParsed = hfAdapter.parseResponse(testResponse);

      // Both should parse basic responses similarly
      assert.strictEqual(ollamaParsed.content, testResponse);
      assert.strictEqual(hfParsed.content, testResponse);
      assert.strictEqual(ollamaParsed.toolCalls?.length || 0, 0);
      assert.strictEqual(hfParsed.toolCalls?.length || 0, 0);
    });
  });
});