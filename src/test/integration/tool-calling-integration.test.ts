/**
 * Integration tests for tool calling with real tool execution
 * Tests the complete tool calling workflow including registration, validation,
 * execution, and security checks
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'path';
import { ChatBridge, ChatMessage, ChatToolCall } from '../../core/chat';
import { AgentRegistry } from '../../core/registry';
import { ConfigurationManager } from '../../core/config';
import { ToolManager } from '../../core/tool-manager';
import { mockAgentConfigurations, createMockAgent } from '../mocks/agents';

suite('Tool Calling Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let chatBridge: ChatBridge;
  let agentRegistry: AgentRegistry;
  let configManager: ConfigurationManager;
  let toolManager: ToolManager;
  let mockSecretStorage: any;
  let workspaceUri: vscode.Uri;

  setup(async () => {
    sandbox = sinon.createSandbox();
    
    // Create test workspace
    workspaceUri = vscode.Uri.file(path.join(__dirname, '../../../test-workspace'));
    
    mockSecretStorage = {
      store: sandbox.stub(),
      get: sandbox.stub().resolves('test-api-key'),
      delete: sandbox.stub(),
      onDidChange: { dispose: () => {} }
    };

    // Initialize components
    configManager = ConfigurationManager.getInstance(mockSecretStorage);
    agentRegistry = AgentRegistry.getInstance(configManager);
    chatBridge = new ChatBridge();
    toolManager = ToolManager.getInstance();

    // Mock agent configurations with tool-capable agents
    const toolCapableAgents = mockAgentConfigurations
      .filter(c => c.capabilities.hasToolUse)
      .map(createMockAgent);
    
    sandbox.stub(configManager, 'getAllAgents').resolves(toolCapableAgents);
    
    await agentRegistry.initialize();

    // Mock VS Code workspace APIs
    sandbox.stub(vscode.workspace, 'workspaceFolders').value([
      { uri: workspaceUri, name: 'test-workspace', index: 0 }
    ]);

    sandbox.stub(vscode.workspace, 'fs').value({
      readFile: sandbox.stub().resolves(Buffer.from('test file content')),
      writeFile: sandbox.stub().resolves(),
      createDirectory: sandbox.stub().resolves(),
      delete: sandbox.stub().resolves(),
      stat: sandbox.stub().resolves({ 
        type: vscode.FileType.File, 
        size: 100,
        ctime: Date.now(),
        mtime: Date.now()
      })
    });

    sandbox.stub(vscode.workspace, 'findFiles').resolves([
      vscode.Uri.file(path.join(workspaceUri.fsPath, 'src/index.ts')),
      vscode.Uri.file(path.join(workspaceUri.fsPath, 'package.json'))
    ]);
  });

  teardown(() => {
    sandbox.restore();
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
    ToolManager.resetInstance();
  });

  test('should register and execute file system tools', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock OpenAI function calling response
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: JSON.stringify({
                  path: 'src/index.ts'
                })
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 }
      })
    });

    const toolAgent = agentRegistry.getAgents().find(a => a.capabilities.hasToolUse)!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Read the contents of src/index.ts' }
    ];

    // Register file system tools
    toolManager.registerTool({
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to read' }
        },
        required: ['path']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low'
      },
      executor: async (params: any) => {
        const filePath = vscode.Uri.file(path.join(workspaceUri.fsPath, params.path));
        const content = await vscode.workspace.fs.readFile(filePath);
        return {
          success: true,
          result: new TextDecoder().decode(content)
        };
      }
    });

    const response = await chatBridge.sendMessage(toolAgent, messages, {
      tools: toolManager.getAvailableTools(toolAgent.capabilities)
    });

    assert.ok(response.success, 'Tool calling should succeed');
    assert.strictEqual(response.finishReason, 'tool_calls', 'Should indicate tool calls were made');
    assert.ok(response.toolCalls, 'Should include tool calls');
    assert.strictEqual(response.toolCalls![0].name, 'read_file', 'Should call correct tool');
    
    // Verify tool was executed
    const fsReadStub = vscode.workspace.fs.readFile as sinon.SinonStub;
    assert.ok(fsReadStub.called, 'Should execute file read operation');
  });

  test('should handle tool execution with parameter validation', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock tool call with invalid parameters
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_456',
              type: 'function',
              function: {
                name: 'create_file',
                arguments: JSON.stringify({
                  // Missing required 'content' parameter
                  path: 'new-file.ts'
                })
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 40, completion_tokens: 30, total_tokens: 70 }
      })
    });

    const toolAgent = agentRegistry.getAgents().find(a => a.capabilities.hasToolUse)!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Create a new TypeScript file' }
    ];

    // Register file creation tool with validation
    toolManager.registerTool({
      name: 'create_file',
      description: 'Create a new file with content',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path for the new file' },
          content: { type: 'string', description: 'Content for the new file' }
        },
        required: ['path', 'content']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'medium'
      },
      executor: async (params: any) => {
        const filePath = vscode.Uri.file(path.join(workspaceUri.fsPath, params.path));
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(params.content));
        return {
          success: true,
          result: `File created at ${params.path}`
        };
      }
    });

    const response = await chatBridge.sendMessage(toolAgent, messages, {
      tools: toolManager.getAvailableTools(toolAgent.capabilities)
    });

    // Should handle validation error gracefully
    assert.ok(response.success, 'Should handle validation error gracefully');
    assert.ok(response.toolResults, 'Should include tool results');
    assert.strictEqual(response.toolResults![0].success, false, 'Tool execution should fail validation');
    assert.ok(response.toolResults![0].error?.includes('required'), 'Should indicate missing required parameter');
  });

  test('should handle tool security approval workflow', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock dangerous tool call
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_789',
              type: 'function',
              function: {
                name: 'delete_file',
                arguments: JSON.stringify({
                  path: 'important-file.ts'
                })
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 35, completion_tokens: 20, total_tokens: 55 }
      })
    });

    // Mock user approval dialog
    const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
    showWarningMessageStub.resolves({ title: 'Approve' }); // User approves

    const toolAgent = agentRegistry.getAgents().find(a => a.capabilities.hasToolUse)!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Delete the file important-file.ts' }
    ];

    // Register dangerous file deletion tool
    toolManager.registerTool({
      name: 'delete_file',
      description: 'Delete a file (dangerous operation)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to delete' }
        },
        required: ['path']
      },
      security: {
        requiresApproval: true,
        allowedInWeb: false,
        riskLevel: 'high'
      },
      executor: async (params: any) => {
        const filePath = vscode.Uri.file(path.join(workspaceUri.fsPath, params.path));
        await vscode.workspace.fs.delete(filePath);
        return {
          success: true,
          result: `File deleted: ${params.path}`
        };
      }
    });

    const response = await chatBridge.sendMessage(toolAgent, messages, {
      tools: toolManager.getAvailableTools(toolAgent.capabilities)
    });

    assert.ok(response.success, 'Tool calling should succeed with approval');
    assert.ok(showWarningMessageStub.called, 'Should show approval dialog');
    assert.ok(response.toolResults, 'Should include tool results');
    assert.strictEqual(response.toolResults![0].success, true, 'Tool execution should succeed after approval');
    
    // Verify dangerous operation was executed
    const fsDeleteStub = vscode.workspace.fs.delete as sinon.SinonStub;
    assert.ok(fsDeleteStub.called, 'Should execute file deletion after approval');
  });

  test('should handle tool security rejection', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_rejected',
              type: 'function',
              function: {
                name: 'system_command',
                arguments: JSON.stringify({
                  command: 'rm -rf /'
                })
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 30, completion_tokens: 15, total_tokens: 45 }
      })
    });

    // Mock user rejection
    const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
    showWarningMessageStub.resolves({ title: 'Reject' }); // User rejects

    const toolAgent = agentRegistry.getAgents().find(a => a.capabilities.hasToolUse)!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Run a system command' }
    ];

    // Register dangerous system command tool
    toolManager.registerTool({
      name: 'system_command',
      description: 'Execute system command (very dangerous)',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' }
        },
        required: ['command']
      },
      security: {
        requiresApproval: true,
        allowedInWeb: false,
        riskLevel: 'high'
      },
      executor: async (params: any) => {
        // This should not be executed due to rejection
        return {
          success: true,
          result: `Command executed: ${params.command}`
        };
      }
    });

    const response = await chatBridge.sendMessage(toolAgent, messages, {
      tools: toolManager.getAvailableTools(toolAgent.capabilities)
    });

    assert.ok(response.success, 'Should handle rejection gracefully');
    assert.ok(showWarningMessageStub.called, 'Should show approval dialog');
    assert.ok(response.toolResults, 'Should include tool results');
    assert.strictEqual(response.toolResults![0].success, false, 'Tool execution should fail due to rejection');
    assert.ok(response.toolResults![0].error?.includes('rejected'), 'Should indicate user rejection');
  });

  test('should handle multiple tool calls in sequence', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock multiple tool calls
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'list_files',
                  arguments: JSON.stringify({ directory: 'src' })
                }
              },
              {
                id: 'call_2',
                type: 'function',
                function: {
                  name: 'read_file',
                  arguments: JSON.stringify({ path: 'package.json' })
                }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 60, completion_tokens: 40, total_tokens: 100 }
      })
    });

    const toolAgent = agentRegistry.getAgents().find(a => a.capabilities.hasToolUse)!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'List files in src directory and read package.json' }
    ];

    // Register multiple tools
    toolManager.registerTool({
      name: 'list_files',
      description: 'List files in a directory',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory to list' }
        },
        required: ['directory']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low'
      },
      executor: async (params: any) => {
        const dirPath = vscode.Uri.file(path.join(workspaceUri.fsPath, params.directory));
        const files = await vscode.workspace.findFiles(
          new vscode.RelativePattern(dirPath, '*'),
          null,
          100
        );
        return {
          success: true,
          result: files.map(f => path.basename(f.fsPath)).join(', ')
        };
      }
    });

    toolManager.registerTool({
      name: 'read_file',
      description: 'Read file contents',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' }
        },
        required: ['path']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low'
      },
      executor: async (params: any) => {
        const filePath = vscode.Uri.file(path.join(workspaceUri.fsPath, params.path));
        const content = await vscode.workspace.fs.readFile(filePath);
        return {
          success: true,
          result: new TextDecoder().decode(content)
        };
      }
    });

    const response = await chatBridge.sendMessage(toolAgent, messages, {
      tools: toolManager.getAvailableTools(toolAgent.capabilities)
    });

    assert.ok(response.success, 'Multiple tool calls should succeed');
    assert.strictEqual(response.toolCalls!.length, 2, 'Should have 2 tool calls');
    assert.ok(response.toolResults, 'Should include tool results');
    assert.strictEqual(response.toolResults!.length, 2, 'Should have 2 tool results');
    
    // Verify both tools were executed
    assert.strictEqual(response.toolResults![0].success, true, 'First tool should succeed');
    assert.strictEqual(response.toolResults![1].success, true, 'Second tool should succeed');
  });

  test('should handle tool execution errors gracefully', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_error',
              type: 'function',
              function: {
                name: 'failing_tool',
                arguments: JSON.stringify({ input: 'test' })
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
      })
    });

    const toolAgent = agentRegistry.getAgents().find(a => a.capabilities.hasToolUse)!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Use the failing tool' }
    ];

    // Register tool that throws error
    toolManager.registerTool({
      name: 'failing_tool',
      description: 'A tool that always fails',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        },
        required: ['input']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low'
      },
      executor: async (params: any) => {
        throw new Error('Tool execution failed');
      }
    });

    const response = await chatBridge.sendMessage(toolAgent, messages, {
      tools: toolManager.getAvailableTools(toolAgent.capabilities)
    });

    assert.ok(response.success, 'Should handle tool error gracefully');
    assert.ok(response.toolResults, 'Should include tool results');
    assert.strictEqual(response.toolResults![0].success, false, 'Tool should fail');
    assert.ok(response.toolResults![0].error?.includes('execution failed'), 'Should include error message');
  });

  test('should handle Anthropic tool calling format', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock Anthropic tool use response
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        content: [{
          type: 'tool_use',
          id: 'toolu_anthropic',
          name: 'search_files',
          input: {
            query: 'function',
            directory: 'src'
          }
        }],
        model: 'claude-3-sonnet-20240229',
        role: 'assistant',
        stop_reason: 'tool_use',
        usage: { input_tokens: 45, output_tokens: 30 }
      })
    });

    const anthropicAgent = agentRegistry.getAgents().find(a => 
      a.provider === 'anthropic' && a.capabilities.hasToolUse
    );
    
    if (!anthropicAgent) {
      // Create Anthropic agent with tool capabilities for this test
      const anthropicConfig = {
        ...mockAgentConfigurations.find(c => c.provider === 'anthropic')!,
        capabilities: {
          ...mockAgentConfigurations.find(c => c.provider === 'anthropic')!.capabilities,
          hasToolUse: true
        }
      };
      const testAgent = createMockAgent(anthropicConfig);
      agentRegistry['agents'].set(testAgent.id, testAgent);
    }

    const toolAgent = agentRegistry.getAgents().find(a => 
      a.provider === 'anthropic' && a.capabilities.hasToolUse
    )!;

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Search for functions in the src directory' }
    ];

    // Register search tool
    toolManager.registerTool({
      name: 'search_files',
      description: 'Search for text in files',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          directory: { type: 'string', description: 'Directory to search in' }
        },
        required: ['query', 'directory']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low'
      },
      executor: async (params: any) => {
        // Mock search results
        return {
          success: true,
          result: `Found 3 matches for "${params.query}" in ${params.directory}/`
        };
      }
    });

    const response = await chatBridge.sendMessage(toolAgent, messages, {
      tools: toolManager.getAvailableTools(toolAgent.capabilities)
    });

    assert.ok(response.success, 'Anthropic tool calling should succeed');
    assert.strictEqual(response.finishReason, 'tool_calls', 'Should indicate tool use');
    assert.ok(response.toolCalls, 'Should include tool calls');
    assert.strictEqual(response.toolCalls![0].name, 'search_files', 'Should call correct tool');
    
    // Verify Anthropic-specific request format
    const requestBody = JSON.parse(fetchStub.getCall(0).args[1].body);
    assert.ok(requestBody.tools, 'Should include tools in request');
    assert.strictEqual(requestBody.tools[0].name, 'search_files', 'Should include tool definition');
  });

  test('should handle tool calling with streaming responses', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock streaming response with tool calls
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub()
          .onCall(0).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_stream","type":"function","function":{"name":"get_time"}}]}}]}\n\n')
          })
          .onCall(1).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"timezone\\": \\"UTC\\"}"}}]}}]}\n\n')
          })
          .onCall(2).resolves({
            done: false,
            value: new TextEncoder().encode('data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n')
          })
          .onCall(3).resolves({
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n\n')
          })
          .onCall(4).resolves({ done: true })
      })
    };

    fetchStub.resolves({
      ok: true,
      status: 200,
      body: mockStream,
      headers: new Map([['content-type', 'text/event-stream']])
    });

    const toolAgent = agentRegistry.getAgents().find(a => a.capabilities.hasToolUse)!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'What time is it in UTC?' }
    ];

    // Register time tool
    toolManager.registerTool({
      name: 'get_time',
      description: 'Get current time',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'Timezone' }
        },
        required: ['timezone']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low'
      },
      executor: async (params: any) => {
        return {
          success: true,
          result: `Current time in ${params.timezone}: ${new Date().toISOString()}`
        };
      }
    });

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    const response = await chatBridge.streamMessage(toolAgent, messages, streamCallback, {
      tools: toolManager.getAvailableTools(toolAgent.capabilities)
    });

    assert.ok(response.success, 'Streaming tool calls should succeed');
    assert.strictEqual(response.finishReason, 'tool_calls', 'Should indicate tool calls');
    assert.ok(response.toolCalls, 'Should include tool calls from stream');
    assert.strictEqual(response.toolCalls![0].name, 'get_time', 'Should parse tool call from stream');
  });

  test('should handle tool calling with concurrent execution', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock multiple concurrent tool calls
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_concurrent_1',
                type: 'function',
                function: {
                  name: 'slow_operation',
                  arguments: JSON.stringify({ duration: 100, id: 1 })
                }
              },
              {
                id: 'call_concurrent_2',
                type: 'function',
                function: {
                  name: 'slow_operation',
                  arguments: JSON.stringify({ duration: 150, id: 2 })
                }
              },
              {
                id: 'call_concurrent_3',
                type: 'function',
                function: {
                  name: 'slow_operation',
                  arguments: JSON.stringify({ duration: 80, id: 3 })
                }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 70, completion_tokens: 50, total_tokens: 120 }
      })
    });

    const toolAgent = agentRegistry.getAgents().find(a => a.capabilities.hasToolUse)!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Run three slow operations concurrently' }
    ];

    // Register slow operation tool
    toolManager.registerTool({
      name: 'slow_operation',
      description: 'A slow operation for testing concurrency',
      parameters: {
        type: 'object',
        properties: {
          duration: { type: 'number', description: 'Duration in ms' },
          id: { type: 'number', description: 'Operation ID' }
        },
        required: ['duration', 'id']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low'
      },
      executor: async (params: any) => {
        await new Promise(resolve => setTimeout(resolve, params.duration));
        return {
          success: true,
          result: `Operation ${params.id} completed after ${params.duration}ms`
        };
      }
    });

    const startTime = Date.now();
    const response = await chatBridge.sendMessage(toolAgent, messages, {
      tools: toolManager.getAvailableTools(toolAgent.capabilities),
      concurrentToolExecution: true
    });
    const endTime = Date.now();

    assert.ok(response.success, 'Concurrent tool execution should succeed');
    assert.strictEqual(response.toolCalls!.length, 3, 'Should have 3 tool calls');
    assert.strictEqual(response.toolResults!.length, 3, 'Should have 3 tool results');
    
    // All tools should succeed
    response.toolResults!.forEach((result, i) => {
      assert.strictEqual(result.success, true, `Tool ${i + 1} should succeed`);
    });

    // Should complete faster than sequential execution (150ms + overhead vs 330ms sequential)
    const executionTime = endTime - startTime;
    assert.ok(executionTime < 300, `Should execute concurrently (took ${executionTime}ms)`);
  });

  test('should handle tool calling audit logging', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_audit',
              type: 'function',
              function: {
                name: 'sensitive_operation',
                arguments: JSON.stringify({ data: 'sensitive' })
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 }
      })
    });

    const toolAgent = agentRegistry.getAgents().find(a => a.capabilities.hasToolUse)!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Perform sensitive operation' }
    ];

    // Mock audit logging
    const auditLogs: any[] = [];
    const originalConsoleLog = console.log;
    console.log = (...args) => {
      if (args[0]?.includes('AUDIT')) {
        auditLogs.push(args);
      }
      originalConsoleLog(...args);
    };

    // Register sensitive tool with audit logging
    toolManager.registerTool({
      name: 'sensitive_operation',
      description: 'A sensitive operation that requires audit logging',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Sensitive data' }
        },
        required: ['data']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: false,
        riskLevel: 'high'
      },
      executor: async (params: any) => {
        // Log audit trail
        console.log('AUDIT: Sensitive operation executed', {
          tool: 'sensitive_operation',
          params: params,
          timestamp: new Date().toISOString(),
          agent: toolAgent.id
        });
        
        return {
          success: true,
          result: 'Sensitive operation completed'
        };
      }
    });

    try {
      const response = await chatBridge.sendMessage(toolAgent, messages, {
        tools: toolManager.getAvailableTools(toolAgent.capabilities)
      });

      assert.ok(response.success, 'Sensitive tool should execute');
      assert.ok(auditLogs.length > 0, 'Should create audit logs');
      
      const auditLog = auditLogs[0][1];
      assert.strictEqual(auditLog.tool, 'sensitive_operation', 'Should log tool name');
      assert.ok(auditLog.timestamp, 'Should log timestamp');
      assert.strictEqual(auditLog.agent, toolAgent.id, 'Should log agent ID');
      
    } finally {
      console.log = originalConsoleLog;
    }
  });

  test('should handle tool calling with custom execution context', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_context',
              type: 'function',
              function: {
                name: 'context_aware_tool',
                arguments: JSON.stringify({ action: 'test' })
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
      })
    });

    const toolAgent = agentRegistry.getAgents().find(a => a.capabilities.hasToolUse)!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Use context-aware tool' }
    ];

    // Register context-aware tool
    toolManager.registerTool({
      name: 'context_aware_tool',
      description: 'A tool that uses execution context',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Action to perform' }
        },
        required: ['action']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low'
      },
      executor: async (params: any, context: any) => {
        return {
          success: true,
          result: `Action ${params.action} executed in workspace: ${context?.workspaceUri?.fsPath || 'unknown'}`
        };
      }
    });

    const response = await chatBridge.sendMessage(toolAgent, messages, {
      tools: toolManager.getAvailableTools(toolAgent.capabilities),
      executionContext: {
        workspaceUri: workspaceUri,
        agentId: toolAgent.id,
        sessionId: 'test-session'
      }
    });

    assert.ok(response.success, 'Context-aware tool should succeed');
    assert.ok(response.toolResults![0].result.includes(workspaceUri.fsPath), 'Should use execution context');
  });
});