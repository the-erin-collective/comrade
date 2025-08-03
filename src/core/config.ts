/**
 * Configuration system for agent management and VS Code settings integration
 */

import * as vscode from 'vscode';
import { AgentConfig, AgentCapabilities, LLMProvider, IAgent } from './agent';
import { ConfigurationValidator, ValidationResult } from './config-validator';

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
  assignmentDefaultMode: 'speed' | 'structure';
  mcpServers: MCPServerConfig[];
  contextMaxFiles: number;
  contextMaxTokens: number;
}

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private secretStorage: vscode.SecretStorage;

  constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
  }

  public static getInstance(secretStorage?: vscode.SecretStorage): ConfigurationManager {
    if (!ConfigurationManager.instance && secretStorage) {
      ConfigurationManager.instance = new ConfigurationManager(secretStorage);
    }
    return ConfigurationManager.instance;
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    ConfigurationManager.instance = undefined as any;
  }

  /**
   * Get the current configuration from VS Code settings with comprehensive corruption handling
   * and retry mechanism for transient failures
   * 
   * @throws {vscode.ExtensionError} When all retry attempts fail and emergency recovery is not possible
   */
  public getConfiguration(): ComradeConfiguration {
    let corruptionDetected = false;
    let corruptionDetails: string[] = [];
    let lastError: Error | null = null;
    const maxRetries = 3;
    const configErrors: string[] = [];
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Track if this is a retry attempt
        const isRetry = attempt > 1;
        
        // Get VS Code configuration with error handling
        let config: vscode.WorkspaceConfiguration;
        try {
          config = vscode.workspace.getConfiguration('comrade');
        } catch (error) {
          const errorMessage = `Failed to access VS Code configuration (attempt ${attempt}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}`;
          console.error(errorMessage);
          configErrors.push(errorMessage);
          
          // If we can't even get the config, try with default values
          if (attempt === maxRetries) {
            console.warn('Falling back to default configuration due to VS Code API failure');
            const defaultConfig = this.getDefaultConfiguration();
            this.notifyConfigurationError('VS Code configuration API is not available', configErrors, true);
            return defaultConfig;
          }
          
          throw error; // Will be caught by outer try-catch
        }
        
        // Attempt to load raw configuration with corruption detection
        const rawConfig = this.loadRawConfigurationSafely(config);
        
        if (rawConfig.corruptionDetected) {
          corruptionDetected = true;
          corruptionDetails = rawConfig.corruptionDetails;
          const corruptionMessage = `Configuration corruption detected: ${corruptionDetails.join('; ')}`;
          console.warn(corruptionMessage);
          configErrors.push(corruptionMessage);
        }
        
        // Validate and apply defaults using the new validation engine
        const validation = ConfigurationValidator.validateConfiguration(rawConfig.config);
        
        if (!validation.isValid) {
          const validationErrors = validation.errors.map(e => `${e.path}: ${e.message}`).join('; ');
          console.warn('Configuration validation errors:', validationErrors);
          
          // Log warnings but continue with filtered config
          validation.warnings.forEach(warning => {
            const warningMessage = `Configuration warning at ${warning.path}: ${warning.message}`;
            console.warn(warningMessage);
            configErrors.push(warningMessage);
          });
        }

        // Create final configuration with defaults for any missing values
        const finalConfig: ComradeConfiguration = {
          agents: this.validateAgentConfigurations(validation.filteredConfig?.agents || rawConfig.config.agents || []),
          assignmentDefaultMode: validation.filteredConfig?.assignmentDefaultMode || rawConfig.config.assignmentDefaultMode || 'speed',
          mcpServers: this.validateMCPServerConfigurations(validation.filteredConfig?.mcpServers || rawConfig.config.mcpServers || []),
          contextMaxFiles: validation.filteredConfig?.contextMaxFiles || rawConfig.config.contextMaxFiles || 100,
          contextMaxTokens: validation.filteredConfig?.contextMaxTokens || rawConfig.config.contextMaxTokens || 8000
        };
        
        // If corruption was detected, attempt to repair and save the clean configuration
        if (corruptionDetected) {
          this.handleConfigurationCorruption(finalConfig, corruptionDetails);
        }
        
        // If this was a retry, log successful recovery
        if (isRetry) {
          console.log(`Configuration loaded successfully after ${attempt} attempts`);
        }
        
        return finalConfig;
      } catch (error) {
        lastError = error as Error;
        const errorMessage = `Failed to load configuration (attempt ${attempt}/${maxRetries}): ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMessage);
        configErrors.push(errorMessage);
        
        // If we have more retries left, wait with exponential backoff
        if (attempt < maxRetries) {
          const backoffTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.log(`Retrying in ${backoffTime}ms...`);
          
          // Simple synchronous sleep for retry delay
          const start = Date.now();
          while (Date.now() - start < backoffTime) {
            // Busy wait for the delay
          }
          continue;
        }
      }
    }
    
    // If we get here, all retries failed
    console.error('All configuration loading attempts failed, falling back to emergency recovery');
    
    // Log the final error for debugging
    if (lastError) {
      console.error('Final configuration loading error:', lastError);
    }
    
    // Attempt emergency recovery
    const recoveredConfig = this.attemptEmergencyRecovery();
    
    // Show user notification about configuration failure
    const errorMessage = lastError ? 
      `Configuration loading failed: ${lastError.message}` : 
      'Failed to load configuration';
      
    vscode.window.showErrorMessage(
      `${errorMessage}. Using emergency recovery settings. Some features may be limited.`,
      'Show Logs',
      'Open Settings'
    ).then(selection => {
      if (selection === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'comrade');
      } else if (selection === 'Show Logs') {
        vscode.commands.executeCommand('comrade.showOutputChannel');
      }
    });
    
    return recoveredConfig;
  }
  
  /**
   * Safely load raw configuration with corruption detection
   */
  private loadRawConfigurationSafely(config: vscode.WorkspaceConfiguration): {
    config: any;
    corruptionDetected: boolean;
    corruptionDetails: string[];
  } {
    const corruptionDetails: string[] = [];
    let corruptionDetected = false;
    
    const safeGet = <T>(key: string, defaultValue: T, validator?: (value: any) => boolean): T => {
      try {
        const value = config.get<T>(key, defaultValue);
        
        // Additional validation for complex types
        if (validator && !validator(value)) {
          corruptionDetails.push(`Invalid value for ${key}: failed validation`);
          corruptionDetected = true;
          return defaultValue;
        }
        
        return value;
      } catch (error) {
        corruptionDetails.push(`Failed to load ${key}: ${error instanceof Error ? error.message : String(error)}`);
        corruptionDetected = true;
        return defaultValue;
      }
    };
    
    // Validate agents array structure
    const agentsValidator = (value: any): boolean => {
      if (!Array.isArray(value)) {
        return false;
      }
      return value.every(agent => 
        typeof agent === 'object' && 
        agent !== null && 
        typeof agent.id === 'string' && 
        typeof agent.name === 'string'
      );
    };
    
    // Validate MCP servers array structure
    const mcpServersValidator = (value: any): boolean => {
      if (!Array.isArray(value)) {
        return false;
      }
      return value.every(server => 
        typeof server === 'object' && 
        server !== null && 
        typeof server.id === 'string' && 
        typeof server.command === 'string'
      );
    };
    
    const rawConfig = {
      agents: safeGet('agents', [], agentsValidator),
      assignmentDefaultMode: safeGet('assignment.defaultMode', 'speed', (value) => 
        value === 'speed' || value === 'structure'
      ),
      mcpServers: safeGet('mcp.servers', [], mcpServersValidator),
      contextMaxFiles: safeGet('context.maxFiles', 100, (value) => 
        typeof value === 'number' && value > 0 && value <= 1000
      ),
      contextMaxTokens: safeGet('context.maxTokens', 8000, (value) => 
        typeof value === 'number' && value > 0 && value <= 100000
      )
    };
    
    return {
      config: rawConfig,
      corruptionDetected,
      corruptionDetails
    };
  }
  
  /**
   * Get default configuration as fallback
   */
  private getDefaultConfiguration(): ComradeConfiguration {
    return {
      agents: [],
      assignmentDefaultMode: 'speed',
      mcpServers: [],
      contextMaxFiles: 100,
      contextMaxTokens: 8000
    };
  }
  
  /**
   * Handle configuration corruption by attempting repair and backup
   */
  private async handleConfigurationCorruption(
    cleanConfig: ComradeConfiguration, 
    corruptionDetails: string[]
  ): Promise<void> {
    try {
      console.log('Attempting to repair corrupted configuration...');
      
      // Create backup of current corrupted configuration
      const config = vscode.workspace.getConfiguration('comrade');
      const corruptedBackup = {
        timestamp: new Date().toISOString(),
        corruptionDetails,
        originalConfig: {
          agents: config.get('agents'),
          assignmentDefaultMode: config.get('assignment.defaultMode'),
          mcpServers: config.get('mcp.servers'),
          contextMaxFiles: config.get('context.maxFiles'),
          contextMaxTokens: config.get('context.maxTokens')
        }
      };
      
      // Store backup in workspace state or log it
      console.log('Corrupted configuration backup:', JSON.stringify(corruptedBackup, null, 2));
      
      // Attempt to save the clean configuration
      await config.update('agents', cleanConfig.agents, vscode.ConfigurationTarget.Global);
      await config.update('assignment.defaultMode', cleanConfig.assignmentDefaultMode, vscode.ConfigurationTarget.Global);
      await config.update('mcp.servers', cleanConfig.mcpServers, vscode.ConfigurationTarget.Global);
      await config.update('context.maxFiles', cleanConfig.contextMaxFiles, vscode.ConfigurationTarget.Global);
      await config.update('context.maxTokens', cleanConfig.contextMaxTokens, vscode.ConfigurationTarget.Global);
      
      console.log('Configuration successfully repaired and saved');
      
      // Show user notification about successful repair
      vscode.window.showInformationMessage(
        'Configuration corruption was detected and automatically repaired. Your settings have been restored to a clean state.'
      );
      
    } catch (repairError) {
      console.error('Failed to repair configuration:', repairError);
      
      // Show error notification
      vscode.window.showErrorMessage(
        'Failed to repair corrupted configuration. Please manually review your Comrade settings.',
        'Open Settings'
      ).then(selection => {
        if (selection === 'Open Settings') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'comrade');
        }
      });
    }
  }
  
  /**
   * Show user notification about configuration errors
   * @param message Primary error message
   * @param details Array of detailed error messages
   * @param isWarning Whether to show a warning instead of an error
   */
  private notifyConfigurationError(message: string, details: string[] = [], isWarning: boolean = false): void {
    const fullMessage = [message, ...details].join('\n\n');
    
    // Log the full error details
    if (isWarning) {
      console.warn(fullMessage);
    } else {
      console.error(fullMessage);
    }
    
    // Show user-friendly notification
    const showMessage = isWarning 
      ? vscode.window.showWarningMessage.bind(vscode.window)
      : vscode.window.showErrorMessage.bind(vscode.window);
    
    showMessage(
      `${message} ${details.length > 0 ? '(See logs for details)' : ''}`,
      'Open Settings',
      'Show Logs'
    ).then(selection => {
      if (selection === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'comrade');
      } else if (selection === 'Show Logs') {
        vscode.commands.executeCommand('comrade.showOutputChannel');
      }
    });
  }

  /**
   * Attempt emergency recovery when all else fails
   */
  private attemptEmergencyRecovery(): ComradeConfiguration {
    console.log('Attempting emergency configuration recovery...');
    
    // Try to recover any valid agents from corrupted data
    const recoveredAgents: AgentConfigurationItem[] = [];
    
    try {
      const config = vscode.workspace.getConfiguration('comrade');
      const rawAgents = config.get('agents');
      
      if (Array.isArray(rawAgents)) {
        for (const agent of rawAgents) {
          try {
            if (typeof agent === 'object' && agent !== null && 
                typeof agent.id === 'string' && typeof agent.name === 'string') {
              // Attempt to create a minimal valid agent
              const recoveredAgent: AgentConfigurationItem = {
                id: agent.id,
                name: agent.name,
                provider: agent.provider || 'openai',
                model: agent.model || 'gpt-3.5-turbo',
                endpoint: agent.endpoint,
                temperature: typeof agent.temperature === 'number' ? agent.temperature : 0.7,
                maxTokens: typeof agent.maxTokens === 'number' ? agent.maxTokens : undefined,
                timeout: typeof agent.timeout === 'number' ? agent.timeout : 30000,
                capabilities: agent.capabilities || {
                  hasVision: false,
                  hasToolUse: false,
                  reasoningDepth: 'intermediate',
                  speed: 'medium',
                  costTier: 'medium',
                  maxTokens: 4000,
                  supportedLanguages: ['en'],
                  specializations: ['code']
                },
                isEnabledForAssignment: typeof agent.isEnabledForAssignment === 'boolean' ? 
                  agent.isEnabledForAssignment : true
              };
              
              recoveredAgents.push(recoveredAgent);
              console.log(`Recovered agent: ${recoveredAgent.name}`);
            }
          } catch (agentError) {
            console.warn(`Failed to recover agent:`, agentError);
          }
        }
      }
    } catch (recoveryError) {
      console.error('Emergency recovery failed:', recoveryError);
    }
    
    const emergencyConfig = this.getDefaultConfiguration();
    emergencyConfig.agents = recoveredAgents;
    
    console.log(`Emergency recovery completed. Recovered ${recoveredAgents.length} agents.`);
    
    return emergencyConfig;
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
    const apiKey = await this.getApiKey(agentConfig.id);
    
    const config: AgentConfig = {
      provider: agentConfig.provider,
      endpoint: agentConfig.endpoint,
      apiKey: apiKey,
      model: agentConfig.model,
      temperature: agentConfig.temperature,
      maxTokens: agentConfig.maxTokens,
      timeout: agentConfig.timeout
    };

    return {
      id: agentConfig.id,
      name: agentConfig.name,
      provider: agentConfig.provider,
      config: config,
      capabilities: agentConfig.capabilities,
      isEnabledForAssignment: agentConfig.isEnabledForAssignment,
      isAvailable: async () => {
        // Basic availability check - can be enhanced with actual connectivity tests
        return !!(config.apiKey || agentConfig.provider === 'ollama');
      }
    };
  }

  /**
   * Validate and apply defaults to agent configurations
   */
  private validateAgentConfigurations(agents: AgentConfigurationItem[] | any): AgentConfigurationItem[] {
    try {
      // Use the new validation engine (Requirements 6.1, 6.2, 6.3)
      const validation = ConfigurationValidator.validateAndSanitizeAgents(agents);
      
      // Log validation issues
      validation.errors.forEach(error => {
        console.error(`Agent configuration error at ${error.path}: ${error.message}`);
      });
      
      validation.warnings.forEach(warning => {
        console.warn(`Agent configuration warning at ${warning.path}: ${warning.message}`);
      });

      return validation.valid;
    } catch (error) {
      console.error('Error validating agent configurations:', error);
      return []; // Return empty array on any validation error
    }
  }

  /**
   * Validate and apply defaults to a single agent configuration
   * @deprecated Use ConfigurationValidator.validateAgentConfiguration instead
   */
  private validateAgentConfiguration(agent: AgentConfigurationItem): AgentConfigurationItem {
    // Use the new validation engine for consistency
    const validation = ConfigurationValidator.validateAgentConfiguration(agent);
    
    if (!validation.isValid) {
      console.warn('Agent configuration validation failed:', validation.errors);
      // Apply legacy fallback logic for backward compatibility
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

      return {
        id: agent.id || this.generateAgentId(),
        name: agent.name || 'Unnamed Agent',
        provider: agent.provider || 'openai',
        model: agent.model || 'gpt-3.5-turbo',
        endpoint: agent.endpoint,
        temperature: agent.temperature ?? 0.7,
        maxTokens: agent.maxTokens,
        timeout: agent.timeout ?? 30000,
        capabilities: {
          ...defaultCapabilities,
          ...agent.capabilities,
          maxTokens: agent.capabilities?.maxTokens || agent.maxTokens || defaultCapabilities.maxTokens
        },
        isEnabledForAssignment: agent.isEnabledForAssignment ?? true
      };
    }

    return validation.filteredConfig as AgentConfigurationItem;
  }

  /**
   * Validate MCP server configurations
   */
  private validateMCPServerConfigurations(servers: MCPServerConfig[] | undefined): MCPServerConfig[] {
    try {
      if (!servers || !Array.isArray(servers)) {
        return [];
      }
      
      // Use the new validation engine (Requirements 6.1, 6.2, 6.3)
      const validServers = ConfigurationValidator.filterValidConfigurations<MCPServerConfig>(
        servers, 
        ConfigurationValidator.MCP_SERVER_SCHEMA
      );

      // Apply additional business logic filtering
      return validServers.filter(server => {
        if (!server.command || server.command.length === 0) {
          console.warn('Filtering out MCP server with empty command:', server);
          return false;
        }
        return true;
      });
    } catch (error) {
      console.error('Error validating MCP server configurations:', error);
      return []; // Return empty array on any validation error
    }
  }

  /**
   * Generate a unique agent ID
   */
  private generateAgentId(): string {
    return ConfigurationValidator.generateUniqueId('agent');
  }

  /**
   * Generate a unique MCP server ID
   */
  private generateMCPServerId(): string {
    return ConfigurationValidator.generateUniqueId('mcp');
  }

  /**
   * Get all configured agents as agent instances
   */
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
      if (agentConfig.provider !== 'ollama') {
        const apiKey = await this.getApiKey(agentConfig.id);
        if (!apiKey) {
          issues.push(`Agent "${agentConfig.name}" is missing an API key`);
        }
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
   * Dispose of resources
   */
  public dispose(): void {
    // Implementation for disposing resources
    // This is a placeholder - implement based on actual requirements
  }
}