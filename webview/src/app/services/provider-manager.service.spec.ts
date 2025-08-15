import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { ProviderManagerService } from './provider-manager.service';
import { MessageService } from './message.service';
import { ProviderConfig, ProviderFormData, CloudProvider, LocalNetworkProvider } from '../interfaces/provider-agent.interface';
import * as ProviderActions from '../state/provider/provider.actions';

describe('ProviderManagerService', () => {
  let service: ProviderManagerService;
  let mockStore: jasmine.SpyObj<Store>;
  let mockMessageService: jasmine.SpyObj<MessageService>;
  let messageSubject: Subject<any>;

  const mockCloudProvider: CloudProvider = {
    id: 'provider-1',
    name: 'OpenAI GPT',
    type: 'cloud',
    provider: 'openai',
    apiKey: 'sk-test-key',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockLocalProvider: LocalNetworkProvider = {
    id: 'provider-2',
    name: 'Local Ollama',
    type: 'local-network',
    provider: 'ollama',
    endpoint: 'http://localhost:11434',
    localHostType: 'ollama',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    messageSubject = new Subject();
    
    const storeSpy = jasmine.createSpyObj('Store', ['select', 'dispatch']);
    const messageServiceSpy = jasmine.createSpyObj('MessageService', ['sendMessage'], {
      messages$: messageSubject.asObservable()
    });

    TestBed.configureTestingModule({
      providers: [
        ProviderManagerService,
        { provide: Store, useValue: storeSpy },
        { provide: MessageService, useValue: messageServiceSpy }
      ]
    });

    service = TestBed.inject(ProviderManagerService);
    mockStore = TestBed.inject(Store) as jasmine.SpyObj<Store>;
    mockMessageService = TestBed.inject(MessageService) as jasmine.SpyObj<MessageService>;

    // Setup default store selectors
    mockStore.select.and.returnValue(of([]));
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadProviders', () => {
    it('should dispatch loadProviders action and send getConfig message', () => {
      service.loadProviders();

      expect(mockStore.dispatch).toHaveBeenCalledWith(ProviderActions.loadProviders());
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'getConfig',
        payload: { section: 'providers' }
      });
    });
  });

  describe('addProvider', () => {
    it('should add a valid cloud provider', async () => {
      const formData: ProviderFormData = {
        name: 'OpenAI GPT',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test-key'
      };

      await service.addProvider(formData);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.addProvider({ providerData: formData })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'updateConfig',
        payload: {
          operation: 'addProvider',
          provider: jasmine.objectContaining({
            name: 'OpenAI GPT',
            type: 'cloud',
            provider: 'openai',
            apiKey: 'sk-test-key'
          })
        }
      });
    });

    it('should add a valid local network provider', async () => {
      const formData: ProviderFormData = {
        name: 'Local Ollama',
        type: 'local-network',
        provider: 'ollama',
        endpoint: 'http://localhost:11434',
        localHostType: 'ollama'
      };

      await service.addProvider(formData);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.addProvider({ providerData: formData })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'updateConfig',
        payload: {
          operation: 'addProvider',
          provider: jasmine.objectContaining({
            name: 'Local Ollama',
            type: 'local-network',
            provider: 'ollama',
            endpoint: 'http://localhost:11434',
            localHostType: 'ollama'
          })
        }
      });
    });

    it('should reject provider with missing name', async () => {
      const formData: ProviderFormData = {
        name: '',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test-key'
      };

      await service.addProvider(formData);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.addProviderFailure({ error: 'Provider name is required' })
      );
      expect(mockMessageService.sendMessage).not.toHaveBeenCalled();
    });

    it('should reject cloud provider with missing API key', async () => {
      const formData: ProviderFormData = {
        name: 'OpenAI GPT',
        type: 'cloud',
        provider: 'openai',
        apiKey: ''
      };

      await service.addProvider(formData);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.addProviderFailure({ error: 'API key is required for cloud providers' })
      );
    });

    it('should reject local network provider with invalid endpoint', async () => {
      const formData: ProviderFormData = {
        name: 'Local Ollama',
        type: 'local-network',
        provider: 'ollama',
        endpoint: 'invalid-url',
        localHostType: 'ollama'
      };

      await service.addProvider(formData);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.addProviderFailure({ error: 'Invalid endpoint URL format' })
      );
    });
  });

  describe('updateProvider', () => {
    it('should update provider', async () => {
      const providerId = 'provider-1';
      const updates = { name: 'Updated Name' };

      await service.updateProvider(providerId, updates);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.updateProvider({ providerId, updates })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'updateConfig',
        payload: {
          operation: 'updateProvider',
          providerId,
          updates
        }
      });
    });
  });

  describe('deleteProvider', () => {
    it('should delete provider', async () => {
      const providerId = 'provider-1';

      await service.deleteProvider(providerId);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.deleteProvider({ providerId })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'updateConfig',
        payload: {
          operation: 'deleteProvider',
          providerId
        }
      });
    });
  });

  describe('toggleProviderStatus', () => {
    it('should toggle provider status', async () => {
      const providerId = 'provider-1';
      const isActive = false;

      await service.toggleProviderStatus(providerId, isActive);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.toggleProvider({ providerId, isActive })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'updateConfig',
        payload: {
          operation: 'toggleProvider',
          providerId,
          isActive
        }
      });
    });
  });

  describe('fetchAvailableModels', () => {
    it('should fetch models for cloud provider', async () => {
      mockStore.select.and.returnValue(of(mockCloudProvider));

      await service.fetchAvailableModels('provider-1');

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.loadModelsForProvider({ providerId: 'provider-1' })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'fetchCloudModels',
        payload: {
          provider: 'openai',
          apiKey: 'sk-test-key',
          providerId: 'provider-1'
        }
      });
    });

    it('should fetch models for local network provider', async () => {
      mockStore.select.and.returnValue(of(mockLocalProvider));

      await service.fetchAvailableModels('provider-2');

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.loadModelsForProvider({ providerId: 'provider-2' })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'fetchOllamaModels',
        payload: {
          networkAddress: 'http://localhost:11434',
          providerId: 'provider-2'
        }
      });
    });

    it('should handle provider not found', async () => {
      mockStore.select.and.returnValue(of(undefined));

      await service.fetchAvailableModels('nonexistent');

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.loadModelsForProviderFailure({
          providerId: 'nonexistent',
          error: 'Provider not found'
        })
      );
    });
  });

  describe('message handling', () => {
    it('should handle configResult message', () => {
      const providers = [mockCloudProvider, mockLocalProvider];
      
      messageSubject.next({
        type: 'configResult',
        payload: { providers }
      });

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.loadProvidersSuccess({ providers })
      );
    });

    it('should handle successful configUpdateResult for add operation', () => {
      messageSubject.next({
        type: 'configUpdateResult',
        payload: {
          success: true,
          operation: 'add',
          provider: mockCloudProvider
        }
      });

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.addProviderSuccess({ provider: mockCloudProvider })
      );
    });

    it('should handle failed configUpdateResult', () => {
      messageSubject.next({
        type: 'configUpdateResult',
        payload: {
          success: false,
          operation: 'add',
          error: 'Failed to add provider'
        }
      });

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.addProviderFailure({ error: 'Failed to add provider' })
      );
    });

    it('should handle cloudModelsResult message', () => {
      messageSubject.next({
        type: 'cloudModelsResult',
        payload: {
          success: true,
          providerId: 'provider-1',
          models: ['gpt-4', 'gpt-3.5-turbo']
        }
      });

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        ProviderActions.loadModelsForProviderSuccess({
          providerId: 'provider-1',
          models: ['gpt-4', 'gpt-3.5-turbo']
        })
      );
    });
  });

  describe('utility methods', () => {
    it('should clear error', () => {
      service.clearError();
      expect(mockStore.dispatch).toHaveBeenCalledWith(ProviderActions.clearProviderError());
    });

    it('should clear model error', () => {
      service.clearModelError();
      expect(mockStore.dispatch).toHaveBeenCalledWith(ProviderActions.clearModelError());
    });

    it('should reset state', () => {
      service.resetState();
      expect(mockStore.dispatch).toHaveBeenCalledWith(ProviderActions.resetProviderState());
    });
  });
});