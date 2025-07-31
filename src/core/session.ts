/**
 * Session management interfaces and types
 */

import * as vscode from 'vscode';
import { PhaseType, PhaseAgentMapping, SessionRequirements } from './agent';

export enum SessionState {
  IDLE = 'idle',
  AGENT_ASSIGNMENT = 'agent_assignment',
  CONTEXT_GENERATION = 'context_generation',
  PLANNING = 'planning',
  AWAITING_PLAN_APPROVAL = 'awaiting_plan_approval',
  PLAN_REVIEW = 'plan_review',
  AWAITING_REVIEW_APPROVAL = 'awaiting_review_approval',
  EXECUTION = 'execution',
  AWAITING_EXECUTION_APPROVAL = 'awaiting_execution_approval',
  RECOVERY = 'recovery',
  AWAITING_RECOVERY_DECISION = 'awaiting_recovery_decision',
  COMPLETED = 'completed',
  ERROR = 'error',
  CANCELLED = 'cancelled'
}

export enum WorkflowMode {
  SPEED = 'speed',     // Auto-execute all phases, user only involved in planning/recovery
  STRUCTURE = 'structure' // User explicitly approves each phase transition
}

export interface ProgressUpdate {
  message: string;
  increment?: number;
  total?: number;
  cancellable?: boolean;
  showInStatusBar?: boolean;
}

export interface SessionError {
  message: string;
  code: string;
  recoverable: boolean;
  suggestedFix?: string;
  configurationLink?: string;
  timestamp: Date;
}

export interface ISession {
  id: string;
  workspaceUri: vscode.Uri;
  state: SessionState;
  currentPhase?: PhaseType;
  agentMapping: PhaseAgentMapping;
  requirements: SessionRequirements;
  mode: WorkflowMode;
  cancellationToken: vscode.CancellationToken;
  progress: vscode.Progress<ProgressUpdate>;
  startTime: Date;
  metadata: Record<string, any>;

  // Session management methods
  setState(newState: SessionState, message?: string): void;
  setPhase(phase: PhaseType): void;
  reportProgress(message: string, increment?: number, options?: { cancellable?: boolean; showInStatusBar?: boolean }): void;
  cancel(): void;
  isCancelled(): boolean;
  complete(): void;
  error(errorMessage: string, errorDetails?: Partial<SessionError>): void;
  getLastError(): SessionError | null;
  clearError(): void;
  dispose(): void;
}

/**
 * Concrete implementation of ISession for operation state management and cancellation
 */
export class Session implements ISession {
  public readonly id: string;
  public readonly workspaceUri: vscode.Uri;
  public state: SessionState;
  public currentPhase?: PhaseType;
  public agentMapping: PhaseAgentMapping;
  public requirements: SessionRequirements;
  public mode: WorkflowMode;
  public cancellationToken: vscode.CancellationToken;
  public progress: vscode.Progress<ProgressUpdate>;
  public readonly startTime: Date;
  public metadata: Record<string, any>;

  private _cancellationTokenSource: vscode.CancellationTokenSource;
  private _lastError: SessionError | null = null;

  constructor(
    id: string,
    workspaceUri: vscode.Uri,
    agentMapping: PhaseAgentMapping,
    requirements: SessionRequirements,
    mode: WorkflowMode = WorkflowMode.SPEED,
    progress: vscode.Progress<ProgressUpdate>
  ) {
    this.id = id;
    this.workspaceUri = workspaceUri;
    this.state = SessionState.IDLE;
    this.agentMapping = agentMapping;
    this.requirements = requirements;
    this.mode = mode;
    this.startTime = new Date();
    this.metadata = {};
    this.progress = progress;

    // Create cancellation token source
    this._cancellationTokenSource = new vscode.CancellationTokenSource();
    this.cancellationToken = this._cancellationTokenSource.token;
  }

  /**
   * Update session state and notify progress
   */
  public setState(newState: SessionState, message?: string): void {
    this.state = newState;
    if (message) {
      this.reportProgress(message);
    }
  }

  /**
   * Set current phase and update state
   */
  public setPhase(phase: PhaseType): void {
    this.currentPhase = phase;
    this.reportProgress(`Starting ${phase} phase`);
  }

  /**
   * Report progress update with enhanced options
   */
  public reportProgress(
    message: string, 
    increment?: number, 
    options?: { cancellable?: boolean; showInStatusBar?: boolean }
  ): void {
    this.progress.report({ 
      message, 
      increment,
      cancellable: options?.cancellable,
      showInStatusBar: options?.showInStatusBar
    });
  }

  /**
   * Cancel the session
   */
  public cancel(): void {
    this.setState(SessionState.CANCELLED, 'Session cancelled');
    this._cancellationTokenSource.cancel();
  }

  /**
   * Check if session is cancelled
   */
  public isCancelled(): boolean {
    return this.cancellationToken.isCancellationRequested;
  }

  /**
   * Mark session as completed
   */
  public complete(): void {
    this.setState(SessionState.COMPLETED, 'Session completed successfully');
  }

  /**
   * Mark session as error with detailed error information
   */
  public error(errorMessage: string, errorDetails?: Partial<SessionError>): void {
    this.setState(SessionState.ERROR, `Session failed: ${errorMessage}`);
    
    this._lastError = {
      message: errorMessage,
      code: errorDetails?.code || 'UNKNOWN_ERROR',
      recoverable: errorDetails?.recoverable ?? true,
      suggestedFix: errorDetails?.suggestedFix,
      configurationLink: errorDetails?.configurationLink,
      timestamp: new Date()
    };
    
    this.metadata.error = errorMessage;
    this.metadata.errorTime = new Date();
    this.metadata.lastError = this._lastError;
  }

  /**
   * Get the last error that occurred in this session
   */
  public getLastError(): SessionError | null {
    return this._lastError;
  }

  /**
   * Clear the last error
   */
  public clearError(): void {
    this._lastError = null;
    delete this.metadata.error;
    delete this.metadata.errorTime;
    delete this.metadata.lastError;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this._cancellationTokenSource.dispose();
  }
}