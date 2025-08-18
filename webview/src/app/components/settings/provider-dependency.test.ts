import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { SettingsComponent } from './settings.component';
import { MessageService } from '../../services/message.service';
import { ValidationService } from '../../services/validation.service';
import { selectActiveProviders } from '../../state/provider/provider.selectors';
import { ProviderConfig } from '../../interfaces/provider-agent.interface';

describe('SettingsComponent - Provider Dependency Check', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let mockStore: jasmine.SpyObj<Store>;
  let mockMessageService: jasmine.SpyObj<MessageService>;
  let mockValidationService: jasmine.SpyObj<ValidationService>;

  const mockActiveProviders: ProviderConfig[] = [
    {
      id: 'provider-1',
      name: 'OpenAI',
      type: 'cloud',
      provider: 'openai',
      isActive: true,
      apiKey: 'test-key',
      createdAt: new Date(),
      updatedAt: new Date()
    } as CloudProvider
  ];

  beforeEach(async () => {
    const storeSpy = jasmine.createSpyObj('Store', ['select', 'dispatch']);
    const messageServiceSpy = jasmine.createSpyObj('MessageService', ['sendMessage'], {
      messages$: of()
    });
    const validationServiceSpy = jasmine.createSpyObj('ValidationService', ['validateProvider']);

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: Store, useValue: storeSpy },
        { provide: MessageService, useValue: messageServiceSpy },
        { provide: ValidationService, useValue: validationServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    mockStore = TestBed.inject(Store) as jasmine.SpyObj<Store>;
    mockMessageService = TestBed.inject(MessageService) as jasmine.SpyObj<MessageService>;
    mockValidationService = TestBed.inject(ValidationService) as jasmine.SpyObj<ValidationService>;
  });

  describe('hasActiveProviders', () => {
    it('should return true when active providers exist', () => {
      mockStore.select.and.returnValue(of(mockActiveProviders));
      
      const result = component.hasActiveProviders();
      
      expect(result).toBe(true);
      expect(mockStore.select).toHaveBeenCalled();
    });

    it('should return false when no active providers exist', () => {
      mockStore.select.and.returnValue(of([]));
      
      const result = component.hasActiveProviders();
      
      expect(result).toBe(false);
      expect(mockStore.select).toHaveBeenCalled();
    });

    it('should return false when providers is null', () => {
      mockStore.select.and.returnValue(of(null));
      
      const result = component.hasActiveProviders();
      
      expect(result).toBe(false);
    });
  });

  describe('getAddAgentTooltip', () => {
    it('should return provider requirement message when no providers exist', () => {
      mockStore.select.and.returnValue(of([]));
      
      const tooltip = component.getAddAgentTooltip();
      
      expect(tooltip).toBe('Configure at least one provider before adding agents');
    });

    it('should return add agent message when providers exist', () => {
      mockStore.select.and.returnValue(of(mockActiveProviders));
      
      const tooltip = component.getAddAgentTooltip();
      
      expect(tooltip).toBe('Add a new AI agent');
    });
  });

  describe('addNewAgent', () => {
    it('should show error message when no providers exist', () => {
      mockStore.select.and.returnValue(of([]));
      spyOn(component, 'showErrorMessage' as any);
      
      component.addNewAgent();
      
      expect((component as any).showErrorMessage).toHaveBeenCalledWith(
        'Please configure at least one provider before adding agents'
      );
      expect(component.showAgentForm()).toBe(false);
    });

    it('should open agent form when providers exist', () => {
      mockStore.select.and.returnValue(of(mockActiveProviders));
      spyOn(component, 'resetAgentForm' as any);
      spyOn(component, 'clearMessages' as any);
      
      component.addNewAgent();
      
      expect(component.editingAgent()).toBe(null);
      expect((component as any).resetAgentForm).toHaveBeenCalled();
      expect((component as any).clearMessages).toHaveBeenCalled();
      expect(component.showAgentForm()).toBe(true);
    });
  });
});