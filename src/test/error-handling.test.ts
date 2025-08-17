/**
 * Tests for error handling and cancellation functionality
 */

import * as assert from 'assert';
// Mocha globals are provided by the test environment
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { BaseRunner, RunnerResult, OperationTimeout, ILogger } from '../runners/base';
import { Session, SessionState, WorkflowMode } from '../core/session';
import { IAgent, AgentCapabilities, PhaseAgentMapping } from '../core/agent';

// Mock progress reporter is defined inline in tests where needed

// Helper to create a full ILogger mock
const createTestLogger = (sb: sinon.SinonSandbox): ILogger => ({
  debug: sb.stub(),
  info: sb.stub(),
  warn: sb.stub(),
  error: sb.stub()
});

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

  constructor(session: any, agent: IAgent, personality: string, logger?: ILogger) {
    super(session, agent, personality, logger);
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
      // Use a delay that's longer than the expected timeout to trigger timeout handling
      await new Promise(resolve => setTimeout(resolve, this.executionDelay || 200));
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
    // Wrap the error with runner name like a real runner would
    const wrappedError = new Error(`${this.getRunnerName()} failed: ${error.message}`);
    await this.defaultErrorHandler(wrappedError);
    throw wrappedError;
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
    const logger: ILogger = createTestLogger(sandbox);
    const runner = new MockRunner(mockSession, mockAgent, 'test personality', logger);
    runner.setShouldFail(true);

    // Mock the error dialog to avoid actual UI interaction
    const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Retry' as any);

    // Temporarily set NODE_ENV to non-test to trigger UI interactions
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const result = await runner.run();

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.strictEqual(result.error.message, 'MockRunner failed: Mock execution failure');

      // Verify error dialog was shown
      assert.ok(showErrorMessageStub.called);
      // Verify error was logged
      sinon.assert.called(logger.error as sinon.SinonStub);
    } finally {
      // Restore original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should handle cancellation before execution', async () => {
    const logger: ILogger = createTestLogger(sandbox);
    const runner = new MockRunner(mockSession, mockAgent, 'test personality', logger);

    // Cancel session before execution
    mockSession.cancel();

    const result = await runner.run();

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.error.message.includes('cancelled before execution'));
  });

  it('should handle cancellation during execution', async () => {
    const logger: ILogger = createTestLogger(sandbox);
    const runner = new MockRunner(mockSession, mockAgent, 'test personality', logger);
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
    const logger: ILogger = createTestLogger(sandbox);
    const runner = new MockRunner(mockSession, mockAgent, 'test personality', logger);

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
    const logger: ILogger = createTestLogger(sandbox);
    const runner = new MockRunner(mockSession, mockAgent, 'test personality', logger);

    const timeout: OperationTimeout = {
      duration: 100,
      message: 'Test operation timeout',
      allowExtension: true
    };

    // Mock user choosing to extend timeout
    const showWarningMessageStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves('Extend Timeout' as any);

    // Temporarily set NODE_ENV to non-test to allow timeout extension
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    runner.setExecutionDelay(150); // Delay longer than initial timeout but shorter than extended

    try {
      const result = await runner.run(timeout);

      // Should succeed after extension
      assert.strictEqual(result.success, true);
      assert.ok(showWarningMessageStub.called);
    } finally {
      // Restore original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should create recoverable error with suggested fix', async () => {
    const logger: ILogger = createTestLogger(sandbox);
    const runner = new MockRunner(mockSession, mockAgent, 'test personality', logger);

    // Force the runner to throw a recoverable error
    runner.setShouldFail(true);
    (sandbox.stub(runner as any, 'handleError') as any).callsFake(async (err: Error) => {
      // Simulate the base runner wrapping the error
      const wrapped = new Error(`MockRunner failed: ${err.message}`);
      (wrapped as any).recoverable = true;
      (wrapped as any).code = 'TEST_ERROR';
      (wrapped as any).suggestedFix = 'Try this fix';
      (wrapped as any).configurationLink = 'command:test.fix';
      await (runner as any).defaultErrorHandler(wrapped);
      throw wrapped;
    });

    const result = await runner.run();
    assert.strictEqual(result.success, false);
    const err = result.error;
    assert.strictEqual(err?.message, 'MockRunner failed: Mock execution failure');
    assert.strictEqual((err as any).recoverable, true);
    assert.strictEqual((err as any).suggestedFix, 'Try this fix');
    assert.strictEqual((err as any).configurationLink, 'command:test.fix');
  });

  it('should create fatal error', async () => {
    const logger: ILogger = createTestLogger(sandbox);
    const runner = new MockRunner(mockSession, mockAgent, 'test personality', logger);

    // Force the runner to throw a fatal error
    runner.setShouldFail(true);
    (sandbox.stub(runner as any, 'handleError') as any).callsFake(async (err: Error) => {
      const wrapped = new Error(`MockRunner failed: ${err.message}`);
      (wrapped as any).recoverable = false;
      (wrapped as any).code = 'FATAL_ERROR';
      await (runner as any).defaultErrorHandler(wrapped);
      throw wrapped;
    });

    const result = await runner.run();
    assert.strictEqual(result.success, false);
    const err = result.error;
    assert.strictEqual((err as any).recoverable, false);
  });

  it('should handle network error with specific recovery options', async () => {
    const logger: ILogger = createTestLogger(sandbox);
    const runner = new MockRunner(mockSession, mockAgent, 'test personality', logger);

    // Mock network error
    const networkError = new Error('Network connection failed');

    // Mock error dialog
    const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Configure' as any);

    // Temporarily set NODE_ENV to non-test to trigger UI interactions
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      await (runner as any).handleNetworkError(networkError, 'https://api.test.com');

      assert.ok(showErrorMessageStub.called);
      const callArgs = showErrorMessageStub.getCall(0).args;
      assert.ok(callArgs[0].includes('Network error'));
      assert.ok(callArgs.includes('Configure'));
      // Verify error was logged
      sinon.assert.called(logger.error as sinon.SinonStub);
    } finally {
      // Restore original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should handle authentication error with configuration link', async () => {
    const logger: ILogger = createTestLogger(sandbox);
    const runner = new MockRunner(mockSession, mockAgent, 'test personality', logger);

    // Mock auth error
    const authError = new Error('Invalid API key');

    // Mock error dialog
    const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Configure' as any);

    // Temporarily set NODE_ENV to non-test to trigger UI interactions
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      await (runner as any).handleAuthError(authError, 'openai');

      assert.ok(showErrorMessageStub.called);
      const callArgs = showErrorMessageStub.getCall(0).args;
      assert.ok(callArgs[0].includes('Authentication failed'));
      assert.ok(callArgs.includes('Configure'));
      // Verify error was logged
      sinon.assert.called(logger.error as sinon.SinonStub);
    } finally {
      // Restore original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should handle rate limit error with retry suggestion', async () => {
    const logger: ILogger = createTestLogger(sandbox);
    const runner = new MockRunner(mockSession, mockAgent, 'test personality', logger);

    // Mock rate limit error
    const rateLimitError = new Error('Rate limit exceeded');

    // Mock error dialog
    const showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves('Retry' as any);

    // Temporarily set NODE_ENV to non-test to trigger UI interactions
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      await (runner as any).handleRateLimitError(rateLimitError, 60);

      assert.ok(showErrorMessageStub.called);
      const callArgs = showErrorMessageStub.getCall(0).args;
      assert.ok(callArgs[0].includes('Rate limit exceeded'));
      assert.ok(callArgs[0].includes('Wait 60 seconds'));
      // Verify error was logged
      sinon.assert.called(logger.error as sinon.SinonStub);
    } finally {
      // Restore original NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    }
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

