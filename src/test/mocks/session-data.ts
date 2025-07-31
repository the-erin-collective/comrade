/**
 * Mock session data and configurations for testing
 */

import * as vscode from 'vscode';
import { Session, SessionState, WorkflowMode } from '../../core/session';
import { PhaseType, PhaseAgentMapping, SessionRequirements } from '../../core/agent';

export const mockSessionRequirements: Record<string, SessionRequirements> = {
  simple: {
    hasImages: false,
    workspaceSize: 'small',
    complexity: 'simple',
    timeConstraints: 'none',
    toolsRequired: [],
    preferredCostTier: 'low'
  },

  moderate: {
    hasImages: false,
    workspaceSize: 'medium',
    complexity: 'moderate',
    timeConstraints: 'moderate',
    toolsRequired: ['npm', 'git'],
    preferredCostTier: 'medium'
  },

  complex: {
    hasImages: true,
    workspaceSize: 'large',
    complexity: 'complex',
    timeConstraints: 'strict',
    toolsRequired: ['npm', 'git', 'docker', 'aws-cli'],
    preferredCostTier: 'high'
  },

  visionRequired: {
    hasImages: true,
    workspaceSize: 'medium',
    complexity: 'moderate',
    timeConstraints: 'none',
    toolsRequired: ['npm'],
    preferredCostTier: 'medium'
  },

  toolsRequired: {
    hasImages: false,
    workspaceSize: 'medium',
    complexity: 'moderate',
    timeConstraints: 'none',
    toolsRequired: ['npm', 'git', 'docker'],
    preferredCostTier: 'medium'
  }
};

export const mockAgentMappings: Record<string, PhaseAgentMapping> = {
  singleAgent: {
    assignments: {
      [PhaseType.CONTEXT]: 'openai-gpt4',
      [PhaseType.PLANNING]: 'openai-gpt4',
      [PhaseType.REVIEW]: 'openai-gpt4',
      [PhaseType.EXECUTION]: 'openai-gpt4',
      [PhaseType.RECOVERY]: 'openai-gpt4'
    },
    reasoning: 'Using single high-capability agent for all phases to ensure consistency',
    confidence: 0.9,
    alternatives: {
      [PhaseType.CONTEXT]: ['anthropic-claude'],
      [PhaseType.PLANNING]: ['anthropic-claude'],
      [PhaseType.REVIEW]: ['anthropic-claude'],
      [PhaseType.EXECUTION]: ['anthropic-claude'],
      [PhaseType.RECOVERY]: ['anthropic-claude']
    }
  },

  optimized: {
    assignments: {
      [PhaseType.CONTEXT]: 'openai-gpt35', // Fast for context
      [PhaseType.PLANNING]: 'openai-gpt4',  // Advanced for planning
      [PhaseType.REVIEW]: 'anthropic-claude', // Advanced for review
      [PhaseType.EXECUTION]: 'openai-gpt4', // Advanced for execution
      [PhaseType.RECOVERY]: 'anthropic-claude' // Advanced for recovery
    },
    reasoning: 'Optimized assignment using fast agent for context and advanced agents for complex phases',
    confidence: 0.85,
    alternatives: {
      [PhaseType.CONTEXT]: ['openai-gpt4'],
      [PhaseType.PLANNING]: ['anthropic-claude'],
      [PhaseType.REVIEW]: ['openai-gpt4'],
      [PhaseType.EXECUTION]: ['anthropic-claude'],
      [PhaseType.RECOVERY]: ['openai-gpt4']
    }
  },

  costOptimized: {
    assignments: {
      [PhaseType.CONTEXT]: 'openai-gpt35',
      [PhaseType.PLANNING]: 'openai-gpt35',
      [PhaseType.REVIEW]: 'openai-gpt4',
      [PhaseType.EXECUTION]: 'openai-gpt35',
      [PhaseType.RECOVERY]: 'openai-gpt4'
    },
    reasoning: 'Cost-optimized assignment using cheaper models where possible',
    confidence: 0.75,
    alternatives: {
      [PhaseType.CONTEXT]: ['ollama-llama2'],
      [PhaseType.PLANNING]: ['openai-gpt4'],
      [PhaseType.REVIEW]: ['anthropic-claude'],
      [PhaseType.EXECUTION]: ['openai-gpt4'],
      [PhaseType.RECOVERY]: ['anthropic-claude']
    }
  }
};

