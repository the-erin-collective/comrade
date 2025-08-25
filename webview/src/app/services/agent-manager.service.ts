import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, map, filter, take, firstValueFrom, combineLatest } from 'rxjs';
import { 
  Agent, 
  AgentFormData, 
  AgentValidationResult, 
  ValidationResult,
  AgentWithProvider,
  ProviderConfig,
  AgentCapabilities
} from '../interfaces/provider-agent.interface';
import { MessageService } from './message.service';
import { ProviderManagerService } from './provider-manager.service';
import * as AgentActions from '../state/agent/agent.actions';
import { 
  selectAgents, 
  selectActiveAgents, 
  selectAgentById,
  selectAgentsLoading,
  selectAgentsError,
  selectAgentsByProvider,
  selectAvailableModels,
  selectModelsLoading
} from '../state/agent/agent.selectors';

/**
 * Agent Manager Service
 * 
 * Handles CRUD operations for AI agents that are built on top of configured providers.
 * Manages dependencies between agents and providers, including cascade operations.
 * Integrates with NgRx state management and VS Code extension messaging.
 */
@Injectable({
  providedIn: 'root'
})
export class AgentManagerService {
  
  // Observable selectors for reactive UI updates
  public readonly agents$: Observable<Agent[]>;
  public readonly activeAgents$: Observable<Agent[]>;
  public readonly loading$: Observable<boolean>;
  public readonly error$: Observable<string | null>;
  public readonly modelsLoading$: Observable<boolean>;

  constructor(
    private store: Store,
    private messageService: MessageService,
    private providerManager: ProviderManagerService
  ) {
    // Initialize observables after store is available
    this.agents$ = this.store.select(selectAgents);
    this.activeAgents$ = this.store.select(selectActiveAgents);
    this.loading$ = this.store.select(selectAgentsLoading);
    this.error$ = this.store.select(selectAgentsError);
    this.modelsLoading$ = this.store.select(selectModelsLoading);
    
    this.setupMessageHandlers();
  }

  /**
   * Setup message handlers for VS Code extension communication
   */
  private setupMessageHandlers(): void {
    this.messageService.messages$.subscribe(message => {
      switch (message.type) {
        case 'agentConfigResult':
          if (message.payload?.agents) {
            this.store.dispatch(AgentActions.loadAgentsSuccess({ 
              agents: message.payload.agents 
            }));
          }
          break;
        
        case 'agentUpdateResult':
          if (message.payload?.success && message.payload?.agent) {
            if (message.payload.operation === 'add') {
              this.store.dispatch(AgentActions.addAgentSuccess({ 
                agent: message.payload.agent 
              }));
            } else if (message.payload.operation === 'update') {
              this.store.dispatch(AgentActions.updateAgentSuccess({ 
                agent: message.payload.agent 
              }));
            } else if (message.payload.operation === 'delete') {
              this.store.dispatch(AgentActions.deleteAgentSuccess({ 
                agentId: message.payload.agentId 
              }));
            } else if (message.payload.operation === 'toggle') {
              this.store.dispatch(AgentActions.toggleAgentSuccess({ 
                agent: message.payload.agent 
              }));
            }
          } else if (message.payload?.error) {
            const error = message.payload.error;
            if (message.payload.operation === 'add') {
              this.store.dispatch(AgentActions.addAgentFailure({ error }));
            } else if (message.payload.operation === 'update') {
              this.store.dispatch(AgentActions.updateAgentFailure({ error }));
            } else if (message.payload.operation === 'delete') {
              this.store.dispatch(AgentActions.deleteAgentFailure({ error }));
            } else if (message.payload.operation === 'toggle') {
              this.store.dispatch(AgentActions.toggleAgentFailure({ error }));
            }
          }
          break;

        case 'agentValidationResult':
          if (message.payload?.agentId && message.payload?.result) {
            this.store.dispatch(AgentActions.validateAgentSuccess({
              agentId: message.payload.agentId,
              result: message.payload.result
            }));
          } else if (message.payload?.agentId && message.payload?.error) {
            this.store.dispatch(AgentActions.validateAgentFailure({
              agentId: message.payload.agentId,
              error: message.payload.error
            }));
          }
          break;
      }
    });
  }

  /**
   * Load all agents from VS Code extension
   */
  public loadAgents(): void {
    this.store.dispatch(AgentActions.loadAgents());
    this.messageService.sendMessage({
      type: 'getConfig',
      payload: { section: 'agents' }
    });
  }

  /**
   * Add a new agent
   */
  public async addAgent(agentData: AgentFormData): Promise<void> {
    // Validate form data
    const validation = await this.validateAgentFormData(agentData);
    if (!validation.valid) {
      this.store.dispatch(AgentActions.addAgentFailure({ 
        error: validation.error || 'Invalid agent data' 
      }));
      return;
    }

    // Create agent object
    const agent = this.createAgentFromFormData(agentData);
    
    this.store.dispatch(AgentActions.addAgent({ agentData }));
    
    this.messageService.sendMessage({
      type: 'updateConfig',
      payload: { 
        operation: 'addAgent',
        agent: agent
      }
    });
  }

