/**
 * Tests for OpenAI Function Calling Integration
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ChatBridge, ChatMessage } from '../../core/chat';
import { IAgent, AgentConfig } from '../../core/agent';
import { ToolManager, BuiltInTools } from '../../core/tool-manager';
import { ToolRegistry, ToolDefinition } from '../../core/tools';

describe('OpenAI Function Calling Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let chatBridge: ChatBridge;
  let toolRegistry: ToolRegistry;
  let mockAgent: IAgent;  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Reset singletons
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
    
    // Create fresh instances
    toolRegistry = ToolRegistry.getInstance();
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
          allowedTools: ['read_file', 'write_file', 'show_message', 'test_tool'],
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

    // Mock console methods to silence any error logs globally
    sandbox.stub(console, 'error');
    sandbox.stub(console, 'warn');
  });  afterEach(() => {
    sandbox.restore();
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
  });

  describe('Tool Integration', () => {
    it('should add available tools to OpenAI request', async () => {
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
        executor: async () => ({ success: true, data: 'Test executed' })
      };

      toolRegistry.registerTool(testTool);

      // Mock the toolManager.getAvailableTools method to return our test tool
      const toolManager = ToolManager.getInstance();
      const getAvailableToolsStub = sandbox.stub(toolManager, 'getAvailableTools').callsFake((_context) => {
        return [testTool];
      });

      // Mock the HTTP request that sendOpenAIMessage makes
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{
            message: {
              content: 'Hello, I can help you with that!',
              role: 'assistant'
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8,
            total_tokens: 18
          }
        }),
        text: async () => ''
      } as Response;

      // Spy on makeHttpRequest to verify tools are included in the request
      const makeHttpRequestSpy = sandbox.stub(chatBridge as any, 'makeHttpRequest').callsFake(async (...args: any[]) => {
        const [url, options] = args;
        if (options && options.body) {
          const requestBody = JSON.parse(options.body);
        }
        return mockResponse;
      });

      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello' }
      ];

      const result = await chatBridge.sendMessage(mockAgent, messages);

      // Verify the response
      assert.strictEqual(result.content, 'Hello, I can help you with that!');
      assert.strictEqual(result.finishReason, 'stop');
      
      // Verify that getAvailableTools was called (may be called multiple times during the flow)
      assert.ok(getAvailableToolsStub.called, 'getAvailableTools should have been called');
      
      // Verify that makeHttpRequest was called with tools in the request body
      assert.ok(makeHttpRequestSpy.calledOnce, 'makeHttpRequest should have been called');
      const requestBody = JSON.parse(makeHttpRequestSpy.firstCall.args[1].body);

      assert.ok(requestBody.tools, 'Request should include tools');
      assert.ok(Array.isArray(requestBody.tools), 'Tools should be an array');
    });  

  it('should handle OpenAI function calling response', async () => {     
      try {
        // Check if read_file tool is already available
        let readFileTool = toolRegistry.getTool('read_file');
        
        if (!readFileTool) {
          BuiltInTools.registerAll();
          readFileTool = toolRegistry.getTool('read_file');
        }

        assert.ok(readFileTool, 'read_file tool should be registered');

        // Mock the toolManager.getAvailableTools method
        const toolManager = ToolManager.getInstance();
        const getAvailableToolsStub = sandbox.stub(toolManager, 'getAvailableTools').callsFake((_context) => {
          return [readFileTool];
        });

        // Mock tool execution
        const executeToolStub = sandbox.stub(toolManager, 'executeTool').resolves({
          success: true,
          data: { content: 'Hello World!' }
        });

        // Mock the HTTP responses - first for tool call, then for follow-up
        const toolCallResponse = {
          status: 200,
          statusText: 'OK',
          ok: true,
          headers: new Headers(),
          json: async () => ({
            choices: [{
              message: {
                content: null,
                role: 'assistant',
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
            usage: {
              prompt_tokens: 30,
              completion_tokens: 10,
              total_tokens: 40
            }
          }),
          text: async () => ''
        } as Response;

        const finalResponse = {
          status: 200,
          statusText: 'OK',
          ok: true,
          headers: new Headers(),
          json: async () => ({
            choices: [{
              message: {
                content: 'The file contains: Hello World!',
                role: 'assistant'
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 50,
              completion_tokens: 15,
              total_tokens: 65
            }
          }),
          text: async () => ''
        } as Response;

        const makeHttpRequestStub = sandbox.stub(chatBridge as any, 'makeHttpRequest');
        makeHttpRequestStub.onFirstCall().resolves(toolCallResponse);
        makeHttpRequestStub.onSecondCall().resolves(finalResponse);

        const messages: ChatMessage[] = [
          { role: 'user', content: 'Please read test.txt' }
        ];

        let response;
        try {
          response = await chatBridge.sendMessage(mockAgent, messages);
        } catch (error) {
          throw error;
        }

        // Verify the response
        assert.strictEqual(response.content, 'The file contains: Hello World!');
        assert.strictEqual(response.finishReason, 'stop');
        assert.ok(response.usage);
        assert.strictEqual(response.usage.totalTokens, 105);

        // Verify that getAvailableTools was called (may be called multiple times during the flow)
        assert.ok(getAvailableToolsStub.called, 'getAvailableTools should have been called');

        // Verify that executeTool was called
        assert.ok(executeToolStub.calledOnce, 'executeTool should have been called');
        if (executeToolStub.calledOnce) {
          assert.strictEqual(executeToolStub.firstCall.args[0], 'read_file');
        }

        // Verify that makeHttpRequest was called twice (tool call + follow-up)
        assert.strictEqual(makeHttpRequestStub.callCount, 2, 'makeHttpRequest should have been called twice');

        // Verify tool calls are included in response
        assert.ok(response.toolCalls);
        assert.strictEqual(response.toolCalls.length, 1);
        assert.strictEqual(response.toolCalls[0].name, 'read_file');
      } catch (error) {
        throw error;
      }
    });

  it('should handle tool execution errors gracefully', async () => {
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

  it('should respect tool configuration settings', async () => {
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

  it('should handle disabled tools configuration', async () => {
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

  it('should validate tool calls before execution', async () => {
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

  describe('Streaming with Function Calls', () => {  it('should handle function calls in streaming mode', async () => {
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

  describe('Error Handling', () => {  it('should handle malformed tool call responses', async () => {
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

  it('should handle network errors during tool execution', async () => {
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

  describe('Integration with Built-in Tools', () => {  it('should execute file system tools correctly', async () => {
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

  it('should execute VS Code tools correctly', async () => {
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

