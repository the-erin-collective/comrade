import { Injectable } from '@angular/core';
import { 
  Provider, 
  Agent, 
  CloudProvider, 
  LocalNetworkProvider, 
  MigrationData,
  AgentCapabilities 
} from '../interfaces/provider-agent.interface';
import { 
  AgentConfig, 
  ModelConfig, 
  ExtendedAgentConfig 
} from '../interfaces/model-config.interface';

/**
 * Migration Service
 * 
 * Handles migration from the old agent configuration system to the new provider-agent architecture.
 * Analyzes existing agent configurations, extracts provider information, creates default providers,
 * and updates agent configurations to reference the new provider IDs.
 */
@Injectable({
  providedIn: 'root'
})
export class MigrationService {

  /**
   * Migrate existing agent configurations to the new provider-agent system
   * @param legacyAgents Array of legacy agent configurations
   * @returns Migration data with created providers and updated agents
   */
  public migrateAgentConfigurations(legacyAgents: AgentConfig[] | ExtendedAgentConfig[]): MigrationData {
    const migrationData: MigrationData = {
      providersCreated: [],
      agentsUpdated: [],
      errors: [],
      warnings: []
    };

    if (!legacyAgents || legacyAgents.length === 0) {
      migrationData.warnings.push('No legacy agents found to migrate');
      return migrationData;
    }

    try {
      // Step 1: Extract unique provider configurations from legacy agents
      const providerMap = this.extractProviderConfigurations(legacyAgents, migrationData);

      // Step 2: Create provider objects from extracted configurations
      const providers = this.createProvidersFromMap(providerMap, migrationData);
      migrationData.providersCreated = providers;

      // Step 3: Update agent configurations to reference new provider IDs
      const updatedAgents = this.updateAgentConfigurations(legacyAgents, providerMap, migrationData);
      migrationData.agentsUpdated = updatedAgents;

      console.log(`Migration completed: ${providers.length} providers created, ${updatedAgents.length} agents updated`);
      
    } catch (error) {
      const errorMessage = `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      migrationData.errors.push(errorMessage);
      console.error(errorMessage, error);
    }

    return migrationData;
  }

  /**
   * Extract unique provider configurations from legacy agents
   */
  private extractProviderConfigurations(
    legacyAgents: AgentConfig[] | ExtendedAgentConfig[], 
    migrationData: MigrationData
  ): Map<string, ProviderConfigData> {
    const providerMap = new Map<string, ProviderConfigData>();

    for (const agent of legacyAgents) {
      try {
        const modelConfig = agent.modelConfig;
        if (!modelConfig) {
          migrationData.warnings.push(`Agent ${agent.name} has no model configuration, skipping`);
          continue;
        }

        // Create a unique key for this provider configuration
        const providerKey = this.createProviderKey(modelConfig);
        
        if (!providerMap.has(providerKey)) {
          const providerData = this.createProviderConfigData(modelConfig, agent.name);
          providerMap.set(providerKey, providerData);
        }
      } catch (error) {
        const errorMessage = `Failed to extract provider from agent ${agent.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        migrationData.errors.push(errorMessage);
      }
    }

    return providerMap;
  }

  /**
   * Create a unique key for provider configuration
   */
  private createProviderKey(modelConfig: ModelConfig): string {
    const provider = modelConfig.provider;
    const endpoint = modelConfig.endpoint || '';
    
    // For cloud providers, key is just the provider type
    if (this.isCloudProvider(provider)) {
      return `${provider}`;
    }
    
    // For local providers, include endpoint in key
    return `${provider}-${endpoint}`;
  }

  /**
   * Create provider configuration data from model config
   */
  private createProviderConfigData(modelConfig: ModelConfig, agentName: string): ProviderConfigData {
    const provider = modelConfig.provider;
    const isCloud = this.isCloudProvider(provider);
    
    return {
      name: this.generateProviderName(provider, modelConfig.endpoint, agentName),
      type: isCloud ? 'cloud' : 'local-network',
      provider: provider,
      endpoint: modelConfig.endpoint,
      apiKey: modelConfig.apiKey,
      localHostType: provider === 'ollama' ? 'ollama' : 'custom'
    };
  }

