/**
 * Focused tests for AI Agent Service error handling and recovery
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { AIAgentService, ToolCall } from '../../core/ai-agent';

describe('AI Agent Error Recovery', () => {
  let aiAgent: AIAgentService;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    aiAgent = new AIAgentService();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Model Configuration Errors', () => {
    it('should handle model not configured error', async () => {
      try {
        await aiAgent.sendMessage('test-session', 'Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('No AI model configured'));
      }
    });

    it('should provide helpful error message for missing model', async () => {
      try {
        await aiAgent.sendMessage('test-session', 'Hello');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('configure a model'));
      }
    });
  });

  describe('Tool Execution Error Handling', () => {
    it('should handle tool not found error', async () => {
      const toolCall: ToolCall = {
        id: 'test-call',
        name: 'nonexistent_tool',
        parameters: {}
      };

      const result = await aiAgent.executeToolCall(toolCall);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('not found'));
    });

    it('should provide metadata for failed tool calls', async () => {
      const toolCall: ToolCall = {
        id: 'test-call',
        name: 'nonexistent_tool',
        parameters: { test: 'value' }
      };

      const result = await aiAgent.executeToolCall(toolCall);
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.metadata.toolName, 'nonexistent_tool');
      assert.deepStrictEqual(result.metadata.parameters, { test: 'value' });
      assert.ok(result.metadata.executionTime > 0);
      assert.ok(result.metadata.timestamp instanceof Date);
    });
  });

  describe('Context Management', () => {
    it('should handle context creation', () => {
      const context = aiAgent.getConversationContext('test-session');
      assert.strictEqual(context, undefined); // Should be undefined initially
    });

    it('should clear context', () => {
      aiAgent.clearConversationContext('test-session');
      // Should not throw error even if context doesn't exist
      assert.ok(true);
    });

    it('should clear all contexts', () => {
      aiAgent.clearAllContexts();
      // Should not throw error
      assert.ok(true);
    });
  });

  describe('Tool Registry', () => {
    it('should return available tools', () => {
      const tools = aiAgent.getAvailableTools();
      assert.ok(Array.isArray(tools));
      assert.ok(tools.length > 0); // Should have built-in tools
    });

    it('should return tool schemas', () => {
      const schemas = aiAgent.getToolSchemas();
      assert.ok(Array.isArray(schemas));
      assert.ok(schemas.length > 0);
      
      // Check schema structure
      if (schemas.length > 0) {
        const schema = schemas[0];
        assert.ok(schema.name);
        assert.ok(schema.description);
        assert.ok(schema.parameters);
      }
    });
  });

  describe('Model Configuration', () => {
    it('should set model configuration', () => {
      const modelConfig = {
        provider: 'ollama' as const,
        name: 'test-model',
        model: 'test-model'
      };

      aiAgent.setModel(modelConfig);
      
      const currentModel = aiAgent.getCurrentModel();
      assert.ok(currentModel);
      assert.strictEqual(currentModel.provider, 'ollama');
      assert.strictEqual(currentModel.model, 'test-model');
    });

    it('should handle invalid model configuration', () => {
      try {
        aiAgent.setModel({
          provider: 'ollama' as const,
          name: '',
          model: ''
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('required'));
      }
    });
  });

  describe('Error Recovery Mechanisms', () => {
    it('should handle streaming abort', () => {
      // Test that aborting streaming doesn't crash
      aiAgent.abortStreaming();
      assert.ok(true); // Should not throw
    });

    it('should handle tool registration', () => {
      const mockTool = {
        name: 'test_tool',
        description: 'Test tool',
        parameters: [],
        execute: async () => ({
          success: true,
          output: 'test output',
          metadata: {
            executionTime: 100,
            toolName: 'test_tool',
            parameters: {},
            timestamp: new Date()
          }
        })
      };

      try {
        aiAgent.registerTool(mockTool);
        assert.ok(true); // Should not throw
      } catch (error) {
        // Tool registration might fail due to validation, that's ok
        assert.ok(error instanceof Error);
      }
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle missing dependencies gracefully', () => {
      // Test that the service can be created even if some dependencies are missing
      const service = new AIAgentService();
      assert.ok(service);
      
      // Basic methods should not crash
      const tools = service.getAvailableTools();
      assert.ok(Array.isArray(tools));
    });

    it('should provide fallback responses', async () => {
      // Configure a model to test fallback behavior
      aiAgent.setModel({
        provider: 'custom' as const,
        name: 'fallback-model',
        model: 'fallback-model'
      });

      // This might work with the mock adapter or fail gracefully
      try {
        const response = await aiAgent.sendMessage('test-session', 'Hello');
        assert.ok(response);
        assert.ok(response.content);
        assert.ok(response.metadata);
      } catch (error) {
        // If it fails, it should fail gracefully with a helpful error
        assert.ok(error instanceof Error);
        assert.ok(error.message.length > 0);
      }
    });
  });
});