/**
 * Example usage of PlanningRunner
 */

import * as vscode from 'vscode';
import { PlanningRunner } from '../runners/planning';
import { Session, WorkflowMode } from '../core/session';
import { IAgent, PhaseType, PhaseAgentMapping, SessionRequirements } from '../core/agent';

/**
 * Example: Using PlanningRunner to generate implementation plans
 */
export async function examplePlanningUsage() {
  // Get current workspace
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('No workspace folder found');
  }

  // Mock agent configuration (in real usage, this would come from AgentRegistry)
  const planningAgent: IAgent = {
    id: 'gpt4-planner',
    name: 'GPT-4 Planning Agent',
    provider: 'openai',
    config: {
      provider: 'openai',
      model: 'gpt-4',
      apiKey: process.env.OPENAI_API_KEY || '',
      temperature: 0.7,
      maxTokens: 4000,
      timeout: 30000
    },
    capabilities: {
      hasVision: false,
      hasToolUse: false,
      reasoningDepth: 'advanced',
      speed: 'medium',
      costTier: 'high',
      maxTokens: 4000,
      supportedLanguages: ['javascript', 'typescript', 'python', 'java'],
      specializations: ['planning', 'architecture', 'code-generation']
    },
    isEnabledForAssignment: true,
    async isAvailable(): Promise<boolean> {
      return !!process.env.OPENAI_API_KEY;
    }
  };

  // Session requirements
  const requirements: SessionRequirements = {
    hasImages: false,
    workspaceSize: 'medium',
    complexity: 'moderate',
    timeConstraints: 'none',
    toolsRequired: [],
    preferredCostTier: 'medium',
    customInstructions: 'Focus on clean, maintainable code with good test coverage'
  };

  // Agent mapping (simplified for example)
  const agentMapping: PhaseAgentMapping = {
    assignments: {
      [PhaseType.CONTEXT]: planningAgent.id,
      [PhaseType.PLANNING]: planningAgent.id,
      [PhaseType.REVIEW]: planningAgent.id,
      [PhaseType.EXECUTION]: planningAgent.id,
      [PhaseType.RECOVERY]: planningAgent.id
    },
    reasoning: 'Using GPT-4 for all phases due to its strong reasoning capabilities',
    confidence: 0.9,
    alternatives: {
      [PhaseType.CONTEXT]: [],
      [PhaseType.PLANNING]: [],
      [PhaseType.REVIEW]: [],
      [PhaseType.EXECUTION]: [],
      [PhaseType.RECOVERY]: []
    }
  };

  // Create progress reporter
  const progress = await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Planning Implementation',
    cancellable: true
  }, async (progress, token) => {
    return progress;
  });

  // Create session
  const session = new Session(
    `planning-${Date.now()}`,
    workspaceFolder.uri,
    agentMapping,
    requirements,
    WorkflowMode.SPEED,
    progress
  );

  // Set user requirements in session metadata
  session.metadata.userRequirements = `
Create a new React component library with the following features:
1. A reusable Button component with multiple variants (primary, secondary, danger)
2. A Card component with header, body, and footer sections
3. A Modal component with backdrop and close functionality
4. TypeScript support with proper type definitions
5. Storybook integration for component documentation
6. Unit tests using Jest and React Testing Library
7. Build system using Rollup for library distribution
8. CSS-in-JS styling using styled-components

The library should be published to npm and include proper documentation.
`;

  // Personality for consistent tone
  const personality = `
You are a senior React developer with expertise in component library design.
You prioritize:
- Clean, reusable code architecture
- Comprehensive TypeScript typing
- Thorough testing strategies
- Developer experience and documentation
- Modern React patterns and best practices

Your responses are detailed but concise, focusing on practical implementation steps.
`;

  try {
    // Create and run PlanningRunner
    const planningRunner = new PlanningRunner(
      session,
      planningAgent,
      personality,
      {
        maxIterations: 3,
        requireUserApproval: false,
        includeDetailedSpec: true
      }
    );

    console.log('Starting planning process...');
    const result = await planningRunner.run();

    if (result.success) {
      console.log('Planning completed successfully!');
      console.log(`Generated ${result.data.actionList.actions.length} actions`);
      console.log(`Complexity: ${result.data.actionList.metadata.complexity}`);
      console.log(`Estimated duration: ${result.data.actionList.metadata.estimatedDuration} hours`);
      console.log(`Planning iterations: ${result.metadata?.totalIterations || 0}`);

      // Show success message to user
      const viewSpec = 'View Specification';
      const viewActions = 'View Action List';
      const startExecution = 'Start Execution';

      const choice = await vscode.window.showInformationMessage(
        `Planning completed! Generated ${result.data.actionList.actions.length} actions with ${result.data.actionList.metadata.complexity} complexity.`,
        viewSpec,
        viewActions,
        startExecution
      );

      switch (choice) {
        case viewSpec:
          // Open the generated spec.md file
          const specUri = vscode.Uri.joinPath(workspaceFolder.uri, '.comrade', 'spec.md');
          await vscode.window.showTextDocument(specUri);
          break;

        case viewActions:
          // Open the generated action-list.json file
          const actionsUri = vscode.Uri.joinPath(workspaceFolder.uri, '.comrade', 'action-list.json');
          await vscode.window.showTextDocument(actionsUri);
          break;

        case startExecution:
          // In a real implementation, this would trigger the ExecutionRunner
          vscode.window.showInformationMessage('Execution would start here (ExecutionRunner not implemented yet)');
          break;
      }

      return result.data;

    } else {
      console.error('Planning failed:', result.error?.message);
      
      vscode.window.showErrorMessage(
        `Planning failed: ${result.error?.message || 'Unknown error'}`,
        'Retry',
        'View Logs'
      ).then(choice => {
        if (choice === 'Retry') {
          // Retry planning
          examplePlanningUsage();
        } else if (choice === 'View Logs') {
          // Show output channel with logs
          vscode.window.showInformationMessage('Logs would be shown here');
        }
      });

      throw result.error || new Error('Planning failed');
    }

  } catch (error) {
    console.error('Planning error:', error);
    
    vscode.window.showErrorMessage(
      `Planning error: ${error instanceof Error ? error.message : String(error)}`,
      'Retry'
    ).then(choice => {
      if (choice === 'Retry') {
        examplePlanningUsage();
      }
    });

    throw error;
  } finally {
    // Clean up session
    session.dispose();
  }
}

