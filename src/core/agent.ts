/**
 * Core agent interfaces and types for the Comrade VS Code extension
 */

export enum PhaseType {
  CONTEXT = 'context',
  PLANNING = 'planning',
  REVIEW = 'review',
  EXECUTION = 'execution',
  RECOVERY = 'recovery'
}

export interface AgentCapabilities {
  hasVision: boolean;
  hasToolUse: boolean;
  reasoningDepth: 'basic' | 'intermediate' | 'advanced';
  speed: 'fast' | 'medium' | 'slow';
  costTier: 'low' | 'medium' | 'high';
  maxTokens: number;
  supportedLanguages: string[];
  specializations: string[]; // e.g., ['code', 'analysis', 'debugging']
}

export type LLMProvider = 'openai' | 'anthropic' | 'ollama' | 'custom';

export interface AgentConfig {
  provider: LLMProvider;
  endpoint?: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  tools?: {
    enabled: boolean;
    allowedTools: string[];
    requireApproval: boolean;
  };
  systemPrompt?: string;
  maxHistoryLength?: number;
  persistHistory?: boolean;
  contextWindowSize?: number;
  includeFileContents?: boolean;
  includeWorkspaceContext?: boolean;
}

export interface IAgent {
  id: string;
  name: string;
  provider: LLMProvider;
  config: AgentConfig;
  capabilities: AgentCapabilities;
  isEnabledForAssignment: boolean;
  isAvailable(): Promise<boolean>;
}

export interface PhaseAgentMapping {
  assignments: Record<PhaseType, string>; // phase -> agent.id
  reasoning: string;
  confidence: number;
  alternatives: Record<PhaseType, string[]>; // backup options
}

export interface SessionRequirements {
  hasImages: boolean;
  workspaceSize: 'small' | 'medium' | 'large';
  complexity: 'simple' | 'moderate' | 'complex';
  timeConstraints: 'none' | 'moderate' | 'strict';
  toolsRequired: string[];
  preferredCostTier: 'low' | 'medium' | 'high' | 'any';
  customInstructions?: string;
}

export interface CostEstimate {
  tokensPerRequest: number;
  costPerToken: number;
  estimatedSessionCost: number;
}

export interface ConfigurableAgent {
  agent: IAgent;
  isConnected: boolean;
  isConfigured: boolean;
  isEnabledForAssignment: boolean;
  estimatedCost: CostEstimate;
}