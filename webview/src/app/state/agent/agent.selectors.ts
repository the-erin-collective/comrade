import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AgentState } from './agent.state';
import { Agent } from '../../interfaces/provider-agent.interface';

/**
 * Feature selector for agent state
 */
export const selectAgentState = createFeatureSelector<AgentState>('agent');

/**
 * Basic agent selectors
 */
export const selectAgents = createSelector(
  selectAgentState,
  (state: AgentState) => state.agents
);

export const selectAgentsLoading = createSelector(
  selectAgentState,
  (state: AgentState) => state.loading
);

export const selectAgentsError = createSelector(
  selectAgentState,
  (state: AgentState) => state.error
);

export const selectSelectedAgent = createSelector(
  selectAgentState,
  (state: AgentState) => state.selectedAgent
);

/**
 * Active agents selector
 * Returns only agents that are currently active
 */
export const selectActiveAgents = createSelector(
  selectAgents,
  (agents: Agent[]) => agents.filter(agent => agent.isActive)
);

/**
 * Inactive agents selector
 * Returns only agents that are currently inactive
 */
export const selectInactiveAgents = createSelector(
  selectAgents,
  (agents: Agent[]) => agents.filter(agent => !agent.isActive)
);

/**
 * Agent by ID selector factory
 * Returns a selector that finds an agent by its ID
 */
export const selectAgentById = (agentId: string) => createSelector(
  selectAgents,
  (agents: Agent[]) => agents.find(agent => agent.id === agentId) || null
);

/**
 * Agents by provider selector factory
 * Returns a selector that finds all agents for a specific provider
 */
export const selectAgentsByProvider = (providerId: string) => createSelector(
  selectAgents,
  (agents: Agent[]) => agents.filter(agent => agent.providerId === providerId)
);

/**
 * Active agents by provider selector factory
 * Returns a selector that finds all active agents for a specific provider
 */
export const selectActiveAgentsByProvider = (providerId: string) => createSelector(
  selectActiveAgents,
  (agents: Agent[]) => agents.filter(agent => agent.providerId === providerId)
);

/**
 * Agents by capability selectors
 */
export const selectAgentsWithVision = createSelector(
  selectAgents,
  (agents: Agent[]) => agents.filter(agent => agent.capabilities.hasVision)
);

export const selectAgentsWithToolUse = createSelector(
  selectAgents,
  (agents: Agent[]) => agents.filter(agent => agent.capabilities.hasToolUse)
);

export const selectAgentsByReasoningDepth = (depth: 'basic' | 'intermediate' | 'advanced') => createSelector(
  selectAgents,
  (agents: Agent[]) => agents.filter(agent => agent.capabilities.reasoningDepth === depth)
);

export const selectAgentsBySpeed = (speed: 'fast' | 'medium' | 'slow') => createSelector(
  selectAgents,
  (agents: Agent[]) => agents.filter(agent => agent.capabilities.speed === speed)
);

export const selectAgentsByCostTier = (costTier: 'low' | 'medium' | 'high') => createSelector(
  selectAgents,
  (agents: Agent[]) => agents.filter(agent => agent.capabilities.costTier === costTier)
);

/**
 * Agent validation selectors
 */
export const selectValidationResults = createSelector(
  selectAgentState,
  (state: AgentState) => state.validationResults
);

export const selectAgentValidationResult = (agentId: string) => createSelector(
  selectValidationResults,
  (validationResults) => validationResults[agentId] || null
);

export const selectValidatedAgents = createSelector(
  selectAgents,
  selectValidationResults,
  (agents: Agent[], validationResults) => 
    agents.map(agent => ({
      ...agent,
      validationResult: validationResults[agent.id] || null
    }))
);

/**
 * Model-related selectors
 */
export const selectAvailableModels = createSelector(
  selectAgentState,
  (state: AgentState) => state.availableModels
);

export const selectModelsLoading = createSelector(
  selectAgentState,
  (state: AgentState) => state.loadingModels
);

export const selectModelError = createSelector(
  selectAgentState,
  (state: AgentState) => state.modelError
);

export const selectSelectedProviderId = createSelector(
  selectAgentState,
  (state: AgentState) => state.selectedProviderId
);

export const selectModelsForProvider = (providerId: string) => createSelector(
  selectAvailableModels,
  (availableModels) => availableModels[providerId] || []
);

export const selectModelsForSelectedProvider = createSelector(
  selectAvailableModels,
  selectSelectedProviderId,
  (availableModels, selectedProviderId) => 
    selectedProviderId ? (availableModels[selectedProviderId] || []) : []
);

