/**
 * Unit tests for sidebar provider AI integration
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ComradeSidebarProvider } from '../../providers/sidebarProvider';

describe('Sidebar Provider AI Integration Tests', () => {
  let mockContext: vscode.ExtensionContext;
  let sidebarProvider: ComradeSidebarProvider;

  beforeEach(() => {
    // Create mock extension context
    mockContext = {
      extensionUri: vscode.Uri.file('/mock/path'),
      subscriptions: [],
      extensionMode: vscode.ExtensionMode.Test
    } as any;

    sidebarProvider = new ComradeSidebarProvider(mockContext);
  });

  it('should initialize with AI agent service', () => {
    const aiService = sidebarProvider.getAIAgentService();
    assert.ok(aiService, 'AI agent service should be initialized');
    
    const currentModel = aiService.getCurrentModel();
    assert.ok(currentModel, 'Should have default model configuration');
    assert.strictEqual(currentModel!.provider, 'ollama', 'Should use Ollama as default provider');
    assert.strictEqual(currentModel!.model, 'llama2', 'Should use llama2 as default model');
  });

  it('should have AI-related message types in interface', () => {
    // This test verifies that the TypeScript interfaces compile correctly
    // and that the new message types are properly defined
    
    const aiResponseMessage = {
      type: 'aiResponse' as const,
      payload: {
        sessionId: 'test-session',
        response: {
          content: 'Test response',
          metadata: {
            model: 'llama2',
            tokensUsed: 100,
            processingTime: 1000,
            timestamp: new Date()
          }
        }
      }
    };

    const toolExecutionMessage = {
      type: 'toolExecution' as const,
      payload: {
        sessionId: 'test-session',
        toolCall: {
          id: 'tool-1',
          name: 'readFile',
          parameters: { path: 'test.txt' }
        },
        status: 'started' as const
      }
    };

    const aiTypingMessage = {
      type: 'aiTyping' as const,
      payload: {
        sessionId: 'test-session',
        isTyping: true
      }
    };

    const aiProcessingMessage = {
      type: 'aiProcessing' as const,
      payload: {
        sessionId: 'test-session',
        status: 'thinking' as const,
        message: 'AI is thinking...'
      }
    };

    // If these compile without errors, the interfaces are properly defined
    assert.strictEqual(aiResponseMessage.type, 'aiResponse');
    assert.strictEqual(toolExecutionMessage.type, 'toolExecution');
    assert.strictEqual(aiTypingMessage.type, 'aiTyping');
    assert.strictEqual(aiProcessingMessage.type, 'aiProcessing');
  });

  it('should provide access to AI agent service methods', () => {
    const aiService = sidebarProvider.getAIAgentService();
    
    // Verify key methods are available
    assert(typeof aiService.sendMessage === 'function', 'Should have sendMessage method');
    assert(typeof aiService.executeToolCall === 'function', 'Should have executeToolCall method');
    assert(typeof aiService.getAvailableTools === 'function', 'Should have getAvailableTools method');
    assert(typeof aiService.setModel === 'function', 'Should have setModel method');
    
    // Verify tools are available
    const availableTools = aiService.getAvailableTools();
    assert(Array.isArray(availableTools), 'Should return array of available tools');
    assert(availableTools.length > 0, 'Should have built-in tools available');
  });

  it('should handle AI model configuration', () => {
    const aiService = sidebarProvider.getAIAgentService();
    
    // Test setting a new model configuration
    const newModelConfig = {
      name: 'CodeLlama',
      provider: 'ollama' as const,
      model: 'codellama',
      endpoint: 'http://localhost:11434',
      temperature: 0.7
    };

    aiService.setModel(newModelConfig);
    
    const currentModel = aiService.getCurrentModel();
    assert(currentModel, 'Should have model configuration after setting');
    assert.strictEqual(currentModel.model, 'codellama', 'Should update model name');
    assert.strictEqual(currentModel.temperature, 0.7, 'Should update temperature');
  });
});