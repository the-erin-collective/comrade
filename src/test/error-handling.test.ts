/**
 * Tests for error handling and cancellation functionality
 */

import * as assert from 'assert';
// Mocha globals are provided by the test environment
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { BaseRunner, RunnerResult, OperationTimeout } from '../runners/base';
import { Session, SessionState, WorkflowMode } from '../core/session';
import { IAgent, AgentCapabilities, PhaseAgentMapping } from '../core/agent';

// Mock progress reporter is defined inline in tests where needed

// Mock agent for testing
class MockAgent implements IAgent {
  id = 'test-agent';
  name = 'Test Agent';
  provider = 'test' as any;
  config = { endpoint: 'http://test.com' } as any;
  capabilities: AgentCapabilities = {
    hasVision: false,
    hasToolUse: false,
    reasoningDepth: 'basic',
    speed: 'fast',
    costTier: 'low',
    maxTokens: 1000,
    supportedLanguages: ['en'],
    specializations: ['test']
  };
  isEnabledForAssignment = true;

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// Mock runner for testing
class MockRunner extends BaseRunner {
  private shouldFail: boolean = false;
  private shouldTimeout: boolean = false;
  private executionDelay: number = 0;

  constructor(session: any, agent: IAgent, personality: string) {
    super(session, agent, personality);
  }

  public setShouldFail(fail: boolean) {
    this.shouldFail = fail;
  }

  public setShouldTimeout(timeout: boolean) {
    this.shouldTimeout = timeout;
  }

  public setExecutionDelay(delay: number) {
    this.executionDelay = delay;
  }

  protected async execute(): Promise<RunnerResult> {
    if (this.executionDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.executionDelay));
    }

    if (this.shouldTimeout) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Long delay to trigger timeout
    }

    if (this.shouldFail) {
      throw new Error('Mock execution failure');
    }

    return {
      success: true,
      data: { message: 'Mock execution completed' }
    };
  }

  protected validateInputs(): boolean {
    return true;
  }

  protected async handleError(error: Error): Promise<void> {
    await this.defaultErrorHandler(error);
  }

  protected getRunnerName(): string {
    return 'MockRunner';
  }
}

