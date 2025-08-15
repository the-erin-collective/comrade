import { createReducer, on } from '@ngrx/store';
import { AgentState, initialAgentState } from './agent.state';
import * as AgentActions from './agent.actions';

/**
 * Agent reducer
 * Handles all agent-related state updates with immutable operations
 */
export const agentReducer = createReducer(
  initialAgentState,

  // Load agents
  on(AgentActions.loadAgents, (state): AgentState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(AgentActions.loadAgentsSuccess, (state, { agents }): AgentState => ({
    ...state,
    agents,
    loading: false,
    error: null
  })),

  on(AgentActions.loadAgentsFailure, (state, { error }): AgentState => ({
    ...state,
    loading: false,
    error
  })),

  // Add agent
  on(AgentActions.addAgent, (state): AgentState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(AgentActions.addAgentSuccess, (state, { agent }): AgentState => ({
    ...state,
    agents: [...state.agents, agent],
    loading: false,
    error: null
  })),

  on(AgentActions.addAgentFailure, (state, { error }): AgentState => ({
    ...state,
    loading: false,
    error
  })),

  // Update agent
  on(AgentActions.updateAgent, (state): AgentState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(AgentActions.updateAgentSuccess, (state, { agent }): AgentState => ({
    ...state,
    agents: state.agents.map(a => a.id === agent.id ? agent : a),
    selectedAgent: state.selectedAgent?.id === agent.id ? agent : state.selectedAgent,
    loading: false,
    error: null
  })),

  on(AgentActions.updateAgentFailure, (state, { error }): AgentState => ({
    ...state,
    loading: false,
    error
  })),

  // Delete agent
  on(AgentActions.deleteAgent, (state): AgentState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(AgentActions.deleteAgentSuccess, (state, { agentId }): AgentState => ({
    ...state,
    agents: state.agents.filter(a => a.id !== agentId),
    selectedAgent: state.selectedAgent?.id === agentId ? null : state.selectedAgent,
    validationResults: Object.fromEntries(
      Object.entries(state.validationResults).filter(([id]) => id !== agentId)
    ),
    loading: false,
    error: null
  })),

  on(AgentActions.deleteAgentFailure, (state, { error }): AgentState => ({
    ...state,
    loading: false,
    error
  })),

  // Toggle agent
  on(AgentActions.toggleAgent, (state): AgentState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(AgentActions.toggleAgentSuccess, (state, { agent }): AgentState => ({
    ...state,
    agents: state.agents.map(a => a.id === agent.id ? agent : a),
    selectedAgent: state.selectedAgent?.id === agent.id ? agent : state.selectedAgent,
    loading: false,
    error: null
  })),

  on(AgentActions.toggleAgentFailure, (state, { error }): AgentState => ({
    ...state,
    loading: false,
    error
  })),

  // Agent selection
  on(AgentActions.selectAgent, (state, { agent }): AgentState => ({
    ...state,
    selectedAgent: agent
  })),

  // Agent validation
  on(AgentActions.validateAgent, (state): AgentState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(AgentActions.validateAgentSuccess, (state, { agentId, result }): AgentState => ({
    ...state,
    validationResults: {
      ...state.validationResults,
      [agentId]: result
    },
    loading: false,
    error: null
  })),

  on(AgentActions.validateAgentFailure, (state, { agentId, error }): AgentState => ({
    ...state,
    validationResults: {
      ...state.validationResults,
      [agentId]: {
        valid: false,
        error,
        providerStatus: 'not_found'
      }
    },
    loading: false,
    error
  })),

  // Model loading for agent configuration
  on(AgentActions.loadModelsForProvider, (state): AgentState => ({
    ...state,
    loadingModels: true,
    modelError: null
  })),

  on(AgentActions.loadModelsForProviderSuccess, (state, { providerId, models }): AgentState => ({
    ...state,
    availableModels: {
      ...state.availableModels,
      [providerId]: models
    },
    loadingModels: false,
    modelError: null
  })),

  on(AgentActions.loadModelsForProviderFailure, (state, { providerId, error }): AgentState => ({
    ...state,
    availableModels: {
      ...state.availableModels,
      [providerId]: []
    },
    loadingModels: false,
    modelError: error
  })),

  on(AgentActions.setSelectedProvider, (state, { providerId }): AgentState => ({
    ...state,
    selectedProviderId: providerId
  })),

  // Dependency management - deactivate agents by provider
  on(AgentActions.deactivateAgentsByProvider, (state): AgentState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(AgentActions.deactivateAgentsByProviderSuccess, (state, { agentIds }): AgentState => ({
    ...state,
    agents: state.agents.map(agent => 
      agentIds.includes(agent.id) 
        ? { ...agent, isActive: false, updatedAt: new Date() }
        : agent
    ),
    loading: false,
    error: null
  })),

  on(AgentActions.deactivateAgentsByProviderFailure, (state, { error }): AgentState => ({
    ...state,
    loading: false,
    error
  })),

  // Dependency management - delete agents by provider
  on(AgentActions.deleteAgentsByProvider, (state): AgentState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(AgentActions.deleteAgentsByProviderSuccess, (state, { agentIds }): AgentState => ({
    ...state,
    agents: state.agents.filter(agent => !agentIds.includes(agent.id)),
    selectedAgent: agentIds.includes(state.selectedAgent?.id || '') ? null : state.selectedAgent,
    validationResults: Object.fromEntries(
      Object.entries(state.validationResults).filter(([id]) => !agentIds.includes(id))
    ),
    loading: false,
    error: null
  })),

  on(AgentActions.deleteAgentsByProviderFailure, (state, { error }): AgentState => ({
    ...state,
    loading: false,
    error
  })),

  // Clear actions
  on(AgentActions.clearAgentError, (state): AgentState => ({
    ...state,
    error: null
  })),

  on(AgentActions.clearModelError, (state): AgentState => ({
    ...state,
    modelError: null
  })),

  on(AgentActions.clearValidationResults, (state): AgentState => ({
    ...state,
    validationResults: {}
  })),

  // Reset state
  on(AgentActions.resetAgentState, (): AgentState => initialAgentState)
);