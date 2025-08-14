/**
 * Advanced Conversation Context Management Tests
 * 
 * This test suite focuses on advanced conversation context features including:
 * - Complex truncation strategies
 * - Context overflow handling
 * - Memory management
 * - Performance optimization
 */

import assert from 'assert';
import { 
  ConversationContextManager,
  createConversationContext,
  createCodingConversationContext
} from '../../core/conversation-context';
import { AIMessage, AIToolResult } from '../../core/ai-agent';

describe('Advanced Conversation Context Management', () => {
  describe('Truncation Strategies', () => {
    describe('Recent Strategy', () => {
      let context: ConversationContextManager;

      beforeEach(() => {
        context = new ConversationContextManager({
          maxTokens: 200,
          truncationStrategy: 'recent',
          minRecentMessages: 2,
          truncationBuffer: 0.1
        });
      });

      it('should preserve minimum recent messages', () => {
        // Add many messages to trigger truncation
        for (let i = 0; i < 20; i++) {
          context.addMessage({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i} with substantial content to trigger truncation when combined with other messages`,
            timestamp: new Date()
          });
        }

        // Should preserve at least minRecentMessages
        assert.ok(context.messages.length >= 2);
        
        // Should preserve the most recent messages
        const lastMessage = context.messages[context.messages.length - 1];
        assert.ok(lastMessage.content.includes('Message'));
      });

      it('should preserve system messages during truncation', () => {
        context.addMessage({
          role: 'system',
          content: 'You are a helpful assistant. This system message should be preserved.',
          timestamp: new Date()
        });

        // Add many other messages
        for (let i = 0; i < 15; i++) {
          context.addMessage({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Regular message ${i} with content that will cause truncation`,
            timestamp: new Date()
          });
        }

        const systemMessages = context.messages.filter(m => m.role === 'system');
        assert.strictEqual(systemMessages.length, 1);
        assert.ok(systemMessages[0].content.includes('helpful assistant'));
      });

      it('should handle emergency truncation when normal truncation is insufficient', () => {
        // Set extremely low token limit
        context.updateConfig({ maxTokens: 20 });

        // Add messages that exceed even emergency limits
        for (let i = 0; i < 5; i++) {
          context.addMessage({
            role: 'user',
            content: `This is a very long message ${i} that contains a lot of text and will definitely exceed the very small token limit that we have set for this test case`,
            timestamp: new Date()
          });
        }

        // Should not crash and should be within token limit
        assert.ok(context.getTokenCount() <= context.maxTokens * 1.2); // Allow small buffer
      });
    });

    describe('Sliding Window Strategy', () => {
      let context: ConversationContextManager;

      beforeEach(() => {
        context = new ConversationContextManager({
          maxTokens: 300,
          truncationStrategy: 'sliding_window',
          minRecentMessages: 3
        });
      });

      it('should maintain a sliding window of messages', () => {
        // Add many messages
        for (let i = 0; i < 30; i++) {
          context.addMessage({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Sliding window message ${i} with content`,
            timestamp: new Date()
          });
        }

        // Should maintain a reasonable window size
        assert.ok(context.messages.length > 5);
        assert.ok(context.messages.length < 30);
        
        // Should include recent messages
        const lastMessage = context.messages[context.messages.length - 1];
        assert.ok(lastMessage.content.includes('message'));
      });

      it('should preserve system messages in sliding window', () => {
        context.addMessage({
          role: 'system',
          content: 'System message for sliding window test',
          timestamp: new Date()
        });

        for (let i = 0; i < 25; i++) {
          context.addMessage({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Window message ${i}`,
            timestamp: new Date()
          });
        }

        const systemMessages = context.messages.filter(m => m.role === 'system');
        assert.strictEqual(systemMessages.length, 1);
      });
    });

    describe('Priority-Based Strategy', () => {
      let context: ConversationContextManager;

      beforeEach(() => {
        context = new ConversationContextManager({
          maxTokens: 250,
          truncationStrategy: 'priority_based',
          preserveToolResults: true
        });
      });

      it('should prioritize system messages, tool results, and recent conversations', () => {
        // Add system message
        context.addMessage({
          role: 'system',
          content: 'Priority system message',
          timestamp: new Date()
        });

        // Add tool message
        context.addMessage({
          role: 'tool',
          content: 'Tool execution result',
          timestamp: new Date()
        });

        // Add many conversation messages
        for (let i = 0; i < 20; i++) {
          context.addMessage({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Priority conversation message ${i}`,
            timestamp: new Date()
          });
        }

        // Add tool result
        context.addToolResult({
          success: true,
          output: 'Important tool result',
          metadata: {
            executionTime: 100,
            toolName: 'priority-tool',
            parameters: {},
            timestamp: new Date()
          }
        });

        // Should preserve high-priority items
        const systemMessages = context.messages.filter(m => m.role === 'system');
        const toolMessages = context.messages.filter(m => m.role === 'tool');
        
        assert.strictEqual(systemMessages.length, 1);
        assert.strictEqual(toolMessages.length, 1);
        assert.strictEqual(context.toolResults.length, 1);
      });

      it('should maintain chronological order after priority-based truncation', () => {
        // Add messages with specific timestamps
        const baseTime = new Date('2024-01-01T00:00:00Z');
        
        for (let i = 0; i < 15; i++) {
          const timestamp = new Date(baseTime.getTime() + i * 60000); // 1 minute apart
          context.addMessage({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Timestamped message ${i}`,
            timestamp
          });
        }

        // Messages should be in chronological order
        for (let i = 1; i < context.messages.length; i++) {
          assert.ok(context.messages[i].timestamp >= context.messages[i - 1].timestamp);
        }
      });
    });
  });

  describe('Tool Result Management', () => {
    let context: ConversationContextManager;

    beforeEach(() => {
      context = new ConversationContextManager({
        maxTokens: 400,
        preserveToolResults: true
      });
    });

    it('should preserve important tool results during truncation', () => {
      // Add successful tool results
      for (let i = 0; i < 10; i++) {
        context.addToolResult({
          success: true,
          output: `Tool result ${i} with important data`,
          metadata: {
            executionTime: 100 + i * 10,
            toolName: `tool-${i}`,
            parameters: { index: i },
            timestamp: new Date(Date.now() + i * 1000)
          }
        });
      }

      // Add error results
      for (let i = 0; i < 5; i++) {
        context.addToolResult({
          success: false,
          error: `Tool error ${i}`,
          metadata: {
            executionTime: 50,
            toolName: `error-tool-${i}`,
            parameters: {},
            timestamp: new Date(Date.now() + (i + 10) * 1000)
          }
        });
      }

      // Add many messages to trigger truncation
      for (let i = 0; i < 30; i++) {
        context.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i} that will trigger truncation`,
          timestamp: new Date()
        });
      }

      // Should preserve some tool results
      assert.ok(context.toolResults.length > 0);
      
      // Should prioritize recent and successful results
      const hasRecentResults = context.toolResults.some(r => 
        r.metadata.timestamp.getTime() > Date.now() - 10000
      );
      assert.ok(hasRecentResults);
    });

    it('should handle tool results with large outputs', () => {
      const largeOutput = 'A'.repeat(10000); // 10KB output
      
      context.addToolResult({
        success: true,
        output: largeOutput,
        metadata: {
          executionTime: 1000,
          toolName: 'large-output-tool',
          parameters: {},
          timestamp: new Date()
        }
      });

      const tokenCount = context.getTokenCount();
      assert.ok(tokenCount > 2000); // Should account for large output
    });

    it('should handle tool results with no output', () => {
      context.addToolResult({
        success: false,
        error: 'Tool failed with no output',
        metadata: {
          executionTime: 50,
          toolName: 'failing-tool',
          parameters: {},
          timestamp: new Date()
        }
      });

      assert.strictEqual(context.toolResults.length, 1);
      assert.ok(context.getTokenCount() > 0);
    });
  });

  describe('Memory Management and Performance', () => {
    it('should handle very large contexts efficiently', () => {
      const context = new ConversationContextManager({
        maxTokens: 50000,
        truncationStrategy: 'recent'
      });

      const startTime = Date.now();

      // Add a large number of messages
      for (let i = 0; i < 5000; i++) {
        context.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Performance test message ${i} with some content to test memory management`,
          timestamp: new Date()
        });
      }

      const additionTime = Date.now() - startTime;
      
      // Should handle large contexts reasonably quickly
      assert.ok(additionTime < 5000); // Less than 5 seconds
      
      // Token counting should be efficient
      const tokenCountStart = Date.now();
      const tokenCount = context.getTokenCount();
      const tokenCountTime = Date.now() - tokenCountStart;
      
      assert.ok(tokenCount > 0);
      assert.ok(tokenCountTime < 1000); // Less than 1 second
    });

    it('should handle frequent truncation operations efficiently', () => {
      const context = new ConversationContextManager({
        maxTokens: 100,
        truncationStrategy: 'recent'
      });

      const startTime = Date.now();

      // Add messages that will trigger frequent truncation
      for (let i = 0; i < 1000; i++) {
        context.addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Frequent truncation test message ${i} with content that will trigger truncation`,
          timestamp: new Date()
        });
      }

      const totalTime = Date.now() - startTime;
      
      // Should handle frequent truncation efficiently
      assert.ok(totalTime < 3000); // Less than 3 seconds
      assert.ok(context.getTokenCount() <= context.maxTokens * 1.2);
    });

    it('should clean up memory properly', () => {
      const context = new ConversationContextManager();

      // Add data
      for (let i = 0; i < 100; i++) {
        context.addMessage({
          role: 'user',
          content: `Memory test message ${i}`,
          timestamp: new Date()
        });
      }

      assert.ok(context.messages.length > 0);

      // Clear context
      context.clear();

      assert.strictEqual(context.messages.length, 0);
      assert.strictEqual(context.toolResults.length, 0);
    });
  });

  describe('Context Serialization Edge Cases', () => {
    it('should handle serialization of complex message structures', () => {
      const context = new ConversationContextManager();

      const complexMessage: AIMessage = {
        role: 'assistant',
        content: 'Complex message with tool calls',
        timestamp: new Date(),
        toolCalls: [
          {
            id: 'call-1',
            name: 'complex_tool',
            parameters: {
              nested: {
                array: [1, 2, 3],
                object: { key: 'value' },
                string: 'test'
              },
              boolean: true,
              number: 42
            }
          }
        ],
        toolResults: [
          {
            success: true,
            output: 'Complex tool result',
            metadata: {
              executionTime: 200,
              toolName: 'complex_tool',
              parameters: { complex: true },
              timestamp: new Date(),
              customField: 'custom value'
            }
          }
        ]
      };

      context.addMessage(complexMessage);

      const serialized = context.serialize();
      const deserialized = ConversationContextManager.deserialize(serialized);

      // Should preserve complex structures
      assert.strictEqual(deserialized.messages.length, 1);
      assert.ok(deserialized.messages[0].toolCalls);
      assert.strictEqual(deserialized.messages[0].toolCalls![0].parameters.nested.array.length, 3);
      assert.strictEqual(deserialized.messages[0].toolCalls![0].parameters.boolean, true);
      assert.strictEqual(deserialized.messages[0].toolCalls![0].parameters.number, 42);
    });

    it('should handle serialization with circular references gracefully', () => {
      const context = new ConversationContextManager();

      // Create a message with potential circular reference issues
      const message: any = {
        role: 'user',
        content: 'Test message',
        timestamp: new Date()
      };

      // Add self-reference (this would cause issues in naive serialization)
      message.self = message;

      try {
        context.addMessage(message);
        const serialized = context.serialize();
        
        // Should handle gracefully without crashing
        assert.ok(serialized);
      } catch (error) {
        // If it throws, it should be a controlled error, not a crash
        assert.ok(error instanceof Error);
      }
    });

    it('should preserve timestamps accurately through serialization', () => {
      const context = new ConversationContextManager();
      const specificTime = new Date('2024-01-15T10:30:45.123Z');

      context.addMessage({
        role: 'user',
        content: 'Timestamp test',
        timestamp: specificTime
      });

      const serialized = context.serialize();
      const deserialized = ConversationContextManager.deserialize(serialized);

      assert.strictEqual(
        deserialized.messages[0].timestamp.getTime(),
        specificTime.getTime()
      );
    });
  });

  describe('Factory Functions and Specialized Contexts', () => {
    it('should create general conversation context with custom config', () => {
      const context = createConversationContext({
        maxTokens: 8000,
        systemPrompt: 'Custom general prompt',
        truncationStrategy: 'sliding_window'
      });

      assert.strictEqual(context.maxTokens, 8000);
      assert.strictEqual(context.systemPrompt, 'Custom general prompt');
    });

    it('should create coding conversation context with appropriate defaults', () => {
      const context = createCodingConversationContext();

      assert.strictEqual(context.maxTokens, 6000);
      assert.ok(context.systemPrompt.includes('coding assistant'));
      assert.ok(context.systemPrompt.includes('tools'));
    });

    it('should allow overriding coding context defaults', () => {
      const context = createCodingConversationContext({
        maxTokens: 10000,
        systemPrompt: 'Custom coding prompt',
        minRecentMessages: 6
      });

      assert.strictEqual(context.maxTokens, 10000);
      assert.strictEqual(context.systemPrompt, 'Custom coding prompt');
    });

    it('should handle specialized context configurations', () => {
      const debugContext = createConversationContext({
        maxTokens: 2000,
        systemPrompt: 'You are a debugging assistant.',
        truncationStrategy: 'priority_based',
        preserveToolResults: true,
        minRecentMessages: 1,
        truncationBuffer: 0.05
      });

      // Add debug-specific messages
      debugContext.addMessage({
        role: 'user',
        content: 'Help me debug this error',
        timestamp: new Date()
      });

      debugContext.addToolResult({
        success: false,
        error: 'Debug tool found issue',
        metadata: {
          executionTime: 100,
          toolName: 'debug-tool',
          parameters: {},
          timestamp: new Date()
        }
      });

      assert.ok(debugContext.systemPrompt.includes('debugging'));
      assert.strictEqual(debugContext.toolResults.length, 1);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid configuration gracefully', () => {
      // Should not crash with invalid config
      const context = new ConversationContextManager({
        maxTokens: -1, // Invalid
        truncationStrategy: 'invalid' as any, // Invalid
        minRecentMessages: -5 // Invalid
      });

      // Should still function with fallback values
      assert.ok(context.maxTokens > 0);
      
      context.addMessage({
        role: 'user',
        content: 'Test message',
        timestamp: new Date()
      });

      assert.strictEqual(context.messages.length, 1);
    });

    it('should handle messages with invalid timestamps', () => {
      const context = new ConversationContextManager();

      const invalidMessage: any = {
        role: 'user',
        content: 'Test message',
        timestamp: 'invalid-date'
      };

      // Should handle gracefully
      context.addMessage(invalidMessage);
      assert.strictEqual(context.messages.length, 1);
    });

    it('should handle extremely long system prompts', () => {
      const longPrompt = 'A'.repeat(50000); // 50KB prompt
      
      const context = new ConversationContextManager({
        systemPrompt: longPrompt,
        maxTokens: 1000
      });

      // Should handle truncation of system prompt if necessary
      context.addMessage({
        role: 'user',
        content: 'Test message',
        timestamp: new Date()
      });

      // Should not crash and should be within reasonable limits
      assert.ok(context.getTokenCount() > 0);
    });
  });
});