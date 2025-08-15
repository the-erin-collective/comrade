/**
 * Type guards and utility functions for provider-agent types in core system
 */

import { 
  Provider, 
  CloudProvider, 
  LocalNetworkProvider, 
  ProviderConfig,
  Agent,
  ValidationResult,
  ProviderValidationResult,
  AgentValidationResult
} from './types';

/**
 * Type guard to check if a provider is a cloud provider
 */
export function isCloudProvider(provider: ProviderConfig): provider is CloudProvider {
  return provider.type === 'cloud';
}

/**
 * Type guard to check if a provider is a local network provider
 */
export function isLocalNetworkProvider(provider: ProviderConfig): provider is LocalNetworkProvider {
  return provider.type === 'local-network';
}

/**
 * Type guard to check if a provider requires an API key
 */
export function requiresApiKey(provider: Pick<Provider, 'provider' | 'type'>): boolean {
  if (provider.type === 'cloud') {
    return true;
  }
  
  if (provider.type === 'local-network') {
    return provider.provider !== 'ollama';
  }
  
  return false;
}

/**
 * Validate provider configuration
 */
export function validateProvider(provider: ProviderConfig): ProviderValidationResult {
  const result: ProviderValidationResult = {
    valid: true,
    warnings: []
  };

  if (!provider.name?.trim()) {
    return { valid: false, error: 'Provider name is required' };
  }

  if (!provider.provider) {
    return { valid: false, error: 'Provider type is required' };
  }

  if (isCloudProvider(provider)) {
    if (!provider.apiKey?.trim()) {
      return { valid: false, error: 'API key is required for cloud providers' };
    }
  }

  if (isLocalNetworkProvider(provider)) {
    if (!provider.endpoint?.trim()) {
      return { valid: false, error: 'Endpoint is required for local network providers' };
    }

    try {
      new URL(provider.endpoint);
    } catch {
      return { valid: false, error: 'Invalid endpoint URL format' };
    }
  }

  return result;
}

/**
 * Validate agent configuration
 */
export function validateAgent(agent: Agent, provider?: ProviderConfig): AgentValidationResult {
  const result: AgentValidationResult = {
    valid: true,
    warnings: []
  };

  if (!agent.name?.trim()) {
    return { valid: false, error: 'Agent name is required' };
  }

  if (!agent.providerId) {
    return { valid: false, error: 'Provider ID is required' };
  }

  if (!agent.model?.trim()) {
    return { valid: false, error: 'Model name is required' };
  }

  if (provider) {
    if (!provider.isActive) {
      result.providerStatus = 'inactive';
      result.warnings?.push('Associated provider is inactive');
    } else {
      result.providerStatus = 'active';
    }
  } else {
    result.providerStatus = 'not_found';
    result.warnings?.push('Associated provider not found');
  }

  if (agent.temperature !== undefined) {
    if (agent.temperature < 0 || agent.temperature > 2) {
      return { valid: false, error: 'Temperature must be between 0 and 2' };
    }
  }

  if (agent.maxTokens !== undefined) {
    if (agent.maxTokens <= 0) {
      return { valid: false, error: 'Max tokens must be greater than 0' };
    }
  }

  if (agent.timeout !== undefined) {
    if (agent.timeout <= 0) {
      return { valid: false, error: 'Timeout must be greater than 0' };
    }
  }

  return result;
}

/**
 * Convert provider to connection configuration for model adapters
 */
export function providerToModelConfig(provider: ProviderConfig, model: string): any {
  const baseConfig = {
    provider: provider.provider,
    model: model
  };

  if (isCloudProvider(provider)) {
    return {
      ...baseConfig,
      apiKey: provider.apiKey
    };
  }

  if (isLocalNetworkProvider(provider)) {
    return {
      ...baseConfig,
      endpoint: provider.endpoint,
      ...(provider.apiKey && { apiKey: provider.apiKey })
    };
  }

  return baseConfig;
}

/**
 * Generate unique ID for providers and agents
 */
export function generateId(prefix: 'provider' | 'agent'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Check if agent can be used (both agent and provider are active)
 */
export function isAgentUsable(agent: Agent, provider?: ProviderConfig): boolean {
  if (!agent.isActive) {
    return false;
  }

  if (!provider) {
    return false;
  }

  return provider.isActive;
}

/**
 * Get provider endpoint for connection
 */
export function getProviderEndpoint(provider: ProviderConfig): string | undefined {
  if (isLocalNetworkProvider(provider)) {
    return provider.endpoint;
  }

  // Cloud providers use internal endpoints based on provider type
  switch (provider.provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'google':
      return 'https://generativelanguage.googleapis.com/v1';
    case 'azure':
      // Azure endpoints are typically custom, but we can't determine without additional config
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Get provider API key
 */
export function getProviderApiKey(provider: ProviderConfig): string | undefined {
  if (isCloudProvider(provider)) {
    return provider.apiKey;
  }

  if (isLocalNetworkProvider(provider)) {
    return provider.apiKey;
  }

  return undefined;
}