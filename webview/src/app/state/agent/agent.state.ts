import { Agent, AgentValidationResult } from '../../interfaces/provider-agent.interface';

/**
 * Agent state interface
 * Manages the state for agent configuration and management
 */
export interface AgentState {
  /** Array of configured agents */
  agents: Agent[];
  
  /** Loading state for agent operations */
  loading: boolean;
  
  /** Error message for agent operations */
  error: string | null;
  
  /** Currently selected agent for editing */
  selectedAgent: Agent | null;
  
  /** Validation results for agents */
  validationResults: Record<string, AgentValidationResult>;
  
  /** Available models for each provider (cached from provider state) */
  availableModels: Record<string, string[]>;
  
  /** Loading state for model fetching */
  loadingModels: boolean;
  
  /** Model loading errors */
  modelError: string | null;
  
  /** Currently selected provider ID for model loading */
  selectedProviderId: string | null;
}

/**
 * Initial state for agent management
 */
export const initialAgentState: AgentState = {
  agents: [],
  loading: false,
  error: null,
  selectedAgent: null,
  validationResults: {},
  availableModels: {},
  loadingModels: false,
  modelError: null,
  selectedProviderId: null
};