import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModelConfigComponent } from './model-config.component';
import { ModelManagerService } from '../../../services/model-manager.service';
import { ModelConfig } from '../../../../core/ai-agent';

describe('ModelConfigComponent', () => {
  let component: ModelConfigComponent;
  let fixture: ComponentFixture<ModelConfigComponent>;
  let modelManagerSpy: jasmine.SpyObj<ModelManagerService>;

  const mockConfig: ModelConfig = {
    provider: 'ollama',
    model: 'llama3',
    endpoint: 'http://localhost:11434',
    temperature: 0.7,
    maxTokens: 2048
  };

  beforeEach(async () => {
    modelManagerSpy = jasmine.createSpyObj('ModelManagerService', ['updateModelConfig', 'validateModelConfig']);
    
    await TestBed.configureTestingModule({
      imports: [ModelConfigComponent],
      providers: [
        { provide: ModelManagerService, useValue: modelManagerSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ModelConfigComponent);
    component = fixture.componentInstance;
    component.modelConfig = { ...mockConfig };
    component.modelId = 'test-model';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with provided config', () => {
    expect(component.editableConfig).toEqual(mockConfig);
  });

  it('should update endpoint when provider changes', () => {
    component.onProviderChange();
    expect(component.editableConfig.endpoint).toBe('http://localhost:11434');
    
    component.editableConfig.provider = 'openai';
    component.onProviderChange();
    expect(component.editableConfig.endpoint).toBe('https://api.openai.com/v1');
  });

  it('should save config when valid', async () => {
    modelManagerSpy.validateModelConfig.and.returnValue(Promise.resolve({ valid: true }));
    modelManagerSpy.updateModelConfig.and.returnValue(Promise.resolve({ ...mockConfig, id: 'test-model' }));
    
    await component.saveConfig();
    
    expect(modelManagerSpy.updateModelConfig).toHaveBeenCalledWith('test-model', mockConfig);
  });

  it('should not save when validation fails', async () => {
    modelManagerSpy.validateModelConfig.and.returnValue(Promise.resolve({ 
      valid: false, 
      error: 'Invalid config' 
    }));
    
    await component.saveConfig();
    
    expect(modelManagerSpy.updateModelConfig).not.toHaveBeenCalled();
  });

  it('should reset to original config on cancel', () => {
    const originalConfig = { ...component.editableConfig };
    component.editableConfig.model = 'new-model';
    component.editableConfig.temperature = 1.5;
    
    component.cancelEdit();
    
    expect(component.editableConfig).toEqual(originalConfig);
  });
});
