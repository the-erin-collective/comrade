/**
 * Integration tests for AI conversation flow
 * 
 * These tests verify complete AI conversation cycles including:
 * - End-to-end message processing
 * - Tool execution within conversations
 * - Model switching and context preservation
 * - Error scenarios and recovery mechanisms
 */

import assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { AIAgentService, ModelConfig, AIResponse, ToolCall, AIMessage } from '../../core/ai-agent';
import { ConversationContextManager, createCodingConversationContext } from '../../core/conversation-context';
import { Tool, ToolResult } from '../../core/types';
import { ToolRegistry } from '../../core/tool-registry';

describe('AI Conversation Flow Integration Tests', () => {
  let aiService: AIAgentService;
  let testModel: ModelConfig;
  let alternativeModel: ModelConfig;

  beforeEach(() => {
    aiService = new AIAgentService();
    
    // Primary test model configuration
    testModel = {
      name: 'Test Model',
      provider: 'ollama',
      model: 'test-model',
      endpoint: 'http://localhost:11434',
      temperature: 0.7,
      maxTokens: 1000
    };
    
    // Alternative model for switching tests
    alternativeModel = {
      name: 'Alternative Model',
      provider: 'huggingface',
      model: 'microsoft/DialoGPT-medium',
      apiKey: 'test-key',
      temperature: 0.5,
      maxTokens: 800
    };
  });

  describe('End-to-End AI Conversation Cycles', () => {
    beforeEach(() => {
      aiService.setModel(testModel);
    });

    it('should complete a full conversation cycle with AI response', async function() {
      this.timeout(10000);
      
      const sessionId = 'conversation-test-1';
      const userMessage = 'Hello, can you help me with coding?';
      
      // Send message and get AI response
      const response = await aiService.sendMessage(sessionId, userMessage);
      
      // Verify response structure
      assert(response !== undefined, 'Should receive AI response');
      assert(typeof response.content === 'string', 'Response should have string content');
      assert(response.content.length > 0, 'Response content should not be empty');
      assert(response.metadata !== undefined, 'Response should have metadata');
      assert(response.metadata.model === testModel.model, 'Metadata should include correct model');
      assert(response.metadata.processingTime > 0, 'Should track processing time');
      assert(response.metadata.tokensUsed > 0, 'Should track token usage');
      
      // Verify conversation context was created and updated
      const context = aiService.getConversationContext(sessionId);
      assert(context !== undefined, 'Should create conversation context');
      assert(context.messages.length >= 2, 'Should have user and assistant messages');
      
      const userMsg = context.messages.find(m => m.role === 'user' && m.content === userMessage);
      const assistantMsg = context.messages.find(m => m.role === 'assistant');
      
      assert(userMsg !== undefined, 'Should preserve user message in context');
      assert(assistantMsg !== undefined, 'Should add assistant response to context');
      assert(assistantMsg.content === response.content, 'Context should match response content');
    });

    it('should maintain conversation context across multiple exchanges', async function() {
      this.timeout(15000);
      
      const sessionId = 'conversation-test-2';
      
      // First exchange
      const response1 = await aiService.sendMessage(sessionId, 'My name is Alice');
      assert(response1.content.length > 0, 'First response should have content');
      
      // Second exchange referencing first
      const response2 = await aiService.sendMessage(sessionId, 'What is my name?');
      assert(response2.content.length > 0, 'Second response should have content');
      
      // Third exchange to verify context continuity
      const response3 = await aiService.sendMessage(sessionId, 'Can you remember our conversation?');
      assert(response3.content.length > 0, 'Third response should have content');
      
      // Verify conversation context contains all messages
      const context = aiService.getConversationContext(sessionId);
      assert(context !== undefined, 'Should maintain conversation context');
      
      const userMessages = context.messages.filter(m => m.role === 'user');
      const assistantMessages = context.messages.filter(m => m.role === 'assistant');
      
      assert(userMessages.length === 3, 'Should have three user messages');
      assert(assistantMessages.length === 3, 'Should have three assistant messages');
      
      // Verify message order and content
      assert(userMessages[0].content === 'My name is Alice', 'First user message preserved');
      assert(userMessages[1].content === 'What is my name?', 'Second user message preserved');
      assert(userMessages[2].content === 'Can you remember our conversation?', 'Third user message preserved');
    });

    it('should handle streaming responses correctly', async function() {
      this.timeout(10000);
      
      const sessionId = 'streaming-test-1';
      const chunks: Array<{ content: string; isComplete: boolean }> = [];
      let finalResponse: AIResponse | null = null;
      
      // Send message with streaming callback
      const response = await aiService.sendMessage(
        sessionId,
        'Tell me about JavaScript',
        (chunk) => {
          chunks.push(chunk);
        }
      );
      
      finalResponse = response;
      
      // Verify streaming behavior
      assert(chunks.length > 0, 'Should receive streaming chunks');
      assert(chunks[chunks.length - 1].isComplete === true, 'Last chunk should be marked complete');
      
      // Verify final response
      assert(finalResponse !== null, 'Should receive final response');
      assert(finalResponse.content.length > 0, 'Final response should have content');
      
      // Verify chunks combine to form complete response
      const combinedContent = chunks.map(c => c.content).join('');
      assert(combinedContent === finalResponse.content, 'Chunks should combine to form complete response');
      
      // Verify context was updated with complete response
      const context = aiService.getConversationContext(sessionId);
      const assistantMessage = context?.messages.find(m => m.role === 'assistant');
      assert(assistantMessage?.content === finalResponse.content, 'Context should contain complete response');
    });
  });

  describe('Tool Execution Within Conversations', () => {
    beforeEach(() => {
      aiService.setModel(testModel);
    });

    it('should execute file operations through AI conversation', async function() {
      this.timeout(15000);
      
      const sessionId = 'tool-test-1';
      const testFilePath = path.join(__dirname, '../../test-files/ai-test-file.txt');
      const testContent = 'This is a test file created by AI agent integration test';
      
      // Ensure test directory exists
      const testDir = path.dirname(testFilePath);
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      
      try {
        // Simulate AI requesting to write a file
        const writeToolCall: ToolCall = {
          id: 'write-test-1',
          name: 'write_file',
          parameters: {
            path: testFilePath,
            content: testContent
          }
        };
        
        const writeResult = await aiService.executeToolCall(writeToolCall);
        assert(writeResult.success === true, 'File write should succeed');
        assert(fs.existsSync(testFilePath), 'File should be created');
        
        // Simulate AI requesting to read the file back
        const readToolCall: ToolCall = {
          id: 'read-test-1',
          name: 'read_file',
          parameters: {
            path: testFilePath
          }
        };
        
        const readResult = await aiService.executeToolCall(readToolCall);
        assert(readResult.success === true, 'File read should succeed');
        assert(readResult.output === testContent, 'Read content should match written content');
        
        // Verify tool execution metadata
        assert(writeResult.metadata.toolName === 'write_file', 'Write metadata should be correct');
        assert(readResult.metadata.toolName === 'read_file', 'Read metadata should be correct');
        assert(writeResult.metadata.executionTime > 0, 'Should track execution time');
        assert(readResult.metadata.executionTime > 0, 'Should track execution time');
        
      } finally {
        // Cleanup
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      }
    });

    it('should execute directory listing through AI conversation', async function() {
      this.timeout(10000);
      
      const sessionId = 'tool-test-2';
      
      // Simulate AI requesting directory listing
      const listToolCall: ToolCall = {
        id: 'list-test-1',
        name: 'list_directory',
        parameters: {
          path: __dirname
        }
      };
      
      const result = await aiService.executeToolCall(listToolCall);
      
      assert(result.success === true, 'Directory listing should succeed');
      assert(result.output !== undefined, 'Should return directory contents');
      assert(result.output!.length > 0, 'Directory contents should not be empty');
      assert(result.metadata.toolName === 'list_directory', 'Metadata should be correct');
      
      // Verify the output contains expected files
      const output = result.output!;
      assert(output.includes('.ts'), 'Should list TypeScript files');
    });

    it('should handle tool execution errors gracefully', async function() {
      this.timeout(10000);
      
      const sessionId = 'tool-error-test-1';
      
      // Simulate AI requesting to read non-existent file
      const invalidReadCall: ToolCall = {
        id: 'invalid-read-1',
        name: 'read_file',
        parameters: {
          path: '/non/existent/file.txt'
        }
      };
      
      const result = await aiService.executeToolCall(invalidReadCall);
      
      assert(result.success === false, 'Should fail for non-existent file');
      assert(result.error !== undefined, 'Should provide error message');
      assert(result.error!.length > 0, 'Error message should not be empty');
      assert(result.metadata.toolName === 'read_file', 'Metadata should be correct');
      assert(result.metadata.executionTime > 0, 'Should track execution time even for errors');
    });

    it('should handle invalid tool calls', async function() {
      this.timeout(10000);
      
      const sessionId = 'invalid-tool-test-1';
      
      // Simulate AI requesting non-existent tool
      const invalidToolCall: ToolCall = {
        id: 'invalid-tool-1',
        name: 'non_existent_tool',
        parameters: {}
      };
      
      const result = await aiService.executeToolCall(invalidToolCall);
      
      assert(result.success === false, 'Should fail for non-existent tool');
      assert(result.error !== undefined, 'Should provide error message');
      assert(result.error!.includes('not found'), 'Error should indicate tool not found');
      assert(result.metadata.toolName === 'non_existent_tool', 'Metadata should reflect attempted tool');
    });

    it('should integrate tool results into conversation context', async function() {
      this.timeout(15000);
      
      const sessionId = 'tool-context-test-1';
      
      // Send initial message
      await aiService.sendMessage(sessionId, 'I need to work with files');
      
      // Execute a tool call
      const toolCall: ToolCall = {
        id: 'context-tool-1',
        name: 'list_directory',
        parameters: { path: '.' }
      };
      
      const toolResult = await aiService.executeToolCall(toolCall);
      assert(toolResult.success === true, 'Tool should execute successfully');
      
      // Get conversation context and verify tool result integration
      const context = aiService.getConversationContext(sessionId);
      assert(context !== undefined, 'Should have conversation context');
      
      // Add tool result to context (simulating what would happen in real conversation)
      context.addToolResult(toolResult);
      
      // Send follow-up message
      await aiService.sendMessage(sessionId, 'What files did we find?');
      
      // Verify context contains both messages and tool result
      assert(context.messages.length >= 4, 'Should have multiple messages');
      assert(context.toolResults.length >= 1, 'Should have tool result in context');
      
      const toolResultInContext = context.toolResults.find(r => r.metadata.toolName === 'list_directory');
      assert(toolResultInContext !== undefined, 'Should find tool result in context');
      assert(toolResultInContext.success === true, 'Tool result should be successful');
    });
  });

  describe('Model Switching and Context Preservation', () => {
    it('should switch models while preserving conversation context', async function() {
      this.timeout(15000);
      
      const sessionId = 'model-switch-test-1';
      
      // Start conversation with first model
      aiService.setModel(testModel);
      const response1 = await aiService.sendMessage(sessionId, 'Hello, I am testing model switching');
      
      assert(response1.metadata.model === testModel.model, 'First response should use first model');
      
      // Get context before switching
      const contextBefore = aiService.getConversationContext(sessionId);
      assert(contextBefore !== undefined, 'Should have context before switch');
      const messageCountBefore = contextBefore.messages.length;
      
      // Switch to alternative model
      aiService.setModel(alternativeModel);
      
      // Continue conversation with new model
      const response2 = await aiService.sendMessage(sessionId, 'Can you remember what I just said?');
      
      assert(response2.metadata.model === alternativeModel.model, 'Second response should use new model');
      
      // Verify context preservation
      const contextAfter = aiService.getConversationContext(sessionId);
      assert(contextAfter !== undefined, 'Should have context after switch');
      assert(contextAfter.messages.length > messageCountBefore, 'Should have added new messages');
      
      // Verify original messages are preserved
      const originalMessage = contextAfter.messages.find(m => 
        m.role === 'user' && m.content === 'Hello, I am testing model switching'
      );
      assert(originalMessage !== undefined, 'Should preserve original message after model switch');
    });

    it('should handle model configuration changes', async function() {
      this.timeout(10000);
      
      const sessionId = 'model-config-test-1';
      
      // Start with initial model
      aiService.setModel(testModel);
      let currentModel = aiService.getCurrentModel();
      assert(currentModel?.model === testModel.model, 'Should set initial model');
      
      // Send a message
      await aiService.sendMessage(sessionId, 'Testing model configuration');
      
      // Change model configuration
      const updatedModel: ModelConfig = {
        ...testModel,
        temperature: 0.9,
        maxTokens: 1500
      };
      
      aiService.setModel(updatedModel);
      currentModel = aiService.getCurrentModel();
      
      assert(currentModel?.temperature === 0.9, 'Should update temperature');
      assert(currentModel?.maxTokens === 1500, 'Should update max tokens');
      
      // Continue conversation with updated configuration
      const response = await aiService.sendMessage(sessionId, 'How does the new configuration work?');
      assert(response.content.length > 0, 'Should work with updated configuration');
    });

    it('should maintain separate contexts for different sessions during model switches', async function() {
      this.timeout(15000);
      
      const session1 = 'multi-session-test-1';
      const session2 = 'multi-session-test-2';
      
      // Start conversations in both sessions with first model
      aiService.setModel(testModel);
      await aiService.sendMessage(session1, 'Session 1 message');
      await aiService.sendMessage(session2, 'Session 2 message');
      
      // Switch model
      aiService.setModel(alternativeModel);
      
      // Continue both conversations
      await aiService.sendMessage(session1, 'Session 1 continued');
      await aiService.sendMessage(session2, 'Session 2 continued');
      
      // Verify separate contexts
      const context1 = aiService.getConversationContext(session1);
      const context2 = aiService.getConversationContext(session2);
      
      assert(context1 !== undefined, 'Session 1 should have context');
      assert(context2 !== undefined, 'Session 2 should have context');
      assert(context1 !== context2, 'Sessions should have separate contexts');
      
      // Verify session-specific messages
      const session1Messages = context1.messages.filter(m => m.role === 'user');
      const session2Messages = context2.messages.filter(m => m.role === 'user');
      
      assert(session1Messages.some(m => m.content === 'Session 1 message'), 'Session 1 should have its messages');
      assert(session1Messages.some(m => m.content === 'Session 1 continued'), 'Session 1 should have continued messages');
      assert(session2Messages.some(m => m.content === 'Session 2 message'), 'Session 2 should have its messages');
      assert(session2Messages.some(m => m.content === 'Session 2 continued'), 'Session 2 should have continued messages');
      
      // Verify no cross-contamination
      assert(!session1Messages.some(m => m.content.includes('Session 2')), 'Session 1 should not have Session 2 messages');
      assert(!session2Messages.some(m => m.content.includes('Session 1')), 'Session 2 should not have Session 1 messages');
    });
  });

  describe('Error Scenarios and Recovery Mechanisms', () => {
    it('should handle model connection errors gracefully', async function() {
      this.timeout(10000);
      
      const sessionId = 'error-test-1';
      
      // Configure model with invalid endpoint
      const invalidModel: ModelConfig = {
        name: 'Invalid Model',
        provider: 'ollama',
        model: 'non-existent-model',
        endpoint: 'http://invalid-endpoint:99999'
      };
      
      aiService.setModel(invalidModel);
      
      // Attempt to send message
      try {
        await aiService.sendMessage(sessionId, 'This should fail');
        assert.fail('Should have thrown an error for invalid model');
      } catch (error) {
        assert(error instanceof Error, 'Should throw Error instance');
        assert(error.message.length > 0, 'Error should have descriptive message');
        
        // Verify error properties for user guidance
        const enhancedError = error as any;
        assert(enhancedError.code !== undefined, 'Error should have error code');
        assert(enhancedError.recoverable !== undefined, 'Error should indicate if recoverable');
      }
    });

    it('should handle API key authentication errors', async function() {
      this.timeout(10000);
      
      const sessionId = 'auth-error-test-1';
      
      // Configure model with invalid API key
      const invalidAuthModel: ModelConfig = {
        name: 'Invalid Auth Model',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: 'invalid-api-key'
      };
      
      aiService.setModel(invalidAuthModel);
      
      try {
        await aiService.sendMessage(sessionId, 'This should fail with auth error');
        assert.fail('Should have thrown authentication error');
      } catch (error) {
        assert(error instanceof Error, 'Should throw Error instance');
        const enhancedError = error as any;
        
        // Verify authentication error handling
        assert(enhancedError.code !== undefined, 'Should have error code');
        assert(enhancedError.suggestedFix !== undefined, 'Should provide suggested fix');
      }
    });

    it('should handle context overflow gracefully', async function() {
      this.timeout(15000);
      
      const sessionId = 'overflow-test-1';
      
      // Set up model with small context limit
      const limitedModel: ModelConfig = {
        ...testModel,
        maxTokens: 200 // Very small limit to trigger overflow
      };
      
      aiService.setModel(limitedModel);
      
      // Send many messages to trigger context overflow
      for (let i = 0; i < 10; i++) {
        const message = `This is message number ${i} with enough content to fill up the context window and trigger truncation mechanisms`;
        const response = await aiService.sendMessage(sessionId, message);
        assert(response.content.length > 0, `Message ${i} should get response`);
      }
      
      // Verify context was managed properly
      const context = aiService.getConversationContext(sessionId);
      assert(context !== undefined, 'Should maintain context despite overflow');
      
      // Context should be within reasonable bounds
      const tokenCount = context.getTokenCount();
      assert(tokenCount <= context.maxTokens, 'Context should be within token limits');
      
      // Should preserve recent messages
      const userMessages = context.messages.filter(m => m.role === 'user');
      assert(userMessages.length > 0, 'Should preserve some user messages');
      
      // Most recent message should be preserved
      const lastMessage = userMessages[userMessages.length - 1];
      assert(lastMessage.content.includes('message number 9'), 'Should preserve most recent message');
    });

    it('should retry failed operations with exponential backoff', async function() {
      this.timeout(20000);
      
      const sessionId = 'retry-test-1';
      
      // Create a custom tool that fails initially then succeeds
      let attemptCount = 0;
      const flakyTool: Tool = {
        name: 'flaky_test_tool',
        description: 'A tool that fails initially then succeeds',
        parameters: [],
        async execute() {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error(`Attempt ${attemptCount} failed`);
          }
          return {
            success: true,
            output: `Succeeded on attempt ${attemptCount}`,
            metadata: {
              executionTime: 10,
              toolName: 'flaky_test_tool',
              parameters: {},
              timestamp: new Date()
            }
          };
        }
      };
      
      // Register the flaky tool
      aiService.registerTool(flakyTool);
      
      // Execute tool call that should retry and eventually succeed
      const toolCall: ToolCall = {
        id: 'retry-test-call',
        name: 'flaky_test_tool',
        parameters: {}
      };
      
      const startTime = Date.now();
      const result = await aiService.executeToolCall(toolCall);
      const endTime = Date.now();
      
      // Verify retry behavior
      assert(result.success === true, 'Should eventually succeed after retries');
      assert(result.output?.includes('Succeeded on attempt 3'), 'Should succeed on third attempt');
      assert(attemptCount === 3, 'Should have made 3 attempts');
      
      // Verify exponential backoff (should take some time due to delays)
      const executionTime = endTime - startTime;
      assert(executionTime > 100, 'Should have delays between retries'); // At least some delay
    });

    it('should handle streaming interruption and recovery', async function() {
      this.timeout(15000);
      
      const sessionId = 'streaming-error-test-1';
      aiService.setModel(testModel);
      
      let streamingStarted = false;
      let streamingCompleted = false;
      
      // Start streaming operation
      const streamingPromise = aiService.sendMessage(
        sessionId,
        'Tell me a long story about programming',
        (chunk) => {
          streamingStarted = true;
          if (chunk.isComplete) {
            streamingCompleted = true;
          }
        }
      );
      
      // Wait a bit for streaming to start
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Abort streaming
      aiService.abortStreaming();
      
      // Verify streaming was interrupted
      try {
        await streamingPromise;
        // If we get here, streaming completed normally (which is also valid)
        assert(streamingCompleted === true, 'If streaming completed, it should be marked complete');
      } catch (error) {
        // Streaming was aborted
        assert(error instanceof Error, 'Should throw error when aborted');
        assert(error.message.includes('aborted'), 'Error should indicate abortion');
      }
      
      // Verify we can start new streaming operation after abortion
      const newResponse = await aiService.sendMessage(
        sessionId,
        'Short response please',
        (chunk) => {
          // New streaming should work
        }
      );
      
      assert(newResponse.content.length > 0, 'Should be able to stream again after abortion');
    });

    it('should provide helpful error messages for common issues', async function() {
      this.timeout(10000);
      
      // Test various error scenarios and verify helpful messages
      
      // 1. No model configured
      const freshService = new AIAgentService();
      try {
        await freshService.sendMessage('test', 'Hello');
        assert.fail('Should fail when no model configured');
      } catch (error) {
        const enhancedError = error as any;
        assert(enhancedError.message.includes('No AI model configured'), 'Should provide clear message');
        assert(enhancedError.suggestedFix !== undefined, 'Should provide suggested fix');
      }
      
      // 2. Invalid model provider
      try {
        aiService.setModel({
          name: 'Invalid',
          provider: 'invalid-provider' as any,
          model: 'test'
        });
        assert.fail('Should fail for invalid provider');
      } catch (error) {
        assert(error instanceof Error, 'Should throw error for invalid provider');
        assert(error.message.length > 0, 'Should have descriptive error message');
      }
      
      // 3. Empty message
      aiService.setModel(testModel);
      try {
        await aiService.sendMessage('test', '');
        assert.fail('Should fail for empty message');
      } catch (error) {
        assert(error instanceof Error, 'Should throw error for empty message');
        assert(error.message.includes('cannot be empty'), 'Should indicate empty message issue');
      }
    });
  });

  afterEach(() => {
    // Clean up after each test
    aiService.clearAllContexts();
    aiService.abortStreaming(); // Ensure no streaming operations are left running
  });
});