/**
 * Agent assignment service interfaces for intelligent phase mapping
 */

import { IAgent, PhaseAgentMapping, SessionRequirements } from './agent';

export interface IAgentAssignmentService {
  assignAgentsToPhases(
    availableAgents: IAgent[], 
    sessionRequirements: SessionRequirements
  ): Promise<PhaseAgentMapping>;
  
  validateAssignment(mapping: PhaseAgentMapping, agents: IAgent[]): boolean;
  recalculateAssignments(sessionId: string): Promise<PhaseAgentMapping>;
  getAssignmentPreview(agents: IAgent[]): Promise<PhaseAgentMapping>;
}

export interface AssignmentCriteria {
  prioritizeSpeed: boolean;
  prioritizeCost: boolean;
  requireVision: boolean;
  requireToolUse: boolean;
  minimumReasoningDepth: 'basic' | 'intermediate' | 'advanced';
  preferredSpecializations: string[];
}

export interface AssignmentResult {
  mapping: PhaseAgentMapping;
  score: number;
  reasoning: string;
  warnings: string[];
  alternatives: PhaseAgentMapping[];
}

export interface AssignmentContext {
  sessionRequirements: SessionRequirements;
  availableAgents: IAgent[];
  criteria: AssignmentCriteria;
  constraints: AssignmentConstraints;
}

export interface AssignmentConstraints {
  maxCostPerSession?: number;
  requiredAgents?: string[]; // agent IDs that must be used
  excludedAgents?: string[]; // agent IDs that cannot be used
  phaseConstraints?: Record<string, string[]>; // phase -> allowed agent IDs
}