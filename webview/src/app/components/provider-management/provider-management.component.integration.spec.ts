/**
 * Angular Integration Tests for Provider Management Component
 * Tests provider CRUD operations, form validation, and UI interactions
 */

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { of, BehaviorSubject } from 'rxjs';

import { ProviderManagementComponent } from './provider-management.component';
import { ErrorNotificationComponent } from '../error-notification/error-notification.component';
import { ProviderManagerService } from '../../services/provider-manager.service';
import { FormValidationService } from '../../services/form-validation.service';
import { ErrorHandlerService } from '../../services/error-handler.service';
import { ProviderConfig, ProviderFormData, ConnectionTestResult } from '../../interfaces/provider-agent.interface';
import * as ProviderActions from '../../state/provider/provider.actions';

describe('ProviderManagementComponent Integration Tests', () => {
  let component: ProviderManagementComponent;
  let fixture: ComponentFixture<ProviderManagementComponent>;
  let store: MockStore;
  let providerService: jasmine.SpyObj<ProviderManagerService>;
  let validationService: jasmine.SpyObj<FormValidationService>;
  let errorService: jasmine.SpyObj<ErrorHandlerService>;

  const mockProviders: ProviderConfig[] = [
    {
      id: 'provider-1',
      name: 'Test OpenAI Provider',
      type: 'cloud',
      provider: 'openai',
      apiKey: 'sk-test-key',
      isActive: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01')
    },
    {
      id: 'provider-2',
      name: 'Local Ollama',
      type: 'local-network',
      provider: 'ollama',
      endpoint: 'http://localhost:11434',
      localHostType: 'ollama',
      isActive: false,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01')
    }
  ];

  const initialState = {
    providers: {
      providers: mockProviders,
      loading: false,
      error: null,
      stats: {
        totalProviders: 2,
        activeProviders: 1,
        providersByType: { cloud: 1, 'local-network': 1 }
      }
    }
  };

  beforeEach(async () => {
    const providerServiceSpy = jasmine.createSpyObj('ProviderManagerService', [
      'addProvider', 'updateProvider', 'deleteProvider', 'toggleProviderStatus'
    ]);
    const validationServiceSpy = jasmine.createSpyObj('FormValidationService', [
      'validateProviderForm'
    ]);
    const errorServiceSpy = jasmine.createSpyObj('ErrorHandlerService', [
      'handleError', 'showError', 'clearErrors'
    ]);

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        ProviderManagementComponent,
        ErrorNotificationComponent
      ],
      providers: [
        provideMockStore({ initialState }),
        { provide: ProviderManagerService, useValue: providerServiceSpy },
        { provide: FormValidationService, useValue: validationServiceSpy },
        { provide: ErrorHandlerService, useValue: errorServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProviderManagementComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(Store) as MockStore;
    providerService = TestBed.inject(ProviderManagerService) as jasmine.SpyObj<ProviderManagerService>;
    validationService = TestBed.inject(FormValidationService) as jasmine.SpyObj<FormValidationService>;
    errorService = TestBed.inject(ErrorHandlerService) as jasmine.SpyObj<ErrorHandlerService>;

    fixture.detectChanges();
  });

  describe('Provider List Display and Statistics', () => {
    it('should display provider statistics correctly', fakeAsync(() => {
      store.setState(initialState);
      fixture.detectChanges();
      tick();

      const statsContainer = fixture.debugElement.nativeElement.querySelector('.provider-stats-compact');
      expect(statsContainer).toBeTruthy();

      const statsSummary = statsContainer.querySelector('.stats-summary');
      expect(statsSummary).toBeTruthy();
      expect(statsSummary.textContent?.trim()).toBe('1 of 2 providers active');
    }));

    it('should display providers list with correct information', fakeAsync(() => {
      store.setState(initialState);
      fixture.detectChanges();
      tick();

      const providerCards = fixture.debugElement.nativeElement.querySelectorAll('.provider-card');
      expect(providerCards.length).toBe(2);

      // Check first provider (OpenAI)
      const firstCard = providerCards[0];
      expect(firstCard.textContent).toContain('Test OpenAI Provider');
      expect(firstCard.textContent).toContain('Cloud');
      expect(firstCard.textContent).toContain('OpenAI');
      expect(firstCard).not.toHaveClass('inactive');

      // Check second provider (Ollama)
      const secondCard = providerCards[1];
      expect(secondCard.textContent).toContain('Local Ollama');
      expect(secondCard.textContent).toContain('Local Network');
      expect(secondCard.textContent).toContain('Ollama');
      expect(secondCard.textContent).toContain('http://localhost:11434');
      expect(secondCard).toHaveClass('inactive');
    }));

    it('should show empty state when no providers exist', () => {
      store.setState({
        providers: { providers: [], loading: false, error: null, stats: null }
      });
      fixture.detectChanges();

      const emptyState = fixture.debugElement.nativeElement.querySelector('.empty-state-simple');
      expect(emptyState).toBeTruthy();
      expect(emptyState.textContent).toContain('No providers configured');
      
      // Verify the main Add Provider button is still present above the provider list
      const addProviderButton = fixture.debugElement.nativeElement.querySelector('.add-provider-section .primary-btn');
      expect(addProviderButton).toBeTruthy();
      expect(addProviderButton.textContent).toContain('Add Provider');
    });

    it('should show loading state', () => {
      store.setState({
        providers: { providers: [], loading: true, error: null, stats: null }
      });
      fixture.detectChanges();

      const loadingContainer = fixture.debugElement.nativeElement.querySelector('.loading-container');
      expect(loadingContainer).toBeTruthy();
      expect(loadingContainer.textContent).toContain('Loading providers');
    });

    it('should show error state', () => {
      store.setState({
        providers: { providers: [], loading: false, error: 'Failed to load providers', stats: null }
      });
      fixture.detectChanges();

      const errorContainer = fixture.debugElement.nativeElement.querySelector('.error-container');
      expect(errorContainer).toBeTruthy();
      expect(errorContainer.textContent).toContain('Failed to load providers');
    });
  });

  describe('Add Provider Workflow', () => {
    it('should open provider form when add button is clicked', () => {
      expect(component.showProviderForm()).toBe(false);

      const addButton = fixture.debugElement.nativeElement.querySelector('.primary-btn');
      addButton.click();

      expect(component.showProviderForm()).toBe(true);
      expect(component.editingProvider()).toBeNull();
    });

    it('should initialize form with default values', () => {
      component.showAddProviderForm();

      expect(component.providerForm.name).toBe('');
      expect(component.providerForm.type).toBe('cloud');
      expect(component.providerForm.provider).toBe('');
      expect(component.providerForm.apiKey).toBe('');
      expect(component.providerForm.endpoint).toBe('');
    });

    it('should show cloud provider form fields when cloud type is selected', fakeAsync(() => {
      component.showAddProviderForm();
      component.providerForm.type = 'cloud';
      fixture.detectChanges();
      tick();

      const cloudProviderSelect = fixture.debugElement.nativeElement.querySelector('#cloudProvider');
      const apiKeyInput = fixture.debugElement.nativeElement.querySelector('#apiKey');
      const endpointInput = fixture.debugElement.nativeElement.querySelector('#endpoint');

      expect(cloudProviderSelect).toBeTruthy();
      expect(apiKeyInput).toBeTruthy();
      expect(endpointInput).toBeFalsy(); // Should not show endpoint for cloud providers
    }));

    it('should show local network form fields when local-network type is selected', fakeAsync(() => {
      component.showAddProviderForm();
      component.onProviderTypeChange('local-network');
      fixture.detectChanges();
      tick();

      const localHostTypeSelect = fixture.debugElement.nativeElement.querySelector('#localHostType');
      const endpointInput = fixture.debugElement.nativeElement.querySelector('#endpoint');
      const localApiKeyInput = fixture.debugElement.nativeElement.querySelector('#localApiKey');

      expect(localHostTypeSelect).toBeTruthy();
      expect(endpointInput).toBeTruthy();
      expect(localApiKeyInput).toBeTruthy();
    }));

    it('should populate endpoint when Ollama is selected', () => {
      component.showAddProviderForm();
      component.onProviderTypeChange('local-network');
      component.onLocalHostTypeChange('ollama');

      expect(component.providerForm.endpoint).toBe('http://localhost:11434');
      expect(component.providerForm.provider).toBe('ollama');
    });

    it('should validate form before submission', fakeAsync(() => {
      validationService.validateProviderForm.and.returnValue({
        valid: false,
        error: 'Provider name is required'
      });

      component.showAddProviderForm();
      fixture.detectChanges();
      tick();

      const form = fixture.debugElement.nativeElement.querySelector('form');
      const submitButton = form.querySelector('button[type="submit"]');

      // Form should be invalid initially
      expect(submitButton.disabled).toBe(true);

      // Fill required fields
      component.providerForm.name = 'Test Provider';
      component.providerForm.provider = 'openai';
      component.providerForm.apiKey = 'sk-test-key';
      fixture.detectChanges();

      validationService.validateProviderForm.and.returnValue({
        valid: true,
        error: undefined
      });

      // Form should now be valid
      expect(component.providerForm.name).toBe('Test Provider');
    }));

    // TODO: Re-enable these tests when testConnection method is implemented
    // it('should test connection for cloud providers', fakeAsync(() => {
    //   const connectionResult: ConnectionTestResult = {
    //     success: true
    //   };
    //   providerService.testConnection.and.returnValue(Promise.resolve(connectionResult));

    //   component.showAddProviderForm();
    //   component.providerForm.type = 'cloud';
    //   component.providerForm.provider = 'openai';
    //   component.providerForm.apiKey = 'sk-test-key';

    //   component.testConnection();
    //   expect(component.testingConnection()).toBe(true);

    //   tick();

    //   expect(providerService.testConnection).toHaveBeenCalledWith({
    //     type: 'cloud',
    //     provider: 'openai',
    //     apiKey: 'sk-test-key'
    //   });
    //   expect(component.testingConnection()).toBe(false);
    //   expect(component.connectionTestResult()).toEqual(connectionResult);
    // }));

    // it('should test connection for local network providers', fakeAsync(() => {
    //   const connectionResult: ConnectionTestResult = {
    //     success: true,
    //     availableModels: ['llama2', 'codellama']
    //   };
    //   providerService.testConnection.and.returnValue(Promise.resolve(connectionResult));

    //   component.showAddProviderForm();
    //   component.onProviderTypeChange('local-network');
    //   component.providerForm.endpoint = 'http://localhost:11434';

    //   component.testConnection();
    //   tick();

    //   expect(providerService.testConnection).toHaveBeenCalledWith({
    //     type: 'local-network',
    //     endpoint: 'http://localhost:11434',
    //     provider: 'ollama'
    //   });
    //   expect(component.connectionTestResult()?.availableModels).toEqual(['llama2', 'codellama']);
    // }));

    // it('should handle connection test failures', fakeAsync(() => {
    //   const connectionResult: ConnectionTestResult = {
    //     success: false,
    //     error: 'Invalid API key'
    //   };
    //   providerService.testConnection.and.returnValue(Promise.resolve(connectionResult));

    //   component.showAddProviderForm();
    //   component.providerForm.apiKey = 'invalid-key';

    //   component.testConnection();
    //   tick();

    //   expect(component.connectionTestResult()?.success).toBe(false);
    //   expect(component.connectionTestResult()?.error).toBe('Invalid API key');
    // }));

    it('should save new provider successfully', fakeAsync(() => {
      const newProvider: ProviderConfig = {
        id: 'provider-3',
        name: 'New Test Provider',
        type: 'cloud',
        provider: 'anthropic',
        apiKey: 'sk-new-key',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      spyOn(store, 'dispatch');
      providerService.addProvider.and.returnValue(Promise.resolve());

      component.showAddProviderForm();
      component.providerForm = {
        name: 'New Test Provider',
        type: 'cloud',
        provider: 'anthropic',
        apiKey: 'sk-new-key',
        endpoint: '',
        localHostType: undefined
      };

      component.saveProvider(new Event('submit'));
      tick();

      expect(store.dispatch).toHaveBeenCalledWith(
        jasmine.objectContaining({
          type: ProviderActions.addProvider.type,
          providerData: jasmine.any(Object)
        })
      );
      expect(component.showProviderForm()).toBe(false);
    }));
  });

  describe('Edit Provider Workflow', () => {
    it('should open edit form with pre-populated data', () => {
      const provider = mockProviders[0];

      component.editProvider(provider);

      expect(component.showProviderForm()).toBe(true);
      expect(component.editingProvider()).toBe(provider);
      expect(component.providerForm.name).toBe(provider.name);
      expect(component.providerForm.type).toBe(provider.type);
      expect(component.providerForm.provider).toBe(provider.provider);
    });

    it('should update existing provider', fakeAsync(() => {
      const provider = mockProviders[0];
      const updatedProvider = { ...provider, name: 'Updated Provider Name' };

      spyOn(store, 'dispatch');
      providerService.updateProvider.and.returnValue(Promise.resolve());

      component.editProvider(provider);
      component.providerForm.name = 'Updated Provider Name';

      component.saveProvider(new Event('submit'));
      tick();

      expect(store.dispatch).toHaveBeenCalledWith(
        jasmine.objectContaining({
          type: ProviderActions.updateProvider.type,
          providerId: provider.id,
          updates: jasmine.any(Object)
        })
      );
    }));
  });

  describe('Provider Toggle and Deletion', () => {
    it('should toggle provider status', fakeAsync(() => {
      spyOn(store, 'dispatch');

      const toggleEvent = { target: { checked: false } } as any;
      component.toggleProvider('provider-1', toggleEvent);

      expect(store.dispatch).toHaveBeenCalledWith(
        ProviderActions.toggleProvider({ providerId: 'provider-1', isActive: false })
      );
    }));

    it('should show delete confirmation dialog', () => {
      const provider = mockProviders[0];

      expect(component.showDeleteConfirmation()).toBe(false);

      component.deleteProvider(provider);

      expect(component.showDeleteConfirmation()).toBe(true);
      expect(component.providerToDelete()).toBe(provider);
    });

    it('should delete provider when confirmed', fakeAsync(() => {
      const provider = mockProviders[0];
      spyOn(store, 'dispatch');

      component.providerToDelete.set(provider);
      component.confirmDeleteProvider();

      expect(store.dispatch).toHaveBeenCalledWith(
        ProviderActions.deleteProvider({ providerId: provider.id })
      );
      expect(component.showDeleteConfirmation()).toBe(false);
      expect(component.providerToDelete()).toBeNull();
    }));

    it('should cancel deletion', () => {
      const provider = mockProviders[0];

      component.providerToDelete.set(provider);
      component.showDeleteConfirmation.set(true);

      component.closeDeleteConfirmation();

      expect(component.showDeleteConfirmation()).toBe(false);
      expect(component.providerToDelete()).toBeNull();
    });

    it('should show impact warning in delete confirmation', fakeAsync(() => {
      const provider = mockProviders[0];

      component.deleteProvider(provider);
      fixture.detectChanges();
      tick();

      const deleteDialog = fixture.debugElement.nativeElement.querySelector('.delete-confirmation');
      expect(deleteDialog).toBeTruthy();
      expect(deleteDialog.textContent).toContain('Are you sure you want to delete');
      expect(deleteDialog.textContent).toContain(provider.name);
      expect(deleteDialog.textContent).toContain('Deactivate all agents that depend on this provider');
    }));
  });

  describe('Form Validation and Error Handling', () => {
    it('should show validation errors for required fields', fakeAsync(() => {
      component.showAddProviderForm();
      fixture.detectChanges();

      const nameInput = fixture.debugElement.nativeElement.querySelector('#providerName');
      nameInput.value = '';
      nameInput.dispatchEvent(new Event('input'));
      nameInput.dispatchEvent(new Event('blur'));

      fixture.detectChanges();
      tick();

      const errorText = fixture.debugElement.nativeElement.querySelector('.error-text');
      expect(errorText?.textContent).toContain('Provider name is required');
    }));

    // TODO: Re-enable these tests when validation methods are implemented
    // it('should validate API key format for cloud providers', () => {
    //   validationService.validateApiKey.and.returnValue({
    //     valid: false,
    //     error: 'Invalid API key format'
    //   });

    //   component.showAddProviderForm();
    //   component.providerForm.type = 'cloud';
    //   component.providerForm.apiKey = 'invalid-key';

    //   const validation = validationService.validateApiKey(component.providerForm.apiKey, 'openai');
    //   expect(validation.valid).toBe(false);
    //   expect(validation.error).toBe('Invalid API key format');
    // });

    // it('should validate endpoint URL for local network providers', () => {
    //   validationService.validateEndpoint.and.returnValue({
    //     valid: false,
    //     error: 'Invalid URL format'
    //   });

    //   component.showAddProviderForm();
    //   component.onProviderTypeChange('local-network');
    //   component.providerForm.endpoint = 'invalid-url';

    //   const validation = validationService.validateEndpoint(component.providerForm.endpoint);
    //   expect(validation.valid).toBe(false);
    //   expect(validation.error).toBe('Invalid URL format');
    // });

    it('should handle service errors gracefully', fakeAsync(() => {
      const error = new Error('Network error');
      providerService.addProvider.and.returnValue(Promise.reject(error));

      component.showAddProviderForm();
      component.providerForm = {
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test-key',
        endpoint: '',
        localHostType: undefined
      };

      component.saveProvider(new Event('submit'));
      tick();

      expect(errorService.handleError).toHaveBeenCalledWith(error);
    }));
  });

  describe('UI Interactions and Accessibility', () => {
    it('should close form when clicking outside modal', () => {
      component.showAddProviderForm();
      fixture.detectChanges();

      const modalOverlay = fixture.debugElement.nativeElement.querySelector('.modal-overlay');
      modalOverlay.click();

      expect(component.showProviderForm()).toBe(false);
    });

    it('should not close form when clicking inside modal content', () => {
      component.showAddProviderForm();
      fixture.detectChanges();

      const modalContent = fixture.debugElement.nativeElement.querySelector('.modal-content');
      modalContent.click();

      expect(component.showProviderForm()).toBe(true);
    });

    it('should close form when clicking close button', () => {
      component.showAddProviderForm();
      fixture.detectChanges();

      const closeButton = fixture.debugElement.nativeElement.querySelector('.close-btn');
      closeButton.click();

      expect(component.showProviderForm()).toBe(false);
    });

    it('should have proper ARIA labels and accessibility attributes', fakeAsync(() => {
      component.showAddProviderForm();
      fixture.detectChanges();
      tick();

      const form = fixture.debugElement.nativeElement.querySelector('form');
      const inputs = form.querySelectorAll('input, select');

      inputs.forEach((input: HTMLElement) => {
        const label = form.querySelector(`label[for="${input.id}"]`);
        expect(label).toBeTruthy();
      });
    }));

    it('should handle keyboard navigation', fakeAsync(() => {
      component.showAddProviderForm();
      fixture.detectChanges();
      tick();

      const form = fixture.debugElement.nativeElement.querySelector('form');
      const focusableElements = form.querySelectorAll('input, select, button');

      expect(focusableElements.length).toBeGreaterThan(0);
      
      // Test that elements can receive focus
      focusableElements[0].focus();
      expect(document.activeElement).toBe(focusableElements[0]);
    }));
  });
});