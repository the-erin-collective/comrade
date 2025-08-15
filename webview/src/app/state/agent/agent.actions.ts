import { createAction, props } from '@ngrx/store';
import { Agent, AgentFormData, AgentValidationResult } from '../../interfaces/provider-agent.interface';

/**
 * Agent loading actions
 */
export const loadAgents = createAction('[Agent] Load Agents');

export const loadAgentsSuccess = createAction(
  '[Agent] Load Agents Success',
  props<{ agents: Agent[] }>()
);

export const loadAgentsFailure = createAction(
  '[Agent] Load Agents Failure',
  props<{ error: string }>()
);

/**
 * Agent CRUD actions
 */
export const addAgent = createAction(
  '[Agent] Add Agent',
  props<{ agentData: AgentFormData }>()
);

export const addAgentSuccess = createAction(
  '[Agent] Add Agent Success',
  props<{ agent: Agent }>()
);

export const addAgentFailure = createAction(
  '[Agent] Add Agent Failure',
  props<{ error: string }>()
);

export const updateAgent = createAction(
  '[Agent] Update Agent',
  props<{ agentId: string; updates: Partial<Agent> }>()
);

export const updateAgentSuccess = createAction(
  '[Agent] Update Agent Success',
  props<{ agent: Agent }>()
);

export const updateAgentFailure = createAction(
  '[Agent] Update Agent Failure',
  props<{ error: string }>()
);

export const deleteAgent = createAction(
  '[Agent] Delete Agent',
  props<{ agentId: string }>()
);

export const deleteAgentSuccess = createAction(
  '[Agent] Delete Agent Success',
  props<{ agentId: string }>()
);

export const deleteAgentFailure = createAction(
  '[Agent] Delete Agent Failure',
  props<{ error: string }>()
);

export const toggleAgent = createAction(
  '[Agent] Toggle Agent',
  props<{ agentId: string; isActive: boolean }>()
);

export const toggleAgentSuccess = createAction(
  '[Agent] Toggle Agent Success',
  props<{ agent: Agent }>()
);

export const toggleAgentFailure = createAction(
  '[Agent] Toggle Agent Failure',
  props<{ error: string }>()
);

/**
 * Agent selection actions
 */
export const selectAgent = createAction(
  '[Agent] Select Agent',
  props<{ agent: Agent | null }>()
);

/**
 * Agent validation actions
 */
export const validateAgent = createAction(
  '[Agent] Validate Agent',
  props<{ agentId: string }>()
);

export const validateAgentSuccess = createAction(
  '[Agent] Validate Agent Success',
  props<{ agentId: string; result: AgentValidationResult }>()
);

export const validateAgentFailure = createAction(
  '[Agent] Validate Agent Failure',
  props<{ agentId: string; error: string }>()
);

/**
 * Model loading actions for agent configuration
 */
export const loadModelsForProvider = createAction(
  '[Agent] Load Models For Provider',
  props<{ providerId: string }>()
);

export const loadModelsForProviderSuccess = createAction(
  '[Agent] Load Models For Provider Success',
  props<{ providerId: string; models: string[] }>()
);

export const loadModelsForProviderFailure = createAction(
  '[Agent] Load Models For Provider Failure',
  props<{ providerId: string; error: string }>()
);

export const setSelectedProvider = createAction(
  '[Agent] Set Selected Provider',
  props<{ providerId: string | null }>()
);

/**
 * Dependency management actions
 */
export const deactivateAgentsByProvider = createAction(
  '[Agent] Deactivate Agents By Provider',
  props<{ providerId: string }>()
);

export const deactivateAgentsByProviderSuccess = createAction(
  '[Agent] Deactivate Agents By Provider Success',
  props<{ agentIds: string[] }>()
);

export const deactivateAgentsByProviderFailure = createAction(
  '[Agent] Deactivate Agents By Provider Failure',
  props<{ error: string }>()
);

export const deleteAgentsByProvider = createAction(
  '[Agent] Delete Agents By Provider',
  props<{ providerId: string }>()
);

export const deleteAgentsByProviderSuccess = createAction(
  '[Agent] Delete Agents By Provider Success',
  props<{ agentIds: string[] }>()
);

export const deleteAgentsByProviderFailure = createAction(
  '[Agent] Delete Agents By Provider Failure',
  props<{ error: string }>()
);

/**
 * Clear actions
 */
export const clearAgentError = createAction('[Agent] Clear Error');

export const clearModelError = createAction('[Agent] Clear Model Error');

export const clearValidationResults = createAction('[Agent] Clear Validation Results');

/**
 * Reset actions
 */
export const resetAgentState = createAction('[Agent] Reset State');