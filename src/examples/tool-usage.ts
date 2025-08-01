/**
 * Example usage of the Tool Definition Framework with AI agents
 */

import * as vscode from 'vscode';
import {
  ToolManager,
  BuiltInTools,
  ToolExecutionError
} from '../core/tool-manager';
import {
  ToolRegistry,
  ExecutionContext,
  SecurityLevel,
  ToolDefinition
} from '../core/tools';
import { ChatBridge } from '../core/chat';
import { IAgent } from '../core/agent';

/**
 * Example: Setting up and using tools with an AI agent
 */
export class ToolUsageExample {
  private toolManager: ToolManager;
  private chatBridge: ChatBridge;

  constructor() {
    this.toolManager = ToolManager.getInstance();
    this.chatBridge = new ChatBridge();
    
    // Register all built-in tools
    BuiltInTools.registerAll();
    
    // Register custom tools
    this.registerCustomTools();
  }

  /**
   * Register custom tools specific to your application
   */
  private registerCustomTools(): void {
    // Example: Custom tool for project analysis
    const analyzeProjectTool: ToolDefinition = {
      name: 'analyze_project',
      description: 'Analyze the current project structure and provide insights',
      category: 'analysis',
      parameters: {
        type: 'object',
        properties: {
          includeTests: {
            type: 'boolean',
            description: 'Whether to include test files in analysis'
          },
          maxDepth: {
            type: 'number',
            description: 'Maximum directory depth to analyze',
            minimum: 1,
            maximum: 10
          }
        }
      },
      security: {
        requiresApproval: false,
        allowedInWeb: true,
        riskLevel: 'low'
      },
      executor: async (parameters: { includeTests?: boolean; maxDepth?: number }, context) => {
        try {
          const workspaceUri = context.workspaceUri || vscode.workspace.workspaceFolders?.[0]?.uri;
          if (!workspaceUri) {
            return { success: false, error: 'No workspace available' };
          }

          // Analyze project structure
          const analysis = await this.analyzeProjectStructure(
            workspaceUri,
            parameters.includeTests ?? true,
            parameters.maxDepth ?? 5
          );

          return {
            success: true,
            data: analysis,
            metadata: {
              timestamp: new Date().toISOString(),
              workspacePath: workspaceUri.path
            }
          };
        } catch (error) {
          return {
            success: false,
            error: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    };

    this.toolManager.registerTool(analyzeProjectTool);

    // Example: Custom tool for running tests
    const runTestsTool: ToolDefinition = {
      name: 'run_tests',
      description: 'Run tests in the current workspace',
      category: 'testing',
      parameters: {
        type: 'object',
        properties: {
          testPattern: {
            type: 'string',
            description: 'Glob pattern for test files to run'
          },
          verbose: {
            type: 'boolean',
            description: 'Enable verbose output'
          }
        }
      },
      security: {
        requiresApproval: true,
        allowedInWeb: false,
        riskLevel: 'medium',
        permissions: ['vscode.commands']
      },
      executor: async (parameters: { testPattern?: string; verbose?: boolean }, context) => {
        try {
          // Execute test command
          const testCommand = parameters.testPattern 
            ? `npm test -- ${parameters.testPattern}`
            : 'npm test';

          const terminal = vscode.window.createTerminal('Test Runner');
          terminal.sendText(testCommand);
          terminal.show();

          return {
            success: true,
            data: { command: testCommand, terminalName: 'Test Runner' },
            metadata: { timestamp: new Date().toISOString() }
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to run tests: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    };

    this.toolManager.registerTool(runTestsTool);
  }

  /**
   * Example: Execute tools based on AI agent requests
   */
  public async handleAgentToolRequest(
    agent: IAgent,
    toolName: string,
    parameters: any,
    sessionId: string
  ): Promise<any> {
    try {
      // Create execution context
      const context: ExecutionContext = {
        agentId: agent.id,
        sessionId: sessionId,
        workspaceUri: vscode.workspace.workspaceFolders?.[0]?.uri,
        user: {
          id: 'current-user', // In real implementation, get from VS Code context
          permissions: this.getUserPermissions()
        },
        security: {
          level: this.getSecurityLevel(agent),
          allowDangerous: false // Set based on user preferences
        }
      };

      // Execute the tool
      const result = await this.toolManager.executeTool(toolName, parameters, context);
      
      // Log the execution for debugging
      console.log(`Tool '${toolName}' executed:`, {
        success: result.success,
        agentId: agent.id,
        sessionId: sessionId
      });

      return result;
    } catch (error) {
      if (error instanceof ToolExecutionError) {
        // Handle specific tool execution errors
        switch (error.code) {
          case 'TOOL_NOT_FOUND':
            return {
              success: false,
              error: `Tool '${toolName}' is not available. Available tools: ${this.getAvailableToolNames().join(', ')}`
            };
          case 'INVALID_PARAMETERS':
            return {
              success: false,
              error: `Invalid parameters for '${toolName}': ${error.message}`
            };
          case 'SECURITY_VIOLATION':
            return {
              success: false,
              error: `Security violation: ${error.message}`
            };
          case 'USER_DENIED':
            return {
              success: false,
              error: 'Tool execution was denied by the user'
            };
          default:
            return {
              success: false,
              error: `Tool execution failed: ${error.message}`
            };
        }
      }
      
      throw error;
    }
  }

  /**
   * Example: Get available tools for an agent with context
   */
  public getAvailableToolsForAgent(agent: IAgent, sessionId: string): ToolDefinition[] {
    const context: ExecutionContext = {
      agentId: agent.id,
      sessionId: sessionId,
      workspaceUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      user: {
        id: 'current-user',
        permissions: this.getUserPermissions()
      },
      security: {
        level: this.getSecurityLevel(agent),
        allowDangerous: false
      }
    };

    return this.toolManager.getAvailableTools(context);
  }

  /**
   * Example: Generate tool descriptions for AI agent context
   */
  public generateToolDescriptionsForAgent(agent: IAgent, sessionId: string): string {
    const availableTools = this.getAvailableToolsForAgent(agent, sessionId);
    
    const descriptions = availableTools.map(tool => {
      const params = this.formatParameterSchema(tool.parameters);
      return `${tool.name}: ${tool.description}\nParameters: ${params}\nSecurity: ${tool.security.riskLevel} risk`;
    });

    return `Available tools:\n${descriptions.join('\n\n')}`;
  }

  /**
   * Example: Handle AI agent conversation with tool integration
   */
  public async processAgentMessageWithTools(
    agent: IAgent,
    message: string,
    sessionId: string
  ): Promise<string> {
    try {
      // Add tool context to the message
      const toolContext = this.generateToolDescriptionsForAgent(agent, sessionId);
      const enhancedMessage = `${message}\n\n${toolContext}\n\nYou can use these tools by responding with JSON in the format: {"tool": "tool_name", "parameters": {...}}`;

      // Send message to AI agent
      const response = await this.chatBridge.sendMessage(agent, [
        { role: 'user', content: enhancedMessage }
      ]);

      // Check if the response contains a tool call
      const toolCall = this.parseToolCall(response.content);
      if (toolCall) {
        // Execute the requested tool
        const toolResult = await this.handleAgentToolRequest(
          agent,
          toolCall.tool,
          toolCall.parameters,
          sessionId
        );

        // Send tool result back to agent for final response
        const followUpMessage = `Tool execution result: ${JSON.stringify(toolResult)}\n\nPlease provide a natural language response based on this result.`;
        const finalResponse = await this.chatBridge.sendMessage(agent, [
          { role: 'user', content: enhancedMessage },
          { role: 'assistant', content: response.content },
          { role: 'user', content: followUpMessage }
        ]);

        return finalResponse.content;
      }

      return response.content;
    } catch (error) {
      console.error('Error processing agent message with tools:', error);
      return `I encountered an error while processing your request: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Get execution statistics for monitoring
   */
  public getToolUsageStats() {
    return this.toolManager.getExecutionStats();
  }

  /**
   * Helper methods
   */
  private getUserPermissions(): string[] {
    // In a real implementation, get user permissions from VS Code context or configuration
    return ['filesystem.read', 'filesystem.write', 'vscode.commands'];
  }

  private getSecurityLevel(agent: IAgent): SecurityLevel {
    // Determine security level based on agent configuration or user settings
    return SecurityLevel.NORMAL;
  }

  private getAvailableToolNames(): string[] {
    const registry = ToolRegistry.getInstance();
    return registry.getAllTools().map(tool => tool.name);
  }

  private formatParameterSchema(schema: any): string {
    if (schema.type === 'object' && schema.properties) {
      const props = Object.entries(schema.properties).map(([key, value]: [string, any]) => {
        const required = schema.required?.includes(key) ? ' (required)' : '';
        return `${key}: ${value.type}${required}`;
      });
      return `{${props.join(', ')}}`;
    }
    return JSON.stringify(schema);
  }

  private parseToolCall(content: string): { tool: string; parameters: any } | null {
    try {
      // Simple JSON extraction - in practice, you might want more sophisticated parsing
      const jsonMatch = content.match(/\{[^}]*"tool"[^}]*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      // Not a tool call
    }
    return null;
  }

  private async analyzeProjectStructure(
    workspaceUri: vscode.Uri,
    includeTests: boolean,
    maxDepth: number
  ): Promise<any> {
    // Simplified project analysis - in practice, this would be more comprehensive
    const analysis = {
      totalFiles: 0,
      fileTypes: {} as Record<string, number>,
      directories: [] as string[],
      testFiles: 0,
      insights: [] as string[]
    };

    const processDirectory = async (uri: vscode.Uri, depth: number, relativePath: string) => {
      if (depth > maxDepth) return;

      try {
        const entries = await vscode.workspace.fs.readDirectory(uri);
        
        for (const [name, type] of entries) {
          if (type === vscode.FileType.Directory) {
            analysis.directories.push(relativePath ? `${relativePath}/${name}` : name);
            const subUri = vscode.Uri.joinPath(uri, name);
            await processDirectory(subUri, depth + 1, relativePath ? `${relativePath}/${name}` : name);
          } else {
            analysis.totalFiles++;
            
            const extension = name.split('.').pop()?.toLowerCase() || 'no-extension';
            analysis.fileTypes[extension] = (analysis.fileTypes[extension] || 0) + 1;
            
            if (includeTests && (name.includes('.test.') || name.includes('.spec.'))) {
              analysis.testFiles++;
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    await processDirectory(workspaceUri, 0, '');

    // Generate insights
    if (analysis.totalFiles > 100) {
      analysis.insights.push('Large project with many files');
    }
    if (analysis.testFiles === 0) {
      analysis.insights.push('No test files detected - consider adding tests');
    }
    if (analysis.fileTypes['ts'] || analysis.fileTypes['js']) {
      analysis.insights.push('TypeScript/JavaScript project detected');
    }

    return analysis;
  }
}

/**
 * Example usage in VS Code extension
 */
export function activateToolFramework(context: vscode.ExtensionContext) {
  const toolExample = new ToolUsageExample();
  
  // Register command to show available tools
  const showToolsCommand = vscode.commands.registerCommand('comrade.showAvailableTools', () => {
    const registry = ToolRegistry.getInstance();
    const tools = registry.getAllTools();
    const toolList = tools.map(tool => `${tool.name}: ${tool.description}`).join('\n');
    
    vscode.window.showInformationMessage(`Available Tools:\n${toolList}`);
  });

  // Register command to show tool usage statistics
  const showStatsCommand = vscode.commands.registerCommand('comrade.showToolStats', () => {
    const stats = toolExample.getToolUsageStats();
    const statsMessage = `Tool Usage Statistics:\nTotal Executions: ${stats.totalExecutions}\nSuccessful: ${stats.successfulExecutions}\nFailed: ${stats.failedExecutions}`;
    
    vscode.window.showInformationMessage(statsMessage);
  });

  context.subscriptions.push(showToolsCommand, showStatsCommand);
}