import { Injectable, signal } from '@angular/core';
import { ModelConfig } from '../interfaces/model-config.interface';
import { v4 as uuidv4 } from 'uuid';

type ModelConfigWithId = ModelConfig & { id: string };

@Injectable({
  providedIn: 'root'
})
export class ModelManagerService {
  private readonly STORAGE_KEY = 'comrade_model_configs';
  private readonly ACTIVE_MODEL_KEY = 'comrade_active_model_id';
  
  private models = signal<ModelConfigWithId[]>([]);
  private changeListeners: Array<() => void> = [];
  
  constructor() {
    this.initialize();
  }
  
  private initialize() {
    const savedModels = localStorage.getItem(this.STORAGE_KEY);
    if (savedModels) {
      try {
        const parsed = JSON.parse(savedModels);
        this.models.set(Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        console.error('Failed to parse saved models', e);
        this.models.set([]);
      }
    }
    
    // Add default models if none exist
    if (this.models().length === 0) {
      this.addDefaultModels();
    }
  }
  
  private addDefaultModels() {
    const defaultModels: ModelConfigWithId[] = [
      {
        id: 'default-ollama',
        name: 'Llama 3',
        provider: 'ollama',
        model: 'llama3',
        endpoint: 'http://localhost:11434',
        temperature: 0.7,
        maxTokens: 2048
      },
      {
        id: 'default-openai',
        name: 'GPT-4',
        provider: 'openai',
        model: 'gpt-4',
        endpoint: 'https://api.openai.com/v1',
        temperature: 0.7,
        maxTokens: 4096
      },
      {
        id: 'default-anthropic',
        name: 'Claude 2',
        provider: 'anthropic',
        model: 'claude-2',
        endpoint: 'https://api.anthropic.com/v1',
        temperature: 0.7,
        maxTokens: 4096
      }
    ];
    
    this.models.set([...defaultModels]);
    this.saveToStorage();
  }
  
  private saveToStorage() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.models()));
    this.notifyListeners();
  }
  
  private notifyListeners() {
    this.changeListeners.forEach(listener => listener());
  }
  
  onModelsChanged(callback: () => void): () => void {
    this.changeListeners.push(callback);
    return () => {
      const index = this.changeListeners.indexOf(callback);
      if (index > -1) {
        this.changeListeners.splice(index, 1);
      }
    };
  }
  
  async getAvailableModels(): Promise<ModelConfigWithId[]> {
    return [...this.models()];
  }
  
  async getModelConfig(modelId: string): Promise<ModelConfigWithId | null> {
    return this.models().find(m => m.id === modelId) || null;
  }
  
  async addModel(modelId: string, config: ModelConfig): Promise<ModelConfigWithId> {
    const existing = this.models().find(m => m.id === modelId);
    if (existing) {
      throw new Error(`Model with ID ${modelId} already exists`);
    }
    
    const newModel = { ...config, id: modelId };
    this.models.update(models => [...models, newModel]);
    this.saveToStorage();
    return newModel;
  }
  
  async updateModelConfig(modelId: string, updates: Partial<ModelConfig>): Promise<ModelConfigWithId | null> {
    const modelIndex = this.models().findIndex(m => m.id === modelId);
    if (modelIndex === -1) return null;
    
    const updatedModel = { ...this.models()[modelIndex], ...updates };
    this.models.update(models => {
      const newModels = [...models];
      newModels[modelIndex] = updatedModel;
      return newModels;
    });
    
    this.saveToStorage();
    return updatedModel;
  }
  
  async removeModel(modelId: string): Promise<boolean> {
    const initialLength = this.models().length;
    this.models.update(models => models.filter(m => m.id !== modelId));
    
    // If we removed a model, save and notify
    if (this.models().length < initialLength) {
      // If we removed the active model, clear it
      const activeModelId = localStorage.getItem(this.ACTIVE_MODEL_KEY);
      if (activeModelId === modelId) {
        localStorage.removeItem(this.ACTIVE_MODEL_KEY);
      }
      
      this.saveToStorage();
      return true;
    }
    
    return false;
  }
  
  async setActiveModel(modelId: string | null): Promise<boolean> {
    if (modelId === null) {
      localStorage.removeItem(this.ACTIVE_MODEL_KEY);
      return true;
    }
    
    const modelExists = this.models().some(m => m.id === modelId);
    if (!modelExists) return false;
    
    localStorage.setItem(this.ACTIVE_MODEL_KEY, modelId);
    this.notifyListeners();
    return true;
  }
  
  async getActiveModel(): Promise<ModelConfigWithId | null> {
    const activeModelId = localStorage.getItem(this.ACTIVE_MODEL_KEY);
    if (!activeModelId) return null;
    
    return this.getModelConfig(activeModelId);
  }
  
  async validateModelConfig(config: ModelConfig): Promise<{ valid: boolean; error?: string }> {
    if (!config.provider) {
      return { valid: false, error: 'Provider is required' };
    }
    
    if (!config.model) {
      return { valid: false, error: 'Model name is required' };
    }
    
    // Provider-specific validations
    if (config.provider === 'openai' && !config.apiKey) {
      return { valid: false, error: 'API key is required for OpenAI' };
    }
    
    if (config.provider === 'anthropic' && !config.apiKey) {
      return { valid: false, error: 'API key is required for Anthropic' };
    }
    
    // Validate temperature range
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      return { valid: false, error: 'Temperature must be between 0 and 2' };
    }
    
    // Validate max tokens
    if (config.maxTokens !== undefined && config.maxTokens <= 0) {
      return { valid: false, error: 'Max tokens must be greater than 0' };
    }
    
    return { valid: true };
  }
  
  async getModelCapabilities(modelId: string): Promise<{
    hasVision: boolean;
    hasToolUse: boolean;
    maxInputTokens: number;
    supportsStreaming: boolean;
  }> {
    const model = await this.getModelConfig(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }
    
    // Default capabilities
    const capabilities = {
      hasVision: false,
      hasToolUse: false,
      maxInputTokens: 4096,
      supportsStreaming: true
    };
    
    // Provider/model specific capabilities
    switch (model.provider) {
      case 'openai':
        capabilities.hasToolUse = model.model.includes('gpt-4');
        capabilities.hasVision = model.model.includes('vision');
        capabilities.maxInputTokens = model.model.includes('gpt-4') ? 8192 : 4096;
        break;
        
      case 'anthropic':
        capabilities.hasToolUse = true;
        capabilities.maxInputTokens = 100000; // Claude has large context windows
        break;
        
      case 'ollama':
        // Ollama models vary, but many support tools and vision
        capabilities.hasToolUse = true;
        capabilities.hasVision = model.model.includes('vision');
        break;
    }
    
    return capabilities;
  }
}
