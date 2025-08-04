/**
 * Unit tests for the agent registry
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
// Mocha globals are provided by the test environment
import { AgentRegistry } from '../core/registry';
import { ConfigurationManager, AgentConfigurationItem } from '../core/config';
import { IAgent, PhaseType, AgentCapabilities } from '../core/agent';

// Mock configuration manager
class MockConfigurationManager extends ConfigurationManager {
  private mockAgents: AgentConfigurationItem[] = [];

  constructor() {
    const mockSecretStorage = {
      store: async (key: string, value: string) => {},
      get: async (key: string) => undefined,
      delete: async (key: string) => {},
      onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
    } as vscode.SecretStorage;
    super(mockSecretStorage);
  }

  public static getInstance(): MockConfigurationManager {
    return new MockConfigurationManager();
  }

  public async getAllAgents(): Promise<IAgent[]> {
    return this.mockAgents.map(config => this.createMockAgent(config));
  }

  public setMockAgents(agents: AgentConfigurationItem[]) {
    this.mockAgents = agents;
  }

  public async validateConfigurationOnStartup(): Promise<void> {
    // Mock implementation - do nothing
  }

  private createMockAgent(config: AgentConfigurationItem): IAgent {
    return {
      id: config.id,
      name: config.name,
      provider: config.provider,
      config: {
        provider: config.provider,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        timeout: config.timeout
      },
      capabilities: config.capabilities,
      isEnabledForAssignment: config.isEnabledForAssignment,
      isAvailable: async () => true
    };
  }
}

describe('AgentRegistry', () => {
  let mockConfigManager: MockConfigurationManager;
  let agentRegistry: AgentRegistry;
  
  // Set up Mocha hooks
  before(() => {
    // Ensure we're in test environment
    process.env.NODE_ENV = 'test';
  });

  const createTestAgent = (
    id: string, 
    name: string, 
    capabilities: Partial<AgentCapabilities> = {},
    isEnabled: boolean = true
  ): AgentConfigurationItem => ({
    id,
    name,
    provider: 'openai',
    model: 'gpt-4',
    capabilities: {
      hasVision: false,
      hasToolUse: false,
      reasoningDepth: 'intermediate',
      speed: 'medium',
      costTier: 'medium',
      maxTokens: 4000,
      supportedLanguages: ['en'],
      specializations: ['code'],
      ...capabilities
    },
    isEnabledForAssignment: isEnabled
  });

  beforeEach(async () => {
    // Reset singleton instance for clean test state
    AgentRegistry.resetInstance();
    mockConfigManager = MockConfigurationManager.getInstance();
    agentRegistry = AgentRegistry.getInstance(mockConfigManager);
  });

  it('should create singleton instance', () => {
    const instance1 = AgentRegistry.getInstance(mockConfigManager);
    const instance2 = AgentRegistry.getInstance();
    assert.strictEqual(instance1, instance2);
  });

  it('should load agents from configuration', async () => {
    const testAgents = [
      createTestAgent('agent1', 'Agent 1'),
      createTestAgent('agent2', 'Agent 2'),
      createTestAgent('agent3', 'Agent 3')
    ];

    mockConfigManager.setMockAgents(testAgents);
    await agentRegistry.initialize();

    const loadedAgents = agentRegistry.getAllAgents();
    assert.strictEqual(loadedAgents.length, 3);
    assert.strictEqual(loadedAgents[0].id, 'agent1');
    assert.strictEqual(loadedAgents[1].id, 'agent2');
    assert.strictEqual(loadedAgents[2].id, 'agent3');
  });

  it('should get agent by ID', async () => {
    const testAgents = [
      createTestAgent('test-agent', 'Test Agent')
    ];

    mockConfigManager.setMockAgents(testAgents);
    await agentRegistry.initialize();

    const agent = agentRegistry.getAgent('test-agent');
    assert.ok(agent);
    assert.strictEqual(agent.id, 'test-agent');
    assert.strictEqual(agent.name, 'Test Agent');

    const nonExistentAgent = agentRegistry.getAgent('non-existent');
    assert.strictEqual(nonExistentAgent, undefined);
  });

  it('should filter agents by auto-assignment enabled', async () => {
    const testAgents = [
      createTestAgent('enabled1', 'Enabled 1', {}, true),
      createTestAgent('disabled1', 'Disabled 1', {}, false),
      createTestAgent('enabled2', 'Enabled 2', {}, true)
    ];

    mockConfigManager.setMockAgents(testAgents);
    await agentRegistry.initialize();

    const enabledAgents = agentRegistry.getAutoAssignmentEnabledAgents();
    assert.strictEqual(enabledAgents.length, 2);
    assert.ok(enabledAgents.every(agent => agent.isEnabledForAssignment));
  });

  it('should filter agents by capabilities', async () => {
    const testAgents = [
      createTestAgent('vision-agent', 'Vision Agent', { hasVision: true }),
      createTestAgent('tool-agent', 'Tool Agent', { hasToolUse: true }),
      createTestAgent('advanced-agent', 'Advanced Agent', { reasoningDepth: 'advanced' }),
      createTestAgent('fast-agent', 'Fast Agent', { speed: 'fast' }),
      createTestAgent('low-cost-agent', 'Low Cost Agent', { costTier: 'low' })
    ];

    mockConfigManager.setMockAgents(testAgents);
    await agentRegistry.initialize();

    // Test vision capability filtering
    const visionAgents = agentRegistry.getVisionCapableAgents();
    assert.strictEqual(visionAgents.length, 1);
    assert.strictEqual(visionAgents[0].id, 'vision-agent');

    // Test tool use capability filtering
    const toolAgents = agentRegistry.getToolCapableAgents();
    assert.strictEqual(toolAgents.length, 1);
    assert.strictEqual(toolAgents[0].id, 'tool-agent');

    // Test reasoning depth filtering
    const advancedAgents = agentRegistry.getAgentsByReasoningDepth('advanced');
    assert.strictEqual(advancedAgents.length, 1);
    assert.strictEqual(advancedAgents[0].id, 'advanced-agent');

    // Test speed filtering
    const fastAgents = agentRegistry.getAgentsBySpeed('fast');
    assert.strictEqual(fastAgents.length, 1);
    assert.strictEqual(fastAgents[0].id, 'fast-agent');

    // Test cost tier filtering
    const lowCostAgents = agentRegistry.getAgentsByCostTier('low');
    assert.strictEqual(lowCostAgents.length, 1);
    assert.strictEqual(lowCostAgents[0].id, 'low-cost-agent');
  });

  it('should get agents suitable for different phases', async () => {
    const testAgents = [
      createTestAgent('fast-agent', 'Fast Agent', { speed: 'fast' }),
      createTestAgent('advanced-agent', 'Advanced Agent', { reasoningDepth: 'advanced' }),
      createTestAgent('tool-agent', 'Tool Agent', { hasToolUse: true }),
      createTestAgent('advanced-tool-agent', 'Advanced Tool Agent', { 
        reasoningDepth: 'advanced', 
        hasToolUse: true 
      })
    ];

    mockConfigManager.setMockAgents(testAgents);
    await agentRegistry.initialize();

    // Test context phase - should prefer fast or advanced agents
    const contextAgents = agentRegistry.getAgentsForPhase(PhaseType.CONTEXT);
    assert.ok(contextAgents.length > 0);
    assert.ok(contextAgents.some(agent => 
      agent.capabilities.speed === 'fast' || 
      agent.capabilities.reasoningDepth === 'advanced'
    ));

    // Test planning phase - should prefer intermediate or advanced reasoning
    const planningAgents = agentRegistry.getAgentsForPhase(PhaseType.PLANNING);
    assert.ok(planningAgents.length > 0);
    assert.ok(planningAgents.every(agent => 
      agent.capabilities.reasoningDepth === 'intermediate' || 
      agent.capabilities.reasoningDepth === 'advanced'
    ));

    // Test review phase - should prefer advanced reasoning
    const reviewAgents = agentRegistry.getAgentsForPhase(PhaseType.REVIEW);
    assert.ok(reviewAgents.length > 0);
    assert.ok(reviewAgents.every(agent => 
      agent.capabilities.reasoningDepth === 'advanced'
    ));

    // Test execution phase - should prefer tool use or advanced reasoning
    const executionAgents = agentRegistry.getAgentsForPhase(PhaseType.EXECUTION);
    assert.ok(executionAgents.length > 0);
    assert.ok(executionAgents.every(agent => 
      agent.capabilities.hasToolUse || 
      agent.capabilities.reasoningDepth === 'advanced'
    ));

    // Test recovery phase - should require both advanced reasoning and tool use
    const recoveryAgents = agentRegistry.getAgentsForPhase(PhaseType.RECOVERY);
    assert.ok(recoveryAgents.length > 0);
    assert.ok(recoveryAgents.every(agent => 
      agent.capabilities.reasoningDepth === 'advanced' && 
      agent.capabilities.hasToolUse
    ));
  });

  it('should check agent availability', async () => {
    const testAgents = [
      createTestAgent('available-agent', 'Available Agent')
    ];

    mockConfigManager.setMockAgents(testAgents);
    await agentRegistry.initialize();

    const isAvailable = await agentRegistry.isAgentAvailable('available-agent');
    assert.strictEqual(isAvailable, true);

    const isNonExistentAvailable = await agentRegistry.isAgentAvailable('non-existent');
    assert.strictEqual(isNonExistentAvailable, false);
  });

  it('should generate registry statistics', async () => {
    const testAgents = [
      createTestAgent('openai-agent', 'OpenAI Agent', { hasVision: true }),
      createTestAgent('anthropic-agent', 'Anthropic Agent', { 
        hasToolUse: true, 
        reasoningDepth: 'advanced' 
      }, false),
      createTestAgent('ollama-agent', 'Ollama Agent', { reasoningDepth: 'advanced' })
    ];

    // Set provider for variety
    testAgents[1].provider = 'anthropic';
    testAgents[2].provider = 'ollama';

    mockConfigManager.setMockAgents(testAgents);
    await agentRegistry.initialize();

    const stats = agentRegistry.getRegistryStats();
    
    assert.strictEqual(stats.totalAgents, 3);
    assert.strictEqual(stats.enabledForAssignment, 2); // anthropic-agent is disabled
    assert.strictEqual(stats.byCapability.vision, 1);
    assert.strictEqual(stats.byCapability.toolUse, 1);
    assert.strictEqual(stats.byCapability.advanced, 2);
    
    assert.strictEqual(stats.byProvider.openai, 1);
    assert.strictEqual(stats.byProvider.anthropic, 1);
    assert.strictEqual(stats.byProvider.ollama, 1);
  });

  it('should handle empty agent list', async () => {
    mockConfigManager.setMockAgents([]);
    await agentRegistry.initialize();

    const allAgents = agentRegistry.getAllAgents();
    assert.strictEqual(allAgents.length, 0);

    const enabledAgents = agentRegistry.getAutoAssignmentEnabledAgents();
    assert.strictEqual(enabledAgents.length, 0);

    const stats = agentRegistry.getRegistryStats();
    assert.strictEqual(stats.totalAgents, 0);
    assert.strictEqual(stats.enabledForAssignment, 0);
  });
});

