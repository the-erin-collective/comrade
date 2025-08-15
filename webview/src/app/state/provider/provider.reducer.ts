import { createReducer, on } from '@ngrx/store';
import { ProviderState, initialProviderState } from './provider.state';
import * as ProviderActions from './provider.actions';

/**
 * Provider reducer
 * Handles all provider-related state updates with immutable operations
 */
export const providerReducer = createReducer(
  initialProviderState,

  // Load providers
  on(ProviderActions.loadProviders, (state): ProviderState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(ProviderActions.loadProvidersSuccess, (state, { providers }): ProviderState => ({
    ...state,
    providers,
    loading: false,
    error: null
  })),

  on(ProviderActions.loadProvidersFailure, (state, { error }): ProviderState => ({
    ...state,
    loading: false,
    error
  })),

  // Add provider
  on(ProviderActions.addProvider, (state): ProviderState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(ProviderActions.addProviderSuccess, (state, { provider }): ProviderState => ({
    ...state,
    providers: [...state.providers, provider],
    loading: false,
    error: null
  })),

  on(ProviderActions.addProviderFailure, (state, { error }): ProviderState => ({
    ...state,
    loading: false,
    error
  })),

  // Update provider
  on(ProviderActions.updateProvider, (state): ProviderState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(ProviderActions.updateProviderSuccess, (state, { provider }): ProviderState => ({
    ...state,
    providers: state.providers.map(p => p.id === provider.id ? provider : p),
    selectedProvider: state.selectedProvider?.id === provider.id ? provider : state.selectedProvider,
    loading: false,
    error: null
  })),

  on(ProviderActions.updateProviderFailure, (state, { error }): ProviderState => ({
    ...state,
    loading: false,
    error
  })),

  // Delete provider
  on(ProviderActions.deleteProvider, (state): ProviderState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(ProviderActions.deleteProviderSuccess, (state, { providerId }): ProviderState => ({
    ...state,
    providers: state.providers.filter(p => p.id !== providerId),
    selectedProvider: state.selectedProvider?.id === providerId ? null : state.selectedProvider,
    validationResults: Object.fromEntries(
      Object.entries(state.validationResults).filter(([id]) => id !== providerId)
    ),
    availableModels: Object.fromEntries(
      Object.entries(state.availableModels).filter(([id]) => id !== providerId)
    ),
    loading: false,
    error: null
  })),

  on(ProviderActions.deleteProviderFailure, (state, { error }): ProviderState => ({
    ...state,
    loading: false,
    error
  })),

  // Toggle provider
  on(ProviderActions.toggleProvider, (state): ProviderState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(ProviderActions.toggleProviderSuccess, (state, { provider }): ProviderState => ({
    ...state,
    providers: state.providers.map(p => p.id === provider.id ? provider : p),
    selectedProvider: state.selectedProvider?.id === provider.id ? provider : state.selectedProvider,
    loading: false,
    error: null
  })),

  on(ProviderActions.toggleProviderFailure, (state, { error }): ProviderState => ({
    ...state,
    loading: false,
    error
  })),

  // Provider selection
  on(ProviderActions.selectProvider, (state, { provider }): ProviderState => ({
    ...state,
    selectedProvider: provider
  })),

  // Provider validation
  on(ProviderActions.validateProvider, (state): ProviderState => ({
    ...state,
    loading: true,
    error: null
  })),

  on(ProviderActions.validateProviderSuccess, (state, { providerId, result }): ProviderState => ({
    ...state,
    validationResults: {
      ...state.validationResults,
      [providerId]: result
    },
    loading: false,
    error: null
  })),

  on(ProviderActions.validateProviderFailure, (state, { providerId, error }): ProviderState => ({
    ...state,
    validationResults: {
      ...state.validationResults,
      [providerId]: {
        valid: false,
        error,
        connectionStatus: 'disconnected'
      }
    },
    loading: false,
    error
  })),

  // Model loading
  on(ProviderActions.loadModelsForProvider, (state): ProviderState => ({
    ...state,
    loadingModels: true,
    modelError: null
  })),

  on(ProviderActions.loadModelsForProviderSuccess, (state, { providerId, models }): ProviderState => ({
    ...state,
    availableModels: {
      ...state.availableModels,
      [providerId]: models
    },
    loadingModels: false,
    modelError: null
  })),

  on(ProviderActions.loadModelsForProviderFailure, (state, { providerId, error }): ProviderState => ({
    ...state,
    availableModels: {
      ...state.availableModels,
      [providerId]: []
    },
    loadingModels: false,
    modelError: error
  })),

  // Clear actions
  on(ProviderActions.clearProviderError, (state): ProviderState => ({
    ...state,
    error: null
  })),

  on(ProviderActions.clearModelError, (state): ProviderState => ({
    ...state,
    modelError: null
  })),

  on(ProviderActions.clearValidationResults, (state): ProviderState => ({
    ...state,
    validationResults: {}
  })),

  // Reset state
  on(ProviderActions.resetProviderState, (): ProviderState => initialProviderState)
);