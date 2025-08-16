/**
 * Unit tests for Provider-Agent Dependency Management
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ProviderManagerService } from '../../core/provider-manager';
import { ConfigurationManager } from '../../core/config';
import { AgentRegistry } from '../../core/registry';
import { ProviderConfig, Agent, ProviderFormData, AgentFormData } from '../../core/types';

// Mock VS Code API
const mockSecretStorage = {
  store: async (key: string, value: string) => {},
  get: async (key: string) => undefined,
  delete: async (key: string) => {}
};

const mockConfiguration = {
  get: (key: string, defaultValue?: any) => {
    if (key === 'providers') {
      return mockConfiguration._providers || [];
    }
    if (key === 'agents') {
      return mockConfiguration._agents || [];
    }
    return defaultValue;
  },
  update: async (key: string, value: any) => {
    if (key === 'providers') {
      mockConfiguration._providers = value;
    }
    if (key === 'agents') {
      mockConfiguration._agents = value;
    }
  },
  _providers: [] as ProviderConfig[],
  _agents: [] as Agent[]
};

// Mock data
const mockProvider: ProviderConfig = {
  id: 'provider-1',
  name: 'Test Provider',
  type: 'cloud',
  provider: 'openai',
  apiKey: '',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

const mockAgent: Agent = {
  id: 'agent-1',
  name: 'Test Agent',
  providerId: 'provider-1',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 4000,
  timeout: 30000,
  systemPrompt: 'You are a helpful assistant',
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

describe('Provider-Agent Dependency Management', () => {
  let configManager: ConfigurationManager;
  let agentRegistry: AgentRegistry;
  let providerManager: ProviderManagerService;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock vscode.workspace.getConfiguration
    const originalGetConfiguration = require('vscode').workspace?.getConfiguration;
    sandbox.stub(require('vscode').workspace, 'getConfiguration').returns(mockConfiguration);

    // Reset configuration
    mockConfiguration._providers = [];
    mockConfiguration._agents = [];

    // Reset singleton instances
    ConfigurationManager.resetInstance();
    AgentRegistry.resetInstance();
    ProviderManagerService.resetInstance();

    // Initialize managers
    configManager = ConfigurationManager.getInstance(mockSecretStorage as any);
    agentRegistry = AgentRegistry.getInstance(configManager);
    providerManager = ProviderManagerService.getInstance(mockSecretStorage as any);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Provider Deactivation Impact', () => {
    it('should deactivate all agents when provider is deactivated', async () => {
      // Setup: Create provider and agents
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const agent1 = await configManager.addNewAgent({
        name: 'Agent 1',
        providerId: provider.id,
        model: 'gpt-4'
      });

      const agent2 = await configManager.addNewAgent({
        name: 'Agent 2',
        providerId: provider.id,
        model: 'gpt-3.5-turbo'
      });

      // Verify both agents are active
      assert.strictEqual(agent1.isActive, true);
      assert.strictEqual(agent2.isActive, true);

      // Deactivate provider
      await providerManager.toggleProviderStatus(provider.id, false);

      // Handle provider deactivation in agent registry
      await agentRegistry.handleProviderDeactivation(provider.id);

      // Verify agents are deactivated
      const updatedAgent1 = configManager.getNewAgentById(agent1.id);
      const updatedAgent2 = configManager.getNewAgentById(agent2.id);

      assert.strictEqual(updatedAgent1?.isActive, false);
      assert.strictEqual(updatedAgent2?.isActive, false);
    });

    it('should not affect agents from other providers', async () => {
      // Setup: Create two providers with agents
      const provider1 = await providerManager.addProvider({
        name: 'Provider 1',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key-1'
      });

      const provider2 = await providerManager.addProvider({
        name: 'Provider 2',
        type: 'cloud',
        provider: 'anthropic',
        apiKey: 'test-key-2'
      });

      const agent1 = await configManager.addNewAgent({
        name: 'Agent 1',
        providerId: provider1.id,
        model: 'gpt-4'
      });

      const agent2 = await configManager.addNewAgent({
        name: 'Agent 2',
        providerId: provider2.id,
        model: 'claude-3-haiku'
      });

      // Deactivate only provider1
      await providerManager.toggleProviderStatus(provider1.id, false);
      await agentRegistry.handleProviderDeactivation(provider1.id);

      // Verify only agent1 is deactivated
      const updatedAgent1 = configManager.getNewAgentById(agent1.id);
      const updatedAgent2 = configManager.getNewAgentById(agent2.id);

      assert.strictEqual(updatedAgent1?.isActive, false);
      assert.strictEqual(updatedAgent2?.isActive, true);
    });
  });

  describe('Provider Deletion Impact', () => {
    it('should delete all agents when provider is deleted', async () => {
      // Setup: Create provider and agents
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const agent1 = await configManager.addNewAgent({
        name: 'Agent 1',
        providerId: provider.id,
        model: 'gpt-4'
      });

      const agent2 = await configManager.addNewAgent({
        name: 'Agent 2',
        providerId: provider.id,
        model: 'gpt-3.5-turbo'
      });

      // Verify agents exist
      assert.ok(configManager.getNewAgentById(agent1.id));
      assert.ok(configManager.getNewAgentById(agent2.id));

      // Delete provider
      await providerManager.deleteProvider(provider.id);

      // Handle provider deletion in agent registry
      await agentRegistry.handleProviderDeletion(provider.id);

      // Verify agents are deleted
      assert.strictEqual(configManager.getNewAgentById(agent1.id), null);
      assert.strictEqual(configManager.getNewAgentById(agent2.id), null);
    });

    it('should not affect agents from other providers when deleting', async () => {
      // Setup: Create two providers with agents
      const provider1 = await providerManager.addProvider({
        name: 'Provider 1',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key-1'
      });

      const provider2 = await providerManager.addProvider({
        name: 'Provider 2',
        type: 'cloud',
        provider: 'anthropic',
        apiKey: 'test-key-2'
      });

      const agent1 = await configManager.addNewAgent({
        name: 'Agent 1',
        providerId: provider1.id,
        model: 'gpt-4'
      });

      const agent2 = await configManager.addNewAgent({
        name: 'Agent 2',
        providerId: provider2.id,
        model: 'claude-3-haiku'
      });

      // Delete only provider1
      await providerManager.deleteProvider(provider1.id);
      await agentRegistry.handleProviderDeletion(provider1.id);

      // Verify only agent1 is deleted
      assert.strictEqual(configManager.getNewAgentById(agent1.id), null);
      assert.ok(configManager.getNewAgentById(agent2.id));
    });
  });

  describe('Agent Creation Dependencies', () => {
    it('should prevent agent creation with inactive provider', async () => {
      // Create an inactive provider
      const provider = await providerManager.addProvider({
        name: 'Inactive Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      // Deactivate the provider
      await providerManager.toggleProviderStatus(provider.id, false);

      // Try to create agent with inactive provider
      try {
        await configManager.addNewAgent({
          name: 'New Agent',
          providerId: provider.id,
          model: 'gpt-4'
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('inactive') || error.message.includes('not active'));
      }
    });

    it('should prevent agent creation with non-existent provider', async () => {
      // Try to create agent with non-existent provider
      try {
        await configManager.addNewAgent({
          name: 'New Agent',
          providerId: 'non-existent-provider',
          model: 'gpt-4'
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('not found') || error.message.includes('does not exist'));
      }
    });

    it('should allow agent creation with active provider', async () => {
      // Create an active provider
      const provider = await providerManager.addProvider({
        name: 'Active Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      // Create agent with active provider
      const agent = await configManager.addNewAgent({
        name: 'New Agent',
        providerId: provider.id,
        model: 'gpt-4'
      });

      assert.ok(agent);
      assert.strictEqual(agent.name, 'New Agent');
      assert.strictEqual(agent.providerId, provider.id);
      assert.strictEqual(agent.isActive, true);
    });
  });

  describe('Agent Update Dependencies', () => {
    it('should prevent agent update to inactive provider', async () => {
      // Create two providers
      const activeProvider = await providerManager.addProvider({
        name: 'Active Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key-1'
      });

      const inactiveProvider = await providerManager.addProvider({
        name: 'Inactive Provider',
        type: 'cloud',
        provider: 'anthropic',
        apiKey: 'test-key-2'
      });

      // Deactivate the second provider
      await providerManager.toggleProviderStatus(inactiveProvider.id, false);

      // Create agent with active provider
      const agent = await configManager.addNewAgent({
        name: 'Test Agent',
        providerId: activeProvider.id,
        model: 'gpt-4'
      });

      // Try to update agent to use inactive provider
      try {
        await configManager.updateNewAgent(agent.id, {
          providerId: inactiveProvider.id
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('inactive') || error.message.includes('not active'));
      }
    });

    it('should prevent agent update to non-existent provider', async () => {
      // Create provider and agent
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const agent = await configManager.addNewAgent({
        name: 'Test Agent',
        providerId: provider.id,
        model: 'gpt-4'
      });

      // Try to update agent to use non-existent provider
      try {
        await configManager.updateNewAgent(agent.id, {
          providerId: 'non-existent-provider'
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('not found') || error.message.includes('does not exist'));
      }
    });

    it('should allow agent update to active provider', async () => {
      // Create two active providers
      const provider1 = await providerManager.addProvider({
        name: 'Provider 1',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key-1'
      });

      const provider2 = await providerManager.addProvider({
        name: 'Provider 2',
        type: 'cloud',
        provider: 'anthropic',
        apiKey: 'test-key-2'
      });

      // Create agent with first provider
      const agent = await configManager.addNewAgent({
        name: 'Test Agent',
        providerId: provider1.id,
        model: 'gpt-4'
      });

      // Update agent to use second provider
      const updatedAgent = await configManager.updateNewAgent(agent.id, {
        providerId: provider2.id,
        name: 'Updated Agent'
      });

      assert.strictEqual(updatedAgent.providerId, provider2.id);
      assert.strictEqual(updatedAgent.name, 'Updated Agent');
    });
  });

  describe('Agent Query by Provider', () => {
    it('should return agents for specific provider', async () => {
      // Create provider and agents
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const agent1 = await configManager.addNewAgent({
        name: 'Agent 1',
        providerId: provider.id,
        model: 'gpt-4'
      });

      const agent2 = await configManager.addNewAgent({
        name: 'Agent 2',
        providerId: provider.id,
        model: 'gpt-3.5-turbo'
      });

      // Query agents by provider
      const agents = configManager.getNewAgentsByProvider(provider.id);

      assert.strictEqual(agents.length, 2);
      assert.strictEqual(agents[0].providerId, provider.id);
      assert.strictEqual(agents[1].providerId, provider.id);
    });

    it('should return empty array for provider with no agents', () => {
      const agents = configManager.getNewAgentsByProvider('non-existent-provider');
      assert.strictEqual(agents.length, 0);
    });

    it('should return agent with provider information', async () => {
      // Create provider and agent
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const agent = await configManager.addNewAgent({
        name: 'Test Agent',
        providerId: provider.id,
        model: 'gpt-4'
      });

      // Get agent with provider info
      const agentWithProvider = agentRegistry.getAgentWithProvider(agent.id);

      assert.ok(agentWithProvider);
      assert.strictEqual(agentWithProvider.agent.id, agent.id);
      assert.strictEqual(agentWithProvider.provider.id, provider.id);
    });

    it('should return null when agent provider not found', async () => {
      // Create agent with invalid provider reference
      const invalidAgent = {
        ...mockAgent,
        providerId: 'non-existent-provider'
      };

      // Manually add to configuration to simulate corrupted state
      mockConfiguration._agents = [invalidAgent];

      const agentWithProvider = agentRegistry.getAgentWithProvider(invalidAgent.id);
      assert.strictEqual(agentWithProvider, null);
    });
  });

  describe('Model Loading Dependencies', () => {
    it('should load models for provider', async () => {
      // Create provider
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      // Mock the model fetching
      const fetchModelsStub = sandbox.stub(providerManager, 'fetchAvailableModels');
      fetchModelsStub.resolves(['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo']);

      // Load models
      const models = await providerManager.fetchAvailableModels(provider.id);

      assert.ok(fetchModelsStub.calledWith(provider.id));
      assert.deepStrictEqual(models, ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo']);
    });

    it('should handle model loading errors gracefully', async () => {
      // Create provider
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'invalid-key'
      });

      // Mock the model fetching to fail
      const fetchModelsStub = sandbox.stub(providerManager, 'fetchAvailableModels');
      fetchModelsStub.rejects(new Error('API key invalid'));

      // Try to load models
      try {
        await providerManager.fetchAvailableModels(provider.id);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('API key invalid'));
      }
    });

    it('should return empty array for non-existent provider', async () => {
      // Mock the model fetching for non-existent provider
      const fetchModelsStub = sandbox.stub(providerManager, 'fetchAvailableModels');
      fetchModelsStub.rejects(new Error('Provider not found'));

      try {
        await providerManager.fetchAvailableModels('non-existent-provider');
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('Provider not found'));
      }
    });
  });

  describe('Dependency Validation', () => {
    it('should validate agent dependencies before operations', async () => {
      // Test that provider existence is checked before agent operations
      try {
        await configManager.addNewAgent({
          name: 'Test Agent',
          providerId: 'non-existent-provider',
          model: 'gpt-4'
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('not found') || error.message.includes('does not exist'));
      }
    });

    it('should validate provider status before operations', async () => {
      // Create inactive provider
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      await providerManager.toggleProviderStatus(provider.id, false);

      // Try to create agent with inactive provider
      try {
        await configManager.addNewAgent({
          name: 'Test Agent',
          providerId: provider.id,
          model: 'gpt-4'
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('inactive') || error.message.includes('not active'));
      }
    });

    it('should validate agent-provider relationships', async () => {
      // Create provider and agent
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const agent = await configManager.addNewAgent({
        name: 'Test Agent',
        providerId: provider.id,
        model: 'gpt-4'
      });

      // Validate the relationship
      const validation = await agentRegistry.validateAgentWithProvider(agent.id);

      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.errors.length, 0);
    });
  });

  describe('Cascade Operations', () => {
    it('should handle cascade deactivation when provider becomes inactive', async () => {
      // Create provider and agents
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const agent1 = await configManager.addNewAgent({
        name: 'Agent 1',
        providerId: provider.id,
        model: 'gpt-4'
      });

      const agent2 = await configManager.addNewAgent({
        name: 'Agent 2',
        providerId: provider.id,
        model: 'gpt-3.5-turbo'
      });

      // Verify agents are active
      assert.strictEqual(agent1.isActive, true);
      assert.strictEqual(agent2.isActive, true);

      // Deactivate provider and handle cascade
      await providerManager.toggleProviderStatus(provider.id, false);
      await agentRegistry.handleProviderDeactivation(provider.id);

      // Verify agents are deactivated
      const updatedAgent1 = configManager.getNewAgentById(agent1.id);
      const updatedAgent2 = configManager.getNewAgentById(agent2.id);

      assert.strictEqual(updatedAgent1?.isActive, false);
      assert.strictEqual(updatedAgent2?.isActive, false);
    });

    it('should handle cascade deletion when provider is deleted', async () => {
      // Create provider and agents
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const agent1 = await configManager.addNewAgent({
        name: 'Agent 1',
        providerId: provider.id,
        model: 'gpt-4'
      });

      const agent2 = await configManager.addNewAgent({
        name: 'Agent 2',
        providerId: provider.id,
        model: 'gpt-3.5-turbo'
      });

      // Verify agents exist
      assert.ok(configManager.getNewAgentById(agent1.id));
      assert.ok(configManager.getNewAgentById(agent2.id));

      // Delete provider and handle cascade
      await providerManager.deleteProvider(provider.id);
      await agentRegistry.handleProviderDeletion(provider.id);

      // Verify agents are deleted
      assert.strictEqual(configManager.getNewAgentById(agent1.id), null);
      assert.strictEqual(configManager.getNewAgentById(agent2.id), null);
    });
  });

  describe('Error Handling', () => {
    it('should handle provider service errors gracefully', async () => {
      // Try to create agent with non-existent provider
      try {
        await configManager.addNewAgent({
          name: 'Test Agent',
          providerId: 'non-existent-provider',
          model: 'gpt-4'
        });
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('not found') || error.message.includes('does not exist'));
      }
    });

    it('should handle model loading errors', async () => {
      // Create provider
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'invalid-key'
      });

      // Mock model loading to fail
      const fetchModelsStub = sandbox.stub(providerManager, 'fetchAvailableModels');
      fetchModelsStub.rejects(new Error('Network error'));

      // Try to load models
      try {
        await providerManager.fetchAvailableModels(provider.id);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.ok(error.message.includes('Network error'));
      }
    });

    it('should handle configuration corruption gracefully', async () => {
      // Simulate corrupted configuration
      mockConfiguration._agents = [
        {
          ...mockAgent,
          providerId: 'corrupted-provider-id'
        }
      ];

      // Try to get agent with provider
      const result = agentRegistry.getAgentWithProvider(mockAgent.id);
      assert.strictEqual(result, null);
    });

    it('should handle concurrent operations safely', async () => {
      // Create provider
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      // Create multiple agents concurrently
      const agentPromises = [];
      for (let i = 0; i < 5; i++) {
        agentPromises.push(
          configManager.addNewAgent({
            name: `Agent ${i}`,
            providerId: provider.id,
            model: 'gpt-4'
          })
        );
      }

      const agents = await Promise.all(agentPromises);

      // Verify all agents were created successfully
      assert.strictEqual(agents.length, 5);
      agents.forEach((agent, index) => {
        assert.ok(agent);
        assert.strictEqual(agent.name, `Agent ${index}`);
        assert.strictEqual(agent.providerId, provider.id);
      });
    });
  });
});