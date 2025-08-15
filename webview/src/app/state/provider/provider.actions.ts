import { createAction, props } from '@ngrx/store';
import { ProviderConfig, ProviderFormData, ProviderValidationResult } from '../../interfaces/provider-agent.interface';

/**
 * Provider loading actions
 */
export const loadProviders = createAction('[Provider] Load Providers');

export const loadProvidersSuccess = createAction(
  '[Provider] Load Providers Success',
  props<{ providers: ProviderConfig[] }>()
);

export const loadProvidersFailure = createAction(
  '[Provider] Load Providers Failure',
  props<{ error: string }>()
);

/**
 * Provider CRUD actions
 */
export const addProvider = createAction(
  '[Provider] Add Provider',
  props<{ providerData: ProviderFormData }>()
);

export const addProviderSuccess = createAction(
  '[Provider] Add Provider Success',
  props<{ provider: ProviderConfig }>()
);

export const addProviderFailure = createAction(
  '[Provider] Add Provider Failure',
  props<{ error: string }>()
);

export const updateProvider = createAction(
  '[Provider] Update Provider',
  props<{ providerId: string; updates: Partial<ProviderConfig> }>()
);

export const updateProviderSuccess = createAction(
  '[Provider] Update Provider Success',
  props<{ provider: ProviderConfig }>()
);

export const updateProviderFailure = createAction(
  '[Provider] Update Provider Failure',
  props<{ error: string }>()
);

export const deleteProvider = createAction(
  '[Provider] Delete Provider',
  props<{ providerId: string }>()
);

export const deleteProviderSuccess = createAction(
  '[Provider] Delete Provider Success',
  props<{ providerId: string }>()
);

export const deleteProviderFailure = createAction(
  '[Provider] Delete Provider Failure',
  props<{ error: string }>()
);

export const toggleProvider = createAction(
  '[Provider] Toggle Provider',
  props<{ providerId: string; isActive: boolean }>()
);

export const toggleProviderSuccess = createAction(
  '[Provider] Toggle Provider Success',
  props<{ provider: ProviderConfig }>()
);

export const toggleProviderFailure = createAction(
  '[Provider] Toggle Provider Failure',
  props<{ error: string }>()
);

/**
 * Provider selection actions
 */
export const selectProvider = createAction(
  '[Provider] Select Provider',
  props<{ provider: ProviderConfig | null }>()
);

/**
 * Provider validation actions
 */
export const validateProvider = createAction(
  '[Provider] Validate Provider',
  props<{ providerId: string }>()
);

export const validateProviderSuccess = createAction(
  '[Provider] Validate Provider Success',
  props<{ providerId: string; result: ProviderValidationResult }>()
);

export const validateProviderFailure = createAction(
  '[Provider] Validate Provider Failure',
  props<{ providerId: string; error: string }>()
);

/**
 * Model loading actions
 */
export const loadModelsForProvider = createAction(
  '[Provider] Load Models For Provider',
  props<{ providerId: string }>()
);

export const loadModelsForProviderSuccess = createAction(
  '[Provider] Load Models For Provider Success',
  props<{ providerId: string; models: string[] }>()
);

export const loadModelsForProviderFailure = createAction(
  '[Provider] Load Models For Provider Failure',
  props<{ providerId: string; error: string }>()
);

/**
 * Clear actions
 */
export const clearProviderError = createAction('[Provider] Clear Error');

export const clearModelError = createAction('[Provider] Clear Model Error');

export const clearValidationResults = createAction('[Provider] Clear Validation Results');

/**
 * Reset actions
 */
export const resetProviderState = createAction('[Provider] Reset State');