describe('Error Handling and Cancellation', () => {
  let mockAgent: MockAgent;
  let mockSession: Session;
  let mockProgress: vscode.Progress<any>;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockAgent = new MockAgent();
    
    // Mock progress
    mockProgress = {
      report: sandbox.stub()
    };

    // Create mock session
    const workspaceUri = vscode.Uri.file('/test/workspace');
    const agentMapping: PhaseAgentMapping = {
      assignments: {
        context: 'test-agent',
        planning: 'test-agent',
        review: 'test-agent',
        execution: 'test-agent',
        recovery: 'test-agent'
      },
      reasoning: 'Test assignment',
      confidence: 1.0,
      alternatives: {
        context: [],
        planning: [],
        review: [],
        execution: [],
        recovery: []
      }
    };

    mockSession = new Session(
      'test-session',
      workspaceUri,
      agentMapping,
      {
        hasImages: false,
        workspaceSize: 'small',
        complexity: 'simple',
        timeConstraints: 'none',
        toolsRequired: [],
        preferredCostTier: 'low'
      },
      WorkflowMode.SPEED,
      mockProgress
    );
  });

  afterEach(() => {
    sandbox.restore();
    mockSession.dispose();
  });

  it('should handle successful execution', async () => {
    const runner = new MockRunner(mockSession, mockAgent, 'test personality');
    
    const result = await runner.run();
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.message, 'Mock execution completed');
    assert.strictEqual(result.error, undefined);
  });

  it('should handle execution failure with error recovery', async () => {
    const runner = new MockRunner(mockSession, mockAgent, 'test personality');
    runner.setShouldFail(true);

    // Mock the error dialog to avoid actual UI interaction
    const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Retry' as any);
    
    const result = await runner.run();
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.strictEqual(result.error.message, 'Mock execution failure');
    
    // Verify error dialog was shown
    assert.ok(showErrorMessageStub.called);
  });

  it('should handle cancellation before execution', async () => {
    const runner = new MockRunner(mockSession, mockAgent, 'test personality');
    
    // Cancel session before execution
    mockSession.cancel();
    
    const result = await runner.run();
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error.message.includes('cancelled before execution'));
  });

  it('should handle cancellation during execution', async () => {
    const runner = new MockRunner(mockSession, mockAgent, 'test personality');
    runner.setExecutionDelay(100);
    
    // Start execution and cancel after a short delay
    const executionPromise = runner.run();
    setTimeout(() => mockSession.cancel(), 50);
    
    const result = await executionPromise;
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error.message.includes('cancelled during execution'));
  });

  it('should handle operation timeout', async () => {
    const runner = new MockRunner(mockSession, mockAgent, 'test personality');
    
    const timeout: OperationTimeout = {
      duration: 100, // 100ms timeout
      message: 'Test operation timeout',
      allowExtension: false
    };
    
    runner.setExecutionDelay(200); // Delay longer than timeout
    
    const result = await runner.run(timeout);
    
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error.message.includes('timed out'));
  });

  it('should handle timeout with extension option', async () => {
    const runner = new MockRunner(mockSession, mockAgent, 'test personality');
    
    const timeout: OperationTimeout = {
      duration: 100,
      message: 'Test operation timeout',
      allowExtension: true
    };
    
    // Mock user choosing to extend timeout
    const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves('Extend Timeout' as any);
    
    runner.setExecutionDelay(150); // Delay longer than initial timeout but shorter than extended
    
    const result = await runner.run(timeout);
    
    // Should succeed after extension
    assert.strictEqual(result.success, true);
    assert.ok(showWarningMessageStub.called);
  });

  it('should create recoverable error with suggested fix', async () => {
    const runner = new MockRunner(mockSession, mockAgent, 'test personality');
    
    const error = (runner as any).createRecoverableError(
      'Test error message',
      'TEST_ERROR',
      { context: 'test' },
      'Try this fix',
      'command:test.fix'
    );
    
    assert.strictEqual(error.message, 'Test error message');
    assert.strictEqual(error.code, 'TEST_ERROR');
    assert.strictEqual(error.recoverable, true);
    assert.strictEqual(error.suggestedFix, 'Try this fix');
    assert.strictEqual(error.configurationLink, 'command:test.fix');
    assert.deepStrictEqual(error.context, { context: 'test' });
  });

  it('should create fatal error', async () => {
    const runner = new MockRunner(mockSession, mockAgent, 'test personality');
    
    const error = (runner as any).createFatalError(
      'Fatal error message',
      'FATAL_ERROR',
      { context: 'test' }
    );
    
    assert.strictEqual(error.message, 'Fatal error message');
    assert.strictEqual(error.code, 'FATAL_ERROR');
    assert.strictEqual(error.recoverable, false);
  });

  it('should handle network error with specific recovery options', async () => {
    const runner = new MockRunner(mockSession, mockAgent, 'test personality');
    
    // Mock network error
    const networkError = new Error('Network connection failed');
    
    // Mock error dialog
    const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Configure' as any);
    
    await (runner as any).handleNetworkError(networkError, 'https://api.test.com');
    
    assert.ok(showErrorMessageStub.called);
    const callArgs = showErrorMessageStub.getCall(0).args;
    assert.ok(callArgs[0].includes('Network error'));
    assert.ok(callArgs.includes('Configure'));
  });

  it('should handle authentication error with configuration link', async () => {
    const runner = new MockRunner(mockSession, mockAgent, 'test personality');
    
    // Mock auth error
    const authError = new Error('Invalid API key');
    
    // Mock error dialog
    const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Configure' as any);
    
    await (runner as any).handleAuthError(authError, 'openai');
    
    assert.ok(showErrorMessageStub.called);
    const callArgs = showErrorMessageStub.getCall(0).args;
    assert.ok(callArgs[0].includes('Authentication failed'));
    assert.ok(callArgs.includes('Configure'));
  });

  it('should handle rate limit error with retry suggestion', async () => {
    const runner = new MockRunner(mockSession, mockAgent, 'test personality');
    
    // Mock rate limit error
    const rateLimitError = new Error('Rate limit exceeded');
    
    // Mock error dialog
    const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Retry' as any);
    
    await (runner as any).handleRateLimitError(rateLimitError, 60);
    
    assert.ok(showErrorMessageStub.called);
    const callArgs = showErrorMessageStub.getCall(0).args;
    assert.ok(callArgs[0].includes('Rate limit exceeded'));
    assert.ok(callArgs[0].includes('Wait 60 seconds'));
  });

  it('should track session error state', () => {
    const errorMessage = 'Test session error';
    const errorDetails = {
      code: 'TEST_ERROR',
      recoverable: true,
      suggestedFix: 'Try this fix'
    };
    
    mockSession.error(errorMessage, errorDetails);
    
    assert.strictEqual(mockSession.state, SessionState.ERROR);
    
    const lastError = mockSession.getLastError();
    assert.ok(lastError);
    assert.strictEqual(lastError.message, errorMessage);
    assert.strictEqual(lastError.code, 'TEST_ERROR');
    assert.strictEqual(lastError.recoverable, true);
    assert.strictEqual(lastError.suggestedFix, 'Try this fix');
  });

  it('should clear session error state', () => {
    mockSession.error('Test error');
    assert.ok(mockSession.getLastError());
    
    mockSession.clearError();
    assert.strictEqual(mockSession.getLastError(), null);
  });

  it('should report progress with cancellation options', () => {
    const reportStub = mockProgress.report as sinon.SinonStub;
    
    mockSession.reportProgress('Test progress', 50, { 
      cancellable: true, 
      showInStatusBar: true 
    });
    
    assert.ok(reportStub.called);
    const callArgs = reportStub.getCall(0).args[0];
    assert.strictEqual(callArgs.message, 'Test progress');
    assert.strictEqual(callArgs.increment, 50);
    assert.strictEqual(callArgs.cancellable, true);
    assert.strictEqual(callArgs.showInStatusBar, true);
  });
});