  /**
   * Update an existing agent
   */
  public async updateAgent(agentId: string, updates: Partial<Agent>): Promise<void> {
    // If updating providerId, validate the new provider
    if (updates.providerId) {
      const provider = await firstValueFrom(this.providerManager.getProviderById(updates.providerId));
      if (!provider) {
        this.store.dispatch(AgentActions.updateAgentFailure({ 
          error: 'Selected provider not found' 
        }));
        return;
      }
      if (!provider.isActive) {
        this.store.dispatch(AgentActions.updateAgentFailure({ 
          error: 'Selected provider is not active' 
        }));
        return;
      }
    }

    this.store.dispatch(AgentActions.updateAgent({ agentId, updates }));
    
    this.messageService.sendMessage({
      type: 'updateConfig',
      payload: { 
        operation: 'updateAgent',
        agentId,
        updates
      }
    });
  }

  /**
   * Delete an agent
   */
  public async deleteAgent(agentId: string): Promise<void> {
    this.store.dispatch(AgentActions.deleteAgent({ agentId }));
    
    this.messageService.sendMessage({
      type: 'updateConfig',
      payload: { 
        operation: 'deleteAgent',
        agentId
      }
    });
  }

  /**
   * Toggle agent active/inactive status
   */
  public async toggleAgentStatus(agentId: string, isActive: boolean): Promise<void> {
    this.store.dispatch(AgentActions.toggleAgent({ agentId, isActive }));
    
    this.messageService.sendMessage({
      type: 'updateConfig',
      payload: { 
        operation: 'toggleAgent',
        agentId,
        isActive
      }
    });
  }

  /**
   * Get agent by ID
   */
  public getAgentById(agentId: string): Observable<Agent | undefined> {
    return this.store.select(selectAgentById(agentId)).pipe(
      map(agent => agent || undefined)
    );
  }

  /**
   * Get active agents
   */
  public getActiveAgents(): Observable<Agent[]> {
    return this.activeAgents$;
  }

  /**
   * Get agents by provider ID
   */
  public getAgentsByProvider(providerId: string): Observable<Agent[]> {
    return this.store.select(selectAgentsByProvider(providerId));
  }

  /**
   * Get agent with provider information
   */
  public getAgentWithProvider(agentId: string): Observable<AgentWithProvider | null> {
    return combineLatest([
      this.getAgentById(agentId),
      this.providerManager.providers$
    ]).pipe(
      map(([agent, providers]) => {
        if (!agent) return null;
        
        const provider = providers.find(p => p.id === agent.providerId);
        if (!provider) return null;
        
        return { agent, provider };
      })
    );
  }

  /**
   * Deactivate all agents that use a specific provider
   * This is called when a provider is deactivated
   */
  public async deactivateAgentsByProvider(providerId: string): Promise<void> {
    this.store.dispatch(AgentActions.deactivateAgentsByProvider({ providerId }));
    
    this.messageService.sendMessage({
      type: 'updateConfig',
      payload: { 
        operation: 'deactivateAgentsByProvider',
        providerId
      }
    });
  }

  /**
   * Delete all agents that use a specific provider
   * This is called when a provider is deleted
   */
  public async deleteAgentsByProvider(providerId: string): Promise<void> {
    this.store.dispatch(AgentActions.deleteAgentsByProvider({ providerId }));
    
    this.messageService.sendMessage({
      type: 'updateConfig',
      payload: { 
        operation: 'deleteAgentsByProvider',
        providerId
      }
    });
  }

  /**
   * Validate agent configuration
   */
  public async validateAgentConfig(agentId: string): Promise<void> {
    this.store.dispatch(AgentActions.validateAgent({ agentId }));
    
    this.messageService.sendMessage({
      type: 'validateAgent',
      payload: { agentId }
    });
  }

  /**
   * Load available models for a provider
   * This delegates to the provider manager service
   */
  public async loadModelsForProvider(providerId: string): Promise<void> {
    this.store.dispatch(AgentActions.loadModelsForProvider({ providerId }));
    await this.providerManager.fetchAvailableModels(providerId);
  }

  /**
   * Get available models for a provider
   */
  public getAvailableModels(providerId: string): Observable<string[]> {
    return this.store.select(selectAvailableModels).pipe(
      map(modelsMap => modelsMap[providerId] || [])
    );
  }

