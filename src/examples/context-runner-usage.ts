/**
 * Example usage of ContextRunner for workspace analysis
 */

import * as vscode from 'vscode';
import { ContextRunner } from '../runners/context';
import { Session, SessionState, WorkflowMode } from '../core/session';
import { IAgent, PhaseType, PhaseAgentMapping, SessionRequirements } from '../core/agent';
import { WorkspaceContext } from '../core/workspace';

/**
 * Example function demonstrating how to use ContextRunner
 */
export async function runContextAnalysisExample(): Promise<void> {
  // Get the current workspace
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder is open');
    return;
  }

  // Create a mock agent for demonstration
  const mockAgent: IAgent = {
    id: 'context-agent',
    name: 'Context Analysis Agent',
    provider: 'openai' as any,
    config: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 4000
    },
    capabilities: {
      hasVision: false,
      hasToolUse: false,
      reasoningDepth: 'advanced' as any,
      speed: 'medium' as any,
      costTier: 'medium' as any,
      maxTokens: 4000,
      supportedLanguages: ['en'],
      specializations: ['code', 'analysis']
    },
    isEnabledForAssignment: true,
    isAvailable: async () => true
  };

  // Create session requirements
  const sessionRequirements: SessionRequirements = {
    hasImages: false,
    workspaceSize: 'medium' as any,
    complexity: 'moderate' as any,
    timeConstraints: 'none' as any,
    toolsRequired: [],
    preferredCostTier: 'medium' as any
  };

  // Create agent mapping
  const agentMapping: PhaseAgentMapping = {
    assignments: {
      [PhaseType.CONTEXT]: mockAgent.id,
      [PhaseType.PLANNING]: mockAgent.id,
      [PhaseType.EXECUTION]: mockAgent.id,
      [PhaseType.REVIEW]: mockAgent.id,
      [PhaseType.RECOVERY]: mockAgent.id
    },
    reasoning: 'Using single agent for demonstration',
    confidence: 0.8,
    alternatives: {
      [PhaseType.CONTEXT]: [],
      [PhaseType.PLANNING]: [],
      [PhaseType.EXECUTION]: [],
      [PhaseType.REVIEW]: [],
      [PhaseType.RECOVERY]: []
    }
  };

  // Show progress to user
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Analyzing workspace context...',
    cancellable: true
  }, async (progress, token) => {
    
    // Create session
    const session = new Session(
      'context-example-session',
      workspaceFolder.uri,
      agentMapping,
      sessionRequirements,
      WorkflowMode.SPEED,
      progress
    );

    // Set session state
    session.setState(SessionState.CONTEXT_GENERATION);

    // Create ContextRunner
    const contextRunner = new ContextRunner(
      session,
      mockAgent,
      'You are a helpful coding assistant that analyzes workspace context.'
    );

    try {
      // Run context analysis
      const result = await contextRunner.run();

      if (result.success) {
        const context = result.data as WorkspaceContext;
        
        // Show results to user
        const message = `Context analysis completed successfully!
        
Files analyzed: ${result.metadata?.filesAnalyzed || 0}
Files selected: ${result.metadata?.filesSelected || 0}
Total tokens: ${context.tokenCount}
Primary languages: ${context.summary.primaryLanguages.join(', ')}
Frameworks detected: ${context.summary.frameworks.join(', ')}
        
Context saved to: .comrade/context.json`;

        vscode.window.showInformationMessage(message);

        // Optionally open the generated context file
        const contextUri = vscode.Uri.joinPath(workspaceFolder.uri, '.comrade/context.json');
        const doc = await vscode.workspace.openTextDocument(contextUri);
        await vscode.window.showTextDocument(doc);

      } else {
        vscode.window.showErrorMessage(`Context analysis failed: ${result.error?.message}`);
      }

    } catch (error) {
      vscode.window.showErrorMessage(`Context analysis error: ${error}`);
    } finally {
      session.dispose();
    }
  });
}

/**
 * Example function showing how to read and use generated context
 */
export async function readContextExample(): Promise<WorkspaceContext | null> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return null;
  }

  try {
    // Read the context file
    const contextUri = vscode.Uri.joinPath(workspaceFolder.uri, '.comrade/context.json');
    const contextContent = await vscode.workspace.fs.readFile(contextUri);
    const contextText = Buffer.from(contextContent).toString('utf8');
    const context: WorkspaceContext = JSON.parse(contextText);

    console.log('Workspace Context:', {
      timestamp: context.timestamp,
      totalFiles: context.summary.totalFiles,
      totalLines: context.summary.totalLines,
      primaryLanguages: context.summary.primaryLanguages,
      frameworks: context.summary.frameworks,
      description: context.summary.description,
      tokenCount: context.tokenCount
    });

    return context;

  } catch (error) {
    console.error('Failed to read context:', error);
    return null;
  }
}

/**
 * Example function showing how to check if context needs updating
 */
export async function checkContextFreshness(): Promise<boolean> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return false;
  }

  try {
    const contextUri = vscode.Uri.joinPath(workspaceFolder.uri, '.comrade/context.json');
    const contextStat = await vscode.workspace.fs.stat(contextUri);
    const contextAge = Date.now() - contextStat.mtime;
    
    // Consider context stale if older than 1 hour
    const isStale = contextAge > 60 * 60 * 1000;
    
    if (isStale) {
      const result = await vscode.window.showWarningMessage(
        'Workspace context is outdated. Would you like to regenerate it?',
        'Yes', 'No'
      );
      
      if (result === 'Yes') {
        await runContextAnalysisExample();
        return true;
      }
    }
    
    return !isStale;

  } catch (error) {
    // Context file doesn't exist or can't be read
    const result = await vscode.window.showInformationMessage(
      'No workspace context found. Would you like to generate it?',
      'Yes', 'No'
    );
    
    if (result === 'Yes') {
      await runContextAnalysisExample();
      return true;
    }
    
    return false;
  }
}

/**
 * Register commands for context analysis examples
 */
export function registerContextExampleCommands(context: vscode.ExtensionContext): void {
  // Register command to run context analysis
  const runContextCommand = vscode.commands.registerCommand(
    'comrade.runContextAnalysis',
    runContextAnalysisExample
  );

  // Register command to read context
  const readContextCommand = vscode.commands.registerCommand(
    'comrade.readContext',
    async () => {
      const context = await readContextExample();
      if (context) {
        vscode.window.showInformationMessage(
          `Context loaded: ${context.summary.totalFiles} files, ${context.summary.primaryLanguages.join(', ')}`
        );
      } else {
        vscode.window.showWarningMessage('No context found or failed to read context');
      }
    }
  );

  // Register command to check context freshness
  const checkContextCommand = vscode.commands.registerCommand(
    'comrade.checkContext',
    checkContextFreshness
  );

  context.subscriptions.push(runContextCommand, readContextCommand, checkContextCommand);
}