/**
 * Model Context Protocol (MCP) interfaces and types
 */

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  timeout?: number;
  disabled?: boolean;
  autoReconnect?: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  serverId: string;
  version?: string;
}

export interface MCPToolResult {
  success: boolean;
  content?: any;
  error?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface MCPServerStatus {
  id: string;
  isConnected: boolean;
  isHealthy: boolean;
  lastPing?: Date;
  error?: string;
  toolCount: number;
}

export interface IMCPManager {
  registerServer(config: MCPServerConfig): Promise<void>;
  unregisterServer(serverId: string): Promise<void>;
  listAvailableTools(): Promise<MCPTool[]>;
  invokeTool(toolName: string, parameters: Record<string, any>): Promise<MCPToolResult>;
  isServerAvailable(serverId: string): Promise<boolean>;
  getServerStatus(serverId: string): Promise<MCPServerStatus>;
  reconnectServer(serverId: string): Promise<void>;
  getAllServerStatuses(): Promise<MCPServerStatus[]>;
}

interface MCPServerConnection {
  config: MCPServerConfig;
  process?: any; // Child process
  isConnected: boolean;
  tools: MCPTool[];
  lastPing?: Date;
  error?: string;
  reconnectAttempts: number;
}

export class MCPManager implements IMCPManager {
  private servers: Map<string, MCPServerConnection> = new Map();
  private readonly maxReconnectAttempts = 3;
  private readonly reconnectDelay = 5000; // 5 seconds
  private readonly healthCheckInterval = 30000; // 30 seconds
  private healthCheckTimer?: NodeJS.Timeout;

  constructor() {
    this.startHealthCheck();
  }

  async registerServer(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.id)) {
      await this.unregisterServer(config.id);
    }

    const connection: MCPServerConnection = {
      config,
      isConnected: false,
      tools: [],
      reconnectAttempts: 0
    };

    this.servers.set(config.id, connection);

