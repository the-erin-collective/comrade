import { ModelConfig, ModelCapabilities } from './model-adapters/base-model-adapter';
import { ModelAdapter } from './model-adapters';
import { Tool } from './types';

/**
 * Manages model configurations and model switching
 */
export class ModelManager {
  private modelConfigs: Map<string, ModelConfig> = new Map();
  private activeModelId: string | null = null;
  private modelAdapters: Map<string, ModelAdapter> = new Map();
  private defaultConfig: Partial<ModelConfig> = {
    temperature: 0.7,
    maxTokens: 2000,
  };

  constructor() {
    this.initializeBuiltInConfigs();
  }

  /**
   * Register a model configuration
   */
  registerModel(id: string, config: ModelConfig): void {
    const fullConfig: ModelConfig = {
      ...this.defaultConfig,
      ...config,
    };
    this.modelConfigs.set(id, fullConfig);
    
    // If this is the first model, set it as active
    if (this.modelConfigs.size === 1) {
      this.activeModelId = id;
    }
  }

  /**
   * Get all registered model configurations
   */
  getModelConfigs(): { id: string; config: ModelConfig }[] {
    return Array.from(this.modelConfigs.entries()).map(([id, config]) => ({
      id,
      config,
    }));
  }

  /**
   * Get the active model configuration
   */
  getActiveModel(): { id: string; config: ModelConfig } | null {
    if (!this.activeModelId) return null;
    
    const config = this.modelConfigs.get(this.activeModelId);
    return config ? { id: this.activeModelId, config } : null;
  }

  /**
   * Switch to a different model
   */
  async switchModel(modelId: string, adapter: ModelAdapter): Promise<boolean> {
    const config = this.modelConfigs.get(modelId);
    if (!config) {
      throw new Error(`Model configuration not found: ${modelId}`);
    }

    try {
      // Validate the model configuration
      const isValid = await adapter.validateConfig(config);
      if (!isValid) {
        throw new Error(`Invalid configuration for model: ${modelId}`);
      }

      // Initialize the model with the new configuration
      await adapter.initialize(config);
      
      // Update active model
      this.activeModelId = modelId;
      this.modelAdapters.set(modelId, adapter);
      
      return true;
    } catch (error) {
      console.error(`Failed to switch to model ${modelId}:`, error);
      return false;
    }
  }

  /**
   * Get the capabilities of a specific model
   */
  async getModelCapabilities(
    modelId: string,
    adapter: ModelAdapter
  ): Promise<ModelCapabilities> {
    try {
      const config = this.modelConfigs.get(modelId);
      if (!config) {
        throw new Error(`Model configuration not found: ${modelId}`);
      }

      await adapter.initialize(config);
      return adapter.getCapabilities();
    } catch (error) {
      console.error(`Failed to get capabilities for model ${modelId}:`, error);
      throw error;
    }
  }

  /**
   * Validate if a model supports the required tools
   */
  async validateModelTools(
    modelId: string,
    adapter: ModelAdapter,
    tools: Tool[]
  ): Promise<{ valid: boolean; unsupportedTools: string[] }> {
    const capabilities = await this.getModelCapabilities(modelId, adapter);
    
    if (!capabilities.supportsToolCalling && tools.length > 0) {
      return {
        valid: false,
        unsupportedTools: tools.map(t => t.name),
      };
    }
    
    return { valid: true, unsupportedTools: [] };
  }

  /**
   * Initialize with some common model configurations
   */
  private initializeBuiltInConfigs(): void {
    // Ollama models
    this.registerModel('ollama:llama3', {
      name: 'Llama 3',
      provider: 'ollama',
      endpoint: 'http://localhost:11434',
    } as any);

    this.registerModel('ollama:mistral', {
      name: 'Mistral',
      provider: 'ollama',
      endpoint: 'http://localhost:11434',
    } as any);

    // OpenAI models
    this.registerModel('openai:gpt-4', {
      name: 'GPT-4',
      provider: 'openai',
      temperature: 0.7,
      maxTokens: 4000,
    } as any);

    this.registerModel('openai:gpt-3.5-turbo', {
      name: 'GPT-3.5 Turbo',
      provider: 'openai',
      temperature: 0.7,
      maxTokens: 4000,
    } as any);

    // Anthropic models
    this.registerModel('anthropic:claude-2', {
      name: 'Claude 2',
      provider: 'anthropic',
      temperature: 0.7,
      maxTokens: 100000,
    } as any);
  }

  /**
   * Add a custom model configuration
   */
  addCustomConfig(id: string, config: Omit<ModelConfig, 'name' | 'provider'> & { name: string; provider: string }): void {
    this.registerModel(id, config);
  }

  /**
   * Remove a model configuration
   */
  removeModelConfig(id: string): boolean {
    if (this.activeModelId === id) {
      this.activeModelId = null;
    }
    return this.modelConfigs.delete(id);
  }
}