/**
 * Example: Planning with custom options
 */
export async function exampleCustomPlanningOptions() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error('No workspace folder found');
  }

  // ... (agent and session setup similar to above)

  // Custom planning options
  const customOptions = {
    maxIterations: 5, // More iterations for complex projects
    requireUserApproval: true, // Require user approval between iterations
    includeDetailedSpec: true // Generate detailed specification document
  };

  // Custom user requirements for a different type of project
  const customRequirements = `
Create a Node.js REST API with the following requirements:
1. Express.js server with TypeScript
2. PostgreSQL database with Prisma ORM
3. JWT authentication and authorization
4. User management endpoints (CRUD)
5. Product catalog endpoints
6. Order management system
7. Input validation using Joi
8. API documentation with Swagger
9. Unit and integration tests
10. Docker containerization
11. CI/CD pipeline with GitHub Actions
12. Environment-based configuration

The API should follow REST conventions and include proper error handling.
`;

  // ... (rest of implementation similar to main example)
}

/**
 * Example: Planning with error handling and recovery
 */
export async function examplePlanningWithErrorHandling() {
  try {
    const result = await examplePlanningUsage();
    return result;
  } catch (error) {
    console.error('Planning failed with error:', error);

    // Implement recovery strategies
    if (error instanceof Error) {
      if (error.message.includes('context not found')) {
        // Suggest running context generation first
        const runContext = 'Generate Context';
        const choice = await vscode.window.showErrorMessage(
          'Workspace context not found. Please generate context first.',
          runContext
        );

        if (choice === runContext) {
          vscode.window.showInformationMessage('Context generation would start here (ContextRunner)');
        }
      } else if (error.message.includes('API key')) {
        // Suggest configuring API key
        const configure = 'Configure API Key';
        const choice = await vscode.window.showErrorMessage(
          'API key not configured. Please set up your LLM provider credentials.',
          configure
        );

        if (choice === configure) {
          vscode.window.showInformationMessage('API configuration would open here');
        }
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        // Suggest retry with different settings
        const retry = 'Retry';
        const choice = await vscode.window.showErrorMessage(
          'Network error occurred. This might be due to connectivity issues or rate limits.',
          retry
        );

        if (choice === retry) {
          // Retry with longer timeout
          setTimeout(() => examplePlanningUsage(), 5000);
        }
      }
    }

    throw error;
  }
}

/**
 * Example: Batch planning for multiple features
 */
export async function exampleBatchPlanning() {
  const features = [
    'User authentication system',
    'Product catalog with search',
    'Shopping cart functionality',
    'Order processing workflow',
    'Admin dashboard'
  ];

  const results = [];

  for (const feature of features) {
    try {
      console.log(`Planning feature: ${feature}`);
      
      // Create separate session for each feature
      // ... (setup code)
      
      // Set feature-specific requirements
      // session.metadata.userRequirements = `Implement ${feature} with...`;
      
      // Run planning
      // const result = await planningRunner.run();
      // results.push({ feature, result });
      
    } catch (error) {
      console.error(`Failed to plan feature ${feature}:`, error);
      results.push({ feature, error });
    }
  }

  // Show batch results summary
  const successful = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error).length;

  vscode.window.showInformationMessage(
    `Batch planning completed: ${successful} successful, ${failed} failed`
  );

  return results;
}