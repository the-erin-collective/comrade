/**
 * Integration tests for Configuration Validation Engine with ConfigurationManager
 * Tests the complete validation workflow including VS Code integration
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
// Mocha globals are provided by the test environment
import { ConfigurationManager, AgentConfigurationItem, MCPServerConfig } from '../../core/config';


// Mock VS Code APIs
const mockSecretStorage = {
  store: async (_key: string, _value: string) => {},
  get: async (_key: string) => undefined,
  delete: async (_key: string) => {},
  onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
} as vscode.SecretStorage;

let mockConfigData: any = {};
const mockConfiguration = {
  get: <T>(key: string, defaultValue?: T) => {
    const value = mockConfigData[key];
    return value !== undefined ? value : defaultValue;
  },
  update: async (key: string, value: any, _target?: vscode.ConfigurationTarget) => {
    mockConfigData[key] = value;
  },
  has: (key: string) => mockConfigData.hasOwnProperty(key),
  inspect: (_key: string) => undefined
} as vscode.WorkspaceConfiguration;

// Mock vscode.workspace.getConfiguration
const originalGetConfiguration = vscode.workspace.getConfiguration;
(vscode.workspace as any).getConfiguration = (_section?: string) => mockConfiguration;

describe('Configuration Validation Integration Tests', () => {
  let configManager: ConfigurationManager;

  beforeEach(() => {
    // Reset mock data
    mockConfigData = {};
    ConfigurationManager.resetInstance();
    configManager = ConfigurationManager.getInstance(mockSecretStorage);
  });

  afterEach(() => {
    // Reset the mock
    (vscode.workspace as any).getConfiguration = originalGetConfiguration;
  });

  describe('Agent Configuration Integration', () => {  it('should validate and save valid agent configuration', async () => {
      const validAgent: AgentConfigurationItem = {
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 4000,
        timeout: 30000,
        capabilities: {
          hasVision: true,
          hasToolUse: true,
          reasoningDepth: 'advanced',
          speed: 'medium',
          costTier: 'high',
          maxTokens: 4000,
          supportedLanguages: ['en'],
          specializations: ['code', 'analysis']
        },
        isEnabledForAssignment: true
      };

      // Should not throw
      await configManager.addAgent(validAgent);
      
      // Verify it was saved
      const savedAgents = mockConfigData['agents'] as AgentConfigurationItem[];
      assert.ok(savedAgents);
      assert.strictEqual(savedAgents.length, 1);
      assert.strictEqual(savedAgents[0].id, validAgent.id);
    });

  it('should reject invalid agent configuration before save (Requirement 6.4)', async () => {
      const invalidAgent = {
        // Missing required fields
        name: 'Invalid Agent',
        provider: 'invalid-provider'
      } as any;

      try {
        await configManager.addAgent(invalidAgent);
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('validation failed'));
      }

      // Verify nothing was saved
      const savedAgents = mockConfigData['agents'];
      assert.ok(!savedAgents || savedAgents.length === 0);
    });

  it('should apply defaults when loading configuration (Requirement 6.1)', () => {
      // Set up minimal agent configuration in mock data
      mockConfigData['agents'] = [{
        id: 'minimal-agent',
        name: 'Minimal Agent',
        provider: 'openai',
        model: 'gpt-4',
        capabilities: {}
      }];

      const config = configManager.getConfiguration();
      
      assert.strictEqual(config.agents.length, 1);
      const agent = config.agents[0];
      
      // Verify defaults were applied
      assert.strictEqual(agent.temperature, 0.7);
      assert.strictEqual(agent.timeout, 30000);
      assert.strictEqual(agent.isEnabledForAssignment, true);
      assert.strictEqual(agent.capabilities.hasVision, false);
      assert.strictEqual(agent.capabilities.reasoningDepth, 'intermediate');
      assert.deepStrictEqual(agent.capabilities.supportedLanguages, ['en']);
    });

  it('should filter out invalid configurations when loading (Requirement 6.3)', () => {
      // Set up mixed valid/invalid configurations
      mockConfigData['agents'] = [
        {
          id: 'valid-agent',
          name: 'Valid Agent',
          provider: 'openai',
          model: 'gpt-4',
          capabilities: {}
        },
        {
          // Invalid - missing required fields
          name: 'Invalid Agent',
          provider: 'invalid-provider'
        },
        {
          id: 'another-valid',
          name: 'Another Valid Agent',
          provider: 'anthropic',
          model: 'claude-3-sonnet',
          capabilities: {}
        },
        null, // Invalid entry
        'not-an-object' // Invalid entry
      ];

      const config = configManager.getConfiguration();
      
      // Should only load valid configurations
      assert.strictEqual(config.agents.length, 2);
      assert.strictEqual(config.agents[0].id, 'valid-agent');
      assert.strictEqual(config.agents[1].id, 'another-valid');
    });

  it('should handle corrupted configuration gracefully', () => {
      // Set up corrupted configuration
      mockConfigData['agents'] = 'not-an-array';
      mockConfigData['assignment.defaultMode'] = 'invalid-mode';

      const config = configManager.getConfiguration();
      
      // Should return safe defaults
      assert.deepStrictEqual(config.agents, []);
      assert.strictEqual(config.assignmentDefaultMode, 'speed');
      assert.strictEqual(config.contextMaxFiles, 100);
      assert.strictEqual(config.contextMaxTokens, 8000);
    });

  it('should validate agent array updates', async () => {
      const agents: AgentConfigurationItem[] = [
        {
          id: 'agent-1',
          name: 'Agent 1',
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
            specializations: ['code']
          },
          isEnabledForAssignment: true
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          provider: 'anthropic',
          model: 'claude-3-sonnet',
          capabilities: {
            hasVision: false,
            hasToolUse: true,
            reasoningDepth: 'advanced',
            speed: 'medium',
            costTier: 'medium',
            maxTokens: 8000,
            supportedLanguages: ['en'],
            specializations: ['code', 'reasoning']
          },
          isEnabledForAssignment: true
        }
      ];

      // Should not throw
      await configManager.updateAgentConfiguration(agents);
      
      // Verify both agents were saved
      const savedAgents = mockConfigData['agents'] as AgentConfigurationItem[];
      assert.strictEqual(savedAgents.length, 2);
      assert.strictEqual(savedAgents[0].id, 'agent-1');
      assert.strictEqual(savedAgents[1].id, 'agent-2');
    });

  it('should reject invalid agent array updates', async () => {
      const invalidAgents = [
        {
          id: 'valid-agent',
          name: 'Valid Agent',
          provider: 'openai',
          model: 'gpt-4',
          capabilities: {}
        },
        {
          // Invalid agent
          name: 'Invalid Agent',
          provider: 'invalid-provider'
        }
      ] as any;

      try {
        await configManager.updateAgentConfiguration(invalidAgents);
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('validation failed'));
      }
    });
  });

  describe('MCP Server Configuration Integration', () => {  it('should validate and save valid MCP server configuration', async () => {
      const validServer: MCPServerConfig = {
        id: 'test-mcp',
        name: 'Test MCP Server',
        command: 'python',
        args: ['-m', 'test_server'],
        env: { 'TEST_VAR': 'value' },
        timeout: 15000
      };

      // Should not throw
      await configManager.saveMcpServerConfiguration(validServer);
      
      // Verify it was saved
      const savedServers = mockConfigData['mcp.servers'] as MCPServerConfig[];
      assert.ok(savedServers);
      assert.strictEqual(savedServers.length, 1);
      assert.strictEqual(savedServers[0].id, validServer.id);
    });

  it('should reject invalid MCP server configuration before save', async () => {
      const invalidServer = {
        // Missing required fields
        name: 'Invalid Server'
      } as any;

      try {
        await configManager.saveMcpServerConfiguration(invalidServer);
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('validation failed'));
      }

      // Verify nothing was saved
      const savedServers = mockConfigData['mcp.servers'];
      assert.ok(!savedServers || savedServers.length === 0);
    });

  it('should apply defaults to MCP server configuration', async () => {
      const minimalServer = {
        id: 'minimal-mcp',
        name: 'Minimal MCP Server',
        command: 'python'
      } as MCPServerConfig;

      await configManager.saveMcpServerConfiguration(minimalServer);
      
      const savedServers = mockConfigData['mcp.servers'] as MCPServerConfig[];
      assert.strictEqual(savedServers.length, 1);
      
      const server = savedServers[0];
      assert.deepStrictEqual(server.args, []); // Default applied
      assert.strictEqual(server.timeout, 10000); // Default applied
    });

  it('should filter invalid MCP servers when loading', () => {
      // Set up mixed valid/invalid MCP server configurations
      mockConfigData['mcp.servers'] = [
        {
          id: 'valid-server',
          name: 'Valid Server',
          command: 'python'
        },
        {
          // Invalid - missing command
          id: 'invalid-server',
          name: 'Invalid Server'
        },
        {
          id: 'another-valid',
          name: 'Another Valid Server',
          command: 'node'
        }
      ];

      const config = configManager.getConfiguration();
      
      // Should only load valid servers (and filter out empty command)
      assert.strictEqual(config.mcpServers.length, 2);
      assert.strictEqual(config.mcpServers[0].id, 'valid-server');
      assert.strictEqual(config.mcpServers[1].id, 'another-valid');
    });
  });

  describe('Configuration Reload and Change Detection', () => {  it('should handle configuration changes', () => {
      // Initial configuration
      mockConfigData['agents'] = [{
        id: 'initial-agent',
        name: 'Initial Agent',
        provider: 'openai',
        model: 'gpt-4',
        capabilities: {}
      }];

      let config = configManager.getConfiguration();
      assert.strictEqual(config.agents.length, 1);
      assert.strictEqual(config.agents[0].id, 'initial-agent');

      // Change configuration
      mockConfigData['agents'] = [{
        id: 'updated-agent',
        name: 'Updated Agent',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        capabilities: {}
      }];

      config = configManager.getConfiguration();
      assert.strictEqual(config.agents.length, 1);
      assert.strictEqual(config.agents[0].id, 'updated-agent');
    });

  it('should reload configuration explicitly', async () => {
      mockConfigData['agents'] = [{
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        capabilities: {}
      }];

      // Should not throw
      await configManager.reloadConfiguration();
      
      const config = configManager.getConfiguration();
      assert.strictEqual(config.agents.length, 1);
    });
  });

  describe('Error Handling and Recovery', () => {  it('should handle validation errors gracefully during startup', async () => {
      // Set up configuration with validation issues
      mockConfigData['agents'] = [
        {
          id: 'valid-agent',
          name: 'Valid Agent',
          provider: 'openai',
          model: 'gpt-4',
          capabilities: {}
        },
        {
          // Invalid agent that should be filtered out
          name: 'Invalid Agent'
        }
      ];

      // Should not throw during startup validation
      await configManager.validateConfigurationOnStartup();
      
      // Configuration should still be loadable with valid entries
      const config = configManager.getConfiguration();
      assert.strictEqual(config.agents.length, 1);
      assert.strictEqual(config.agents[0].id, 'valid-agent');
    });

  it('should provide meaningful error messages for validation failures', async () => {
      const invalidAgent = {
        id: '', // Invalid empty ID
        name: 'Test Agent',
        provider: 'invalid-provider', // Invalid enum
        model: 'gpt-4',
        temperature: 5.0, // Out of range
        capabilities: {}
      } as any;

      try {
        await configManager.addAgent(invalidAgent);
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.ok(error instanceof Error);
        const message = error.message;
        
        // Should contain specific validation error details
        assert.ok(message.includes('validation failed'));
        // The error message should be informative enough for users to understand what went wrong
        assert.ok(message.length > 20);
      }
    });

  it('should handle concurrent configuration updates', async () => {
      const agent1: AgentConfigurationItem = {
        id: 'agent-1',
        name: 'Agent 1',
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
          specializations: ['code']
        },
        isEnabledForAssignment: true
      };

      const agent2: AgentConfigurationItem = {
        id: 'agent-2',
        name: 'Agent 2',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        capabilities: {
          hasVision: false,
          hasToolUse: true,
          reasoningDepth: 'advanced',
          speed: 'medium',
          costTier: 'medium',
          maxTokens: 8000,
          supportedLanguages: ['en'],
          specializations: ['code', 'reasoning']
        },
        isEnabledForAssignment: true
      };

      // Simulate concurrent updates
      const promises = [
        configManager.addAgent(agent1),
        configManager.addAgent(agent2)
      ];

      // Should handle concurrent updates without corruption
      await Promise.all(promises);
      
      const config = configManager.getConfiguration();
      assert.strictEqual(config.agents.length, 2);
    });
  });
});


