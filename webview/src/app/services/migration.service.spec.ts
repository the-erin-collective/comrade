import { TestBed } from '@angular/core/testing';
import { MigrationService } from './migration.service';
import { 
  Provider, 
  Agent, 
  CloudProvider, 
  LocalNetworkProvider,
  MigrationData 
} from '../interfaces/provider-agent.interface';
import { 
  AgentConfig, 
  ModelConfig, 
  ExtendedAgentConfig 
} from '../interfaces/model-config.interface';

describe('MigrationService', () => {
  let service: MigrationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MigrationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('migrateAgentConfigurations', () => {
    it('should handle empty agent array', () => {
      const result = service.migrateAgentConfigurations([]);
      
      expect(result.providersCreated).toEqual([]);
      expect(result.agentsUpdated).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContain('No legacy agents found to migrate');
    });

    it('should migrate OpenAI cloud provider agent', () => {
      const legacyAgent: AgentConfig = {
        id: 'agent-1',
        name: 'GPT-4 Assistant',
        description: 'OpenAI GPT-4 agent',
        modelConfig: {
          name: 'GPT-4',
          provider: 'openai',
          model: 'gpt-4',
          apiKey: 'sk-test-key',
          temperature: 0.7,
          maxTokens: 4000
        },
        systemPrompt: 'You are a helpful assistant',
        capabilities: {
          hasVision: false,
          supportsToolCalling: true,
          supportsStreaming: true
        }
      };

      const result = service.migrateAgentConfigurations([legacyAgent]);

      expect(result.errors).toEqual([]);
      expect(result.providersCreated).toHaveLength(1);
      expect(result.agentsUpdated).toHaveLength(1);

      const provider = result.providersCreated[0] as CloudProvider;
      expect(provider.type).toBe('cloud');
      expect(provider.provider).toBe('openai');
      expect(provider.name).toBe('OpenAI');
      expect(provider.apiKey).toBe('sk-test-key');
      expect(provider.isActive).toBe(true);

      const agent = result.agentsUpdated[0];
      expect(agent.name).toBe('GPT-4 Assistant');
      expect(agent.model).toBe('gpt-4');
      expect(agent.temperature).toBe(0.7);
      expect(agent.maxTokens).toBe(4000);
      expect(agent.systemPrompt).toBe('You are a helpful assistant');
      expect(agent.capabilities.hasToolUse).toBe(true);
      expect(agent.capabilities.reasoningDepth).toBe('advanced');
      expect(agent.capabilities.costTier).toBe('high');
    });

    it('should migrate Ollama local provider agent', () => {
      const legacyAgent: AgentConfig = {
        id: 'agent-2',
        name: 'Local Llama',
        description: 'Local Ollama agent',
        modelConfig: {
          name: 'Llama 2',
          provider: 'ollama',
          model: 'llama2:7b',
          endpoint: 'http://localhost:11434',
          temperature: 0.5,
          maxTokens: 2000
        }
      };

      const result = service.migrateAgentConfigurations([legacyAgent]);

      expect(result.errors).toEqual([]);
      expect(result.providersCreated).toHaveLength(1);
      expect(result.agentsUpdated).toHaveLength(1);

      const provider = result.providersCreated[0] as LocalNetworkProvider;
      expect(provider.type).toBe('local-network');
      expect(provider.provider).toBe('ollama');
      expect(provider.name).toBe('Local Ollama');
      expect(provider.endpoint).toBe('http://localhost:11434');
      expect(provider.localHostType).toBe('ollama');
      expect(provider.apiKey).toBeUndefined();

      const agent = result.agentsUpdated[0];
      expect(agent.name).toBe('Local Llama');
      expect(agent.model).toBe('llama2:7b');
      expect(agent.capabilities.costTier).toBe('low');
      expect(agent.capabilities.speed).toBe('fast');
    });

    it('should migrate custom provider agent', () => {
      const legacyAgent: AgentConfig = {
        id: 'agent-3',
        name: 'Custom API Agent',
        description: 'Custom API endpoint',
        modelConfig: {
          name: 'Custom Model',
          provider: 'custom',
          model: 'custom-model-v1',
          endpoint: 'https://api.example.com/v1',
          apiKey: 'custom-api-key',
          temperature: 0.8
        }
      };

      const result = service.migrateAgentConfigurations([legacyAgent]);

      expect(result.errors).toEqual([]);
      expect(result.providersCreated).toHaveLength(1);
      expect(result.agentsUpdated).toHaveLength(1);

      const provider = result.providersCreated[0] as LocalNetworkProvider;
      expect(provider.type).toBe('local-network');
      expect(provider.provider).toBe('custom');
      expect(provider.name).toBe('Custom (api.example.com)');
      expect(provider.endpoint).toBe('https://api.example.com/v1');
      expect(provider.localHostType).toBe('custom');
      expect(provider.apiKey).toBe('custom-api-key');
    });

    it('should consolidate multiple agents with same provider', () => {
      const legacyAgents: AgentConfig[] = [
        {
          id: 'agent-1',
          name: 'GPT-4 Assistant',
          description: 'First OpenAI agent',
          modelConfig: {
            name: 'GPT-4',
            provider: 'openai',
            model: 'gpt-4',
            apiKey: 'sk-test-key'
          }
        },
        {
          id: 'agent-2',
          name: 'GPT-3.5 Assistant',
          description: 'Second OpenAI agent',
          modelConfig: {
            name: 'GPT-3.5',
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            apiKey: 'sk-test-key'
          }
        }
      ];

      const result = service.migrateAgentConfigurations(legacyAgents);

      expect(result.errors).toEqual([]);
      expect(result.providersCreated).toHaveLength(1); // Should consolidate to one provider
      expect(result.agentsUpdated).toHaveLength(2); // But keep both agents

      const provider = result.providersCreated[0];
      expect(provider.provider).toBe('openai');
      expect(provider.name).toBe('OpenAI');

      // Both agents should reference the same provider
      const providerIds = result.agentsUpdated.map(a => a.providerId);
      expect(new Set(providerIds).size).toBe(1); // All agents use same provider ID
    });

    it('should handle agents with missing model config', () => {
      const legacyAgent: AgentConfig = {
        id: 'agent-invalid',
        name: 'Invalid Agent',
        description: 'Agent without model config',
        modelConfig: undefined as any
      };

      const result = service.migrateAgentConfigurations([legacyAgent]);

      expect(result.providersCreated).toHaveLength(0);
      expect(result.agentsUpdated).toHaveLength(0);
      expect(result.warnings).toContain('Agent Invalid Agent has no model configuration, skipping');
    });

    it('should handle cloud provider without API key', () => {
      const legacyAgent: AgentConfig = {
        id: 'agent-no-key',
        name: 'OpenAI No Key',
        description: 'OpenAI agent without API key',
        modelConfig: {
          name: 'GPT-4',
          provider: 'openai',
          model: 'gpt-4'
          // Missing apiKey
        }
      };

      const result = service.migrateAgentConfigurations([legacyAgent]);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('requires an API key');
    });

    it('should handle local provider without endpoint', () => {
      const legacyAgent: AgentConfig = {
        id: 'agent-no-endpoint',
        name: 'Custom No Endpoint',
        description: 'Custom agent without endpoint',
        modelConfig: {
          name: 'Custom Model',
          provider: 'custom',
          model: 'custom-model'
          // Missing endpoint
        }
      };

      const result = service.migrateAgentConfigurations([legacyAgent]);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('requires an endpoint');
    });

    it('should preserve extended agent config properties', () => {
      const legacyAgent: ExtendedAgentConfig = {
        id: 'agent-extended',
        name: 'Extended Agent',
        description: 'Agent with extended properties',
        modelConfig: {
          name: 'GPT-4',
          provider: 'openai',
          model: 'gpt-4',
          apiKey: 'sk-test-key'
        },
        isActive: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        temperature: 0.9,
        maxTokens: 8000,
        timeout: 60000
      };

      const result = service.migrateAgentConfigurations([legacyAgent]);

      expect(result.errors).toEqual([]);
      expect(result.agentsUpdated).toHaveLength(1);

      const agent = result.agentsUpdated[0];
      expect(agent.isActive).toBe(false);
      expect(agent.createdAt).toEqual(new Date('2024-01-01'));
      expect(agent.updatedAt).toEqual(new Date('2024-01-02'));
      expect(agent.temperature).toBe(0.9);
      expect(agent.maxTokens).toBe(8000);
      expect(agent.timeout).toBe(60000);
    });
  });

  describe('validateMigrationResults', () => {
    it('should validate successful migration', () => {
      const migrationData: MigrationData = {
        providersCreated: [{
          id: 'provider-1',
          name: 'OpenAI',
          type: 'cloud',
          provider: 'openai',
          apiKey: 'sk-test-key',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        } as CloudProvider],
        agentsUpdated: [{
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
        }],
        errors: [],
        warnings: []
      };

      const result = service.validateMigrationResults(migrationData);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect invalid provider configuration', () => {
      const migrationData: MigrationData = {
        providersCreated: [{
          id: '',
          name: '',
          type: 'cloud',
          provider: 'openai',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        } as CloudProvider],
        agentsUpdated: [],
        errors: [],
        warnings: []
      };

      const result = service.validateMigrationResults(migrationData);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing id or name');
    });

    it('should detect cloud provider without API key', () => {
      const migrationData: MigrationData = {
        providersCreated: [{
          id: 'provider-1',
          name: 'OpenAI',
          type: 'cloud',
          provider: 'openai',
          // Missing apiKey
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        } as CloudProvider],
        agentsUpdated: [],
        errors: [],
        warnings: []
      };

      const result = service.validateMigrationResults(migrationData);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing API key');
    });

    it('should detect invalid agent configuration', () => {
      const migrationData: MigrationData = {
        providersCreated: [],
        agentsUpdated: [{
          id: '',
          name: '',
          providerId: '',
          model: '',
          capabilities: {
            hasVision: false,
            hasToolUse: false,
            reasoningDepth: 'basic',
            speed: 'medium',
            costTier: 'medium'
          },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }],
        errors: [],
        warnings: []
      };

      const result = service.validateMigrationResults(migrationData);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing required fields');
    });
  });

  describe('generateMigrationReport', () => {
    it('should generate comprehensive migration report', () => {
      const migrationData: MigrationData = {
        providersCreated: [{
          id: 'provider-1',
          name: 'OpenAI',
          type: 'cloud',
          provider: 'openai',
          apiKey: 'sk-test-key',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        } as CloudProvider],
        agentsUpdated: [{
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
        }],
        errors: ['Test error'],
        warnings: ['Test warning']
      };

      const report = service.generateMigrationReport(migrationData);

      expect(report).toContain('=== Migration Report ===');
      expect(report).toContain('Providers Created: 1');
      expect(report).toContain('Agents Updated: 1');
      expect(report).toContain('Errors: 1');
      expect(report).toContain('Warnings: 1');
      expect(report).toContain('OpenAI (cloud, openai)');
      expect(report).toContain('GPT-4 Assistant -> Provider: provider-1, Model: gpt-4');
      expect(report).toContain('Test error');
      expect(report).toContain('Test warning');
    });

    it('should handle empty migration data', () => {
      const migrationData: MigrationData = {
        providersCreated: [],
        agentsUpdated: [],
        errors: [],
        warnings: []
      };

      const report = service.generateMigrationReport(migrationData);

      expect(report).toContain('=== Migration Report ===');
      expect(report).toContain('Providers Created: 0');
      expect(report).toContain('Agents Updated: 0');
      expect(report).toContain('Errors: 0');
      expect(report).toContain('Warnings: 0');
    });
  });

  describe('capability inference', () => {
    it('should infer GPT-4 capabilities correctly', () => {
      const legacyAgent: AgentConfig = {
        id: 'agent-gpt4',
        name: 'GPT-4 Agent',
        description: 'GPT-4 agent',
        modelConfig: {
          name: 'GPT-4',
          provider: 'openai',
          model: 'gpt-4-turbo'
        }
      };

      const result = service.migrateAgentConfigurations([legacyAgent]);
      const agent = result.agentsUpdated[0];

      expect(agent.capabilities.reasoningDepth).toBe('advanced');
      expect(agent.capabilities.hasToolUse).toBe(true);
      expect(agent.capabilities.costTier).toBe('high');
      expect(agent.capabilities.speed).toBe('medium');
    });

    it('should infer Anthropic capabilities correctly', () => {
      const legacyAgent: AgentConfig = {
        id: 'agent-claude',
        name: 'Claude Agent',
        description: 'Anthropic Claude agent',
        modelConfig: {
          name: 'Claude',
          provider: 'anthropic',
          model: 'claude-3-opus'
        }
      };

      const result = service.migrateAgentConfigurations([legacyAgent]);
      const agent = result.agentsUpdated[0];

      expect(agent.capabilities.reasoningDepth).toBe('advanced');
      expect(agent.capabilities.hasToolUse).toBe(true);
      expect(agent.capabilities.hasVision).toBe(true);
      expect(agent.capabilities.costTier).toBe('high');
    });

    it('should infer Ollama capabilities correctly', () => {
      const legacyAgent: AgentConfig = {
        id: 'agent-ollama',
        name: 'Ollama Agent',
        description: 'Local Ollama agent',
        modelConfig: {
          name: 'Llama',
          provider: 'ollama',
          model: 'llama2:70b'
        }
      };

      const result = service.migrateAgentConfigurations([legacyAgent]);
      const agent = result.agentsUpdated[0];

      expect(agent.capabilities.reasoningDepth).toBe('advanced'); // 70b model
      expect(agent.capabilities.speed).toBe('slow'); // Large model
      expect(agent.capabilities.costTier).toBe('low'); // Local model
    });
  });
});