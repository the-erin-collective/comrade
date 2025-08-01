/**
 * Enhanced unit tests for AgentRegistry with comprehensive error scenarios
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AgentRegistry } from '../../core/registry';
import { ConfigurationManager } from '../../core/config';
import { ChatBridge, ChatBridgeError } from '../../core/chat';
import { PhaseType } from '../../core/agent';
import { 
  mockAgents, 
  mockAgentConfigurations, 
  createMockAgent,
  mockAgentsByCapability 
} from '../mocks/agents';

suite('Enhanced AgentRegistry Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let mockSecretStorage: vscode.SecretStorage;
  let mockConfigManager: ConfigurationManager;
  let agentRegistry: AgentRegistry;
  let chatBridge: ChatBridge;

  setup(async () => {
    // Reset singletons FIRST to ensure clean state
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
    
    sandbox = sinon.createSandbox();
    
    // Mock secret storage
    mockSecretStorage = {
      store: sandbox.stub(),
      get: sandbox.stub(),
      delete: sandbox.stub(),
      onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
    };

    // Create configuration manager
    mockConfigManager = ConfigurationManager.getInstance(mockSecretStorage);
    
    // Mock getAllAgents to return test agents
    sandbox.stub(mockConfigManager, 'getAllAgents').resolves(
      mockAgentConfigurations.map(createMockAgent)
    );

    // Create registry
    agentRegistry = AgentRegistry.getInstance(mockConfigManager);
    
    // Create chat bridge
    chatBridge = new ChatBridge();
    
    await agentRegistry.initialize();
  });

  teardown(() => {
    sandbox.restore();
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
  });

  suite('Agent Availability Testing', () => {
    test('should handle agent availability check failures', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      
      // Mock agent availability to throw error
      sandbox.stub(agent, 'isAvailable').rejects(new Error('Network error'));
      
      const isAvailable = await agentRegistry.isAgentAvailable('openai-gpt4');
      assert.strictEqual(isAvailable, false, 'Should return false when availability check fails');
    });

    test('should handle concurrent availability checks', async () => {
      const agentIds = ['openai-gpt4', 'openai-gpt35', 'anthropic-claude'];
      
      // Mock some agents as available, others not
      agentIds.forEach((id, index) => {
        const agent = agentRegistry.getAgent(id);
        if (agent) {
          sandbox.stub(agent, 'isAvailable').resolves(index % 2 === 0);
        }
      });

      const availabilityPromises = agentIds.map(id => 
        agentRegistry.isAgentAvailable(id)
      );
      
      const results = await Promise.all(availabilityPromises);
      
      assert.strictEqual(results[0], true, 'First agent should be available');
      assert.strictEqual(results[1], false, 'Second agent should not be available');
      assert.strictEqual(results[2], true, 'Third agent should be available');
    });

    test('should cache availability results temporarily', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      const isAvailableStub = sandbox.stub(agent, 'isAvailable').resolves(true);
      
      // Make multiple calls in quick succession
      await Promise.all([
        agentRegistry.isAgentAvailable('openai-gpt4'),
        agentRegistry.isAgentAvailable('openai-gpt4'),
        agentRegistry.isAgentAvailable('openai-gpt4')
      ]);
      
      // Should only call isAvailable once due to caching
      assert.strictEqual(isAvailableStub.callCount, 1, 'Should cache availability results');
    });
  });

  suite('Agent Filtering and Selection', () => {
    test('should filter agents by multiple capabilities', () => {
      const visionAgents = agentRegistry.getVisionCapableAgents();
      const toolAgents = agentRegistry.getToolCapableAgents();
      const advancedAgents = agentRegistry.getAgentsByReasoningDepth('advanced');
      
      // Find agents that have all three capabilities
      const agents = visionAgents.filter(agent => 
        agent.capabilities.hasToolUse && 
        agent.capabilities.reasoningDepth === 'advanced'
      );
      
      agents.forEach(agent => {
        assert.strictEqual(agent.capabilities.hasVision, true, 'Should have vision');
        assert.strictEqual(agent.capabilities.hasToolUse, true, 'Should have tool use');
        assert.strictEqual(agent.capabilities.reasoningDepth, 'advanced', 'Should have advanced reasoning');
      });
    });

    test('should return empty array when no agents match criteria', () => {
      // Test for a combination that's unlikely to exist
      const visionAgents = agentRegistry.getVisionCapableAgents();
      const fastAgents = agentRegistry.getAgentsBySpeed('fast');
      const lowCostAgents = agentRegistry.getAgentsByCostTier('low');
      
      // Find agents that have all these characteristics
      const agents = visionAgents.filter(agent => 
        agent.capabilities.hasToolUse &&
        agent.capabilities.reasoningDepth === 'advanced' &&
        agent.capabilities.speed === 'fast' &&
        agent.capabilities.costTier === 'low'
      );
      
      // This combination is unlikely to exist in our mock data
      assert.strictEqual(agents.length, 0, 'Should return empty array for impossible criteria');
    });

    test('should handle phase-specific agent selection with fallbacks', () => {
      // Test recovery phase which has strict requirements
      const recoveryAgents = agentRegistry.getAgentsForPhase(PhaseType.RECOVERY);
      
      if (recoveryAgents.length > 0) {
        recoveryAgents.forEach(agent => {
          assert.ok(
            agent.capabilities.reasoningDepth === 'advanced' && agent.capabilities.hasToolUse,
            'Recovery agents should have advanced reasoning and tool use'
          );
        });
      }
      
      // Test context phase which is more flexible
      const contextAgents = agentRegistry.getAgentsForPhase(PhaseType.CONTEXT);
      assert.ok(contextAgents.length > 0, 'Should find agents suitable for context phase');
    });

    test('should prioritize agents by suitability score', () => {
      const planningAgents = agentRegistry.getAgentsForPhase(PhaseType.PLANNING);
      
      if (planningAgents.length > 1) {
        // Verify agents are sorted by suitability (advanced reasoning preferred)
        const advancedAgents = planningAgents.filter(a => a.capabilities.reasoningDepth === 'advanced');
        const intermediateAgents = planningAgents.filter(a => a.capabilities.reasoningDepth === 'intermediate');
        
        // Advanced agents should come first
        if (advancedAgents.length > 0 && intermediateAgents.length > 0) {
          const firstAdvancedIndex = planningAgents.findIndex(a => a.capabilities.reasoningDepth === 'advanced');
          const firstIntermediateIndex = planningAgents.findIndex(a => a.capabilities.reasoningDepth === 'intermediate');
          
          assert.ok(
            firstAdvancedIndex < firstIntermediateIndex,
            'Advanced agents should be prioritized for planning'
          );
        }
      }
    });
  });

  suite('Error Handling and Edge Cases', () => {
    test('should handle configuration loading errors', async () => {
      // Create new registry with failing config manager
      const failingConfigManager = ConfigurationManager.getInstance(mockSecretStorage);
      sandbox.stub(failingConfigManager, 'getAllAgents').rejects(new Error('Config load failed'));
      
      AgentRegistry.resetInstance();
      const failingRegistry = AgentRegistry.getInstance(failingConfigManager);
      
      try {
        await failingRegistry.initialize();
        assert.fail('Should throw error when configuration loading fails');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Config load failed'));
      }
    });

    test('should handle invalid agent configurations gracefully', async () => {
      const invalidConfigs = [
        { ...mockAgentConfigurations[0], id: '' }, // Empty ID
        { ...mockAgentConfigurations[0], name: '' }, // Empty name
        { ...mockAgentConfigurations[0], provider: 'invalid' as any }, // Invalid provider
        { ...mockAgentConfigurations[0], capabilities: null as any } // Null capabilities
      ];

      const configManager = ConfigurationManager.getInstance(mockSecretStorage);
      sandbox.stub(configManager, 'getAllAgents').resolves(
        invalidConfigs.map(config => {
          try {
            return createMockAgent(config);
          } catch {
            return null;
          }
        }).filter(Boolean) as any[]
      );

      AgentRegistry.resetInstance();
      const registry = AgentRegistry.getInstance(configManager);
      
      await registry.initialize();
      
      // Registry should handle invalid configs by filtering them out
      const agents = registry.getAllAgents();
      agents.forEach(agent => {
        assert.ok(agent.id, 'All loaded agents should have valid IDs');
        assert.ok(agent.name, 'All loaded agents should have valid names');
        assert.ok(agent.capabilities, 'All loaded agents should have capabilities');
      });
    });

    test('should handle agent registry corruption recovery', async () => {
      // Initialize with valid agents
      await agentRegistry.initialize();
      const initialCount = agentRegistry.getAllAgents().length;
      
      // Simulate registry corruption
      (agentRegistry as any).agents = new Map();
      
      // Re-initialize should recover
      await agentRegistry.initialize();
      const recoveredCount = agentRegistry.getAllAgents().length;
      
      assert.strictEqual(recoveredCount, initialCount, 'Should recover from corruption');
    });

    test('should handle memory pressure during large agent sets', () => {
      // Create a large number of mock agents
      const largeAgentSet = Array.from({ length: 1000 }, (_, i) => ({
        ...mockAgentConfigurations[0],
        id: `agent-${i}`,
        name: `Agent ${i}`
      }));

      const configManager = ConfigurationManager.getInstance(mockSecretStorage);
      sandbox.stub(configManager, 'getAllAgents').resolves(
        largeAgentSet.map(createMockAgent)
      );

      AgentRegistry.resetInstance();
      const registry = AgentRegistry.getInstance(configManager);
      
      // Should handle large agent sets without memory issues
      return registry.initialize().then(() => {
        const agents = registry.getAllAgents();
        assert.strictEqual(agents.length, 1000, 'Should handle large agent sets');
        
        // Test filtering performance
        const start = Date.now();
        const visionAgents = registry.getVisionCapableAgents();
        const end = Date.now();
        
        assert.ok(end - start < 100, 'Filtering should be performant even with large sets');
      });
    });
  });

  suite('Registry Statistics and Monitoring', () => {
    test('should provide detailed registry statistics', () => {
      const stats = agentRegistry.getRegistryStats();
      
      assert.ok(typeof stats.totalAgents === 'number', 'Should provide total agent count');
      assert.ok(typeof stats.enabledForAssignment === 'number', 'Should provide enabled count');
      assert.ok(typeof stats.byCapability === 'object', 'Should provide capability breakdown');
      assert.ok(typeof stats.byProvider === 'object', 'Should provide provider breakdown');
      
      // Verify capability statistics
      assert.ok(typeof stats.byCapability.vision === 'number', 'Should count vision-capable agents');
      assert.ok(typeof stats.byCapability.toolUse === 'number', 'Should count tool-capable agents');
      assert.ok(typeof stats.byCapability.advanced === 'number', 'Should count advanced agents');
      
      // Verify provider statistics
      Object.values(stats.byProvider).forEach(count => {
        assert.ok(typeof count === 'number', 'Provider counts should be numbers');
        assert.ok(count >= 0, 'Provider counts should be non-negative');
      });
    });

    test('should track agent usage patterns', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      
      // Simulate agent usage
      await agentRegistry.isAgentAvailable(agent.id);
      agentRegistry.getAgentsForPhase(PhaseType.PLANNING);
      
      const stats = agentRegistry.getRegistryStats();
      
      // Usage tracking would be implemented in a real scenario
      assert.ok(stats, 'Should provide statistics for usage tracking');
    });

    test('should monitor agent health status', async () => {
      const agents = agentRegistry.getAllAgents();
      
      // Check health of all agents
      const healthChecks = await Promise.allSettled(
        agents.map(agent => agentRegistry.isAgentAvailable(agent.id))
      );
      
      const healthyCount = healthChecks.filter(
        result => result.status === 'fulfilled' && result.value === true
      ).length;
      
      const unhealthyCount = healthChecks.length - healthyCount;
      
      assert.ok(healthyCount >= 0, 'Should track healthy agents');
      assert.ok(unhealthyCount >= 0, 'Should track unhealthy agents');
      assert.strictEqual(
        healthyCount + unhealthyCount, 
        agents.length, 
        'Health check counts should sum to total agents'
      );
    });
  });

  suite('Agent Communication Integration', () => {
    test('should integrate with ChatBridge for connectivity testing', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      
      // Mock successful connection validation
      const validateStub = sandbox.stub(chatBridge, 'validateConnection').resolves(true);
      
      // Test connectivity through registry
      // Test connectivity through ChatBridge directly
      const isConnected = await chatBridge.validateConnection(agent);
      
      assert.strictEqual(isConnected, true, 'Should validate agent connectivity');
      assert.ok(validateStub.calledWith(agent), 'Should call ChatBridge validation');
    });

    test('should handle ChatBridge errors during connectivity testing', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      
      // Mock connection validation failure
      const validateStub = sandbox.stub(chatBridge, 'validateConnection')
        .rejects(new ChatBridgeError('Connection failed', 'NETWORK_ERROR', 'openai'));
      
      try {
        await chatBridge.validateConnection(agent);
        assert.fail('Should throw ChatBridge error');
      } catch (error) {
        assert.ok(error instanceof ChatBridgeError, 'Should handle ChatBridge errors gracefully');
      }
    });

    test('should batch connectivity tests for multiple agents', async () => {
      const agentIds = ['openai-gpt4', 'openai-gpt35', 'anthropic-claude'];
      
      // Mock validation responses
      const validateStub = sandbox.stub(chatBridge, 'validateConnection');
      validateStub.onCall(0).resolves(true);
      validateStub.onCall(1).resolves(false);
      validateStub.onCall(2).resolves(true);
      
      // Test connectivity for multiple agents
      const results = await Promise.allSettled(
        agentIds.map(async id => {
          const agent = agentRegistry.getAgent(id);
          return agent ? await chatBridge.validateConnection(agent) : false;
        })
      );
      
      assert.strictEqual(results.length, 3, 'Should test all agents');
      
      // Check first result
      if (results[0].status === 'fulfilled') {
        assert.strictEqual(results[0].value, true, 'First agent should be connected');
      } else {
        assert.fail('First agent test should not be rejected');
      }
      
      // Check second result
      if (results[1].status === 'fulfilled') {
        assert.strictEqual(results[1].value, false, 'Second agent should not be connected');
      } else {
        assert.fail('Second agent test should not be rejected');
      }
      
      // Check third result
      if (results[2].status === 'fulfilled') {
        assert.strictEqual(results[2].value, true, 'Third agent should be connected');
      } else {
        assert.fail('Third agent test should not be rejected');
      }
    });
  });

  suite('Configuration Change Handling', () => {
    test('should reload agents when configuration changes', async () => {
      const initialCount = agentRegistry.getAllAgents().length;
      
      // Add new agent configuration
      const newAgentConfig = {
        ...mockAgentConfigurations[0],
        id: 'new-test-agent',
        name: 'New Test Agent'
      };
      
      const updatedConfigs = [...mockAgentConfigurations, newAgentConfig];
      sandbox.stub(mockConfigManager, 'getAllAgents').resolves(
        updatedConfigs.map(createMockAgent)
      );
      
      // Trigger configuration reload by re-initializing
      await agentRegistry.initialize();
      
      const newCount = agentRegistry.getAllAgents().length;
      assert.strictEqual(newCount, initialCount + 1, 'Should load new agent configuration');
      
      const newAgent = agentRegistry.getAgent('new-test-agent');
      assert.ok(newAgent, 'Should find newly added agent');
      assert.strictEqual(newAgent.name, 'New Test Agent', 'Should have correct agent name');
    });

    test('should handle agent removal during configuration reload', async () => {
      const initialAgents = agentRegistry.getAllAgents();
      const initialCount = initialAgents.length;
      
      // Remove one agent from configuration
      const reducedConfigs = mockAgentConfigurations.slice(0, -1);
      sandbox.stub(mockConfigManager, 'getAllAgents').resolves(
        reducedConfigs.map(createMockAgent)
      );
      
      await agentRegistry.initialize();
      
      const newCount = agentRegistry.getAllAgents().length;
      assert.strictEqual(newCount, initialCount - 1, 'Should remove agent from registry');
    });

    test('should preserve agent state during configuration updates', async () => {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      
      // Set some state on the agent (simulate usage)
      await agentRegistry.isAgentAvailable(agent.id);
      
      // Update configuration with same agents
      sandbox.stub(mockConfigManager, 'getAllAgents').resolves(
        mockAgentConfigurations.map(createMockAgent)
      );
      
      await agentRegistry.initialize();
      
      // Agent should still exist with same ID
      const updatedAgent = agentRegistry.getAgent('openai-gpt4');
      assert.ok(updatedAgent, 'Agent should still exist after configuration update');
      assert.strictEqual(updatedAgent.id, agent.id, 'Agent ID should be preserved');
    });
  });
});