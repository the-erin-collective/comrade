/**
 * Base Runner class with common functionality for all runners
 */

import * as vscode from 'vscode';
import { IAgent } from '../core/agent';
import { ISession, SessionState } from '../core/session';
import { WebFileSystem, WebCompatibility } from '../core/webcompat';

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
  suggestedFix?: string;
  configurationLink?: string;
}

export interface ErrorRecoveryOptions {
  retry: boolean;
  reconfigure: boolean;
  skip: boolean;
  abort: boolean;
}

export interface OperationTimeout {
  duration: number;
  message: string;
  allowExtension: boolean;
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
   * Execute the runner operation with timeout and cancellation support
   */
  public async run(timeout?: OperationTimeout): Promise<RunnerResult> {
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
        const error = this.createRecoverableError(
          'Input validation failed',
          'VALIDATION_ERROR',
          { runner: this.getRunnerName() }
        );
        error.suggestedFix = 'Check your configuration and try again';
        await this.handleError(error);
        return {
          success: false,
          error
        };
      }

      // Report start of execution
      this.session.reportProgress(`Starting ${this.getRunnerName()}`);

      // Execute with timeout if specified
      let result: RunnerResult;
      if (timeout) {
        result = await this.executeWithTimeout(timeout);
      } else {
        result = await this.execute();
      }

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
   * Execute operation with timeout support
   */
  private async executeWithTimeout(timeout: OperationTimeout): Promise<RunnerResult> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        if (timeout.allowExtension) {
          const shouldExtend = await this.handleTimeout(timeout);
          if (shouldExtend) {
            // Extend timeout by same duration
            setTimeout(() => {
              reject(new Error(`Operation timed out after extended period: ${timeout.message}`));
            }, timeout.duration);
            return;
          }
        }
        reject(new Error(`Operation timed out: ${timeout.message}`));
      }, timeout.duration);

      try {
        const result = await this.execute();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Handle operation timeout with user confirmation
   */
  private async handleTimeout(timeout: OperationTimeout): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') {
      return false;
    }

    const action = await vscode.window.showWarningMessage(
      `${this.getRunnerName()} is taking longer than expected. ${timeout.message}`,
      'Extend Timeout',
      'Cancel Operation'
    );

    return action === 'Extend Timeout';
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
   * Create a recoverable error with suggested fix
   */
  protected createRecoverableError(
    message: string, 
    code: string, 
    context?: Record<string, any>,
    suggestedFix?: string,
    configurationLink?: string
  ): RunnerError {
    const error = new Error(message) as RunnerError;
    error.code = code;
    error.recoverable = true;
    error.context = context;
    error.suggestedFix = suggestedFix;
    error.configurationLink = configurationLink;
    return error;
  }

  /**
   * Create a non-recoverable error with suggested fix
   */
  protected createFatalError(
    message: string, 
    code: string, 
    context?: Record<string, any>,
    suggestedFix?: string,
    configurationLink?: string
  ): RunnerError {
    const error = new Error(message) as RunnerError;
    error.code = code;
    error.recoverable = false;
    error.context = context;
    error.suggestedFix = suggestedFix;
    error.configurationLink = configurationLink;
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
   * Check if a file exists in the workspace (web-compatible)
   */
  protected async fileExists(relativePath: string): Promise<boolean> {
    const uri = vscode.Uri.joinPath(this.session.workspaceUri, relativePath);
    return WebFileSystem.exists(uri);
  }

  /**
   * Read a file from the workspace (web-compatible)
   */
  protected async readWorkspaceFile(relativePath: string): Promise<string> {
    const uri = vscode.Uri.joinPath(this.session.workspaceUri, relativePath);
    return WebFileSystem.readFile(uri);
  }

  /**
   * Write a file to the workspace (web-compatible)
   */
  protected async writeWorkspaceFile(relativePath: string, content: string): Promise<void> {
    const uri = vscode.Uri.joinPath(this.session.workspaceUri, relativePath);
    await WebFileSystem.writeFile(uri, content);
  }

  /**
   * Create a directory in the workspace (web-compatible)
   */
  protected async createWorkspaceDirectory(relativePath: string): Promise<void> {
    const uri = vscode.Uri.joinPath(this.session.workspaceUri, relativePath);
    await WebFileSystem.createDirectory(uri);
  }

  /**
   * Enhanced error handling with recovery options
   */
  protected async defaultErrorHandler(error: Error): Promise<ErrorRecoveryOptions> {
    // Log the error
    console.error(`Error in ${this.getRunnerName()}:`, error);

    // Update session state
    this.session.error(`${this.getRunnerName()} failed: ${error.message}`);

    const runnerError = error as RunnerError;
    const recoveryOptions: ErrorRecoveryOptions = {
      retry: false,
      reconfigure: false,
      skip: false,
      abort: true
    };

    // Only show error notification in non-test environment
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') {
      const actions: string[] = [];
      
      if (runnerError.recoverable) {
        actions.push('Retry');
      }
      
      if (runnerError.configurationLink) {
        actions.push('Configure');
      }
      
      if (runnerError.recoverable) {
        actions.push('Skip');
      }
      
      actions.push('Abort');

      let message = `${this.getRunnerName()} failed: ${error.message}`;
      if (runnerError.suggestedFix) {
        message += `\n\nSuggested fix: ${runnerError.suggestedFix}`;
      }

      const action = await vscode.window.showErrorMessage(message, ...actions);

      switch (action) {
        case 'Retry':
          recoveryOptions.retry = true;
          recoveryOptions.abort = false;
          this.session.metadata.retryRequested = true;
          break;
        case 'Configure':
          recoveryOptions.reconfigure = true;
          recoveryOptions.abort = false;
          if (runnerError.configurationLink) {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(runnerError.configurationLink));
          }
          break;
        case 'Skip':
          recoveryOptions.skip = true;
          recoveryOptions.abort = false;
          break;
        default:
          recoveryOptions.abort = true;
      }
    }

    return recoveryOptions;
  }

  /**
   * Handle network-related errors with specific recovery options
   */
  protected async handleNetworkError(error: Error, endpoint?: string): Promise<ErrorRecoveryOptions> {
    const networkError = this.createRecoverableError(
      `Network error: ${error.message}`,
      'NETWORK_ERROR',
      { endpoint, originalError: error.message },
      'Check your internet connection and API configuration',
      'command:comrade.openApiConfig'
    );

    return this.defaultErrorHandler(networkError);
  }

  /**
   * Handle authentication errors with configuration link
   */
  protected async handleAuthError(error: Error, provider?: string): Promise<ErrorRecoveryOptions> {
    const authError = this.createRecoverableError(
      `Authentication failed: ${error.message}`,
      'AUTH_ERROR',
      { provider, originalError: error.message },
      'Check your API key configuration',
      'command:comrade.openApiConfig'
    );

    return this.defaultErrorHandler(authError);
  }

  /**
   * Handle rate limit errors with retry suggestion
   */
  protected async handleRateLimitError(error: Error, retryAfter?: number): Promise<ErrorRecoveryOptions> {
    const rateLimitError = this.createRecoverableError(
      `Rate limit exceeded: ${error.message}`,
      'RATE_LIMIT_ERROR',
      { retryAfter, originalError: error.message },
      retryAfter ? `Wait ${retryAfter} seconds before retrying` : 'Wait before retrying or switch to a different model'
    );

    return this.defaultErrorHandler(rateLimitError);
  }
}