export class MockProgress implements vscode.Progress<any> {
  private reports: Array<{ message?: string; increment?: number }> = [];

  report(value: { message?: string; increment?: number }): void {
    this.reports.push(value);
  }

  getReports(): Array<{ message?: string; increment?: number }> {
    return [...this.reports];
  }

  getLastReport(): { message?: string; increment?: number } | undefined {
    return this.reports[this.reports.length - 1];
  }

  clear(): void {
    this.reports = [];
  }
}

export function createMockSession(
  id: string = 'test-session',
  workspaceUri: vscode.Uri = vscode.Uri.file('/test/workspace'),
  requirementsType: keyof typeof mockSessionRequirements = 'moderate',
  mappingType: keyof typeof mockAgentMappings = 'optimized',
  mode: WorkflowMode = WorkflowMode.SPEED
): { session: Session; progress: MockProgress } {
  const progress = new MockProgress();
  
  const session = new Session(
    id,
    workspaceUri,
    mockAgentMappings[mappingType],
    mockSessionRequirements[requirementsType],
    mode,
    progress
  );

  return { session, progress };
}

export const mockSessionScenarios = {
  // Successful workflow scenarios
  contextToPlanning: {
    initialState: SessionState.CONTEXT_GENERATION,
    expectedTransitions: [
      SessionState.CONTEXT_GENERATION,
      SessionState.PLANNING,
      SessionState.AWAITING_PLAN_APPROVAL
    ]
  },

  planningToExecution: {
    initialState: SessionState.PLANNING,
    expectedTransitions: [
      SessionState.PLANNING,
      SessionState.AWAITING_PLAN_APPROVAL,
      SessionState.EXECUTION,
      SessionState.COMPLETED
    ]
  },

  fullWorkflow: {
    initialState: SessionState.IDLE,
    expectedTransitions: [
      SessionState.IDLE,
      SessionState.AGENT_ASSIGNMENT,
      SessionState.CONTEXT_GENERATION,
      SessionState.PLANNING,
      SessionState.AWAITING_PLAN_APPROVAL,
      SessionState.EXECUTION,
      SessionState.COMPLETED
    ]
  },

  // Error scenarios
  contextGenerationError: {
    initialState: SessionState.CONTEXT_GENERATION,
    expectedTransitions: [
      SessionState.CONTEXT_GENERATION,
      SessionState.ERROR
    ]
  },

  planningError: {
    initialState: SessionState.PLANNING,
    expectedTransitions: [
      SessionState.PLANNING,
      SessionState.ERROR
    ]
  },

  executionErrorWithRecovery: {
    initialState: SessionState.EXECUTION,
    expectedTransitions: [
      SessionState.EXECUTION,
      SessionState.RECOVERY,
      SessionState.EXECUTION,
      SessionState.COMPLETED
    ]
  },

  // Cancellation scenarios
  cancelledDuringContext: {
    initialState: SessionState.CONTEXT_GENERATION,
    expectedTransitions: [
      SessionState.CONTEXT_GENERATION,
      SessionState.CANCELLED
    ]
  },

  cancelledDuringExecution: {
    initialState: SessionState.EXECUTION,
    expectedTransitions: [
      SessionState.EXECUTION,
      SessionState.CANCELLED
    ]
  }
};

export interface MockSessionScenario {
  initialState: SessionState;
  expectedTransitions: SessionState[];
}

export function createSessionScenario(scenarioName: keyof typeof mockSessionScenarios): MockSessionScenario {
  return mockSessionScenarios[scenarioName];
}