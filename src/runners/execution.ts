/**
 * ExecutionRunner for sequential action list processing with recovery capabilities
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BaseRunner, RunnerResult, RunnerError } from './base';
import { ActionList, Action, ActionType, ActionStatus, ActionResult } from '../core/workspace';
import { ChatMessage, IChatBridge, ChatBridge } from '../core/chat';
import { IAgent } from '../core/agent';
import { ISession, SessionState } from '../core/session';

interface ExecutionOptions {
  dryRun?: boolean;
  continueOnError?: boolean;
  maxRetries?: number;
  enableRecovery?: boolean;
}

interface ExecutionSummary {
  totalActions: number;
  completedActions: number;
  failedActions: number;
  skippedActions: number;
  executionTime: number;
  recoveryAttempts: number;
}

/**
 * ExecutionRunner processes action lists sequentially with progress tracking and recovery
 */
export class ExecutionRunner extends BaseRunner {
  private chatBridge: IChatBridge;
  private actionList?: ActionList;
  private options: ExecutionOptions;
  private executionStartTime: Date = new Date();
  private recoveryAttempts: number = 0;

  constructor(
    session: ISession,
    agent: IAgent,
    personality: string,
    options: ExecutionOptions = {}
  ) {
    super(session, agent, personality);
    this.chatBridge = new ChatBridge();
    this.options = {
      dryRun: false,
      continueOnError: true,
      maxRetries: 2,
      enableRecovery: true,
      ...options
    };
  }

  protected getRunnerName(): string {
    return 'Execution';
  }

  protected validateInputs(): boolean {
    // Check if agent is available
    if (!this.agent) {
      return false;
    }

    // Check if workspace is available
    if (!this.session.workspaceUri) {
      return false;
    }

    return true;
  }

