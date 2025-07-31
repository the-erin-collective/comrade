/**
 * Example usage of ExecutionRunner
 */

import * as vscode from 'vscode';
import { ExecutionRunner } from '../runners/execution';
import { Session } from '../core/session';
import { IAgent, PhaseType } from '../core/agent';
import { ActionList, Action, ActionType, ActionStatus } from '../core/workspace';

async function demonstrateExecutionRunner() {
  // Mock workspace URI
  const workspaceUri = vscode.Uri.file('/path/to/workspace');
  
  // Mock agent
  const mockAgent: IAgent = {
    id: 'execution-agent',
    name: 'Execution Agent',
    provider: 'openai',
    config: {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'test-key'
    },
    capabilities: {
      hasVision: false,
      hasToolUse: true,
      reasoningDepth: 'advanced',
      speed: 'medium',
      costTier: 'medium',
      maxTokens: 4000,
      supportedLanguages: ['typescript', 'javascript', 'python'],
      specializations: ['code', 'execution', 'debugging']
    },
    isEnabledForAssignment: true,
    isAvailable: async () => true
  };

  // Create mock session requirements and agent mapping
  const mockRequirements = {
    hasImages: false,
    workspaceSize: 'medium' as const,
    complexity: 'moderate' as const,
    timeConstraints: 'none' as const,
    toolsRequired: [],
    preferredCostTier: 'medium' as const
  };

  const mockAgentMapping = {
    assignments: {
      [PhaseType.CONTEXT]: mockAgent.id,
      [PhaseType.PLANNING]: mockAgent.id,
      [PhaseType.REVIEW]: mockAgent.id,
      [PhaseType.EXECUTION]: mockAgent.id,
      [PhaseType.RECOVERY]: mockAgent.id
    },
    reasoning: 'Using single agent for all phases in example',
    confidence: 0.9,
    alternatives: {
      [PhaseType.CONTEXT]: [],
      [PhaseType.PLANNING]: [],
      [PhaseType.REVIEW]: [],
      [PhaseType.EXECUTION]: [],
      [PhaseType.RECOVERY]: []
    }
  };

  const mockProgress = {
    report: (value: { message?: string; increment?: number }) => {
      console.log(`Progress: ${value.message} ${value.increment ? `(${value.increment}%)` : ''}`);
    }
  };

  // Create session
  const session = new Session(
    'example-session',
    workspaceUri,
    mockAgentMapping,
    mockRequirements,
    'speed',
    mockProgress as any
  );

  // Sample action list for execution
  const actionList: ActionList = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    actions: [
      {
        id: 'action-1',
        type: ActionType.CREATE_FILE,
        description: 'Create a new TypeScript file',
        parameters: {
          path: 'src/utils/helper.ts',
          content: 'export function helper() {\n  return "Hello World";\n}'
        },
        dependencies: [],
        status: ActionStatus.PENDING
      },
      {
        id: 'action-2',
        type: ActionType.MODIFY_FILE,
        description: 'Update package.json with new dependency',
        parameters: {
          path: 'package.json',
          changes: [
            {
              operation: 'add',
              path: '/dependencies/lodash',
              value: '^4.17.21'
            }
          ]
        },
        dependencies: [],
        status: ActionStatus.PENDING
      },
      {
        id: 'action-3',
        type: ActionType.RUN_COMMAND,
        description: 'Install dependencies',
        parameters: {
          command: 'npm install',
          workingDirectory: '.'
        },
        dependencies: ['action-2'],
        status: ActionStatus.PENDING
      }
    ],
    metadata: {
      generatedBy: 'planning-agent',
      totalActions: 3,
      estimatedDuration: '2 minutes'
    }
  };

  // First, save the action list to the workspace (normally done by PlanningRunner)
  // In a real scenario, this would be done by the PlanningRunner
  const actionListJson = JSON.stringify(actionList, null, 2);
  // This would normally be saved to .comrade/action-list.json
  
  // Create and run ExecutionRunner
  const executionRunner = new ExecutionRunner(session, mockAgent, 'You are a helpful coding assistant focused on execution.');

  try {
    console.log('Starting execution...');
    const result = await executionRunner.run();
    
    console.log('Execution completed successfully!');
    console.log('Results:', result);
    
    // Check individual action results
    if (result.data?.actionList?.actions) {
      result.data.actionList.actions.forEach((action: any, index: number) => {
        console.log(`Action ${index + 1} (${action.id}):`, 
          action.status === 'completed' ? 'SUCCESS' : 'FAILED');
        if (action.result && !action.result.success && action.result.error) {
          console.log('Error:', action.result.error);
        }
      });
    }
    
  } catch (error) {
    console.error('Execution failed:', error);
    
    // Handle execution failure
    if (error instanceof Error) {
      console.log('Attempting recovery...');
      // In a real scenario, you might trigger recovery logic here
    }
  }
}

