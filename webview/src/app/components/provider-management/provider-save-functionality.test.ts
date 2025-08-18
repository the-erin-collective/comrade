/**
 * Integration test for provider saving functionality
 * Tests the implementation of task 6: Fix provider saving functionality
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { signal } from '@angular/core';

import { ProviderManagementComponent } from './provider-management.component';
import { ErrorHandlerService } from '../../services/error-handler.service';
import { ValidationService } from '../../services/validation.service';
import { ProviderManagerService } from '../../services/provider-manager.service';
import { ProviderFormData } from '../../interfaces/provider-agent.interface';

describe('ProviderManagementComponent - Save Functionality', () => {
  let component: ProviderManagementComponent;
  let fixture: ComponentFixture<ProviderManagementComponent>;
  let mockStore: jasmine.SpyObj<Store>;
  let mockErrorHandler: jasmine.SpyObj<ErrorHandlerService>;
  let mockValidationService: jasmine.SpyObj<ValidationService>;
  let mockProviderManager: jasmine.SpyObj<ProviderManagerService>;

  beforeEach(async () => {
    // Create spies
    mockStore = jasmine.createSpyObj('Store', ['select', 'dispatch']);
    mockErrorHandler = jasmine.createSpyObj('ErrorHandlerService', [
      'handleProviderError', 
      'handleValidationError', 
      'addInfo'
    ]);
    mockValidationService = jasmine.createSpyObj('ValidationService', [
      'validateApiKey', 
      'validateEndpoint'
    ]);
    mockProviderManager = jasmine.createSpyObj('ProviderManagerService', [
      'addProvider', 
      'updateProvider'
    ]);

    // Setup default store selectors
    mockStore.select.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [FormsModule, ProviderManagementComponent],
      providers: [
        { provide: Store, useValue: mockStore },
        { provide: ErrorHandlerService, useValue: mockErrorHandler },
        { provide: ValidationService, useValue: mockValidationService },
        { provide: ProviderManagerService, useValue: mockProviderManager }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProviderManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Form Validation', () => {
    it('should validate cloud provider form correctly', async () => {
      // Setup validation responses
      mockValidationService.validateApiKey.and.returnValue({
        isValid: true,
        errors: []
      });

      // Set up valid cloud provider form
      component.providerForm = {
        name: 'Test OpenAI',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test123456789012345678901234567890',
        endpoint: '',
        localHostType: 'ollama'
      };

      // Call private validation method through saveProvider
      component.saving.set(false);
      mockProviderManager.addProvider.and.returnValue(Promise.resolve());

      await component.saveProvider();

      expect(mockValidationService.validateApiKey).toHaveBeenCalledWith(
        'sk-test123456789012345678901234567890',
        'openai'
      );
      expect(mockProviderManager.addProvider).toHaveBeenCalled();
    });

    it('should validate local network provider form correctly', async () => {
      // Setup validation responses
      mockValidationService.validateEndpoint.and.returnValue({
        isValid: true,
        errors: []
      });

      // Set up valid local network provider form
      component.providerForm = {
        name: 'Test Ollama',
        type: 'local-network',
        provider: 'ollama',
        apiKey: '',
        endpoint: 'http://localhost:11434',
        localHostType: 'ollama'
      };

      component.saving.set(false);
      mockProviderManager.addProvider.and.returnValue(Promise.resolve());

      await component.saveProvider();

      expect(mockValidationService.validateEndpoint).toHaveBeenCalledWith('http://localhost:11434');
      expect(mockProviderManager.addProvider).toHaveBeenCalled();
    });

    it('should show validation errors for invalid form', async () => {
      // Setup validation to return errors
      mockValidationService.validateApiKey.and.returnValue({
        isValid: false,
        errors: ['Invalid API key format']
      });

      // Set up invalid cloud provider form
      component.providerForm = {
        name: '',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'invalid-key',
        endpoint: '',
        localHostType: 'ollama'
      };

      await component.saveProvider();

      expect(component.formErrors().length).toBeGreaterThan(0);
      expect(component.formErrors()).toContain('Invalid API key format');
      expect(mockProviderManager.addProvider).not.toHaveBeenCalled();
    });

    it('should require provider type', async () => {
      component.providerForm = {
        name: 'Test Provider',
        type: '' as any,
        provider: 'openai',
        apiKey: 'sk-test123456789012345678901234567890',
        endpoint: '',
        localHostType: 'ollama'
      };

      await component.saveProvider();

      expect(component.formErrors()).toContain('Provider type is required');
      expect(mockProviderManager.addProvider).not.toHaveBeenCalled();
    });

    it('should require API key for cloud providers', async () => {
      component.providerForm = {
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: '',
        endpoint: '',
        localHostType: 'ollama'
      };

      await component.saveProvider();

      expect(component.formErrors()).toContain('API key is required for cloud providers');
      expect(mockProviderManager.addProvider).not.toHaveBeenCalled();
    });

    it('should require endpoint for local network providers', async () => {
      component.providerForm = {
        name: 'Test Provider',
        type: 'local-network',
        provider: 'ollama',
        apiKey: '',
        endpoint: '',
        localHostType: 'ollama'
      };

      await component.saveProvider();

      expect(component.formErrors()).toContain('Network address is required for local providers');
      expect(mockProviderManager.addProvider).not.toHaveBeenCalled();
    });
  });

  describe('Provider Saving', () => {
    it('should add new provider successfully', async () => {
      // Setup valid form
      component.providerForm = {
        name: 'Test OpenAI',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test123456789012345678901234567890',
        endpoint: '',
        localHostType: 'ollama'
      };

      // Setup validation to pass
      mockValidationService.validateApiKey.and.returnValue({
        isValid: true,
        errors: []
      });

      // Setup provider manager to succeed
      mockProviderManager.addProvider.and.returnValue(Promise.resolve());

      await component.saveProvider();

      expect(mockProviderManager.addProvider).toHaveBeenCalledWith(component.providerForm);
      expect(component.successMessage()).toContain('Test OpenAI');
      expect(component.successMessage()).toContain('added successfully');
      expect(mockErrorHandler.addInfo).toHaveBeenCalled();
    });

    it('should update existing provider successfully', async () => {
      // Setup editing mode
      const existingProvider = {
        id: 'provider-1',
        name: 'Existing Provider',
        type: 'cloud' as const,
        provider: 'openai' as const,
        apiKey: 'old-key',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      component.editingProvider.set(existingProvider);

      // Setup valid form
      component.providerForm = {
        name: 'Updated Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-new123456789012345678901234567890',
        endpoint: '',
        localHostType: 'ollama'
      };

      // Setup validation to pass
      mockValidationService.validateApiKey.and.returnValue({
        isValid: true,
        errors: []
      });

      // Setup provider manager to succeed
      mockProviderManager.updateProvider.and.returnValue(Promise.resolve());

      await component.saveProvider();

      expect(mockProviderManager.updateProvider).toHaveBeenCalledWith(
        'provider-1',
        jasmine.objectContaining({
          name: 'Updated Provider',
          isActive: true,
          apiKey: 'sk-new123456789012345678901234567890'
        })
      );
      expect(component.successMessage()).toContain('Updated Provider');
      expect(component.successMessage()).toContain('updated successfully');
    });

    it('should auto-generate provider name when empty', async () => {
      // Setup form without name
      component.providerForm = {
        name: '',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test123456789012345678901234567890',
        endpoint: '',
        localHostType: 'ollama'
      };

      // Setup validation to pass
      mockValidationService.validateApiKey.and.returnValue({
        isValid: true,
        errors: []
      });

      // Setup provider manager to succeed
      mockProviderManager.addProvider.and.returnValue(Promise.resolve());

      await component.saveProvider();

      // Check that name was auto-generated
      expect(component.providerForm.name).toBe('OpenAI (Cloud)');
      expect(mockProviderManager.addProvider).toHaveBeenCalledWith(
        jasmine.objectContaining({
          name: 'OpenAI (Cloud)'
        })
      );
    });

    it('should handle provider manager errors', async () => {
      // Setup valid form
      component.providerForm = {
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test123456789012345678901234567890',
        endpoint: '',
        localHostType: 'ollama'
      };

      // Setup validation to pass
      mockValidationService.validateApiKey.and.returnValue({
        isValid: true,
        errors: []
      });

      // Setup provider manager to fail
      const error = new Error('Network error');
      mockProviderManager.addProvider.and.returnValue(Promise.reject(error));

      await component.saveProvider();

      expect(mockErrorHandler.handleProviderError).toHaveBeenCalledWith(
        error,
        'add',
        'Test Provider'
      );
      expect(component.formErrors().length).toBeGreaterThan(0);
      expect(component.formErrors()[0]).toContain('Failed to add provider');
    });

    it('should set saving state during operation', async () => {
      // Setup valid form
      component.providerForm = {
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test123456789012345678901234567890',
        endpoint: '',
        localHostType: 'ollama'
      };

      // Setup validation to pass
      mockValidationService.validateApiKey.and.returnValue({
        isValid: true,
        errors: []
      });

      // Setup provider manager with delay
      let resolvePromise: () => void;
      const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });
      mockProviderManager.addProvider.and.returnValue(promise);

      // Start save operation
      const savePromise = component.saveProvider();

      // Check that saving state is set
      expect(component.saving()).toBe(true);

      // Complete the operation
      resolvePromise!();
      await savePromise;

      // Check that saving state is cleared
      expect(component.saving()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should clear previous errors when starting new save', async () => {
      // Set initial errors
      component.formErrors.set(['Previous error']);
      component.successMessage.set('Previous success');

      // Setup invalid form to trigger new errors
      component.providerForm = {
        name: '',
        type: '' as any,
        provider: 'openai' as const,
        apiKey: '',
        endpoint: '',
        localHostType: 'ollama'
      };

      await component.saveProvider();

      // Check that previous messages were cleared and new errors set
      expect(component.formErrors()).not.toContain('Previous error');
      expect(component.successMessage()).toBeNull();
    });

    it('should show success message and close form after delay', async () => {
      jasmine.clock().install();

      // Setup valid form
      component.providerForm = {
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test123456789012345678901234567890',
        endpoint: '',
        localHostType: 'ollama'
      };

      // Setup validation to pass
      mockValidationService.validateApiKey.and.returnValue({
        isValid: true,
        errors: []
      });

      // Setup provider manager to succeed
      mockProviderManager.addProvider.and.returnValue(Promise.resolve());

      // Show form initially
      component.showProviderForm.set(true);

      await component.saveProvider();

      // Check success message is shown
      expect(component.successMessage()).toContain('added successfully');
      expect(component.showProviderForm()).toBe(true);

      // Advance time to trigger form close
      jasmine.clock().tick(1500);

      // Check form is closed
      expect(component.showProviderForm()).toBe(false);

      jasmine.clock().uninstall();
    });
  });

  describe('Form State Management', () => {
    it('should disable form fields during saving', () => {
      component.saving.set(true);
      fixture.detectChanges();

      const nameInput = fixture.nativeElement.querySelector('#providerName');
      const typeSelect = fixture.nativeElement.querySelector('#providerType');

      expect(nameInput?.disabled).toBe(true);
      expect(typeSelect?.disabled).toBe(true);
    });

    it('should disable submit button during saving', () => {
      component.saving.set(true);
      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button[type="submit"]');
      expect(submitButton?.disabled).toBe(true);
      expect(submitButton?.textContent).toContain('Adding...');
    });

    it('should disable submit button when form has errors', () => {
      component.formErrors.set(['Test error']);
      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button[type="submit"]');
      expect(submitButton?.disabled).toBe(true);
    });
  });
});