/**
 * Configuration Auto-Reload System
 * Implements automatic component reloading on configuration changes with precedence rules
 */

import * as vscode from 'vscode';
import { ConfigurationManager } from './config';
import { AgentRegistry } from './registry';
import { PersonalityManager } from './personality';

export interface ConfigurationChangeEvent {
  section: string;
  affectedComponents: ComponentType[];
  timestamp: Date;
  precedence: ConfigurationPrecedence;
}

export enum ComponentType {
  AGENTS = 'agents',
  MCP_SERVERS = 'mcp_servers',
  PERSONALITY = 'personality',
  CONTEXT_SETTINGS = 'context_settings',
  ASSIGNMENT_SETTINGS = 'assignment_settings',
  UI_SETTINGS = 'ui_settings'
}

export enum ConfigurationPrecedence {
  WORKSPACE = 'workspace',
  USER = 'user',
  DEFAULT = 'default'
}

export interface ReloadableComponent {
  componentType: ComponentType;
  reload(): Promise<void>;
  isReloadRequired(changeEvent: ConfigurationChangeEvent): boolean;
}

export class ConfigurationAutoReloadManager {
  private static instance: ConfigurationAutoReloadManager;
  private configurationManager: ConfigurationManager;
  private agentRegistry: AgentRegistry;
  private personalityManager: PersonalityManager;
  private reloadableComponents: Map<ComponentType, ReloadableComponent> = new Map();
  private configurationChangeListener: vscode.Disposable | undefined;
  private reloadInProgress: Set<ComponentType> = new Set();
  private reloadQueue: ConfigurationChangeEvent[] = [];
  private isProcessingQueue = false;

  private constructor(
    configurationManager: ConfigurationManager,
    agentRegistry: AgentRegistry,
    personalityManager: PersonalityManager
  ) {
    this.configurationManager = configurationManager;
    this.agentRegistry = agentRegistry;
    this.personalityManager = personalityManager;
    this.setupConfigurationListener();
    this.registerBuiltInComponents();
  }

  public static getInstance(
    configurationManager?: ConfigurationManager,
    agentRegistry?: AgentRegistry,
    personalityManager?: PersonalityManager
  ): ConfigurationAutoReloadManager {
    if (!ConfigurationAutoReloadManager.instance && configurationManager && agentRegistry && personalityManager) {
      ConfigurationAutoReloadManager.instance = new ConfigurationAutoReloadManager(
        configurationManager,
        agentRegistry,
        personalityManager
      );
    }
    return ConfigurationAutoReloadManager.instance;
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    if (ConfigurationAutoReloadManager.instance) {
      ConfigurationAutoReloadManager.instance.dispose();
      ConfigurationAutoReloadManager.instance = undefined as any;
    }
  }

  /**
   * Register a component for auto-reload
   */
  public registerComponent(component: ReloadableComponent): void {
    this.reloadableComponents.set(component.componentType, component);
    console.log(`Registered component for auto-reload: ${component.componentType}`);
  }

  /**
   * Unregister a component from auto-reload
   */
  public unregisterComponent(componentType: ComponentType): void {
    this.reloadableComponents.delete(componentType);
    console.log(`Unregistered component from auto-reload: ${componentType}`);
  }

