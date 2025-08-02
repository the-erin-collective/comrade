/**
 * Integration tests for OpenAI Function Calling
 * These tests verify the complete workflow from request to tool execution
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ChatBridge, ChatMessage } from '../../core/chat';
import { IAgent, AgentConfig } from '../../core/agent';
import { ToolManager, BuiltInTools } from '../../core/tool-manager';
import { ToolRegistry } from '../../core/tools';

suite('OpenAI Function Calling Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let chatBridge: ChatBridge;
  let mockAgent: IAgent;

  setup(() => {
    sandbox = sinon.createSandbox();
    
    // Reset singletons
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
    
    // Create fresh instances
    chatBridge = new ChatBridge();

    // Create mock agent
    mockAgent = {
      id: 'integration-test-agent',
      name: 'Integration Test Agent',
      provider: 'openai',
      config: {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'test-key',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        tools: {
          enabled: true,
          allowedTools: ['read_file', 'write_file', 'list_files', 'show_message'],
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

    // Register built-in tools
    BuiltInTools.registerAll();
  });

  teardown(() => {
    sandbox.restore();
    ToolRegistry.resetInstance();
    ToolManager.resetInstance();
  });

  test('should complete full workflow: request -> tool call -> execution -> response', async () => {
    // Mock file system
    const testFileContent = Buffer.from('Hello, World!\nThis is a test file.', 'utf8');
    sandbox.stub(vscode.workspace.fs, 'readFile').resolves(testFileContent);

    // Mock OpenAI API responses
    const initialResponse = {
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers(),
      json: async () => ({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'I\'ll read the README.md file for you.',
            tool_calls: [{
              id: 'call_abc123',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: JSON.stringify({ path: 'README.md' })
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: {
          prompt_tokens: 45,
          completion_tokens: 20,
          total_tokens: 65
        }
      }),
      text: async () => ''
    } as Response;

    const followUpResponse = {
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers(),
      json: async () => ({
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'I\'ve successfully read the README.md file. The file contains:\n\n"Hello, World!\nThis is a test file."\n\nThe file appears to be a simple test file with a greeting message.'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 85,
          completion_tokens: 35,
          total_tokens: 120
        }
      }),
      text: async () => ''
    } as Response;

    // Set up HTTP request mock
    const makeHttpRequestStub = sandbox.stub(chatBridge as any, 'makeHttpRequest');
    makeHttpRequestStub.onFirstCall().resolves(initialResponse);
    makeHttpRequestStub.onSecondCall().resolves(followUpResponse);

    // Execute the test
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Please read the README.md file and tell me what it contains.' }
    ];

    const response = await chatBridge.sendMessage(mockAgent, messages);

    // Verify the response
    assert.ok(response);
    assert.strictEqual(response.finishReason, 'stop');
    assert.ok(response.content.includes('Hello, World!'));
    assert.ok(response.content.includes('This is a test file'));
    
    // Verify tool calls were made
    assert.ok(response.toolCalls);
    assert.strictEqual(response.toolCalls.length, 1);
    assert.strictEqual(response.toolCalls[0].name, 'read_file');
    assert.deepStrictEqual(response.toolCalls[0].parameters, { path: 'README.md' });

    // Verify tool results are in metadata
    assert.ok(response.metadata?.toolResults);
    assert.strictEqual(response.metadata.toolResults.length, 1);
    assert.strictEqual(response.metadata.toolResults[0].result.success, true);
    assert.strictEqual(response.metadata.toolResults[0].result.data.content, 'Hello, World!\nThis is a test file.');

    // Verify usage information is combined
    assert.ok(response.usage);
    assert.strictEqual(response.usage.totalTokens, 185); // 65 + 120

    // Verify both HTTP requests were made
    assert.strictEqual(makeHttpRequestStub.callCount, 2);

    // Verify first request included tools
    const firstRequestBody = JSON.parse(makeHttpRequestStub.firstCall.args[1].body);
    assert.ok(firstRequestBody.tools);
    assert.ok(firstRequestBody.tools.some((tool: any) => tool.function.name === 'read_file'));

    // Verify second request included tool results
    const secondRequestBody = JSON.parse(makeHttpRequestStub.secondCall.args[1].body);
    assert.ok(secondRequestBody.messages.length > 1);
    assert.ok(secondRequestBody.messages.some((msg: any) => 
      msg.content && msg.content.includes('Tool "read_file" result')
    ));
  });

  test('should handle multiple tool calls in sequence', async () => {
    // Mock file system operations
    sandbox.stub(vscode.workspace.fs, 'readDirectory').resolves([
      ['file1.txt', vscode.FileType.File],
      ['file2.txt', vscode.FileType.File],
      ['folder1', vscode.FileType.Directory]
    ]);

    const showMessageStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();

    // Mock OpenAI responses for multiple tool calls
    const multiToolResponse = {
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers(),
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'I\'ll list the files and then show you a message.',
            tool_calls: [
              {
                id: 'call_list',
                type: 'function',
                function: {
                  name: 'list_files',
                  arguments: JSON.stringify({ path: '.' })
                }
              },
              {
                id: 'call_msg',
                type: 'function',
                function: {
                  name: 'show_message',
                  arguments: JSON.stringify({ message: 'Files listed!', type: 'info' })
                }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 30, completion_tokens: 25, total_tokens: 55 }
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
            role: 'assistant',
            content: 'I found 3 items in the directory: 2 files (file1.txt, file2.txt) and 1 folder (folder1). I\'ve also shown you a notification message.'
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 75, completion_tokens: 30, total_tokens: 105 }
      }),
      text: async () => ''
    } as Response;

    const makeHttpRequestStub = sandbox.stub(chatBridge as any, 'makeHttpRequest');
    makeHttpRequestStub.onFirstCall().resolves(multiToolResponse);
    makeHttpRequestStub.onSecondCall().resolves(finalResponse);

    const messages: ChatMessage[] = [
      { role: 'user', content: 'List the files in the current directory and show me a message.' }
    ];

    const response = await chatBridge.sendMessage(mockAgent, messages);

    // Verify multiple tools were executed
    assert.ok(response.toolCalls);
    assert.strictEqual(response.toolCalls.length, 2);
    
    const toolNames = response.toolCalls.map(call => call.name);
    assert.ok(toolNames.includes('list_files'));
    assert.ok(toolNames.includes('show_message'));

    // Verify both tools executed successfully
    assert.ok(response.metadata?.toolResults);
    assert.strictEqual(response.metadata.toolResults.length, 2);
    assert.ok(response.metadata.toolResults.every((result: any) => result.result.success));

    // Verify VS Code API was called
    assert.ok(showMessageStub.calledOnce);
    assert.ok(showMessageStub.calledWith('Files listed!'));

    // Verify final response includes information about both operations
    assert.ok(response.content.includes('3 items'));
    assert.ok(response.content.includes('notification message'));
  });

  test('should handle tool execution failure and continue gracefully', async () => {
    // Mock file system to throw an error
    sandbox.stub(vscode.workspace.fs, 'readFile').rejects(new Error('File not found'));

    // Mock OpenAI responses
    const toolCallResponse = {
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers(),
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'I\'ll try to read the file.',
            tool_calls: [{
              id: 'call_fail',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: JSON.stringify({ path: 'nonexistent.txt' })
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 }
      }),
      text: async () => ''
    } as Response;

    const errorHandlingResponse = {
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers(),
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'I apologize, but I encountered an error while trying to read the file. The file "nonexistent.txt" could not be found. Please check if the file exists and try again.'
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 45, completion_tokens: 25, total_tokens: 70 }
      }),
      text: async () => ''
    } as Response;

    const makeHttpRequestStub = sandbox.stub(chatBridge as any, 'makeHttpRequest');
    makeHttpRequestStub.onFirstCall().resolves(toolCallResponse);
    makeHttpRequestStub.onSecondCall().resolves(errorHandlingResponse);

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Read nonexistent.txt' }
    ];

    const response = await chatBridge.sendMessage(mockAgent, messages);

    // Verify the response handles the error gracefully
    assert.strictEqual(response.finishReason, 'stop');
    assert.ok(response.content.includes('error'));
    assert.ok(response.content.includes('could not be found'));

    // Verify tool call was attempted
    assert.ok(response.toolCalls);
    assert.strictEqual(response.toolCalls[0].name, 'read_file');

    // Verify tool result shows failure
    assert.ok(response.metadata?.toolResults);
    assert.strictEqual(response.metadata.toolResults[0].result.success, false);
    assert.ok(response.metadata.toolResults[0].result.error?.includes('File not found'));
  });

  test('should respect security settings and require approval for dangerous tools', async () => {
    // Create agent that requires approval
    const secureAgent: IAgent = {
      ...mockAgent,
      config: {
        ...mockAgent.config,
        tools: {
          enabled: true,
          allowedTools: ['write_file'],
          requireApproval: true // This should require user approval
        }
      }
    };

    // Mock user denying approval
    sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined); // User clicks away or denies

    // Mock OpenAI response with write_file tool call
    const toolCallResponse = {
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers(),
      json: async () => ({
        choices: [{
          message: {
            role: 'assistant',
            content: 'I\'ll write the file for you.',
            tool_calls: [{
              id: 'call_write',
              type: 'function',
              function: {
                name: 'write_file',
                arguments: JSON.stringify({ path: 'test.txt', content: 'Hello World' })
              }
            }]
          },
          finish_reason: 'tool_calls'
        }]
      }),
      text: async () => ''
    } as Response;

    sandbox.stub(chatBridge as any, 'makeHttpRequest').resolves(toolCallResponse);

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Write "Hello World" to test.txt' }
    ];

    try {
      await chatBridge.sendMessage(secureAgent, messages);
      assert.fail('Should have thrown an error due to denied approval');
    } catch (error) {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('Tool execution failed'));
    }
  });

  test('should handle streaming with function calls', async function() {
    // Skip this test in environments where fetch is not available
    if (typeof fetch === 'undefined') {
      this.skip();
    }

    // Mock streaming response with tool calls
    const streamChunks = [
      'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":"I\'ll help you with that. Let me show you a message."}}]}\n\n',
      'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"id":"call_123","type":"function","function":{"name":"show_message","arguments":"{\\"message\\":\\"Hello from streaming!\\",\\"type\\":\\"info\\"}"}}]}}]}\n\n',
      'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n'
    ];

    // Mock ReadableStream
    let chunkIndex = 0;
    const mockReader = {
      read: async () => {
        if (chunkIndex < streamChunks.length) {
          const chunk = streamChunks[chunkIndex++];
          return {
            done: false,
            value: new TextEncoder().encode(chunk)
          };
        }
        return { done: true };
      },
      releaseLock: () => {}
    };

    const mockResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => mockReader
      }
    };

    // Mock fetch for streaming
    sandbox.stub(global, 'fetch').resolves(mockResponse as any);

    // Mock VS Code API
    const showMessageStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves();

    // Mock follow-up HTTP request for tool execution result
    const followUpResponse = {
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: new Headers(),
      json: async () => ({
        choices: [{
          message: { content: 'Message displayed successfully!' },
          finish_reason: 'stop'
        }]
      }),
      text: async () => ''
    } as Response;

    sandbox.stub(chatBridge as any, 'makeHttpRequest').resolves(followUpResponse);

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Show me a streaming message' }
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

    // Verify streaming completed
    assert.ok(isComplete);
    
    // Verify tool was executed
    assert.ok(showMessageStub.calledOnce);
    assert.ok(showMessageStub.calledWith('Hello from streaming!'));

    // Verify final response was streamed
    const fullContent = chunks.join('');
    assert.ok(fullContent.includes('Message displayed successfully!'));
  });
});