/**
 * Tool Manager for executing tools with validation and security
 */

import * as vscode from 'vscode';
import {
  ToolDefinition,
  ToolRegistry,
  ExecutionContext,
  ToolResult,
  ParameterValidator,
  SecurityValidator,
  SecurityLevel
} from './tools';

/**
 * Error thrown during tool execution
 */
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly toolName?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

/**
 * Statistics for tool execution
 */
export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  toolUsage: Record<string, number>;
  averageExecutionTime: number;
  lastExecutionTime?: Date;
}

/**
 * Tool Manager handles tool execution with validation and security
 */
export class ToolManager {
  private static _instance: ToolManager | null = null;
  private registry: ToolRegistry;
  private stats: ExecutionStats;

  private constructor() {
    this.registry = ToolRegistry.getInstance();
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      toolUsage: {},
      averageExecutionTime: 0
    };
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ToolManager {
    if (!ToolManager._instance) {
      ToolManager._instance = new ToolManager();
    }
    return ToolManager._instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    ToolManager._instance = null;
  }

  /**
   * Register a tool
   */
  public registerTool(tool: ToolDefinition): void {
    this.registry.registerTool(tool);
  }

  /**
   * Execute a tool with full validation
   */
  public async executeTool(
    toolName: string,
    parameters: any,
    context: ExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      // Get tool definition
      const tool = this.registry.getTool(toolName);
      if (!tool) {
        throw new ToolExecutionError(
          `Tool '${toolName}' not found`,
          'TOOL_NOT_FOUND',
          toolName
        );
      }

      // Validate parameters
      const paramValidation = ParameterValidator.validate(parameters, tool.parameters);
      if (!paramValidation.valid) {
        throw new ToolExecutionError(
          `Invalid parameters: ${paramValidation.errors.join(', ')}`,
          'INVALID_PARAMETERS',
          toolName
        );
      }

      // Validate security
      const securityValidation = await SecurityValidator.validateExecution(tool, parameters, context);
      if (!securityValidation.valid) {
        throw new ToolExecutionError(
          `Security validation failed: ${securityValidation.errors.join(', ')}`,
          'SECURITY_VIOLATION',
          toolName
        );
      }

      // Check if approval is required
      if (tool.security.requiresApproval) {
        const approved = await this.requestUserApproval(tool, parameters, context);
        if (!approved) {
          throw new ToolExecutionError(
            'Tool execution denied by user',
            'USER_DENIED',
            toolName
          );
        }
      }

      // Execute the tool
      const result = await tool.executor(parameters, context);
      
      // Update statistics
      this.updateStats(toolName, Date.now() - startTime, true);
      
      return result;
    } catch (error) {
      // Update statistics for failure
      this.updateStats(toolName, Date.now() - startTime, false);
      
      if (error instanceof ToolExecutionError) {
        throw error;
      }
      
      throw new ToolExecutionError(
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        'EXECUTION_ERROR',
        toolName,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get available tools for context
   */
  public getAvailableTools(context: ExecutionContext): ToolDefinition[] {
    return this.registry.getAvailableTools(context);
  }

  /**
   * Get execution statistics
   */
  public getExecutionStats(): ExecutionStats {
    return { ...this.stats };
  }

  /**
   * Clear execution statistics
   */
  public clearStats(): void {
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      toolUsage: {},
      averageExecutionTime: 0
    };
  }

  /**
   * Request user approval for tool execution
   */
  private async requestUserApproval(
    tool: ToolDefinition,
    parameters: any,
    context: ExecutionContext
  ): Promise<boolean> {
    const message = `The AI agent wants to execute '${tool.name}': ${tool.description}\n\nParameters: ${JSON.stringify(parameters, null, 2)}\n\nDo you want to allow this?`;
    
    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: true },
      'Allow',
      'Deny'
    );
    