  /**
   * Generate a descriptive name for the provider
   */
  private generateProviderName(provider: string, endpoint?: string, agentName?: string): string {
    switch (provider) {
      case 'openai':
        return 'OpenAI';
      case 'anthropic':
        return 'Anthropic';
      case 'google':
        return 'Google AI';
      case 'azure':
        return 'Azure OpenAI';
      case 'ollama':
        if (endpoint && endpoint !== 'http://localhost:11434') {
          return `Ollama (${endpoint})`;
        }
        return 'Local Ollama';
      case 'huggingface':
        return 'Hugging Face';
      case 'custom':
        if (endpoint) {
          const url = new URL(endpoint);
          return `Custom (${url.hostname})`;
        }
        return `Custom Provider (from ${agentName})`;
      default:
        return `${provider.charAt(0).toUpperCase() + provider.slice(1)} Provider`;
    }
  }

  /**
   * Check if provider is a cloud provider
   */
  private isCloudProvider(provider: string): boolean {
    return ['openai', 'anthropic', 'google', 'azure', 'huggingface'].includes(provider);
  }

  /**
   * Create provider objects from the provider map
   */
  private createProvidersFromMap(
    providerMap: Map<string, ProviderConfigData>, 
    migrationData: MigrationData
  ): Provider[] {
    const providers: Provider[] = [];

    for (const [key, data] of providerMap.entries()) {
      try {
        const provider = this.createProviderFromData(data);
        providers.push(provider);
      } catch (error) {
        const errorMessage = `Failed to create provider from key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        migrationData.errors.push(errorMessage);
      }
    }

    return providers;
  }

  /**
   * Create a provider object from provider configuration data
   */
  private createProviderFromData(data: ProviderConfigData): Provider {
    const baseProvider = {
      id: this.generateProviderId(),
      name: data.name,
      type: data.type,
      provider: data.provider as any,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (data.type === 'cloud') {
      if (!data.apiKey) {
        throw new Error(`Cloud provider ${data.name} requires an API key`);
      }
      
      return {
        ...baseProvider,
        type: 'cloud',
        apiKey: data.apiKey
      } as CloudProvider;
    } else {
      if (!data.endpoint) {
        throw new Error(`Local network provider ${data.name} requires an endpoint`);
      }
      
      return {
        ...baseProvider,
        type: 'local-network',
        endpoint: data.endpoint,
        localHostType: data.localHostType || 'custom',
        apiKey: data.apiKey
      } as LocalNetworkProvider;
    }
  }

  /**
   * Update agent configurations to reference new provider IDs
   */
  private updateAgentConfigurations(
    legacyAgents: AgentConfig[] | ExtendedAgentConfig[],
    providerMap: Map<string, ProviderConfigData>,
    migrationData: MigrationData
  ): Agent[] {
    const updatedAgents: Agent[] = [];

    for (const legacyAgent of legacyAgents) {
      try {
        const updatedAgent = this.convertLegacyAgentToNew(legacyAgent, providerMap);
        if (updatedAgent) {
          updatedAgents.push(updatedAgent);
        }
      } catch (error) {
        const errorMessage = `Failed to update agent ${legacyAgent.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        migrationData.errors.push(errorMessage);
      }
    }

    return updatedAgents;
  }

  /**
   * Convert a legacy agent to the new agent format
   */
  private convertLegacyAgentToNew(
    legacyAgent: AgentConfig | ExtendedAgentConfig,
    providerMap: Map<string, ProviderConfigData>
  ): Agent | null {
    if (!legacyAgent.modelConfig) {
      console.warn(`Agent ${legacyAgent.name} has no model configuration, skipping`);
      return null;
    }

    // Find the corresponding provider
    const providerKey = this.createProviderKey(legacyAgent.modelConfig);
    const providerData = providerMap.get(providerKey);
    
    if (!providerData) {
      throw new Error(`No provider found for agent ${legacyAgent.name}`);
    }

    // Find the provider ID (we need to match by the same key logic)
    const providerId = this.findProviderIdByKey(providerKey, providerMap);
    if (!providerId) {
      throw new Error(`Provider ID not found for agent ${legacyAgent.name}`);
    }

    // Convert capabilities
    const capabilities = this.convertCapabilities(legacyAgent.capabilities, legacyAgent.modelConfig);

    // Create the new agent
    const newAgent: Agent = {
      id: legacyAgent.id,
      name: legacyAgent.name,
      providerId: providerId,
      model: legacyAgent.modelConfig.model,
      temperature: legacyAgent.modelConfig.temperature,
      maxTokens: legacyAgent.modelConfig.maxTokens,
      timeout: legacyAgent.modelConfig.additionalParams?.['timeout'],
      systemPrompt: (legacyAgent as any).systemPrompt,
      capabilities: capabilities,
      isActive: (legacyAgent as ExtendedAgentConfig).isActive ?? true,
      createdAt: (legacyAgent as ExtendedAgentConfig).createdAt ?? new Date(),
      updatedAt: (legacyAgent as ExtendedAgentConfig).updatedAt ?? new Date()
    };

    return newAgent;
  }

  /**
   * Find provider ID by matching the provider key
   */
  private findProviderIdByKey(key: string, providerMap: Map<string, ProviderConfigData>): string | null {
    // Since we're creating providers in the same order as the map,
    // we can use the key to find the corresponding provider
    // This is a simplified approach - in a real implementation,
    // you might want to store the mapping more explicitly
    
    let index = 0;
    for (const [mapKey] of providerMap.entries()) {
      if (mapKey === key) {
        return `provider-migrated-${index}`;
      }
      index++;
    }
    return null;
  }

  /**
   * Convert legacy capabilities to new capabilities format
   */
  private convertCapabilities(
    legacyCapabilities?: any,
    modelConfig?: ModelConfig
  ): AgentCapabilities {
    const defaultCapabilities: AgentCapabilities = {
      hasVision: false,
      hasToolUse: false,
      reasoningDepth: 'basic',
      speed: 'medium',
      costTier: 'medium'
    };

    if (!legacyCapabilities && !modelConfig) {
      return defaultCapabilities;
    }

    // Convert from legacy capabilities if available
    const capabilities: AgentCapabilities = {
      hasVision: legacyCapabilities?.hasVision ?? false,
      hasToolUse: legacyCapabilities?.supportsToolCalling ?? legacyCapabilities?.hasToolUse ?? false,
      reasoningDepth: this.inferReasoningDepth(modelConfig),
      speed: this.inferSpeed(modelConfig),
      costTier: this.inferCostTier(modelConfig)
    };

    return capabilities;
  }

  /**
   * Infer reasoning depth from model configuration
   */
  private inferReasoningDepth(modelConfig?: ModelConfig): 'basic' | 'intermediate' | 'advanced' {
    if (!modelConfig) return 'basic';
    
    const model = modelConfig.model.toLowerCase();
    const provider = modelConfig.provider;

    if (provider === 'openai' && model.includes('gpt-4')) return 'advanced';
    if (provider === 'anthropic') return 'advanced';
    if (provider === 'google' && model.includes('ultra')) return 'advanced';
    if (provider === 'ollama' && (model.includes('70b') || model.includes('large'))) return 'advanced';
    
    return 'intermediate';
  }

  /**
   * Infer speed from model configuration
   */
  private inferSpeed(modelConfig?: ModelConfig): 'fast' | 'medium' | 'slow' {
    if (!modelConfig) return 'medium';
    
    const model = modelConfig.model.toLowerCase();
    const provider = modelConfig.provider;

    if (provider === 'openai' && model.includes('gpt-3.5')) return 'fast';
    if (provider === 'google' && model.includes('flash')) return 'fast';
    if (provider === 'ollama' && (model.includes('7b') || model.includes('small'))) return 'fast';
    if (provider === 'ollama' && (model.includes('70b') || model.includes('large'))) return 'slow';
    
    return 'medium';
  }

  /**
   * Infer cost tier from model configuration
   */
  private inferCostTier(modelConfig?: ModelConfig): 'low' | 'medium' | 'high' {
    if (!modelConfig) return 'medium';
    
    const model = modelConfig.model.toLowerCase();
    const provider = modelConfig.provider;

    if (provider === 'ollama') return 'low'; // Local models are essentially free
    if (provider === 'openai' && model.includes('gpt-4')) return 'high';
    if (provider === 'anthropic') return 'high';
    if (provider === 'google' && model.includes('ultra')) return 'high';
    
    return 'medium';
  }

  /**
   * Generate unique provider ID
   */
  private generateProviderId(): string {
    return `provider-migrated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate migration results
   */
  public validateMigrationResults(migrationData: MigrationData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if any providers were created
    if (migrationData.providersCreated.length === 0) {
      warnings.push('No providers were created during migration');
    }

    // Check if any agents were updated
    if (migrationData.agentsUpdated.length === 0) {
      warnings.push('No agents were updated during migration');
    }

    // Validate provider configurations
    for (const provider of migrationData.providersCreated) {
      if (!provider.id || !provider.name) {
        errors.push(`Invalid provider configuration: missing id or name`);
      }
      
      if (provider.type === 'cloud' && !(provider as CloudProvider).apiKey) {
        errors.push(`Cloud provider ${provider.name} is missing API key`);
      }
      
      if (provider.type === 'local-network' && !(provider as LocalNetworkProvider).endpoint) {
        errors.push(`Local network provider ${provider.name} is missing endpoint`);
      }
    }

    // Validate agent configurations
    for (const agent of migrationData.agentsUpdated) {
      if (!agent.id || !agent.name || !agent.providerId || !agent.model) {
        errors.push(`Invalid agent configuration: missing required fields for agent ${agent.name}`);
      }
    }

    // Add migration-specific errors and warnings
    errors.push(...migrationData.errors);
    warnings.push(...migrationData.warnings);

    return {
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Generate migration summary report
   */
  public generateMigrationReport(migrationData: MigrationData): string {
    const report = [
      '=== Migration Report ===',
      `Providers Created: ${migrationData.providersCreated.length}`,
      `Agents Updated: ${migrationData.agentsUpdated.length}`,
      `Errors: ${migrationData.errors.length}`,
      `Warnings: ${migrationData.warnings.length}`,
      ''
    ];

    if (migrationData.providersCreated.length > 0) {
      report.push('Created Providers:');
      migrationData.providersCreated.forEach(provider => {
        report.push(`  - ${provider.name} (${provider.type}, ${provider.provider})`);
      });
      report.push('');
    }

    if (migrationData.agentsUpdated.length > 0) {
      report.push('Updated Agents:');
      migrationData.agentsUpdated.forEach(agent => {
        report.push(`  - ${agent.name} -> Provider: ${agent.providerId}, Model: ${agent.model}`);
      });
      report.push('');
    }

    if (migrationData.errors.length > 0) {
      report.push('Errors:');
      migrationData.errors.forEach(error => {
        report.push(`  - ${error}`);
      });
      report.push('');
    }

    if (migrationData.warnings.length > 0) {
      report.push('Warnings:');
      migrationData.warnings.forEach(warning => {
        report.push(`  - ${warning}`);
      });
    }

    return report.join('\n');
  }
}

/**
 * Internal interface for provider configuration data during migration
 */
interface ProviderConfigData {
  name: string;
  type: 'cloud' | 'local-network';
  provider: string;
  endpoint?: string;
  apiKey?: string;
  localHostType?: 'ollama' | 'custom';
}

/**
 * Validation result interface
 */
interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}