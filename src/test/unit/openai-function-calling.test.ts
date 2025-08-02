/**
 * Tests for OpenAI Function Calling Integration
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ChatBridge, ChatMessage, ChatResponse, ChatToolCall } from '../../core/chat';
import { IAgent, AgentConfig } from '../../core/agent';
import { ToolManager, ToolExecutionError, BuiltInTools } from '../../core/tool-manager';
import { ToolRegistry, ToolDefinition, ExecutionContext, SecurityLevel } from '../../core/tools';
import { WebNetworkUtils } from '../../core/webcompat';

suite('OpenAI Function Calling Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let chatBridge: ChatBridge;
  let toolManager: ToolManager;
  let toolRegistry: ToolRegistry;
  let mockAgent: IAgent;

  setup(() => {
    sandbox = sinon.createSandbox();
    
    // Reset singletons
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
    
    // Create fresh instances
    toolRegistry = ToolRegistry.getInstance();
    toolManager = ToolManager.getInstance();
    chatBridge = new ChatBridge();

    // Create mock agent with tool configuration
    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      provider: 'openai',
      config: {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key',
        tools: {
          enabled: true,
          allowedTools: ['read_file', 'write_file', 'show_message'],
          requireApproval: false
        }
      } as AgentConfig,
      capabilities: {
        hasVision: false,
        hasToolUse: true,
        reasoningDepth: 'advanced',
        speed: 'medium',
        costTier: 'high',
        maxTokens: 4096,
        supportedLanguages: ['en'],
        specializations: ['code']
      },
      isEnabledForAssignment: true,
      isAvailable: async () => true
    };

    // Mock workspace
    sandbox.stub(vscode.workspace, 'workspaceFolders').value([{
      uri: vscode.Uri.file('/test/workspace'),
      name: 'test-workspace',
      index: 0
    }]);
  });

  teardown(() => {
    sandbox.restore();
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
  });

  suite('Tool Integration', () => {
    test('should add available tools to OpenAI request', async () => {
      // Register a test tool
      const testTool: ToolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        },
        security: {
          requiresApproval: false,
          allowedInWeb: true,
          riskLevel: 'low'
        },
        executor: async (params) => ({ success: true, data: { echo: params.message } })
      };

      toolRegistry.registerTool(testTool);

      // Mock successful OpenAI response without tool calls
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: { content: 'Hello, I can help you with that!' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 }
        }),
        text: async () => JSON.stringify({
          choices: [{
            message: { content: 'Hello, I can help you with that!' },
            finish_reason: 'stop'
          }]
        })
      } as Response;

      // Spy on makeHttpRequest to capture the request body
      const makeHttpRequestSpy = sandbox.stub(chatBridge as any, 'makeHttpRequest').resolves(mockResponse);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' }
      ];

      await chatBridge.sendMessage(mockAgent, messages);

      // Verify that tools were added to the request
      assert.ok(makeHttpRequestSpy.calledOnce);
      const requestBody = JSON.parse(makeHttpRequestSpy.firstCall.args[1].body);
      
      assert.ok(requestBody.tools);
      assert.ok(Array.isArray(requestBody.tools));
      assert.ok(requestBody.tools.some((tool: any) => tool.function.name === 'test_tool'));
      assert.strictEqual(requestBody.tool_choice, 'auto');
    });

    test('should handle OpenAI function calling response', async () => {
      // Register built-in tools
      BuiltInTools.registerAll();

      // Mock OpenAI response with tool calls
      const mockToolCallResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: {
              content: 'I\'ll read the file for you.',
              tool_calls: [{
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'read_file',
                  arguments: JSON.stringify({ path: 'test.txt' })
                }
              }]
            },
            finish_reason: 'tool_calls'
          }],
          usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 }
        }),
        text: async () => ''
      } as Response;

      // Mock follow-up response after tool execution
      const mockFollowUpResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: { content: 'The file contains: Hello World!' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 }
        }),
        text: async () => ''
      } as Response;

      // Mock file system
      const mockFileContent = Buffer.from('Hello World!', 'utf8');
      sandbox.stub(vscode.workspace.fs, 'readFile').resolves(mockFileContent);

      // Set up HTTP request mock to return different responses
      const makeHttpRequestStub = sandbox.stub(chatBridge as any, 'makeHttpRequest');
      makeHttpRequestStub.onFirstCall().resolves(mockToolCallResponse);
      makeHttpRequestStub.onSecondCall().resolves(mockFollowUpResponse);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Please read test.txt' }
      ];

      const response = await chatBridge.sendMessage(mockAgent, messages);

      // Verify the response
      assert.strictEqual(response.content, 'The file contains: Hello World!');
      assert.strictEqual(response.finishReason, 'stop');
      assert.ok(response.toolCalls);
      assert.strictEqual(response.toolCalls.length, 1);
      assert.strictEqual(response.toolCalls[0].name, 'read_file');
      assert.ok(response.metadata?.toolResults);

      // Verify both HTTP requests were made
      assert.strictEqual(makeHttpRequestStub.callCount, 2);
    });

    test('should handle tool execution errors gracefully', async () => {
      // Register a tool that will fail
      const failingTool: ToolDefinition = {
        name: 'failing_tool',
        description: 'A tool that always fails',
        parameters: {
          type: 'object',
          properties: {}
        },
        security: {
          requiresApproval: false,
          allowedInWeb: true,
          riskLevel: 'low'
        },
        executor: async () => {
          throw new Error('Tool execution failed');
        }
      };

      toolRegistry.registerTool(failingTool);

      // Mock OpenAI response with tool call to failing tool
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: {
              content: 'I\'ll use the failing tool.',
              tool_calls: [{
                id: 'call_456',
                type: 'function',
                function: {
                  name: 'failing_tool',
                  arguments: '{}'
                }
              }]
            },
            finish_reason: 'tool_calls'
          }],
          usage: { prompt_tokens: 15, completion_tokens: 10, total_tokens: 25 }
        }),
        text: async () => ''
      } as Response;

      sandbox.stub(chatBridge as any, 'makeHttpRequest').resolves(mockResponse);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Use the failing tool' }
      ];

      try {
        await chatBridge.sendMessage(mockAgent, messages);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Tool execution failed'));
      }
    });

    test('should respect tool configuration settings', async () => {
      // Create agent with restricted tool access
      const restrictedAgent: IAgent = {
        ...mockAgent,
        config: {
          ...mockAgent.config,
          tools: {
            enabled: true,
            allowedTools: ['show_message'], // Only allow show_message
            requireApproval: false
          }
        }
      };

      // Register multiple tools
      BuiltInTools.registerAll();

      // Mock response
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: { content: 'Hello!' },
            finish_reason: 'stop'
          }]
        }),
        text: async () => ''
      } as Response;

      const makeHttpRequestSpy = sandbox.stub(chatBridge as any, 'makeHttpRequest').resolves(mockResponse);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' }
      ];

      await chatBridge.sendMessage(restrictedAgent, messages);

      // Verify only allowed tools were included
      const requestBody = JSON.parse(makeHttpRequestSpy.firstCall.args[1].body);
      assert.ok(requestBody.tools);
      
      const toolNames = requestBody.tools.map((tool: any) => tool.function.name);
      assert.ok(toolNames.includes('show_message'));
      assert.ok(!toolNames.includes('read_file')); // Should be filtered out
      assert.ok(!toolNames.includes('write_file')); // Should be filtered out
    });

    test('should handle disabled tools configuration', async () => {
      // Create agent with tools disabled
      const noToolsAgent: IAgent = {
        ...mockAgent,
        config: {
          ...mockAgent.config,
          tools: {
            enabled: false,
            allowedTools: [],
            requireApproval: false
          }
        }
      };

      // Mock response
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: { content: 'Hello!' },
            finish_reason: 'stop'
          }]
        }),
        text: async () => ''
      } as Response;

      const makeHttpRequestSpy = sandbox.stub(chatBridge as any, 'makeHttpRequest').resolves(mockResponse);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' }
      ];

      await chatBridge.sendMessage(noToolsAgent, messages);

      // Verify no tools were included
      const requestBody = JSON.parse(makeHttpRequestSpy.firstCall.args[1].body);
      assert.ok(!requestBody.tools);
    });

    test('should validate tool calls before execution', async () => {
      // Register a tool with required parameters
      const strictTool: ToolDefinition = {
        name: 'strict_tool',
        description: 'A tool with strict parameters',
        parameters: {
          type: 'object',
          properties: {
            required_param: { type: 'string' }
          },
          required: ['required_param']
        },
        security: {
          requiresApproval: false,
          allowedInWeb: true,
          riskLevel: 'low'
        },
        executor: async (params) => ({ success: true, data: params })
      };

      toolRegistry.registerTool(strictTool);

      // Mock OpenAI response with invalid tool call (missing required parameter)
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: {
              content: 'I\'ll use the strict tool.',
              tool_calls: [{
                id: 'call_789',
                type: 'function',
                function: {
                  name: 'strict_tool',
                  arguments: '{}' // Missing required_param
                }
              }]
            },
            finish_reason: 'tool_calls'
          }]
        }),
        text: async () => ''
      } as Response;

      sandbox.stub(chatBridge as any, 'makeHttpRequest').resolves(mockResponse);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Use the strict tool' }
      ];

      try {
        await chatBridge.sendMessage(mockAgent, messages);
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Tool execution failed'));
      }
    });
  });

  suite('Streaming with Function Calls', () => {
    test('should handle function calls in streaming mode', async () => {
      // Register a simple tool
      const simpleTool: ToolDefinition = {
        name: 'simple_tool',
        description: 'A simple tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          }
        },
        security: {
          requiresApproval: false,
          allowedInWeb: true,
          riskLevel: 'low'
        },
        executor: async (params) => ({ success: true, data: { result: `Processed: ${params.input}` } })
      };

      toolRegistry.registerTool(simpleTool);

      // Mock streaming response with tool calls
      const streamChunks = [
        'data: {"choices":[{"delta":{"content":"I\'ll help you with that."}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_123","type":"function","function":{"name":"simple_tool","arguments":"{\\"input\\":\\"test\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n'
      ];

      // Mock fetch for streaming
      const mockReader = {
        read: sandbox.stub()
      };

      streamChunks.forEach((chunk, index) => {
        mockReader.read.onCall(index).resolves({
          done: false,
          value: new TextEncoder().encode(chunk)
        });
      });

      mockReader.read.onCall(streamChunks.length).resolves({ done: true });

      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => mockReader
        }
      };

      sandbox.stub(global, 'fetch').resolves(mockResponse as any);

      // Mock follow-up non-streaming response
      const followUpResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: { content: 'Tool executed successfully!' },
            finish_reason: 'stop'
          }]
        }),
        text: async () => ''
      } as Response;

      sandbox.stub(chatBridge as any, 'makeHttpRequest').resolves(followUpResponse);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Process some data' }
      ];

      const chunks: string[] = [];
      let isComplete = false;

      await chatBridge.streamMessage(mockAgent, messages, (chunk, complete) => {
        if (chunk) {
          chunks.push(chunk);
        }
        if (complete) {
          isComplete = true;
        }
      });

      // Verify streaming worked and tool was executed
      assert.ok(isComplete);
      assert.ok(chunks.length > 0);
      assert.ok(chunks.join('').includes('Tool executed successfully!'));
    });
  });

  suite('Error Handling', () => {
    test('should handle malformed tool call responses', async () => {
      // Mock OpenAI response with malformed tool call
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: {
              content: 'I\'ll use a tool.',
              tool_calls: [{
                id: 'call_bad',
                type: 'function',
                function: {
                  name: 'nonexistent_tool',
                  arguments: 'invalid json{'
                }
              }]
            },
            finish_reason: 'tool_calls'
          }]
        }),
        text: async () => ''
      } as Response;

      sandbox.stub(chatBridge as any, 'makeHttpRequest').resolves(mockResponse);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Use a tool' }
      ];

      try {
        await chatBridge.sendMessage(mockAgent, messages);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Tool execution failed'));
      }
    });

    test('should handle network errors during tool execution', async () => {
      // Register a tool
      const networkTool: ToolDefinition = {
        name: 'network_tool',
        description: 'A tool that makes network requests',
        parameters: {
          type: 'object',
          properties: {}
        },
        security: {
          requiresApproval: false,
          allowedInWeb: true,
          riskLevel: 'low'
        },
        executor: async () => ({ success: true, data: { result: 'success' } })
      };

      toolRegistry.registerTool(networkTool);

      // Mock initial response with tool call
      const mockToolCallResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: {
              content: 'Using network tool.',
              tool_calls: [{
                id: 'call_net',
                type: 'function',
                function: {
                  name: 'network_tool',
                  arguments: '{}'
                }
              }]
            },
            finish_reason: 'tool_calls'
          }]
        }),
        text: async () => ''
      } as Response;

      // Mock network error on follow-up request
      const makeHttpRequestStub = sandbox.stub(chatBridge as any, 'makeHttpRequest');
      makeHttpRequestStub.onFirstCall().resolves(mockToolCallResponse);
      makeHttpRequestStub.onSecondCall().rejects(new Error('Network error'));

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Use network tool' }
      ];

      try {
        await chatBridge.sendMessage(mockAgent, messages);
        assert.fail('Should have thrown network error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Network error'));
      }
    });
  });

  suite('Integration with Built-in Tools', () => {
    test('should execute file system tools correctly', async () => {
      // Register built-in tools
      BuiltInTools.registerAll();

      // Mock file system
      const mockFileContent = Buffer.from('Test file content', 'utf8');
      sandbox.stub(vscode.workspace.fs, 'readFile').resolves(mockFileContent);

      // Mock OpenAI responses
      const toolCallResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: {
              content: 'I\'ll read the file.',
              tool_calls: [{
                id: 'call_read',
                type: 'function',
                function: {
                  name: 'read_file',
                  arguments: JSON.stringify({ path: 'test.txt' })
                }
              }]
            },
            finish_reason: 'tool_calls'
          }]
        }),
        text: async () => ''
      } as Response;

      const followUpResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: { content: 'File read successfully!' },
            finish_reason: 'stop'
          }]
        }),
        text: async () => ''
      } as Response;

      const makeHttpRequestStub = sandbox.stub(chatBridge as any, 'makeHttpRequest');
      makeHttpRequestStub.onFirstCall().resolves(toolCallResponse);
      makeHttpRequestStub.onSecondCall().resolves(followUpResponse);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Read test.txt' }
      ];

      const response = await chatBridge.sendMessage(mockAgent, messages);

      assert.strictEqual(response.content, 'File read successfully!');
      assert.ok(response.metadata?.toolResults);
      assert.strictEqual(response.metadata.toolResults[0].result.success, true);
      assert.strictEqual(response.metadata.toolResults[0].result.data.content, 'Test file content');
    });

    test('should execute VS Code tools correctly', async () => {
      // Register built-in tools
      BuiltInTools.registerAll();

      // Mock VS Code API
      const showMessageStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();

      // Mock OpenAI responses
      const toolCallResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: {
              content: 'I\'ll show a message.',
              tool_calls: [{
                id: 'call_msg',
                type: 'function',
                function: {
                  name: 'show_message',
                  arguments: JSON.stringify({ message: 'Hello from AI!', type: 'info' })
                }
              }]
            },
            finish_reason: 'tool_calls'
          }]
        }),
        text: async () => ''
      } as Response;

      const followUpResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: { content: 'Message shown successfully!' },
            finish_reason: 'stop'
          }]
        }),
        text: async () => ''
      } as Response;

      const makeHttpRequestStub = sandbox.stub(chatBridge as any, 'makeHttpRequest');
      makeHttpRequestStub.onFirstCall().resolves(toolCallResponse);
      makeHttpRequestStub.onSecondCall().resolves(followUpResponse);

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Show a message' }
      ];

      const response = await chatBridge.sendMessage(mockAgent, messages);

      assert.strictEqual(response.content, 'Message shown successfully!');
      assert.ok(showMessageStub.calledOnce);
      assert.ok(showMessageStub.calledWith('Hello from AI!'));
    });
  });
});