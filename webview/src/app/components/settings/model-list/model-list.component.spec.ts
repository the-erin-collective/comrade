import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ModelListComponent } from './model-list.component';
import { ModelManagerService } from '../../../services/model-manager.service';
import { ModelConfig } from '../../../../core/ai-agent';
import { of } from 'rxjs';

describe('ModelListComponent', () => {
  let component: ModelListComponent;
  let fixture: ComponentFixture<ModelListComponent>;
  let modelManagerSpy: jasmine.SpyObj<ModelManagerService>;

  const mockModels = [
    { id: 'model-1', provider: 'ollama', model: 'llama3', endpoint: 'http://localhost:11434' },
    { id: 'model-2', provider: 'openai', model: 'gpt-4', endpoint: 'https://api.openai.com/v1' }
  ];

  beforeEach(async () => {
    modelManagerSpy = jasmine.createSpyObj('ModelManagerService', [
      'getAvailableModels',
      'getActiveModel',
      'addModel',
      'removeModel',
      'setActiveModel',
      'onModelsChanged'
    ]);

    modelManagerSpy.getAvailableModels.and.returnValue(Promise.resolve(mockModels));
    modelManagerSpy.getActiveModel.and.returnValue(Promise.resolve(mockModels[0]));
    modelManagerSpy.onModelsChanged.and.returnValue(() => {});
    modelManagerSpy.addModel.and.callFake((id, config) => 
      Promise.resolve({ ...config, id })
    );
    modelManagerSpy.removeModel.and.returnValue(Promise.resolve(true));
    modelManagerSpy.setActiveModel.and.returnValue(Promise.resolve(true));

    await TestBed.configureTestingModule({
      imports: [ModelListComponent],
      providers: [
        { provide: ModelManagerService, useValue: modelManagerSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ModelListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load models on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    
    expect(modelManagerSpy.getAvailableModels).toHaveBeenCalled();
    expect(component.models().length).toBe(2);
    expect(component.activeModelId()).toBe('model-1');
  }));

  it('should select a model when clicked', () => {
    component.selectModel('model-2');
    expect(component.selectedModelId()).toBe('model-2');
  });

  it('should add a new model', fakeAsync(() => {
    component.addNewModel();
    tick();
    
    expect(modelManagerSpy.addModel).toHaveBeenCalled();
    expect(component.selectedModelId()).toBeDefined();
  }));

  it('should delete a model with confirmation', fakeAsync(() => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.deleteModel('model-1');
    tick();
    
    expect(modelManagerSpy.removeModel).toHaveBeenCalledWith('model-1');
  }));

  it('should not delete a model without confirmation', fakeAsync(() => {
    spyOn(window, 'confirm').and.returnValue(false);
    component.deleteModel('model-1');
    tick();
    
    expect(modelManagerSpy.removeModel).not.toHaveBeenCalled();
  }));

  it('should get selected model config', () => {
    component.selectModel('model-1');
    const config = component.getSelectedModelConfig();
    expect(config).toEqual(mockModels[0]);
  });

  it('should handle model changes through subscription', fakeAsync(() => {
    // Simulate a model change through the subscription
    const callback = modelManagerSpy.onModelsChanged.calls.mostRecent().args[0];
    callback();
    tick();
    
    expect(modelManagerSpy.getAvailableModels).toHaveBeenCalledTimes(2);
  }));
});
