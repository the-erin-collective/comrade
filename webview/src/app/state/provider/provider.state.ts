import { ProviderConfig, ProviderValidationResult } from '../../interfaces/provider-agent.interface';

/**
 * Provider state interface
 * Manages the state for provider configuration and management
 */
export interface ProviderState {
  /** Array of configured providers */
  providers: ProviderConfig[];
  
  /** Loading state for provider operations */
  loading: boolean;
  
  /** Error message for provider operations */
  error: string | null;
  
  /** Currently selected provider for editing */
  selectedProvider: ProviderConfig | null;
  
  /** Validation results for providers */
  validationResults: Record<string, ProviderValidationResult>;
  
  /** Available models for each provider */
  availableModels: Record<string, string[]>;
  
  /** Loading state for model fetching */
  loadingModels: boolean;
  
  /** Model loading errors */
  modelError: string | null;
}

/**
 * Initial state for provider management
 */
export const initialProviderState: ProviderState = {
  providers: [],
  loading: false,
  error: null,
  selectedProvider: null,
  validationResults: {},
  availableModels: {},
  loadingModels: false,
  modelError: null
};