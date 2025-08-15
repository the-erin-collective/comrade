/**
 * Type guards and utility functions for provider-agent types
 */

import { 
  Provider, 
  CloudProvider, 
  LocalNetworkProvider, 
  ProviderConfig,
  Agent,
  ProviderFormData,
  AgentFormData,
  ValidationResult,
  ProviderValidationResult,
  AgentValidationResult
} from '../interfaces/provider-agent.interface';

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
  // Cloud providers always require API keys
  if (provider.type === 'cloud') {
    return true;
  }
  
  // Local network providers may require API keys depending on the service
  if (provider.type === 'local-network') {
    // Ollama typically doesn't require API keys, but custom endpoints might
    return provider.provider !== 'ollama';
  }
  
  return false;
}

/**
 * Validate provider form data
 */
export function validateProviderFormData(formData: ProviderFormData): ProviderValidationResult {
  const result: ProviderValidationResult = {
    valid: true,
    warnings: []
  };

  // Basic validation
  if (!formData.name?.trim()) {
    return { valid: false, error: 'Provider name is required' };
  }

  if (!formData.provider) {
    return { valid: false, error: 'Provider type is required' };
  }

  // Type-specific validation
  if (formData.type === 'cloud') {
    if (!formData.apiKey?.trim()) {
      return { valid: false, error: 'API key is required for cloud providers' };
    }
    
    // Warn about endpoint for cloud providers
    if (formData.endpoint) {
      result.warnings?.push('Endpoint is not needed for cloud providers and will be ignored');
    }
  }

  if (formData.type === 'local-network') {
    if (!formData.endpoint?.trim()) {
      return { valid: false, error: 'Endpoint is required for local network providers' };
    }

    // Validate endpoint format
    try {
      new URL(formData.endpoint);
    } catch {
      return { valid: false, error: 'Invalid endpoint URL format' };
    }

    // Warn about missing API key for non-Ollama providers
    if (formData.provider !== 'ollama' && !formData.apiKey?.trim()) {
      result.warnings?.push('API key may be required for this provider type');
    }
  }

  return result;
}

/**
 * Validate agent form data
 */
export function validateAgentFormData(formData: AgentFormData, availableProviders: Provider[]): AgentValidationResult {
  const result: AgentValidationResult = {
    valid: true,
    warnings: []
  };

  // Basic validation
  if (!formData.name?.trim()) {
    return { valid: false, error: 'Agent name is required' };
  }

  if (!formData.providerId) {
    return { valid: false, error: 'Provider selection is required' };
  }

  if (!formData.model?.trim()) {
    return { valid: false, error: 'Model name is required' };
  }

  // Provider validation
  const provider = availableProviders.find(p => p.id === formData.providerId);
  if (!provider) {
    return { valid: false, error: 'Selected provider not found', providerStatus: 'not_found' };
  }

  if (!provider.isActive) {
    return { valid: false, error: 'Selected provider is inactive', providerStatus: 'inactive' };
  }

  result.providerStatus = 'active';

  // Parameter validation
  if (formData.temperature !== undefined) {
    if (formData.temperature < 0 || formData.temperature > 2) {
      return { valid: false, error: 'Temperature must be between 0 and 2' };
    }
  }

  if (formData.maxTokens !== undefined) {
    if (formData.maxTokens <= 0) {
      return { valid: false, error: 'Max tokens must be greater than 0' };
    }
    
    if (formData.maxTokens > 100000) {
      result.warnings?.push('Very high token limit may result in expensive API calls');
      result.estimatedCost = 'high';
    }
  }

  if (formData.timeout !== undefined) {
    if (formData.timeout <= 0) {
      return { valid: false, error: 'Timeout must be greater than 0' };
    }
    
    if (formData.timeout > 300000) { // 5 minutes
      result.warnings?.push('Very high timeout may cause poor user experience');
    }
  }

  return result;
}

/**
 * Create a default provider configuration
 */
export function createDefaultProvider(type: 'cloud' | 'local-network', provider: string): Partial<ProviderFormData> {
  const base: Partial<ProviderFormData> = {
    type,
    provider: provider as any,
    name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Provider`
  };

  if (type === 'cloud') {
    return base;
  }

  // Local network defaults
  if (provider === 'ollama') {
    return {
      ...base,
      endpoint: 'http://localhost:11434',
      localHostType: 'ollama'
    };
  }

  return {
    ...base,
    endpoint: 'http://localhost:8080',
    localHostType: 'custom'
  };
}

/**
 * Create a default agent configuration
 */
export function createDefaultAgent(providerId: string): Partial<AgentFormData> {
  return {
    providerId,
    name: 'New Agent',
    model: '',
    temperature: 0.7,
    maxTokens: 4096,
    timeout: 30000, // 30 seconds
    capabilities: {
      hasVision: false,
      hasToolUse: true,
      reasoningDepth: 'intermediate',
      speed: 'medium',
      costTier: 'medium'
    }
  };
}

/**
 * Generate a unique ID for providers and agents
 */
export function generateId(prefix: 'provider' | 'agent'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Format provider display name
 */
export function formatProviderDisplayName(provider: ProviderConfig): string {
  const typeLabel = provider.type === 'cloud' ? '☁️' : '🏠';
  const statusLabel = provider.isActive ? '✅' : '❌';
  return `${typeLabel} ${provider.name} (${provider.provider}) ${statusLabel}`;
}

/**
 * Format agent display name with provider info
 */
export function formatAgentDisplayName(agent: Agent, provider?: ProviderConfig): string {
  const statusLabel = agent.isActive ? '✅' : '❌';
  const providerInfo = provider ? ` via ${provider.name}` : '';
  return `${agent.name} (${agent.model})${providerInfo} ${statusLabel}`;
}

/**
 * Check if two providers are equivalent (same configuration)
 */
export function areProvidersEquivalent(a: ProviderConfig, b: ProviderConfig): boolean {
  if (a.type !== b.type || a.provider !== b.provider) {
    return false;
  }

  if (isCloudProvider(a) && isCloudProvider(b)) {
    return a.apiKey === b.apiKey;
  }

  if (isLocalNetworkProvider(a) && isLocalNetworkProvider(b)) {
    return a.endpoint === b.endpoint && a.apiKey === b.apiKey;
  }

  return false;
}