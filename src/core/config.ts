/**
 * Configuration system for agent management and VS Code settings integration
 */

import * as vscode from 'vscode';
import { AgentConfig, AgentCapabilities, LLMProvider, IAgent } from './agent';

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
   * Get the current configuration from VS Code settings
   */
  public getConfiguration(): ComradeConfiguration {
    const config = vscode.workspace.getConfiguration('comrade');
    
    return {
      agents: this.validateAgentConfigurations(config.get<AgentConfigurationItem[]>('agents', [])),
      assignmentDefaultMode: config.get<'speed' | 'structure'>('assignment.defaultMode', 'speed'),
      mcpServers: this.validateMCPServerConfigurations(config.get<MCPServerConfig[]>('mcp.servers', [])),
      contextMaxFiles: config.get<number>('context.maxFiles', 100),
      contextMaxTokens: config.get<number>('context.maxTokens', 8000)
    };
  }

  /**
   * Update agent configuration in VS Code settings
   */
  public async updateAgentConfiguration(agents: AgentConfigurationItem[]): Promise<void> {
    const config = vscode.workspace.getConfiguration('comrade');
    const validatedAgents = this.validateAgentConfigurations(agents);
    await config.update('agents', validatedAgents, vscode.ConfigurationTarget.Global);
  }

  /**
   * Add a new agent configuration
   */
  public async addAgent(agentConfig: AgentConfigurationItem): Promise<void> {
    const currentConfig = this.getConfiguration();
    const existingIndex = currentConfig.agents.findIndex(a => a.id === agentConfig.id);
    
    if (existingIndex >= 0) {
      currentConfig.agents[existingIndex] = this.validateAgentConfiguration(agentConfig);
    } else {
      currentConfig.agents.push(this.validateAgentConfiguration(agentConfig));
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
    if (!Array.isArray(agents)) {
      console.warn('Invalid agent configurations: expected array, got', typeof agents);
      return [];
    }
    
    return agents
      .filter(agent => agent && typeof agent === 'object')
      .map(agent => {
        try {
          return this.validateAgentConfiguration(agent);
        } catch (error) {
          console.warn('Invalid agent configuration:', agent, error);
          return null;
        }
      })
      .filter((agent): agent is AgentConfigurationItem => agent !== null);
  }

  /**
   * Validate and apply defaults to a single agent configuration
   */
  private validateAgentConfiguration(agent: AgentConfigurationItem): AgentConfigurationItem {
    // Apply default values for missing properties
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

  /**
   * Validate MCP server configurations
   */
  private validateMCPServerConfigurations(servers: MCPServerConfig[] | undefined): MCPServerConfig[] {
    if (!servers || !Array.isArray(servers)) {
      return [];
    }
    
    return servers.map(server => {
      if (!server || typeof server !== 'object') {
        throw new Error('Invalid MCP server configuration: must be an object');
      }
      
      return {
        id: server.id || this.generateMCPServerId(),
        name: server.name || 'Unnamed MCP Server',
        command: server.command || '',
        args: Array.isArray(server.args) ? server.args : [],
        env: server.env && typeof server.env === 'object' ? server.env : undefined,
        timeout: typeof server.timeout === 'number' && server.timeout > 0 ? server.timeout : 10000
      };
    }).filter(server => server.command.length > 0); // Filter out servers without commands
  }

  /**
   * Generate a unique agent ID
   */
  private generateAgentId(): string {
    return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a unique MCP server ID
   */
  private generateMCPServerId(): string {
    return `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all configured agents as agent instances
   */
  public async getAllAgents(): Promise<IAgent[]> {
    const config = this.getConfiguration();
    const agents: IAgent[] = [];
    
    for (const agentConfig of config.agents) {
      try {
        const agent = await this.createAgentInstance(agentConfig);
        agents.push(agent);
      } catch (error) {
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
    const config = vscode.workspace.getConfiguration('comrade');
    const currentServers = config.get<MCPServerConfig[]>('mcp.servers', []);
    const existingIndex = currentServers.findIndex(s => s.id === serverConfig.id);
    
    if (existingIndex >= 0) {
      currentServers[existingIndex] = serverConfig;
    } else {
      currentServers.push(serverConfig);
    }
    
    await config.update('mcp.servers', currentServers, vscode.ConfigurationTarget.Global);
  }

  /**
   * Configuration change event handler
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
}