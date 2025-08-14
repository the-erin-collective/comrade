/**
 * Unit tests for ConversationContextManager
 */

import assert from 'assert';
import { 
  ConversationContextManager, 
  createConversationContext, 
  createCodingConversationContext,
  ConversationContextConfig
} from '../../core/conversation-context';
import { AIMessage, AIToolResult } from '../../core/ai-agent';

describe('ConversationContextManager', () => {
  let context: ConversationContextManager;

  beforeEach(() => {
    context = new ConversationContextManager();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      assert.deepStrictEqual(context.messages, []);
      assert.deepStrictEqual(context.toolResults, []);
      assert.strictEqual(context.systemPrompt, 'You are a helpful AI coding assistant.');
      assert.strictEqual(context.maxTokens, 4000);
    });

    it('should initialize with custom configuration', () => {
      const customConfig: Partial<ConversationContextConfig> = {
        maxTokens: 8000,
        systemPrompt: 'Custom prompt',
        truncationStrategy: 'sliding_window',
        preserveToolResults: false
      };

      const customContext = new ConversationContextManager(customConfig);
      
      assert.strictEqual(customContext.maxTokens, 8000);
      assert.strictEqual(customContext.systemPrompt, 'Custom prompt');
    });
  });

  describe('message management', () => {
    it('should add messages to context', () => {
      const message: AIMessage = {
        role: 'user',
        content: 'Hello, world!',
        timestamp: new Date()
      };

      context.addMessage(message);
      
      assert.strictEqual(context.messages.length, 1);
      assert.deepStrictEqual(context.messages[0], message);
    });

    it('should add multiple messages', () => {
      const messages: AIMessage[] = [
        { role: 'user', content: 'First message', timestamp: new Date() },
        { role: 'assistant', content: 'First response', timestamp: new Date() },
        { role: 'user', content: 'Second message', timestamp: new Date() }
      ];

      messages.forEach(msg => context.addMessage(msg));
      
      assert.strictEqual(context.messages.length, 3);
      assert.deepStrictEqual(context.messages, messages);
    });

    it('should add tool results to context', () => {
      const toolResult: AIToolResult = {
        success: true,
        output: 'Tool execution result',
        metadata: {
          executionTime: 100,
          toolName: 'test-tool',
          parameters: { param: 'value' },
          timestamp: new Date()
        }
      };

      context.addToolResult(toolResult);
      
      assert.strictEqual(context.toolResults.length, 1);
      assert.deepStrictEqual(context.toolResults[0], toolResult);
    });
  });

  describe('token counting', () => {
    it('should estimate token count for empty context', () => {
      const tokenCount = context.getTokenCount();
      assert(tokenCount > 0, 'Should include system prompt tokens');
    });

    it('should estimate token count for messages', () => {
      const message: AIMessage = {
        role: 'user',
        content: 'This is a test message with some content',
        timestamp: new Date()
      };

      const initialTokens = context.getTokenCount();
      context.addMessage(message);
      const newTokens = context.getTokenCount();
      
      assert(newTokens > initialTokens, 'Token count should increase after adding message');
    });

    it('should include tool results in token count', () => {
      const toolResult: AIToolResult = {
        success: true,
        output: 'This is tool output that should be counted',
        metadata: {
          executionTime: 100,
          toolName: 'test-tool',
          parameters: {},
          timestamp: new Date()
        }
      };

      const initialTokens = context.getTokenCount();
      context.addToolResult(toolResult);
      const newTokens = context.getTokenCount();
      
      assert(newTokens > initialTokens, 'Token count should increase after adding tool result');
    });
  });

  describe('context truncation', () => {
    beforeEach(() => {
      // Create a context with small token limit for testing
      context = new ConversationContextManager({
        maxTokens: 100,
        truncationStrategy: 'recent',
        minRecentMessages: 1
      });
    });

    it('should not truncate when under token limit', () => {
      const message: AIMessage = {
        role: 'user',
        content: 'Short message',
        timestamp: new Date()
      };

      context.addMessage(message);
      const messageCount = context.messages.length;
      
      context.truncateIfNeeded();
      
      assert.strictEqual(context.messages.length, messageCount);
    });

    it('should truncate when over token limit', () => {
      // Disable auto-truncation during message addition for this test
      const originalTruncate = context.truncateIfNeeded;
      context.truncateIfNeeded = () => {}; // Temporarily disable
      
      // Add many messages to exceed token limit
      for (let i = 0; i < 10; i++) {
        context.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `This is a longer message ${i} that will help exceed the token limit for testing truncation functionality`,
          timestamp: new Date()
        });
      }

      const initialCount = context.messages.length;
      
      // Restore truncation and call it manually
      context.truncateIfNeeded = originalTruncate;
      context.truncateIfNeeded();
      
      assert(context.messages.length < initialCount, 'Should have fewer messages after truncation');
      assert(context.getTokenCount() <= context.maxTokens, 'Should be within token limit after truncation');
    });

    it('should preserve system messages during truncation', () => {
      // Add system message
      context.addMessage({
        role: 'system',
        content: 'System message that should be preserved',
        timestamp: new Date()
      });

      // Add many other messages
      for (let i = 0; i < 10; i++) {
        context.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i} with enough content to trigger truncation when combined with other messages`,
          timestamp: new Date()
        });
      }

      context.truncateIfNeeded();
      
      const systemMessages = context.messages.filter(m => m.role === 'system');
      assert.strictEqual(systemMessages.length, 1);
    });
  });

  describe('system prompt management', () => {
    it('should update system prompt', () => {
      const newPrompt = 'Updated system prompt';
      
      context.updateSystemPrompt(newPrompt);
      
      assert.strictEqual(context.systemPrompt, newPrompt);
    });

    it('should trigger truncation after system prompt update', () => {
      // Add messages first
      for (let i = 0; i < 5; i++) {
        context.addMessage({
          role: 'user',
          content: `Message ${i}`,
          timestamp: new Date()
        });
      }

      // Update to a very long system prompt
      const longPrompt = 'This is a very long system prompt '.repeat(100);
      context.updateSystemPrompt(longPrompt);
      
      // Should have triggered truncation
      assert(context.getTokenCount() <= context.maxTokens, 'Should be within token limit after prompt update');
    });
  });

  describe('configuration management', () => {
    it('should update configuration', () => {
      const newConfig: Partial<ConversationContextConfig> = {
        maxTokens: 8000,
        truncationStrategy: 'sliding_window',
        preserveToolResults: false
      };

      context.updateConfig(newConfig);
      
      assert.strictEqual(context.maxTokens, 8000);
    });

    it('should trigger truncation when max tokens reduced', () => {
      // Add many messages
      for (let i = 0; i < 10; i++) {
        context.addMessage({
          role: 'user',
          content: `Message ${i} with content`,
          timestamp: new Date()
        });
      }

      // Reduce max tokens significantly
      context.updateConfig({ maxTokens: 50 });
      
      assert(context.getTokenCount() <= 50, 'Should be within new token limit');
    });
  });

  describe('context operations', () => {
    it('should clear context', () => {
      // Add some data
      context.addMessage({
        role: 'user',
        content: 'Test message',
        timestamp: new Date()
      });
      
      context.addToolResult({
        success: true,
        output: 'Test output',
        metadata: {
          executionTime: 100,
          toolName: 'test',
          parameters: {},
          timestamp: new Date()
        }
      });

      context.clear();
      
      assert.strictEqual(context.messages.length, 0);
      assert.strictEqual(context.toolResults.length, 0);
    });

    it('should provide context statistics', () => {
      context.addMessage({
        role: 'user',
        content: 'Test message',
        timestamp: new Date()
      });

      const stats = context.getStats();
      
      assert.strictEqual(stats.messageCount, 1);
      assert.strictEqual(stats.toolResultCount, 0);
      assert(stats.tokenCount > 0, 'Should have positive token count');
      assert(stats.createdAt instanceof Date, 'Should have creation date');
      assert(stats.lastUpdated instanceof Date, 'Should have last updated date');
      assert(stats.config !== undefined, 'Should have config');
    });
  });

  describe('serialization', () => {
    it('should serialize context', () => {
      // Add some data
      context.addMessage({
        role: 'user',
        content: 'Test message',
        timestamp: new Date()
      });
      
      context.addToolResult({
        success: true,
        output: 'Test output',
        metadata: {
          executionTime: 100,
          toolName: 'test',
          parameters: {},
          timestamp: new Date()
        }
      });

      const serialized = context.serialize();
      
      assert.strictEqual(serialized.messages.length, 1);
      assert.strictEqual(serialized.toolResults.length, 1);
      assert.strictEqual(serialized.systemPrompt, context.systemPrompt);
      assert.strictEqual(serialized.maxTokens, context.maxTokens);
      assert(serialized.metadata !== undefined, 'Should have metadata');
      assert(serialized.config !== undefined, 'Should have config');
    });

    it('should deserialize context', () => {
      // Create and populate original context
      const originalMessage: AIMessage = {
        role: 'user',
        content: 'Original message',
        timestamp: new Date()
      };
      
      context.addMessage(originalMessage);
      context.updateSystemPrompt('Custom prompt');

      // Serialize and deserialize
      const serialized = context.serialize();
      const deserialized = ConversationContextManager.deserialize(serialized);
      
      assert.strictEqual(deserialized.messages.length, 1);
      assert.strictEqual(deserialized.messages[0].content, 'Original message');
      assert.strictEqual(deserialized.systemPrompt, 'Custom prompt');
      assert.strictEqual(deserialized.maxTokens, context.maxTokens);
    });

    it('should maintain data integrity through serialization cycle', () => {
      // Add complex data
      context.addMessage({
        role: 'user',
        content: 'User message',
        timestamp: new Date(),
        toolCalls: [{
          id: 'call-1',
          name: 'test-tool',
          parameters: { param: 'value' }
        }]
      });

      context.addMessage({
        role: 'assistant',
        content: 'Assistant response',
        timestamp: new Date()
      });

      context.addToolResult({
        success: true,
        output: 'Tool output',
        error: undefined,
        metadata: {
          executionTime: 150,
          toolName: 'test-tool',
          parameters: { param: 'value' },
          timestamp: new Date()
        }
      });

      // Serialize and deserialize
      const serialized = context.serialize();
      const deserialized = ConversationContextManager.deserialize(serialized);
      
      // Verify all data is preserved
      assert.strictEqual(deserialized.messages.length, context.messages.length);
      assert.strictEqual(deserialized.toolResults.length, context.toolResults.length);
      assert(deserialized.messages[0].toolCalls !== undefined, 'Should preserve tool calls');
      assert.strictEqual(deserialized.messages[0].toolCalls![0].name, 'test-tool');
      assert.strictEqual(deserialized.toolResults[0].metadata.toolName, 'test-tool');
    });
  });

  describe('context cloning', () => {
    it('should create independent clone', () => {
      // Add data to original
      context.addMessage({
        role: 'user',
        content: 'Original message',
        timestamp: new Date()
      });

      const clone = context.clone();
      
      // Modify original
      context.addMessage({
        role: 'assistant',
        content: 'New message',
        timestamp: new Date()
      });

      // Clone should be unchanged
      assert.strictEqual(context.messages.length, 2);
      assert.strictEqual(clone.messages.length, 1);
      assert.strictEqual(clone.messages[0].content, 'Original message');
    });
  });

  describe('factory functions', () => {
    it('should create context with factory function', () => {
      const factoryContext = createConversationContext({
        maxTokens: 5000,
        systemPrompt: 'Factory prompt'
      });
      
      assert.strictEqual(factoryContext.maxTokens, 5000);
      assert.strictEqual(factoryContext.systemPrompt, 'Factory prompt');
    });

    it('should create coding context with specialized settings', () => {
      const codingContext = createCodingConversationContext();
      
      assert.strictEqual(codingContext.maxTokens, 6000);
      assert(codingContext.systemPrompt.includes('coding assistant'), 'Should have coding-specific prompt');
    });

    it('should allow overriding coding context defaults', () => {
      const customCodingContext = createCodingConversationContext({
        maxTokens: 8000,
        systemPrompt: 'Custom coding prompt'
      });
      
      assert.strictEqual(customCodingContext.maxTokens, 8000);
      assert.strictEqual(customCodingContext.systemPrompt, 'Custom coding prompt');
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages gracefully', () => {
      context.addMessage({
        role: 'user',
        content: '',
        timestamp: new Date()
      });
      
      assert.strictEqual(context.messages.length, 1);
      assert(context.getTokenCount() > 0, 'Should still count system prompt');
    });

    it('should handle tool results with no output', () => {
      context.addToolResult({
        success: false,
        error: 'Tool failed',
        metadata: {
          executionTime: 50,
          toolName: 'failing-tool',
          parameters: {},
          timestamp: new Date()
        }
      });
      
      assert.strictEqual(context.toolResults.length, 1);
      assert(context.getTokenCount() > 0, 'Should have positive token count');
    });

    it('should handle very small token limits', () => {
      context.updateConfig({ maxTokens: 10 });
      
      context.addMessage({
        role: 'user',
        content: 'This message is longer than the token limit',
        timestamp: new Date()
      });
      
      // Should not crash, even with impossible constraints
      assert.doesNotThrow(() => context.truncateIfNeeded());
    });

    it('should handle messages with tool calls', () => {
      const messageWithTools: AIMessage = {
        role: 'assistant',
        content: 'I will execute a tool',
        timestamp: new Date(),
        toolCalls: [
          {
            id: 'call-1',
            name: 'read-file',
            parameters: { path: 'test.txt' }
          },
          {
            id: 'call-2',
            name: 'write-file',
            parameters: { path: 'output.txt', content: 'result' }
          }
        ]
      };

      context.addMessage(messageWithTools);
      
      assert.strictEqual(context.messages.length, 1);
      assert.strictEqual(context.messages[0].toolCalls!.length, 2);
      assert(context.getTokenCount() > 0, 'Should have positive token count');
    });
  });
});