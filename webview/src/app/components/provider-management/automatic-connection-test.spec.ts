import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';

import { ProviderManagementComponent } from './provider-management.component';
import { ProviderManagerService } from '../../services/provider-manager.service';
import { ErrorHandlerService } from '../../services/error-handler.service';
import { ValidationService } from '../../services/validation.service';
import { ConnectionTestResult, ProviderConfig, CloudProvider, LocalNetworkProvider } from '../../interfaces/provider-agent.interface';

describe('ProviderManagementComponent - Automatic Connection Testing', () => {
  let component: ProviderManagementComponent;
  let fixture: ComponentFixture<ProviderManagementComponent>;
  let mockStore: jasmine.SpyObj<Store>;
  let mockProviderManager: jasmine.SpyObj<ProviderManagerService>;
  let mockErrorHandler: jasmine.SpyObj<ErrorHandlerService>;
  let mockValidationService: jasmine.SpyObj<ValidationService>;

  beforeEach(async () => {
    const storeSpy = jasmine.createSpyObj('Store', ['select', 'dispatch']);
    const providerManagerSpy = jasmine.createSpyObj('ProviderManagerService', [
      'addProvider', 
      'updateProvider', 
      'testProviderConnection'
    ]);
    const errorHandlerSpy = jasmine.createSpyObj('ErrorHandlerService', [
      'handleProviderError', 
      'addInfo'
    ]);
    const validationServiceSpy = jasmine.createSpyObj('ValidationService', [
      'validateApiKey', 
      'validateEndpoint'
    ]);

    await TestBed.configureTestingModule({
      imports: [ProviderManagementComponent],
      providers: [
        { provide: Store, useValue: storeSpy },
        { provide: ProviderManagerService, useValue: providerManagerSpy },
        { provide: ErrorHandlerService, useValue: errorHandlerSpy },
        { provide: ValidationService, useValue: validationServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProviderManagementComponent);
    component = fixture.componentInstance;
    mockStore = TestBed.inject(Store) as jasmine.SpyObj<Store>;
    mockProviderManager = TestBed.inject(ProviderManagerService) as jasmine.SpyObj<ProviderManagerService>;
    mockErrorHandler = TestBed.inject(ErrorHandlerService) as jasmine.SpyObj<ErrorHandlerService>;
    mockValidationService = TestBed.inject(ValidationService) as jasmine.SpyObj<ValidationService>;

    // Setup default store selectors
    mockStore.select.and.returnValue(of([]));
  });

  describe('Automatic Connection Testing on Save', () => {
    beforeEach(() => {
      // Setup valid form data
      component.providerForm = {
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test123',
        endpoint: '',
        localHostType: 'ollama'
      };

      // Mock validation methods to return valid
      mockValidationService.validateApiKey.and.returnValue({ isValid: true, errors: [] });
      mockValidationService.validateEndpoint.and.returnValue({ isValid: true, errors: [] });
    });

    it('should automatically test connection before adding a new provider', async () => {
      // Arrange
      const successResult: ConnectionTestResult = { success: true };
      mockProviderManager.testProviderConnection.and.returnValue(Promise.resolve(successResult));
      mockProviderManager.addProvider.and.returnValue(Promise.resolve());

      // Act
      await component.saveProvider();

      // Assert
      expect(mockProviderManager.testProviderConnection).toHaveBeenCalledTimes(1);
      expect(mockProviderManager.addProvider).toHaveBeenCalledTimes(1);
      expect(component.formErrors()).toEqual([]);
    });

    it('should show loading state during connection testing', async () => {
      // Arrange
      let resolveConnectionTest: (result: ConnectionTestResult) => void;
      const connectionTestPromise = new Promise<ConnectionTestResult>((resolve) => {
        resolveConnectionTest = resolve;
      });
      mockProviderManager.testProviderConnection.and.returnValue(connectionTestPromise);

      // Act
      const savePromise = component.saveProvider();
      
      // Assert - should be in loading state
      expect(component.savingProvider()).toBe(true);
      expect(component.testingConnectionForSave()).toBe(true);

      // Complete the connection test
      resolveConnectionTest!({ success: true });
      await savePromise;

      // Assert - should no longer be in loading state
      expect(component.testingConnectionForSave()).toBe(false);
    });

    it('should prevent adding provider if connection test fails', async () => {
      // Arrange
      const failureResult: ConnectionTestResult = { 
        success: false, 
        error: 'Connection timeout' 
      };
      mockProviderManager.testProviderConnection.and.returnValue(Promise.resolve(failureResult));

      // Act
      await component.saveProvider();

      // Assert
      expect(mockProviderManager.testProviderConnection).toHaveBeenCalledTimes(1);
      expect(mockProviderManager.addProvider).not.toHaveBeenCalled();
      expect(component.formErrors()).toEqual(['Could not connect to provider: Connection timeout']);
    });

    it('should test connection with correct provider configuration for cloud provider', async () => {
      // Arrange
      component.providerForm = {
        name: 'OpenAI Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test123',
        endpoint: '',
        localHostType: 'ollama'
      };

      const successResult: ConnectionTestResult = { success: true };
      mockProviderManager.testProviderConnection.and.returnValue(Promise.resolve(successResult));
      mockProviderManager.addProvider.and.returnValue(Promise.resolve());

      // Act
      await component.saveProvider();

      // Assert
      const callArgs = mockProviderManager.testProviderConnection.calls.argsFor(0)[0] as CloudProvider;
      expect(callArgs.type).toBe('cloud');
      expect(callArgs.provider).toBe('openai');
      expect(callArgs.apiKey).toBe('sk-test123');
      expect(callArgs.name).toBe('OpenAI Provider');
    });

    it('should test connection with correct provider configuration for local network provider', async () => {
      // Arrange
      component.providerForm = {
        name: 'Ollama Provider',
        type: 'local-network',
        provider: 'ollama',
        apiKey: '',
        endpoint: 'http://localhost:11434',
        localHostType: 'ollama'
      };

      const successResult: ConnectionTestResult = { success: true };
      mockProviderManager.testProviderConnection.and.returnValue(Promise.resolve(successResult));
      mockProviderManager.addProvider.and.returnValue(Promise.resolve());

      // Act
      await component.saveProvider();

      // Assert
      const callArgs = mockProviderManager.testProviderConnection.calls.argsFor(0)[0] as LocalNetworkProvider;
      expect(callArgs.type).toBe('local-network');
      expect(callArgs.provider).toBe('ollama');
      expect(callArgs.endpoint).toBe('http://localhost:11434');
      expect(callArgs.localHostType).toBe('ollama');
      expect(callArgs.name).toBe('Ollama Provider');
    });

    it('should handle connection test errors gracefully', async () => {
      // Arrange
      const testError = new Error('Network error');
      mockProviderManager.testProviderConnection.and.returnValue(Promise.reject(testError));

      // Act
      await component.saveProvider();

      // Assert
      expect(mockProviderManager.testProviderConnection).toHaveBeenCalledTimes(1);
      expect(mockProviderManager.addProvider).not.toHaveBeenCalled();
      expect(component.formErrors()).toEqual(['Could not connect to provider: Network error']);
    });

    it('should auto-generate provider name before connection testing if not provided', async () => {
      // Arrange
      component.providerForm.name = ''; // Empty name
      const successResult: ConnectionTestResult = { success: true };
      mockProviderManager.testProviderConnection.and.returnValue(Promise.resolve(successResult));
      mockProviderManager.addProvider.and.returnValue(Promise.resolve());

      // Act
      await component.saveProvider();

      // Assert
      const callArgs = mockProviderManager.testProviderConnection.calls.argsFor(0)[0];
      expect(callArgs.name).toBeTruthy();
      expect(callArgs.name).not.toBe('');
      expect(callArgs.name).toContain('OpenAI'); // Should be auto-generated based on provider type
    });

    it('should also test connection when updating existing provider', async () => {
      // Arrange
      const existingProvider: CloudProvider = {
        id: 'existing-1',
        name: 'Existing Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'old-key',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      component.editingProvider.set(existingProvider);
      component.providerForm.apiKey = 'new-key'; // Updated API key

      const successResult: ConnectionTestResult = { success: true };
      mockProviderManager.testProviderConnection.and.returnValue(Promise.resolve(successResult));
      mockProviderManager.updateProvider.and.returnValue(Promise.resolve());

      // Act
      await component.saveProvider();

      // Assert
      expect(mockProviderManager.testProviderConnection).toHaveBeenCalledTimes(1);
      expect(mockProviderManager.updateProvider).toHaveBeenCalledTimes(1);
      
      const callArgs = mockProviderManager.testProviderConnection.calls.argsFor(0)[0] as CloudProvider;
      expect(callArgs.apiKey).toBe('new-key'); // Should test with updated configuration
    });
  });

  describe('Loading States', () => {
    it('should set savingProvider to true during save operation', async () => {
      // Arrange
      let resolveConnectionTest: (result: ConnectionTestResult) => void;
      const connectionTestPromise = new Promise<ConnectionTestResult>((resolve) => {
        resolveConnectionTest = resolve;
      });
      mockProviderManager.testProviderConnection.and.returnValue(connectionTestPromise);

      // Act
      const savePromise = component.saveProvider();

      // Assert
      expect(component.savingProvider()).toBe(true);

      // Complete the test
      resolveConnectionTest!({ success: true });
      await savePromise;

      expect(component.savingProvider()).toBe(false);
    });

    it('should set testingConnectionForSave to true during connection testing', async () => {
      // Arrange
      let resolveConnectionTest: (result: ConnectionTestResult) => void;
      const connectionTestPromise = new Promise<ConnectionTestResult>((resolve) => {
        resolveConnectionTest = resolve;
      });
      mockProviderManager.testProviderConnection.and.returnValue(connectionTestPromise);

      // Act
      const savePromise = component.saveProvider();

      // Assert
      expect(component.testingConnectionForSave()).toBe(true);

      // Complete the test
      resolveConnectionTest!({ success: true });
      await savePromise;

      expect(component.testingConnectionForSave()).toBe(false);
    });
  });
});