    return choice === 'Allow';
  }

  /**
   * Update execution statistics
   */
  private updateStats(toolName: string, executionTime: number, success: boolean): void {
    this.stats.totalExecutions++;
    this.stats.toolUsage[toolName] = (this.stats.toolUsage[toolName] || 0) + 1;
    this.stats.lastExecutionTime = new Date();
    
    if (success) {
      this.stats.successfulExecutions++;
    } else {
      this.stats.failedExecutions++;
    }
    
    // Update average execution time
    const totalTime = this.stats.averageExecutionTime * (this.stats.totalExecutions - 1) + executionTime;
    this.stats.averageExecutionTime = totalTime / this.stats.totalExecutions;
  }
}

/**
 * Built-in tools for common operations
 */
export class BuiltInTools {
  /**
   * Create read file tool definition
   */
  private static createReadFileToolDefinition(): ToolDefinition {
    return {
      name: 'read_file',
      description: 'Read the contents of a file',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to read (relative to workspace)'
          },
          encoding: {
            type: 'string',
            description: 'File encoding (default: utf8)',
            enum: ['utf8', 'ascii', 'base64']
          }
        },
        required: ['path']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low',
        permissions: ['filesystem.read']
      },
      executor: async (parameters: { path: string; encoding?: string }, context: ExecutionContext): Promise<ToolResult> => {
        try {
          const workspaceUri = context.workspaceUri || vscode.workspace.workspaceFolders?.[0]?.uri;
          if (!workspaceUri) {
            return {
              success: false,
              error: 'No workspace available'
            };
          }

          const fileUri = vscode.Uri.joinPath(workspaceUri, parameters.path);
          const fileData = await vscode.workspace.fs.readFile(fileUri);
          
          let content: string;
          switch (parameters.encoding) {
            case 'base64':
              content = Buffer.from(fileData).toString('base64');
              break;
            case 'ascii':
              content = Buffer.from(fileData).toString('ascii');
              break;
            default:
              content = Buffer.from(fileData).toString('utf8');
          }
          
          return {
            success: true,
            data: { content, path: parameters.path, encoding: parameters.encoding || 'utf8' },
            metadata: { size: fileData.length }
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    };
  }

  /**
   * Create write file tool definition
   */
  private static createWriteFileToolDefinition(): ToolDefinition {
    return {
      name: 'write_file',
      description: 'Write content to a file',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to write (relative to workspace)'
          },
          content: {
            type: 'string',
            description: 'Content to write to the file'
          },
          encoding: {
            type: 'string',
            description: 'File encoding (default: utf8)',
            enum: ['utf8', 'ascii', 'base64']
          },
          createDirectories: {
            type: 'boolean',
            description: 'Create parent directories if they don\'t exist'
          }
        },
        required: ['path', 'content']
      },
      security: {
        requiresApproval: true,
        allowedInWeb: false,
        riskLevel: 'medium',
        permissions: ['filesystem.write']
      },
      executor: async (parameters: { path: string; content: string; encoding?: string; createDirectories?: boolean }, context: ExecutionContext): Promise<ToolResult> => {
        try {
          const workspaceUri = context.workspaceUri || vscode.workspace.workspaceFolders?.[0]?.uri;
          if (!workspaceUri) {
            return {
              success: false,
              error: 'No workspace available'
            };
          }

          const fileUri = vscode.Uri.joinPath(workspaceUri, parameters.path);
          
          // Create directories if requested
          if (parameters.createDirectories) {
            const dirUri = vscode.Uri.joinPath(fileUri, '..');
            try {
              await vscode.workspace.fs.createDirectory(dirUri);
            } catch {
              // Directory might already exist
            }
          }
          
          let buffer: Uint8Array;
          switch (parameters.encoding) {
            case 'base64':
              buffer = Buffer.from(parameters.content, 'base64');
              break;
            case 'ascii':
              buffer = Buffer.from(parameters.content, 'ascii');
              break;
            default:
              buffer = Buffer.from(parameters.content, 'utf8');
          }
          
          await vscode.workspace.fs.writeFile(fileUri, buffer);
          
          return {
            success: true,
            data: { path: parameters.path, bytesWritten: buffer.length },
            metadata: { encoding: parameters.encoding || 'utf8' }
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    };
  }

  /**
   * Create list files tool definition
   */
  private static createListFilesToolDefinition(): ToolDefinition {
    return {
      name: 'list_files',
      description: 'List files and directories in a path',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to list (relative to workspace, default: root)'
          },
          recursive: {
            type: 'boolean',
            description: 'List files recursively'
          },
          pattern: {
            type: 'string',
            description: 'Glob pattern to filter files'
          }
        }
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low',
        permissions: ['filesystem.read']
      },
      executor: async (parameters: { path?: string; recursive?: boolean; pattern?: string }, context: ExecutionContext): Promise<ToolResult> => {
        try {
          const workspaceUri = context.workspaceUri || vscode.workspace.workspaceFolders?.[0]?.uri;
          if (!workspaceUri) {
            return {
              success: false,
              error: 'No workspace available'
            };
          }

          const targetPath = parameters.path || '';
          const targetUri = vscode.Uri.joinPath(workspaceUri, targetPath);
          
          const files: Array<{ name: string; type: 'file' | 'directory'; path: string }> = [];
          
          const processDirectory = async (uri: vscode.Uri, currentPath: string) => {
            try {
              const entries = await vscode.workspace.fs.readDirectory(uri);
              
              for (const [name, type] of entries) {
                const itemPath = currentPath ? `${currentPath}/${name}` : name;
                const fileType = type === vscode.FileType.Directory ? 'directory' : 'file';
                
                // Apply pattern filter if specified
                if (parameters.pattern) {
                  const glob = new RegExp(parameters.pattern.replace(/\*/g, '.*'));
                  if (!glob.test(name)) {
                    continue;
                  }
                }
                
                files.push({ name, type: fileType, path: itemPath });
                
                // Recursively process directories if requested
                if (parameters.recursive && type === vscode.FileType.Directory) {
                  const subUri = vscode.Uri.joinPath(uri, name);
                  await processDirectory(subUri, itemPath);
                }
              }
            } catch (error) {
              // Skip directories that can't be read
              console.warn(`Could not read directory ${uri.path}:`, error);
            }
          };
          
          await processDirectory(targetUri, targetPath);
          
          return {
            success: true,
            data: { files, path: targetPath },
            metadata: { totalFiles: files.length }
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to list files: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    };
  }

  /**
   * Create show message tool definition
   */
  private static createShowMessageToolDefinition(): ToolDefinition {
    return {
      name: 'show_message',
      description: 'Show a message to the user',
      category: 'vscode',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Message to show to the user'
          },
          type: {
            type: 'string',
            enum: ['info', 'warning', 'error'],
            description: 'Type of message to show'
          }
        },
        required: ['message']
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low'
      },
      executor: async (parameters: { message: string; type?: 'info' | 'warning' | 'error' }, context: ExecutionContext): Promise<ToolResult> => {
        try {
          const messageType = parameters.type || 'info';
          
          switch (messageType) {
            case 'info':
              await vscode.window.showInformationMessage(parameters.message);
              break;
            case 'warning':
              await vscode.window.showWarningMessage(parameters.message);
              break;
            case 'error':
              await vscode.window.showErrorMessage(parameters.message);
              break;
          }
          
          return {
            success: true,
            data: { message: parameters.message, type: messageType },
            metadata: { timestamp: new Date().toISOString() }
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to show message: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    };
  }

  /**
   * Register all built-in tools
   */
  public static registerAll(): void {
    const toolManager = ToolManager.getInstance();
    
    // Register file system tools
    toolManager.registerTool(this.createReadFileToolDefinition());
    toolManager.registerTool(this.createWriteFileToolDefinition());
    toolManager.registerTool(this.createListFilesToolDefinition());
    
    // Register VS Code tools
    toolManager.registerTool(this.createShowMessageToolDefinition());
  }
}