    if (!config.disabled) {
      await this.connectServer(config.id);
    }
  }

  async unregisterServer(serverId: string): Promise<void> {
    const connection = this.servers.get(serverId);
    if (!connection) {
      return;
    }

    await this.disconnectServer(serverId);
    this.servers.delete(serverId);
  }

  async listAvailableTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];
    
    for (const [serverId, connection] of this.servers) {
      if (connection.isConnected && !connection.config.disabled) {
        allTools.push(...connection.tools);
      }
    }

    return allTools;
  }

  async invokeTool(toolName: string, parameters: Record<string, any>): Promise<MCPToolResult> {
    // Find the server that provides this tool
    let targetConnection: MCPServerConnection | undefined;
    let targetServerId: string | undefined;

    for (const [serverId, connection] of this.servers) {
      if (connection.isConnected && connection.tools.some(tool => tool.name === toolName)) {
        targetConnection = connection;
        targetServerId = serverId;
        break;
      }
    }

    if (!targetConnection || !targetServerId) {
      return {
        success: false,
        error: `Tool '${toolName}' not found in any connected MCP server`,
        timestamp: new Date()
      };
    }

    try {
      // Simulate tool invocation - in real implementation, this would use MCP protocol
      const result = await this.executeToolOnServer(targetServerId, toolName, parameters);
      return {
        success: true,
        content: result,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during tool invocation',
        timestamp: new Date()
      };
    }
  }

  async isServerAvailable(serverId: string): Promise<boolean> {
    const connection = this.servers.get(serverId);
    return connection?.isConnected && !connection.config.disabled || false;
  }

  async getServerStatus(serverId: string): Promise<MCPServerStatus> {
    const connection = this.servers.get(serverId);
    
    if (!connection) {
      throw new Error(`Server '${serverId}' not found`);
    }

    return {
      id: serverId,
      isConnected: connection.isConnected,
      isHealthy: connection.isConnected && !connection.error,
      lastPing: connection.lastPing,
      error: connection.error,
      toolCount: connection.tools.length
    };
  }

  async reconnectServer(serverId: string): Promise<void> {
    const connection = this.servers.get(serverId);
    if (!connection) {
      throw new Error(`Server '${serverId}' not found`);
    }

    await this.disconnectServer(serverId);
    connection.reconnectAttempts = 0;
    await this.connectServer(serverId);
  }

  async getAllServerStatuses(): Promise<MCPServerStatus[]> {
    const statuses: MCPServerStatus[] = [];
    
    for (const serverId of this.servers.keys()) {
      try {
        const status = await this.getServerStatus(serverId);
        statuses.push(status);
      } catch (error) {
        // Skip servers that can't provide status
      }
    }

    return statuses;
  }

  private async connectServer(serverId: string): Promise<void> {
    const connection = this.servers.get(serverId);
    if (!connection) {
      return;
    }

    try {
      // In a real implementation, this would spawn the MCP server process
      // and establish communication via stdio or other transport
      
      // Simulate connection process
      await this.simulateServerConnection(connection);
      
      connection.isConnected = true;
      connection.error = undefined;
      connection.lastPing = new Date();
      connection.reconnectAttempts = 0;

      // Discover available tools
      await this.discoverTools(serverId);

    } catch (error) {
      connection.isConnected = false;
      connection.error = error instanceof Error ? error.message : 'Connection failed';
      
      // Schedule reconnection if auto-reconnect is enabled
      if (connection.config.autoReconnect !== false) {
        this.scheduleReconnection(serverId);
      }
    }
  }

  private async disconnectServer(serverId: string): Promise<void> {
    const connection = this.servers.get(serverId);
    if (!connection) {
      return;
    }

    if (connection.process) {
      // In real implementation, terminate the child process
      connection.process = undefined;
    }

    connection.isConnected = false;
    connection.tools = [];
    connection.error = undefined;
  }

  private async simulateServerConnection(connection: MCPServerConnection): Promise<void> {
    // Simulate spawning process and establishing connection
    // In real implementation, this would use child_process.spawn()
    
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate random connection failures for testing
        if (Math.random() < 0.1) {
          reject(new Error('Simulated connection failure'));
        } else {
          resolve();
        }
      }, 1000);
    });
  }

  private async discoverTools(serverId: string): Promise<void> {
    const connection = this.servers.get(serverId);
    if (!connection || !connection.isConnected) {
      return;
    }

    // In real implementation, this would query the MCP server for available tools
    // For now, simulate some tools based on server name
    const mockTools: MCPTool[] = [
      {
        name: `${serverId}_tool_1`,
        description: `Sample tool from ${connection.config.name}`,
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input parameter' }
          }
        },
        serverId
      }
    ];

    connection.tools = mockTools;
  }

  private async executeToolOnServer(serverId: string, toolName: string, parameters: Record<string, any>): Promise<any> {
    // In real implementation, this would send a tool invocation request to the MCP server
    // and wait for the response
    
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          result: `Tool ${toolName} executed with parameters: ${JSON.stringify(parameters)}`,
          serverId
        });
      }, 500);
    });
  }

  private scheduleReconnection(serverId: string): void {
    const connection = this.servers.get(serverId);
    if (!connection || connection.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    connection.reconnectAttempts++;
    
    setTimeout(async () => {
      if (this.servers.has(serverId) && !connection.isConnected) {
        await this.connectServer(serverId);
      }
    }, this.reconnectDelay * connection.reconnectAttempts);
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      for (const [serverId, connection] of this.servers) {
        if (connection.isConnected) {
          try {
            // Perform health check - in real implementation, this would ping the server
            connection.lastPing = new Date();
          } catch (error) {
            connection.error = error instanceof Error ? error.message : 'Health check failed';
            connection.isConnected = false;
            
            if (connection.config.autoReconnect !== false) {
              this.scheduleReconnection(serverId);
            }
          }
        }
      }
    }, this.healthCheckInterval);
  }

  dispose(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Disconnect all servers
    for (const serverId of this.servers.keys()) {
      this.disconnectServer(serverId);
    }

    this.servers.clear();
  }
}