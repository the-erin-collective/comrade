import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProviderManagementComponent } from './provider-management.component';
import { Store } from '@ngrx/store';
import { ErrorHandlerService } from '../../services/error-handler.service';
import { ValidationService } from '../../services/validation.service';
import { ProviderManagerService } from '../../services/provider-manager.service';
import { of } from 'rxjs';

describe('ProviderManagementComponent - Error Handling', () => {
  let component: ProviderManagementComponent;
  let fixture: ComponentFixture<ProviderManagementComponent>;
  let mockStore: jasmine.SpyObj<Store>;
  let mockErrorHandler: jasmine.SpyObj<ErrorHandlerService>;
  let mockValidationService: jasmine.SpyObj<ValidationService>;
  let mockProviderManager: jasmine.SpyObj<ProviderManagerService>;

  beforeEach(async () => {
    const storeSpy = jasmine.createSpyObj('Store', ['select', 'dispatch']);
    const errorHandlerSpy = jasmine.createSpyObj('ErrorHandlerService', ['handleProviderError', 'handleValidationError']);
    const validationServiceSpy = jasmine.createSpyObj('ValidationService', ['validateApiKey', 'validateEndpoint']);
    const providerManagerSpy = jasmine.createSpyObj('ProviderManagerService', ['addProvider', 'updateProvider', 'testProviderConnection']);

    await TestBed.configureTestingModule({
      imports: [ProviderManagementComponent],
      providers: [
        { provide: Store, useValue: storeSpy },
        { provide: ErrorHandlerService, useValue: errorHandlerSpy },
        { provide: ValidationService, useValue: validationServiceSpy },
        { provide: ProviderManagerService, useValue: providerManagerSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProviderManagementComponent);
    component = fixture.componentInstance;
    mockStore = TestBed.inject(Store) as jasmine.SpyObj<Store>;
    mockErrorHandler = TestBed.inject(ErrorHandlerService) as jasmine.SpyObj<ErrorHandlerService>;
    mockValidationService = TestBed.inject(ValidationService) as jasmine.SpyObj<ValidationService>;
    mockProviderManager = TestBed.inject(ProviderManagerService) as jasmine.SpyObj<ProviderManagerService>;

    // Setup default store selectors
    mockStore.select.and.returnValue(of([]));
  });

  describe('clearError method', () => {
    it('should clear current error, form errors, and success message', () => {
      // Set some initial error state
      component.currentError.set('Test error');
      component.formErrors.set(['Error 1', 'Error 2']);
      component.successMessage.set('Success message');

      // Call clearError
      component.clearError();

      // Verify all error states are cleared
      expect(component.currentError()).toBeNull();
      expect(component.formErrors()).toEqual([]);
      expect(component.successMessage()).toBeNull();
    });
  });

  describe('showError method', () => {
    it('should clear existing errors and set new error message', () => {
      // Set some initial state
      component.currentError.set('Old error');
      component.formErrors.set(['Old error']);
      component.successMessage.set('Success message');

      // Call showError with new message
      const newError = 'New error message';
      component.showError(newError);

      // Verify new error is set and old state is cleared
      expect(component.currentError()).toBe(newError);
      expect(component.formErrors()).toEqual([newError]);
      expect(component.successMessage()).toBeNull();
    });

    it('should prevent multiple simultaneous error messages', () => {
      // Show first error
      component.showError('First error');
      expect(component.currentError()).toBe('First error');
      expect(component.formErrors()).toEqual(['First error']);

      // Show second error - should replace first
      component.showError('Second error');
      expect(component.currentError()).toBe('Second error');
      expect(component.formErrors()).toEqual(['Second error']);
    });
  });

  describe('form validation error handling', () => {
    beforeEach(() => {
      // Setup validation service mocks
      mockValidationService.validateApiKey.and.returnValue({
        isValid: false,
        errors: ['Invalid API key format']
      });
      mockValidationService.validateEndpoint.and.returnValue({
        isValid: false,
        errors: ['Invalid endpoint URL']
      });
    });

    it('should show single focused error for missing provider type', () => {
      component.providerForm = {
        name: '',
        type: 'cloud' as any, // Will be set to empty in test
        provider: 'openai',
        apiKey: 'test-key',
        endpoint: '',
        localHostType: 'ollama'
      };
      // Manually set to empty to test validation
      (component.providerForm as any).type = '';

      const isValid = (component as any).validateProviderForm();

      expect(isValid).toBeFalse();
      expect(component.currentError()).toBe('Provider type is required');
      expect(component.formErrors()).toEqual(['Provider type is required']);
    });

    it('should show single focused error for missing cloud provider selection', () => {
      component.providerForm = {
        name: '',
        type: 'cloud',
        provider: 'openai' as any, // Will be set to empty in test
        apiKey: 'test-key',
        endpoint: '',
        localHostType: 'ollama'
      };
      // Manually set to empty to test validation
      (component.providerForm as any).provider = '';

      const isValid = (component as any).validateProviderForm();

      expect(isValid).toBeFalse();
      expect(component.currentError()).toBe('Cloud provider selection is required');
      expect(component.formErrors()).toEqual(['Cloud provider selection is required']);
    });

    it('should show single focused error for missing API key', () => {
      component.providerForm = {
        name: '',
        type: 'cloud',
        provider: 'openai',
        apiKey: '', // Missing API key
        endpoint: '',
        localHostType: 'ollama'
      };

      const isValid = (component as any).validateProviderForm();

      expect(isValid).toBeFalse();
      expect(component.currentError()).toBe('API key is required for cloud providers');
      expect(component.formErrors()).toEqual(['API key is required for cloud providers']);
    });

    it('should show only the first API key validation error', () => {
      component.providerForm = {
        name: '',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'invalid-key',
        endpoint: '',
        localHostType: 'ollama'
      };

      const isValid = (component as any).validateProviderForm();

      expect(isValid).toBeFalse();
      expect(component.currentError()).toBe('Invalid API key format');
      expect(component.formErrors()).toEqual(['Invalid API key format']);
      expect(mockValidationService.validateApiKey).toHaveBeenCalledWith('invalid-key', 'openai');
    });

    it('should show single focused error for missing local host type', () => {
      component.providerForm = {
        name: '',
        type: 'local-network',
        provider: 'ollama',
        apiKey: '',
        endpoint: 'http://localhost:11434',
        localHostType: 'ollama' as any // Will be set to empty in test
      };
      // Manually set to empty to test validation
      (component.providerForm as any).localHostType = '';

      const isValid = (component as any).validateProviderForm();

      expect(isValid).toBeFalse();
      expect(component.currentError()).toBe('Local host type is required');
      expect(component.formErrors()).toEqual(['Local host type is required']);
    });

    it('should show single focused error for missing endpoint', () => {
      component.providerForm = {
        name: '',
        type: 'local-network',
        provider: 'ollama',
        apiKey: '',
        endpoint: '', // Missing endpoint
        localHostType: 'ollama'
      };

      const isValid = (component as any).validateProviderForm();

      expect(isValid).toBeFalse();
      expect(component.currentError()).toBe('Network address is required for local providers');
      expect(component.formErrors()).toEqual(['Network address is required for local providers']);
    });

    it('should show only the first endpoint validation error', () => {
      component.providerForm = {
        name: '',
        type: 'local-network',
        provider: 'ollama',
        apiKey: '',
        endpoint: 'invalid-url',
        localHostType: 'ollama'
      };

      const isValid = (component as any).validateProviderForm();

      expect(isValid).toBeFalse();
      expect(component.currentError()).toBe('Invalid endpoint URL');
      expect(component.formErrors()).toEqual(['Invalid endpoint URL']);
      expect(mockValidationService.validateEndpoint).toHaveBeenCalledWith('invalid-url');
    });
  });

  describe('error clearing on user input', () => {
    it('should clear errors when user starts typing in name field', () => {
      // Set initial error
      component.showError('Test error');
      expect(component.currentError()).toBe('Test error');

      // Simulate user input
      const event = { target: { value: 'new name' } } as any;
      component.onNameInput(event);

      // Error should be cleared
      expect(component.currentError()).toBeNull();
    });

    it('should clear errors when user starts typing in API key field', () => {
      // Set initial error
      component.showError('Test error');
      expect(component.currentError()).toBe('Test error');

      // Simulate user input
      const event = { target: { value: 'new-api-key' } } as any;
      component.onApiKeyInput(event);

      // Error should be cleared
      expect(component.currentError()).toBeNull();
    });

    it('should clear errors when user starts typing in endpoint field', () => {
      // Set initial error
      component.showError('Test error');
      expect(component.currentError()).toBe('Test error');

      // Simulate user input
      const event = { target: { value: 'http://localhost:8080' } } as any;
      component.onEndpointInput(event);

      // Error should be cleared
      expect(component.currentError()).toBeNull();
    });

    it('should clear errors when user changes provider type', () => {
      // Set initial error
      component.showError('Test error');
      expect(component.currentError()).toBe('Test error');

      // Change provider type
      component.onProviderTypeChange('cloud');

      // Error should be cleared
      expect(component.currentError()).toBeNull();
    });

    it('should clear errors when user changes local host type', () => {
      // Set initial error
      component.showError('Test error');
      expect(component.currentError()).toBe('Test error');

      // Change local host type
      component.onLocalHostTypeChange('ollama');

      // Error should be cleared
      expect(component.currentError()).toBeNull();
    });
  });

  describe('form initialization', () => {
    it('should clear errors when showing add provider form', () => {
      // Set initial error
      component.showError('Test error');
      expect(component.currentError()).toBe('Test error');

      // Show add provider form
      component.showAddProviderForm();

      // Error should be cleared
      expect(component.currentError()).toBeNull();
    });

    it('should clear errors when editing provider', () => {
      // Set initial error
      component.showError('Test error');
      expect(component.currentError()).toBe('Test error');

      // Edit provider
      const mockProvider = {
        id: 'test-id',
        name: 'Test Provider',
        type: 'cloud' as const,
        provider: 'openai' as const,
        apiKey: 'test-key',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      component.editProvider(mockProvider);

      // Error should be cleared
      expect(component.currentError()).toBeNull();
    });

    it('should clear errors when closing provider form', () => {
      // Set initial error
      component.showError('Test error');
      expect(component.currentError()).toBe('Test error');

      // Close provider form
      component.closeProviderForm();

      // Error should be cleared
      expect(component.currentError()).toBeNull();
    });
  });
});