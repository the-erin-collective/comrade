import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, map, filter, take, firstValueFrom } from 'rxjs';
import { 
  ProviderConfig, 
  ProviderFormData, 
  ProviderValidationResult, 
  ValidationResult,
  ConnectionTestResult,
  CloudProvider,
  LocalNetworkProvider
} from '../interfaces/provider-agent.interface';
import { MessageService, ExtensionMessage } from './message.service';
import * as ProviderActions from '../state/provider/provider.actions';
import { 
  selectProviders, 
  selectActiveProviders, 
  selectProviderById,
  selectProvidersLoading,
  selectProvidersError,
  selectAvailableModels,
  selectValidationResults
} from '../state/provider/provider.selectors';

/**
 * Provider Manager Service
 * 
 * Handles CRUD operations for AI providers, validation, and model fetching.
 * Integrates with NgRx state management and VS Code extension messaging.
 */
@Injectable({
  providedIn: 'root'
})
export class ProviderManagerService {
  
  // Observable selectors for reactive UI updates
  public readonly providers$: Observable<ProviderConfig[]>;
  public readonly activeProviders$: Observable<ProviderConfig[]>;
  public readonly loading$: Observable<boolean>;
  public readonly error$: Observable<string | null>;
  public readonly validationResults$: Observable<Record<string, ProviderValidationResult>>;

  constructor(
    private store: Store,
    private messageService: MessageService
  ) {
    // Initialize observables after store is available
    this.providers$ = this.store.select(selectProviders);
    this.activeProviders$ = this.store.select(selectActiveProviders);
    this.loading$ = this.store.select(selectProvidersLoading);
    this.error$ = this.store.select(selectProvidersError);
    this.validationResults$ = this.store.select(selectValidationResults);
    
    this.setupMessageHandlers();
  }

  /**
   * Setup message handlers for VS Code extension communication
   */
  private setupMessageHandlers(): void {
    this.messageService.messages$.subscribe(message => {
      switch (message.type) {
        case 'configResult':
          if (message.payload?.providers) {
            this.store.dispatch(ProviderActions.loadProvidersSuccess({ 
              providers: message.payload.providers 
            }));
          }
          break;
        
        case 'configUpdateResult':
          if (message.payload?.success && message.payload?.provider) {
            if (message.payload.operation === 'add') {
              this.store.dispatch(ProviderActions.addProviderSuccess({ 
                provider: message.payload.provider 
              }));
            } else if (message.payload.operation === 'update') {
              this.store.dispatch(ProviderActions.updateProviderSuccess({ 
                provider: message.payload.provider 
              }));
            } else if (message.payload.operation === 'delete') {
              this.store.dispatch(ProviderActions.deleteProviderSuccess({ 
                providerId: message.payload.providerId 
              }));
            } else if (message.payload.operation === 'toggle') {
              this.store.dispatch(ProviderActions.toggleProviderSuccess({ 
                provider: message.payload.provider 
              }));
            }
          } else if (message.payload?.error) {
            const error = message.payload.error;
            if (message.payload.operation === 'add') {
              this.store.dispatch(ProviderActions.addProviderFailure({ error }));
            } else if (message.payload.operation === 'update') {
              this.store.dispatch(ProviderActions.updateProviderFailure({ error }));
            } else if (message.payload.operation === 'delete') {
              this.store.dispatch(ProviderActions.deleteProviderFailure({ error }));
            } else if (message.payload.operation === 'toggle') {
              this.store.dispatch(ProviderActions.toggleProviderFailure({ error }));
            }
          }
          break;

        case 'ollamaModelsResult':
        case 'cloudModelsResult':
          if (message.payload?.success && message.payload?.models && message.payload?.providerId) {
            this.store.dispatch(ProviderActions.loadModelsForProviderSuccess({
              providerId: message.payload.providerId,
              models: message.payload.models
            }));
          } else if (message.payload?.error && message.payload?.providerId) {
            this.store.dispatch(ProviderActions.loadModelsForProviderFailure({
              providerId: message.payload.providerId,
              error: message.payload.error
            }));
          }
          break;

        case 'providerValidationResult':
          if (message.payload?.providerId && message.payload?.result) {
            this.store.dispatch(ProviderActions.validateProviderSuccess({
              providerId: message.payload.providerId,
              result: message.payload.result
            }));
          } else if (message.payload?.providerId && message.payload?.error) {
            this.store.dispatch(ProviderActions.validateProviderFailure({
              providerId: message.payload.providerId,
              error: message.payload.error
            }));
          }
          break;
      }
    });
  }

  /**
   * Load all providers from VS Code extension
   */
  public loadProviders(): void {
    this.store.dispatch(ProviderActions.loadProviders());
    this.messageService.sendMessage({
      type: 'getConfig',
      payload: { section: 'providers' }
    });
  }

  /**
   * Add a new provider
   */
  public async addProvider(providerData: ProviderFormData): Promise<void> {
    // Validate form data
    const validation = this.validateProviderFormData(providerData);
    if (!validation.valid) {
      this.store.dispatch(ProviderActions.addProviderFailure({ 
        error: validation.error || 'Invalid provider data' 
      }));
      return;
    }

    // Create provider object
    const provider = this.createProviderFromFormData(providerData);
    
    this.store.dispatch(ProviderActions.addProvider({ providerData }));
    
    this.messageService.sendMessage({
      type: 'updateConfig',
      payload: { 
        operation: 'addProvider',
        provider: provider
      }
    });
  }