  /**
   * Get agent capabilities based on provider and model
   */
  public async getAgentCapabilities(providerId: string, model: string): Promise<AgentCapabilities> {
    const provider = await firstValueFrom(this.providerManager.getProviderById(providerId));
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    // Default capabilities
    const capabilities: AgentCapabilities = {
      hasVision: false,
      hasToolUse: false,
      reasoningDepth: 'basic',
      speed: 'medium',
      costTier: 'medium',
      supportsStreaming: true,
      supportsNonStreaming: true,
      preferredStreamingMode: 'streaming',
      maxContextLength: 4096,
      supportedFormats: ['text']
    };

    // Provider/model specific capabilities
    switch (provider.provider) {
      case 'openai':
        capabilities.hasToolUse = model.includes('gpt-4') || model.includes('gpt-3.5');
        capabilities.hasVision = model.includes('vision') || model.includes('gpt-4o');
        capabilities.reasoningDepth = model.includes('gpt-4') ? 'advanced' : 'intermediate';
        capabilities.speed = model.includes('gpt-3.5') ? 'fast' : 'medium';
        capabilities.costTier = model.includes('gpt-4') ? 'high' : 'medium';
        break;
        
      case 'anthropic':
        capabilities.hasToolUse = true;
        capabilities.hasVision = model.includes('claude-3');
        capabilities.reasoningDepth = 'advanced';
        capabilities.speed = 'medium';
        capabilities.costTier = 'high';
        break;
        
      case 'google':
        capabilities.hasToolUse = model.includes('gemini');
        capabilities.hasVision = model.includes('vision') || model.includes('gemini-pro');
        capabilities.reasoningDepth = model.includes('ultra') ? 'advanced' : 'intermediate';
        capabilities.speed = model.includes('flash') ? 'fast' : 'medium';
        capabilities.costTier = model.includes('ultra') ? 'high' : 'medium';
        break;
        
      case 'ollama':
        // Ollama models vary, but many support tools and vision
        capabilities.hasToolUse = true;
        capabilities.hasVision = model.includes('vision') || model.includes('llava');
        capabilities.reasoningDepth = model.includes('70b') || model.includes('large') ? 'advanced' : 'intermediate';
        capabilities.speed = model.includes('7b') || model.includes('small') ? 'fast' : 'slow';
        capabilities.costTier = 'low'; // Local models are essentially free
        break;
        
      default:
        // Custom providers - use defaults
        break;
    }

    return capabilities;
  }

  /**
   * Clear agent error state
   */
  public clearError(): void {
    this.store.dispatch(AgentActions.clearAgentError());
  }

  /**
   * Clear model error state
   */
  public clearModelError(): void {
    this.store.dispatch(AgentActions.clearModelError());
  }

  /**
   * Reset agent state
   */
  public resetState(): void {
    this.store.dispatch(AgentActions.resetAgentState());
  }

  /**
   * Validate agent form data
   */
  private async validateAgentFormData(data: AgentFormData): Promise<ValidationResult> {
    if (!data.name?.trim()) {
      return { valid: false, error: 'Agent name is required' };
    }

    if (!data.providerId) {
      return { valid: false, error: 'Provider selection is required' };
    }

    if (!data.model?.trim()) {
      return { valid: false, error: 'Model selection is required' };
    }

    // Validate provider exists and is active
    const provider = await firstValueFrom(this.providerManager.getProviderById(data.providerId));
    if (!provider) {
      return { valid: false, error: 'Selected provider not found' };
    }

    if (!provider.isActive) {
      return { valid: false, error: 'Selected provider is not active' };
    }

    // Validate temperature range
    if (data.temperature !== undefined && (data.temperature < 0 || data.temperature > 2)) {
      return { valid: false, error: 'Temperature must be between 0 and 2' };
    }

    // Validate max tokens
    if (data.maxTokens !== undefined && data.maxTokens <= 0) {
      return { valid: false, error: 'Max tokens must be greater than 0' };
    }

    // Validate timeout
    if (data.timeout !== undefined && data.timeout <= 0) {
      return { valid: false, error: 'Timeout must be greater than 0' };
    }

    return { valid: true };
  }

  /**
   * Create agent object from form data
   */
  private createAgentFromFormData(data: AgentFormData): Agent {
    return {
      id: this.generateAgentId(),
      name: data.name.trim(),
      providerId: data.providerId,
      model: data.model.trim(),
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      timeout: data.timeout,
      systemPrompt: data.systemPrompt?.trim(),
      capabilities: {
        hasVision: false,
        hasToolUse: false,
        reasoningDepth: 'basic',
        speed: 'medium',
        costTier: 'medium',
        supportsStreaming: true,
        supportsNonStreaming: true,
        preferredStreamingMode: 'streaming',
        maxContextLength: 4096,
        supportedFormats: ['text'],
        ...data.capabilities
      },
      userPreferences: {
        useStreaming: true,
        ...data.userPreferences
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Generate unique agent ID
   */
  private generateAgentId(): string {
    return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}