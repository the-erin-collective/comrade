import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ProviderState } from './provider.state';
import { ProviderConfig } from '../../interfaces/provider-agent.interface';

/**
 * Feature selector for provider state
 */
export const selectProviderState = createFeatureSelector<ProviderState>('provider');

/**
 * Basic provider selectors
 */
export const selectProviders = createSelector(
  selectProviderState,
  (state: ProviderState) => state.providers
);

export const selectProvidersLoading = createSelector(
  selectProviderState,
  (state: ProviderState) => state.loading
);

export const selectProvidersError = createSelector(
  selectProviderState,
  (state: ProviderState) => state.error
);

export const selectSelectedProvider = createSelector(
  selectProviderState,
  (state: ProviderState) => state.selectedProvider
);

/**
 * Active providers selector
 * Returns only providers that are currently active
 */
export const selectActiveProviders = createSelector(
  selectProviders,
  (providers: ProviderConfig[]) => providers.filter(provider => provider.isActive)
);

/**
 * Inactive providers selector
 * Returns only providers that are currently inactive
 */
export const selectInactiveProviders = createSelector(
  selectProviders,
  (providers: ProviderConfig[]) => providers.filter(provider => !provider.isActive)
);

/**
 * Provider by ID selector factory
 * Returns a selector that finds a provider by its ID
 */
export const selectProviderById = (providerId: string) => createSelector(
  selectProviders,
  (providers: ProviderConfig[]) => providers.find(provider => provider.id === providerId) || null
);

/**
 * Providers by type selectors
 */
export const selectCloudProviders = createSelector(
  selectProviders,
  (providers: ProviderConfig[]) => providers.filter(provider => provider.type === 'cloud')
);

export const selectLocalNetworkProviders = createSelector(
  selectProviders,
  (providers: ProviderConfig[]) => providers.filter(provider => provider.type === 'local-network')
);

/**
 * Providers by provider type selectors
 */
export const selectProvidersByProviderType = (providerType: string) => createSelector(
  selectProviders,
  (providers: ProviderConfig[]) => providers.filter(provider => provider.provider === providerType)
);

/**
 * Provider validation selectors
 */
export const selectValidationResults = createSelector(
  selectProviderState,
  (state: ProviderState) => state.validationResults
);

export const selectProviderValidationResult = (providerId: string) => createSelector(
  selectValidationResults,
  (validationResults) => validationResults[providerId] || null
);

export const selectValidatedProviders = createSelector(
  selectProviders,
  selectValidationResults,
  (providers: ProviderConfig[], validationResults) => 
    providers.map(provider => ({
      ...provider,
      validationResult: validationResults[provider.id] || null
    }))
);

/**
 * Model-related selectors
 */
export const selectAvailableModels = createSelector(
  selectProviderState,
  (state: ProviderState) => state.availableModels
);

export const selectModelsLoading = createSelector(
  selectProviderState,
  (state: ProviderState) => state.loadingModels
);

export const selectModelError = createSelector(
  selectProviderState,
  (state: ProviderState) => state.modelError
);

export const selectModelsForProvider = (providerId: string) => createSelector(
  selectAvailableModels,
  (availableModels) => availableModels[providerId] || []
);

/**
 * Combined selectors for UI components
 */
export const selectProvidersWithModels = createSelector(
  selectProviders,
  selectAvailableModels,
  (providers: ProviderConfig[], availableModels) => 
    providers.map(provider => ({
      ...provider,
      availableModels: availableModels[provider.id] || []
    }))
);

export const selectActiveProvidersWithModels = createSelector(
  selectActiveProviders,
  selectAvailableModels,
  (providers: ProviderConfig[], availableModels) => 
    providers.map(provider => ({
      ...provider,
      availableModels: availableModels[provider.id] || []
    }))
);

/**
 * Statistics selectors
 */
export const selectProviderStats = createSelector(
  selectProviders,
  (providers: ProviderConfig[]) => {
    const totalProviders = providers.length;
    const activeProviders = providers.filter(p => p.isActive).length;
    
    const providersByType = providers.reduce((acc, provider) => {
      acc[provider.type] = (acc[provider.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const providersByProvider = providers.reduce((acc, provider) => {
      acc[provider.provider] = (acc[provider.provider] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalProviders,
      activeProviders,
      providersByType: {
        cloud: providersByType['cloud'] || 0,
        'local-network': providersByType['local-network'] || 0
      },
      providersByProvider
    };
  }
);

/**
 * UI state selectors
 */
export const selectHasProviders = createSelector(
  selectProviders,
  (providers: ProviderConfig[]) => providers.length > 0
);

export const selectHasActiveProviders = createSelector(
  selectActiveProviders,
  (activeProviders: ProviderConfig[]) => activeProviders.length > 0
);

export const selectIsProviderFormValid = createSelector(
  selectProvidersError,
  selectProvidersLoading,
  (error: string | null, loading: boolean) => !error && !loading
);

/**
 * Memoized selectors for performance
 * These selectors are automatically memoized by NgRx, but we can create
 * additional memoized selectors for complex computations
 */
export const selectProviderOptions = createSelector(
  selectActiveProviders,
  (providers: ProviderConfig[]) => 
    providers.map(provider => ({
      value: provider.id,
      label: provider.name,
      type: provider.type,
      provider: provider.provider
    }))
);

export const selectProviderSummary = createSelector(
  selectProviders,
  selectValidationResults,
  selectAvailableModels,
  (providers: ProviderConfig[], validationResults, availableModels) => 
    providers.map(provider => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      provider: provider.provider,
      isActive: provider.isActive,
      isValid: validationResults[provider.id]?.valid || false,
      modelCount: (availableModels[provider.id] || []).length,
      lastUpdated: provider.updatedAt
    }))
);