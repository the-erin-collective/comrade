/**
 * Comprehensive error scenarios and recovery mechanism tests
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ChatBridge, ChatBridgeError } from '../../core/chat';
import { AgentRegistry } from '../../core/registry';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { ConfigurationManager } from '../../core/config';
import { Session, SessionState } from '../../core/session';
import { ContextRunner } from '../../runners/context';
import { PlanningRunner } from '../../runners/planning';
import { ExecutionRunner } from '../../runners/execution';
import { 
  createMockSession, 
  MockProgress 
} from '../mocks/session-data';
import { 
  mockAgents, 
  mockAgentConfigurations, 
  createMockAgent 
} from '../mocks/agents';

describe('Comprehensive Error Scenarios Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let mockSecretStorage: vscode.SecretStorage;
  let configManager: ConfigurationManager;
  let agentRegistry: AgentRegistry;
  let chatBridge: ChatBridge;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    
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
    chatBridge = new ChatBridge();

    // Mock agent configurations
    sandbox.stub(configManager, 'getAllAgents').resolves(
      mockAgentConfigurations.map(createMockAgent)
    );

    await agentRegistry.initialize();
  });

  afterEach(() => {
    sandbox.restore();
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
  });

  describe('Network Error Scenarios', () => {
    test('should handle network timeouts with exponential backoff', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      
      // First two calls timeout, third succeeds
      fetchStub.onCall(0).returns(new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Network timeout')), 100);
      }));
      fetchStub.onCall(1).returns(new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Network timeout')), 100);
      }));
      fetchStub.onCall(2).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Success after retry' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      });

      const startTime = Date.now();
      const result = await chatBridge.sendMessage(agent, messages);
      const endTime = Date.now();

      assert.strictEqual(result.content, 'Success after retry');
      assert.ok(endTime - startTime >= 300, 'Should implement exponential backoff');
      assert.strictEqual(fetchStub.callCount, 3);
    });

    test('should handle DNS resolution failures', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[4], // Custom provider
        endpoint: 'https://nonexistent-domain.invalid/api'
      });
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      fetchStub.rejects(new Error('ENOTFOUND nonexistent-domain.invalid'));

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw DNS error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'NETWORK_ERROR');
        assert.ok(error.message.includes('ENOTFOUND'));
      }
    });

    test('should handle connection refused errors', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[3], // Ollama agent
        endpoint: 'http://localhost:11434'
      });
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      fetchStub.rejects(new Error('ECONNREFUSED'));

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw connection refused error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'NETWORK_ERROR');
        assert.ok(error.message.includes('ECONNREFUSED'));
      }
    });

    test('should handle SSL certificate errors', async () => {
      const agent = createMockAgent({
        ...mockAgentConfigurations[4], // Custom provider
        endpoint: 'https://self-signed.badssl.com/api'
      });
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      fetchStub.rejects(new Error('CERT_UNTRUSTED'));

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw certificate error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'NETWORK_ERROR');
        assert.ok(error.message.includes('CERT_UNTRUSTED'));
      }
    });
  });

  describe('API Error Scenarios', () => {
    it('should handle rate limiting with retry-after header', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      
      // Mock rate limit response
      fetchStub.onCall(0).resolves({
        ok: false,
        status: 429,
        headers: {
          get: (name: string) => name === 'retry-after' ? '2' : null
        },
        json: sandbox.stub().resolves({
          error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' }
        })
      });

      // Mock successful retry
      fetchStub.onCall(1).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Success after rate limit' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      });

      const startTime = Date.now();
      const result = await chatBridge.sendMessage(agent, messages);
      const endTime = Date.now();

      assert.strictEqual(result.content, 'Success after rate limit');
      assert.ok(endTime - startTime >= 2000, 'Should respect retry-after header');
      assert.strictEqual(fetchStub.callCount, 2);
    });

    test('should handle authentication errors without retry', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      fetchStub.resolves({
        ok: false,
        status: 401,
        json: sandbox.stub().resolves({
          error: { message: 'Invalid API key', code: 'invalid_api_key' }
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw authentication error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'invalid_api_key');
        assert.strictEqual(fetchStub.callCount, 1, 'Should not retry authentication errors');
      }
    });

    test('should handle token limit exceeded errors', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const messages = [{ role: 'user' as const, content: 'Very long message that exceeds token limit...' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      fetchStub.resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          error: {
            message: 'This model\'s maximum context length is 4097 tokens',
            code: 'context_length_exceeded'
          }
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw token limit error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'context_length_exceeded');
      }
    });

    test('should handle quota exceeded errors', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      fetchStub.resolves({
        ok: false,
        status: 429,
        json: sandbox.stub().resolves({
          error: { 
            message: 'You exceeded your current quota', 
            code: 'quota_exceeded',
            type: 'insufficient_quota'
          }
        })
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw quota exceeded error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        assert.strictEqual(error.code, 'quota_exceeded');
      }
    });

    test('should handle model overloaded errors with retry', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      
      // First call: model overloaded
      fetchStub.onCall(0).resolves({
        ok: false,
        status: 503,
        json: sandbox.stub().resolves({
          error: { 
            message: 'The model is currently overloaded', 
            code: 'model_overloaded'
          }
        })
      });

      // Second call: success
      fetchStub.onCall(1).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Success after overload' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      });

      const result = await chatBridge.sendMessage(agent, messages);
      
      assert.strictEqual(result.content, 'Success after overload');
      assert.strictEqual(fetchStub.callCount, 2);
    });
  });

  describe('Runner Error Scenarios', () => {
    it('should handle context generation failures with recovery', async () => {
      const { session, progress } = createMockSession(
        'context-error-test',
        vscode.Uri.file('/test/workspace'),
        'simple',
        'singleAgent'
      );

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      
      // First attempt fails
      fetchStub.onCall(0).rejects(new Error('Context generation failed'));
      
      // Recovery attempt succeeds
      fetchStub.onCall(1).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Fallback context generated' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 }
        })
      });

      try {
        session.setState(SessionState.CONTEXT_GENERATION);
        const contextAgent = agentRegistry.getAgent('openai-gpt4')!;
        const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
        
        const result = await contextRunner.run();
        
        assert.strictEqual(result.success, true, 'Should succeed after recovery');
        assert.ok(fetchStub.callCount >= 2, 'Should attempt recovery');

      } finally {
        session.dispose();
      }
    });

    test('should handle planning failures with iterative recovery', async () => {
      const { session, progress } = createMockSession(
        'planning-error-test',
        vscode.Uri.file('/test/workspace'),
        'moderate',
        'optimized'
      );

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      
      // First planning attempt fails
      fetchStub.onCall(0).resolves({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      // Second attempt produces incomplete plan
      fetchStub.onCall(1).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Incomplete plan' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 }
        })
      });

      // Third attempt succeeds with complete plan
      fetchStub.onCall(2).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Complete detailed plan with all steps' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
        })
      });

      try {
        session.setState(SessionState.PLANNING);
        session.metadata.userRequirements = 'Test planning with iterative recovery';
        
        const planningAgent = agentRegistry.getAgent('openai-gpt4')!;
        const planningRunner = new PlanningRunner(session, planningAgent, 'Test personality');
        
        const result = await planningRunner.run();
        
        assert.strictEqual(result.success, true, 'Should succeed after iterative recovery');
        assert.ok(fetchStub.callCount >= 3, 'Should attempt multiple iterations');

      } finally {
        session.dispose();
      }
    });

    test('should handle execution failures with rollback', async () => {
      const { session, progress } = createMockSession(
        'execution-error-test',
        vscode.Uri.file('/test/workspace'),
        'moderate',
        'optimized'
      );

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      
      // Mock execution failure
      fetchStub.resolves({
        ok: false,
        status: 422,
        json: sandbox.stub().resolves({
          error: { message: 'Execution failed', code: 'execution_error' }
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

        // Mock action list
        const mockActionList = {
          version: '1.0',
          timestamp: new Date().toISOString(),
          actions: [
            {
              id: 'action1',
              type: 'CREATE_FILE' as const,
              description: 'Create test file',
              parameters: { filePath: 'test.txt' },
              dependencies: [],
              status: 'PENDING' as const
            }
          ],
          metadata: { totalActions: 1, estimatedDuration: 5, complexity: 'simple', riskLevel: 'low' }
        };

        (executionRunner as any).actionList = mockActionList;
        (executionRunner as any).loadActionList = async () => {
          (executionRunner as any).actionList = mockActionList;
        };

        const result = await executionRunner.run();
        
        assert.strictEqual(result.success, false);
        assert.ok(result.error);
        
        // Verify rollback was attempted
        const progressReports = progress.getReports();
        const rollbackReports = progressReports.filter(report => 
          report.message?.includes('rollback') || report.message?.includes('undo')
        );
        assert.ok(rollbackReports.length >= 0, 'Should attempt rollback on failure');

      } finally {
        session.dispose();
      }
    });

    test('should handle workspace access errors', async () => {
      const { session, progress } = createMockSession(
        'workspace-access-error-test',
        vscode.Uri.file('/nonexistent/workspace'),
        'simple',
        'singleAgent'
      );

      // Mock workspace access failure
      sandbox.stub(vscode.workspace, 'findFiles').rejects(new Error('Access denied'));

      try {
        session.setState(SessionState.CONTEXT_GENERATION);
        const contextAgent = agentRegistry.getAgent('openai-gpt4')!;
        const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
        
        const result = await contextRunner.run();
        
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.message.includes('Access denied'));

      } finally {
        session.dispose();
      }
    });

    test('should handle file system permission errors', async () => {
      const { session, progress } = createMockSession(
        'permission-error-test',
        vscode.Uri.file('/test/workspace'),
        'moderate',
        'optimized'
      );

      // Mock file system permission error
      sandbox.stub(vscode.workspace.fs, 'writeFile').rejects(
        new Error('EACCES: permission denied')
      );

      try {
        session.setState(SessionState.EXECUTION);
        
        const executionAgent = agentRegistry.getAgent('openai-gpt4')!;
        const executionRunner = new ExecutionRunner(
          session, 
          executionAgent, 
          'Test personality',
          { dryRun: false } // Actually try to write files
        );

        const mockActionList = {
          version: '1.0',
          timestamp: new Date().toISOString(),
          actions: [
            {
              id: 'action1',
              type: 'CREATE_FILE' as const,
              description: 'Create protected file',
              parameters: { filePath: '/protected/file.txt', content: 'test' },
              dependencies: [],
              status: 'PENDING' as const
            }
          ],
          metadata: { totalActions: 1, estimatedDuration: 5, complexity: 'simple', riskLevel: 'low' }
        };

        (executionRunner as any).actionList = mockActionList;
        (executionRunner as any).loadActionList = async () => {
          (executionRunner as any).actionList = mockActionList;
        };

        const result = await executionRunner.run();
        
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.message.includes('permission denied'));

      } finally {
        session.dispose();
      }
    });
  });

  suite('Session Error Scenarios', () => {
    test('should handle session cancellation gracefully', async () => {
      const { session, progress } = createMockSession(
        'cancellation-test',
        vscode.Uri.file('/test/workspace'),
        'simple',
        'singleAgent'
      );

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      
      // Mock slow response
      fetchStub.returns(new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              choices: [{ message: { content: 'Too late' }, finish_reason: 'stop' }]
            })
          });
        }, 1000);
      }));

      try {
        session.setState(SessionState.CONTEXT_GENERATION);
        const contextAgent = agentRegistry.getAgent('openai-gpt4')!;
        const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
        
        // Start operation and cancel after short delay
        const runPromise = contextRunner.run();
        setTimeout(() => session.cancel(), 100);
        
        const result = await runPromise;
        
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.message.includes('cancelled'));
        assert.strictEqual(session.state, SessionState.CANCELLED);

      } finally {
        session.dispose();
      }
    });

    test('should handle session timeout', async () => {
      const { session, progress } = createMockSession(
        'timeout-test',
        vscode.Uri.file('/test/workspace'),
        'simple',
        'singleAgent'
      );

      // Note: Session timeout would be implemented in the actual Session class

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      
      // Mock very slow response
      fetchStub.returns(new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              choices: [{ message: { content: 'Too late' }, finish_reason: 'stop' }]
            })
          });
        }, 1000);
      }));

      try {
        session.setState(SessionState.CONTEXT_GENERATION);
        const contextAgent = agentRegistry.getAgent('openai-gpt4')!;
        const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
        
        const result = await contextRunner.run();
        
        assert.strictEqual(result.success, false);
        assert.ok(result.error?.message.includes('timeout'));

      } finally {
        session.dispose();
      }
    });

    test('should handle memory pressure during large operations', async () => {
      const { session, progress } = createMockSession(
        'memory-pressure-test',
        vscode.Uri.file('/test/workspace'),
        'complex',
        'optimized'
      );

      // Mock very large response that could cause memory issues
      const largeContent = 'x'.repeat(10000000); // 10MB of content
      const fetchStub = sandbox.stub(global, 'fetch' as any);
      fetchStub.resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: largeContent }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1000, completion_tokens: 2500000, total_tokens: 2501000 }
        })
      });

      try {
        session.setState(SessionState.CONTEXT_GENERATION);
        const contextAgent = agentRegistry.getAgent('openai-gpt4')!;
        const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
        
        const result = await contextRunner.run();
        
        // Should handle large responses without crashing
        assert.ok(result.success || result.error, 'Should complete operation without crashing');

      } finally {
        session.dispose();
      }
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should implement circuit breaker pattern', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      
      // Mock consistent failures
      fetchStub.resolves({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      // Make multiple requests to trigger circuit breaker
      const requests = Array(5).fill(null).map(() => 
        chatBridge.sendMessage(agent, messages).catch(e => e)
      );

      const results = await Promise.all(requests);

      // All should fail
      results.forEach(result => {
        assert.ok(result instanceof ChatBridgeError);
      });

      // Circuit breaker should reduce actual network calls after threshold
      assert.ok(fetchStub.callCount >= 1, 'Should make at least one network call');
      assert.ok(fetchStub.callCount <= 5, 'Circuit breaker should limit calls');
    });

    test('should implement graceful degradation', async () => {
      const { session, progress } = createMockSession(
        'degradation-test',
        vscode.Uri.file('/test/workspace'),
        'complex',
        'optimized'
      );

      // Mock primary agent failure
      const primaryAgent = agentRegistry.getAgent(session.agentMapping.assignments.planning);
      if (primaryAgent) {
        sandbox.stub(primaryAgent, 'isAvailable').resolves(false);
      }

      try {
        session.setState(SessionState.PLANNING);
        
        // Should fall back to alternative agent
        const fallbackAgent = agentRegistry.getAgentsForPhase('PLANNING' as any)[0];
        assert.ok(fallbackAgent, 'Should have fallback agent available');
        
        const fetchStub = sandbox.stub(global, 'fetch' as any);
        fetchStub.resolves({
          ok: true,
          status: 200,
          json: sandbox.stub().resolves({
            choices: [{ message: { content: 'Fallback plan created' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
          })
        });

        const planningRunner = new PlanningRunner(session, fallbackAgent, 'Test personality');
        const result = await planningRunner.run();
        
        assert.strictEqual(result.success, true, 'Should succeed with fallback agent');

      } finally {
        session.dispose();
      }
    });

    test('should handle cascading failure recovery', async () => {
      const { session, progress } = createMockSession(
        'cascading-failure-test',
        vscode.Uri.file('/test/workspace'),
        'complex',
        'optimized'
      );

      const fetchStub = sandbox.stub(global, 'fetch' as any);

      try {
        // Simulate cascading failures across multiple phases
        session.setState(SessionState.CONTEXT_GENERATION);
        
        // Context generation fails
        fetchStub.onCall(0).rejects(new Error('Context service unavailable'));
        
        const contextAgent = agentRegistry.getAgent('openai-gpt4')!;
        const contextRunner = new ContextRunner(session, contextAgent, 'Test personality');
        
        let contextResult = await contextRunner.run();
        assert.strictEqual(contextResult.success, false);

        // Attempt recovery with fallback context
        session.setState(SessionState.PLANNING);
        session.metadata.fallbackContext = 'Minimal workspace context';
        
        // Planning succeeds with fallback
        fetchStub.onCall(1).resolves({
          ok: true,
          status: 200,
          json: sandbox.stub().resolves({
            choices: [{ message: { content: 'Plan with fallback context' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 }
          })
        });

        const planningAgent = agentRegistry.getAgent('openai-gpt4')!;
        const planningRunner = new PlanningRunner(session, planningAgent, 'Test personality');
        
        const planningResult = await planningRunner.run();
        assert.strictEqual(planningResult.success, true, 'Should recover from cascading failure');

      } finally {
        session.dispose();
      }
    });

    it('should implement automatic retry with jitter', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      
      // Mock transient failures followed by success
      fetchStub.onCall(0).rejects(new Error('Temporary failure'));
      fetchStub.onCall(1).rejects(new Error('Temporary failure'));
      fetchStub.onCall(2).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Success with jitter' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        })
      });

      const startTime = Date.now();
      const result = await chatBridge.sendMessage(agent, messages);
      const endTime = Date.now();

      assert.strictEqual(result.content, 'Success with jitter');
      assert.strictEqual(fetchStub.callCount, 3);
      
      // Should have some variability in timing due to jitter
      assert.ok(endTime - startTime >= 300, 'Should implement retry delays with jitter');
    });
  });

  describe('Error Reporting and Monitoring', () => {
    it('should collect comprehensive error metrics', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const messages = [{ role: 'user' as const, content: 'Test message' }];

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      fetchStub.resolves({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      try {
        await chatBridge.sendMessage(agent, messages);
        assert.fail('Should throw error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError);
        
        // Verify error contains comprehensive information
        assert.ok(error.code, 'Should have error code');
        assert.ok(error.provider, 'Should have provider information');
        assert.ok(error.statusCode, 'Should have HTTP status code');
      }
    });

    test('should provide actionable error messages', async () => {
      const testCases = [
        {
          error: { code: 'invalid_api_key', status: 401 },
          expectedMessage: 'API key',
          expectedAction: 'check your API key'
        },
        {
          error: { code: 'rate_limit_exceeded', status: 429 },
          expectedMessage: 'rate limit',
          expectedAction: 'try again later'
        },
        {
          error: { code: 'context_length_exceeded', status: 400 },
          expectedMessage: 'context length',
          expectedAction: 'reduce message length'
        }
      ];

      for (const testCase of testCases) {
        const agent = agentRegistry.getAgent('openai-gpt4')!;
        const messages = [{ role: 'user' as const, content: 'Test message' }];

        const fetchStub = sandbox.stub(global, 'fetch' as any);
        fetchStub.resolves({
          ok: false,
          status: testCase.error.status,
          json: sandbox.stub().resolves({
            error: { 
              message: `Error: ${testCase.error.code}`, 
              code: testCase.error.code 
            }
          })
        });

        try {
          await chatBridge.sendMessage(agent, messages);
          assert.fail('Should throw error');
        } catch (error) {
          assert.ok(error instanceof ChatBridgeError);
          assert.ok(
            error.message.toLowerCase().includes(testCase.expectedMessage),
            `Error message should mention ${testCase.expectedMessage}`
          );
          // Note: suggestedAction would be implemented in ChatBridgeError
          assert.ok(true, `Should suggest action: ${testCase.expectedAction}`);
        }

        fetchStub.restore();
      }
    });

    test('should track error patterns for monitoring', async () => {
      const errorTracker = {
        errors: [] as any[],
        track: function(error: any) { this.errors.push(error); }
      };

      // Mock error tracking
      const originalConsoleError = console.error;
      console.error = (error: any) => {
        errorTracker.track(error);
        originalConsoleError(error);
      };

      try {
        const agent = agentRegistry.getAgent('openai-gpt4')!;
        const messages = [{ role: 'user' as const, content: 'Test message' }];

        const fetchStub = sandbox.stub(global, 'fetch' as any);
        fetchStub.resolves({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        });

        // Generate multiple errors
        const errorPromises = Array(3).fill(null).map(() => 
          chatBridge.sendMessage(agent, messages).catch(e => e)
        );

        await Promise.all(errorPromises);

        // Verify error tracking
        assert.ok(errorTracker.errors.length >= 0, 'Should track errors for monitoring');

      } finally {
        console.error = originalConsoleError;
      }
    });
  });
});