/**
 * Integration tests for ConversationContextManager with AIAgentService
 */

import assert from 'assert';
import { AIAgentService, ModelConfig } from '../../core/ai-agent';
import { ConversationContextManager, createCodingConversationContext } from '../../core/conversation-context';

describe('ConversationContext Integration Tests', () => {
  let aiService: AIAgentService;
  let testModel: ModelConfig;

  beforeEach(() => {
    aiService = new AIAgentService();
    testModel = {
      name: 'Test Model',
      provider: 'ollama',
      model: 'test-model',
      endpoint: 'http://localhost:11434'
    };
    aiService.setModel(testModel);
  });

  it('should create and use conversation context in AI service', async () => {
    const sessionId = 'test-session-1';
    
    // Send a message which should create a conversation context
    const response = await aiService.sendMessage(sessionId, 'Hello, AI!');
    
    assert(response !== undefined, 'Should receive a response');
    assert(typeof response.content === 'string', 'Response should have content');
    
    // Get the conversation context
    const context = aiService.getConversationContext(sessionId);
    assert(context !== undefined, 'Should have created conversation context');
    assert(context.messages.length >= 2, 'Should have user and assistant messages');
    
    // Verify message roles
    const userMessage = context.messages.find(m => m.role === 'user');
    const assistantMessage = context.messages.find(m => m.role === 'assistant');
    
    assert(userMessage !== undefined, 'Should have user message');
    assert(assistantMessage !== undefined, 'Should have assistant message');
    assert(userMessage.content === 'Hello, AI!', 'User message content should match');
  });

  it('should maintain conversation context across multiple messages', async () => {
    const sessionId = 'test-session-2';
    
    // Send first message
    await aiService.sendMessage(sessionId, 'First message');
    
    // Send second message
    await aiService.sendMessage(sessionId, 'Second message');
    
    // Get context and verify both messages are preserved
    const context = aiService.getConversationContext(sessionId);
    assert(context !== undefined, 'Should have conversation context');
    
    const userMessages = context.messages.filter(m => m.role === 'user');
    assert(userMessages.length === 2, 'Should have two user messages');
    assert(userMessages[0].content === 'First message', 'First message should be preserved');
    assert(userMessages[1].content === 'Second message', 'Second message should be preserved');
  });

  it('should handle context truncation with many messages', async () => {
    const sessionId = 'test-session-3';
    
    // Create a context with small token limit
    const customContext = new ConversationContextManager({
      maxTokens: 200,
      truncationStrategy: 'recent',
      minRecentMessages: 2
    });
    
    // Add many messages to trigger truncation
    for (let i = 0; i < 10; i++) {
      customContext.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i} with some content to fill up the token limit`,
        timestamp: new Date()
      });
    }
    
    // Verify truncation occurred
    assert(customContext.messages.length < 10, 'Should have truncated messages');
    assert(customContext.getTokenCount() <= customContext.maxTokens, 'Should be within token limit');
    
    // Verify recent messages are preserved
    const lastUserMessage = customContext.messages.filter(m => m.role === 'user').pop();
    assert(lastUserMessage !== undefined, 'Should preserve recent user message');
    assert(lastUserMessage.content.includes('Message'), 'Should preserve recent message content');
  });

  it('should clear conversation context', () => {
    const sessionId = 'test-session-4';
    
    // Create some context
    const context = createCodingConversationContext();
    context.addMessage({
      role: 'user',
      content: 'Test message',
      timestamp: new Date()
    });
    
    assert(context.messages.length === 1, 'Should have one message');
    
    // Clear context
    context.clear();
    
    assert.strictEqual(context.messages.length, 0, 'Should have no messages after clear');
    assert(context.toolResults.length === 0, 'Should have no tool results after clear');
  });

  it('should serialize and deserialize conversation context', () => {
    const originalContext = createCodingConversationContext({
      maxTokens: 5000,
      systemPrompt: 'Custom test prompt'
    });
    
    // Add some data
    originalContext.addMessage({
      role: 'user',
      content: 'Test message for serialization',
      timestamp: new Date()
    });
    
    originalContext.addToolResult({
      success: true,
      output: 'Tool output for serialization test',
      metadata: {
        executionTime: 100,
        toolName: 'test-tool',
        parameters: { test: 'value' },
        timestamp: new Date()
      }
    });
    
    // Serialize
    const serialized = originalContext.serialize();
    
    // Deserialize
    const deserializedContext = ConversationContextManager.deserialize(serialized);
    
    // Verify data integrity
    assert(deserializedContext.messages.length === originalContext.messages.length, 'Should preserve message count');
    assert(deserializedContext.toolResults.length === originalContext.toolResults.length, 'Should preserve tool result count');
    assert(deserializedContext.systemPrompt === originalContext.systemPrompt, 'Should preserve system prompt');
    assert(deserializedContext.maxTokens === originalContext.maxTokens, 'Should preserve max tokens');
    
    // Verify message content
    assert(deserializedContext.messages[0].content === 'Test message for serialization', 'Should preserve message content');
    assert(deserializedContext.toolResults[0].output === 'Tool output for serialization test', 'Should preserve tool result output');
  });

  it('should handle different truncation strategies', () => {
    const recentContext = new ConversationContextManager({
      maxTokens: 100,
      truncationStrategy: 'recent'
    });
    
    const slidingContext = new ConversationContextManager({
      maxTokens: 100,
      truncationStrategy: 'sliding_window'
    });
    
    const priorityContext = new ConversationContextManager({
      maxTokens: 100,
      truncationStrategy: 'priority_based'
    });
    
    // Add messages to all contexts
    for (let i = 0; i < 8; i++) {
      const message = {
        role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `Test message ${i} with content`,
        timestamp: new Date()
      };
      
      recentContext.addMessage(message);
      slidingContext.addMessage(message);
      priorityContext.addMessage(message);
    }
    
    // All should be within token limits
    assert(recentContext.getTokenCount() <= recentContext.maxTokens, 'Recent strategy should respect token limit');
    assert(slidingContext.getTokenCount() <= slidingContext.maxTokens, 'Sliding window strategy should respect token limit');
    assert(priorityContext.getTokenCount() <= priorityContext.maxTokens, 'Priority strategy should respect token limit');
    
    // All should have some messages (not completely empty)
    assert(recentContext.messages.length > 0, 'Recent strategy should preserve some messages');
    assert(slidingContext.messages.length > 0, 'Sliding window strategy should preserve some messages');
    assert(priorityContext.messages.length > 0, 'Priority strategy should preserve some messages');
  });

  it('should update system prompt and trigger truncation', () => {
    const context = new ConversationContextManager({
      maxTokens: 150
    });
    
    // Add some messages
    for (let i = 0; i < 5; i++) {
      context.addMessage({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: new Date()
      });
    }
    
    const initialTokens = context.getTokenCount();
    
    // Update to a longer system prompt
    const longPrompt = 'This is a much longer system prompt that should trigger truncation when combined with existing messages';
    context.updateSystemPrompt(longPrompt);
    
    // Should still be within token limit
    assert(context.getTokenCount() <= context.maxTokens, 'Should be within token limit after prompt update');
    assert(context.systemPrompt === longPrompt, 'Should have updated system prompt');
  });

  afterEach(() => {
    // Clean up
    aiService.clearAllContexts();
  });
});