/**
 * Agent Registry for managing available agents with configuration integration
 */

import * as vscode from 'vscode';
import { IAgent, AgentCapabilities, PhaseType, LLMProvider } from './agent';
import { ConfigurationManager, AgentConfigurationItem } from './config';

export class AgentRegistry {
  private static instance: AgentRegistry;
  private configManager: ConfigurationManager;
  private agents: Map<string, IAgent> = new Map();
  private configurationChangeListener: vscode.Disposable | undefined;
  private _availabilityCache: Map<string, { available: boolean; timestamp: number; ttl: number; promise?: Promise<boolean> }> = new Map();
  private _pendingAvailabilityChecks: Map<string, Promise<boolean>> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private hasShownEmptyAgentNotification = false;
  private hasShownNoEnabledAgentsNotification = false;

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
   * Reset the singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    if (AgentRegistry.instance) {
      AgentRegistry.instance.dispose();
      AgentRegistry.instance = undefined as any;
    }
  }

  /**
   * Initialize the registry by loading agents from configuration
   */
  public async initialize(): Promise<void> {
    await this.loadAgentsFromConfiguration();
    await this.configManager.validateConfigurationOnStartup();
  }

  /**
   * Get all registered agents with empty list handling
   */
  public getAllAgents(): IAgent[] {
    const agents = Array.from(this.agents.values());
    
    if (agents.length === 0) {
      console.warn('No agents are currently configured. Please add at least one agent to use Comrade.');
      // Optionally show user notification for first-time setup
      this.handleEmptyAgentList();
    }
    
    return agents;
  }

  /**
   * Get an agent by ID
   */
  public getAgent(agentId: string): IAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get agents enabled for auto-assignment with empty list handling
   */
  public getAutoAssignmentEnabledAgents(): IAgent[] {
    const allAgents = this.getAllAgents();
    
    if (allAgents.length === 0) {
      console.warn('No agents configured for auto-assignment. Please configure at least one agent.');
      return [];
    }
    
    const enabledAgents = allAgents.filter(agent => agent.isEnabledForAssignment);
    
    if (enabledAgents.length === 0 && allAgents.length > 0) {
      console.warn('No agents are enabled for auto-assignment. Consider enabling at least one agent for automatic task assignment.');
      // Show user guidance
      this.handleNoEnabledAgents();
    }
    
    return enabledAgents;
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
   * Get agents suitable for a specific phase with fallback handling
   */
  public getAgentsForPhase(phase: PhaseType): IAgent[] {
    const enabledAgents = this.getAutoAssignmentEnabledAgents();
    
    if (enabledAgents.length === 0) {
      console.warn(`No agents available for ${phase} phase. Please configure and enable agents.`);
      return [];
    }
    
    let suitableAgents: IAgent[] = [];
    
    switch (phase) {
      case PhaseType.CONTEXT:
        // Context phase benefits from fast agents with good reasoning
        suitableAgents = enabledAgents.filter(agent => 
          agent.capabilities.speed === 'fast' || 
          agent.capabilities.reasoningDepth === 'advanced'
        );
        break;
      
      case PhaseType.PLANNING:
        // Planning phase needs good reasoning, tool use helpful
        suitableAgents = enabledAgents.filter(agent => 
          agent.capabilities.reasoningDepth === 'advanced' || 
          agent.capabilities.reasoningDepth === 'intermediate'
        );
        break;
      
      case PhaseType.REVIEW:
        // Review phase needs advanced reasoning
        suitableAgents = enabledAgents.filter(agent => 
          agent.capabilities.reasoningDepth === 'advanced'
        );
        break;
      
      case PhaseType.EXECUTION:
        // Execution phase benefits from tool use and good reasoning
        suitableAgents = enabledAgents.filter(agent => 
          agent.capabilities.hasToolUse || 
          agent.capabilities.reasoningDepth === 'advanced'
        );
        break;
      
      case PhaseType.RECOVERY:
        // Recovery phase needs advanced reasoning and tool use
        suitableAgents = enabledAgents.filter(agent => 
          agent.capabilities.reasoningDepth === 'advanced' && 
          agent.capabilities.hasToolUse
        );
        break;
      
      default:
        suitableAgents = enabledAgents;
    }
    
    // If no agents match the specific criteria, fall back to any enabled agent
    if (suitableAgents.length === 0 && enabledAgents.length > 0) {
      console.warn(`No agents perfectly suited for ${phase} phase. Falling back to available agents.`);
      suitableAgents = enabledAgents;
    }
    
    return suitableAgents;
  }

  /**
   * Check if an agent is available (connected and configured) with caching
   */
  public async isAgentAvailable(agentId: string): Promise<boolean> {
    // Check cache first
    const cached = this._availabilityCache.get(agentId);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.available;
    }

    // Check if there's already a pending request for this agent
    if (this._pendingAvailabilityChecks.has(agentId)) {
      // Wait for the pending request to complete
      return await this._pendingAvailabilityChecks.get(agentId)!;
    }

    const agent = this.getAgent(agentId);
    if (!agent) {
      this._cacheAvailability(agentId, false);
      return false;
    }
    
    // Create a promise for this availability check and cache it
    const availabilityPromise = this._checkAgentAvailability(agent, agentId);
    this._pendingAvailabilityChecks.set(agentId, availabilityPromise);

    try {
      const available = await availabilityPromise;
      // Remove pending entry and cache the result
      this._pendingAvailabilityChecks.delete(agentId);
      this._cacheAvailability(agentId, available);
      return available;
    } catch (error) {
      // Remove pending entry and cache the failure
      this._pendingAvailabilityChecks.delete(agentId);
      console.error(`Error checking availability for agent ${agentId}:`, error);
      this._cacheAvailability(agentId, false, 30000); // Cache failures for shorter time
      return false;
    }
  }

  /**
   * Internal method to check agent availability
   */
  private async _checkAgentAvailability(agent: IAgent, agentId: string): Promise<boolean> {
    return await agent.isAvailable();
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
      // Only show error message if we're in a real VS Code environment
      if (vscode.window.showErrorMessage) {
        vscode.window.showErrorMessage('Failed to load agent configurations. Please check your settings.');
      }
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
   * Create agent factory methods for different provider types with capability detection
   */
  public async createAgentFromConfig(config: AgentConfigurationItem): Promise<IAgent> {
    return await this.configManager.createAgentInstance(config);
  }

  /**
   * Factory method to create OpenAI-compatible agent
   */
  public async createOpenAIAgent(config: {
    id: string;
    name: string;
    model: string;
    apiKey: string;
    endpoint?: string;
    capabilities?: Partial<AgentCapabilities>;
  }): Promise<IAgent> {
    const agentConfig: AgentConfigurationItem = {
      id: config.id,
      name: config.name,
      provider: 'openai',
      model: config.model,
      endpoint: config.endpoint,
      capabilities: this.detectCapabilities(config.model, config.capabilities),
      isEnabledForAssignment: true
    };

    // Store the API key securely
    await this.configManager.storeApiKey(config.id, config.apiKey);

    return await this.createAgentFromConfig(agentConfig);
  }

  /**
   * Factory method to create Ollama agent
   */
  public async createOllamaAgent(config: {
    id: string;
    name: string;
    model: string;
    endpoint?: string;
    capabilities?: Partial<AgentCapabilities>;
  }): Promise<IAgent> {
    const agentConfig: AgentConfigurationItem = {
      id: config.id,
      name: config.name,
      provider: 'ollama',
      model: config.model,
      endpoint: config.endpoint || 'http://localhost:11434',
      capabilities: this.detectCapabilities(config.model, config.capabilities),
      isEnabledForAssignment: true
    };

    return await this.createAgentFromConfig(agentConfig);
  }

  /**
   * Factory method to create custom endpoint agent
   */
  public async createCustomAgent(config: {
    id: string;
    name: string;
    provider: LLMProvider;
    model: string;
    endpoint: string;
    apiKey?: string;
    capabilities?: Partial<AgentCapabilities>;
  }): Promise<IAgent> {
    const agentConfig: AgentConfigurationItem = {
      id: config.id,
      name: config.name,
      provider: config.provider,
      model: config.model,
      endpoint: config.endpoint,
      capabilities: this.detectCapabilities(config.model, config.capabilities),
      isEnabledForAssignment: true
    };

    // Store the API key securely if provided
    if (config.apiKey) {
      await this.configManager.storeApiKey(config.id, config.apiKey);
    }

    return await this.createAgentFromConfig(agentConfig);
  }

  /**
   * Detect agent capabilities based on model name and provider
   */
  private detectCapabilities(model: string, overrides?: Partial<AgentCapabilities>): AgentCapabilities {
    const modelLower = model.toLowerCase();
    
    // Default capabilities
    let capabilities: AgentCapabilities = {
      hasVision: false,
      hasToolUse: false,
      reasoningDepth: 'intermediate',
      speed: 'medium',
      costTier: 'medium',
      maxTokens: 4096,
      supportedLanguages: ['en'],
      specializations: ['code']
    };

    // Vision detection
    if (modelLower.includes('vision') || 
        modelLower.includes('gpt-4') || 
        modelLower.includes('claude-3') ||
        modelLower.includes('gemini')) {
      capabilities.hasVision = true;
    }

    // Tool use detection
    if (modelLower.includes('gpt-4') || 
        modelLower.includes('claude-3') ||
        modelLower.includes('gemini') ||
        modelLower.includes('llama-3')) {
      capabilities.hasToolUse = true;
    }

    // Reasoning depth detection
    if (modelLower.includes('gpt-4') || 
        modelLower.includes('claude-3-opus') ||
        modelLower.includes('gemini-pro')) {
      capabilities.reasoningDepth = 'advanced';
    } else if (modelLower.includes('gpt-3.5') || 
               modelLower.includes('claude-3-haiku')) {
      capabilities.reasoningDepth = 'basic';
    }

    // Speed detection
    if (modelLower.includes('turbo') || 
        modelLower.includes('haiku') ||
        modelLower.includes('flash')) {
      capabilities.speed = 'fast';
    } else if (modelLower.includes('opus') || 
               modelLower.includes('gpt-4')) {
      capabilities.speed = 'slow';
    }

    // Cost tier detection
    if (modelLower.includes('gpt-4') || 
        modelLower.includes('claude-3-opus')) {
      capabilities.costTier = 'high';
    } else if (modelLower.includes('gpt-3.5') || 
               modelLower.includes('claude-3-haiku') ||
               modelLower.includes('llama')) {
      capabilities.costTier = 'low';
    }

    // Token limits
    if (modelLower.includes('gpt-4-turbo') || 
        modelLower.includes('claude-3')) {
      capabilities.maxTokens = 128000;
    } else if (modelLower.includes('gpt-4')) {
      capabilities.maxTokens = 8192;
    } else if (modelLower.includes('gemini-pro')) {
      capabilities.maxTokens = 32768;
    }

    // Specializations based on model
    if (modelLower.includes('code') || 
        modelLower.includes('codex')) {
      capabilities.specializations = ['code', 'debugging'];
    } else if (modelLower.includes('claude')) {
      capabilities.specializations = ['code', 'analysis', 'writing'];
    } else if (modelLower.includes('gpt-4')) {
      capabilities.specializations = ['code', 'analysis', 'reasoning'];
    }

    // Apply overrides
    if (overrides) {
      capabilities = { ...capabilities, ...overrides };
    }

    return capabilities;
  }

  /**
   * Advanced capability-based filtering
   */
  public filterAgentsByCapabilities(filters: {
    hasVision?: boolean;
    hasToolUse?: boolean;
    minReasoningDepth?: 'basic' | 'intermediate' | 'advanced';
    maxCostTier?: 'low' | 'medium' | 'high';
    minSpeed?: 'slow' | 'medium' | 'fast';
    specializations?: string[];
    minTokens?: number;
    languages?: string[];
  }): IAgent[] {
    return this.getAllAgents().filter(agent => {
      const caps = agent.capabilities;

      // Vision filter
      if (filters.hasVision !== undefined && caps.hasVision !== filters.hasVision) {
        return false;
      }

      // Tool use filter
      if (filters.hasToolUse !== undefined && caps.hasToolUse !== filters.hasToolUse) {
        return false;
      }

      // Reasoning depth filter
      if (filters.minReasoningDepth) {
        const depthOrder = { 'basic': 0, 'intermediate': 1, 'advanced': 2 };
        if (depthOrder[caps.reasoningDepth] < depthOrder[filters.minReasoningDepth]) {
          return false;
        }
      }

      // Cost tier filter
      if (filters.maxCostTier) {
        const costOrder = { 'low': 0, 'medium': 1, 'high': 2 };
        if (costOrder[caps.costTier] > costOrder[filters.maxCostTier]) {
          return false;
        }
      }

      // Speed filter
      if (filters.minSpeed) {
        const speedOrder = { 'slow': 0, 'medium': 1, 'fast': 2 };
        if (speedOrder[caps.speed] < speedOrder[filters.minSpeed]) {
          return false;
        }
      }

      // Specializations filter
      if (filters.specializations && filters.specializations.length > 0) {
        const hasRequiredSpec = filters.specializations.some(spec => 
          caps.specializations.includes(spec)
        );
        if (!hasRequiredSpec) {
          return false;
        }
      }

      // Token limit filter
      if (filters.minTokens && caps.maxTokens < filters.minTokens) {
        return false;
      }

      // Language filter
      if (filters.languages && filters.languages.length > 0) {
        const hasRequiredLang = filters.languages.some(lang => 
          caps.supportedLanguages.includes(lang)
        );
        if (!hasRequiredLang) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get agents ranked by suitability for specific requirements
   */
  public rankAgentsForRequirements(requirements: {
    needsVision?: boolean;
    needsTools?: boolean;
    complexityLevel?: 'simple' | 'moderate' | 'complex';
    prioritizeSpeed?: boolean;
    prioritizeCost?: boolean;
    specializations?: string[];
  }): IAgent[] {
    const agents = this.getAutoAssignmentEnabledAgents();
    
    const scored = agents.map(agent => ({
      agent,
      score: this.calculateAgentScore(agent, requirements)
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .map(item => item.agent);
  }

  private calculateAgentScore(agent: IAgent, requirements: any): number {
    let score = 0;
    const caps = agent.capabilities;

    // Required capabilities
    if (requirements.needsVision && !caps.hasVision) return 0;
    if (requirements.needsTools && !caps.hasToolUse) return 0;

    // Reasoning depth scoring
    if (requirements.complexityLevel) {
      const complexityMap: Record<string, Record<string, number>> = {
        'simple': { 'basic': 30, 'intermediate': 20, 'advanced': 10 },
        'moderate': { 'basic': 10, 'intermediate': 30, 'advanced': 20 },
        'complex': { 'basic': 0, 'intermediate': 20, 'advanced': 30 }
      };
      const levelMap = complexityMap[requirements.complexityLevel];
      if (levelMap) {
        score += levelMap[caps.reasoningDepth] || 0;
      }
    }

    // Speed priority
    if (requirements.prioritizeSpeed) {
      const speedScores = { 'fast': 20, 'medium': 10, 'slow': 0 };
      score += speedScores[caps.speed];
    }

    // Cost priority
    if (requirements.prioritizeCost) {
      const costScores = { 'low': 20, 'medium': 10, 'high': 0 };
      score += costScores[caps.costTier];
    }

    // Specialization matching
    if (requirements.specializations) {
      const matchingSpecs = requirements.specializations.filter((spec: string) => 
        caps.specializations.includes(spec)
      );
      score += matchingSpecs.length * 10;
    }

    // Capability bonuses
    if (caps.hasVision) score += 5;
    if (caps.hasToolUse) score += 5;

    return score;
  }

  /**
   * Validate agent configuration and connectivity
   */
  public async validateAgent(agentId: string): Promise<{
    isValid: boolean;
    isConnected: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const agent = this.getAgent(agentId);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!agent) {
      return {
        isValid: false,
        isConnected: false,
        errors: [`Agent '${agentId}' not found`],
        warnings: []
      };
    }

    // Check configuration validity
    if (!agent.config.model) {
      errors.push('Model not specified');
    }

    if (agent.provider === 'openai' && !agent.config.apiKey) {
      errors.push('API key required for OpenAI provider');
    }

    // Check connectivity
    let isConnected = false;
    try {
      isConnected = await agent.isAvailable();
    } catch (error) {
      errors.push(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Capability warnings
    if (!agent.capabilities.hasToolUse && agent.capabilities.specializations.includes('code')) {
      warnings.push('Agent specializes in code but lacks tool use capability');
    }

    if (agent.capabilities.reasoningDepth === 'basic' && agent.isEnabledForAssignment) {
      warnings.push('Agent has basic reasoning but is enabled for auto-assignment');
    }

    return {
      isValid: errors.length === 0,
      isConnected,
      errors,
      warnings
    };
  }

  /**
   * Cache availability result
   */
  private _cacheAvailability(agentId: string, available: boolean, customTtl?: number): void {
    this._availabilityCache.set(agentId, {
      available,
      timestamp: Date.now(),
      ttl: customTtl || this.CACHE_TTL
    });
  }

  /**
   * Clear availability cache for an agent
   */
  public clearAvailabilityCache(agentId?: string): void {
    if (agentId) {
      this._availabilityCache.delete(agentId);
      this._pendingAvailabilityChecks.delete(agentId);
    } else {
      this._availabilityCache.clear();
      this._pendingAvailabilityChecks.clear();
    }
  }

  /**
   * Get cached availability status (for testing)
   */
  public getCachedAvailability(agentId: string): boolean | null {
    const cached = this._availabilityCache.get(agentId);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.available;
    }
    return null;
  }

  /**
   * Handle empty agent list scenario with user guidance
   */
  private handleEmptyAgentList(): void {
    // Only show notification once per session to avoid spam
    if (!this.hasShownEmptyAgentNotification) {
      this.hasShownEmptyAgentNotification = true;
      
      // Show user-friendly guidance for first-time setup
      if (vscode.window.showInformationMessage) {
        vscode.window.showInformationMessage(
          'Welcome to Comrade! To get started, please configure at least one AI agent.',
          'Configure Agents',
          'Learn More'
        ).then(selection => {
          if (selection === 'Configure Agents') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'comrade.agents');
          } else if (selection === 'Learn More') {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/codeium/comrade#configuration'));
          }
        });
      }
    }
  }
  
  /**
   * Handle scenario where agents exist but none are enabled for auto-assignment
   */
  private handleNoEnabledAgents(): void {
    // Only show notification once per session to avoid spam
    if (!this.hasShownNoEnabledAgentsNotification) {
      this.hasShownNoEnabledAgentsNotification = true;
      
      if (vscode.window.showWarningMessage) {
        vscode.window.showWarningMessage(
          'You have agents configured but none are enabled for auto-assignment. Enable at least one agent for automatic task assignment.',
          'Review Agent Settings'
        ).then(selection => {
          if (selection === 'Review Agent Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'comrade.agents');
          }
        });
      }
    }
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    if (this.configurationChangeListener) {
      this.configurationChangeListener.dispose();
      this.configurationChangeListener = undefined;
    }
    this._availabilityCache.clear();
    this._pendingAvailabilityChecks.clear();
  }
}