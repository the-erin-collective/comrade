/**
 * Configuration system for agent management and VS Code settings integration
 */

import * as vscode from 'vscode';
import { AgentConfig, AgentCapabilities, LLMProvider, IAgent } from './agent';
import { ConfigurationValidator } from './config-validator';
import { ProviderConfig, Agent } from './types';
import { ProviderManagerService as ProviderManager } from './provider-manager';

export interface AgentConfigurationItem {
  id: string;
  name: string;
  provider: LLMProvider;
  model: string;
  endpoint?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  capabilities: AgentCapabilities;
  isEnabledForAssignment: boolean;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export interface ComradeConfiguration {
  agents: AgentConfigurationItem[];
  providers: ProviderConfig[];
  assignmentDefaultMode: 'speed' | 'structure';
  mcpServers: MCPServerConfig[];
  contextMaxFiles: number;
  contextMaxTokens: number;
}

export class ConfigurationManager {
  private static instance: ConfigurationManager | null = null;
  private secretStorage: vscode.SecretStorage;
  private providerManager: ProviderManager;

  /**
   * Get the singleton instance of ConfigurationManager
   */
  public static getInstance(secretStorage: vscode.SecretStorage): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager(secretStorage);
    }
    return ConfigurationManager.instance;
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    ConfigurationManager.instance = null;
  }

  constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
    this.providerManager = ProviderManager.getInstance(secretStorage);
  }

  /**
   * Safely unwraps a value that might be wrapped in a VS Code configuration object
   * Handles nested objects and arrays recursively
   */
  private unwrap<T = unknown>(val: T): T {
    // Handle null/undefined
    if (val === null || val === undefined) {
      return val;
    }
    
    // Handle primitive values
    const type = typeof val;
    if (type !== 'object' && type !== 'function') {
      return val;
    }
    
    // Handle VS Code configuration value objects (multiple patterns)
    if (val && typeof val === 'object') {
      // Pattern 1: { value: actualValue }
      if ('value' in val && Object.keys(val).length === 1) {
        return this.unwrap((val as { value: unknown }).value) as T;
      }
      
      // Pattern 2: { defaultValue: x, globalValue: y, workspaceValue: z, ... }
      // VS Code sometimes wraps values in configuration objects with these properties
      const configKeys = ['defaultValue', 'globalValue', 'workspaceValue', 'workspaceFolderValue'];
      const hasConfigKeys = configKeys.some(key => key in val);
      
      if (hasConfigKeys) {
        // Use the most specific value available (workspace > global > default)
        const configObj = val as any;
        const actualValue = configObj.workspaceFolderValue ?? 
                           configObj.workspaceValue ?? 
                           configObj.globalValue ?? 
                           configObj.defaultValue;
        return this.unwrap(actualValue) as T;
      }
    }
    
    // Handle arrays
    if (Array.isArray(val)) {
      return (val as unknown[]).map(item => this.unwrap(item)) as unknown as T;
    }
    
    // Handle Date, RegExp, etc. - don't unwrap these
    if (val instanceof Date || val instanceof RegExp) {
      return val;
    }
    
    // Handle nested objects - only unwrap if it looks like a plain object
    if (val && typeof val === 'object' && val.constructor === Object) {
      const result: Record<string, unknown> = {};
      let hasProperties = false;
      
      for (const key in val) {
        if (Object.prototype.hasOwnProperty.call(val, key)) {
          const unwrappedValue = this.unwrap((val as Record<string, unknown>)[key]);
          result[key] = unwrappedValue;
          hasProperties = true;
        }
      }
      
      return hasProperties ? result as T : val;
    }
    
    // For other object types (classes, etc.), return as-is
    return val;
  }

  /**
   * Safely gets a configuration value with type checking and default fallback
   * @param key Configuration key path (e.g., 'agents', 'context.maxFiles')
   * @param defaultValue Default value if key is not found or invalid
   * @param validator Optional validation function
   */
  private safeGet<T>(
    key: string,
    defaultValue: T,
    validator?: (value: unknown) => boolean
  ): T {
    try {
      // Get the raw value from VS Code configuration
      const config = vscode.workspace.getConfiguration('comrade');
      let value = config.get(key);
      
      // Unwrap the value if it's wrapped in a VS Code configuration object
      value = this.unwrap(value);
      
      // If the value is undefined or null, return the default
      if (value === undefined || value === null) {
        return defaultValue;
      }
      
      // Validate the value if a validator is provided
      if (validator && !validator(value)) {
        console.warn(`Validation failed for key '${key}', using default value`);
        return defaultValue;
      }
      
      return value as T;
    } catch (error) {
      console.warn(`Error getting configuration key '${key}': ${error}`);
      return defaultValue;
    }
  }

  /**
   * Get default configuration with safe fallback values
   */
  private getDefaultConfiguration(): ComradeConfiguration {
    return {
      agents: [],
      providers: [],
      assignmentDefaultMode: 'speed',
      mcpServers: [],
      contextMaxFiles: 100,
      contextMaxTokens: 8000
    };
  }

  /**
   * Notify user about configuration errors
   */
  private notifyConfigurationError(
    message: string,
    details: string[] = [],
    isWarning: boolean = false
  ): void {
    const fullMessage = details.length > 0 
      ? `${message}\n\nDetails:\n${details.join('\n')}`
      : message;

    console[isWarning ? 'warn' : 'error'](fullMessage);
    
    // Show notification to user
    if (isWarning) {
      vscode.window.showWarningMessage(message, 'Show Details')
        .then(selection => {
          if (selection === 'Show Details') {
            vscode.window.showErrorMessage(fullMessage, { modal: true });
          }
        });
    } else {
      vscode.window.showErrorMessage(message, 'Show Details')
        .then(selection => {
          if (selection === 'Show Details') {
            vscode.window.showErrorMessage(fullMessage, { modal: true });
          }
        });
    }
  }

  /**
   * Validate and clean MCP server configurations
   * @param servers Array of MCP server configurations to validate (can be any[] or MCPServerConfig[])
   * @returns Validated array of MCPServerConfig objects
   */
  private validateMCPServerConfigurations(servers: any[] | MCPServerConfig[]): MCPServerConfig[] {
    if (!Array.isArray(servers)) {
      console.warn('MCP servers configuration is not an array, using empty array');
      return [];
    }

    // If we have an empty array, nothing to validate
    if (servers.length === 0) {
      return [];
    }

    // If the first item is already a valid MCPServerConfig (has required fields), use direct validation
    const firstItem = servers[0];
    if (firstItem && 
        typeof firstItem === 'object' && 
        'id' in firstItem && 
        'name' in firstItem && 
        'command' in firstItem) {
      // Use the more specific validation for MCPServerConfig[]
      return servers.map(server => ({
        id: server.id || this.generateMCPServerId(),
        name: server.name || 'Unnamed MCP Server',
        command: server.command || '',
        args: Array.isArray(server.args) ? server.args : [],
        env: server.env || {},
        timeout: typeof server.timeout === 'number' ? server.timeout : 30000 // Default 30s timeout
      } as MCPServerConfig)).filter((server): server is MCPServerConfig => 
        !!server.id && !!server.name && !!server.command
      );
    }

    // Otherwise, use the more general validation that processes each item
    return servers.map((server, index) => {
      try {
        return {
          id: server.id || this.generateMCPServerId(),
          name: server.name || `Unnamed MCP Server ${index + 1}`,
          command: server.command || '',
          args: Array.isArray(server.args) ? server.args : [],
          env: server.env || {},
          timeout: typeof server.timeout === 'number' ? server.timeout : 30000
        } as MCPServerConfig;
      } catch (error) {
        console.warn(`Error processing MCP server at index ${index}:`, error);
        return null;
      }
    }).filter((server): server is MCPServerConfig => 
      server !== null && !!server.id && !!server.name && !!server.command
    );
  }

  /**
   * Update agent configuration in VS Code settings
   */
  public async updateAgentConfiguration(agents: AgentConfigurationItem[]): Promise<void> {
    // Validate before saving (Requirement 6.4)
    const validation = ConfigurationValidator.validateAndSanitizeAgents(agents);
    
    if (validation.errors.length > 0) {
      const errorMessage = `Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`;
      console.error(errorMessage, validation.errors);
      throw new Error(errorMessage);
    }

    // Log warnings but continue
    validation.warnings.forEach(warning => {
      console.warn(`Configuration warning at ${warning.path}: ${warning.message}`);
    });

    const config = vscode.workspace.getConfiguration('comrade');
    await config.update('agents', validation.valid, vscode.ConfigurationTarget.Global);
  }

  /**
   * Add a new agent configuration
   */
  public async addAgent(agentConfig: AgentConfigurationItem): Promise<void> {
    // Validate single agent before adding (Requirement 6.4)
    const validation = ConfigurationValidator.validateAgentConfiguration(agentConfig);
    
    if (!validation.isValid) {
      const errorMessage = `Agent configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`;
      console.error(errorMessage, validation.errors);
      throw new Error(errorMessage);
    }

    const validatedAgent = validation.filteredConfig as AgentConfigurationItem;
    const currentConfig = this.getConfiguration();
    const existingIndex = currentConfig.agents.findIndex(a => a.id === validatedAgent.id);
    
    if (existingIndex >= 0) {
      currentConfig.agents[existingIndex] = validatedAgent;
    } else {
      currentConfig.agents.push(validatedAgent);
    }
    
    await this.updateAgentConfiguration(currentConfig.agents);
  }

  /**
   * Remove an agent configuration
   */
  public async removeAgent(agentId: string): Promise<void> {
    const currentConfig = this.getConfiguration();
    const filteredAgents = currentConfig.agents.filter(a => a.id !== agentId);
    await this.updateAgentConfiguration(filteredAgents);
    
    // Also remove stored API key if it exists
    await this.removeApiKey(agentId);
  }

  /**
   * Store API key securely using VS Code's SecretStorage
   */
  public async storeApiKey(agentId: string, apiKey: string): Promise<void> {
    const key = `comrade.agent.${agentId}.apiKey`;
    await this.secretStorage.store(key, apiKey);
  }

  /**
   * Retrieve API key from secure storage
   */
  public async getApiKey(agentId: string): Promise<string | undefined> {
    const key = `comrade.agent.${agentId}.apiKey`;
    return await this.secretStorage.get(key);
  }

  /**
   * Remove API key from secure storage
   */
  public async removeApiKey(agentId: string): Promise<void> {
    const key = `comrade.agent.${agentId}.apiKey`;
    await this.secretStorage.delete(key);
  }

  /**
   * Toggle auto-assignment for an agent
   */
  public async toggleAgentAutoAssignment(agentId: string, enabled: boolean): Promise<void> {
    const currentConfig = this.getConfiguration();
    const agentIndex = currentConfig.agents.findIndex(a => a.id === agentId);
    
    if (agentIndex >= 0) {
      currentConfig.agents[agentIndex].isEnabledForAssignment = enabled;
      await this.updateAgentConfiguration(currentConfig.agents);
    }
  }

  /**
   * Create a complete agent instance with secure credentials
   */
  public async createAgentInstance(agentConfig: AgentConfigurationItem): Promise<IAgent> {
    // Validate the agent configuration (validator handles unwrapping internally)
    const validation = ConfigurationValidator.validateAgentConfiguration(agentConfig);
    
    if (!validation.isValid) {
      const errorMessages = validation.errors.map(e => e.message).join('; ');
      throw new Error(`Invalid agent configuration: ${errorMessages}`);
    }
    
    // Log any warnings
    if (validation.warnings.length > 0) {
      console.warn('Agent configuration warnings:', validation.warnings);
    }
    
    // Get the sanitized config
    const sanitizedConfig = validation.filteredConfig as AgentConfigurationItem;
    
    // Ensure required capabilities have default values
    const defaultCapabilities: AgentCapabilities = {
      hasVision: false,
      hasToolUse: false,
      reasoningDepth: 'intermediate',
      speed: 'medium',
      costTier: 'medium',
      maxTokens: 4000,
      supportedLanguages: ['en'],
      specializations: ['code']
    };

    // Merge provided capabilities with defaults
    const capabilities: AgentCapabilities = {
      ...defaultCapabilities,
      ...(sanitizedConfig.capabilities || {})
    };
    
    // Only retrieve API key for non-Ollama providers
    const apiKey = sanitizedConfig.provider !== 'ollama' 
      ? await this.getApiKey(sanitizedConfig.id)
      : undefined;
    
    // Create the agent configuration with all required fields
    const config: AgentConfig = {
      provider: sanitizedConfig.provider,
      endpoint: sanitizedConfig.endpoint,
      // Only include API key for non-Ollama providers
      ...(apiKey ? { apiKey } : {}),
      model: sanitizedConfig.model,
      temperature: sanitizedConfig.temperature ?? 0.7, // Default temperature
      maxTokens: sanitizedConfig.maxTokens ?? 4000, // Default max tokens
      timeout: sanitizedConfig.timeout ?? 30000, // Default 30s timeout
      // Ensure optional fields are included
      tools: {
        enabled: true,
        allowedTools: [],
        requireApproval: true
      },
      systemPrompt: '',
      maxHistoryLength: 10,
      persistHistory: false,
      contextWindowSize: 8000,
      includeFileContents: true,
      includeWorkspaceContext: true
    };

    // Create and return the IAgent implementation with proper typing
    const agent: IAgent = {
      id: sanitizedConfig.id,
      name: sanitizedConfig.name,
      provider: sanitizedConfig.provider,
      config: config,
      capabilities: capabilities,
      isEnabledForAssignment: Boolean(sanitizedConfig.isEnabledForAssignment),
      isAvailable: async () => {
        try {
          // Enhanced availability check with better error handling
          if (sanitizedConfig.provider === 'ollama' as const) {
            // For Ollama, we can assume it's available if no endpoint is specified
            // or if the endpoint is reachable
            if (!sanitizedConfig.endpoint) {return true;}
            
            // Simple fetch to check if the endpoint is reachable
            const response = await fetch(`${sanitizedConfig.endpoint}/api/tags`, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            return response.ok;
          }
          
          // For other providers, we need an API key
          return !!config.apiKey;
        } catch (error) {
          console.error(`Availability check failed for agent ${sanitizedConfig.id}:`, error);
          return false;
        }
      }
    };

    return agent;
  }

  /**
   * Generate a unique MCP server ID
   * @internal
   */
  private generateMCPServerId(): string {
    return ConfigurationValidator.generateUniqueId('mcp');
  }

  /**
   * Get all configured agents as agent instances
   * @throws {Error} When there's a failure to load configuration from VS Code API
   */
  public async getAllAgents(): Promise<IAgent[]> {
    // This will throw if VS Code API fails (handled by the caller)
    const config = this.getConfiguration();
    const agents: IAgent[] = [];
    
    // Process each agent configuration
    for (const agentConfig of config.agents) {
      try {
        const agent = await this.createAgentInstance(agentConfig);
        agents.push(agent);
      } catch (error) {
        // Log the error but continue with other agents
        console.error(`Failed to create agent instance for ${agentConfig.id}:`, error);
      }
    }
    
    return agents;
  }

  /**
   * Get agents enabled for auto-assignment
   */
  public async getAutoAssignmentEnabledAgents(): Promise<IAgent[]> {
    const allAgents = await this.getAllAgents();
    return allAgents.filter(agent => agent.isEnabledForAssignment);
  }

  /**
   * Save agent configuration (implementation for tests)
   */
  public async saveAgentConfiguration(agentConfig: AgentConfigurationItem): Promise<void> {
    await this.addAgent(agentConfig);
  }

  /**
   * Remove MCP server configuration
   */
  public async removeMcpServerConfiguration(serverId: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('comrade');
    const currentServers = config.get<MCPServerConfig[]>('mcp.servers', []);
    const filteredServers = currentServers.filter(server => server.id !== serverId);
    await config.update('mcp.servers', filteredServers, vscode.ConfigurationTarget.Global);
  }

  /**
   * Get MCP servers configuration
   */
  public getMcpServers(): MCPServerConfig[] {
    const config = this.getConfiguration();
    return config.mcpServers;
  }

  /**
   * Save MCP server configuration
   */
  public async saveMcpServerConfiguration(serverConfig: MCPServerConfig): Promise<void> {
    // Validate before saving (Requirement 6.4)
    const validation = ConfigurationValidator.validateMCPServerConfiguration(serverConfig);
    
    if (!validation.isValid) {
      const errorMessage = `MCP server configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`;
      console.error(errorMessage, validation.errors);
      throw new Error(errorMessage);
    }

    const validatedServer = validation.filteredConfig as MCPServerConfig;
    const config = vscode.workspace.getConfiguration('comrade');
    const currentServers = config.get<MCPServerConfig[]>('mcp.servers', []);
    const existingIndex = currentServers.findIndex(s => s.id === validatedServer.id);
    
    if (existingIndex >= 0) {
      currentServers[existingIndex] = validatedServer;
    } else {
      currentServers.push(validatedServer);
    }
    
    await config.update('mcp.servers', currentServers, vscode.ConfigurationTarget.Global);
  }

  /**
   * Configuration change event handler
   * @deprecated Use ConfigurationAutoReloadManager instead
   */
  public onConfigurationChanged(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('comrade')) {
        callback();
      }
    });
  }

  /**
   * Reload configuration
   */
  public async reloadConfiguration(): Promise<void> {
    // Configuration is automatically reloaded when VS Code settings change
    // This method is provided for explicit reload requests
    await this.validateConfigurationOnStartup();
  }

  /**
   * Force reload of all configuration components
   */
  public async forceReloadAllComponents(): Promise<void> {
    // This method can be called by the auto-reload system
    await this.validateConfigurationOnStartup();
    console.log('All configuration components force reloaded');
  }

  /**
   * Validate configuration on startup and show warnings for issues
   */
  public async validateConfigurationOnStartup(): Promise<void> {
    const config = this.getConfiguration();
    const issues: string[] = [];

    // Check for agents without API keys (except Ollama)
    for (const agentConfig of config.agents) {
      // Skip API key check for Ollama providers
      if (agentConfig.provider === 'ollama') {
        continue;
      }
      
      const apiKey = await this.getApiKey(agentConfig.id);
      if (!apiKey) {
        issues.push(`Agent "${agentConfig.name}" is missing an API key`);
      }
    }

    // Check for duplicate agent IDs
    const agentIds = config.agents.map(a => a.id);
    const duplicateIds = agentIds.filter((id, index) => agentIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      issues.push(`Duplicate agent IDs found: ${duplicateIds.join(', ')}`);
    }

    // Validate MCP server configurations
    for (const mcpServer of config.mcpServers) {
      if (!mcpServer.command) {
        issues.push(`MCP server "${mcpServer.name}" is missing a command`);
      }
    }

    // Show warnings if issues found
    if (issues.length > 0) {
      const message = `Comrade configuration issues found:\n${issues.join('\n')}`;
      vscode.window.showWarningMessage(message, 'Open Settings').then(selection => {
        if (selection === 'Open Settings') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'comrade');
        }
      });
    }
  }

  /**
   * Initialize default configurations for new workspaces
   * This method sets up sensible defaults without requiring user intervention
   */
  public async initializeDefaultConfiguration(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('comrade');
      
      // Check if configuration is already initialized
      const existingAgents = config.get<AgentConfigurationItem[]>('agents', []);
      if (existingAgents.length > 0) {
        console.log('Configuration already initialized with agents');
        return;
      }

      // Initialize with default agents
      const defaultConfig = this.getDefaultConfiguration();
      
      // Only set defaults if no configuration exists
      if (!config.get('agents')) {
        await config.update('agents', defaultConfig.agents, vscode.ConfigurationTarget.Global);
        console.log('Initialized default agent configurations');
      }
      
      if (!config.get('assignment.defaultMode')) {
        await config.update('assignment.defaultMode', defaultConfig.assignmentDefaultMode, vscode.ConfigurationTarget.Global);
        console.log('Initialized default assignment mode');
      }
      
      if (!config.get('context.maxFiles')) {
        await config.update('context.maxFiles', defaultConfig.contextMaxFiles, vscode.ConfigurationTarget.Global);
        console.log('Initialized default context max files');
      }
      
      if (!config.get('context.maxTokens')) {
        await config.update('context.maxTokens', defaultConfig.contextMaxTokens, vscode.ConfigurationTarget.Global);
        console.log('Initialized default context max tokens');
      }

      console.log('Default configuration initialization completed');
    } catch (error) {
      console.warn('Failed to initialize default configuration:', error);
      // Don't throw error to prevent blocking extension functionality
    }
  }

  /**
   * Get the current configuration from VS Code settings
   */
  /**
   * Process MCP server configuration with defaults
   */
  private processMcpServer(server: MCPServerConfig, index: number): MCPServerConfig {
    return {
      ...server,
      id: server.id || `mcp-${index}`,
      name: server.name || `MCP Server ${index + 1}`
    };
  }

  /**
   * Get the current configuration from VS Code settings
   */
  public getConfiguration(): ComradeConfiguration {
    const config = vscode.workspace.getConfiguration('comrade');
    
    // Use unwrap to properly handle VS Code configuration objects
    const agents = this.unwrap(config.get<AgentConfigurationItem[]>('agents')) || [];
    const providers = this.unwrap(config.get<ProviderConfig[]>('providers')) || [];
    const defaultMode = this.unwrap(config.get<'speed' | 'structure'>('assignment.defaultMode')) || 'speed';
    const contextMaxFiles = this.unwrap(config.get<number>('context.maxFiles')) || 10;
    const contextMaxTokens = this.unwrap(config.get<number>('context.maxTokens')) || 4000;
    const mcpServers = this.unwrap(config.get<MCPServerConfig[]>('mcp.servers')) || [];
    
    return {
      agents: Array.isArray(agents) ? agents : [],
      providers: Array.isArray(providers) ? providers : [],
      assignmentDefaultMode: defaultMode,
      contextMaxFiles: typeof contextMaxFiles === 'number' ? contextMaxFiles : 10,
      contextMaxTokens: typeof contextMaxTokens === 'number' ? contextMaxTokens : 4000,
      mcpServers: Array.isArray(mcpServers) ? mcpServers : []
    };
  }

  /**
   * Provide graceful configuration loading with automatic defaults
   * This method ensures the extension works even with missing or corrupted configurations
   */
  public getConfigurationWithDefaults(): ComradeConfiguration {
    try {
      return this.getConfiguration();
    } catch (error) {
      console.warn('Failed to load configuration, using defaults:', error);
      return this.getDefaultConfiguration();
    }
  }

  /**
   * Provider Management Methods
   * These methods delegate to the ProviderManagerService for the new architecture
   */

  /**
   * Get all configured providers
   */
  public getProviders(): ProviderConfig[] {
    return this.providerManager.getProviders();
  }

  /**
   * Get active providers only
   */
  public getActiveProviders(): ProviderConfig[] {
    return this.providerManager.getActiveProviders();
  }

  /**
   * Get provider by ID
   */
  public getProviderById(id: string): ProviderConfig | null {
    return this.providerManager.getProviderById(id);
  }

  /**
   * Add a new provider
   */
  public async addProvider(providerData: any): Promise<ProviderConfig> {
    return await this.providerManager.addProvider(providerData);
  }

  /**
   * Update an existing provider
   */
  public async updateProvider(id: string, updates: any): Promise<ProviderConfig> {
    return await this.providerManager.updateProvider(id, updates);
  }

  /**
   * Delete a provider
   */
  public async deleteProvider(id: string): Promise<void> {
    await this.providerManager.deleteProvider(id);
  }

  /**
   * Toggle provider active status
   */
  public async toggleProviderStatus(id: string, isActive: boolean): Promise<ProviderConfig> {
    return await this.providerManager.toggleProviderStatus(id, isActive);
  }

  /**
   * Validate provider configuration
   */
  public async validateProvider(provider: ProviderConfig): Promise<any> {
    return await this.providerManager.validateProvider(provider);
  }

  /**
   * Test provider connection
   */
  public async testProviderConnection(provider: ProviderConfig): Promise<any> {
    return await this.providerManager.testProviderConnection(provider);
  }

  /**
   * Fetch available models for a provider
   */
  public async fetchAvailableModels(providerId: string): Promise<string[]> {
    return await this.providerManager.fetchAvailableModels(providerId);
  }

  /**
   * Get provider API key
   */
  public async getProviderApiKey(providerId: string): Promise<string | undefined> {
    return await this.providerManager.getProviderApiKey(providerId);
  }

  /**
   * New Agent Management Methods for Provider-Agent Architecture
   */

  /**
   * Get all agents in the new format
   */
  public getNewAgents(): Agent[] {
    const config = vscode.workspace.getConfiguration('comrade');
    const agents = config.get<Agent[]>('newAgents', []);
    return Array.isArray(agents) ? agents : [];
  }

  /**
   * Get active agents in the new format
   */
  public getActiveNewAgents(): Agent[] {
    return this.getNewAgents().filter(agent => agent.isActive);
  }

  /**
   * Get agent by ID in the new format
   */
  public getNewAgentById(id: string): Agent | null {
    const agents = this.getNewAgents();
    return agents.find(agent => agent.id === id) || null;
  }

  /**
   * Get agents by provider ID
   */
  public getAgentsByProvider(providerId: string): Agent[] {
    return this.getNewAgents().filter(agent => agent.providerId === providerId);
  }

  /**
   * Add a new agent in the new format
   */
  public async addNewAgent(agentData: any): Promise<Agent> {
    // Validate that the provider exists and is active
    const provider = this.getProviderById(agentData.providerId);
    if (!provider) {
      throw new Error(`Provider with ID ${agentData.providerId} not found`);
    }

    if (!provider.isActive) {
      throw new Error(`Provider ${provider.name} is not active`);
    }

    // Create agent object
    const agent: Agent = {
      id: ConfigurationValidator.generateUniqueId('agent'),
      name: agentData.name,
      providerId: agentData.providerId,
      model: agentData.model,
      temperature: agentData.temperature,
      maxTokens: agentData.maxTokens,
      timeout: agentData.timeout,
      systemPrompt: agentData.systemPrompt,
      capabilities: agentData.capabilities || {
        hasVision: false,
        hasToolUse: false,
        reasoningDepth: 'intermediate',
        speed: 'medium',
        costTier: 'medium',
        maxTokens: 4000,
        supportedLanguages: ['en'],
        specializations: ['code']
      },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add to configuration
    const currentAgents = this.getNewAgents();
    const updatedAgents = [...currentAgents, agent];
    await this.updateNewAgentsConfiguration(updatedAgents);

    return agent;
  }

  /**
   * Update an existing agent in the new format
   */
  public async updateNewAgent(id: string, updates: Partial<Agent>): Promise<Agent> {
    const currentAgents = this.getNewAgents();
    const agentIndex = currentAgents.findIndex(a => a.id === id);
    
    if (agentIndex === -1) {
      throw new Error(`Agent with ID ${id} not found`);
    }

    // If provider is being changed, validate it exists and is active
    if (updates.providerId && updates.providerId !== currentAgents[agentIndex].providerId) {
      const provider = this.getProviderById(updates.providerId);
      if (!provider) {
        throw new Error(`Provider with ID ${updates.providerId} not found`);
      }
      if (!provider.isActive) {
        throw new Error(`Provider ${provider.name} is not active`);
      }
    }

    const updatedAgent = {
      ...currentAgents[agentIndex],
      ...updates,
      updatedAt: new Date()
    };

    currentAgents[agentIndex] = updatedAgent;
    await this.updateNewAgentsConfiguration(currentAgents);

    return updatedAgent;
  }

  /**
   * Delete an agent in the new format
   */
  public async deleteNewAgent(id: string): Promise<void> {
    const currentAgents = this.getNewAgents();
    const filteredAgents = currentAgents.filter(a => a.id !== id);
    
    if (filteredAgents.length === currentAgents.length) {
      throw new Error(`Agent with ID ${id} not found`);
    }

    await this.updateNewAgentsConfiguration(filteredAgents);
  }

  /**
   * Toggle agent active status in the new format
   */
  public async toggleNewAgentStatus(id: string, isActive: boolean): Promise<Agent> {
    return await this.updateNewAgent(id, { isActive });
  }

  /**
   * Deactivate all agents for a provider
   */
  public async deactivateAgentsByProvider(providerId: string): Promise<void> {
    const agents = this.getAgentsByProvider(providerId);
    for (const agent of agents) {
      if (agent.isActive) {
        await this.toggleNewAgentStatus(agent.id, false);
      }
    }
  }

  /**
   * Delete all agents for a provider
   */
  public async deleteAgentsByProvider(providerId: string): Promise<void> {
    const agents = this.getAgentsByProvider(providerId);
    for (const agent of agents) {
      await this.deleteNewAgent(agent.id);
    }
  }

  /**
   * Update agents configuration in VS Code settings
   */
  private async updateNewAgentsConfiguration(agents: Agent[]): Promise<void> {
    const config = vscode.workspace.getConfiguration('comrade');
    await config.update('newAgents', agents, vscode.ConfigurationTarget.Global);
  }

  /**
   * Migration Methods
   */

  /**
   * Migrate existing agent configurations to the new provider-agent architecture
   */
  public async migrateToProviderAgentArchitecture(): Promise<{ providersCreated: number; agentsUpdated: number; errors: string[] }> {
    const errors: string[] = [];
    let providersCreated = 0;
    let agentsUpdated = 0;

    try {
      // Get existing agents
      const existingAgents = this.getConfiguration().agents;
      const providerMap = new Map<string, ProviderConfig>();

      // Create providers from existing agent configurations
      for (const agentConfig of existingAgents) {
        try {
          const providerKey = `${agentConfig.provider}-${agentConfig.endpoint || 'default'}`;
          
          if (!providerMap.has(providerKey)) {
            // Create provider
            const providerData = {
              name: `${agentConfig.provider.charAt(0).toUpperCase() + agentConfig.provider.slice(1)} Provider`,
              type: agentConfig.provider === 'ollama' ? 'local-network' as const : 'cloud' as const,
              provider: agentConfig.provider,
              endpoint: agentConfig.endpoint,
              localHostType: agentConfig.provider === 'ollama' ? 'ollama' as const : undefined
            };

            const provider = await this.addProvider(providerData);
            providerMap.set(providerKey, provider);
            providersCreated++;

            // Migrate API key if it exists
            const apiKey = await this.getApiKey(agentConfig.id);
            if (apiKey && provider.type === 'cloud') {
              await this.providerManager.storeProviderApiKey(provider.id, apiKey);
            }
          }
        } catch (error) {
          errors.push(`Failed to create provider for agent ${agentConfig.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Create new agents that reference providers
      for (const agentConfig of existingAgents) {
        try {
          const providerKey = `${agentConfig.provider}-${agentConfig.endpoint || 'default'}`;
          const provider = providerMap.get(providerKey);

          if (provider) {
            const newAgentData = {
              name: agentConfig.name,
              providerId: provider.id,
              model: agentConfig.model,
              temperature: agentConfig.temperature,
              maxTokens: agentConfig.maxTokens,
              timeout: agentConfig.timeout,
              capabilities: agentConfig.capabilities
            };

            await this.addNewAgent(newAgentData);
            agentsUpdated++;
          } else {
            errors.push(`Could not find provider for agent ${agentConfig.name}`);
          }
        } catch (error) {
          errors.push(`Failed to migrate agent ${agentConfig.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return { providersCreated, agentsUpdated, errors };
    } catch (error) {
      errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { providersCreated, agentsUpdated, errors };
    }
  }

  /**
   * Check if migration is needed
   */
  public needsMigration(): boolean {
    const existingAgents = this.getConfiguration().agents;
    const newAgents = this.getNewAgents();
    const providers = this.getProviders();

    // Migration is needed if we have old agents but no new agents or providers
    return existingAgents.length > 0 && newAgents.length === 0 && providers.length === 0;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    if (this.providerManager) {
      this.providerManager.dispose();
    }
  }
}