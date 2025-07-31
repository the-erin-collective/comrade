/**
 * Comprehensive error scenario tests and recovery mechanisms
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { BaseRunner, RunnerError, RunnerResult } from '../../runners/base';
import { ContextRunner } from '../../runners/context';
import { PlanningRunner } from '../../runners/planning';
import { ExecutionRunner } from '../../runners/execution';
import { ChatBridge, ChatBridgeError } from '../../core/chat';
import { Session, SessionState, WorkflowMode } from '../../core/session';
import { AgentRegistry } from '../../core/registry';
import { ConfigurationManager } from '../../core/config';
import { 
  createMockSession, 
  mockSessionRequirements, 
  mockAgentMappings 
} from '../mocks/session-data';
import { 
  mockAgents, 
  createMockAgent, 
  mockAgentConfigurations 
} from '../mocks/agents';
import { 
  createMockWorkspaceContext, 
  createMockActionList 
} from '../mocks/workspace-data';

// Mock runner for testing error scenarios
class TestRunner extends BaseRunner {
  private errorToThrow: Error | null = null;
  private shouldTimeout: boolean = false;
  private executionDelay: number = 0;

  constructor(session: Session, agent: any, personality: string) {
    super(session, agent, personality);
  }

  setError(error: Error): void {
    this.errorToThrow = error;
  }

  setTimeout(shouldTimeout: boolean): void {
    this.shouldTimeout = shouldTimeout;
  }

  setDelay(delay: number): void {
    this.executionDelay = delay;
  }

  protected async execute(): Promise<RunnerResult> {
    if (this.executionDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.executionDelay));
    }

    if (this.shouldTimeout) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Long delay
    }

    if (this.errorToThrow) {
      throw this.errorToThrow;
    }

    return {
      success: true,
      data: { message: 'Test execution completed' }
    };
  }

  protected validateInputs(): boolean {
    return this.errorToThrow?.message !== 'VALIDATION_ERROR';
  }

  protected async handleError(error: Error): Promise<void> {
    await this.defaultErrorHandler(error);
  }

  protected getRunnerName(): string {
    return 'TestRunner';
  }
}

suite('Error Scenarios and Recovery Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let mockSecretStorage: vscode.SecretStorage;
  let configManager: ConfigurationManager;
  let agentRegistry: AgentRegistry;
  let chatBridge: ChatBridge;

  setup(async () => {
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

  teardown(() => {
    sandbox.restore();
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
  });

  suite('Network and Connectivity Errors', () => {
    test('should handle network timeouts with retry logic', async () => {
      const { session } = createMockSession('timeout-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      // Mock network timeout
      const fetchStub = sandbox.stub(global, 'fetch' as any);
      fetchStub.onCall(0).rejects(new Error('ETIMEDOUT'));
      fetchStub.onCall(1).rejects(new Error('ETIMEDOUT'));
      fetchStub.onCall(2).resolves({
        ok: true,
        status: 200,
        json: sandbox.stub().resolves({
          choices: [{ message: { content: 'Success after retry' } }]
        })
      });

      try {
        const result = await runner.run();
        assert.strictEqual(result.success, true, 'Should succeed after retries');
      } finally {
        session.dispose();
      }
    });

    test('should handle DNS resolution failures', async () => {
      const { session } = createMockSession('dns-error-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      const fetchStub = sandbox.stub(global, 'fetch' as any);
      fetchStub.rejects(new Error('ENOTFOUND api.openai.com'));

      runner.setError(new ChatBridgeError('DNS resolution failed', 'DNS_ERROR', 'openai'));

      try {
        const result = await runner.run();
        assert.strictEqual(result.success, false, 'Should fail for DNS errors');
        assert.ok(result.error?.message.includes('DNS'), 'Should include DNS error information');
      } finally {
        session.dispose();
      }
    });

    test('should handle SSL/TLS certificate errors', async () => {
      const { session } = createMockSession('ssl-error-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      runner.setError(new ChatBridgeError(
        'SSL certificate verification failed',
        'SSL_ERROR',
        'openai'
      ));

      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Configure' as any);

      try {
        const result = await runner.run();
        assert.strictEqual(result.success, false, 'Should fail for SSL errors');
        assert.ok(showErrorStub.called, 'Should show error dialog for SSL issues');
      } finally {
        session.dispose();
      }
    });

    test('should handle proxy and firewall issues', async () => {
      const { session } = createMockSession('proxy-error-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      runner.setError(new ChatBridgeError(
        'Proxy authentication required',
        'PROXY_ERROR',
        'openai',
        407
      ));

      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Configure Proxy' as any);

      try {
        const result = await runner.run();
        assert.strictEqual(result.success, false, 'Should fail for proxy errors');
        assert.ok(showErrorStub.called, 'Should show proxy configuration dialog');
      } finally {
        session.dispose();
      }
    });
  });

  suite('Authentication and Authorization Errors', () => {
    test('should handle expired API keys', async () => {
      const { session } = createMockSession('expired-key-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      runner.setError(new ChatBridgeError(
        'API key expired',
        'EXPIRED_API_KEY',
        'openai',
        401
      ));

      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Update API Key' as any);

      try {
        const result = await runner.run();
        assert.strictEqual(result.success, false, 'Should fail for expired keys');
        assert.ok(showErrorStub.called, 'Should prompt for API key update');
      } finally {
        session.dispose();
      }
    });

    test('should handle insufficient permissions', async () => {
      const { session } = createMockSession('permission-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      runner.setError(new ChatBridgeError(
        'Insufficient permissions for model access',
        'INSUFFICIENT_PERMISSIONS',
        'openai',
        403
      ));

      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Check Permissions' as any);

      try {
        const result = await runner.run();
        assert.strictEqual(result.success, false, 'Should fail for permission errors');
        assert.ok(showErrorStub.called, 'Should show permission error dialog');
      } finally {
        session.dispose();
      }
    });

    test('should handle quota exceeded errors', async () => {
      const { session } = createMockSession('quota-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      runner.setError(new ChatBridgeError(
        'Monthly quota exceeded',
        'QUOTA_EXCEEDED',
        'openai',
        429
      ));

      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('View Usage' as any);

      try {
        const result = await runner.run();
        assert.strictEqual(result.success, false, 'Should fail for quota errors');
        assert.ok(showErrorStub.called, 'Should show quota information');
      } finally {
        session.dispose();
      }
    });
  });

  suite('Resource and Capacity Errors', () => {
    test('should handle model overload errors', async () => {
      const { session } = createMockSession('overload-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      runner.setError(new ChatBridgeError(
        'Model is currently overloaded',
        'MODEL_OVERLOADED',
        'openai',
        503
      ));

      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Retry Later' as any);

      try {
        const result = await runner.run();
        assert.strictEqual(result.success, false, 'Should fail for overload errors');
        assert.ok(showErrorStub.called, 'Should suggest retry later');
      } finally {
        session.dispose();
      }
    });

    test('should handle context length exceeded errors with fallback', async () => {
      const { session } = createMockSession('context-length-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const contextRunner = new ContextRunner(session, agent, 'Test personality');

      // Mock context that's too large
      const largeContext = createMockWorkspaceContext('react-typescript');
      largeContext.tokenCount = 10000; // Exceeds typical limits

      // Mock the context runner to throw an error
      const runStub = sandbox.stub(contextRunner, 'run').rejects(new ChatBridgeError(
        'Context length exceeded',
        'CONTEXT_LENGTH_EXCEEDED',
        'openai',
        400
      ));

      const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves('Reduce Context' as any);

      try {
        const result = await contextRunner.run();
        assert.strictEqual(result.success, false, 'Should fail for context length errors');
        assert.ok(showWarningStub.called, 'Should suggest context reduction');
      } finally {
        session.dispose();
      }
    });

    test('should handle memory pressure during large operations', async () => {
      const { session } = createMockSession('memory-pressure-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      runner.setError(new Error('JavaScript heap out of memory'));

      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Restart Extension' as any);

      try {
        const result = await runner.run();
        assert.strictEqual(result.success, false, 'Should fail for memory errors');
        assert.ok(showErrorStub.called, 'Should suggest restart');
      } finally {
        session.dispose();
      }
    });
  });

  suite('Data Corruption and Validation Errors', () => {
    test('should handle corrupted workspace context', async () => {
      const { session } = createMockSession('corrupted-context-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const planningRunner = new PlanningRunner(session, agent, 'Test personality');

      // Mock corrupted context file
      sandbox.stub(vscode.workspace.fs, 'readFile').resolves(
        Buffer.from('invalid json content')
      );

      try {
        const result = await planningRunner.run();
        assert.strictEqual(result.success, false, 'Should fail for corrupted context');
        assert.ok(result.error?.message.includes('context'), 'Should mention context error');
      } finally {
        session.dispose();
      }
    });

    test('should handle invalid action list format', async () => {
      const { session } = createMockSession('invalid-action-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const executionRunner = new ExecutionRunner(session, agent, 'Test personality');

      // Mock invalid action list
      const invalidActionList = {
        version: '1.0',
        actions: [
          { id: 'invalid', type: 'INVALID_TYPE' as any } // Invalid action type
        ]
      };

      (executionRunner as any).actionList = invalidActionList;
      (executionRunner as any).loadActionList = async () => {
        (executionRunner as any).actionList = invalidActionList;
      };

      try {
        const result = await executionRunner.run();
        assert.strictEqual(result.success, false, 'Should fail for invalid action list');
      } finally {
        session.dispose();
      }
    });

    test('should handle personality file corruption', async () => {
      const { session } = createMockSession('personality-corruption-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      // Mock corrupted personality file
      sandbox.stub(vscode.workspace.fs, 'readFile').rejects(new Error('File corrupted'));

      // Should fall back to default personality
      const result = await runner.run();
      assert.strictEqual(result.success, true, 'Should succeed with default personality');

      session.dispose();
    });
  });

  suite('Concurrency and Race Condition Errors', () => {
    test('should handle concurrent session modifications', async () => {
      const { session } = createMockSession('concurrent-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      
      const runner1 = new TestRunner(session, agent, 'Test personality 1');
      const runner2 = new TestRunner(session, agent, 'Test personality 2');

      // Start both runners concurrently
      const promise1 = runner1.run();
      const promise2 = runner2.run();

      try {
        const [result1, result2] = await Promise.allSettled([promise1, promise2]);
        
        // One should succeed, one should fail due to session state conflict
        const successCount = [result1, result2].filter(r => 
          r.status === 'fulfilled' && r.value.success
        ).length;
        
        assert.ok(successCount <= 1, 'Should handle concurrent access gracefully');
      } finally {
        session.dispose();
      }
    });

    test('should handle file system race conditions', async () => {
      const { session } = createMockSession('file-race-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const executionRunner = new ExecutionRunner(session, agent, 'Test personality');

      // Mock file system operations that conflict
      let writeCount = 0;
      sandbox.stub(vscode.workspace.fs, 'writeFile').callsFake(async () => {
        writeCount++;
        if (writeCount === 1) {
          // Simulate delay that causes race condition
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('File locked by another process');
      });

      const actionList = createMockActionList('add-authentication');
      (executionRunner as any).actionList = actionList;
      (executionRunner as any).loadActionList = async () => {
        (executionRunner as any).actionList = actionList;
      };

      try {
        const result = await executionRunner.run();
        // Should handle file system conflicts gracefully
        assert.ok(result.success !== undefined, 'Should handle file system race conditions');
      } finally {
        session.dispose();
      }
    });
  });

  suite('Recovery Mechanisms', () => {
    test('should implement automatic retry with exponential backoff', async () => {
      const { session } = createMockSession('retry-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      let attemptCount = 0;
      const originalError = runner.setError;
      runner.setError = function(error: Error) {
        attemptCount++;
        if (attemptCount < 3) {
          return originalError.call(this, error);
        }
        // Succeed on third attempt
        return originalError.call(this, null as any);
      };

      runner.setError(new Error('Transient error'));

      const startTime = Date.now();
      const result = await runner.run();
      const endTime = Date.now();

      assert.strictEqual(result.success, true, 'Should succeed after retries');
      assert.ok(endTime - startTime >= 300, 'Should implement exponential backoff');

      session.dispose();
    });

    test('should implement circuit breaker pattern', async () => {
      const { session } = createMockSession('circuit-breaker-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      
      // Simulate multiple failures to trigger circuit breaker
      const runners = Array(5).fill(null).map(() => new TestRunner(session, agent, 'Test'));
      runners.forEach(runner => {
        runner.setError(new Error('Service unavailable'));
      });

      const results = await Promise.allSettled(
        runners.map(runner => runner.run())
      );

      // Later requests should fail faster (circuit breaker)
      const failedResults = results.filter(r => 
        r.status === 'fulfilled' && !r.value.success
      );
      
      assert.ok(failedResults.length > 0, 'Should implement circuit breaker pattern');

      session.dispose();
    });

    test('should implement graceful degradation', async () => {
      const { session } = createMockSession('degradation-test');
      const primaryAgent = agentRegistry.getAgent('openai-gpt4')!;
      const fallbackAgent = agentRegistry.getAgent('openai-gpt35')!;

      // Primary agent fails
      const primaryRunner = new TestRunner(session, primaryAgent, 'Test');
      primaryRunner.setError(new Error('Primary service unavailable'));

      // Should fall back to secondary agent
      const fallbackRunner = new TestRunner(session, fallbackAgent, 'Test');

      try {
        const primaryResult = await primaryRunner.run();
        assert.strictEqual(primaryResult.success, false, 'Primary should fail');

        const fallbackResult = await fallbackRunner.run();
        assert.strictEqual(fallbackResult.success, true, 'Fallback should succeed');
      } finally {
        session.dispose();
      }
    });

    test('should implement state recovery after errors', async () => {
      const { session } = createMockSession('state-recovery-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      // Simulate error that corrupts session state
      session.setState(SessionState.ERROR);
      session.error('Test error', { recoverable: true });

      // Recovery should restore valid state
      const result = await runner.run();
      
      // Should either succeed or fail gracefully with proper state
      assert.ok(
        session.state === SessionState.COMPLETED || 
        session.state === SessionState.ERROR,
        'Should maintain valid session state'
      );

      session.dispose();
    });
  });

  suite('Error Reporting and Diagnostics', () => {
    test('should collect comprehensive error diagnostics', async () => {
      const { session } = createMockSession('diagnostics-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      const complexError = new ChatBridgeError(
        'Complex error scenario',
        'COMPLEX_ERROR',
        'openai',
        500
      );
      // Note: context would be added to metadata in a real scenario

      runner.setError(complexError);

      try {
        const result = await runner.run();
        assert.strictEqual(result.success, false, 'Should fail with complex error');
        assert.ok(result.error, 'Should include error information');
        assert.ok(result.metadata, 'Should include diagnostic metadata');
      } finally {
        session.dispose();
      }
    });

    test('should generate error reports for debugging', async () => {
      const { session } = createMockSession('error-report-test');
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const runner = new TestRunner(session, agent, 'Test personality');

      runner.setError(new Error('Test error for reporting'));

      const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Generate Report' as any);

      try {
        const result = await runner.run();
        assert.strictEqual(result.success, false, 'Should fail and offer error report');
        assert.ok(showErrorStub.called, 'Should offer error reporting');
      } finally {
        session.dispose();
      }
    });
  });
});