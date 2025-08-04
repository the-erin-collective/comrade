/**
 * Tests for BaseRunner and Session classes
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { BaseRunner, RunnerResult } from '../runners/base';
import { Session, SessionState, WorkflowMode } from '../core/session';
import { IAgent, PhaseAgentMapping, SessionRequirements, AgentCapabilities, PhaseType } from '../core/agent';

// Mock agent for testing
class MockAgent implements IAgent {
  id = 'test-agent';
  name = 'Test Agent';
  provider = 'test' as any;
  config = {} as any;
  capabilities: AgentCapabilities = {
    hasVision: false,
    hasToolUse: false,
    reasoningDepth: 'basic',
    speed: 'fast',
    costTier: 'low',
    maxTokens: 1000,
    supportedLanguages: ['typescript'],
    specializations: ['test']
  };
  isEnabledForAssignment = true;

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// Mock runner for testing
class TestRunner extends BaseRunner {
  private shouldFail: boolean;
  private shouldValidate: boolean;

  constructor(session: any, agent: IAgent, personality: string, shouldFail = false, shouldValidate = true) {
    super(session, agent, personality);
    this.shouldFail = shouldFail;
    this.shouldValidate = shouldValidate;
  }

  protected async execute(): Promise<RunnerResult> {
    if (this.shouldFail) {
      throw new Error('Test execution failure');
    }
    
    this.reportProgress('Test execution in progress');
    return {
      success: true,
      data: { message: 'Test completed successfully' }
    };
  }

  protected validateInputs(): boolean {
    return this.shouldValidate;
  }

  protected async handleError(error: Error): Promise<void> {
    await this.defaultErrorHandler(error);
  }

  protected getRunnerName(): string {
    return 'TestRunner';
  }
}

// Mock progress reporter
class MockProgress implements vscode.Progress<any> {
  public reports: any[] = [];

  report(value: any): void {
    this.reports.push(value);
  }
}

describe('Session Tests', () => {
  let mockWorkspaceUri: vscode.Uri;
  let mockAgentMapping: PhaseAgentMapping;
  let mockRequirements: SessionRequirements;
  let mockProgress: MockProgress;

  beforeEach(() => {
    mockWorkspaceUri = vscode.Uri.file('/test/workspace');
    mockAgentMapping = {
      assignments: {
        [PhaseType.CONTEXT]: 'test-agent',
        [PhaseType.PLANNING]: 'test-agent',
        [PhaseType.REVIEW]: 'test-agent',
        [PhaseType.EXECUTION]: 'test-agent',
        [PhaseType.RECOVERY]: 'test-agent'
      },
      reasoning: 'Test mapping',
      confidence: 0.9,
      alternatives: {
        [PhaseType.CONTEXT]: [],
        [PhaseType.PLANNING]: [],
        [PhaseType.REVIEW]: [],
        [PhaseType.EXECUTION]: [],
        [PhaseType.RECOVERY]: []
      }
    };
    mockRequirements = {
      hasImages: false,
      workspaceSize: 'small',
      complexity: 'simple',
      timeConstraints: 'none',
      toolsRequired: [],
      preferredCostTier: 'low'
    };
    mockProgress = new MockProgress();
  });

  it('Session creation', () => {
    const session = new Session(
      'test-session',
      mockWorkspaceUri,
      mockAgentMapping,
      mockRequirements,
      WorkflowMode.SPEED,
      mockProgress
    );

    assert.strictEqual(session.id, 'test-session');
    assert.strictEqual(session.state, SessionState.IDLE);
    assert.strictEqual(session.mode, WorkflowMode.SPEED);
    assert.strictEqual(session.workspaceUri, mockWorkspaceUri);
    assert.strictEqual(session.isCancelled(), false);
  });

  it('Session state management', () => {
    const session = new Session(
      'test-session',
      mockWorkspaceUri,
      mockAgentMapping,
      mockRequirements,
      WorkflowMode.SPEED,
      mockProgress
    );

    session.setState(SessionState.PLANNING, 'Starting planning');
    assert.strictEqual(session.state, SessionState.PLANNING);
    assert.strictEqual(mockProgress.reports.length, 1);
    assert.strictEqual(mockProgress.reports[0].message, 'Starting planning');
  });

  it('Session phase management', () => {
    const session = new Session(
      'test-session',
      mockWorkspaceUri,
      mockAgentMapping,
      mockRequirements,
      WorkflowMode.SPEED,
      mockProgress
    );

    session.setPhase(PhaseType.PLANNING);
    assert.strictEqual(session.currentPhase, PhaseType.PLANNING);
    assert.strictEqual(mockProgress.reports.length, 1);
    assert.strictEqual(mockProgress.reports[0].message, 'Starting planning phase');
  });

  it('Session cancellation', () => {
    const session = new Session(
      'test-session',
      mockWorkspaceUri,
      mockAgentMapping,
      mockRequirements,
      WorkflowMode.SPEED,
      mockProgress
    );

    session.cancel();
    assert.strictEqual(session.state, SessionState.CANCELLED);
    assert.strictEqual(session.isCancelled(), true);
  });

  it('Session completion', () => {
    const session = new Session(
      'test-session',
      mockWorkspaceUri,
      mockAgentMapping,
      mockRequirements,
      WorkflowMode.SPEED,
      mockProgress
    );

    session.complete();
    assert.strictEqual(session.state, SessionState.COMPLETED);
  });

  it('Session error handling', () => {
    const session = new Session(
      'test-session',
      mockWorkspaceUri,
      mockAgentMapping,
      mockRequirements,
      WorkflowMode.SPEED,
      mockProgress
    );

    session.error('Test error message');
    assert.strictEqual(session.state, SessionState.ERROR);
    assert.strictEqual(session.metadata.error, 'Test error message');
    assert.ok(session.metadata.errorTime instanceof Date);
  });
});

describe('BaseRunner Tests', () => {
  let mockSession: Session;
  let mockAgent: MockAgent;
  let mockProgress: MockProgress;

  beforeEach(() => {
    const mockWorkspaceUri = vscode.Uri.file('/test/workspace');
    const mockAgentMapping: PhaseAgentMapping = {
      assignments: {
        [PhaseType.CONTEXT]: 'test-agent',
        [PhaseType.PLANNING]: 'test-agent',
        [PhaseType.REVIEW]: 'test-agent',
        [PhaseType.EXECUTION]: 'test-agent',
        [PhaseType.RECOVERY]: 'test-agent'
      },
      reasoning: 'Test mapping',
      confidence: 0.9,
      alternatives: {
        [PhaseType.CONTEXT]: [],
        [PhaseType.PLANNING]: [],
        [PhaseType.REVIEW]: [],
        [PhaseType.EXECUTION]: [],
        [PhaseType.RECOVERY]: []
      }
    };
    const mockRequirements: SessionRequirements = {
      hasImages: false,
      workspaceSize: 'small',
      complexity: 'simple',
      timeConstraints: 'none',
      toolsRequired: [],
      preferredCostTier: 'low'
    };
    mockProgress = new MockProgress();
    
    mockSession = new Session(
      'test-session',
      mockWorkspaceUri,
      mockAgentMapping,
      mockRequirements,
      WorkflowMode.SPEED,
      mockProgress
    );
    
    mockAgent = new MockAgent();
  });

  it('Successful runner execution', async () => {
    const runner = new TestRunner(mockSession, mockAgent, 'test personality');
    const result = await runner.run();

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data?.message, 'Test completed successfully');
    assert.ok(mockProgress.reports.length >= 2); // Start and progress messages
  });

  it('Runner execution with validation failure', async () => {
    const runner = new TestRunner(mockSession, mockAgent, 'test personality', false, false);
    const result = await runner.run();

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.strictEqual(result.error.message, 'Input validation failed');
  });

  it('Runner execution with execution failure', async () => {
    const runner = new TestRunner(mockSession, mockAgent, 'test personality', true, true);
    const result = await runner.run();

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.strictEqual(result.error.message, 'Test execution failure');
  });

  it('Runner execution with cancelled session', async () => {
    mockSession.cancel();
    const runner = new TestRunner(mockSession, mockAgent, 'test personality');
    const result = await runner.run();

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.strictEqual(result.error.message, 'Session was cancelled before execution');
  });

  it('Runner error creation', () => {
    const runner = new TestRunner(mockSession, mockAgent, 'test personality');
    
    const recoverableError = (runner as any).createRecoverableError('Test error', 'TEST_ERROR', { test: true });
    assert.strictEqual(recoverableError.message, 'Test error');
    assert.strictEqual(recoverableError.code, 'TEST_ERROR');
    assert.strictEqual(recoverableError.recoverable, true);
    assert.deepStrictEqual(recoverableError.context, { test: true });

    const fatalError = (runner as any).createFatalError('Fatal error', 'FATAL_ERROR');
    assert.strictEqual(fatalError.message, 'Fatal error');
    assert.strictEqual(fatalError.code, 'FATAL_ERROR');
    assert.strictEqual(fatalError.recoverable, false);
  });

  it('Runner workspace utilities', () => {
    const runner = new TestRunner(mockSession, mockAgent, 'test personality');
    
    const workspaceRoot = (runner as any).getWorkspaceRoot();
    // Handle both Windows and Unix paths
    const expectedPath = process.platform === 'win32' ? '\\test\\workspace' : '/test/workspace';
    assert.strictEqual(workspaceRoot, expectedPath);
  });
});