/**
 * Statistics selectors
 */
export const selectAgentStats = createSelector(
  selectAgents,
  (agents: Agent[]) => {
    const totalAgents = agents.length;
    const activeAgents = agents.filter(a => a.isActive).length;
    
    const agentsByProvider = agents.reduce((acc, agent) => {
      acc[agent.providerId] = (acc[agent.providerId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const agentsByCapability = {
      vision: agents.filter(a => a.capabilities.hasVision).length,
      toolUse: agents.filter(a => a.capabilities.hasToolUse).length,
      streaming: agents.length // Assuming all agents support streaming for now
    };
    
    return {
      totalAgents,
      activeAgents,
      agentsByProvider,
      agentsByCapability
    };
  }
);

/**
 * UI state selectors
 */
export const selectHasAgents = createSelector(
  selectAgents,
  (agents: Agent[]) => agents.length > 0
);

export const selectHasActiveAgents = createSelector(
  selectActiveAgents,
  (activeAgents: Agent[]) => activeAgents.length > 0
);

export const selectIsAgentFormValid = createSelector(
  selectAgentsError,
  selectAgentsLoading,
  (error: string | null, loading: boolean) => !error && !loading
);

/**
 * Memoized selectors for performance
 */
export const selectAgentOptions = createSelector(
  selectActiveAgents,
  (agents: Agent[]) => 
    agents.map(agent => ({
      value: agent.id,
      label: agent.name,
      model: agent.model,
      providerId: agent.providerId,
      capabilities: agent.capabilities
    }))
);

export const selectAgentSummary = createSelector(
  selectAgents,
  selectValidationResults,
  (agents: Agent[], validationResults) => 
    agents.map(agent => ({
      id: agent.id,
      name: agent.name,
      model: agent.model,
      providerId: agent.providerId,
      isActive: agent.isActive,
      isValid: validationResults[agent.id]?.valid || false,
      capabilities: agent.capabilities,
      lastUpdated: agent.updatedAt
    }))
);

/**
 * Combined selectors for complex UI needs
 */
export const selectAgentsGroupedByProvider = createSelector(
  selectAgents,
  (agents: Agent[]) => {
    return agents.reduce((acc, agent) => {
      if (!acc[agent.providerId]) {
        acc[agent.providerId] = [];
      }
      acc[agent.providerId].push(agent);
      return acc;
    }, {} as Record<string, Agent[]>);
  }
);

export const selectActiveAgentsGroupedByProvider = createSelector(
  selectActiveAgents,
  (agents: Agent[]) => {
    return agents.reduce((acc, agent) => {
      if (!acc[agent.providerId]) {
        acc[agent.providerId] = [];
      }
      acc[agent.providerId].push(agent);
      return acc;
    }, {} as Record<string, Agent[]>);
  }
);

/**
 * Capability-based filtering selectors
 */
export const selectAgentsByCapabilities = (requiredCapabilities: Partial<Agent['capabilities']>) => createSelector(
  selectAgents,
  (agents: Agent[]) => agents.filter(agent => {
    return Object.entries(requiredCapabilities).every(([key, value]) => {
      const capabilityKey = key as keyof Agent['capabilities'];
      return agent.capabilities[capabilityKey] === value;
    });
  })
);

export const selectBestAgentForTask = (taskRequirements: {
  hasVision?: boolean;
  hasToolUse?: boolean;
  reasoningDepth?: 'basic' | 'intermediate' | 'advanced';
  speed?: 'fast' | 'medium' | 'slow';
  costTier?: 'low' | 'medium' | 'high';
}) => createSelector(
  selectActiveAgents,
  (agents: Agent[]) => {
    // Filter agents that meet the requirements
    const suitableAgents = agents.filter(agent => {
      if (taskRequirements.hasVision !== undefined && agent.capabilities.hasVision !== taskRequirements.hasVision) {
        return false;
      }
      if (taskRequirements.hasToolUse !== undefined && agent.capabilities.hasToolUse !== taskRequirements.hasToolUse) {
        return false;
      }
      if (taskRequirements.reasoningDepth && agent.capabilities.reasoningDepth !== taskRequirements.reasoningDepth) {
        return false;
      }
      if (taskRequirements.speed && agent.capabilities.speed !== taskRequirements.speed) {
        return false;
      }
      if (taskRequirements.costTier && agent.capabilities.costTier !== taskRequirements.costTier) {
        return false;
      }
      return true;
    });

    // Return the first suitable agent or null if none found
    return suitableAgents.length > 0 ? suitableAgents[0] : null;
  }
);