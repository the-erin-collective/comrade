import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { of, Subject } from 'rxjs';
import { AgentManagerService } from './agent-manager.service';
import { MessageService } from './message.service';
import { ProviderManagerService } from './provider-manager.service';
import { Agent, AgentFormData, ProviderConfig } from '../interfaces/provider-agent.interface';
import * as AgentActions from '../state/agent/agent.actions';

describe('AgentManagerService', () => {
  let service: AgentManagerService;
  let mockStore: jasmine.SpyObj<Store>;
  let mockMessageService: jasmine.SpyObj<MessageService>;
  let mockProviderManager: jasmine.SpyObj<ProviderManagerService>;
  let messagesSubject: Subject<any>;

  const mockProvider: ProviderConfig = {
    id: 'provider-1',
    name: 'Test Provider',
    type: 'cloud',
    provider: 'openai',
    apiKey: 'test-key',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  } as ProviderConfig;

  const mockAgent: Agent = {
    id: 'agent-1',
    name: 'Test Agent',
    providerId: 'provider-1',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 4000,
    capabilities: {
      hasVision: false,
      hasToolUse: true,
      reasoningDepth: 'advanced',
      speed: 'medium',
      costTier: 'high'
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    messagesSubject = new Subject();
    
    const storeSpy = jasmine.createSpyObj('Store', ['select', 'dispatch']);
    const messageServiceSpy = jasmine.createSpyObj('MessageService', ['sendMessage'], {
      messages$: messagesSubject.asObservable()
    });
    const providerManagerSpy = jasmine.createSpyObj('ProviderManagerService', [
      'getProviderById', 'fetchAvailableModels'
    ], {
      providers$: of([mockProvider])
    });

    TestBed.configureTestingModule({
      providers: [
        AgentManagerService,
        { provide: Store, useValue: storeSpy },
        { provide: MessageService, useValue: messageServiceSpy },
        { provide: ProviderManagerService, useValue: providerManagerSpy }
      ]
    });

    service = TestBed.inject(AgentManagerService);
    mockStore = TestBed.inject(Store) as jasmine.SpyObj<Store>;
    mockMessageService = TestBed.inject(MessageService) as jasmine.SpyObj<MessageService>;
    mockProviderManager = TestBed.inject(ProviderManagerService) as jasmine.SpyObj<ProviderManagerService>;

    // Setup default store selectors
    mockStore.select.and.returnValue(of([]));
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadAgents', () => {
    it('should dispatch loadAgents action and send message', () => {
      service.loadAgents();

      expect(mockStore.dispatch).toHaveBeenCalledWith(AgentActions.loadAgents());
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'getConfig',
        payload: { section: 'agents' }
      });
    });
  });

  describe('addAgent', () => {
    it('should add agent when form data is valid', async () => {
      const agentData: AgentFormData = {
        name: 'Test Agent',
        providerId: 'provider-1',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000
      };

      mockProviderManager.getProviderById.and.returnValue(of(mockProvider));

      await service.addAgent(agentData);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.addAgent({ agentData })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'updateConfig',
        payload: {
          operation: 'addAgent',
          agent: jasmine.any(Object)
        }
      });
    });

    it('should dispatch failure action when form data is invalid', async () => {
      const invalidAgentData: AgentFormData = {
        name: '',
        providerId: 'provider-1',
        model: 'gpt-4'
      };

      await service.addAgent(invalidAgentData);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.addAgentFailure({ error: 'Agent name is required' })
      );
    });

    it('should dispatch failure action when provider not found', async () => {
      const agentData: AgentFormData = {
        name: 'Test Agent',
        providerId: 'nonexistent-provider',
        model: 'gpt-4'
      };

      mockProviderManager.getProviderById.and.returnValue(of(undefined));

      await service.addAgent(agentData);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.addAgentFailure({ error: 'Selected provider not found' })
      );
    });

    it('should dispatch failure action when provider is inactive', async () => {
      const agentData: AgentFormData = {
        name: 'Test Agent',
        providerId: 'provider-1',
        model: 'gpt-4'
      };

      const inactiveProvider = { ...mockProvider, isActive: false };
      mockProviderManager.getProviderById.and.returnValue(of(inactiveProvider));

      await service.addAgent(agentData);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.addAgentFailure({ error: 'Selected provider is not active' })
      );
    });
  });

  describe('updateAgent', () => {
    it('should update agent when updates are valid', async () => {
      const updates = { name: 'Updated Agent' };

      await service.updateAgent('agent-1', updates);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.updateAgent({ agentId: 'agent-1', updates })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'updateConfig',
        payload: {
          operation: 'updateAgent',
          agentId: 'agent-1',
          updates
        }
      });
    });

    it('should validate provider when updating providerId', async () => {
      const updates = { providerId: 'new-provider' };
      mockProviderManager.getProviderById.and.returnValue(of(mockProvider));

      await service.updateAgent('agent-1', updates);

      expect(mockProviderManager.getProviderById).toHaveBeenCalledWith('new-provider');
      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.updateAgent({ agentId: 'agent-1', updates })
      );
    });

    it('should dispatch failure when new provider not found', async () => {
      const updates = { providerId: 'nonexistent-provider' };
      mockProviderManager.getProviderById.and.returnValue(of(undefined));

      await service.updateAgent('agent-1', updates);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.updateAgentFailure({ error: 'Selected provider not found' })
      );
    });

    it('should dispatch failure when new provider is inactive', async () => {
      const updates = { providerId: 'inactive-provider' };
      const inactiveProvider = { ...mockProvider, isActive: false };
      mockProviderManager.getProviderById.and.returnValue(of(inactiveProvider));

      await service.updateAgent('agent-1', updates);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.updateAgentFailure({ error: 'Selected provider is not active' })
      );
    });
  });

  describe('deleteAgent', () => {
    it('should dispatch delete action and send message', async () => {
      await service.deleteAgent('agent-1');

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.deleteAgent({ agentId: 'agent-1' })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'updateConfig',
        payload: {
          operation: 'deleteAgent',
          agentId: 'agent-1'
        }
      });
    });
  });

  describe('toggleAgentStatus', () => {
    it('should dispatch toggle action and send message', async () => {
      await service.toggleAgentStatus('agent-1', false);

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.toggleAgent({ agentId: 'agent-1', isActive: false })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'updateConfig',
        payload: {
          operation: 'toggleAgent',
          agentId: 'agent-1',
          isActive: false
        }
      });
    });
  });

  describe('dependency management', () => {
    it('should deactivate agents by provider', async () => {
      await service.deactivateAgentsByProvider('provider-1');

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.deactivateAgentsByProvider({ providerId: 'provider-1' })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'updateConfig',
        payload: {
          operation: 'deactivateAgentsByProvider',
          providerId: 'provider-1'
        }
      });
    });

    it('should delete agents by provider', async () => {
      await service.deleteAgentsByProvider('provider-1');

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.deleteAgentsByProvider({ providerId: 'provider-1' })
      );
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'updateConfig',
        payload: {
          operation: 'deleteAgentsByProvider',
          providerId: 'provider-1'
        }
      });
    });
  });

  describe('model management', () => {
    it('should load models for provider', async () => {
      await service.loadModelsForProvider('provider-1');

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.loadModelsForProvider({ providerId: 'provider-1' })
      );
      expect(mockProviderManager.fetchAvailableModels).toHaveBeenCalledWith('provider-1');
    });
  });

  describe('getAgentCapabilities', () => {
    it('should return OpenAI capabilities for GPT-4', async () => {
      mockProviderManager.getProviderById.and.returnValue(of(mockProvider));

      const capabilities = await service.getAgentCapabilities('provider-1', 'gpt-4');

      expect(capabilities).toEqual({
        hasVision: false,
        hasToolUse: true,
        reasoningDepth: 'advanced',
        speed: 'medium',
        costTier: 'high'
      });
    });

    it('should return Anthropic capabilities for Claude', async () => {
      const anthropicProvider = { ...mockProvider, provider: 'anthropic' as const };
      mockProviderManager.getProviderById.and.returnValue(of(anthropicProvider));

      const capabilities = await service.getAgentCapabilities('provider-1', 'claude-3');

      expect(capabilities).toEqual({
        hasVision: true,
        hasToolUse: true,
        reasoningDepth: 'advanced',
        speed: 'medium',
        costTier: 'high'
      });
    });

    it('should return Ollama capabilities for local models', async () => {
      const ollamaProvider = { 
        ...mockProvider, 
        provider: 'ollama' as const,
        type: 'local-network' as const,
        endpoint: 'http://localhost:11434',
        localHostType: 'ollama' as const
      };
      mockProviderManager.getProviderById.and.returnValue(of(ollamaProvider));

      const capabilities = await service.getAgentCapabilities('provider-1', 'llama3-7b');

      expect(capabilities).toEqual({
        hasVision: false,
        hasToolUse: true,
        reasoningDepth: 'intermediate',
        speed: 'fast',
        costTier: 'low'
      });
    });

    it('should throw error when provider not found', async () => {
      mockProviderManager.getProviderById.and.returnValue(of(undefined));

      await expectAsync(service.getAgentCapabilities('nonexistent', 'model'))
        .toBeRejectedWithError('Provider nonexistent not found');
    });
  });

  describe('message handling', () => {
    it('should handle agentConfigResult message', () => {
      const agents = [mockAgent];
      
      messagesSubject.next({
        type: 'agentConfigResult',
        payload: { agents }
      });

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.loadAgentsSuccess({ agents })
      );
    });

    it('should handle agentUpdateResult success message', () => {
      messagesSubject.next({
        type: 'agentUpdateResult',
        payload: {
          success: true,
          operation: 'add',
          agent: mockAgent
        }
      });

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.addAgentSuccess({ agent: mockAgent })
      );
    });

    it('should handle agentUpdateResult failure message', () => {
      messagesSubject.next({
        type: 'agentUpdateResult',
        payload: {
          success: false,
          operation: 'add',
          error: 'Test error'
        }
      });

      expect(mockStore.dispatch).toHaveBeenCalledWith(
        AgentActions.addAgentFailure({ error: 'Test error' })
      );
    });
  });

  describe('validation', () => {
    it('should validate agent form data correctly', async () => {
      const validData: AgentFormData = {
        name: 'Test Agent',
        providerId: 'provider-1',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        timeout: 30000
      };

      mockProviderManager.getProviderById.and.returnValue(of(mockProvider));

      // Access private method for testing
      const validation = await (service as any).validateAgentFormData(validData);
      expect(validation.valid).toBe(true);
    });

    it('should reject invalid temperature', async () => {
      const invalidData: AgentFormData = {
        name: 'Test Agent',
        providerId: 'provider-1',
        model: 'gpt-4',
        temperature: 3.0 // Invalid: > 2
      };

      const validation = await (service as any).validateAgentFormData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Temperature must be between 0 and 2');
    });

    it('should reject invalid max tokens', async () => {
      const invalidData: AgentFormData = {
        name: 'Test Agent',
        providerId: 'provider-1',
        model: 'gpt-4',
        maxTokens: -100 // Invalid: <= 0
      };

      const validation = await (service as any).validateAgentFormData(invalidData);
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Max tokens must be greater than 0');
    });
  });
});