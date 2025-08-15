import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { map, catchError, switchMap, withLatestFrom, filter } from 'rxjs/operators';
import { MessageService } from '../../services/message.service';
import { Agent, AgentFormData, AgentValidationResult, AgentCapabilities } from '../../interfaces/provider-agent.interface';
import * as AgentActions from './agent.actions';
import * as ProviderActions from '../provider/provider.actions';
import { selectProviders } from '../provider/provider.selectors';

@Injectable()
export class AgentEffects {
  constructor(
    private actions$: Actions,
    private store: Store,
    private messageService: MessageService
  ) {}

  /**
   * Load agents effect
   * Fetches all configured agents from the VS Code extension
   */
  loadAgents$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgentActions.loadAgents),
      switchMap(() => {
        // Send message to extension to get agents
        this.messageService.sendMessage({
          type: 'getConfig',
          payload: { configType: 'agents' }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configResult' && message.payload.configType === 'agents'),
          map(message => AgentActions.loadAgentsSuccess({ 
            agents: message.payload.agents || [] 
          })),
          catchError(error => of(AgentActions.loadAgentsFailure({ 
            error: error.message || 'Failed to load agents' 
          })))
        );
      })
    )
  );

  /**
   * Add agent effect
   * Creates a new agent configuration
   */
  addAgent$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgentActions.addAgent),
      withLatestFrom(this.store.select(selectProviders)),
      switchMap(([{ agentData }, providers]) => {
        // Validate that the provider exists and is active
        const provider = providers.find(p => p.id === agentData.providerId);
        if (!provider) {
          return of(AgentActions.addAgentFailure({ 
            error: 'Selected provider not found' 
          }));
        }

        if (!provider.isActive) {
          return of(AgentActions.addAgentFailure({ 
            error: 'Selected provider is not active' 
          }));
        }

        // Generate a unique ID for the agent
        const agent: Agent = {
          ...this.createAgentFromFormData(agentData),
          id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Send message to extension to save the agent
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'agents',
            operation: 'add',
            data: agent
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult'),
          map(message => {
            if (message.payload.success) {
              return AgentActions.addAgentSuccess({ agent });
            } else {
              return AgentActions.addAgentFailure({ 
                error: message.payload.error || 'Failed to add agent' 
              });
            }
          }),
          catchError(error => of(AgentActions.addAgentFailure({ 
            error: error.message || 'Failed to add agent' 
          })))
        );
      })
    )
  );

  /**
   * Update agent effect
   * Updates an existing agent configuration
   */
  updateAgent$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgentActions.updateAgent),
      switchMap(({ agentId, updates }) => {
        const updatedAgent = {
          ...updates,
          id: agentId,
          updatedAt: new Date()
        };

        // Send message to extension to update the agent
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'agents',
            operation: 'update',
            agentId,
            data: updatedAgent
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult'),
          map(message => {
            if (message.payload.success) {
              return AgentActions.updateAgentSuccess({ 
                agent: message.payload.agent || updatedAgent as Agent
              });
            } else {
              return AgentActions.updateAgentFailure({ 
                error: message.payload.error || 'Failed to update agent' 
              });
            }
          }),
          catchError(error => of(AgentActions.updateAgentFailure({ 
            error: error.message || 'Failed to update agent' 
          })))
        );
      })
    )
  );

  /**
   * Delete agent effect
   * Removes an agent configuration
   */
  deleteAgent$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgentActions.deleteAgent),
      switchMap(({ agentId }) => {
        // Send message to extension to delete the agent
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'agents',
            operation: 'delete',
            agentId
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult'),
          map(message => {
            if (message.payload.success) {
              return AgentActions.deleteAgentSuccess({ agentId });
            } else {
              return AgentActions.deleteAgentFailure({ 
                error: message.payload.error || 'Failed to delete agent' 
              });
            }
          }),
          catchError(error => of(AgentActions.deleteAgentFailure({ 
            error: error.message || 'Failed to delete agent' 
          })))
        );
      })
    )
  );

  /**
   * Toggle agent effect
   * Toggles an agent's active status
   */
  toggleAgent$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgentActions.toggleAgent),
      switchMap(({ agentId, isActive }) => {
        // Send message to extension to toggle the agent
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'agents',
            operation: 'toggle',
            agentId,
            isActive
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult'),
          map(message => {
            if (message.payload.success) {
              return AgentActions.toggleAgentSuccess({ 
                agent: message.payload.agent
              });
            } else {
              return AgentActions.toggleAgentFailure({ 
                error: message.payload.error || 'Failed to toggle agent' 
              });
            }
          }),
          catchError(error => of(AgentActions.toggleAgentFailure({ 
            error: error.message || 'Failed to toggle agent' 
          })))
        );
      })
    )
  );

  /**
   * Validate agent effect
   * Tests agent configuration and provider dependency
   */
  validateAgent$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgentActions.validateAgent),
      withLatestFrom(this.store.select(selectProviders)),
      switchMap(([{ agentId }, providers]) => {
        // Send message to extension to validate the agent
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'agents',
            operation: 'validate',
            agentId
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult' && message.payload.operation === 'validate'),
          map(message => {
            if (message.payload.success) {
              const result: AgentValidationResult = {
                valid: true,
                providerStatus: message.payload.providerStatus || 'active',
                modelAvailable: message.payload.modelAvailable || true,
                estimatedCost: message.payload.estimatedCost || 'medium'
              };
              return AgentActions.validateAgentSuccess({ agentId, result });
            } else {
              return AgentActions.validateAgentFailure({ 
                agentId,
                error: message.payload.error || 'Agent validation failed' 
              });
            }
          }),
          catchError(error => of(AgentActions.validateAgentFailure({ 
            agentId,
            error: error.message || 'Agent validation failed' 
          })))
        );
      })
    )
  );

  /**
   * Load models for provider effect (for agent configuration)
   * Fetches available models from a specific provider for agent setup
   */
  loadModelsForProvider$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgentActions.loadModelsForProvider),
      switchMap(({ providerId }) => {
        // Send message to extension to fetch models
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'providers',
            operation: 'fetchModels',
            providerId
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult' && 
                            message.payload.operation === 'fetchModels' &&
                            message.payload.providerId === providerId),
          map(message => {
            if (message.payload.success) {
              return AgentActions.loadModelsForProviderSuccess({ 
                providerId, 
                models: message.payload.models || [] 
              });
            } else {
              return AgentActions.loadModelsForProviderFailure({ 
                providerId,
                error: message.payload.error || 'Failed to fetch models' 
              });
            }
          }),
          catchError(error => of(AgentActions.loadModelsForProviderFailure({ 
            providerId,
            error: error.message || 'Failed to fetch models' 
          })))
        );
      })
    )
  );

  /**
   * Deactivate agents by provider effect
   * Deactivates all agents that use a specific provider
   */
  deactivateAgentsByProvider$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgentActions.deactivateAgentsByProvider),
      switchMap(({ providerId }) => {
        // Send message to extension to deactivate agents by provider
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'agents',
            operation: 'deactivateByProvider',
            providerId
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult' && 
                            message.payload.operation === 'deactivateByProvider'),
          map(message => {
            if (message.payload.success) {
              return AgentActions.deactivateAgentsByProviderSuccess({ 
                agentIds: message.payload.agentIds || [] 
              });
            } else {
              return AgentActions.deactivateAgentsByProviderFailure({ 
                error: message.payload.error || 'Failed to deactivate agents' 
              });
            }
          }),
          catchError(error => of(AgentActions.deactivateAgentsByProviderFailure({ 
            error: error.message || 'Failed to deactivate agents' 
          })))
        );
      })
    )
  );

  /**
   * Delete agents by provider effect
   * Deletes all agents that use a specific provider
   */
  deleteAgentsByProvider$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AgentActions.deleteAgentsByProvider),
      switchMap(({ providerId }) => {
        // Send message to extension to delete agents by provider
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'agents',
            operation: 'deleteByProvider',
            providerId
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult' && 
                            message.payload.operation === 'deleteByProvider'),
          map(message => {
            if (message.payload.success) {
              return AgentActions.deleteAgentsByProviderSuccess({ 
                agentIds: message.payload.agentIds || [] 
              });
            } else {
              return AgentActions.deleteAgentsByProviderFailure({ 
                error: message.payload.error || 'Failed to delete agents' 
              });
            }
          }),
          catchError(error => of(AgentActions.deleteAgentsByProviderFailure({ 
            error: error.message || 'Failed to delete agents' 
          })))
        );
      })
    )
  );

  /**
   * Cascade effect: When a provider is deactivated, deactivate its agents
   */
  cascadeProviderDeactivation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProviderActions.toggleProviderSuccess),
      filter(({ provider }) => !provider.isActive),
      map(({ provider }) => AgentActions.deactivateAgentsByProvider({ providerId: provider.id }))
    )
  );

  /**
   * Cascade effect: When a provider is deleted, delete its agents
   */
  cascadeProviderDeletion$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProviderActions.deleteProviderSuccess),
      map(({ providerId }) => AgentActions.deleteAgentsByProvider({ providerId }))
    )
  );

  /**
   * Helper method to create agent from form data
   */
  private createAgentFromFormData(formData: AgentFormData): Omit<Agent, 'id' | 'createdAt' | 'updatedAt'> {
    const defaultCapabilities: AgentCapabilities = {
      hasVision: false,
      hasToolUse: true,
      reasoningDepth: 'intermediate',
      speed: 'medium',
      costTier: 'medium'
    };

    return {
      name: formData.name,
      providerId: formData.providerId,
      model: formData.model,
      temperature: formData.temperature || 0.7,
      maxTokens: formData.maxTokens || 4000,
      timeout: formData.timeout || 30000,
      systemPrompt: formData.systemPrompt || '',
      capabilities: { ...defaultCapabilities, ...formData.capabilities },
      isActive: true
    };
  }
}