  protected async execute(): Promise<RunnerResult> {
    try {
      this.executionStartTime = new Date();
      this.reportProgress('Loading action list...');
      
      // Load action list from workspace
      await this.loadActionList();
      
      if (!this.actionList || this.actionList.actions.length === 0) {
        throw new Error('No actions to execute. Please run planning first.');
      }

      this.reportProgress(`Starting execution of ${this.actionList.actions.length} actions...`);
      
      // Update session state
      this.session.setState(SessionState.EXECUTION, 'Executing action list');
      
      // Process actions sequentially
      const executionResult = await this.processActionList();
      
      // Generate execution summary
      const summary = this.generateExecutionSummary();
      
      this.reportProgress('Saving execution results...');
      
      // Save updated action list with results
      await this.saveActionList();
      
      // Generate execution report
      await this.generateExecutionReport(summary);
      
      return {
        success: executionResult.success,
        data: {
          actionList: this.actionList,
          summary,
          recoveryAttempts: this.recoveryAttempts
        },
        metadata: {
          totalActions: this.actionList.actions.length,
          completedActions: summary.completedActions,
          failedActions: summary.failedActions,
          executionTime: summary.executionTime,
          recoveryAttempts: this.recoveryAttempts
        }
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw this.createRecoverableError(
        `Execution failed: ${errorMessage}`,
        'EXECUTION_FAILED',
        { 
          error: errorMessage,
          recoveryAttempts: this.recoveryAttempts,
          completedActions: this.getCompletedActionsCount()
        }
      );
    }
  }

  protected async handleError(error: Error): Promise<void> {
    // If recovery is enabled and this is a recoverable error, attempt recovery
    if (this.options.enableRecovery && (error as RunnerError).recoverable && this.recoveryAttempts < 2) {
      this.reportProgress('Attempting recovery through re-planning...');
      
      try {
        await this.attemptRecovery(error);
        return; // Recovery successful, continue execution
      } catch (recoveryError) {
        // Recovery failed, fall back to default error handling
        console.error('Recovery attempt failed:', recoveryError);
      }
    }

    await this.defaultErrorHandler(error);
  }

  /**
   * Load action list from workspace
   */
  private async loadActionList(): Promise<void> {
    try {
      const actionListExists = await this.fileExists('.comrade/action-list.json');
      if (!actionListExists) {
        throw new Error('Action list not found. Please run planning first.');
      }

      const actionListContent = await this.readWorkspaceFile('.comrade/action-list.json');
      this.actionList = JSON.parse(actionListContent);
      
      // Validate action list structure
      if (!this.actionList?.actions || !Array.isArray(this.actionList.actions)) {
        throw new Error('Invalid action list format');
      }
      
      // Reset any previous execution status
      for (const action of this.actionList.actions) {
        if (action.status === ActionStatus.IN_PROGRESS) {
          action.status = ActionStatus.PENDING;
        }
      }
      
    } catch (error) {
      throw new Error(`Failed to load action list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process the action list sequentially
   */
  private async processActionList(): Promise<{ success: boolean; errors: Error[] }> {
    const errors: Error[] = [];
    let success = true;

    if (!this.actionList) {
      throw new Error('Action list not loaded');
    }

    for (let i = 0; i < this.actionList.actions.length; i++) {
      const action = this.actionList.actions[i];
      
      this.checkCancellation();
      
      // Check if dependencies are satisfied
      if (!this.areDependenciesSatisfied(action)) {
        action.status = ActionStatus.SKIPPED;
        action.result = {
          success: false,
          error: 'Dependencies not satisfied',
          timestamp: new Date()
        };
        continue;
      }

      this.reportProgress(
        `Executing action ${i + 1}/${this.actionList.actions.length}: ${action.description}`,
        (i / this.actionList.actions.length) * 100
      );

      try {
        // Execute the action
        const result = await this.executeAction(action);
        
        action.status = result.success ? ActionStatus.COMPLETED : ActionStatus.FAILED;
        action.result = result;
        
        if (!result.success) {
          errors.push(new Error(`Action ${action.id} failed: ${result.error}`));
          
          if (!this.options.continueOnError) {
            success = false;
            break;
          }
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        action.status = ActionStatus.FAILED;
        action.result = {
          success: false,
          error: errorMessage,
          timestamp: new Date()
        };
        
        errors.push(error as Error);
        
        if (!this.options.continueOnError) {
          success = false;
          break;
        }
      }
    }

    return { success: success && errors.length === 0, errors };
  }

  /**
   * Check if action dependencies are satisfied
   */
  private areDependenciesSatisfied(action: Action): boolean {
    if (!this.actionList || action.dependencies.length === 0) {
      return true;
    }

    for (const depId of action.dependencies) {
      const dependency = this.actionList.actions.find(a => a.id === depId);
      if (!dependency || dependency.status !== ActionStatus.COMPLETED) {
        return false;
      }
    }

    return true;
  }

  /**
   * Execute a single action
   */
  private async executeAction(action: Action): Promise<ActionResult> {
    action.status = ActionStatus.IN_PROGRESS;
    
    if (this.options.dryRun) {
      return {
        success: true,
        output: `[DRY RUN] Would execute: ${action.description}`,
        timestamp: new Date()
      };
    }

    try {
      switch (action.type) {
        case ActionType.CREATE_FILE:
          return await this.executeCreateFile(action);
        case ActionType.MODIFY_FILE:
          return await this.executeModifyFile(action);
        case ActionType.DELETE_FILE:
          return await this.executeDeleteFile(action);
        case ActionType.RUN_COMMAND:
          return await this.executeRunCommand(action);
        case ActionType.INSTALL_DEPENDENCY:
          return await this.executeInstallDependency(action);
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      };
    }
  }

  /**
   * Execute file creation action
   */
  private async executeCreateFile(action: Action): Promise<ActionResult> {
    const filePath = action.parameters.filePath as string;
    if (!filePath) {
      throw new Error('File path not specified for create file action');
    }

    // Check if file already exists
    const fileExists = await this.fileExists(filePath);
    if (fileExists) {
      return {
        success: false,
        error: `File ${filePath} already exists`,
        timestamp: new Date()
      };
    }

    // Generate file content using the agent
    const content = await this.generateFileContent(action);
    
    // Create directory if it doesn't exist
    const dirPath = path.dirname(filePath);
    if (dirPath !== '.' && dirPath !== '') {
      try {
        await this.createWorkspaceDirectory(dirPath);
      } catch (error) {
        // Directory might already exist, continue
      }
    }

    // Write the file
    await this.writeWorkspaceFile(filePath, content);

    return {
      success: true,
      output: `Created file: ${filePath} (${content.length} characters)`,
      timestamp: new Date()
    };
  }

  /**
   * Execute file modification action
   */
  private async executeModifyFile(action: Action): Promise<ActionResult> {
    const filePath = action.parameters.filePath as string;
    if (!filePath) {
      throw new Error('File path not specified for modify file action');
    }

    // Check if file exists
    const fileExists = await this.fileExists(filePath);
    if (!fileExists) {
      return {
        success: false,
        error: `File ${filePath} does not exist`,
        timestamp: new Date()
      };
    }

    // Read current content
    const currentContent = await this.readWorkspaceFile(filePath);
    
    // Generate modified content using the agent
    const modifiedContent = await this.generateModifiedFileContent(action, currentContent);
    
    // Write the modified file
    await this.writeWorkspaceFile(filePath, modifiedContent);

    return {
      success: true,
      output: `Modified file: ${filePath}`,
      timestamp: new Date()
    };
  }

  /**
   * Execute file deletion action
   */
  private async executeDeleteFile(action: Action): Promise<ActionResult> {
    const filePath = action.parameters.filePath as string;
    if (!filePath) {
      throw new Error('File path not specified for delete file action');
    }

    // Check if file exists
    const fileExists = await this.fileExists(filePath);
    if (!fileExists) {
      return {
        success: true,
        output: `File ${filePath} does not exist (already deleted)`,
        timestamp: new Date()
      };
    }

    // Delete the file
    const uri = vscode.Uri.joinPath(this.session.workspaceUri, filePath);
    await vscode.workspace.fs.delete(uri);

    return {
      success: true,
      output: `Deleted file: ${filePath}`,
      timestamp: new Date()
    };
  }

  /**
   * Execute shell command action
   */
  private async executeRunCommand(action: Action): Promise<ActionResult> {
    const command = action.parameters.command as string;
    if (!command) {
      throw new Error('Command not specified for run command action');
    }

    const workingDirectory = action.parameters.workingDirectory as string || this.getWorkspaceRoot();

    try {
      // Use VS Code's terminal API for command execution
      const result = await this.executeShellCommand(command, workingDirectory);
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.exitCode !== 0 ? result.stderr : undefined,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      };
    }
  }

  /**
   * Execute dependency installation action
   */
  private async executeInstallDependency(action: Action): Promise<ActionResult> {
    const packageName = action.parameters.packageName as string;
    const packageManager = action.parameters.packageManager as string || 'npm';
    
    if (!packageName) {
      throw new Error('Package name not specified for install dependency action');
    }

    let command: string;
    switch (packageManager.toLowerCase()) {
      case 'npm':
        command = `npm install ${packageName}`;
        break;
      case 'yarn':
        command = `yarn add ${packageName}`;
        break;
      case 'pip':
        command = `pip install ${packageName}`;
        break;
      case 'cargo':
        command = `cargo add ${packageName}`;
        break;
      default:
        throw new Error(`Unsupported package manager: ${packageManager}`);
    }

    const isDev = action.parameters.isDev as boolean;
    if (isDev) {
      if (packageManager === 'npm') {
        command += ' --save-dev';
      } else if (packageManager === 'yarn') {
        command += ' --dev';
      }
    }

    try {
      const result = await this.executeShellCommand(command, this.getWorkspaceRoot());
      
      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.exitCode !== 0 ? result.stderr : undefined,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      };
    }
  }

  /**
   * Generate file content using the agent
   */
  private async generateFileContent(action: Action): Promise<string> {
    const messages: ChatMessage[] = [];
    
    // System message with context
    messages.push({
      role: 'system',
      content: this.buildFileGenerationSystemPrompt(),
      timestamp: new Date()
    });
    
    // User message with specific requirements
    messages.push({
      role: 'user',
      content: this.buildFileGenerationUserPrompt(action),
      timestamp: new Date()
    });

    try {
      const response = await this.chatBridge.sendMessage(this.agent, messages, {
        temperature: 0.3,
        maxTokens: 2000
      });
      
      // Extract code content from response
      return this.extractCodeFromResponse(response.content, action.parameters.language as string);
      
    } catch (error) {
      throw new Error(`Failed to generate file content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate modified file content using the agent
   */
  private async generateModifiedFileContent(action: Action, currentContent: string): Promise<string> {
    const messages: ChatMessage[] = [];
    
    // System message with context
    messages.push({
      role: 'system',
      content: this.buildFileModificationSystemPrompt(),
      timestamp: new Date()
    });
    
    // User message with current content and modification requirements
    messages.push({
      role: 'user',
      content: this.buildFileModificationUserPrompt(action, currentContent),
      timestamp: new Date()
    });

    try {
      const response = await this.chatBridge.sendMessage(this.agent, messages, {
        temperature: 0.3,
        maxTokens: 3000
      });
      
      // Extract modified code content from response
      return this.extractCodeFromResponse(response.content, action.parameters.language as string);
      
    } catch (error) {
      throw new Error(`Failed to generate modified file content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute shell command with proper error handling
   */
  private async executeShellCommand(command: string, workingDirectory: string): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      // Determine shell based on platform
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd' : 'bash';
      const shellArgs = isWindows ? ['/c'] : ['-c'];
      
      const child = spawn(shell, [...shellArgs, command], {
        cwd: workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number) => {
        resolve({
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      child.on('error', (error: Error) => {
        reject(error);
      });

      // Set timeout for long-running commands
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out: ${command}`));
      }, 300000); // 5 minutes

      child.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Build system prompt for file generation
   */
  private buildFileGenerationSystemPrompt(): string {
    return `You are an expert software developer. Your task is to generate file content based on the provided action description and parameters.

GUIDELINES:
1. Generate clean, well-structured, and properly formatted code
2. Follow best practices for the target language
3. Include appropriate comments and documentation
4. Ensure the code is functional and follows the specified requirements
5. Only return the file content, no additional explanation

${this.personality}`;
  }

  /**
   * Build user prompt for file generation
   */
  private buildFileGenerationUserPrompt(action: Action): string {
    const filePath = action.parameters.filePath as string;
    const language = action.parameters.language as string;
    
    let prompt = `Generate content for the following file:

FILE PATH: ${filePath}
LANGUAGE: ${language || 'auto-detect from extension'}
DESCRIPTION: ${action.description}

`;

    // Add any additional parameters
    if (action.parameters.template) {
      prompt += `TEMPLATE: ${action.parameters.template}\n`;
    }
    
    if (action.parameters.requirements) {
      prompt += `REQUIREMENTS: ${action.parameters.requirements}\n`;
    }

    prompt += '\nGenerate the complete file content:';
    
    return prompt;
  }

  /**
   * Build system prompt for file modification
   */
  private buildFileModificationSystemPrompt(): string {
    return `You are an expert software developer. Your task is to modify existing file content based on the provided requirements.

GUIDELINES:
1. Preserve existing functionality unless explicitly asked to change it
2. Make minimal, targeted changes to achieve the requirements
3. Maintain code style and formatting consistency
4. Ensure all modifications are syntactically correct
5. Only return the complete modified file content, no additional explanation

${this.personality}`;
  }

  /**
   * Build user prompt for file modification
   */
  private buildFileModificationUserPrompt(action: Action, currentContent: string): string {
    const filePath = action.parameters.filePath as string;
    
    let prompt = `Modify the following file:

FILE PATH: ${filePath}
MODIFICATION REQUIRED: ${action.description}

CURRENT CONTENT:
\`\`\`
${currentContent}
\`\`\`

`;

    if (action.parameters.requirements) {
      prompt += `ADDITIONAL REQUIREMENTS: ${action.parameters.requirements}\n`;
    }

    prompt += '\nProvide the complete modified file content:';
    
    return prompt;
  }

  /**
   * Extract code content from agent response
   */
  private extractCodeFromResponse(response: string, language?: string): string {
    // Look for code blocks first
    const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);
    
    if (match) {
      return match[1].trim();
    }
    
    // If no code blocks found, return the entire response (cleaned up)
    return response.trim();
  }

  /**
   * Attempt recovery through re-planning
   */
  private async attemptRecovery(error: Error): Promise<void> {
    this.recoveryAttempts++;
    this.reportProgress(`Recovery attempt ${this.recoveryAttempts}: Analyzing failure and re-planning...`);
    
    try {
      // Get current execution state
      const executionState = this.getCurrentExecutionState();
      
      // Generate recovery plan using the agent
      const recoveryPlan = await this.generateRecoveryPlan(error, executionState);
      
      // Apply recovery modifications to remaining actions
      await this.applyRecoveryPlan(recoveryPlan);
      
      this.reportProgress('Recovery plan applied, continuing execution...');
      
    } catch (recoveryError) {
      throw new Error(`Recovery failed: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`);
    }
  }

  /**
   * Get current execution state for recovery
   */
  private getCurrentExecutionState(): string {
    if (!this.actionList) {
      return 'No action list available';
    }

    const completed = this.actionList.actions.filter(a => a.status === ActionStatus.COMPLETED);
    const failed = this.actionList.actions.filter(a => a.status === ActionStatus.FAILED);
    const pending = this.actionList.actions.filter(a => a.status === ActionStatus.PENDING);

    let state = `EXECUTION STATE:
- Completed actions: ${completed.length}
- Failed actions: ${failed.length}
- Pending actions: ${pending.length}

`;

    if (failed.length > 0) {
      state += 'FAILED ACTIONS:\n';
      for (const action of failed) {
        state += `- ${action.description}: ${action.result?.error || 'Unknown error'}\n`;
      }
      state += '\n';
    }

    if (pending.length > 0) {
      state += 'REMAINING ACTIONS:\n';
      for (const action of pending.slice(0, 5)) { // Show first 5 pending actions
        state += `- ${action.description}\n`;
      }
      if (pending.length > 5) {
        state += `... and ${pending.length - 5} more actions\n`;
      }
    }

    return state;
  }

  /**
   * Generate recovery plan using the agent
   */
  private async generateRecoveryPlan(error: Error, executionState: string): Promise<string> {
    const messages: ChatMessage[] = [];
    
    messages.push({
      role: 'system',
      content: `You are an expert software developer helping with execution recovery. Analyze the execution failure and provide a recovery plan.

GUIDELINES:
1. Identify the root cause of the failure
2. Suggest modifications to remaining actions to avoid similar failures
3. Provide alternative approaches if needed
4. Keep the recovery plan focused and actionable

${this.personality}`,
      timestamp: new Date()
    });
    
    messages.push({
      role: 'user',
      content: `EXECUTION FAILURE:
Error: ${error.message}

${executionState}

Please analyze the failure and provide a recovery plan for the remaining actions.`,
      timestamp: new Date()
    });

    try {
      const response = await this.chatBridge.sendMessage(this.agent, messages, {
        temperature: 0.5,
        maxTokens: 1500
      });
      
      return response.content;
      
    } catch (recoveryError) {
      throw new Error(`Failed to generate recovery plan: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`);
    }
  }

  /**
   * Apply recovery plan to remaining actions
   */
  private async applyRecoveryPlan(recoveryPlan: string): Promise<void> {
    // This is a simplified implementation
    // In a more sophisticated version, we would parse the recovery plan
    // and make specific modifications to the action list
    
    if (!this.actionList) {
      return;
    }

    // For now, we'll mark failed actions as skipped and continue with pending ones
    for (const action of this.actionList.actions) {
      if (action.status === ActionStatus.FAILED) {
        action.status = ActionStatus.SKIPPED;
        if (action.result) {
          action.result.error = `Skipped due to recovery: ${action.result.error}`;
        }
      }
    }

    // Log the recovery plan for reference
    console.log('Recovery plan applied:', recoveryPlan);
  }

  /**
   * Generate execution summary
   */
  private generateExecutionSummary(): ExecutionSummary {
    if (!this.actionList) {
      return {
        totalActions: 0,
        completedActions: 0,
        failedActions: 0,
        skippedActions: 0,
        executionTime: 0,
        recoveryAttempts: this.recoveryAttempts
      };
    }

    const totalActions = this.actionList.actions.length;
    const completedActions = this.actionList.actions.filter(a => a.status === ActionStatus.COMPLETED).length;
    const failedActions = this.actionList.actions.filter(a => a.status === ActionStatus.FAILED).length;
    const skippedActions = this.actionList.actions.filter(a => a.status === ActionStatus.SKIPPED).length;
    const executionTime = Date.now() - this.executionStartTime.getTime();

    return {
      totalActions,
      completedActions,
      failedActions,
      skippedActions,
      executionTime,
      recoveryAttempts: this.recoveryAttempts
    };
  }

  /**
   * Get count of completed actions
   */
  private getCompletedActionsCount(): number {
    if (!this.actionList) {
      return 0;
    }
    return this.actionList.actions.filter(a => a.status === ActionStatus.COMPLETED).length;
  }

  /**
   * Save updated action list with execution results
   */
  private async saveActionList(): Promise<void> {
    if (!this.actionList) {
      return;
    }

    // Update timestamp
    this.actionList.timestamp = new Date().toISOString();
    
    // Save action-list.json
    const actionListJson = JSON.stringify(this.actionList, null, 2);
    await this.writeWorkspaceFile('.comrade/action-list.json', actionListJson);
  }

  /**
   * Generate execution report
   */
  private async generateExecutionReport(summary: ExecutionSummary): Promise<void> {
    const reportContent = this.buildExecutionReportContent(summary);
    
    // Ensure .comrade directory exists
    try {
      await this.createWorkspaceDirectory('.comrade');
    } catch {
      // Directory might already exist
    }
    
    await this.writeWorkspaceFile('.comrade/execution-report.md', reportContent);
  }

  /**
   * Build execution report content
   */
  private buildExecutionReportContent(summary: ExecutionSummary): string {
    const timestamp = new Date().toISOString();
    const duration = Math.round(summary.executionTime / 1000); // Convert to seconds
    
    let report = `# Execution Report

**Generated:** ${timestamp}  
**Workspace:** ${this.getWorkspaceRoot()}  
**Duration:** ${duration} seconds  
**Recovery Attempts:** ${summary.recoveryAttempts}

## Summary

- **Total Actions:** ${summary.totalActions}
- **Completed:** ${summary.completedActions}
- **Failed:** ${summary.failedActions}
- **Skipped:** ${summary.skippedActions}
- **Success Rate:** ${summary.totalActions > 0 ? Math.round((summary.completedActions / summary.totalActions) * 100) : 0}%

`;

    if (!this.actionList) {
      return report;
    }

    // Add detailed action results
    report += '## Action Results\n\n';
    
    for (let i = 0; i < this.actionList.actions.length; i++) {
      const action = this.actionList.actions[i];
      const statusIcon = this.getStatusIcon(action.status);
      
      report += `### ${i + 1}. ${statusIcon} ${action.description}\n\n`;
      report += `- **Type:** ${action.type.replace('_', ' ')}\n`;
      report += `- **Status:** ${action.status}\n`;
      
      if (action.parameters.filePath) {
        report += `- **File:** \`${action.parameters.filePath}\`\n`;
      }
      
      if (action.parameters.command) {
        report += `- **Command:** \`${action.parameters.command}\`\n`;
      }
      
      if (action.result) {
        if (action.result.output) {
          report += `- **Output:** ${action.result.output}\n`;
        }
        
        if (action.result.error) {
          report += `- **Error:** ${action.result.error}\n`;
        }
        
        report += `- **Timestamp:** ${action.result.timestamp.toISOString()}\n`;
      }
      
      report += '\n';
    }

    // Add recovery information if applicable
    if (summary.recoveryAttempts > 0) {
      report += '## Recovery Information\n\n';
      report += `This execution required ${summary.recoveryAttempts} recovery attempt(s) due to failures during execution. `;
      report += 'The system attempted to re-plan and modify remaining actions to continue execution.\n\n';
    }

    report += '---\n\n*This report was generated by Comrade Execution Agent*\n';
    
    return report;
  }

  /**
   * Get status icon for action status
   */
  private getStatusIcon(status: ActionStatus): string {
    switch (status) {
      case ActionStatus.COMPLETED:
        return '✅';
      case ActionStatus.FAILED:
        return '❌';
      case ActionStatus.SKIPPED:
        return '⏭️';
      case ActionStatus.IN_PROGRESS:
        return '🔄';
      case ActionStatus.PENDING:
        return '⏳';
      default:
        return '❓';
    }
  }
}