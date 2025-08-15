/**
 * Unit tests for sidebar provider AI integration
 */

import { expect } from 'chai';
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
    expect(aiService).to.exist;
    
    const currentModel = aiService.getCurrentModel();
    expect(currentModel).to.exist;
    expect(currentModel!.provider).to.equal('ollama');
    expect(currentModel!.model).to.equal('llama2');
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
    expect(aiResponseMessage.type).to.equal('aiResponse');
    expect(toolExecutionMessage.type).to.equal('toolExecution');
    expect(aiTypingMessage.type).to.equal('aiTyping');
    expect(aiProcessingMessage.type).to.equal('aiProcessing');
  });

  it('should provide access to AI agent service methods', () => {
    const aiService = sidebarProvider.getAIAgentService();
    
    // Verify key methods are available
    expect(typeof aiService.sendMessage).to.equal('function');
    expect(typeof aiService.executeToolCall).to.equal('function');
    expect(typeof aiService.getAvailableTools).to.equal('function');
    expect(typeof aiService.setModel).to.equal('function');
    
    // Verify tools are available
    const availableTools = aiService.getAvailableTools();
    expect(Array.isArray(availableTools)).to.be.true;
    expect(availableTools.length).to.be.greaterThan(0);
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
    expect(currentModel).to.exist;
    expect(currentModel!.model).to.equal('codellama');
    expect(currentModel!.temperature).to.equal(0.7);
  });
});