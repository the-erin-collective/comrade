/**
 * Agent Registry for managing available agents with configuration integration
 */

import * as vscode from 'vscode';
import { IAgent, AgentCapabilities, PhaseType } from './agent';
import { ConfigurationManager, AgentConfigurationItem } from './config';

export class AgentRegistry {
  private static instance: AgentRegistry;
  private configManager: ConfigurationManager;
  private agents: Map<string, IAgent> = new Map();
  private configurationChangeListener: vscode.Disposable | undefined;

  private constructor(configManager: ConfigurationManager) {
    this.configManager = configManager;
    this.setupConfigurationListener();
  }

  public static getInstance(configManager?: ConfigurationManager): AgentRegistry {
    if (!AgentRegistry.instance && configManager) {
      AgentRegistry.instance = new AgentRegistry(configManager);
    }
    return AgentRegistry.instance;
  }

  /**
   * Initialize the registry by loading agents from configuration
   */
  public async initialize(): Promise<void> {
    await this.loadAgentsFromConfiguration();
    await this.configManager.validateConfigurationOnStartup();
  }

  /**
   * Get all registered agents
   */
  public getAllAgents(): IAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get an agent by ID
   */
  public getAgent(agentId: string): IAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agents enabled for auto-assignment
   */
  public getAutoAssignmentEnabledAgents(): IAgent[] {
    return this.getAllAgents().filter(agent => agent.isEnabledForAssignment);
  }

  /**
   * Get agents by capability
   */
  public getAgentsByCapability(capability: keyof AgentCapabilities, value: any): IAgent[] {
    return this.getAllAgents().filter(agent => agent.capabilities[capability] === value);
  }

  /**
   * Get agents with vision capability
   */
  public getVisionCapableAgents(): IAgent[] {
    return this.getAgentsByCapability('hasVision', true);
  }

  /**
   * Get agents with tool use capability
   */
  public getToolCapableAgents(): IAgent[] {
    return this.getAgentsByCapability('hasToolUse', true);
  }

  /**
   * Get agents by reasoning depth
   */
  public getAgentsByReasoningDepth(depth: 'basic' | 'intermediate' | 'advanced'): IAgent[] {
    return this.getAgentsByCapability('reasoningDepth', depth);
  }

  /**
   * Get agents by speed tier
   */
  public getAgentsBySpeed(speed: 'fast' | 'medium' | 'slow'): IAgent[] {
    return this.getAgentsByCapability('speed', speed);
  }

  /**
   * Get agents by cost tier
   */
  public getAgentsByCostTier(costTier: 'low' | 'medium' | 'high'): IAgent[] {
    return this.getAgentsByCapability('costTier', costTier);
  }

  /**
   * Get agents suitable for a specific phase
   */
  public getAgentsForPhase(phase: PhaseType): IAgent[] {
    const enabledAgents = this.getAutoAssignmentEnabledAgents();
    
    switch (phase) {
      case PhaseType.CONTEXT:
        // Context phase benefits from fast agents with good reasoning
        return enabledAgents.filter(agent => 
          agent.capabilities.speed === 'fast' || 
          agent.capabilities.reasoningDepth === 'advanced'
        );
      
      case PhaseType.PLANNING:
        // Planning phase needs good reasoning, tool use helpful
        return enabledAgents.filter(agent => 
          agent.capabilities.reasoningDepth === 'advanced' || 
          agent.capabilities.reasoningDepth === 'intermediate'
        );
      
      case PhaseType.REVIEW:
        // Review phase needs advanced reasoning
        return enabledAgents.filter(agent => 
          agent.capabilities.reasoningDepth === 'advanced'
        );
      
      case PhaseType.EXECUTION:
        // Execution phase benefits from tool use and good reasoning
        return enabledAgents.filter(agent => 
          agent.capabilities.hasToolUse || 
          agent.capabilities.reasoningDepth === 'advanced'
        );
      
      case PhaseType.RECOVERY:
        // Recovery phase needs advanced reasoning and tool use
        return enabledAgents.filter(agent => 
          agent.capabilities.reasoningDepth === 'advanced' && 
          agent.capabilities.hasToolUse
        );
      
      default:
        return enabledAgents;
    }
  }

