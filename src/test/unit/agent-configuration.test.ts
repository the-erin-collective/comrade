/**
 * Unit tests for Agent Configuration Management
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ConfigurationManager } from '../../core/config';
import { ProviderManagerService } from '../../core/provider-manager';
import { Agent, ProviderConfig, AgentFormData } from '../../core/types';

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

describe('Agent Configuration Management', () => {
  let configManager: ConfigurationManager;
  let providerManager: ProviderManagerService;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock vscode.workspace.getConfiguration
    sandbox.stub(require('vscode').workspace, 'getConfiguration').returns(mockConfiguration);

    // Reset configuration
    mockConfiguration._providers = [];
    mockConfiguration._agents = [];

    // Reset singleton instances
    ConfigurationManager.resetInstance();
    ProviderManagerService.resetInstance();

    // Initialize managers
    configManager = ConfigurationManager.getInstance(mockSecretStorage as any);
    providerManager = ProviderManagerService.getInstance(mockSecretStorage as any);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Agent CRUD Operations', () => {
    it('should add agent successfully', async () => {
      // Create provider first
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const agentData: AgentFormData = {
        name: 'Test Agent',
        providerId: provider.id,
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        capabilities: {
          hasVision: false,
          hasToolUse: true,
          reasoningDepth: 'advanced',
          speed: 'medium',
          costTier: 'high'
        }
      };

      const agent = await configManager.addNewAgent(agentData);

      assert.ok(agent.id);
      assert.strictEqual(agent.name, 'Test Agent');
      assert.strictEqual(agent.providerId, provider.id);
      assert.strictEqual(agent.model, 'gpt-4');
      assert.strictEqual(agent.isActive, true);
    });

    it('should update agent successfully', async () => {
      // Create provider and agent
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const agent = await configManager.addNewAgent({
        name: 'Initial Agent',
        providerId: provider.id,
        model: 'gpt-4'
      });

      const updates = {
        name: 'Updated Agent',
        temperature: 0.5
      };

      const updatedAgent = await configManager.updateNewAgent(agent.id, updates);

      assert.strictEqual(updatedAgent.name, 'Updated Agent');
      assert.strictEqual(updatedAgent.temperature, 0.5);
      assert.strictEqual(updatedAgent.id, agent.id);
    });

    it('should delete agent successfully', async () => {
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

      assert.ok(configManager.getNewAgentById(agent.id));

      await configManager.deleteNewAgent(agent.id);

      assert.strictEqual(configManager.getNewAgentById(agent.id), null);
    });

    it('should toggle agent status successfully', async () => {
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

      assert.strictEqual(agent.isActive, true);

      const inactiveAgent = await configManager.toggleNewAgentStatus(agent.id, false);
      assert.strictEqual(inactiveAgent.isActive, false);

      const activeAgent = await configManager.toggleNewAgentStatus(agent.id, true);
      assert.strictEqual(activeAgent.isActive, true);
    });
  });

  describe('Agent Queries', () => {
    it('should return all agents', async () => {
      // Create provider and agents
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      await configManager.addNewAgent({
        name: 'Agent 1',
        providerId: provider.id,
        model: 'gpt-4'
      });

      await configManager.addNewAgent({
        name: 'Agent 2',
        providerId: provider.id,
        model: 'gpt-3.5-turbo'
      });

      const agents = configManager.getNewAgents();
      assert.strictEqual(agents.length, 2);
    });

    it('should return only active agents', async () => {
      // Create provider and agents
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const agent1 = await configManager.addNewAgent({
        name: 'Active Agent',
        providerId: provider.id,
        model: 'gpt-4'
      });

      const agent2 = await configManager.addNewAgent({
        name: 'Inactive Agent',
        providerId: provider.id,
        model: 'gpt-3.5-turbo'
      });

      await configManager.toggleNewAgentStatus(agent2.id, false);

      const activeAgents = configManager.getActiveNewAgents();
      assert.strictEqual(activeAgents.length, 1);
      assert.strictEqual(activeAgents[0].name, 'Active Agent');
    });

    it('should return agents by provider', async () => {
      // Create two providers
      const provider1 = await providerManager.addProvider({
        name: 'Provider 1',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'key1'
      });

      const provider2 = await providerManager.addProvider({
        name: 'Provider 2',
        type: 'cloud',
        provider: 'anthropic',
        apiKey: 'key2'
      });

      // Create agents for each provider
      await configManager.addNewAgent({
        name: 'Agent 1',
        providerId: provider1.id,
        model: 'gpt-4'
      });

      await configManager.addNewAgent({
        name: 'Agent 2',
        providerId: provider1.id,
        model: 'gpt-3.5-turbo'
      });

      await configManager.addNewAgent({
        name: 'Agent 3',
        providerId: provider2.id,
        model: 'claude-3-haiku'
      });

      const provider1Agents = configManager.getAgentsByProvider(provider1.id);
      const provider2Agents = configManager.getAgentsByProvider(provider2.id);

      assert.strictEqual(provider1Agents.length, 2);
      assert.strictEqual(provider2Agents.length, 1);
    });

    it('should return agent by ID', async () => {
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

      const foundAgent = configManager.getNewAgentById(agent.id);
      assert.deepStrictEqual(foundAgent, agent);
    });

    it('should return null for non-existent agent', () => {
      const agent = configManager.getNewAgentById('non-existent');
      assert.strictEqual(agent, null);
    });
  });

  describe('Agent Validation', () => {
    it('should reject agent without provider', async () => {
      const agentData: AgentFormData = {
        name: 'Test Agent',
        providerId: 'non-existent-provider',
        model: 'gpt-4'
      };

      await assert.rejects(
        configManager.addNewAgent(agentData),
        /not found|does not exist/
      );
    });

    it('should reject agent with inactive provider', async () => {
      // Create inactive provider
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      await providerManager.toggleProviderStatus(provider.id, false);

      const agentData: AgentFormData = {
        name: 'Test Agent',
        providerId: provider.id,
        model: 'gpt-4'
      };

      await assert.rejects(
        configManager.addNewAgent(agentData),
        /inactive|not active/
      );
    });

    it('should reject invalid agent data', async () => {
      // Create provider
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const invalidData: AgentFormData = {
        name: '',
        providerId: provider.id,
        model: 'gpt-4'
      };

      await assert.rejects(
        configManager.addNewAgent(invalidData),
        /name is required/
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent agent updates', async () => {
      await assert.rejects(
        configManager.updateNewAgent('non-existent', { name: 'Updated' }),
        /not found/
      );
    });

    it('should handle non-existent agent deletions', async () => {
      await assert.rejects(
        configManager.deleteNewAgent('non-existent'),
        /not found/
      );
    });

    it('should handle non-existent agent status toggles', async () => {
      await assert.rejects(
        configManager.toggleNewAgentStatus('non-existent', false),
        /not found/
      );
    });
  });

  describe('Agent Capabilities', () => {
    it('should set default capabilities when not provided', async () => {
      // Create provider
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

      assert.ok(agent.capabilities);
      assert.strictEqual(typeof agent.capabilities.hasVision, 'boolean');
      assert.strictEqual(typeof agent.capabilities.hasToolUse, 'boolean');
      assert.ok(['basic', 'intermediate', 'advanced'].includes(agent.capabilities.reasoningDepth));
      assert.ok(['fast', 'medium', 'slow'].includes(agent.capabilities.speed));
      assert.ok(['low', 'medium', 'high'].includes(agent.capabilities.costTier));
    });

    it('should use provided capabilities', async () => {
      // Create provider
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const customCapabilities = {
        hasVision: true,
        hasToolUse: false,
        reasoningDepth: 'basic' as const,
        speed: 'fast' as const,
        costTier: 'low' as const
      };

      const agent = await configManager.addNewAgent({
        name: 'Test Agent',
        providerId: provider.id,
        model: 'gpt-4',
        capabilities: customCapabilities
      });

      assert.deepStrictEqual(agent.capabilities, customCapabilities);
    });
  });
});