// Example of handling execution with progress tracking
async function demonstrateExecutionWithProgress() {
  const workspaceUri = vscode.Uri.file('/path/to/workspace');
  
  const mockAgent: IAgent = {
    id: 'execution-agent',
    name: 'Execution Agent',
    provider: 'openai',
    config: {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'test-key'
    },
    capabilities: {
      hasVision: false,
      hasToolUse: true,
      reasoningDepth: 'advanced',
      speed: 'medium',
      costTier: 'medium',
      maxTokens: 4000,
      supportedLanguages: ['typescript', 'javascript'],
      specializations: ['code', 'execution']
    },
    isEnabledForAssignment: true,
    isAvailable: async () => true
  };

  // Create mock session requirements and agent mapping (same as above)
  const mockRequirements = {
    hasImages: false,
    workspaceSize: 'medium' as const,
    complexity: 'moderate' as const,
    timeConstraints: 'none' as const,
    toolsRequired: [],
    preferredCostTier: 'medium' as const
  };

  const mockAgentMapping = {
    assignments: {
      [PhaseType.CONTEXT]: mockAgent.id,
      [PhaseType.PLANNING]: mockAgent.id,
      [PhaseType.REVIEW]: mockAgent.id,
      [PhaseType.EXECUTION]: mockAgent.id,
      [PhaseType.RECOVERY]: mockAgent.id
    },
    reasoning: 'Using single agent for all phases in example',
    confidence: 0.9,
    alternatives: {
      [PhaseType.CONTEXT]: [],
      [PhaseType.PLANNING]: [],
      [PhaseType.REVIEW]: [],
      [PhaseType.EXECUTION]: [],
      [PhaseType.RECOVERY]: []
    }
  };

  const mockProgress = {
    report: (value: { message?: string; increment?: number }) => {
      console.log(`Progress: ${value.message} ${value.increment ? `(${value.increment}%)` : ''}`);
    }
  };

  const session = new Session(
    'example-session-2',
    workspaceUri,
    mockAgentMapping,
    mockRequirements,
    'speed',
    mockProgress as any
  );

  const actionList: ActionList = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    actions: [
      {
        id: 'setup-1',
        type: ActionType.CREATE_FILE,
        description: 'Create configuration file',
        parameters: {
          path: 'config.json',
          content: '{"version": "1.0", "name": "test-project"}'
        },
        dependencies: [],
        status: ActionStatus.PENDING
      }
    ],
    metadata: {
      generatedBy: 'planning-agent',
      totalActions: 1,
      estimatedDuration: '30 seconds'
    }
  };

  // Use VS Code progress API
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Executing Actions',
    cancellable: true
  }, async (progress, token) => {
    const executionRunner = new ExecutionRunner(session, mockAgent, 'You are a helpful coding assistant focused on execution.');
    
    // Set up progress reporting
    executionRunner.onProgress((progressUpdate) => {
      progress.report({
        increment: progressUpdate.increment,
        message: progressUpdate.message
      });
    });

    // Set up cancellation
    token.onCancellationRequested(() => {
      executionRunner.cancel();
    });

    try {
      const result = await executionRunner.run();
      vscode.window.showInformationMessage('Execution completed successfully!');
      return result;
    } catch (error) {
      vscode.window.showErrorMessage(`Execution failed: ${error}`);
      throw error;
    }
  });
}

// Export for use in tests or other modules
export {
  demonstrateExecutionRunner,
  demonstrateExecutionWithProgress
};