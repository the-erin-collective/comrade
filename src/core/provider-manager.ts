/**
 * Provider Management Service for handling AI provider configurations
 * Supports the new provider-agent architecture
 */

import * as vscode from 'vscode';
import { Provider, CloudProvider, LocalNetworkProvider, ProviderConfig, ProviderFormData, ProviderValidationResult, ConnectionTestResult } from './types';
import { ConfigurationValidator } from './config-validator';

export class ProviderManagerService {
  private static instance: ProviderManagerService | null = null;
  private secretStorage: vscode.SecretStorage;

  /**
   * Get the singleton instance of ProviderManagerService
   */
  public static getInstance(secretStorage: vscode.SecretStorage): ProviderManagerService {
    if (!ProviderManagerService.instance) {
      ProviderManagerService.instance = new ProviderManagerService(secretStorage);
    }
    return ProviderManagerService.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    ProviderManagerService.instance = null;
  }

  constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
  }

  /**
   * Get all configured providers
   */
  public getProviders(): ProviderConfig[] {
    const config = vscode.workspace.getConfiguration('comrade');
    const providers = config.get<ProviderConfig[]>('providers', []);
    return Array.isArray(providers) ? providers : [];
  }

  /**
   * Get active providers only
   */
  public getActiveProviders(): ProviderConfig[] {
    return this.getProviders().filter(provider => provider.isActive);
  }

  /**
   * Get provider by ID
   */
  public getProviderById(id: string): ProviderConfig | null {
    const providers = this.getProviders();
    return providers.find(provider => provider.id === id) || null;
  }

  /**
   * Add a new provider
   */
  public async addProvider(providerData: ProviderFormData): Promise<ProviderConfig> {
    // Validate provider data
    const validation = this.validateProviderData(providerData);
    if (!validation.valid) {
      throw new Error(`Provider validation failed: ${validation.error}`);
    }

    // Create provider object
    const provider: ProviderConfig = this.createProviderFromFormData(providerData);

    // Store API key securely if provided
    if (providerData.apiKey) {
      await this.storeProviderApiKey(provider.id, providerData.apiKey);
    }

    // Add to configuration
    const currentProviders = this.getProviders();
    const updatedProviders = [...currentProviders, provider];
    await this.updateProvidersConfiguration(updatedProviders);

    return provider;
  }

  /**
   * Update an existing provider
   */
  public async updateProvider(id: string, updates: Partial<ProviderFormData>): Promise<ProviderConfig> {
    const currentProviders = this.getProviders();
    const providerIndex = currentProviders.findIndex(p => p.id === id);
    
    if (providerIndex === -1) {
      throw new Error(`Provider with ID ${id} not found`);
    }

    const currentProvider = currentProviders[providerIndex];
    
    // Merge updates with current provider
    const updatedFormData: ProviderFormData = {
      name: updates.name || currentProvider.name,
      type: updates.type || currentProvider.type,
      provider: updates.provider || currentProvider.provider,
      endpoint: updates.endpoint || (currentProvider as LocalNetworkProvider).endpoint,
      apiKey: updates.apiKey,
      localHostType: updates.localHostType || (currentProvider as LocalNetworkProvider).localHostType
    };

    // Validate updated data
    const validation = this.validateProviderData(updatedFormData);
    if (!validation.valid) {
      throw new Error(`Provider validation failed: ${validation.error}`);
    }

    // Create updated provider
    const updatedProvider: ProviderConfig = {
      ...this.createProviderFromFormData(updatedFormData),
      id: currentProvider.id,
      createdAt: currentProvider.createdAt,
      updatedAt: new Date()
    };

    // Update API key if provided
    if (updates.apiKey) {
      await this.storeProviderApiKey(id, updates.apiKey);
    }

    // Update configuration
    currentProviders[providerIndex] = updatedProvider;
    await this.updateProvidersConfiguration(currentProviders);

    return updatedProvider;
  }

  /**
   * Delete a provider
   */
  public async deleteProvider(id: string): Promise<void> {
    const currentProviders = this.getProviders();
    const filteredProviders = currentProviders.filter(p => p.id !== id);
    
    if (filteredProviders.length === currentProviders.length) {
      throw new Error(`Provider with ID ${id} not found`);
    }

    // Remove stored API key
    await this.removeProviderApiKey(id);

    // Update configuration
    await this.updateProvidersConfiguration(filteredProviders);
  }

  /**
   * Toggle provider active status
   */
  public async toggleProviderStatus(id: string, isActive: boolean): Promise<ProviderConfig> {
    const currentProviders = this.getProviders();
    const providerIndex = currentProviders.findIndex(p => p.id === id);
    
    if (providerIndex === -1) {
      throw new Error(`Provider with ID ${id} not found`);
    }

    const updatedProvider = {
      ...currentProviders[providerIndex],
      isActive,
      updatedAt: new Date()
    };

    currentProviders[providerIndex] = updatedProvider;
    await this.updateProvidersConfiguration(currentProviders);

    return updatedProvider;
  }

  /**
   * Validate provider configuration
   */
  public async validateProvider(provider: ProviderConfig): Promise<ProviderValidationResult> {
    try {
      // Basic validation
      const basicValidation = this.validateProviderData({
        name: provider.name,
        type: provider.type,
        provider: provider.provider,
        endpoint: (provider as LocalNetworkProvider).endpoint,
        localHostType: (provider as LocalNetworkProvider).localHostType
      });

      if (!basicValidation.valid) {
        return {
          valid: false,
          error: basicValidation.error,
          connectionStatus: 'unknown'
        };
      }

      // Test connection
      const connectionTest = await this.testProviderConnection(provider);
      
      return {
        valid: connectionTest.success,
        error: connectionTest.error,
        connectionStatus: connectionTest.success ? 'connected' : 'disconnected',
        responseTime: connectionTest.responseTime,
        availableModels: connectionTest.availableModels
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
        connectionStatus: 'unknown'
      };
    }
  }

  /**
   * Test provider connection
   */
  public async testProviderConnection(provider: ProviderConfig): Promise<ConnectionTestResult> {
    const startTime = Date.now();
    
    try {
      // Get API key if needed
      const apiKey = provider.type === 'cloud' ? await this.getProviderApiKey(provider.id) : undefined;
      
      switch (provider.provider) {
        case 'openai':
          return await this.testOpenAIConnection(provider, apiKey);
        case 'anthropic':
          return await this.testAnthropicConnection(provider, apiKey);
        case 'ollama':
          return await this.testOllamaConnection(provider as LocalNetworkProvider);
        case 'custom':
          return await this.testCustomConnection(provider, apiKey);
        default:
          return {
            success: false,
            error: `Unsupported provider type: ${provider.provider}`
          };
      }
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Connection test failed'
      };
    }
  }

  /**
   * Fetch available models for a provider
   */
  public async fetchAvailableModels(providerId: string): Promise<string[]> {
    const provider = this.getProviderById(providerId);
    if (!provider) {
      throw new Error(`Provider with ID ${providerId} not found`);
    }

    const connectionTest = await this.testProviderConnection(provider);
    return connectionTest.availableModels || [];
  }

  /**
   * Store provider API key securely
   */
  public async storeProviderApiKey(providerId: string, apiKey: string): Promise<void> {
    const key = `comrade.provider.${providerId}.apiKey`;
    await this.secretStorage.store(key, apiKey);
  }

  /**
   * Retrieve provider API key from secure storage
   */
  public async getProviderApiKey(providerId: string): Promise<string | undefined> {
    const key = `comrade.provider.${providerId}.apiKey`;
    return await this.secretStorage.get(key);
  }

  /**
   * Remove provider API key from secure storage
   */
  private async removeProviderApiKey(providerId: string): Promise<void> {
    const key = `comrade.provider.${providerId}.apiKey`;
    await this.secretStorage.delete(key);
  }

  /**
   * Update providers configuration in VS Code settings
   */
  private async updateProvidersConfiguration(providers: ProviderConfig[]): Promise<void> {
    const config = vscode.workspace.getConfiguration('comrade');
    await config.update('providers', providers, vscode.ConfigurationTarget.Global);
  }

  /**
   * Create provider object from form data
   */
  private createProviderFromFormData(formData: ProviderFormData): ProviderConfig {
    const baseProvider = {
      id: this.generateProviderId(),
      name: formData.name,
      provider: formData.provider,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (formData.type === 'cloud') {
      return {
        ...baseProvider,
        type: 'cloud',
        apiKey: '' // API key is stored separately in secure storage
      } as CloudProvider;
    } else {
      return {
        ...baseProvider,
        type: 'local-network',
        endpoint: formData.endpoint || 'http://localhost:11434',
        localHostType: formData.localHostType || 'ollama',
        apiKey: formData.apiKey
      } as LocalNetworkProvider;
    }
  }

  /**
   * Validate provider form data
   */
  private validateProviderData(data: ProviderFormData): { valid: boolean; error?: string } {
    if (!data.name || data.name.trim().length === 0) {
      return { valid: false, error: 'Provider name is required' };
    }

    if (!data.type || !['cloud', 'local-network'].includes(data.type)) {
      return { valid: false, error: 'Invalid provider type' };
    }

    if (!data.provider) {
      return { valid: false, error: 'Provider type is required' };
    }

    if (data.type === 'local-network' && !data.endpoint) {
      return { valid: false, error: 'Endpoint is required for local network providers' };
    }

    return { valid: true };
  }

  /**
   * Generate unique provider ID
   */
  private generateProviderId(): string {
    return ConfigurationValidator.generateUniqueId('provider');
  }

  /**
   * Test OpenAI connection
   */
  private async testOpenAIConnection(provider: ProviderConfig, apiKey?: string): Promise<ConnectionTestResult> {
    if (!apiKey) {
      return { success: false, error: 'API key is required for OpenAI' };
    }

    const endpoint = 'https://api.openai.com/v1/models';
    const startTime = Date.now();

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          responseTime,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data = await response.json() as { data?: Array<{ id: string }> };
      const models = data.data?.map((model: any) => model.id) || [];

      return {
        success: true,
        responseTime,
        availableModels: models
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  /**
   * Test Anthropic connection
   */
  private async testAnthropicConnection(provider: ProviderConfig, apiKey?: string): Promise<ConnectionTestResult> {
    if (!apiKey) {
      return { success: false, error: 'API key is required for Anthropic' };
    }

    const endpoint = 'https://api.anthropic.com/v1/messages';
    const startTime = Date.now();

    try {
      // Test with minimal request
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }]
        }),
        signal: AbortSignal.timeout(10000)
      });

      const responseTime = Date.now() - startTime;

      if (response.status === 401) {
        return {
          success: false,
          responseTime,
          error: 'Invalid API key'
        };
      }

      // For Anthropic, we consider any non-401 response as successful connection
      // since we're just testing connectivity, not making a real request
      return {
        success: response.status !== 401,
        responseTime,
        availableModels: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307']
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  /**
   * Test Ollama connection
   */
  private async testOllamaConnection(provider: LocalNetworkProvider): Promise<ConnectionTestResult> {
    const endpoint = `${provider.endpoint}/api/tags`;
    const startTime = Date.now();

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          responseTime,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const data = await response.json() as { models?: Array<{ name: string }> };
      const models = data.models?.map((model: any) => model.name) || [];

      return {
        success: true,
        responseTime,
        availableModels: models,
        serverInfo: {
          status: 'running'
        }
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  /**
   * Test custom provider connection
   */
  private async testCustomConnection(provider: ProviderConfig, apiKey?: string): Promise<ConnectionTestResult> {
    const endpoint = (provider as LocalNetworkProvider).endpoint;
    if (!endpoint) {
      return { success: false, error: 'Endpoint is required for custom providers' };
    }

    const startTime = Date.now();

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000)
      });

      const responseTime = Date.now() - startTime;

      return {
        success: response.ok,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    // Clean up any resources if needed
  }
}