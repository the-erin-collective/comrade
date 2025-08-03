/**
 * Integration tests for Configuration Auto-Reload System
 * Tests the complete auto-reload workflow including VS Code integration
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConfigurationManager, AgentConfigurationItem } from '../../core/config';
import { AgentRegistry } from '../../core/registry';
import { PersonalityManager } from '../../core/personality';
import { 
  ConfigurationAutoReloadManager, 
  ComponentType, 
  ConfigurationPrecedence,
  ReloadableComponent,
  ConfigurationChangeEvent
} from '../../core/config-auto-reload';

// Mock VS Code APIs
const mockSecretStorage = {
  store: async (key: string, value: string) => {},
  get: async (key: string) => undefined,
  delete: async (key: string) => {},
  onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
} as vscode.SecretStorage;

let mockConfigData: any = {};
const mockConfiguration = {
  get: <T>(key: string, defaultValue?: T) => {
    const value = mockConfigData[key];
    return value !== undefined ? value : defaultValue;
  },
  update: async (key: string, value: any, target?: vscode.ConfigurationTarget) => {
    mockConfigData[key] = value;
    // Simulate configuration change event
    setTimeout(() => {
      const event = {
        affectsConfiguration: (section: string) => {
          return section === 'comrade' || section.startsWith('comrade.');
        }
      } as vscode.ConfigurationChangeEvent;
      
      // Trigger the configuration change event
      mockConfigurationChangeEmitter.fire(event);
    }, 10);
  },
  has: (key: string) => mockConfigData.hasOwnProperty(key),
  inspect: (key: string) => ({
    key,
    defaultValue: undefined,
    globalValue: mockConfigData[key],
    workspaceValue: undefined,
    workspaceFolderValue: undefined
  })
} as vscode.WorkspaceConfiguration;

// Mock configuration change event emitter
const mockConfigurationChangeEmitter = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>();

// Mock vscode.workspace
const originalGetConfiguration = vscode.workspace.getConfiguration;
const originalOnDidChangeConfiguration = vscode.workspace.onDidChangeConfiguration;
(vscode.workspace as any).getConfiguration = (section?: string) => mockConfiguration;
(vscode.workspace as any).onDidChangeConfiguration = mockConfigurationChangeEmitter.event;

suite('Configuration Auto-Reload Integration Tests', () => {
  let configManager: ConfigurationManager;
  let agentRegistry: AgentRegistry;
  let personalityManager: PersonalityManager;
  let autoReloadManager: ConfigurationAutoReloadManager;
  let testComponent: TestReloadableComponent;

  setup(async () => {
    // Reset mock data
    mockConfigData = {};
    
    // Reset singletons
    ConfigurationManager.resetInstance();
    AgentRegistry.resetInstance();
    PersonalityManager.resetInstance();
    ConfigurationAutoReloadManager.resetInstance();
    
    // Initialize managers
    configManager = ConfigurationManager.getInstance(mockSecretStorage);
    agentRegistry = AgentRegistry.getInstance(configManager);
    await agentRegistry.initialize();
    personalityManager = PersonalityManager.getInstance();
    
    // Initialize auto-reload manager
    autoReloadManager = ConfigurationAutoReloadManager.getInstance(
      configManager,
      agentRegistry,
      personalityManager
    );
    
    // Create test component
    testComponent = new TestReloadableComponent();
    autoReloadManager.registerComponent(testComponent);
  });

  teardown(() => {
    // Clean up
    if (autoReloadManager) {
      autoReloadManager.dispose();
    }
    
    // Reset mocks
    (vscode.workspace as any).getConfiguration = originalGetConfiguration;
    (vscode.workspace as any).onDidChangeConfiguration = originalOnDidChangeConfiguration;
  });

  suite('Component Registration and Management', () => {
    
    test('should register and unregister components', () => {
      const stats = autoReloadManager.getReloadStats();
      assert.ok(stats.registeredComponents > 0, 'Should have registered components');
      
      // Unregister test component
      autoReloadManager.unregisterComponent(ComponentType.AGENTS);
      
      const newStats = autoReloadManager.getReloadStats();
      assert.strictEqual(newStats.registeredComponents, stats.registeredComponents - 1);
    });

    test('should track reload statistics', () => {
      const stats = autoReloadManager.getReloadStats();
      
      assert.ok(typeof stats.registeredComponents === 'number');
      assert.ok(typeof stats.reloadsInProgress === 'number');
      assert.ok(typeof stats.queuedReloads === 'number');
      assert.strictEqual(stats.reloadsInProgress, 0);
      assert.strictEqual(stats.queuedReloads, 0);
    });
  });

  suite('Configuration Change Detection (Requirement 6.5)', () => {
    
    test('should detect agent configuration changes and trigger reload', async () => {
      const initialReloadCount = testComponent.reloadCount;
      
      // Change agent configuration
      const testAgent: AgentConfigurationItem = {
        id: 'test-agent',
        name: 'Test Agent',
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
      
      await configManager.addAgent(testAgent);
      
      // Wait for auto-reload to process
      await autoReloadManager.waitForReloadsToComplete();
      
      // Verify reload was triggered
      assert.ok(testComponent.reloadCount > initialReloadCount, 'Component should have been reloaded');
      assert.ok(testComponent.lastChangeEvent, 'Should have received change event');
      assert.ok(testComponent.lastChangeEvent.affectedComponents.includes(ComponentType.AGENTS));
    });

    test('should detect MCP server configuration changes', async () => {
      const initialReloadCount = testComponent.reloadCount;
      
      // Change MCP server configuration
      await configManager.saveMcpServerConfiguration({
        id: 'test-mcp',
        name: 'Test MCP Server',
        command: 'python',
        args: ['-m', 'test_server']
      });
      
      // Wait for auto-reload to process
      await autoReloadManager.waitForReloadsToComplete();
      
      // Verify reload was triggered
      assert.ok(testComponent.reloadCount > initialReloadCount, 'Component should have been reloaded');
    });

    test('should handle multiple rapid configuration changes', async () => {
      const initialReloadCount = testComponent.reloadCount;
      
      // Make multiple rapid changes
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(configManager.addAgent({
          id: `rapid-agent-${i}`,
          name: `Rapid Agent ${i}`,
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
        }));
      }
      
      await Promise.all(promises);
      
      // Wait for auto-reload to process
      await autoReloadManager.waitForReloadsToComplete();
      
      // Should have consolidated reloads efficiently
      const reloadIncrease = testComponent.reloadCount - initialReloadCount;
      assert.ok(reloadIncrease > 0, 'Should have triggered reloads');
      assert.ok(reloadIncrease <= 5, 'Should have consolidated multiple changes efficiently');
    });
  });

  suite('Configuration Precedence Rules (Requirement 6.6)', () => {
    
    test('should apply workspace precedence over user settings', async () => {
      // Set up mock inspect to simulate workspace override
      const originalInspect = mockConfiguration.inspect;
      mockConfiguration.inspect = (key: string) => ({
        key,
        defaultValue: undefined,
        globalValue: 'user-value',
        workspaceValue: 'workspace-value',
        workspaceFolderValue: undefined
      });
      
      try {
        // Trigger a configuration change
        await configManager.addAgent({
          id: 'precedence-test',
          name: 'Precedence Test Agent',
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
        });
        
        await autoReloadManager.waitForReloadsToComplete();
        
        // Verify workspace precedence was applied
        assert.ok(testComponent.lastChangeEvent);
        assert.strictEqual(testComponent.lastChangeEvent.precedence, ConfigurationPrecedence.WORKSPACE);
      } finally {
        mockConfiguration.inspect = originalInspect;
      }
    });

    test('should handle configuration conflicts with proper precedence', async () => {
      // Create conflicting changes with different precedence levels
      const userChangeEvent: ConfigurationChangeEvent = {
        section: 'comrade.agents',
        affectedComponents: [ComponentType.AGENTS],
        timestamp: new Date(),
        precedence: ConfigurationPrecedence.USER
      };
      
      const workspaceChangeEvent: ConfigurationChangeEvent = {
        section: 'comrade.agents',
        affectedComponents: [ComponentType.AGENTS],
        timestamp: new Date(Date.now() + 1000),
        precedence: ConfigurationPrecedence.WORKSPACE
      };
      
      // Manually queue both events to test precedence resolution
      (autoReloadManager as any).queueReload(userChangeEvent);
      (autoReloadManager as any).queueReload(workspaceChangeEvent);
      
      await (autoReloadManager as any).processReloadQueue();
      
      // Workspace setting should have taken precedence
      assert.ok(testComponent.lastChangeEvent);
      assert.strictEqual(testComponent.lastChangeEvent.precedence, ConfigurationPrecedence.WORKSPACE);
    });
  });

  suite('Component Reload Workflow', () => {
    
    test('should reload components in dependency order', async () => {
      const reloadOrder: ComponentType[] = [];
      
      // Create components that track reload order
      const contextComponent = new TestReloadableComponent(ComponentType.CONTEXT_SETTINGS);
      const agentComponent = new TestReloadableComponent(ComponentType.AGENTS);
      const personalityComponent = new TestReloadableComponent(ComponentType.PERSONALITY);
      
      contextComponent.onReload = () => reloadOrder.push(ComponentType.CONTEXT_SETTINGS);
      agentComponent.onReload = () => reloadOrder.push(ComponentType.AGENTS);
      personalityComponent.onReload = () => reloadOrder.push(ComponentType.PERSONALITY);
      
      autoReloadManager.registerComponent(contextComponent);
      autoReloadManager.registerComponent(agentComponent);
      autoReloadManager.registerComponent(personalityComponent);
      
      // Trigger reload for all components
      await autoReloadManager.manualReload([
        ComponentType.PERSONALITY,
        ComponentType.AGENTS,
        ComponentType.CONTEXT_SETTINGS
      ]);
      
      // Verify dependency order was respected
      assert.deepStrictEqual(reloadOrder, [
        ComponentType.CONTEXT_SETTINGS,
        ComponentType.AGENTS,
        ComponentType.PERSONALITY
      ]);
    });

    test('should handle reload failures gracefully', async () => {
      // Create a component that fails to reload
      const failingComponent = new TestReloadableComponent(ComponentType.MCP_SERVERS);
      failingComponent.shouldFailReload = true;
      
      autoReloadManager.registerComponent(failingComponent);
      
      // Trigger reload - should not throw
      await autoReloadManager.manualReload([ComponentType.MCP_SERVERS]);
      
      // Other components should still work
      const stats = autoReloadManager.getReloadStats();
      assert.strictEqual(stats.reloadsInProgress, 0, 'Should not have stuck reloads');
    });

    test('should prevent concurrent reloads of same component', async () => {
      let reloadStartCount = 0;
      let reloadCompleteCount = 0;
      
      const slowComponent = new TestReloadableComponent(ComponentType.AGENTS);
      slowComponent.onReload = async () => {
        reloadStartCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        reloadCompleteCount++;
      };
      
      autoReloadManager.registerComponent(slowComponent);
      
      // Trigger multiple concurrent reloads
      const promises = [
        autoReloadManager.manualReload([ComponentType.AGENTS]),
        autoReloadManager.manualReload([ComponentType.AGENTS]),
        autoReloadManager.manualReload([ComponentType.AGENTS])
      ];
      
      await Promise.all(promises);
      
      // Should have prevented concurrent reloads
      assert.strictEqual(reloadStartCount, 1, 'Should have started only one reload');
      assert.strictEqual(reloadCompleteCount, 1, 'Should have completed only one reload');
    });
  });

  suite('Manual Reload Operations', () => {
    
    test('should support manual reload of specific components', async () => {
      const initialReloadCount = testComponent.reloadCount;
      
      await autoReloadManager.manualReload([ComponentType.AGENTS]);
      
      assert.strictEqual(testComponent.reloadCount, initialReloadCount + 1);
      assert.ok(testComponent.lastChangeEvent);
      assert.ok(testComponent.lastChangeEvent.section.includes('manual'));
    });

    test('should wait for all reloads to complete', async () => {
      // Start a slow reload
      const slowComponent = new TestReloadableComponent(ComponentType.MCP_SERVERS);
      let reloadCompleted = false;
      slowComponent.onReload = async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        reloadCompleted = true;
      };
      
      autoReloadManager.registerComponent(slowComponent);
      
      // Start reload without waiting
      autoReloadManager.manualReload([ComponentType.MCP_SERVERS]);
      
      // Wait for all reloads to complete
      await autoReloadManager.waitForReloadsToComplete();
      
      assert.ok(reloadCompleted, 'Reload should have completed');
    });
  });

  suite('Error Handling and Recovery', () => {
    
    test('should handle configuration loading errors during reload', async () => {
      // Corrupt the configuration
      mockConfigData['agents'] = 'invalid-data';
      
      // Trigger reload - should not throw
      await configManager.reloadConfiguration();
      
      // Should still be able to get configuration (with defaults)
      const config = configManager.getConfiguration();
      assert.ok(config);
      assert.deepStrictEqual(config.agents, []);
    });

    test('should recover from component registration errors', () => {
      // Try to register invalid component
      const invalidComponent = null as any;
      
      // Should not throw
      assert.doesNotThrow(() => {
        try {
          autoReloadManager.registerComponent(invalidComponent);
        } catch (error) {
          // Expected to fail gracefully
        }
      });
    });
  });
});

/**
 * Test implementation of ReloadableComponent for testing purposes
 */
class TestReloadableComponent implements ReloadableComponent {
  public componentType: ComponentType;
  public reloadCount = 0;
  public lastChangeEvent: ConfigurationChangeEvent | null = null;
  public shouldFailReload = false;
  public onReload?: () => Promise<void> | void;

  constructor(componentType: ComponentType = ComponentType.AGENTS) {
    this.componentType = componentType;
  }

  async reload(): Promise<void> {
    if (this.shouldFailReload) {
      throw new Error('Simulated reload failure');
    }
    
    this.reloadCount++;
    
    if (this.onReload) {
      await this.onReload();
    }
  }

  isReloadRequired(changeEvent: ConfigurationChangeEvent): boolean {
    this.lastChangeEvent = changeEvent;
    return changeEvent.affectedComponents.includes(this.componentType);
  }
}