  /**
   * Check if an agent is available (connected and configured)
   */
  public async isAgentAvailable(agentId: string): Promise<boolean> {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return false;
    }
    
    try {
      return await agent.isAvailable();
    } catch (error) {
      console.error(`Error checking availability for agent ${agentId}:`, error);
      return false;
    }
  }

  /**
   * Get available agents (those that are connected and configured)
   */
  public async getAvailableAgents(): Promise<IAgent[]> {
    const allAgents = this.getAllAgents();
    const availabilityChecks = await Promise.allSettled(
      allAgents.map(async agent => ({
        agent,
        isAvailable: await agent.isAvailable()
      }))
    );

    return availabilityChecks
      .filter((result): result is PromiseFulfilledResult<{agent: IAgent, isAvailable: boolean}> => 
        result.status === 'fulfilled' && result.value.isAvailable
      )
      .map(result => result.value.agent);
  }

  /**
   * Register a new agent
   */
  public async registerAgent(agentConfig: AgentConfigurationItem): Promise<void> {
    await this.configManager.addAgent(agentConfig);
    // The configuration change listener will automatically reload agents
  }

  /**
   * Unregister an agent
   */
  public async unregisterAgent(agentId: string): Promise<void> {
    await this.configManager.removeAgent(agentId);
    // The configuration change listener will automatically reload agents
  }

  /**
   * Toggle auto-assignment for an agent
   */
  public async toggleAgentAutoAssignment(agentId: string, enabled: boolean): Promise<void> {
    await this.configManager.toggleAgentAutoAssignment(agentId, enabled);
    // The configuration change listener will automatically reload agents
  }

  /**
   * Get registry statistics
   */
  public getRegistryStats(): {
    totalAgents: number;
    availableAgents: number;
    enabledForAssignment: number;
    byProvider: Record<string, number>;
    byCapability: {
      vision: number;
      toolUse: number;
      advanced: number;
    };
  } {
    const allAgents = this.getAllAgents();
    const enabledAgents = this.getAutoAssignmentEnabledAgents();
    
    const byProvider: Record<string, number> = {};
    allAgents.forEach(agent => {
      byProvider[agent.provider] = (byProvider[agent.provider] || 0) + 1;
    });

    return {
      totalAgents: allAgents.length,
      availableAgents: 0, // This would need to be calculated asynchronously
      enabledForAssignment: enabledAgents.length,
      byProvider,
      byCapability: {
        vision: this.getVisionCapableAgents().length,
        toolUse: this.getToolCapableAgents().length,
        advanced: this.getAgentsByReasoningDepth('advanced').length
      }
    };
  }

  /**
   * Load agents from configuration
   */
  private async loadAgentsFromConfiguration(): Promise<void> {
    try {
      const agents = await this.configManager.getAllAgents();
      this.agents.clear();
      
      for (const agent of agents) {
        this.agents.set(agent.id, agent);
      }
      
      console.log(`Loaded ${agents.length} agents from configuration`);
    } catch (error) {
      console.error('Failed to load agents from configuration:', error);
      vscode.window.showErrorMessage('Failed to load agent configurations. Please check your settings.');
    }
  }

  /**
   * Setup listener for configuration changes
   */
  private setupConfigurationListener(): void {
    this.configurationChangeListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('comrade.agents') || 
          event.affectsConfiguration('comrade.mcp.servers')) {
        console.log('Agent configuration changed, reloading agents...');
        await this.loadAgentsFromConfiguration();
      }
    });
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    if (this.configurationChangeListener) {
      this.configurationChangeListener.dispose();
    }
  }
}