/**
 * Tests for PlanningRunner
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { PlanningRunner } from '../runners/planning';
import { Session, SessionState, WorkflowMode } from '../core/session';
import { IAgent, AgentCapabilities, PhaseAgentMapping, SessionRequirements, PhaseType } from '../core/agent';
import { WorkspaceContext, ActionType, ActionStatus } from '../core/workspace';

// Mock agent for testing
const mockAgent: IAgent = {
  id: 'test-planning-agent',
  name: 'Test Planning Agent',
  provider: 'openai',
  config: {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'test-key',
    temperature: 0.7,
    maxTokens: 4000
  },
  capabilities: {
    hasVision: false,
    hasToolUse: false,
    reasoningDepth: 'advanced',
    speed: 'medium',
    costTier: 'medium',
    maxTokens: 4000,
    supportedLanguages: ['javascript', 'typescript', 'python'],
    specializations: ['planning', 'code-generation']
  },
  isEnabledForAssignment: true,
  async isAvailable(): Promise<boolean> {
    return true;
  }
};

// Mock workspace context
const mockWorkspaceContext: WorkspaceContext = {
  timestamp: new Date().toISOString(),
  workspaceRoot: '/test/workspace',
  fileStructure: [
    {
      path: 'package.json',
      type: 'file',
      size: 500,
      language: 'json',
      summary: 'Package configuration with React dependencies'
    },
    {
      path: 'src',
      type: 'directory',
      children: [
        {
          path: 'src/index.ts',
          type: 'file',
          size: 200,
          language: 'typescript',
          summary: 'Main entry point'
        }
      ]
    }
  ],
  dependencies: [
    {
      name: 'react',
      version: '^18.0.0',
      type: 'npm',
      isDev: false
    }
  ],
  summary: {
    totalFiles: 5,
    totalLines: 150,
    primaryLanguages: ['typescript', 'javascript'],
    frameworks: ['React'],
    description: 'A React TypeScript project with 5 files'
  },
  tokenCount: 1200
};

// Mock progress reporter
const mockProgress: vscode.Progress<any> = {
  report: (value: any) => {
    console.log('Progress:', value.message);
  }
};

// Mock session requirements
const mockRequirements: SessionRequirements = {
  hasImages: false,
  workspaceSize: 'small',
  complexity: 'moderate',
  timeConstraints: 'none',
  toolsRequired: [],
  preferredCostTier: 'medium'
};

// Mock phase agent mapping
const mockAgentMapping: PhaseAgentMapping = {
  assignments: {
    [PhaseType.CONTEXT]: mockAgent.id,
    [PhaseType.PLANNING]: mockAgent.id,
    [PhaseType.REVIEW]: mockAgent.id,
    [PhaseType.EXECUTION]: mockAgent.id,
    [PhaseType.RECOVERY]: mockAgent.id
  },
  reasoning: 'Using single agent for all phases in test',
  confidence: 0.9,
  alternatives: {
    [PhaseType.CONTEXT]: [],
    [PhaseType.PLANNING]: [],
    [PhaseType.REVIEW]: [],
    [PhaseType.EXECUTION]: [],
    [PhaseType.RECOVERY]: []
  }
};

suite('PlanningRunner Tests', () => {
  let workspaceUri: vscode.Uri;
  let session: Session;

  setup(() => {
    // Create mock workspace URI
    workspaceUri = vscode.Uri.file('/test/workspace');
    
    // Create test session
    session = new Session(
      'test-session',
      workspaceUri,
      mockAgentMapping,
      mockRequirements,
      WorkflowMode.SPEED,
      mockProgress
    );
    
    // Add user requirements to session metadata
    session.metadata.userRequirements = 'Create a simple React component with TypeScript that displays a greeting message';
  });

  test('should create PlanningRunner instance', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    assert.ok(runner);
  });

  test('should validate inputs correctly', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    // Access protected method for testing
    const validateInputs = (runner as any).validateInputs.bind(runner);
    const isValid = validateInputs();
    
    assert.strictEqual(isValid, true);
  });

  test('should validate inputs fail without agent', () => {
    const runner = new PlanningRunner(session, null as any, 'Test personality');
    
    // Access protected method for testing
    const validateInputs = (runner as any).validateInputs.bind(runner);
    const isValid = validateInputs();
    
    assert.strictEqual(isValid, false);
  });

  test('should get runner name', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    // Access protected method for testing
    const getRunnerName = (runner as any).getRunnerName.bind(runner);
    const name = getRunnerName();
    
    assert.strictEqual(name, 'Planning');
  });

  test('should infer action types correctly', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    // Access private method for testing
    const inferActionType = (runner as any).inferActionType.bind(runner);
    
    assert.strictEqual(inferActionType('Create a new file component.tsx'), ActionType.CREATE_FILE);
    assert.strictEqual(inferActionType('Modify the existing index.ts file'), ActionType.MODIFY_FILE);
    assert.strictEqual(inferActionType('Delete the old component.js file'), ActionType.DELETE_FILE);
    assert.strictEqual(inferActionType('Run npm install react'), ActionType.INSTALL_DEPENDENCY);
    assert.strictEqual(inferActionType('Execute the build command'), ActionType.RUN_COMMAND);
  });

  test('should extract action parameters correctly', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    // Access private method for testing
    const extractActionParameters = (runner as any).extractActionParameters.bind(runner);
    
    const params1 = extractActionParameters('Create a new file src/components/Greeting.tsx');
    assert.strictEqual(params1.filePath, 'src/components/Greeting.tsx');
    
    const params2 = extractActionParameters('Run command `npm install react-router-dom`');
    assert.strictEqual(params2.command, 'npm install react-router-dom');
    
    const params3 = extractActionParameters('Install package @types/react');
    assert.strictEqual(params3.packageName, '@types/react');
  });

  test('should extract actions from plan text', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    const planText = `
## Implementation Plan

This is a plan to create a React component.

## Action Steps

1. Create a new file src/components/Greeting.tsx
2. Modify the existing src/index.ts to import the component
3. Run npm install @types/react
4. Execute the build command

## Complexity Assessment

This is a moderate complexity task.
`;
    
    // Access private method for testing
    const extractActionsFromPlan = (runner as any).extractActionsFromPlan.bind(runner);
    const actions = extractActionsFromPlan(planText);
    
    assert.strictEqual(actions.length, 4);
    assert.strictEqual(actions[0].type, ActionType.CREATE_FILE);
    assert.strictEqual(actions[0].description, 'Create a new file src/components/Greeting.tsx');
    assert.strictEqual(actions[1].type, ActionType.MODIFY_FILE);
    assert.strictEqual(actions[2].type, ActionType.INSTALL_DEPENDENCY);
    assert.strictEqual(actions[3].type, ActionType.RUN_COMMAND);
  });

  test('should calculate action metadata correctly', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    const actions = [
      {
        id: 'action_1',
        type: ActionType.CREATE_FILE,
        description: 'Create component file',
        parameters: { filePath: 'src/Component.tsx' },
        dependencies: [],
        status: ActionStatus.PENDING
      },
      {
        id: 'action_2',
        type: ActionType.MODIFY_FILE,
        description: 'Update index file',
        parameters: { filePath: 'src/index.ts' },
        dependencies: ['action_1'],
        status: ActionStatus.PENDING
      },
      {
        id: 'action_3',
        type: ActionType.RUN_COMMAND,
        description: 'Build project',
        parameters: { command: 'npm run build' },
        dependencies: ['action_2'],
        status: ActionStatus.PENDING
      }
    ];
    
    // Access private method for testing
    const calculateActionMetadata = (runner as any).calculateActionMetadata.bind(runner);
    const metadata = calculateActionMetadata(actions);
    
    assert.strictEqual(metadata.totalActions, 3);
    assert.strictEqual(metadata.complexity, 'simple'); // 3 actions is simple
    assert.strictEqual(metadata.riskLevel, 'medium'); // Has command actions
    assert.ok(metadata.estimatedDuration > 0);
  });

  test('should enhance action parameters with context', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    const action = {
      id: 'action_1',
      type: ActionType.CREATE_FILE,
      description: 'Create TypeScript component',
      parameters: { filePath: 'src/Component.tsx' },
      dependencies: [],
      status: ActionStatus.PENDING
    };
    
    // Access private method for testing
    const enhanceActionParameters = (runner as any).enhanceActionParameters.bind(runner);
    const enhanced = enhanceActionParameters(action);
    
    assert.strictEqual(enhanced.filePath, 'src/Component.tsx');
    assert.strictEqual(enhanced.workspaceRelative, true);
    assert.strictEqual(enhanced.language, 'typescript');
  });

  test('should build context summary', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    // Set mock workspace context
    (runner as any).workspaceContext = mockWorkspaceContext;
    
    // Access private method for testing
    const getContextSummary = (runner as any).getContextSummary.bind(runner);
    const summary = getContextSummary();
    
    assert.ok(summary.includes('Workspace Summary'));
    assert.ok(summary.includes('/test/workspace'));
    assert.ok(summary.includes('5 files'));
    assert.ok(summary.includes('typescript, javascript'));
    assert.ok(summary.includes('React'));
  });

  test('should handle missing workspace context', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    // Don't set workspace context
    
    // Access private method for testing
    const getContextSummary = (runner as any).getContextSummary.bind(runner);
    const summary = getContextSummary();
    
    assert.strictEqual(summary, 'No workspace context available');
  });

  test('should build planning system prompt', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    // Set mock workspace context
    (runner as any).workspaceContext = mockWorkspaceContext;
    
    // Access private method for testing
    const buildPlanningSystemPrompt = (runner as any).buildPlanningSystemPrompt.bind(runner);
    const prompt = buildPlanningSystemPrompt();
    
    assert.ok(prompt.includes('expert software development planner'));
    assert.ok(prompt.includes('WORKSPACE CONTEXT'));
    assert.ok(prompt.includes('PLANNING GUIDELINES'));
    assert.ok(prompt.includes('RESPONSE FORMAT'));
    assert.ok(prompt.includes('Test personality'));
  });

  test('should build planning user prompt for first iteration', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    const userRequirements = 'Create a React component';
    const previousPlan = '';
    const iteration = 1;
    
    // Access private method for testing
    const buildPlanningUserPrompt = (runner as any).buildPlanningUserPrompt.bind(runner);
    const prompt = buildPlanningUserPrompt(userRequirements, previousPlan, iteration);
    
    assert.ok(prompt.includes('USER REQUIREMENTS'));
    assert.ok(prompt.includes('Create a React component'));
    assert.ok(prompt.includes('initial implementation plan'));
    assert.ok(!prompt.includes('PREVIOUS PLAN'));
  });

  test('should build planning user prompt for refinement iteration', () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    const userRequirements = 'Create a React component';
    const previousPlan = 'Previous plan content here';
    const iteration = 2;
    
    // Access private method for testing
    const buildPlanningUserPrompt = (runner as any).buildPlanningUserPrompt.bind(runner);
    const prompt = buildPlanningUserPrompt(userRequirements, previousPlan, iteration);
    
    assert.ok(prompt.includes('USER REQUIREMENTS'));
    assert.ok(prompt.includes('PREVIOUS PLAN'));
    assert.ok(prompt.includes('Previous plan content here'));
    assert.ok(prompt.includes('refine and improve'));
  });

  test('should determine when to continue iterating', async () => {
    const runner = new PlanningRunner(session, mockAgent, 'Test personality');
    
    // Access private method for testing
    const shouldContinueIterating = (runner as any).shouldContinueIterating.bind(runner);
    
    // Should not continue if at max iterations
    const result1 = await shouldContinueIterating({ plan: 'test', preliminaryActions: [] }, 3);
    assert.strictEqual(result1, false);
    
    // Should not continue if we have enough actions
    const result2 = await shouldContinueIterating({ 
      plan: 'test plan', 
      preliminaryActions: [1, 2, 3, 4].map(i => ({ id: `action_${i}` })) 
    }, 1);
    assert.strictEqual(result2, false);
    
    // Should continue if plan is too short
    const result3 = await shouldContinueIterating({ plan: 'short', preliminaryActions: [] }, 1);
    assert.strictEqual(result3, true);
  });
});