import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, map, filter, take, firstValueFrom, catchError, of } from 'rxjs';
import { 
  ProviderConfig, 
  ProviderFormData, 
  ProviderValidationResult, 
  ValidationResult,
  ConnectionTestResult,
  CloudProvider,
  LocalNetworkProvider
} from '../interfaces/provider-agent.interface';
import { MessageService } from './message.service';
import { ErrorHandlerService } from './error-handler.service';
import { FormValidationService } from './form-validation.service';
import { ProviderValidation, NetworkValidation } from '../utils/validation.utils';
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
    private messageService: MessageService,
    private errorHandler: ErrorHandlerService,
    private formValidation: FormValidationService
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
    try {
      // Get existing providers for validation
      const existingProviders = await firstValueFrom(this.providers$);
      
      // Comprehensive validation
      const validation = this.formValidation.validateProviderForm(
        providerData, 
        existingProviders
      );
      
      if (!validation.valid) {
        const errorId = this.errorHandler.handleValidationError(
          [validation.error!], 
          validation.warnings,
          'Add Provider'
        );
        this.store.dispatch(ProviderActions.addProviderFailure({ 
          error: validation.error || 'Invalid provider data' 
        }));
        return;
      }

      // Show warnings if any
      if (validation.warnings && validation.warnings.length > 0) {
        validation.warnings.forEach(warning => {
          this.errorHandler.addWarning(warning, 'Add Provider');
        });
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

    } catch (error) {
      this.errorHandler.handleProviderError(error, 'add');
      this.store.dispatch(ProviderActions.addProviderFailure({ 
        error: 'Failed to add provider due to an unexpected error' 
      }));
    }
  }

  /**
   * Update an existing provider
   */
  public async updateProvider(providerId: string, updates: Partial<ProviderConfig>): Promise<void> {
    try {
      // Get current provider
      const currentProvider = await firstValueFrom(this.getProviderById(providerId));
      if (!currentProvider) {
        const errorId = this.errorHandler.handleProviderError(
          'Provider not found', 
          'update', 
          providerId
        );
        this.store.dispatch(ProviderActions.updateProviderFailure({ 
          error: 'Provider not found' 
        }));
        return;
      }

      // If updating critical fields, validate the entire configuration
      if (updates.name || updates.apiKey || (updates as any).endpoint) {
        const existingProviders = await firstValueFrom(this.providers$);
        const updatedData = { ...currentProvider, ...updates };
        
        // Convert to form data format for validation
        const formData: ProviderFormData = {
          name: updatedData.name,
          type: updatedData.type,
          provider: updatedData.provider,
          apiKey: 'apiKey' in updatedData ? updatedData.apiKey : undefined,
          endpoint: updatedData.type === 'local-network' ? updatedData.endpoint : undefined,
          localHostType: updatedData.type === 'local-network' ? updatedData.localHostType : undefined
        };

        const validation = this.formValidation.validateProviderForm(
          formData, 
          existingProviders, 
          providerId
        );
        
        if (!validation.valid) {
          const errorId = this.errorHandler.handleValidationError(
            [validation.error!], 
            validation.warnings,
            'Update Provider'
          );
          this.store.dispatch(ProviderActions.updateProviderFailure({ 
            error: validation.error || 'Invalid provider data' 
          }));
          return;
        }

        // Show warnings if any
        if (validation.warnings && validation.warnings.length > 0) {
          validation.warnings.forEach(warning => {
            this.errorHandler.addWarning(warning, 'Update Provider');
          });
        }
      }

      this.store.dispatch(ProviderActions.updateProvider({ providerId, updates }));
      
      this.messageService.sendMessage({
        type: 'updateConfig',
        payload: { 
          operation: 'updateProvider',
          providerId,
          updates
        }
      });

    } catch (error) {
      this.errorHandler.handleProviderError(error, 'update', providerId);
      this.store.dispatch(ProviderActions.updateProviderFailure({ 
        error: 'Failed to update provider due to an unexpected error' 
      }));
    }
  }

  /**
   * Delete a provider
   */
  public async deleteProvider(providerId: string): Promise<void> {
    try {
      // Get current provider for context
      const provider = await firstValueFrom(this.getProviderById(providerId));
      const providerName = provider?.name || providerId;

      this.store.dispatch(ProviderActions.deleteProvider({ providerId }));
      
      this.messageService.sendMessage({
        type: 'updateConfig',
        payload: { 
          operation: 'deleteProvider',
          providerId
        }
      });

    } catch (error) {
      this.errorHandler.handleProviderError(error, 'delete', providerId);
      this.store.dispatch(ProviderActions.deleteProviderFailure({ 
        error: 'Failed to delete provider due to an unexpected error' 
      }));
    }
  }

  /**
   * Toggle provider active/inactive status
   */
  public async toggleProviderStatus(providerId: string, isActive: boolean): Promise<void> {
    try {
      // Get current provider for context
      const provider = await firstValueFrom(this.getProviderById(providerId));
      const providerName = provider?.name || providerId;

      // Warn about deactivating providers with dependent agents
      if (!isActive && provider) {
        this.errorHandler.addWarning(
          `Deactivating provider "${providerName}" will also deactivate all dependent agents`,
          'Toggle Provider'
        );
      }

      this.store.dispatch(ProviderActions.toggleProvider({ providerId, isActive }));
      
      this.messageService.sendMessage({
        type: 'updateConfig',
        payload: { 
          operation: 'toggleProvider',
          providerId,
          isActive
        }
      });

    } catch (error) {
      this.errorHandler.handleProviderError(error, 'toggle', providerId);
      this.store.dispatch(ProviderActions.toggleProviderFailure({ 
        error: 'Failed to toggle provider due to an unexpected error' 
      }));
    }
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
    try {
      return new Promise((resolve, reject) => {
        const timeout = 30000; // 30 second timeout
        
        // Set up a one-time message listener for the test result
        const subscription = this.messageService.messages$.pipe(
          filter(message => message.type === 'connectionTestResult' && 
                            message.payload?.providerId === provider.id),
          take(1),
          catchError(error => {
            this.errorHandler.handleConnectionError(
              error, 
              provider.type === 'local-network' ? provider.endpoint : undefined,
              'connection test'
            );
            return of({ payload: { result: { success: false, error: error.message } } });
          })
        ).subscribe(message => {
          const result = message.payload.result;
          
          // Log connection test results
          if (result.success) {
            this.errorHandler.addInfo(
              `Connection test successful for provider "${provider.name}"`,
              'Connection Test',
              result.responseTime ? `Response time: ${result.responseTime}ms` : undefined
            );
          } else {
            this.errorHandler.handleConnectionError(
              result.error || 'Connection test failed',
              provider.type === 'local-network' ? provider.endpoint : undefined,
              'connection test'
            );
          }
          
          resolve(result);
        });

        // Send test request
        this.messageService.sendMessage({
          type: 'testProviderConnection',
          payload: { provider }
        });

        // Cleanup subscription after timeout
        setTimeout(() => {
          subscription.unsubscribe();
          const timeoutResult = {
            success: false,
            error: 'Connection test timeout - the server may be unreachable or overloaded'
          };
          
          this.errorHandler.handleConnectionError(
            timeoutResult.error,
            provider.type === 'local-network' ? provider.endpoint : undefined,
            'connection test'
          );
          
          resolve(timeoutResult);
        }, timeout);
      });

    } catch (error) {
      this.errorHandler.handleConnectionError(
        error,
        provider.type === 'local-network' ? provider.endpoint : undefined,
        'connection test'
      );
      
      return {
        success: false,
        error: 'Failed to initiate connection test'
      };
    }
  }

  /**
   * Fetch available models for a provider
   */
  public async fetchAvailableModels(providerId: string): Promise<void> {
    try {
      const provider = await firstValueFrom(this.getProviderById(providerId));
      if (!provider) {
        const errorId = this.errorHandler.handleProviderError(
          'Provider not found',
          'fetch models',
          providerId
        );
        this.store.dispatch(ProviderActions.loadModelsForProviderFailure({
          providerId,
          error: 'Provider not found'
        }));
        return;
      }

      if (!provider.isActive) {
        const errorId = this.errorHandler.handleProviderError(
          'Cannot fetch models from inactive provider',
          'fetch models',
          provider.name
        );
        this.store.dispatch(ProviderActions.loadModelsForProviderFailure({
          providerId,
          error: 'Provider is not active'
        }));
        return;
      }

      this.store.dispatch(ProviderActions.loadModelsForProvider({ providerId }));

      if (provider.type === 'local-network' && provider.localHostType === 'ollama') {
        // Validate endpoint before making request
        const endpointValidation = ProviderValidation.validateEndpoint(provider.endpoint);
        if (!endpointValidation.valid) {
          const errorId = this.errorHandler.handleProviderError(
            `Invalid endpoint: ${endpointValidation.error}`,
            'fetch models',
            provider.name
          );
          this.store.dispatch(ProviderActions.loadModelsForProviderFailure({
            providerId,
            error: endpointValidation.error!
          }));
          return;
        }

        this.messageService.sendMessage({
          type: 'fetchOllamaModels',
          payload: { 
            networkAddress: provider.endpoint,
            providerId: providerId
          }
        });
      } else if (provider.type === 'cloud') {
        // Validate API key before making request
        const apiKeyValidation = ProviderValidation.validateApiKey(provider.provider, provider.apiKey);
        if (!apiKeyValidation.valid) {
          const errorId = this.errorHandler.handleProviderError(
            `Invalid API key: ${apiKeyValidation.error}`,
            'fetch models',
            provider.name
          );
          this.store.dispatch(ProviderActions.loadModelsForProviderFailure({
            providerId,
            error: apiKeyValidation.error!
          }));
          return;
        }

        this.messageService.sendMessage({
          type: 'fetchCloudModels',
          payload: { 
            provider: provider.provider,
            apiKey: provider.apiKey,
            providerId: providerId
          }
        });
      } else {
        const errorId = this.errorHandler.handleProviderError(
          'Unsupported provider type for model fetching',
          'fetch models',
          provider.name
        );
        this.store.dispatch(ProviderActions.loadModelsForProviderFailure({
          providerId,
          error: 'Unsupported provider type'
        }));
      }

    } catch (error) {
      this.errorHandler.handleProviderError(error, 'fetch models', providerId);
      this.store.dispatch(ProviderActions.loadModelsForProviderFailure({
        providerId,
        error: 'Failed to fetch models due to an unexpected error'
      }));
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
   * Enhanced error handling for message responses
   */
  private handleMessageError(message: any, operation: string, context?: string): void {
    if (message.payload?.error) {
      this.errorHandler.handleProviderError(
        message.payload.error,
        operation,
        context
      );
    }
  }

  /**
   * Enhanced success handling for message responses
   */
  private handleMessageSuccess(message: any, operation: string, context?: string): void {
    if (message.payload?.success) {
      this.errorHandler.addInfo(
        `${operation} completed successfully${context ? ` for ${context}` : ''}`,
        `Provider ${operation}`
      );
    }
  }

  /**
   * Create provider object from form data
   */
  private createProviderFromFormData(data: ProviderFormData): ProviderConfig {
    // Auto-generate name if not provided
    const name = data.name?.trim() || this.generateProviderName(data.provider, data.type);
    
    const baseProvider = {
      id: this.generateProviderId(),
      name,
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

  /**
   * Generate a provider name based on provider type and provider
   */
  private generateProviderName(provider: string, type: 'cloud' | 'local-network'): string {
    const providerLabels: Record<string, string> = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'google': 'Google',
      'azure': 'Azure OpenAI',
      'ollama': 'Ollama',
      'custom': 'Custom'
    };
    
    const baseLabel = providerLabels[provider] || provider;
    const typeLabel = type === 'cloud' ? 'Cloud' : 'Local';
    
    return `${baseLabel} (${typeLabel})`;
  }
}