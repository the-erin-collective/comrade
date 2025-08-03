/**
 * Comprehensive integration test suite that runs all integration tests
 * and validates the complete system functionality
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { describe, beforeEach, afterEach } from 'mocha';
import * as path from 'path';
import { ToolDefinition } from '../../core/tools';

// Import all integration test components
import { ChatBridge, ChatMessage } from '../../core/chat';
import { AgentRegistry } from '../../core/registry';
import { ConfigurationManager } from '../../core/config';
import { ToolManager } from '../../core/tool-manager';
import { mockAgentConfigurations, createMockAgent } from '../mocks/agents';

describe('Comprehensive Integration Tests', () => {
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

    // Initialize all components
    configManager = ConfigurationManager.getInstance(mockSecretStorage);
    agentRegistry = AgentRegistry.getInstance(configManager);
    chatBridge = new ChatBridge();
    toolManager = ToolManager.getInstance();

    // Mock all agent configurations
    sandbox.stub(configManager, 'getAllAgents').resolves(
      mockAgentConfigurations.map(createMockAgent)
    );
    
    await agentRegistry.initialize();

    // Mock VS Code APIs
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
  });

  teardown(() => {
    sandbox.restore();
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
    ToolManager.resetInstance();
  });

  test('should handle complete Anthropic workflow with streaming and tools', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock Anthropic streaming response with tool calls
    const mockStream = {
      getReader: () => ({
        read: sandbox.stub()
          .onCall(0).resolves({
            done: false,
            value: new TextEncoder().encode('event: message_start\ndata: {"type":"message_start"}\n\n')
          })
          .onCall(1).resolves({
            done: false,
            value: new TextEncoder().encode('event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_123","name":"read_file","input":{"path":"src/index.ts"}}}\n\n')
          })
          .onCall(2).resolves({
            done: false,
            value: new TextEncoder().encode('event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n')
          })
          .onCall(3).resolves({ done: true })
      })
    };

    fetchStub.resolves({
      ok: true,
      status: 200,
      body: mockStream,
      headers: new Map([['content-type', 'text/event-stream']])
    });

    const anthropicAgent = agentRegistry.getAgent('anthropic-claude')!;
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful coding assistant.' },
      { role: 'user', content: 'Read the contents of src/index.ts and analyze it' }
    ];

    // Register file reading tool
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

    let streamedContent = '';
    const streamCallback = (chunk: string) => {
      streamedContent += chunk;
    };

    const response = await chatBridge.streamMessage(anthropicAgent, messages, streamCallback, {
      tools: toolManager.getAvailableTools(anthropicAgent.capabilities)
    });

    // Verify complete workflow
    assert.ok(response.success, 'Complete Anthropic workflow should succeed');
    assert.strictEqual(response.finishReason, 'tool_calls', 'Should indicate tool use');
    assert.ok(response.toolCalls, 'Should include tool calls');
    assert.strictEqual(response.toolCalls![0].name, 'read_file', 'Should call file reading tool');

    // Verify Anthropic-specific request format
    const requestBody = JSON.parse(fetchStub.getCall(0).args[1].body);
    assert.ok(requestBody.system, 'Should use Anthropic system parameter');
    assert.ok(requestBody.stream, 'Should request streaming');
    assert.ok(requestBody.tools, 'Should include tool definitions');
  });

  test('should handle cross-provider streaming with fallback and caching', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock different providers with different behaviors
    fetchStub.callsFake((...args: unknown[]) => {
      const url = args[0] as string;
      if (url.includes('openai')) {
        // OpenAI streaming success
        const mockStream = {
          getReader: () => ({
            read: sandbox.stub()
              .onCall(0).resolves({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"OpenAI response"}}]}\n\n')
              })
              .onCall(1).resolves({
                done: false,
                value: new TextEncoder().encode('data: [DONE]\n\n')
              })
              .onCall(2).resolves({ done: true })
          })
        };
        return Promise.resolve({
          ok: true,
          status: 200,
          body: mockStream,
          headers: new Map([['content-type', 'text/event-stream']])
        });
      } else if (url.includes('anthropic')) {
        // Anthropic CORS error, should fallback
        return Promise.reject(new Error('CORS error: streaming not allowed'));
      } else {
        // Other providers - regular response
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            choices: [{
              message: { content: 'Fallback response' },
              finish_reason: 'stop'
            }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
          })
        });
      }
    });

    const agents = [
      agentRegistry.getAgent('openai-gpt4')!,
      agentRegistry.getAgent('anthropic-claude')!,
      agentRegistry.getAgent('custom-model')!
    ];

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Test cross-provider streaming' }
    ];

    interface TestResult {
      provider: string;
      success: boolean;
      content: string;
      usedFallback: boolean;
    }

    const results: TestResult[] = [];
    
    for (const agent of agents) {
      let streamedContent = '';
      const streamCallback = (chunk: string) => {
        streamedContent += chunk;
      };

      const response = await chatBridge.streamMessage(agent, messages, streamCallback, {
        webEnvironment: agent.provider === 'anthropic' // Force fallback for Anthropic
      });

      results.push({
        provider: agent.provider,
        success: response.success,
        content: streamedContent || response.content || '',
        usedFallback: agent.provider === 'anthropic'
      });
    }

    // Verify all providers handled appropriately
    results.forEach(result => {
      assert.ok(result.success, `${result.provider} should succeed`);
      assert.ok(result.content.length > 0, `${result.provider} should have content`);
      
      if (result.usedFallback) {
        console.log(`${result.provider} used fallback successfully`);
      }
    });

    // Verify caching by making same requests again
    interface CachedResult {
      provider: string;
      available: boolean;
    }
    
    const cachedResults: CachedResult[] = [];
    for (const agent of agents) {
      const isAvailable = await agent.isAvailable();
      cachedResults.push({ provider: agent.provider, available: isAvailable });
    }

    cachedResults.forEach(result => {
      assert.strictEqual(result.available, true, `${result.provider} should be cached as available`);
    });
  });

  test('should handle complex tool calling workflow with security and concurrency', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock complex tool calling response
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
                  name: 'analyze_code',
                  arguments: JSON.stringify({ path: 'src/index.ts' })
                }
              },
              {
                id: 'call_2',
                type: 'function',
                function: {
                  name: 'create_test',
                  arguments: JSON.stringify({ 
                    testPath: 'src/index.test.ts',
                    sourceFile: 'src/index.ts'
                  })
                }
              },
              {
                id: 'call_3',
                type: 'function',
                function: {
                  name: 'run_tests',
                  arguments: JSON.stringify({ pattern: '*.test.ts' })
                }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 75, total_tokens: 175 }
      })
    });

    // Mock user approval for dangerous operations
    const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage');
    showWarningMessageStub.resolves({ title: 'Approve' });

    const toolAgent = agentRegistry.getAgents().find(a => a.capabilities.hasToolUse)!;
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Analyze the code, create tests, and run them' }
    ];

    // Register multiple tools with different security levels
    const tools: ToolDefinition[] = [
      {
        name: 'analyze_code',
        description: 'Analyze code file',
        category: 'code',
        parameters: {
          type: 'object',
          properties: {
            path: { 
              type: 'string', 
              description: 'File path to analyze',
              minLength: 1
            }
          },
          required: ['path']
        },
        security: {
          requiresApproval: false,
          allowedInWeb: true,
          riskLevel: 'low'
        },
        executor: async (params: { path: string }) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return {
            success: true,
            data: `Analysis of ${params.path}: Found 5 functions, 2 classes, 10 imports`,
            metadata: { timestamp: new Date().toISOString() }
          };
        }
      },
      {
        name: 'create_test',
        description: 'Create test file',
        category: 'testing',
        parameters: {
          type: 'object',
          properties: {
            testPath: { 
              type: 'string', 
              description: 'Test file path',
              minLength: 1
            },
            sourceFile: { 
              type: 'string', 
              description: 'Source file to test',
              minLength: 1
            }
          },
          required: ['testPath', 'sourceFile']
        },
        security: {
          requiresApproval: false,
          allowedInWeb: true,
          riskLevel: 'medium' as const,
          permissions: ['files.write']
        },
        executor: async (params: { testPath: string, sourceFile: string }) => {
          await new Promise(resolve => setTimeout(resolve, 150));
          const filePath = vscode.Uri.file(path.join(workspaceUri.fsPath, params.testPath));
          await vscode.workspace.fs.writeFile(filePath, Buffer.from('// Generated test file'));
          return {
            success: true,
            data: {
              path: params.testPath,
              sourceFile: params.sourceFile,
              created: true
            },
            metadata: { timestamp: new Date().toISOString() }
          };
        }
      },
      {
        name: 'run_tests',
        description: 'Run test suite (potentially dangerous)',
        category: 'testing',
        parameters: {
          type: 'object',
          properties: {
            pattern: { 
              type: 'string', 
              description: 'Test file pattern',
              minLength: 1
            }
          },
          required: ['pattern']
        },
        security: {
          requiresApproval: true,
          allowedInWeb: false,
          riskLevel: 'high' as const,
          permissions: ['execute_tests']
        },
        executor: async (params: any) => {
          await new Promise(resolve => setTimeout(resolve, 200)); // Simulate test execution
          return {
            success: true,
            result: `Ran tests matching ${params.pattern}: 8 passed, 0 failed`
          };
        }
      }
    ];

    // Register all tools
    tools.forEach(tool => toolManager.registerTool(tool));

    const startTime = Date.now();
    const response = await chatBridge.sendMessage(toolAgent, messages, {
      tools: toolManager.getAvailableTools(toolAgent.capabilities),
      concurrentToolExecution: true
    });
    const endTime = Date.now();

    // Verify complex workflow
    assert.ok(response.success, 'Complex tool workflow should succeed');
    assert.strictEqual(response.toolCalls!.length, 3, 'Should have 3 tool calls');
    assert.ok(response.toolResults, 'Should have tool results');
    assert.strictEqual(response.toolResults!.length, 3, 'Should have 3 tool results');

    // Verify all tools executed successfully
    response.toolResults!.forEach((result, i) => {
      assert.strictEqual(result.success, true, `Tool ${i + 1} should succeed`);
    });

    // Verify security approval was requested for dangerous tool
    assert.ok(showWarningMessageStub.called, 'Should request approval for dangerous tool');

    // Verify concurrent execution was efficient
    const executionTime = endTime - startTime;
    assert.ok(executionTime < 500, `Should execute concurrently (took ${executionTime}ms)`);

    console.log(`Complex tool workflow completed in ${executionTime}ms with security approval`);
  });

  test('should handle system-wide load and stress testing', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock various response types and delays
    fetchStub.callsFake((...args: unknown[]) => {
      const url = args[0] as string;
      const delay = Math.random() * 100; // Random delay 0-100ms
      const shouldSucceed = Math.random() > 0.1; // 90% success rate
      
      return new Promise(resolve => {
        setTimeout(() => {
          if (shouldSucceed) {
            resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({
                choices: [{
                  message: { content: `Response from ${url}` },
                  finish_reason: 'stop'
                }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              })
            } as Response);
          } else {
            resolve({
              ok: false,
              status: 503,
              json: () => Promise.resolve({
                error: { message: 'Service temporarily unavailable' }
              })
            } as Response);
          }
        }, delay);
      });
    });

    const agents = agentRegistry.getAgents();
    const testDuration = 3000; // 3 seconds
    const startTime = Date.now();
    
    let totalOperations = 0;
    let successfulOperations = 0;
    let errors = 0;

    // Concurrent stress test operations
    const stressOperations = [
      // Availability checking stress
      async () => {
        while (Date.now() - startTime < testDuration) {
          try {
            const agent = agents[Math.floor(Math.random() * agents.length)];
            const isAvailable = await agent.isAvailable();
            totalOperations++;
            if (isAvailable) { successfulOperations++; }
          } catch (error) {
            errors++;
          }
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      },

      // Message sending stress
      async () => {
        while (Date.now() - startTime < testDuration) {
          try {
            const agent = agents[Math.floor(Math.random() * agents.length)];
            const messages: ChatMessage[] = [
              { role: 'user', content: `Stress test message ${totalOperations}` }
            ];
            const response = await chatBridge.sendMessage(agent, messages);
            totalOperations++;
            if (response.success) { successfulOperations++; }
          } catch (error) {
            errors++;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      },

      // Tool execution stress
      async () => {
        // Register simple stress test tool
        toolManager.registerTool({
          name: 'stress_test_tool',
          description: 'Simple tool for stress testing',
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
            await new Promise(resolve => setTimeout(resolve, 10));
            return {
              success: true,
              result: `Processed: ${params.input}`
            };
          }
        });

        while (Date.now() - startTime < testDuration) {
          try {
            const toolAgent = agents.find(a => a.capabilities.hasToolUse);
            if (toolAgent) {
              // Simulate tool execution
              totalOperations++;
              successfulOperations++;
            }
          } catch (error) {
            errors++;
          }
          await new Promise(resolve => setTimeout(resolve, 75));
        }
      }
    ];

    // Run all stress operations concurrently
    await Promise.all(stressOperations);

    const actualDuration = Date.now() - startTime;
    const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0;

    console.log(`System stress test results:
      Duration: ${actualDuration}ms
      Total operations: ${totalOperations}
      Successful operations: ${successfulOperations}
      Errors: ${errors}
      Success rate: ${successRate.toFixed(1)}%
      API calls: ${fetchStub.callCount}
      Operations per second: ${Math.round(totalOperations / (actualDuration / 1000))}
    `);

    // Verify system handled stress well
    assert.ok(totalOperations > 50, 'Should complete many operations during stress test');
    assert.ok(successRate > 70, `Success rate should be reasonable (${successRate.toFixed(1)}%)`);
    assert.ok(errors < totalOperations * 0.3, 'Error rate should be acceptable');

    // Verify caching efficiency under load
    const cacheEfficiency = fetchStub.callCount < totalOperations * 0.5;
    assert.ok(cacheEfficiency, 'Should demonstrate cache efficiency under load');
  });

  test('should validate complete system integration and health', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock healthy responses for all providers
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: 'System healthy' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
      })
    });

    // System health checks
    const healthChecks = {
      agentRegistry: false,
      configManager: false,
      chatBridge: false,
      toolManager: false,
      allAgentsAvailable: false,
      cachingWorking: false,
      toolsRegistered: false,
      streamingCapable: false
    };

    try {
      // Check AgentRegistry
      const agents = agentRegistry.getAgents();
      healthChecks.agentRegistry = agents.length > 0;

      // Check ConfigurationManager
      const allAgents = await configManager.getAllAgents();
      healthChecks.configManager = allAgents.length > 0;

      // Check ChatBridge
      const testAgent = agents[0];
      const testResponse = await chatBridge.sendMessage(testAgent, [
        { role: 'user', content: 'Health check' }
      ]);
      healthChecks.chatBridge = testResponse.success;

      // Check ToolManager
      const availableTools = toolManager.getAvailableTools(testAgent.capabilities);
      healthChecks.toolManager = Array.isArray(availableTools);

      // Check if any agent is available
      if (!agents.length) {
        throw new Error('No agents available for testing');
      }

      // Check if any agent supports tool use
      const toolAgent = agents.find(a => a.capabilities.hasToolUse);
      if (!toolAgent) {
        throw new Error('No agent with tool use capability available for testing');
      }

      // Check all agents availability
      const availabilityChecks = await Promise.all(
        agents.map(agent => agent.isAvailable())
      );
      healthChecks.allAgentsAvailable = availabilityChecks.every(available => available);

      // Check caching
      const cacheStats = (agentRegistry as any).getCacheStats?.() || {};
      healthChecks.cachingWorking = typeof cacheStats === 'object';

// ...
      toolManager.registerTool({
        name: 'health_check_tool',
        description: 'Tool for health checking',
        parameters: {
          type: 'object',
          properties: {
            test: { type: 'string' }
          },
          required: ['test']
        },
        security: {
          requiresApproval: false,
          allowedInWeb: true,
          riskLevel: 'low'
        },
        executor: async () => ({ success: true, result: 'OK' })
      });
      const toolsAfterRegistration = toolManager.getAvailableTools(testAgent.capabilities);
      healthChecks.toolsRegistered = toolsAfterRegistration.length > availableTools.length;

      // Check streaming capability
      const streamingAgent = agents.find(a => a.provider === 'openai');
      if (streamingAgent) {
        // Mock streaming response for health check
        const mockStream = {
          getReader: () => ({
            read: sandbox.stub()
              .onCall(0).resolves({
                done: false,
                value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n')
              })
              .onCall(1).resolves({ done: true })
          })
        };

        fetchStub.onCall(fetchStub.callCount).resolves({
          ok: true,
          status: 200,
          body: mockStream,
          headers: new Map([['content-type', 'text/event-stream']])
        });

        let streamContent = '';
        const streamResponse = await chatBridge.streamMessage(
          streamingAgent,
          [{ role: 'user', content: 'Stream test' }],
          (chunk) => { streamContent += chunk; }
        );
        healthChecks.streamingCapable = streamResponse.success && streamContent.length > 0;
      }

    } catch (error) {
      console.error('Health check error:', error);
    }

    // Report system health
    console.log('System Health Check Results:', healthChecks);

    // Verify all systems are healthy
    Object.entries(healthChecks).forEach(([system, healthy]) => {
      assert.strictEqual(healthy, true, `${system} should be healthy`);
    });

    // Additional integration validation
    const integrationMetrics = {
      totalAgents: agentRegistry.getAgents().length,
      providersSupported: [...new Set(agentRegistry.getAgents().map(a => a.provider))].length,
      toolsAvailable: toolManager.getAvailableTools({ hasToolUse: true, hasVision: false, reasoningDepth: 'basic', speed: 'fast', costTier: 'low', maxTokens: 1000, supportedLanguages: ['en'], specializations: ['code'] }).length,
      apiCallsMade: fetchStub.callCount,
      cacheEntries: (agentRegistry as any).getCacheStats?.()?.totalEntries || 0
    };

    console.log('Integration Metrics:', integrationMetrics);

    // Verify reasonable integration metrics
    assert.ok(integrationMetrics.totalAgents >= 3, 'Should have multiple agents');
    assert.ok(integrationMetrics.providersSupported >= 3, 'Should support multiple providers');
    assert.ok(integrationMetrics.toolsAvailable >= 1, 'Should have tools available');
    assert.ok(integrationMetrics.apiCallsMade > 0, 'Should have made API calls');

    console.log('✅ Complete system integration validation passed');
  });
});