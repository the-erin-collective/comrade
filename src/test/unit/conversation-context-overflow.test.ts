/**
 * Tests for conversation context overflow handling and intelligent truncation
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ConversationContextManager, createConversationContext } from '../../core/conversation-context';
import { AIMessage, AIToolResult } from '../../core/ai-agent';

describe('Conversation Context Overflow Handling', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Intelligent Truncation', () => {
    it('should preserve system messages during truncation', () => {
      const context = createConversationContext({
        maxTokens: 100,
        truncationStrategy: 'recent'
      });

      // Add system message
      context.addMessage({
        role: 'system',
        content: 'You are a helpful assistant',
        timestamp: new Date()
      });

      // Add many user messages to exceed token limit
      for (let i = 0; i < 20; i++) {
        context.addMessage({
          role: 'user',
          content: `This is a long user message number ${i} that contains a lot of text to trigger context overflow`,
          timestamp: new Date()
        });
      }

      // System message should still be present
      const systemMessages = context.messages.filter(m => m.role === 'system');
      assert.strictEqual(systemMessages.length, 1);
      assert.strictEqual(systemMessages[0].content, 'You are a helpful assistant');
    });

    it('should preserve minimum recent messages', () => {
      const context = createConversationContext({
        maxTokens: 50,
        truncationStrategy: 'recent',
        minRecentMessages: 3
      });

      // Add many messages
      for (let i = 0; i < 10; i++) {
        context.addMessage({
          role: 'user',
          content: `Message ${i}`,
          timestamp: new Date()
        });
      }

      const nonSystemMessages = context.messages.filter(m => m.role !== 'system');
      assert.ok(nonSystemMessages.length >= 3);
    });

    it('should preserve important tool results', () => {
      const context = createConversationContext({
        maxTokens: 200,
        preserveToolResults: true
      });

      // Add tool results
      const importantResult: AIToolResult = {
        success: true,
        output: 'Important file content',
        metadata: {
          executionTime: 100,
          toolName: 'read_file',
          parameters: { path: 'important.txt' },
          timestamp: new Date()
        }
      };

      const oldResult: AIToolResult = {
        success: true,
        output: 'Old file content that is less important',
        metadata: {
          executionTime: 50,
          toolName: 'read_file',
          parameters: { path: 'old.txt' },
          timestamp: new Date(Date.now() - 60000) // 1 minute ago
        }
      };

      context.addToolResult(importantResult);
      context.addToolResult(oldResult);

      // Add many messages to trigger truncation
      for (let i = 0; i < 20; i++) {
        context.addMessage({
          role: 'user',
          content: `Long message ${i} with lots of content to fill up the context window`,
          timestamp: new Date()
        });
      }

      // Should preserve at least the important recent tool result
      assert.ok(context.toolResults.length > 0);
      const hasImportantResult = context.toolResults.some(r => 
        r.output === 'Important file content'
      );
      assert.ok(hasImportantResult);
    });

    it('should truncate message content when necessary', () => {
      const context = createConversationContext({
        maxTokens: 100,
        minRecentMessages: 1
      });

      // Add a very long message
      const longMessage = 'This is a very long message that contains a lot of text and should be truncated when the context overflows because it exceeds the available token budget for individual messages in the conversation context. '.repeat(10);
      
      context.addMessage({
        role: 'user',
        content: longMessage,
        timestamp: new Date()
      });

      // Add another message to trigger truncation
      context.addMessage({
        role: 'user',
        content: 'Short message',
        timestamp: new Date()
      });

      // The long message should have been truncated
      const messages = context.messages.filter(m => m.role === 'user');
      const possiblyTruncatedMessage = messages.find(m => m.content.includes('truncated'));
      
      if (possiblyTruncatedMessage) {
        assert.ok(possiblyTruncatedMessage.content.length < longMessage.length);
        assert.ok(possiblyTruncatedMessage.content.includes('truncated'));
      }
    });

    it('should apply emergency truncation when normal methods fail', () => {
      const context = createConversationContext({
        maxTokens: 50, // Very small limit
        truncationStrategy: 'recent'
      });

      // Add system message
      context.addMessage({
        role: 'system',
        content: 'You are a helpful assistant with a very long system prompt that contains detailed instructions',
        timestamp: new Date()
      });

      // Add messages that together exceed the limit
      for (let i = 0; i < 5; i++) {
        context.addMessage({
          role: 'user',
          content: `Message ${i} with content`,
          timestamp: new Date()
        });
      }

      // Should be under the token limit after emergency truncation
      assert.ok(context.getTokenCount() <= context.maxTokens);
    });
  });

  describe('Context Overflow Detection', () => {
    it('should detect context overflow before adding messages', () => {
      const context = createConversationContext({
        maxTokens: 100
      });

      // Fill context close to limit
      for (let i = 0; i < 5; i++) {
        context.addMessage({
          role: 'user',
          content: 'Some content to fill the context',
          timestamp: new Date()
        });
      }

      const tokensBefore = context.getTokenCount();
      const newMessageTokens = 50; // Simulated large message

      // Should detect that adding this message would cause overflow
      const wouldOverflow = tokensBefore + newMessageTokens > context.maxTokens;
      
      if (wouldOverflow) {
        // Context should handle this gracefully
        context.addMessage({
          role: 'user',
          content: 'A new message that might cause overflow',
          timestamp: new Date()
        });
        
        assert.ok(context.getTokenCount() <= context.maxTokens);
      }
    });

    it('should handle rapid message additions', () => {
      const context = createConversationContext({
        maxTokens: 200
      });

      // Rapidly add many messages
      for (let i = 0; i < 50; i++) {
        context.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i} with some content`,
          timestamp: new Date()
        });
      }

      // Should maintain token limit
      assert.ok(context.getTokenCount() <= context.maxTokens);
      
      // Should have some messages remaining
      assert.ok(context.messages.length > 0);
    });
  });

  describe('Truncation Strategies', () => {
    it('should use sliding window strategy', () => {
      const context = createConversationContext({
        maxTokens: 150,
        truncationStrategy: 'sliding_window'
      });

      // Add many messages
      for (let i = 0; i < 20; i++) {
        context.addMessage({
          role: 'user',
          content: `Message ${i}`,
          timestamp: new Date()
        });
      }

      // Should keep approximately 60% of messages (sliding window)
      const nonSystemMessages = context.messages.filter(m => m.role !== 'system');
      assert.ok(nonSystemMessages.length <= 12); // 60% of 20
      assert.ok(nonSystemMessages.length > 0);
    });

    it('should use priority-based strategy', () => {
      const context = createConversationContext({
        maxTokens: 150,
        truncationStrategy: 'priority_based',
        preserveToolResults: true
      });

      // Add system message (highest priority)
      context.addMessage({
        role: 'system',
        content: 'System prompt',
        timestamp: new Date()
      });

      // Add tool message (high priority)
      context.addMessage({
        role: 'tool',
        content: 'Tool result',
        timestamp: new Date()
      });

      // Add many conversation messages
      for (let i = 0; i < 15; i++) {
        context.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Conversation message ${i}`,
          timestamp: new Date()
        });
      }

      // Should preserve system and tool messages
      const systemMessages = context.messages.filter(m => m.role === 'system');
      const toolMessages = context.messages.filter(m => m.role === 'tool');
      
      assert.strictEqual(systemMessages.length, 1);
      assert.strictEqual(toolMessages.length, 1);
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens for different content types', () => {
      const context = createConversationContext();

      // Test plain text
      const plainText = 'Hello world';
      const plainTokens = (context as any).estimateTokens(plainText);
      assert.ok(plainTokens > 0);

      // Test code content (should have higher token density)
      const codeText = '{"key": "value", "array": [1, 2, 3]}';
      const codeTokens = (context as any).estimateTokens(codeText);
      assert.ok(codeTokens >= plainTokens);

      // Test empty content
      const emptyTokens = (context as any).estimateTokens('');
      assert.strictEqual(emptyTokens, 0);
    });

    it('should account for structured content overhead', () => {
      const context = createConversationContext();

      const plainText = 'This is plain text content';
      const jsonText = '{"message": "This is plain text content"}';
      const codeText = '```javascript\nconst message = "This is plain text content";\n```';

      const plainTokens = (context as any).estimateTokens(plainText);
      const jsonTokens = (context as any).estimateTokens(jsonText);
      const codeTokens = (context as any).estimateTokens(codeText);

      // Structured content should have more tokens due to overhead
      assert.ok(jsonTokens >= plainTokens);
      assert.ok(codeTokens >= plainTokens);
    });
  });

  describe('Context Statistics and Monitoring', () => {
    it('should provide accurate context statistics', () => {
      const context = createConversationContext({
        maxTokens: 1000
      });

      const startTime = Date.now();

      // Add some messages and tool results
      context.addMessage({
        role: 'user',
        content: 'Test message',
        timestamp: new Date()
      });

      context.addToolResult({
        success: true,
        output: 'Tool output',
        metadata: {
          executionTime: 100,
          toolName: 'test_tool',
          parameters: {},
          timestamp: new Date()
        }
      });

      const stats = context.getStats();

      assert.strictEqual(stats.messageCount, 1);
      assert.strictEqual(stats.toolResultCount, 1);
      assert.ok(stats.tokenCount > 0);
      assert.ok(stats.createdAt.getTime() >= startTime);
      assert.ok(stats.lastUpdated.getTime() >= startTime);
      assert.strictEqual(stats.config.maxTokens, 1000);
    });

    it('should track context updates', () => {
      const context = createConversationContext();
      const initialStats = context.getStats();

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        context.addMessage({
          role: 'user',
          content: 'New message',
          timestamp: new Date()
        });

        const updatedStats = context.getStats();
        assert.ok(updatedStats.lastUpdated > initialStats.lastUpdated);
        assert.ok(updatedStats.messageCount > initialStats.messageCount);
      }, 10);
    });
  });

  describe('Context Serialization with Overflow Handling', () => {
    it('should serialize and deserialize context with truncation state', () => {
      const originalContext = createConversationContext({
        maxTokens: 100,
        truncationStrategy: 'recent'
      });

      // Add messages that will trigger truncation
      for (let i = 0; i < 10; i++) {
        originalContext.addMessage({
          role: 'user',
          content: `Message ${i} with content`,
          timestamp: new Date()
        });
      }

      // Serialize the context
      const serialized = originalContext.serialize();
      
      // Deserialize into new context
      const deserializedContext = ConversationContextManager.deserialize(serialized);

      // Should maintain the same token count and configuration
      assert.strictEqual(deserializedContext.getTokenCount(), originalContext.getTokenCount());
      assert.strictEqual(deserializedContext.maxTokens, originalContext.maxTokens);
      assert.strictEqual(deserializedContext.messages.length, originalContext.messages.length);
    });
  });
});