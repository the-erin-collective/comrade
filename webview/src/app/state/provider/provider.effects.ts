import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { map, catchError, switchMap, tap, filter } from 'rxjs/operators';
import { MessageService } from '../../services/message.service';
import { ProviderConfig, ProviderFormData, ProviderValidationResult } from '../../interfaces/provider-agent.interface';
import * as ProviderActions from './provider.actions';

@Injectable()
export class ProviderEffects {
  constructor(
    private actions$: Actions,
    private messageService: MessageService
  ) {}

  /**
   * Load providers effect
   * Fetches all configured providers from the VS Code extension
   */
  loadProviders$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProviderActions.loadProviders),
      switchMap(() => {
        // Send message to extension to get providers
        this.messageService.sendMessage({
          type: 'getConfig',
          payload: { configType: 'providers' }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configResult' && message.payload.configType === 'providers'),
          map(message => ProviderActions.loadProvidersSuccess({ 
            providers: message.payload.providers || [] 
          })),
          catchError(error => of(ProviderActions.loadProvidersFailure({ 
            error: error.message || 'Failed to load providers' 
          })))
        );
      })
    )
  );

  /**
   * Add provider effect
   * Creates a new provider configuration
   */
  addProvider$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProviderActions.addProvider),
      switchMap(({ providerData }) => {
        // Generate a unique ID for the provider
        const baseProvider = this.createProviderFromFormData(providerData);
        const provider: ProviderConfig = {
          ...baseProvider,
          id: `provider-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date(),
          updatedAt: new Date()
        } as ProviderConfig;

        // Send message to extension to save the provider
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'providers',
            operation: 'add',
            data: provider
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult'),
          map(message => {
            if (message.payload.success) {
              return ProviderActions.addProviderSuccess({ provider });
            } else {
              return ProviderActions.addProviderFailure({ 
                error: message.payload.error || 'Failed to add provider' 
              });
            }
          }),
          catchError(error => of(ProviderActions.addProviderFailure({ 
            error: error.message || 'Failed to add provider' 
          })))
        );
      })
    )
  );

  /**
   * Update provider effect
   * Updates an existing provider configuration
   */
  updateProvider$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProviderActions.updateProvider),
      switchMap(({ providerId, updates }) => {
        const updatedProvider = {
          ...updates,
          id: providerId,
          updatedAt: new Date()
        };

        // Send message to extension to update the provider
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'providers',
            operation: 'update',
            providerId,
            data: updatedProvider
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult'),
          map(message => {
            if (message.payload.success) {
              return ProviderActions.updateProviderSuccess({ 
                provider: message.payload.provider || updatedProvider as ProviderConfig
              });
            } else {
              return ProviderActions.updateProviderFailure({ 
                error: message.payload.error || 'Failed to update provider' 
              });
            }
          }),
          catchError(error => of(ProviderActions.updateProviderFailure({ 
            error: error.message || 'Failed to update provider' 
          })))
        );
      })
    )
  );

  /**
   * Delete provider effect
   * Removes a provider configuration
   */
  deleteProvider$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProviderActions.deleteProvider),
      switchMap(({ providerId }) => {
        // Send message to extension to delete the provider
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'providers',
            operation: 'delete',
            providerId
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult'),
          map(message => {
            if (message.payload.success) {
              return ProviderActions.deleteProviderSuccess({ providerId });
            } else {
              return ProviderActions.deleteProviderFailure({ 
                error: message.payload.error || 'Failed to delete provider' 
              });
            }
          }),
          catchError(error => of(ProviderActions.deleteProviderFailure({ 
            error: error.message || 'Failed to delete provider' 
          })))
        );
      })
    )
  );

  /**
   * Toggle provider effect
   * Toggles a provider's active status
   */
  toggleProvider$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProviderActions.toggleProvider),
      switchMap(({ providerId, isActive }) => {
        // Send message to extension to toggle the provider
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'providers',
            operation: 'toggle',
            providerId,
            isActive
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult'),
          map(message => {
            if (message.payload.success) {
              return ProviderActions.toggleProviderSuccess({ 
                provider: message.payload.provider
              });
            } else {
              return ProviderActions.toggleProviderFailure({ 
                error: message.payload.error || 'Failed to toggle provider' 
              });
            }
          }),
          catchError(error => of(ProviderActions.toggleProviderFailure({ 
            error: error.message || 'Failed to toggle provider' 
          })))
        );
      })
    )
  );

  /**
   * Validate provider effect
   * Tests provider connection and configuration
   */
  validateProvider$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProviderActions.validateProvider),
      switchMap(({ providerId }) => {
        // Send message to extension to validate the provider
        this.messageService.sendMessage({
          type: 'updateConfig',
          payload: { 
            configType: 'providers',
            operation: 'validate',
            providerId
          }
        });

        // Listen for the response
        return this.messageService.messages$.pipe(
          filter(message => message.type === 'configUpdateResult' && message.payload.operation === 'validate'),
          map(message => {
            if (message.payload.success) {
              const result: ProviderValidationResult = {
                valid: true,
                availableModels: message.payload.availableModels || [],
                connectionStatus: 'connected',
                responseTime: message.payload.responseTime
              };
              return ProviderActions.validateProviderSuccess({ providerId, result });
            } else {
              return ProviderActions.validateProviderFailure({ 
                providerId,
                error: message.payload.error || 'Provider validation failed' 
              });
            }
          }),
          catchError(error => of(ProviderActions.validateProviderFailure({ 
            providerId,
            error: error.message || 'Provider validation failed' 
          })))
        );
      })
    )
  );

  /**
   * Load models for provider effect
   * Fetches available models from a specific provider
   */
  loadModelsForProvider$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ProviderActions.loadModelsForProvider),
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
              return ProviderActions.loadModelsForProviderSuccess({ 
                providerId, 
                models: message.payload.models || [] 
              });
            } else {
              return ProviderActions.loadModelsForProviderFailure({ 
                providerId,
                error: message.payload.error || 'Failed to fetch models' 
              });
            }
          }),
          catchError(error => of(ProviderActions.loadModelsForProviderFailure({ 
            providerId,
            error: error.message || 'Failed to fetch models' 
          })))
        );
      })
    )
  );

  /**
   * Helper method to create provider from form data
   */
  private createProviderFromFormData(formData: ProviderFormData): any {
    if (formData.type === 'cloud') {
      return {
        name: formData.name,
        type: 'cloud' as const,
        provider: formData.provider,
        apiKey: formData.apiKey || '',
        isActive: true
      };
    } else {
      return {
        name: formData.name,
        type: 'local-network' as const,
        provider: formData.provider,
        endpoint: formData.endpoint || '',
        localHostType: formData.localHostType || 'ollama',
        apiKey: formData.apiKey,
        isActive: true
      };
    }
  }
}