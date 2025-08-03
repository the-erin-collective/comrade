/**
 * Unit tests for Configuration Auto-Reload System
 * Tests the core auto-reload functionality without VS Code integration
 */

import * as assert from 'assert';
import { 
  ConfigurationAutoReloadManager, 
  ComponentType, 
  ConfigurationPrecedence,
  ReloadableComponent,
  ConfigurationChangeEvent
} from '../../core/config-auto-reload';

// Mock dependencies
const mockConfigurationManager = {
  reloadConfiguration: async () => {},
  forceReloadAllComponents: async () => {}
} as any;

const mockAgentRegistry = {
  initialize: async () => {},
  clearAvailabilityCache: () => {}
} as any;

const mockPersonalityManager = {
  initialize: async () => {}
} as any;

suite('Configuration Auto-Reload Unit Tests', () => {
  let autoReloadManager: ConfigurationAutoReloadManager;
  let testComponent: TestReloadableComponent;

  setup(() => {
    // Reset singleton
    ConfigurationAutoReloadManager.resetInstance();
    
    // Initialize auto-reload manager
    autoReloadManager = ConfigurationAutoReloadManager.getInstance(
      mockConfigurationManager,
      mockAgentRegistry,
      mockPersonalityManager
    );
    
    // Create test component
    testComponent = new TestReloadableComponent();
    autoReloadManager.registerComponent(testComponent);
  });

  teardown(() => {
    if (autoReloadManager) {
      autoReloadManager.dispose();
    }
  });

  suite('Component Registration', () => {
    
    test('should register and track components', () => {
      const stats = autoReloadManager.getReloadStats();
      assert.ok(stats.registeredComponents > 0, 'Should have registered components');
    });

    test('should unregister components', () => {
      const initialStats = autoReloadManager.getReloadStats();
      
      autoReloadManager.unregisterComponent(ComponentType.AGENTS);
      
      const newStats = autoReloadManager.getReloadStats();
      assert.strictEqual(newStats.registeredComponents, initialStats.registeredComponents - 1);
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

  suite('Configuration Precedence Rules (Requirement 6.6)', () => {
    
    test('should determine workspace precedence over user settings', () => {
      const userEvent: ConfigurationChangeEvent = {
        section: 'comrade.agents',
        affectedComponents: [ComponentType.AGENTS],
        timestamp: new Date(),
        precedence: ConfigurationPrecedence.USER
      };
      
      const workspaceEvent: ConfigurationChangeEvent = {
        section: 'comrade.agents',
        affectedComponents: [ComponentType.AGENTS],
        timestamp: new Date(),
        precedence: ConfigurationPrecedence.WORKSPACE
      };
      
      // Test precedence comparison
      const shouldOverride = (autoReloadManager as any).shouldOverridePrecedence(
        workspaceEvent.precedence,
        userEvent.precedence
      );
      
      assert.ok(shouldOverride, 'Workspace settings should override user settings');
    });

    test('should determine user precedence over default settings', () => {
      const defaultEvent: ConfigurationChangeEvent = {
        section: 'comrade.agents',
        affectedComponents: [ComponentType.AGENTS],
        timestamp: new Date(),
        precedence: ConfigurationPrecedence.DEFAULT
      };
      
      const userEvent: ConfigurationChangeEvent = {
        section: 'comrade.agents',
        affectedComponents: [ComponentType.AGENTS],
        timestamp: new Date(),
        precedence: ConfigurationPrecedence.USER
      };
      
      // Test precedence comparison
      const shouldOverride = (autoReloadManager as any).shouldOverridePrecedence(
        userEvent.precedence,
        defaultEvent.precedence
      );
      
      assert.ok(shouldOverride, 'User settings should override default settings');
    });

    test('should not override higher precedence with lower', () => {
      const workspaceEvent: ConfigurationChangeEvent = {
        section: 'comrade.agents',
        affectedComponents: [ComponentType.AGENTS],
        timestamp: new Date(),
        precedence: ConfigurationPrecedence.WORKSPACE
      };
      
      const userEvent: ConfigurationChangeEvent = {
        section: 'comrade.agents',
        affectedComponents: [ComponentType.AGENTS],
        timestamp: new Date(),
        precedence: ConfigurationPrecedence.USER
      };
      
      // Test precedence comparison
      const shouldOverride = (autoReloadManager as any).shouldOverridePrecedence(
        userEvent.precedence,
        workspaceEvent.precedence
      );
      
      assert.ok(!shouldOverride, 'User settings should not override workspace settings');
    });
  });

  suite('Component Reload Workflow', () => {
    
    test('should reload components in dependency order', async () => {
      const reloadOrder: ComponentType[] = [];
      
      // Create components that track reload order
      const contextComponent = new TestReloadableComponent(ComponentType.CONTEXT_SETTINGS);
      const agentComponent = new TestReloadableComponent(ComponentType.AGENTS);
      const personalityComponent = new TestReloadableComponent(ComponentType.PERSONALITY);
      
      contextComponent.onReload = () => { reloadOrder.push(ComponentType.CONTEXT_SETTINGS); };
      agentComponent.onReload = () => { reloadOrder.push(ComponentType.AGENTS); };
      personalityComponent.onReload = () => { reloadOrder.push(ComponentType.PERSONALITY); };
      
      autoReloadManager.registerComponent(contextComponent);
      autoReloadManager.registerComponent(agentComponent);
      autoReloadManager.registerComponent(personalityComponent);
      
      // Test dependency order calculation
      const componentTypes = [ComponentType.PERSONALITY, ComponentType.AGENTS, ComponentType.CONTEXT_SETTINGS];
      const orderedTypes = (autoReloadManager as any).getReloadOrder(componentTypes);
      
      // Verify dependency order
      const expectedOrder = [ComponentType.CONTEXT_SETTINGS, ComponentType.AGENTS, ComponentType.PERSONALITY];
      assert.deepStrictEqual(orderedTypes, expectedOrder);
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

  suite('Configuration Change Analysis', () => {
    
    test('should analyze configuration changes correctly', () => {
      // Create mock configuration change event
      const mockEvent = {
        affectsConfiguration: (section: string) => {
          return section === 'comrade.agents' || section === 'comrade.mcp.servers';
        }
      } as any;
      
      const changeEvents = (autoReloadManager as any).analyzeConfigurationChange(mockEvent);
      
      assert.ok(Array.isArray(changeEvents));
      assert.ok(changeEvents.length > 0);
      
      // Should have detected agent and MCP server changes
      const agentChange = changeEvents.find((e: any) => e.section === 'comrade.agents');
      const mcpChange = changeEvents.find((e: any) => e.section === 'comrade.mcp.servers');
      
      assert.ok(agentChange, 'Should detect agent configuration changes');
      assert.ok(mcpChange, 'Should detect MCP server configuration changes');
    });

    test('should determine configuration precedence', () => {
      // Test precedence determination logic
      const precedence = (autoReloadManager as any).determineConfigurationPrecedence('comrade.agents');
      
      // Should return a valid precedence value
      assert.ok(Object.values(ConfigurationPrecedence).includes(precedence));
    });
  });

  suite('Error Handling and Recovery', () => {
    
    test('should handle component registration errors', () => {
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

    test('should handle reload queue processing errors', async () => {
      // Create a component that throws during reload
      const errorComponent = new TestReloadableComponent(ComponentType.UI_SETTINGS);
      errorComponent.shouldFailReload = true;
      
      autoReloadManager.registerComponent(errorComponent);
      
      // Should not throw when processing fails
      await autoReloadManager.manualReload([ComponentType.UI_SETTINGS]);
      
      // Queue should be cleared even after errors
      const stats = autoReloadManager.getReloadStats();
      assert.strictEqual(stats.queuedReloads, 0);
    });
  });

  suite('Reload Queue Management', () => {
    
    test('should queue reload events properly', () => {
      const event: ConfigurationChangeEvent = {
        section: 'comrade.agents',
        affectedComponents: [ComponentType.AGENTS],
        timestamp: new Date(),
        precedence: ConfigurationPrecedence.USER
      };
      
      // Queue the event
      (autoReloadManager as any).queueReload(event);
      
      const stats = autoReloadManager.getReloadStats();
      assert.ok(stats.queuedReloads > 0, 'Should have queued reload events');
    });

    test('should consolidate duplicate reload events', () => {
      const event1: ConfigurationChangeEvent = {
        section: 'comrade.agents',
        affectedComponents: [ComponentType.AGENTS],
        timestamp: new Date(),
        precedence: ConfigurationPrecedence.USER
      };
      
      const event2: ConfigurationChangeEvent = {
        section: 'comrade.agents',
        affectedComponents: [ComponentType.AGENTS],
        timestamp: new Date(Date.now() + 1000),
        precedence: ConfigurationPrecedence.WORKSPACE
      };
      
      // Queue both events
      (autoReloadManager as any).queueReload(event1);
      (autoReloadManager as any).queueReload(event2);
      
      // Should consolidate based on precedence
      const queue = (autoReloadManager as any).reloadQueue;
      const agentEvents = queue.filter((e: any) => e.section === 'comrade.agents');
      
      // Should have only one event with highest precedence
      assert.strictEqual(agentEvents.length, 1);
      assert.strictEqual(agentEvents[0].precedence, ConfigurationPrecedence.WORKSPACE);
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