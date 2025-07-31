/**
 * PlanningRunner for iterative plan generation
 */

import * as vscode from 'vscode';
import { BaseRunner, RunnerResult } from './base';
import { WorkspaceContext, ActionList, Action, ActionType, ActionStatus, ActionMetadata } from '../core/workspace';
import { ChatMessage, IChatBridge, ChatBridge } from '../core/chat';
import { IAgent } from '../core/agent';
import { ISession } from '../core/session';

interface PlanningIteration {
  iteration: number;
  userRequirements: string;
  contextSummary: string;
  generatedPlan: string;
  actionList: Action[];
  feedback?: string;
  timestamp: Date;
}

interface PlanningOptions {
  maxIterations?: number;
  requireUserApproval?: boolean;
  includeDetailedSpec?: boolean;
}

/**
 * PlanningRunner implements reactive iterative loop for plan generation
 */
export class PlanningRunner extends BaseRunner {
  private chatBridge: IChatBridge;
  private workspaceContext?: WorkspaceContext;
  private iterations: PlanningIteration[] = [];
  private options: PlanningOptions;

  constructor(
    session: ISession,
    agent: IAgent,
    personality: string,
    options: PlanningOptions = {}
  ) {
    super(session, agent, personality);
    this.chatBridge = new ChatBridge();
    this.options = {
      maxIterations: 3,
      requireUserApproval: false,
      includeDetailedSpec: true,
      ...options
    };
  }

  protected getRunnerName(): string {
    return 'Planning';
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
      this.reportProgress('Loading workspace context...');
      
      // Load workspace context
      await this.loadWorkspaceContext();
      
      this.reportProgress('Starting iterative planning process...');
      
      // Get user requirements
      const userRequirements = await this.getUserRequirements();
      
      // Perform iterative planning
      const finalPlan = await this.performIterativePlanning(userRequirements);
      
      this.reportProgress('Generating structured action list...');
      
      // Generate structured action list
      const actionList = await this.generateActionList(finalPlan);
      
      this.reportProgress('Creating documentation...');
      
      // Generate human-readable spec if requested
      if (this.options.includeDetailedSpec) {
        await this.generateSpecDocument(finalPlan, actionList);
      }
      
      // Save action list to workspace
      await this.saveActionList(actionList);
      
      return {
        success: true,
        data: {
          actionList,
          iterations: this.iterations,
          finalPlan
        },
        metadata: {
          totalIterations: this.iterations.length,
          totalActions: actionList.actions.length,
          complexity: actionList.metadata.complexity,
          estimatedDuration: actionList.metadata.estimatedDuration
        }
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw this.createRecoverableError(
        `Planning failed: ${errorMessage}`,
        'PLANNING_FAILED',
        { error: errorMessage, iterations: this.iterations.length }
      );
    }
  }