  /**
   * Setup listener for configuration changes with comprehensive coverage
   */
  private setupConfigurationListener(): void {
    this.configurationChangeListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
      const changeEvents = this.analyzeConfigurationChange(event);
      
      for (const changeEvent of changeEvents) {
        console.log(`Configuration change detected: ${changeEvent.section} (${changeEvent.precedence})`);
        this.queueReload(changeEvent);
      }
      
      // Process the reload queue
      await this.processReloadQueue();
    });
  }

  /**
   * Analyze configuration change and determine affected components
   */
  private analyzeConfigurationChange(event: vscode.ConfigurationChangeEvent): ConfigurationChangeEvent[] {
    const changeEvents: ConfigurationChangeEvent[] = [];
    const timestamp = new Date();

    // Check each configuration section
    const configSections = [
      { section: 'comrade.agents', components: [ComponentType.AGENTS] },
      { section: 'comrade.mcp.servers', components: [ComponentType.MCP_SERVERS] },
      { section: 'comrade.context', components: [ComponentType.CONTEXT_SETTINGS] },
      { section: 'comrade.assignment', components: [ComponentType.ASSIGNMENT_SETTINGS] },
      { section: 'comrade.ui', components: [ComponentType.UI_SETTINGS] }
    ];

    for (const { section, components } of configSections) {
      if (event.affectsConfiguration(section)) {
        const precedence = this.determineConfigurationPrecedence(section);
        changeEvents.push({
          section,
          affectedComponents: components,
          timestamp,
          precedence
        });
      }
    }

    // Handle workspace-specific personality changes
    if (vscode.workspace.workspaceFolders) {
      for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        const personalitySection = `comrade.personality.${workspaceFolder.name}`;
        if (event.affectsConfiguration(personalitySection)) {
          changeEvents.push({
            section: personalitySection,
            affectedComponents: [ComponentType.PERSONALITY],
            timestamp,
            precedence: ConfigurationPrecedence.WORKSPACE
          });
        }
      }
    }

    return changeEvents;
  }

  /**
   * Determine configuration precedence based on scope
   */
  private determineConfigurationPrecedence(section: string): ConfigurationPrecedence {
    const config = vscode.workspace.getConfiguration(section.split('.')[0]);
    const inspect = config.inspect(section.split('.').slice(1).join('.'));

    if (inspect?.workspaceValue !== undefined) {
      return ConfigurationPrecedence.WORKSPACE;
    } else if (inspect?.globalValue !== undefined) {
      return ConfigurationPrecedence.USER;
    } else {
      return ConfigurationPrecedence.DEFAULT;
    }
  }

  /**
   * Queue a reload event for processing
   */
  private queueReload(changeEvent: ConfigurationChangeEvent): void {
    // Apply precedence rules - workspace settings override user settings
    const existingIndex = this.reloadQueue.findIndex(
      event => event.section === changeEvent.section
    );

    if (existingIndex >= 0) {
      const existing = this.reloadQueue[existingIndex];
      if (this.shouldOverridePrecedence(changeEvent.precedence, existing.precedence)) {
        this.reloadQueue[existingIndex] = changeEvent;
      }
    } else {
      this.reloadQueue.push(changeEvent);
    }
  }

  /**
   * Determine if new precedence should override existing
   */
  private shouldOverridePrecedence(
    newPrecedence: ConfigurationPrecedence,
    existingPrecedence: ConfigurationPrecedence
  ): boolean {
    const precedenceOrder = {
      [ConfigurationPrecedence.WORKSPACE]: 3,
      [ConfigurationPrecedence.USER]: 2,
      [ConfigurationPrecedence.DEFAULT]: 1
    };

    return precedenceOrder[newPrecedence] > precedenceOrder[existingPrecedence];
  }

  /**
   * Process the reload queue with conflict resolution
   */
  private async processReloadQueue(): Promise<void> {
    if (this.isProcessingQueue || this.reloadQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Group events by component type to avoid duplicate reloads
      const componentReloads = new Map<ComponentType, ConfigurationChangeEvent>();

      for (const event of this.reloadQueue) {
        for (const componentType of event.affectedComponents) {
          const existing = componentReloads.get(componentType);
          if (!existing || this.shouldOverridePrecedence(event.precedence, existing.precedence)) {
            componentReloads.set(componentType, event);
          }
        }
      }

      // Execute reloads in dependency order
      const reloadOrder = this.getReloadOrder(Array.from(componentReloads.keys()));
      
      for (const componentType of reloadOrder) {
        const event = componentReloads.get(componentType);
        if (event) {
          await this.reloadComponent(componentType, event);
        }
      }

      // Clear the queue
      this.reloadQueue = [];
    } catch (error) {
      console.error('Error processing configuration reload queue:', error);
      vscode.window.showErrorMessage(
        `Failed to reload configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Determine the order in which components should be reloaded based on dependencies
   */
  private getReloadOrder(componentTypes: ComponentType[]): ComponentType[] {
    // Define dependency order - components that depend on others should be reloaded after
    const dependencyOrder = [
      ComponentType.CONTEXT_SETTINGS,
      ComponentType.ASSIGNMENT_SETTINGS,
      ComponentType.UI_SETTINGS,
      ComponentType.MCP_SERVERS,
      ComponentType.AGENTS, // Agents depend on MCP servers
      ComponentType.PERSONALITY // Personality may depend on agents
    ];

    return dependencyOrder.filter(type => componentTypes.includes(type));
  }

  /**
   * Reload a specific component
   */
  private async reloadComponent(componentType: ComponentType, event: ConfigurationChangeEvent): Promise<void> {
    if (this.reloadInProgress.has(componentType)) {
      console.log(`Reload already in progress for ${componentType}, skipping`);
      return;
    }

    this.reloadInProgress.add(componentType);

    try {
      console.log(`Reloading component: ${componentType} due to ${event.section} change`);
      
      const component = this.reloadableComponents.get(componentType);
      if (component && component.isReloadRequired(event)) {
        await component.reload();
        console.log(`Successfully reloaded component: ${componentType}`);
      } else if (!component) {
        console.warn(`No registered component found for type: ${componentType}`);
      } else {
        console.log(`Component ${componentType} determined reload not required`);
      }
    } catch (error) {
      console.error(`Failed to reload component ${componentType}:`, error);
      vscode.window.showWarningMessage(
        `Failed to reload ${componentType}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      this.reloadInProgress.delete(componentType);
    }
  }

  /**
   * Register built-in components for auto-reload
   */
  private registerBuiltInComponents(): void {
    // Agent Registry Component
    this.registerComponent({
      componentType: ComponentType.AGENTS,
      reload: async () => {
        await this.agentRegistry.initialize();
        this.agentRegistry.clearAvailabilityCache(); // Clear cache on reload
      },
      isReloadRequired: (event) => {
        return event.affectedComponents.includes(ComponentType.AGENTS);
      }
    });

    // MCP Servers Component
    this.registerComponent({
      componentType: ComponentType.MCP_SERVERS,
      reload: async () => {
        // MCP servers are handled by the configuration manager
        // This could trigger MCP server restart if needed
        console.log('MCP servers configuration reloaded');
      },
      isReloadRequired: (event) => {
        return event.affectedComponents.includes(ComponentType.MCP_SERVERS);
      }
    });

    // Personality Component
    this.registerComponent({
      componentType: ComponentType.PERSONALITY,
      reload: async () => {
        if (vscode.workspace.workspaceFolders) {
          for (const workspaceFolder of vscode.workspace.workspaceFolders) {
            await this.personalityManager.initialize(workspaceFolder.uri);
          }
        }
      },
      isReloadRequired: (event) => {
        return event.affectedComponents.includes(ComponentType.PERSONALITY);
      }
    });

    // Context Settings Component
    this.registerComponent({
      componentType: ComponentType.CONTEXT_SETTINGS,
      reload: async () => {
        // Context settings are handled by the configuration manager
        console.log('Context settings reloaded');
      },
      isReloadRequired: (event) => {
        return event.affectedComponents.includes(ComponentType.CONTEXT_SETTINGS);
      }
    });

    // Assignment Settings Component
    this.registerComponent({
      componentType: ComponentType.ASSIGNMENT_SETTINGS,
      reload: async () => {
        // Assignment settings are handled by the configuration manager
        console.log('Assignment settings reloaded');
      },
      isReloadRequired: (event) => {
        return event.affectedComponents.includes(ComponentType.ASSIGNMENT_SETTINGS);
      }
    });

    // UI Settings Component
    this.registerComponent({
      componentType: ComponentType.UI_SETTINGS,
      reload: async () => {
        // UI settings might need to trigger webview updates
        console.log('UI settings reloaded');
      },
      isReloadRequired: (event) => {
        return event.affectedComponents.includes(ComponentType.UI_SETTINGS);
      }
    });
  }

  /**
   * Manually trigger a reload for specific components
   */
  public async manualReload(componentTypes: ComponentType[]): Promise<void> {
    const timestamp = new Date();
    
    for (const componentType of componentTypes) {
      const event: ConfigurationChangeEvent = {
        section: `manual.${componentType}`,
        affectedComponents: [componentType],
        timestamp,
        precedence: ConfigurationPrecedence.USER
      };
      
      await this.reloadComponent(componentType, event);
    }
  }

  /**
   * Get reload statistics
   */
  public getReloadStats(): {
    registeredComponents: number;
    reloadsInProgress: number;
    queuedReloads: number;
    lastReloadTime?: Date;
  } {
    return {
      registeredComponents: this.reloadableComponents.size,
      reloadsInProgress: this.reloadInProgress.size,
      queuedReloads: this.reloadQueue.length,
      lastReloadTime: this.reloadQueue.length > 0 ? 
        this.reloadQueue[this.reloadQueue.length - 1].timestamp : undefined
    };
  }

  /**
   * Check if a component is currently reloading
   */
  public isComponentReloading(componentType: ComponentType): boolean {
    return this.reloadInProgress.has(componentType);
  }

  /**
   * Wait for all pending reloads to complete
   */
  public async waitForReloadsToComplete(): Promise<void> {
    while (this.isProcessingQueue || this.reloadInProgress.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    if (this.configurationChangeListener) {
      this.configurationChangeListener.dispose();
    }
    this.reloadableComponents.clear();
    this.reloadInProgress.clear();
    this.reloadQueue = [];
  }
}