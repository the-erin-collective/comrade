/**
 * Base Runner class with common functionality for all runners
 */

import * as vscode from 'vscode';
import { IAgent } from '../core/agent';
import { ISession, SessionState } from '../core/session';

export interface RunnerResult {
  success: boolean;
  data?: any;
  error?: Error;
  metadata?: Record<string, any>;
}

export interface RunnerError extends Error {
  code: string;
  recoverable: boolean;
  context?: Record<string, any>;
}

/**
 * Abstract base class for all runners with common functionality
 */
export abstract class BaseRunner {
  protected session: ISession;
  protected agent: IAgent;
  protected personality: string;

  constructor(session: ISession, agent: IAgent, personality: string) {
    this.session = session;
    this.agent = agent;
    this.personality = personality;
  }

  /**
   * Execute the runner operation
   */
  public async run(): Promise<RunnerResult> {
    try {
      // Check if session is cancelled before starting
      if (this.session.isCancelled()) {
        return {
          success: false,
          error: new Error('Session was cancelled before execution')
        };
      }

      // Validate inputs before execution
      if (!this.validateInputs()) {
        const error = new Error('Input validation failed');
        await this.handleError(error);
        return {
          success: false,
          error
        };
      }

      // Report start of execution
      this.session.reportProgress(`Starting ${this.getRunnerName()}`);

      // Execute the main operation
      const result = await this.execute();

      // Check for cancellation after execution
      if (this.session.isCancelled()) {
        return {
          success: false,
          error: new Error('Session was cancelled during execution')
        };
      }

      // Report completion
      this.session.reportProgress(`Completed ${this.getRunnerName()}`);

      return result;
    } catch (error) {
      await this.handleError(error as Error);
      return {
        success: false,
        error: error as Error
      };
    }
  }

  /**
   * Abstract method to be implemented by concrete runners
   */
  protected abstract execute(): Promise<RunnerResult>;

  /**
   * Validate inputs before execution
   */
  protected abstract validateInputs(): boolean;

  /**
   * Handle errors that occur during execution
   */
  protected abstract handleError(error: Error): Promise<void>;

  /**
   * Get the name of this runner for progress reporting
   */
  protected abstract getRunnerName(): string;

  /**
   * Check if the session is cancelled and throw if so
   */
  protected checkCancellation(): void {
    if (this.session.isCancelled()) {
      throw new Error('Operation was cancelled');
    }
  }

  /**
   * Report progress with cancellation check
   */
  protected reportProgress(message: string, increment?: number): void {
    this.checkCancellation();
    this.session.reportProgress(message, increment);
  }

  /**
   * Create a recoverable error
   */
  protected createRecoverableError(message: string, code: string, context?: Record<string, any>): RunnerError {
    const error = new Error(message) as RunnerError;
    error.code = code;
    error.recoverable = true;
    error.context = context;
    return error;
  }

  /**
   * Create a non-recoverable error
   */
  protected createFatalError(message: string, code: string, context?: Record<string, any>): RunnerError {
    const error = new Error(message) as RunnerError;
    error.code = code;
    error.recoverable = false;
    error.context = context;
    return error;
  }

  /**
   * Validate that the agent is available
   */
  protected async validateAgent(): Promise<boolean> {
    try {
      return await this.agent.isAvailable();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get workspace root path
   */
  protected getWorkspaceRoot(): string {
    return this.session.workspaceUri.fsPath;
  }

  /**
   * Check if a file exists in the workspace
   */
  protected async fileExists(relativePath: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.joinPath(this.session.workspaceUri, relativePath);
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a file from the workspace
   */
  protected async readWorkspaceFile(relativePath: string): Promise<string> {
    const uri = vscode.Uri.joinPath(this.session.workspaceUri, relativePath);
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString('utf8');
  }

  /**
   * Write a file to the workspace
   */
  protected async writeWorkspaceFile(relativePath: string, content: string): Promise<void> {
    const uri = vscode.Uri.joinPath(this.session.workspaceUri, relativePath);
    const buffer = Buffer.from(content, 'utf8');
    await vscode.workspace.fs.writeFile(uri, buffer);
  }

  /**
   * Create a directory in the workspace
   */
  protected async createWorkspaceDirectory(relativePath: string): Promise<void> {
    const uri = vscode.Uri.joinPath(this.session.workspaceUri, relativePath);
    await vscode.workspace.fs.createDirectory(uri);
  }

  /**
   * Default error handling implementation
   */
  protected async defaultErrorHandler(error: Error): Promise<void> {
    // Log the error
    console.error(`Error in ${this.getRunnerName()}:`, error);

    // Update session state
    this.session.error(`${this.getRunnerName()} failed: ${error.message}`);

    // Only show error notification in non-test environment
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') {
      const action = await vscode.window.showErrorMessage(
        `${this.getRunnerName()} failed: ${error.message}`,
        'Retry',
        'Cancel'
      );

      if (action === 'Retry') {
        // Mark for retry (implementation depends on specific runner)
        this.session.metadata.retryRequested = true;
      }
    }
  }
}