/**
 * Provider Management Service for handling AI provider configurations
 * Supports the new provider-agent architecture
 */

import * as vscode from 'vscode';
import { Provider, CloudProvider, LocalNetworkProvider, ProviderConfig, ProviderFormData, ProviderValidationResult, ConnectionTestResult } from './types';
import { ConfigurationValidator } from './config-validator';
import { logger as rootLogger, Logger } from './logger';

export class ProviderManagerService {
  private static instance: ProviderManagerService | null = null;
  private secretStorage: vscode.SecretStorage;
  private logger: Logger;
  // In-memory cache to ensure stability with mocked VS Code configuration during tests
  private inMemoryProviders: ProviderConfig[] | null = null;

  /**
   * Get the singleton instance of ProviderManagerService
   */
  public static getInstance(secretStorage: vscode.SecretStorage): ProviderManagerService {
    if (!ProviderManagerService.instance) {
      ProviderManagerService.instance = new ProviderManagerService(secretStorage);
    } else {
      // Ensure tests can swap secret storage mocks between cases
      // Safe because this class only reads/writes via the SecretStorage interface
      (ProviderManagerService.instance as ProviderManagerService).secretStorage = secretStorage;
    }
    return ProviderManagerService.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    // Clear persisted providers to ensure test isolation
    try {
      const config = vscode.workspace.getConfiguration('comrade');
      const hasWorkspace = !!vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
      const target = hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
      void config.update('providers', [], target);
    } catch {
      // best-effort cleanup
    }
    // Also clear any in-memory cache on the existing instance
    if (ProviderManagerService.instance) {
      try {
        (ProviderManagerService.instance as any).inMemoryProviders = null;
      } catch {
        // ignore
      }
    }
    ProviderManagerService.instance = null;
  }

  constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
    this.logger = rootLogger.child({ prefix: 'ProviderManager' });
  }

  /**
   * Get all configured providers
   */
  public getProviders(): ProviderConfig[] {
    // Prefer in-memory cache when available to ensure consistency across rapid test updates
    if (this.inMemoryProviders && Array.isArray(this.inMemoryProviders)) {
      this.logger.debug('getProviders.cache', { count: this.inMemoryProviders.length });
      return this.inMemoryProviders;
    }
    // Otherwise, read from VS Code configuration
    const config = vscode.workspace.getConfiguration('comrade');
    // Prefer workspace-scoped providers to avoid leaking global settings between tests/sessions
    let list: ProviderConfig[] = [];
    try {
      const inspected = (config as any).inspect?.('providers') as | {
        workspaceFolderValue?: ProviderConfig[];
        workspaceValue?: ProviderConfig[];
        globalValue?: ProviderConfig[];
        defaultValue?: ProviderConfig[];
      } | undefined;
      const scoped = inspected?.workspaceFolderValue ?? inspected?.workspaceValue ?? inspected?.globalValue;
      if (Array.isArray(scoped)) {
        list = scoped;
      } else {
        const effective = config.get<ProviderConfig[]>('providers', []);
        list = Array.isArray(effective) ? effective : Array.isArray(inspected?.defaultValue) ? inspected!.defaultValue! : [];
      }
    } catch {
      const effective = config.get<ProviderConfig[]>('providers', []);
      list = Array.isArray(effective) ? effective : [];
    }
    // Refresh cache for subsequent calls, but do not serve from it to prevent staleness in tests
    this.inMemoryProviders = list;
    this.logger.debug('getProviders', { count: list.length });
    return list;
  }

  /**
   * Get active providers only
   */
  public getActiveProviders(): ProviderConfig[] {
    const all = this.getProviders();
    const active = all.filter(provider => provider.isActive);
    this.logger.debug('getActiveProviders', { total: all.length, active: active.length });
    return active;
  }

  /**
   * Get provider by ID
   */
  public getProviderById(id: string): ProviderConfig | null {
    const providers = this.getProviders();
    const found = providers.find(provider => provider.id === id) || null;
    this.logger.debug('getProviderById', { id, found: !!found });
    return found;
  }

  /**
   * Add a new provider
   */
  public async addProvider(providerData: ProviderFormData): Promise<ProviderConfig> {
    this.logger.debug('addProvider.start', { name: providerData.name, type: providerData.type, provider: providerData.provider });
    // Validate provider data
    try {
      this.validateProviderData(providerData);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn('addProvider.validationFailed', { error: message });
      throw new Error(`Provider validation failed: ${message}`);
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
    this.logger.info('addProvider.success', { id: provider.id, name: provider.name, type: provider.type, provider: provider.provider });
    return provider;
  }

  /**
   * Update an existing provider
   */
  public async updateProvider(id: string, updates: Partial<ProviderFormData>): Promise<ProviderConfig> {
    this.logger.debug('updateProvider.start', { id, fields: Object.keys(updates || {}) });
    const currentProviders = this.getProviders();
    const providerIndex = currentProviders.findIndex(p => p.id === id);
    
    if (providerIndex === -1) {
      this.logger.warn('updateProvider.notFound', { id });
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
    try {
      this.validateProviderData(updatedFormData);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn('updateProvider.validationFailed', { id, error: message });
      throw new Error(`Provider validation failed: ${message}`);
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
    this.logger.info('updateProvider.success', { id: updatedProvider.id, isActive: (updatedProvider as any).isActive, provider: updatedProvider.provider });
    return updatedProvider;
  }

  /**
   * Delete a provider
   */
  public async deleteProvider(id: string): Promise<void> {
    this.logger.debug('deleteProvider.start', { id });
    const currentProviders = this.getProviders();
    const filteredProviders = currentProviders.filter(p => p.id !== id);
    
    if (filteredProviders.length === currentProviders.length) {
      this.logger.warn('deleteProvider.notFound', { id });
      throw new Error(`Provider with ID ${id} not found`);
    }

    // Remove stored API key
    await this.removeProviderApiKey(id);

    // Update configuration
    await this.updateProvidersConfiguration(filteredProviders);
    this.logger.info('deleteProvider.success', { id });
  }

  /**
   * Toggle provider active status
   */
  public async toggleProviderStatus(id: string, isActive: boolean): Promise<ProviderConfig> {
    this.logger.debug('toggleProviderStatus.start', { id, isActive });
    const currentProviders = this.getProviders();
    const providerIndex = currentProviders.findIndex(p => p.id === id);
    
    if (providerIndex === -1) {
      this.logger.warn('toggleProviderStatus.notFound', { id });
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
      this.logger.debug('validateProvider.start', { id: provider.id, provider: provider.provider, type: provider.type });
      // Basic validation
      try {
        this.validateProviderData({
          name: provider.name,
          type: provider.type,
          provider: provider.provider,
          endpoint: (provider as LocalNetworkProvider).endpoint,
          localHostType: (provider as LocalNetworkProvider).localHostType
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.logger.warn('validateProvider.basicValidationFailed', { id: provider.id, error: message });
        return {
          valid: false,
          error: message,
          connectionStatus: 'unknown'
        };
      }

      // Test connection
      const connectionTest = await this.testProviderConnection(provider);
      
      const result: ProviderValidationResult = {
        valid: connectionTest.success,
        error: connectionTest.error,
        connectionStatus: connectionTest.success ? 'connected' : 'disconnected',
        responseTime: connectionTest.responseTime,
        availableModels: connectionTest.availableModels
      };
      this.logger.info('validateProvider.result', { id: provider.id, valid: result.valid, connectionStatus: result.connectionStatus, responseTime: result.responseTime });
      return result;
    } catch (error) {
      this.logger.error('validateProvider.exception', { id: provider.id, error: error instanceof Error ? error.message : String(error) });
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
    this.logger.debug('testProviderConnection.start', { id: provider.id, provider: provider.provider, type: provider.type });
    
    try {
      // Get API key if needed
      const apiKey = provider.type === 'cloud' ? await this.getProviderApiKey(provider.id) : undefined;
      this.logger.debug('testProviderConnection.keyResolved', { id: provider.id, hasApiKey: !!apiKey });
      
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
      this.logger.error('testProviderConnection.exception', { id: provider.id, error: error instanceof Error ? error.message : String(error) });
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
      this.logger.warn('fetchAvailableModels.notFound', { id: providerId });
      throw new Error(`Provider with ID ${providerId} not found`);
    }

    const connectionTest = await this.testProviderConnection(provider);
    const models = connectionTest.availableModels || [];
    this.logger.debug('fetchAvailableModels.result', { id: providerId, count: models.length });
    return models;
  }

  /**
   * Store provider API key securely
   */
  public async storeProviderApiKey(providerId: string, apiKey: string): Promise<void> {
    const key = `comrade.provider.${providerId}.apiKey`;
    await this.secretStorage.store(key, apiKey);
    this.logger.debug('apiKey.store', { providerId });
  }

  /**
   * Retrieve provider API key from secure storage
   */
  public async getProviderApiKey(providerId: string): Promise<string | undefined> {
    const key = `comrade.provider.${providerId}.apiKey`;
    const value = await this.secretStorage.get(key);
    this.logger.debug('apiKey.get', { providerId, found: !!value });
    return value;
  }

  /**
   * Remove provider API key from secure storage
   */
  private async removeProviderApiKey(providerId: string): Promise<void> {
    const key = `comrade.provider.${providerId}.apiKey`;
    await this.secretStorage.delete(key);
    this.logger.debug('apiKey.delete', { providerId });
  }

  /**
   * Update providers configuration in VS Code settings
   */
  private async updateProvidersConfiguration(providers: ProviderConfig[]): Promise<void> {
    const config = vscode.workspace.getConfiguration('comrade');
    const hasWorkspace = !!vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
    const target = hasWorkspace ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    // Update in-memory cache first to ensure immediate consistency for subsequent reads
    this.inMemoryProviders = providers;
    await config.update('providers', providers, target);
    this.logger.debug('config.update', { count: providers.length });
  }

  /**
   * Create provider object from form data
   */
  private createProviderFromFormData(formData: ProviderFormData): ProviderConfig {
    this.logger.debug('createProviderFromFormData', { name: formData.name, type: formData.type, provider: formData.provider });
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
      const endpoint = formData.endpoint || 'http://localhost:11434';
      const url = new URL(endpoint);
      return {
        ...baseProvider,
        type: 'local_network',
        endpoint: endpoint,
        host: url.hostname,
        port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
        protocol: url.protocol.replace(':', '') as 'http' | 'https',
        localHostType: formData.localHostType || 'ollama',
        apiKey: formData.apiKey
      } as LocalNetworkProvider;
    }
  }

  /**
   * Validate provider form data
   */
  private validateProviderData(data: ProviderFormData): void {
    if (!data.name || data.name.trim().length === 0) {
      this.logger.debug('validateProviderData.fail', { reason: 'name' });
      throw new Error('Provider name is required');
    }

    if (!data.type || !['cloud', 'local-network'].includes(data.type)) {
      this.logger.debug('validateProviderData.fail', { reason: 'type' });
      throw new Error('Invalid provider type');
    }

    if (!data.provider) {
      this.logger.debug('validateProviderData.fail', { reason: 'provider' });
      throw new Error('Provider type is required');
    }

    if (data.type === 'local_network' && !data.endpoint) {
      this.logger.debug('validateProviderData.fail', { reason: 'endpoint' });
      throw new Error('Endpoint is required for local network providers');
    }
  }

  /**
   * Generate unique provider ID
   */
  private generateProviderId(): string {
    const id = ConfigurationValidator.generateUniqueId('provider');
    this.logger.debug('generateProviderId', { id });
    return id;
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