  protected async handleError(error: Error): Promise<void> {
    // Handle specific planning runner errors
    if (error.message.includes('context not found')) {
      const contextError = this.createRecoverableError(
        `Context missing: ${error.message}`,
        'CONTEXT_MISSING_ERROR',
        { workspaceUri: this.session.workspaceUri.toString() },
        'Run context generation first before planning',
        'command:comrade.runContextAnalysis'
      );
      await this.defaultErrorHandler(contextError);
    } else if (error.message.includes('API') || error.message.includes('network')) {
      await this.handleNetworkError(error, this.agent.config.endpoint);
    } else if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
      await this.handleAuthError(error, this.agent.provider);
    } else if (error.message.includes('rate limit')) {
      await this.handleRateLimitError(error);
    } else {
      await this.defaultErrorHandler(error);
    }
  }

  /**
   * Load workspace context from previous context generation
   */
  private async loadWorkspaceContext(): Promise<void> {
    try {
      const contextExists = await this.fileExists('.comrade/context.json');
      if (!contextExists) {
        throw new Error('Workspace context not found. Please run context generation first.');
      }

      const contextContent = await this.readWorkspaceFile('.comrade/context.json');
      this.workspaceContext = JSON.parse(contextContent);
      
      // Validate context is recent (within 24 hours)
      const contextAge = Date.now() - new Date(this.workspaceContext!.timestamp).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      if (contextAge > maxAge) {
        console.warn('Workspace context is older than 24 hours. Consider regenerating context for better results.');
      }
      
    } catch (error) {
      throw new Error(`Failed to load workspace context: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get user requirements for planning
   */
  private async getUserRequirements(): Promise<string> {
    // In a real implementation, this would come from the UI or session metadata
    // For now, we'll use session metadata or provide a default
    const requirements = this.session.metadata.userRequirements as string;
    
    if (!requirements) {
      throw new Error('User requirements not provided. Please specify what you want to implement.');
    }
    
    return requirements;
  }

  /**
   * Perform iterative planning with refinement
   */
  private async performIterativePlanning(userRequirements: string): Promise<string> {
    let currentPlan = '';
    let iteration = 1;
    
    while (iteration <= (this.options.maxIterations || 3)) {
      this.checkCancellation();
      this.reportProgress(`Planning iteration ${iteration}...`);
      
      // Generate or refine plan
      const planResult = await this.generatePlanIteration(
        userRequirements,
        currentPlan,
        iteration
      );
      
      // Store iteration
      const iterationData: PlanningIteration = {
        iteration,
        userRequirements,
        contextSummary: this.getContextSummary(),
        generatedPlan: planResult.plan,
        actionList: planResult.preliminaryActions,
        timestamp: new Date()
      };
      
      this.iterations.push(iterationData);
      currentPlan = planResult.plan;
      
      // Check if plan is satisfactory or if we should continue iterating
      const shouldContinue = await this.shouldContinueIterating(planResult, iteration);
      
      if (!shouldContinue) {
        break;
      }
      
      iteration++;
    }
    
    return currentPlan;
  }

  /**
   * Generate a single planning iteration
   */
  private async generatePlanIteration(
    userRequirements: string,
    previousPlan: string,
    iteration: number
  ): Promise<{ plan: string; preliminaryActions: Action[] }> {
    const messages: ChatMessage[] = [];
    
    // System message with context and instructions
    messages.push({
      role: 'system',
      content: this.buildPlanningSystemPrompt(),
      timestamp: new Date()
    });
    
    // User message with requirements and context
    messages.push({
      role: 'user',
      content: this.buildPlanningUserPrompt(userRequirements, previousPlan, iteration),
      timestamp: new Date()
    });
    
    try {
      const response = await this.chatBridge.sendMessage(this.agent, messages, {
        temperature: 0.7,
        maxTokens: 4000
      });
      
      // Parse the response to extract plan and preliminary actions
      const parsedResult = this.parsePlanningResponse(response.content);
      
      return parsedResult;
      
    } catch (error) {
      throw new Error(`Failed to generate plan iteration ${iteration}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build system prompt for planning
   */
  private buildPlanningSystemPrompt(): string {
    return `You are an expert software development planner. Your task is to create detailed, executable implementation plans based on workspace context and user requirements.

WORKSPACE CONTEXT:
${this.getContextSummary()}

PLANNING GUIDELINES:
1. Create plans that are specific, actionable, and executable
2. Break down complex tasks into smaller, manageable steps
3. Consider dependencies between actions
4. Include file operations, code changes, and command executions
5. Estimate complexity and duration realistically
6. Focus on incremental progress and testability

RESPONSE FORMAT:
Provide your response in the following structure:

## Implementation Plan

[Detailed narrative description of the implementation approach]

## Action Steps

[List of specific, executable actions in order]

## Complexity Assessment

[Assessment of overall complexity: simple/moderate/complex]

## Estimated Duration

[Realistic time estimate in hours]

${this.personality}`;
  }

  /**
   * Build user prompt for planning iteration
   */
  private buildPlanningUserPrompt(
    userRequirements: string,
    previousPlan: string,
    iteration: number
  ): string {
    let prompt = `USER REQUIREMENTS:
${userRequirements}

`;

    if (iteration === 1) {
      prompt += `Please create an initial implementation plan for these requirements based on the workspace context provided.`;
    } else {
      prompt += `PREVIOUS PLAN:
${previousPlan}

Please refine and improve the previous plan. Consider:
- Are there any missing steps or dependencies?
- Can any steps be broken down further for better clarity?
- Are the actions specific and executable enough?
- Is the order of operations optimal?

Provide an improved version of the plan.`;
    }

    return prompt;
  }

  /**
   * Parse planning response to extract plan and actions
   */
  private parsePlanningResponse(response: string): { plan: string; preliminaryActions: Action[] } {
    // Extract the main plan content
    const plan = response;
    
    // Extract action steps from the response
    const preliminaryActions = this.extractActionsFromPlan(response);
    
    return { plan, preliminaryActions };
  }

  /**
   * Extract preliminary actions from plan text
   */
  private extractActionsFromPlan(planText: string): Action[] {
    const actions: Action[] = [];
    const lines = planText.split('\n');
    let actionId = 1;
    
    // Look for action steps in the plan
    let inActionSection = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Detect action section
      if (trimmedLine.toLowerCase().includes('action steps') || 
          trimmedLine.toLowerCase().includes('implementation steps') ||
          trimmedLine.toLowerCase().includes('steps:')) {
        inActionSection = true;
        continue;
      }
      
      // Stop if we hit another section
      if (inActionSection && trimmedLine.startsWith('##')) {
        inActionSection = false;
        continue;
      }
      
      // Extract actions from numbered or bulleted lists
      if (inActionSection && (trimmedLine.match(/^\d+\./) || trimmedLine.startsWith('-') || trimmedLine.startsWith('*'))) {
        const actionText = trimmedLine.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, '');
        
        if (actionText.length > 0) {
          const action: Action = {
            id: `action_${actionId}`,
            type: this.inferActionType(actionText),
            description: actionText,
            parameters: this.extractActionParameters(actionText),
            dependencies: [],
            status: ActionStatus.PENDING
          };
          
          actions.push(action);
          actionId++;
        }
      }
    }
    
    return actions;
  }

  /**
   * Infer action type from action description
   */
  private inferActionType(actionText: string): ActionType {
    const lowerText = actionText.toLowerCase();
    
    if (lowerText.includes('create') && (lowerText.includes('file') || lowerText.includes('.js') || lowerText.includes('.ts') || lowerText.includes('.py'))) {
      return ActionType.CREATE_FILE;
    }
    
    if (lowerText.includes('modify') || lowerText.includes('update') || lowerText.includes('edit') || lowerText.includes('change')) {
      return ActionType.MODIFY_FILE;
    }
    
    if (lowerText.includes('delete') || lowerText.includes('remove')) {
      return ActionType.DELETE_FILE;
    }
    
    if (lowerText.includes('install') || lowerText.includes('npm') || lowerText.includes('pip') || lowerText.includes('yarn')) {
      return ActionType.INSTALL_DEPENDENCY;
    }
    
    if (lowerText.includes('run') || lowerText.includes('execute') || lowerText.includes('command') || lowerText.includes('build') || lowerText.includes('test')) {
      return ActionType.RUN_COMMAND;
    }
    
    // Default to file creation for code-related actions
    return ActionType.CREATE_FILE;
  }

  /**
   * Extract parameters from action description
   */
  private extractActionParameters(actionText: string): Record<string, any> {
    const parameters: Record<string, any> = {};
    
    // Extract file paths
    const filePathMatch = actionText.match(/([a-zA-Z0-9_\-./]+\.(jsx?|tsx?|py|java|cpp|c|go|rs|php|rb|swift|kt|scala|html|css|json|yaml|yml|md|txt))/);
    if (filePathMatch) {
      parameters.filePath = filePathMatch[1];
    }
    
    // Extract command patterns
    const commandMatch = actionText.match(/`([^`]+)`/);
    if (commandMatch) {
      parameters.command = commandMatch[1];
    }
    
    // Extract package names for installations
    const packageMatch = actionText.match(/(?:install\s+(?:package\s+)?)([a-zA-Z0-9_\-@/]+)/i);
    if (packageMatch) {
      parameters.packageName = packageMatch[1];
    }
    
    return parameters;
  }

  /**
   * Check if we should continue iterating
   */
  private async shouldContinueIterating(
    planResult: { plan: string; preliminaryActions: Action[] },
    iteration: number
  ): Promise<boolean> {
    // Don't continue if we've reached max iterations
    if (iteration >= (this.options.maxIterations || 3)) {
      return false;
    }
    
    // Don't continue if we have a reasonable number of actions
    if (planResult.preliminaryActions.length >= 3) {
      return false;
    }
    
    // Continue if the plan seems incomplete (very short or no actions)
    if (planResult.plan.length < 500 || planResult.preliminaryActions.length === 0) {
      return true;
    }
    
    return false;
  }

  /**
   * Generate structured action list from final plan
   */
  private async generateActionList(finalPlan: string): Promise<ActionList> {
    this.reportProgress('Structuring action list...');
    
    // Get the most refined actions from the last iteration
    const lastIteration = this.iterations[this.iterations.length - 1];
    let actions = lastIteration?.actionList || [];
    
    // If we don't have enough actions, generate them from the final plan
    if (actions.length === 0) {
      actions = this.extractActionsFromPlan(finalPlan);
    }
    
    // Enhance actions with better structure and dependencies
    const enhancedActions = await this.enhanceActions(actions);
    
    // Calculate metadata
    const metadata = this.calculateActionMetadata(enhancedActions);
    
    const actionList: ActionList = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      actions: enhancedActions,
      metadata
    };
    
    return actionList;
  }

  /**
   * Enhance actions with better structure and dependencies
   */
  private async enhanceActions(actions: Action[]): Promise<Action[]> {
    const enhanced: Action[] = [];
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      // Add dependencies based on action order and type
      const dependencies: string[] = [];
      
      // File creation should happen before modification
      if (action.type === ActionType.MODIFY_FILE) {
        const createActions = enhanced.filter(a => 
          a.type === ActionType.CREATE_FILE && 
          a.parameters.filePath === action.parameters.filePath
        );
        dependencies.push(...createActions.map(a => a.id));
      }
      
      // Installation should happen early
      if (action.type === ActionType.RUN_COMMAND && !action.description.toLowerCase().includes('install')) {
        const installActions = enhanced.filter(a => a.type === ActionType.INSTALL_DEPENDENCY);
        dependencies.push(...installActions.map(a => a.id));
      }
      
      // Enhance parameters based on workspace context
      const enhancedParameters = this.enhanceActionParameters(action);
      
      const enhancedAction: Action = {
        ...action,
        dependencies,
        parameters: enhancedParameters
      };
      
      enhanced.push(enhancedAction);
    }
    
    return enhanced;
  }

  /**
   * Enhance action parameters with workspace context
   */
  private enhanceActionParameters(action: Action): Record<string, any> {
    const enhanced = { ...action.parameters };
    
    // Add workspace root context
    if (enhanced.filePath && !enhanced.filePath.startsWith('/')) {
      enhanced.workspaceRelative = true;
    }
    
    // Add language context for file operations
    if (action.type === ActionType.CREATE_FILE || action.type === ActionType.MODIFY_FILE) {
      if (enhanced.filePath) {
        const extension = enhanced.filePath.split('.').pop()?.toLowerCase();
        const languageMap: Record<string, string> = {
          'js': 'javascript',
          'jsx': 'javascript',
          'ts': 'typescript',
          'tsx': 'typescript',
          'py': 'python',
          'java': 'java',
          'cpp': 'cpp',
          'c': 'c',
          'go': 'go',
          'rs': 'rust'
        };
        
        if (extension && languageMap[extension]) {
          enhanced.language = languageMap[extension];
        }
      }
    }
    
    return enhanced;
  }

  /**
   * Calculate action metadata
   */
  private calculateActionMetadata(actions: Action[]): ActionMetadata {
    const totalActions = actions.length;
    
    // Estimate duration based on action types
    let estimatedMinutes = 0;
    for (const action of actions) {
      switch (action.type) {
        case ActionType.CREATE_FILE:
          estimatedMinutes += 15; // 15 minutes per file
          break;
        case ActionType.MODIFY_FILE:
          estimatedMinutes += 10; // 10 minutes per modification
          break;
        case ActionType.DELETE_FILE:
          estimatedMinutes += 2; // 2 minutes per deletion
          break;
        case ActionType.RUN_COMMAND:
          estimatedMinutes += 5; // 5 minutes per command
          break;
        case ActionType.INSTALL_DEPENDENCY:
          estimatedMinutes += 3; // 3 minutes per installation
          break;
      }
    }
    
    // Determine complexity
    let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
    if (totalActions > 10 || estimatedMinutes > 120) {
      complexity = 'complex';
    } else if (totalActions > 5 || estimatedMinutes > 60) {
      complexity = 'moderate';
    }
    
    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    const hasDeleteActions = actions.some(a => a.type === ActionType.DELETE_FILE);
    const hasCommandActions = actions.some(a => a.type === ActionType.RUN_COMMAND);
    
    if (hasDeleteActions || (hasCommandActions && totalActions > 8)) {
      riskLevel = 'high';
    } else if (hasCommandActions || totalActions > 5) {
      riskLevel = 'medium';
    }
    
    return {
      totalActions,
      estimatedDuration: Math.ceil(estimatedMinutes / 60), // Convert to hours
      complexity,
      riskLevel
    };
  }

  /**
   * Generate human-readable spec document
   */
  private async generateSpecDocument(finalPlan: string, actionList: ActionList): Promise<void> {
    const specContent = this.buildSpecContent(finalPlan, actionList);
    await this.writeWorkspaceFile('.comrade/spec.md', specContent);
  }

  /**
   * Build spec document content
   */
  private buildSpecContent(finalPlan: string, actionList: ActionList): string {
    const timestamp = new Date().toISOString();
    const userRequirements = this.session.metadata.userRequirements as string || 'No specific requirements provided';
    
    return `# Implementation Specification

**Generated:** ${timestamp}  
**Workspace:** ${this.getWorkspaceRoot()}  
**Total Actions:** ${actionList.actions.length}  
**Estimated Duration:** ${actionList.metadata.estimatedDuration} hours  
**Complexity:** ${actionList.metadata.complexity}  
**Risk Level:** ${actionList.metadata.riskLevel}

## User Requirements

${userRequirements}

## Workspace Context

${this.getContextSummary()}

## Implementation Plan

${finalPlan}

## Action List Summary

${this.buildActionListSummary(actionList)}

## Planning Iterations

${this.buildIterationsSummary()}

---

*This specification was generated by Comrade Planning Agent*
`;
  }

  /**
   * Build action list summary for spec
   */
  private buildActionListSummary(actionList: ActionList): string {
    let summary = `Total of ${actionList.actions.length} actions planned:\n\n`;
    
    const actionsByType = new Map<ActionType, number>();
    for (const action of actionList.actions) {
      actionsByType.set(action.type, (actionsByType.get(action.type) || 0) + 1);
    }
    
    for (const [type, count] of actionsByType.entries()) {
      summary += `- **${type.replace('_', ' ').toLowerCase()}**: ${count} actions\n`;
    }
    
    summary += '\n### Detailed Actions\n\n';
    
    for (let i = 0; i < actionList.actions.length; i++) {
      const action = actionList.actions[i];
      summary += `${i + 1}. **${action.type.replace('_', ' ')}**: ${action.description}\n`;
      
      if (action.parameters.filePath) {
        summary += `   - File: \`${action.parameters.filePath}\`\n`;
      }
      
      if (action.parameters.command) {
        summary += `   - Command: \`${action.parameters.command}\`\n`;
      }
      
      if (action.dependencies.length > 0) {
        summary += `   - Dependencies: ${action.dependencies.join(', ')}\n`;
      }
      
      summary += '\n';
    }
    
    return summary;
  }

  /**
   * Build iterations summary for spec
   */
  private buildIterationsSummary(): string {
    let summary = `The plan was developed through ${this.iterations.length} iteration(s):\n\n`;
    
    for (const iteration of this.iterations) {
      summary += `### Iteration ${iteration.iteration}\n`;
      summary += `**Timestamp:** ${iteration.timestamp.toISOString()}\n`;
      summary += `**Actions Generated:** ${iteration.actionList.length}\n\n`;
      
      if (iteration.feedback) {
        summary += `**Feedback:** ${iteration.feedback}\n\n`;
      }
    }
    
    return summary;
  }

  /**
   * Save action list to workspace
   */
  private async saveActionList(actionList: ActionList): Promise<void> {
    // Ensure .comrade directory exists
    try {
      await this.createWorkspaceDirectory('.comrade');
    } catch {
      // Directory might already exist
    }
    
    // Save action-list.json
    const actionListJson = JSON.stringify(actionList, null, 2);
    await this.writeWorkspaceFile('.comrade/action-list.json', actionListJson);
  }

  /**
   * Get context summary for prompts
   */
  private getContextSummary(): string {
    if (!this.workspaceContext) {
      return 'No workspace context available';
    }
    
    const context = this.workspaceContext;
    let summary = `**Workspace Summary:**\n`;
    summary += `- Root: ${context.workspaceRoot}\n`;
    summary += `- Files: ${context.summary.totalFiles} files, ${context.summary.totalLines} lines\n`;
    summary += `- Languages: ${context.summary.primaryLanguages.join(', ')}\n`;
    
    if (context.summary.frameworks.length > 0) {
      summary += `- Frameworks: ${context.summary.frameworks.join(', ')}\n`;
    }
    
    if (context.dependencies.length > 0) {
      summary += `- Dependencies: ${context.dependencies.length} packages\n`;
    }
    
    summary += `- Description: ${context.summary.description}\n`;
    
    return summary;
  }
}