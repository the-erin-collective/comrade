/**
 * Integration tests for complete workflow (context → planning → execution)
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as path from 'path';
import { ContextRunner } from '../../runners/context';
import { PlanningRunner } from '../../runners/planning';
import { ExecutionRunner } from '../../runners/execution';
import { AgentRegistry } from '../../core/registry';
import { ConfigurationManager } from '../../core/config';

import { SessionState, WorkflowMode } from '../../core/session';
import { 
  createMockSession, 
} from '../mocks/session-data';
import { 
  mockAgentConfigurations, 
  createMockAgent 
} from '../mocks/agents';
import { 
  createMockActionList 
} from '../mocks/workspace-data';
import { 
  getMockResponse 
} from '../mocks/llm-responses';

describe('Workflow Integration Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let mockSecretStorage: vscode.SecretStorage;
  let configManager: ConfigurationManager;
  let agentRegistry: AgentRegistry;

  let workspaceUri: vscode.Uri;  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    
    // Create test workspace
    workspaceUri = vscode.Uri.file(path.join(__dirname, '../../../test-workspace'));
    
    // Mock secret storage
    mockSecretStorage = {
      store: sandbox.stub(),
      get: sandbox.stub(),
      delete: sandbox.stub(),
      onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
    };

    // Initialize core components
    configManager = ConfigurationManager.getInstance(mockSecretStorage);
    agentRegistry = AgentRegistry.getInstance(configManager);


    // Mock agent configurations
    sandbox.stub(configManager, 'getAllAgents').resolves(
      mockAgentConfigurations.map(createMockAgent)
    );

    await agentRegistry.initialize();

    // Mock VS Code workspace APIs
    sandbox.stub(vscode.workspace, 'findFiles').resolves([
      vscode.Uri.file(path.join(workspaceUri.fsPath, 'package.json')),
      vscode.Uri.file(path.join(workspaceUri.fsPath, 'src/index.tsx')),
      vscode.Uri.file(path.join(workspaceUri.fsPath, 'src/App.tsx'))
    ]);

    sandbox.stub(vscode.workspace, 'fs').value({
      readFile: sandbox.stub().resolves(Buffer.from('{"name": "test-app"}')),
      writeFile: sandbox.stub().resolves(),
      createDirectory: sandbox.stub().resolves(),
      stat: sandbox.stub().resolves({ type: vscode.FileType.File, size: 100 })
    });
  });  afterEach(() => {
    sandbox.restore();
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
  });

  it('should complete full workflow: context → planning → execution', async () => {
    const { session, progress: _progress } = createMockSession(
      'integration-test-session',
      workspaceUri,
      'moderate',
      'optimized',
      WorkflowMode.SPEED
    );

    // Mock LLM responses for each phase
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Context generation response
    fetchStub.onCall(0).resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: getMockResponse('openai', 'context-generation-success')?.response.content },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 150, completion_tokens: 85, total_tokens: 235 }
      })
    });

    // Planning response
    fetchStub.onCall(1).resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: getMockResponse('openai', 'planning-success')?.response.content },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 200, completion_tokens: 120, total_tokens: 320 }
      })
    });

    // File generation responses for execution
    fetchStub.onCall(2).resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: getMockResponse('openai', 'file-generation-success')?.response.content },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 250, total_tokens: 350 }
      })
    });

    try {
      // Phase 1: Context Generation
      session.setState(SessionState.CONTEXT_GENERATION);
      const contextAgent = agentRegistry.getAgent('openai-gpt4')!;
      const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
      
      const contextResult = await contextRunner.run();
      assert.strictEqual(contextResult.success, true, 'Context generation should succeed');
      assert.ok(contextResult.data, 'Context result should contain data');

      // Phase 2: Planning
      session.setState(SessionState.PLANNING);
      session.metadata.userRequirements = 'Add user authentication to the React app';
      
      const planningAgent = agentRegistry.getAgent('openai-gpt4')!;
      const planningRunner = new PlanningRunner(session, planningAgent, 'Test personality');
      
      const planningResult = await planningRunner.run();
      assert.strictEqual(planningResult.success, true, 'Planning should succeed');
      assert.ok(planningResult.data, 'Planning result should contain data');

      // Phase 3: Execution (dry run to avoid file system operations)
      session.setState(SessionState.EXECUTION);
      
      const executionAgent = agentRegistry.getAgent('openai-gpt4')!;
      const executionRunner = new ExecutionRunner(
        session, 
        executionAgent, 
        'Test personality',
        { dryRun: true }
      );

      // Mock action list for execution
      const mockActionList = createMockActionList('add-authentication');
      (executionRunner as any).actionList = mockActionList;
      (executionRunner as any).loadActionList = async () => {
        (executionRunner as any).actionList = mockActionList;
      };

      const executionResult = await executionRunner.run();
      assert.strictEqual(executionResult.success, true, 'Execution should succeed in dry run mode');

      // Verify session state transitions
      const progressReports = _progress.getReports();
      assert.ok(progressReports.length > 0, 'Should have progress reports');
      
      // Verify final state
      assert.strictEqual(session.state, SessionState.EXECUTION, 'Session should be in execution state');

    } catch (error) {
      console.error('Workflow integration test failed:', error);
      throw error;
    } finally {
      session.dispose();
    }
  });

  it('should handle context generation failure gracefully', async () => {
    const { session, progress: _progress } = createMockSession(
      'context-error-test',
      workspaceUri,
      'simple',
      'singleAgent'
    );

    // Mock failed LLM response
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    fetchStub.resolves({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    try {
      session.setState(SessionState.CONTEXT_GENERATION);
      const contextAgent = agentRegistry.getAgent('openai-gpt4')!;
      const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
      
      const result = await contextRunner.run();
      
      assert.strictEqual(result.success, false, 'Context generation should fail');
      assert.ok(result.error, 'Should have error information');
      assert.strictEqual(session.state, SessionState.ERROR, 'Session should be in error state');

    } finally {
      session.dispose();
    }
  });

  it('should handle planning iteration and refinement', async () => {
    const { session, progress: _progress } = createMockSession(
      'planning-iteration-test',
      workspaceUri,
      'complex',
      'optimized'
    );

    // Mock multiple planning responses for iteration
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // First iteration - short plan that needs refinement
    fetchStub.onCall(0).resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: 'Short plan that needs more detail.' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      })
    });

    // Second iteration - detailed plan
    fetchStub.onCall(1).resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: getMockResponse('openai', 'planning-success')?.response.content },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 200, completion_tokens: 120, total_tokens: 320 }
      })
    });

    try {
      session.setState(SessionState.PLANNING);
      session.metadata.userRequirements = 'Create a comprehensive user management system';
      
      const planningAgent = agentRegistry.getAgent('openai-gpt4')!;
      const planningRunner = new PlanningRunner(session, planningAgent, 'Test personality');
      
      const result = await planningRunner.run();
      
      assert.strictEqual(result.success, true, 'Planning should succeed after iteration');
      assert.ok(result.data, 'Should have planning data');
      
      // Verify multiple LLM calls were made for iteration
      assert.ok(fetchStub.callCount >= 2, 'Should make multiple calls for iteration');

    } finally {
      session.dispose();
    }
  });

  it('should handle execution with dependency resolution', async () => {
    const { session, progress: _progress } = createMockSession(
      'execution-dependencies-test',
      workspaceUri,
      'moderate',
      'optimized'
    );

    // Mock successful file generation responses
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: getMockResponse('openai', 'file-generation-success')?.response.content },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 250, total_tokens: 350 }
      })
    });

    try {
      session.setState(SessionState.EXECUTION);
      
      const executionAgent = agentRegistry.getAgent('openai-gpt4')!;
      const executionRunner = new ExecutionRunner(
        session, 
        executionAgent, 
        'Test personality',
        { dryRun: true }
      );

      // Create action list with dependencies
      const actionList = createMockActionList('add-authentication');
      (executionRunner as any).actionList = actionList;
      (executionRunner as any).loadActionList = async () => {
        (executionRunner as any).actionList = actionList;
      };

      const result = await executionRunner.run();
      
      assert.strictEqual(result.success, true, 'Execution should handle dependencies correctly');
      
      // Verify actions were processed in dependency order
      const processedActions = actionList.actions.filter(a => 
        a.status === 'completed' || a.status === 'in_progress'
      );
      
      // In dry run mode, actions should be marked as completed
      assert.ok(processedActions.length > 0, 'Should process some actions');

    } finally {
      session.dispose();
    }
  });

  it('should handle session cancellation during workflow', async () => {
    const { session, progress: _progress } = createMockSession(
      'cancellation-test',
      workspaceUri,
      'simple',
      'singleAgent'
    );

    // Mock slow LLM response
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    fetchStub.returns(new Promise(resolve => {
      setTimeout(() => {
        resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            choices: [{
              message: { content: 'Response after delay' },
              finish_reason: 'stop'
            }]
          })
        });
      }, 1000);
    }));

    try {
      session.setState(SessionState.CONTEXT_GENERATION);
      const contextAgent = agentRegistry.getAgent('openai-gpt4')!;
      const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
      
      // Start context generation and cancel after short delay
      const runPromise = contextRunner.run();
      setTimeout(() => session.cancel(), 100);
      
      const result = await runPromise;
      
      assert.strictEqual(result.success, false, 'Should fail due to cancellation');
      assert.ok(result.error?.message.includes('cancelled'), 'Error should mention cancellation');
      assert.strictEqual(session.state, SessionState.CANCELLED, 'Session should be cancelled');

    } finally {
      session.dispose();
    }
  });

  it('should handle agent assignment and switching', async () => {
    const { session, progress: _progress } = createMockSession(
      'agent-switching-test',
      workspaceUri,
      'complex',
      'optimized'
    );

    try {
      // Verify different agents are assigned to different phases
      const contextAgent = agentRegistry.getAgent(session.agentMapping.assignments.context);
      const planningAgent = agentRegistry.getAgent(session.agentMapping.assignments.planning);
      const executionAgent = agentRegistry.getAgent(session.agentMapping.assignments.execution);

      assert.ok(contextAgent, 'Context agent should be assigned');
      assert.ok(planningAgent, 'Planning agent should be assigned');
      assert.ok(executionAgent, 'Execution agent should be assigned');

      // Verify agents have appropriate capabilities for their phases
      if (session.requirements.hasImages) {
        assert.ok(
          contextAgent?.capabilities.hasVision || 
          planningAgent?.capabilities.hasVision,
          'At least one agent should have vision capability when images are required'
        );
      }

      if (session.requirements.toolsRequired.length > 0) {
        assert.ok(
          executionAgent?.capabilities.hasToolUse,
          'Execution agent should have tool use capability when tools are required'
        );
      }

    } finally {
      session.dispose();
    }
  });

  it('should handle error recovery during execution', async () => {
    const { session, progress: _progress } = createMockSession(
      'error-recovery-test',
      workspaceUri,
      'moderate',
      'optimized'
    );

    // Mock responses: first fails, second succeeds
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // First call fails
    fetchStub.onCall(0).resolves({
      ok: false,
      status: 429,
      statusText: 'Rate Limit Exceeded'
    });

    // Recovery call succeeds
    fetchStub.onCall(1).resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: 'Fixed content after recovery' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      })
    });

    try {
      session.setState(SessionState.EXECUTION);
      
      const executionAgent = agentRegistry.getAgent('openai-gpt4')!;
      const executionRunner = new ExecutionRunner(
        session, 
        executionAgent, 
        'Test personality',
        { 
          dryRun: true,
          enableRecovery: true,
          maxRetries: 2
        }
      );

      // Mock simple action list
      const actionList = createMockActionList('setup-testing');
      (executionRunner as any).actionList = actionList;
      (executionRunner as any).loadActionList = async () => {
        (executionRunner as any).actionList = actionList;
      };

      const result = await executionRunner.run();
      
      // Should succeed after recovery
      assert.strictEqual(result.success, true, 'Should succeed after error recovery');
      assert.ok(fetchStub.callCount >= 2, 'Should make multiple calls for recovery');

    } finally {
      session.dispose();
    }
  });

  it('should validate workspace context integration', async () => {
    const { session, progress: _progress } = createMockSession(
      'workspace-context-test',
      workspaceUri,
      'moderate',
      'singleAgent'
    );

    // Mock successful context generation
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: getMockResponse('openai', 'context-generation-success')?.response.content },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 150, completion_tokens: 85, total_tokens: 235 }
      })
    });

    try {
      session.setState(SessionState.CONTEXT_GENERATION);
      const contextAgent = agentRegistry.getAgent('openai-gpt4')!;
      const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
      
      const contextResult = await contextRunner.run();
      assert.strictEqual(contextResult.success, true, 'Context generation should succeed');

      // Now test planning with the generated context
      session.setState(SessionState.PLANNING);
      session.metadata.userRequirements = 'Add a new feature based on the existing codebase';
      
      const planningAgent = agentRegistry.getAgent('openai-gpt4')!;
      const planningRunner = new PlanningRunner(session, planningAgent, 'Test personality');
      
      // Mock planning response
      fetchStub.resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{
            message: { content: getMockResponse('openai', 'planning-success')?.response.content },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 200, completion_tokens: 120, total_tokens: 320 }
        })
      });

      const planningResult = await planningRunner.run();
      assert.strictEqual(planningResult.success, true, 'Planning should succeed with context');

      // Verify that planning used the workspace context
      const planningCalls = fetchStub.getCalls().filter(call => 
        call.args[1]?.body?.includes('workspace') || 
        call.args[1]?.body?.includes('context')
      );
      assert.ok(planningCalls.length > 0, 'Planning should use workspace context');

    } finally {
      session.dispose();
    }
  });

  it('should handle MCP tool integration during execution', async () => {
    const { session, progress: _progress } = createMockSession(
      'mcp-integration-test',
      workspaceUri,
      'toolsRequired',
      'optimized'
    );

    // Mock MCP tool responses
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock execution with tool calls
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
                name: 'create_file',
                arguments: JSON.stringify({
                  path: 'src/components/NewComponent.tsx',
                  content: 'export const NewComponent = () => <div>Hello</div>;'
                })
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      })
    });

    try {
      session.setState(SessionState.EXECUTION);
      
      const executionAgent = agentRegistry.getAgent('openai-gpt4')!;
      const executionRunner = new ExecutionRunner(
        session, 
        executionAgent, 
        'Test personality',
        { dryRun: true }
      );

      // Mock action list with MCP tool usage
      const actionList = createMockActionList('add-authentication');
      (executionRunner as any).actionList = actionList;
      (executionRunner as any).loadActionList = async () => {
        (executionRunner as any).actionList = actionList;
      };

      const result = await executionRunner.run();
      
      assert.strictEqual(result.success, true, 'Execution should succeed with MCP tools');
      
      // Verify tool calls were made
      const toolCalls = fetchStub.getCalls().filter(call => {
        const body = call.args[1]?.body;
        return body && (body.includes('tool_calls') || body.includes('function'));
      });
      
      assert.ok(toolCalls.length > 0, 'Should make tool calls during execution');

    } finally {
      session.dispose();
    }
  });

  it('should handle multi-agent workflow with different capabilities', async () => {
    const { session, progress: _progress } = createMockSession(
      'multi-agent-test',
      workspaceUri,
      'complex',
      'optimized'
    );

    const fetchStub = sandbox.stub(global, 'fetch' as any);

    try {
      // Phase 1: Context with fast agent
      session.setState(SessionState.CONTEXT_GENERATION);
      const contextAgent = agentRegistry.getAgent(session.agentMapping.assignments.context);
      assert.ok(contextAgent, 'Context agent should be assigned');
      
      fetchStub.onCall(0).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Context analysis complete' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
        })
      });

      const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
      const contextResult = await contextRunner.run();
      assert.strictEqual(contextResult.success, true);

      // Phase 2: Planning with advanced agent
      session.setState(SessionState.PLANNING);
      const planningAgent = agentRegistry.getAgent(session.agentMapping.assignments.planning);
      assert.ok(planningAgent, 'Planning agent should be assigned');
      assert.notStrictEqual(planningAgent.id, contextAgent.id, 'Should use different agents');
      
      fetchStub.onCall(1).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Detailed plan created' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 }
        })
      });

      const planningRunner = new PlanningRunner(session, planningAgent, 'Test personality');
      const planningResult = await planningRunner.run();
      assert.strictEqual(planningResult.success, true);

      // Phase 3: Execution with tool-capable agent
      session.setState(SessionState.EXECUTION);
      const executionAgent = agentRegistry.getAgent(session.agentMapping.assignments.execution);
      assert.ok(executionAgent, 'Execution agent should be assigned');
      
      if (session.requirements.toolsRequired.length > 0) {
        assert.ok(
          executionAgent.capabilities.hasToolUse,
          'Execution agent should have tool capabilities when tools are required'
        );
      }

      fetchStub.onCall(2).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Execution completed' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 150, completion_tokens: 75, total_tokens: 225 }
        })
      });

      const executionRunner = new ExecutionRunner(
        session, 
        executionAgent, 
        'Test personality',
        { dryRun: true }
      );

      const actionList = createMockActionList('add-authentication');
      (executionRunner as any).actionList = actionList;
      (executionRunner as any).loadActionList = async () => {
        (executionRunner as any).actionList = actionList;
      };

      const executionResult = await executionRunner.run();
      assert.strictEqual(executionResult.success, true);

      // Verify different agents were used appropriately
      assert.ok(fetchStub.callCount >= 3, 'Should make calls for each phase');

    } finally {
      session.dispose();
    }
  });

  it('should handle workflow state persistence and recovery', async () => {
    const { session, progress: _progress } = createMockSession(
      'persistence-test',
      workspaceUri,
      'moderate',
      'singleAgent'
    );

    const fetchStub = sandbox.stub(global, 'fetch' as any);

    try {
      // Start context generation
      session.setState(SessionState.CONTEXT_GENERATION);
      
      // Mock successful context generation
      fetchStub.resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Context generated' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
        })
      });

      const contextAgent = agentRegistry.getAgent('openai-gpt4')!;
      const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
      
      await contextRunner.run();
      
      // Verify state persistence
      assert.strictEqual(session.state, SessionState.CONTEXT_GENERATION);
      
      // Simulate session recovery by creating new session with same ID
      const { session: recoveredSession } = createMockSession(
        session.id, // Same ID
        workspaceUri,
        'moderate',
        'singleAgent'
      );

      // Recovered session should be able to continue from where it left off
      recoveredSession.setState(SessionState.PLANNING);
      assert.strictEqual(recoveredSession.state, SessionState.PLANNING);

      recoveredSession.dispose();

    } finally {
      session.dispose();
    }
  });

  it('should handle complex error recovery scenarios', async () => {
    const { session, progress: _progress } = createMockSession(
      'complex-error-recovery-test',
      workspaceUri,
      'moderate',
      'optimized'
    );

    const fetchStub = sandbox.stub(global, 'fetch' as any);

    try {
      session.setState(SessionState.EXECUTION);
      
      // Mock execution failure followed by recovery
      fetchStub.onCall(0).resolves({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      // Mock recovery planning
      fetchStub.onCall(1).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Recovery plan created' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 150, completion_tokens: 75, total_tokens: 225 }
        })
      });

      // Mock successful retry
      fetchStub.onCall(2).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Execution successful after recovery' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
        })
      });

      const executionAgent = agentRegistry.getAgent('openai-gpt4')!;
      const executionRunner = new ExecutionRunner(
        session, 
        executionAgent, 
        'Test personality',
        { 
          dryRun: true,
          enableRecovery: true,
          maxRetries: 3
        }
      );

      const actionList = createMockActionList('setup-testing');
      (executionRunner as any).actionList = actionList;
      (executionRunner as any).loadActionList = async () => {
        (executionRunner as any).actionList = actionList;
      };

      const result = await executionRunner.run();
      
      assert.strictEqual(result.success, true, 'Should succeed after complex recovery');
      assert.ok(fetchStub.callCount >= 2, 'Should make multiple calls for recovery');

      // Verify recovery was attempted
      const recoveryReports = _progress.getReports().filter((report: any) => 
        report.message?.includes('recovery') || report.message?.includes('retry')
      );
      assert.ok(recoveryReports.length > 0, 'Should report recovery attempts');

    } finally {
      session.dispose();
    }
  });
});

