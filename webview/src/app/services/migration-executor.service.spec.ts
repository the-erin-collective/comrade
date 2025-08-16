import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { of, BehaviorSubject } from 'rxjs';
import { MigrationExecutorService, MigrationStatus } from './migration-executor.service';
import { MigrationService } from './migration.service';
import { ProviderManagerService } from './provider-manager.service';
import { AgentManagerService } from './agent-manager.service';
import { MessageService } from './message.service';
import { 
  MigrationData, 
  Provider, 
  Agent 
} from '../interfaces/provider-agent.interface';
import { AgentConfig } from '../interfaces/model-config.interface';

describe('MigrationExecutorService', () => {
  let service: MigrationExecutorService;
  let mockStore: jasmine.SpyObj<Store>;
  let mockMigrationService: jasmine.SpyObj<MigrationService>;
  let mockProviderManager: jasmine.SpyObj<ProviderManagerService>;
  let mockAgentManager: jasmine.SpyObj<AgentManagerService>;
  let mockMessageService: jasmine.SpyObj<MessageService>;
  let messagesSubject: BehaviorSubject<any>;

  beforeEach(() => {
    messagesSubject = new BehaviorSubject<any>({});
    
    const storeSpy = jasmine.createSpyObj('Store', ['select', 'dispatch']);
    const migrationServiceSpy = jasmine.createSpyObj('MigrationService', [
      'migrateAgentConfigurations',
      'validateMigrationResults',
      'generateMigrationReport'
    ]);
    const providerManagerSpy = jasmine.createSpyObj('ProviderManagerService', [
      'loadProviders'
    ], {
      providers$: of([])
    });
    const agentManagerSpy = jasmine.createSpyObj('AgentManagerService', [
      'loadAgents'
    ], {
      agents$: of([])
    });
    const messageServiceSpy = jasmine.createSpyObj('MessageService', [
      'sendMessage'
    ], {
      messages$: messagesSubject.asObservable()
    });

    TestBed.configureTestingModule({
      providers: [
        MigrationExecutorService,
        { provide: Store, useValue: storeSpy },
        { provide: MigrationService, useValue: migrationServiceSpy },
        { provide: ProviderManagerService, useValue: providerManagerSpy },
        { provide: AgentManagerService, useValue: agentManagerSpy },
        { provide: MessageService, useValue: messageServiceSpy }
      ]
    });

    service = TestBed.inject(MigrationExecutorService);
    mockStore = TestBed.inject(Store) as jasmine.SpyObj<Store>;
    mockMigrationService = TestBed.inject(MigrationService) as jasmine.SpyObj<MigrationService>;
    mockProviderManager = TestBed.inject(ProviderManagerService) as jasmine.SpyObj<ProviderManagerService>;
    mockAgentManager = TestBed.inject(AgentManagerService) as jasmine.SpyObj<AgentManagerService>;
    mockMessageService = TestBed.inject(MessageService) as jasmine.SpyObj<MessageService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('checkAndExecuteMigration', () => {
    it('should skip migration when new system already has data', async () => {
      // Mock existing providers and agents
      Object.defineProperty(mockProviderManager, 'providers$', {
        value: of([{ id: 'provider-1', name: 'Existing Provider' }])
      });
      Object.defineProperty(mockAgentManager, 'agents$', {
        value: of([])
      });

      const result = await service.checkAndExecuteMigration();

      expect(result).toBe(false);
      expect(mockMessageService.sendMessage).not.toHaveBeenCalled();
      
      const status = service.getCurrentStatus();
      expect(status.isComplete).toBe(true);
      expect(status.hasErrors).toBe(false);
      expect(status.currentStep).toContain('Migration not needed');
    });

    it('should request legacy config when migration is needed', async () => {
      // Mock empty providers and agents
      Object.defineProperty(mockProviderManager, 'providers$', {
        value: of([])
      });
      Object.defineProperty(mockAgentManager, 'agents$', {
        value: of([])
      });

      const result = await service.checkAndExecuteMigration();

      expect(result).toBe(true);
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'getLegacyConfig',
        payload: {}
      });
      
      const status = service.getCurrentStatus();
      expect(status.isRunning).toBe(true);
      expect(status.currentStep).toContain('Requesting legacy configuration');
    });

    it('should handle errors during migration check', async () => {
      // Mock error in provider service
      Object.defineProperty(mockProviderManager, 'providers$', {
        value: of([]).pipe(() => { throw new Error('Provider service error'); })
      });

      const result = await service.checkAndExecuteMigration();

      expect(result).toBe(false);
      
      const status = service.getCurrentStatus();
      expect(status.hasErrors).toBe(true);
      expect(status.currentStep).toContain('Migration check failed');
    });
  });

  describe('message handling', () => {
    it('should handle legacy config data message', () => {
      const legacyAgents: AgentConfig[] = [{
        id: 'agent-1',
        name: 'Test Agent',
        description: 'Test agent',
        modelConfig: {
          name: 'GPT-4',
          provider: 'openai',
          model: 'gpt-4',
          apiKey: 'sk-test-key'
        }
      }];

      const mockMigrationData: MigrationData = {
        providersCreated: [{
          id: 'provider-1',
          name: 'OpenAI',
          type: 'cloud',
          provider: 'openai',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        } as Provider],
        agentsUpdated: [{
          id: 'agent-1',
          name: 'Test Agent',
          providerId: 'provider-1',
          model: 'gpt-4',
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
        }],
        errors: [],
        warnings: []
      };

      mockMigrationService.migrateAgentConfigurations.and.returnValue(mockMigrationData);
      mockMigrationService.validateMigrationResults.and.returnValue({ valid: true });
      mockMigrationService.generateMigrationReport.and.returnValue('Migration successful');

      // Simulate receiving legacy config data
      messagesSubject.next({
        type: 'legacyConfigData',
        payload: { legacyAgents }
      });

      expect(mockMigrationService.migrateAgentConfigurations).toHaveBeenCalledWith(legacyAgents);
      expect(mockMigrationService.validateMigrationResults).toHaveBeenCalledWith(mockMigrationData);
      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'saveMigrationResults',
        payload: {
          providers: mockMigrationData.providersCreated,
          agents: mockMigrationData.agentsUpdated
        }
      });
    });

    it('should handle empty legacy config data', () => {
      // Simulate receiving empty legacy config data
      messagesSubject.next({
        type: 'legacyConfigData',
        payload: { legacyAgents: [] }
      });

      const status = service.getCurrentStatus();
      expect(status.isComplete).toBe(true);
      expect(status.hasErrors).toBe(false);
      expect(status.currentStep).toContain('No legacy agents found');
    });

    it('should handle migration validation failure', () => {
      const legacyAgents: AgentConfig[] = [{
        id: 'agent-1',
        name: 'Test Agent',
        description: 'Test agent',
        modelConfig: {
          name: 'GPT-4',
          provider: 'openai',
          model: 'gpt-4'
          // Missing API key
        }
      }];

      const mockMigrationData: MigrationData = {
        providersCreated: [],
        agentsUpdated: [],
        errors: ['Cloud provider requires API key'],
        warnings: []
      };

      mockMigrationService.migrateAgentConfigurations.and.returnValue(mockMigrationData);
      mockMigrationService.validateMigrationResults.and.returnValue({
        valid: false,
        error: 'Migration validation failed: Cloud provider requires API key'
      });

      // Simulate receiving legacy config data
      messagesSubject.next({
        type: 'legacyConfigData',
        payload: { legacyAgents }
      });

      const status = service.getCurrentStatus();
      expect(status.hasErrors).toBe(true);
      expect(status.currentStep).toContain('Migration validation failed');
    });

    it('should handle migration result success message', () => {
      messagesSubject.next({
        type: 'migrationResult',
        payload: {
          success: true,
          migrationData: {
            providersCreated: [],
            agentsUpdated: [],
            errors: [],
            warnings: []
          },
          report: 'Migration completed successfully'
        }
      });

      const status = service.getCurrentStatus();
      expect(status.isComplete).toBe(true);
      expect(status.hasErrors).toBe(false);
      expect(status.currentStep).toBe('Migration completed successfully');
      expect(status.report).toBe('Migration completed successfully');
    });

    it('should handle migration result failure message', () => {
      messagesSubject.next({
        type: 'migrationResult',
        payload: {
          success: false,
          error: 'Failed to save migration results'
        }
      });

      const status = service.getCurrentStatus();
      expect(status.isComplete).toBe(true);
      expect(status.hasErrors).toBe(true);
      expect(status.currentStep).toContain('Migration failed');
    });
  });

  describe('forceMigration', () => {
    it('should request legacy config with force flag', async () => {
      await service.forceMigration();

      expect(mockMessageService.sendMessage).toHaveBeenCalledWith({
        type: 'getLegacyConfig',
        payload: { force: true }
      });

      const status = service.getCurrentStatus();
      expect(status.isRunning).toBe(true);
      expect(status.currentStep).toContain('Starting forced migration');
    });
  });

  describe('isMigrationNeeded', () => {
    it('should return true when no providers or agents exist', async () => {
      Object.defineProperty(mockProviderManager, 'providers$', {
        value: of([])
      });
      Object.defineProperty(mockAgentManager, 'agents$', {
        value: of([])
      });

      const result = await service.isMigrationNeeded();
      expect(result).toBe(true);
    });

    it('should return false when providers exist', async () => {
      Object.defineProperty(mockProviderManager, 'providers$', {
        value: of([{ id: 'provider-1', name: 'Existing Provider' }])
      });
      Object.defineProperty(mockAgentManager, 'agents$', {
        value: of([])
      });

      const result = await service.isMigrationNeeded();
      expect(result).toBe(false);
    });

    it('should return false when agents exist', async () => {
      Object.defineProperty(mockProviderManager, 'providers$', {
        value: of([])
      });
      Object.defineProperty(mockAgentManager, 'agents$', {
        value: of([{ id: 'agent-1', name: 'Existing Agent' }])
      });

      const result = await service.isMigrationNeeded();
      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      Object.defineProperty(mockProviderManager, 'providers$', {
        value: of([]).pipe(() => { throw new Error('Service error'); })
      });

      const result = await service.isMigrationNeeded();
      expect(result).toBe(false);
    });
  });

  describe('validateCurrentConfiguration', () => {
    it('should validate valid configuration', async () => {
      const mockProviders: Provider[] = [{
        id: 'provider-1',
        name: 'OpenAI',
        type: 'cloud',
        provider: 'openai',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }];

      const mockAgents: Agent[] = [{
        id: 'agent-1',
        name: 'GPT-4 Assistant',
        providerId: 'provider-1',
        model: 'gpt-4',
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
      }];

      Object.defineProperty(mockProviderManager, 'providers$', {
        value: of(mockProviders)
      });
      Object.defineProperty(mockAgentManager, 'agents$', {
        value: of(mockAgents)
      });

      const result = await service.validateCurrentConfiguration();

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect invalid provider configuration', async () => {
      const mockProviders: Provider[] = [{
        id: '',
        name: '',
        type: 'cloud',
        provider: 'openai',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }];

      Object.defineProperty(mockProviderManager, 'providers$', {
        value: of(mockProviders)
      });
      Object.defineProperty(mockAgentManager, 'agents$', {
        value: of([])
      });

      const result = await service.validateCurrentConfiguration();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing required fields');
    });

    it('should detect agent with non-existent provider', async () => {
      const mockProviders: Provider[] = [];
      const mockAgents: Agent[] = [{
        id: 'agent-1',
        name: 'Orphaned Agent',
        providerId: 'non-existent-provider',
        model: 'gpt-4',
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
      }];

      Object.defineProperty(mockProviderManager, 'providers$', {
        value: of(mockProviders)
      });
      Object.defineProperty(mockAgentManager, 'agents$', {
        value: of(mockAgents)
      });

      const result = await service.validateCurrentConfiguration();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('references non-existent provider');
    });

    it('should warn about orphaned agents with inactive providers', async () => {
      const mockProviders: Provider[] = [{
        id: 'provider-1',
        name: 'Inactive Provider',
        type: 'cloud',
        provider: 'openai',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }];

      const mockAgents: Agent[] = [{
        id: 'agent-1',
        name: 'Active Agent',
        providerId: 'provider-1',
        model: 'gpt-4',
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
      }];

      Object.defineProperty(mockProviderManager, 'providers$', {
        value: of(mockProviders)
      });
      Object.defineProperty(mockAgentManager, 'agents$', {
        value: of(mockAgents)
      });

      const result = await service.validateCurrentConfiguration();

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('1 active agents are using inactive providers');
    });
  });

  describe('resetMigrationStatus', () => {
    it('should reset migration status to initial state', () => {
      service.resetMigrationStatus();

      const status = service.getCurrentStatus();
      expect(status.isRunning).toBe(false);
      expect(status.isComplete).toBe(false);
      expect(status.hasErrors).toBe(false);
      expect(status.currentStep).toBe('Not started');
      expect(status.progress).toBe(0);
    });
  });

  describe('getMigrationStatistics', () => {
    it('should return migration statistics', (done) => {
      // Set up a completed migration status
      const mockMigrationData: MigrationData = {
        providersCreated: [{ id: 'p1' } as Provider, { id: 'p2' } as Provider],
        agentsUpdated: [{ id: 'a1' } as Agent],
        errors: ['error1'],
        warnings: ['warning1', 'warning2']
      };

      // Simulate completed migration
      messagesSubject.next({
        type: 'migrationResult',
        payload: {
          success: true,
          migrationData: mockMigrationData
        }
      });

      service.getMigrationStatistics().subscribe(stats => {
        expect(stats.isComplete).toBe(true);
        expect(stats.hasErrors).toBe(false);
        expect(stats.providersCreated).toBe(2);
        expect(stats.agentsUpdated).toBe(1);
        expect(stats.errorsCount).toBe(1);
        expect(stats.warningsCount).toBe(2);
        expect(stats.migrationDate).toBeDefined();
        done();
      });
    });
  });
});