  /**
   * Update an existing provider
   */
  public async updateProvider(providerId: string, updates: Partial<ProviderConfig>): Promise<void> {
    this.store.dispatch(ProviderActions.updateProvider({ providerId, updates }));
    
    this.messageService.sendMessage({
      type: 'updateConfig',
      payload: { 
        operation: 'updateProvider',
        providerId,
        updates
      }
    });
  }

  /**
   * Delete a provider
   */
  public async deleteProvider(providerId: string): Promise<void> {
    this.store.dispatch(ProviderActions.deleteProvider({ providerId }));
    
    this.messageService.sendMessage({
      type: 'updateConfig',
      payload: { 
        operation: 'deleteProvider',
        providerId
      }
    });
  }

  /**
   * Toggle provider active/inactive status
   */
  public async toggleProviderStatus(providerId: string, isActive: boolean): Promise<void> {
    this.store.dispatch(ProviderActions.toggleProvider({ providerId, isActive }));
    
    this.messageService.sendMessage({
      type: 'updateConfig',
      payload: { 
        operation: 'toggleProvider',
        providerId,
        isActive
      }
    });
  }

  /**
   * Get provider by ID
   */
  public getProviderById(providerId: string): Observable<ProviderConfig | undefined> {
    return this.store.select(selectProviderById(providerId)).pipe(
      map(provider => provider || undefined)
    );
  }

  /**
   * Get active providers
   */
  public getActiveProviders(): Observable<ProviderConfig[]> {
    return this.activeProviders$;
  }

  /**
   * Validate provider configuration
   */
  public async validateProviderConfig(providerId: string): Promise<void> {
    this.store.dispatch(ProviderActions.validateProvider({ providerId }));
    
    this.messageService.sendMessage({
      type: 'validateProvider',
      payload: { providerId }
    });
  }

  /**
   * Test provider connection
   */
  public async testProviderConnection(provider: ProviderConfig): Promise<ConnectionTestResult> {
    return new Promise((resolve) => {
      // Set up a one-time message listener for the test result
      const subscription = this.messageService.messages$.pipe(
        filter(message => message.type === 'connectionTestResult' && 
                          message.payload?.providerId === provider.id),
        take(1)
      ).subscribe(message => {
        resolve(message.payload.result);
      });

      // Send test request
      this.messageService.sendMessage({
        type: 'testProviderConnection',
        payload: { provider }
      });

      // Cleanup subscription after timeout
      setTimeout(() => {
        subscription.unsubscribe();
        resolve({
          success: false,
          error: 'Connection test timeout'
        });
      }, 30000); // 30 second timeout
    });
  }

  /**
   * Fetch available models for a provider
   */
  public async fetchAvailableModels(providerId: string): Promise<void> {
    const provider = await firstValueFrom(this.getProviderById(providerId));
    if (!provider) {
      this.store.dispatch(ProviderActions.loadModelsForProviderFailure({
        providerId,
        error: 'Provider not found'
      }));
      return;
    }

    this.store.dispatch(ProviderActions.loadModelsForProvider({ providerId }));

    if (provider.type === 'local-network' && provider.localHostType === 'ollama') {
      this.messageService.sendMessage({
        type: 'fetchOllamaModels',
        payload: { 
          networkAddress: provider.endpoint,
          providerId: providerId
        }
      });
    } else if (provider.type === 'cloud') {
      this.messageService.sendMessage({
        type: 'fetchCloudModels',
        payload: { 
          provider: provider.provider,
          apiKey: provider.apiKey,
          providerId: providerId
        }
      });
    }
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
   * Clear provider error state
   */
  public clearError(): void {
    this.store.dispatch(ProviderActions.clearProviderError());
  }

  /**
   * Clear model error state
   */
  public clearModelError(): void {
    this.store.dispatch(ProviderActions.clearModelError());
  }

  /**
   * Reset provider state
   */
  public resetState(): void {
    this.store.dispatch(ProviderActions.resetProviderState());
  }

  /**
   * Validate provider form data
   */
  private validateProviderFormData(data: ProviderFormData): ValidationResult {
    if (!data.name?.trim()) {
      return { valid: false, error: 'Provider name is required' };
    }

    if (!data.type) {
      return { valid: false, error: 'Provider type is required' };
    }

    if (!data.provider) {
      return { valid: false, error: 'Provider selection is required' };
    }

    if (data.type === 'cloud') {
      if (!data.apiKey?.trim()) {
        return { valid: false, error: 'API key is required for cloud providers' };
      }
    }

    if (data.type === 'local-network') {
      if (!data.endpoint?.trim()) {
        return { valid: false, error: 'Endpoint is required for local network providers' };
      }

      // Validate endpoint format
      try {
        new URL(data.endpoint);
      } catch {
        return { valid: false, error: 'Invalid endpoint URL format' };
      }

      if (!data.localHostType) {
        return { valid: false, error: 'Local host type is required for local network providers' };
      }
    }

    return { valid: true };
  }

  /**
   * Create provider object from form data
   */
  private createProviderFromFormData(data: ProviderFormData): ProviderConfig {
    const baseProvider = {
      id: this.generateProviderId(),
      name: data.name.trim(),
      provider: data.provider,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (data.type === 'cloud') {
      return {
        ...baseProvider,
        type: 'cloud',
        apiKey: data.apiKey!.trim()
      } as CloudProvider;
    } else {
      return {
        ...baseProvider,
        type: 'local-network',
        endpoint: data.endpoint!.trim(),
        localHostType: data.localHostType as 'ollama' | 'custom',
        ...(data.apiKey?.trim() && { apiKey: data.apiKey.trim() })
      } as LocalNetworkProvider;
    }
  }

  /**
   * Generate unique provider ID
   */
  private generateProviderId(): string {
    return `provider-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}