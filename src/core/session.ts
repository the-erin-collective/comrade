/**
 * Session management interfaces and types
 */

import * as vscode from 'vscode';
import { PhaseType, PhaseAgentMapping, SessionRequirements } from './agent';

export enum SessionState {
  IDLE = 'idle',
  AGENT_ASSIGNMENT = 'agent_assignment',
  CONTEXT_GENERATION = 'context_generation',
  PLANNING = 'planning',
  AWAITING_PLAN_APPROVAL = 'awaiting_plan_approval',
  PLAN_REVIEW = 'plan_review',
  AWAITING_REVIEW_APPROVAL = 'awaiting_review_approval',
  EXECUTION = 'execution',
  AWAITING_EXECUTION_APPROVAL = 'awaiting_execution_approval',
  RECOVERY = 'recovery',
  AWAITING_RECOVERY_DECISION = 'awaiting_recovery_decision',
  COMPLETED = 'completed',
  ERROR = 'error',
  CANCELLED = 'cancelled'
}

export enum WorkflowMode {
  SPEED = 'speed',     // Auto-execute all phases, user only involved in planning/recovery
  STRUCTURE = 'structure' // User explicitly approves each phase transition
}

export interface ProgressUpdate {
  message: string;
  increment?: number;
  total?: number;
}

export interface ISession {
  id: string;
  workspaceUri: vscode.Uri;
  state: SessionState;
  currentPhase?: PhaseType;
  agentMapping: PhaseAgentMapping;
  requirements: SessionRequirements;
  mode: WorkflowMode;
  cancellationToken: vscode.CancellationToken;
  progress: vscode.Progress<ProgressUpdate>;
  startTime: Date;
  metadata: Record<string, any>;
}