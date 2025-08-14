import { TestBed } from '@angular/core/testing';
import { ModelManagerService } from './model-manager.service';
import { ModelConfig } from '../../../core/ai-agent';

describe('ModelManagerService', () => {
  let service: ModelManagerService;
  let localStorageSpy: jasmine.SpyObj<Storage>;

  const mockModels = [
    { 
      id: 'model-1', 
      provider: 'ollama', 
      model: 'llama3', 
      endpoint: 'http://localhost:11434',
      temperature: 0.7,
      maxTokens: 2048
    },
    { 
      id: 'model-2', 
      provider: 'openai', 
      model: 'gpt-4', 
      endpoint: 'https://api.openai.com/v1',
      temperature: 0.7,
      maxTokens: 4096,
      apiKey: 'test-api-key'
    }
  ];

  beforeEach(() => {
    // Set up spy for localStorage
    let store: { [key: string]: string } = {};
    localStorageSpy = jasmine.createSpyObj('localStorage', ['getItem', 'setItem', 'removeItem']);
    
    localStorageSpy.getItem.and.callFake((key: string) => {
      return store[key] || null;
    });
    
    localStorageSpy.setItem.and.callFake((key: string, value: string) => {
      store[key] = value;
    });
    
    localStorageSpy.removeItem.and.callFake((key: string) => {
      delete store[key];
    });

    TestBed.configureTestingModule({
      providers: [
        ModelManagerService,
        { provide: localStorage, useValue: localStorageSpy }
      ]
    });

    service = TestBed.inject(ModelManagerService);
    // Clear store before each test
    store = {};
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should add and retrieve models', async () => {
    const model: ModelConfig = {
      provider: 'ollama',
      model: 'llama3',
      endpoint: 'http://localhost:11434'
    };
    
    const addedModel = await service.addModel('test-model', model);
    expect(addedModel).toBeDefined();
    expect(addedModel.id).toBe('test-model');
    
    const models = await service.getAvailableModels();
    expect(models.length).toBe(1);
    expect(models[0].id).toBe('test-model');
  });

  it('should update model config', async () => {
    await service.addModel('test-model', {
      provider: 'ollama',
      model: 'llama3',
      endpoint: 'http://localhost:11434'
    });
    
    const updated = await service.updateModelConfig('test-model', {
      model: 'llama3:latest',
      temperature: 0.8
    });
    
    expect(updated).toBeDefined();
    expect(updated?.model).toBe('llama3:latest');
    expect(updated?.temperature).toBe(0.8);
    
    const model = await service.getModelConfig('test-model');
    expect(model?.model).toBe('llama3:latest');
  });

  it('should remove a model', async () => {
    await service.addModel('test-model', {
      provider: 'ollama',
      model: 'llama3',
      endpoint: 'http://localhost:11434'
    });
    
    const result = await service.removeModel('test-model');
    expect(result).toBeTrue();
    
    const models = await service.getAvailableModels();
    expect(models.length).toBe(0);
  });

  it('should set and get active model', async () => {
    await service.addModel('test-model', {
      provider: 'ollama',
      model: 'llama3',
      endpoint: 'http://localhost:11434'
    });
    
    const setResult = await service.setActiveModel('test-model');
    expect(setResult).toBeTrue();
    
    const activeModel = await service.getActiveModel();
    expect(activeModel?.id).toBe('test-model');
    
    // Test removing active model
    await service.setActiveModel(null);
    const noActiveModel = await service.getActiveModel();
    expect(noActiveModel).toBeNull();
  });

  it('should validate model config', async () => {
    // Test valid config
    let result = await service.validateModelConfig({
      provider: 'ollama',
      model: 'llama3',
      endpoint: 'http://localhost:11434'
    });
    expect(result.valid).toBeTrue();
    
    // Test invalid config (missing provider)
    result = await service.validateModelConfig({
      model: 'llama3',
      endpoint: 'http://localhost:11434'
    } as any);
    expect(result.valid).toBeFalse();
    
    // Test invalid temperature
    result = await service.validateModelConfig({
      provider: 'ollama',
      model: 'llama3',
      temperature: 2.5,
      maxTokens: -100
    });
    expect(result.valid).toBeFalse();
  });

  it('should get model capabilities', async () => {
    await service.addModel('test-model', {
      provider: 'openai',
      model: 'gpt-4-vision-preview',
      endpoint: 'https://api.openai.com/v1'
    });
    
    const capabilities = await service.getModelCapabilities('test-model');
    expect(capabilities).toBeDefined();
    expect(capabilities.supportsStreaming).toBeTrue();
    
    // Test with unknown model
    try {
      await service.getModelCapabilities('non-existent');
      fail('Should have thrown an error');
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it('should notify listeners when models change', async () => {
    const listener = jasmine.createSpy('listener');
    const removeListener = service.onModelsChanged(listener);
    
    // Add a model to trigger the listener
    await service.addModel('test-model', {
      provider: 'ollama',
      model: 'llama3',
      endpoint: 'http://localhost:11434'
    });
    
    // Listener should be called once after model addition
    expect(listener).toHaveBeenCalledTimes(1);
    
    // Remove the listener and test it's not called anymore
    removeListener();
    await service.addModel('another-model', {
      provider: 'ollama',
      model: 'llama2',
      endpoint: 'http://localhost:11434'
    });
    
    // Listener should still only have been called once
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
