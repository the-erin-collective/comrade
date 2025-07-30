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