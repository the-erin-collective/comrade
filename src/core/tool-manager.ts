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
  SecurityLevel,
  ValidationResult
} from './tools';
import { ChatToolCall } from './chat';

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
 * Audit log entry for tool execution
 */
export interface AuditLogEntry {
  timestamp: Date;
  toolName: string;
  parameters: any;
  context: ExecutionContext;
  result: 'success' | 'failure' | 'denied';
  error?: string;
  executionTime: number;
}

/**
 * Tool Manager handles tool execution with validation and security
 */
export class ToolManager {
  private static _instance: ToolManager | null = null;
  private registry: ToolRegistry;
  private stats: ExecutionStats;
  private auditLog: AuditLogEntry[] = [];
  private readonly MAX_AUDIT_ENTRIES = 1000;

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
        // Check for session-level approval first
        if (!this.hasSessionApproval(context.sessionId, toolName)) {
          const approved = await this.requestUserApproval(tool, parameters, context);
          if (!approved) {
            throw new ToolExecutionError(
              'Tool execution denied by user',
              'USER_DENIED',
              toolName
            );
          }
        }
      }

      // Execute the tool
      const result = await tool.executor(parameters, context);
      
      // Update statistics
      this.updateStats(toolName, Date.now() - startTime, true);
      
      // Log successful execution
      this.logExecution(toolName, parameters, context, 'success', undefined, Date.now() - startTime);
      
      return result;
    } catch (error) {
      // Update statistics for failure
      this.updateStats(toolName, Date.now() - startTime, false);
      
      // Log failed execution
      const errorMessage = error instanceof Error ? error.message : String(error);
      const resultType = error instanceof ToolExecutionError && error.code === 'USER_DENIED' ? 'denied' : 'failure';
      this.logExecution(toolName, parameters, context, resultType, errorMessage, Date.now() - startTime);
      
      if (error instanceof ToolExecutionError) {
        throw error;
      }
      
      throw new ToolExecutionError(
        `Tool execution failed: ${errorMessage}`,
        'EXECUTION_ERROR',
        toolName,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get available tools for context
   */
  public getAvailableTools(context: ExecutionContext): ToolDefinition[];
  public getAvailableTools(capabilities: import('./agent').AgentCapabilities): ToolDefinition[];
  public getAvailableTools(contextOrCapabilities: ExecutionContext | import('./agent').AgentCapabilities): ToolDefinition[] {
    // Check if it's AgentCapabilities by looking for hasToolUse property
    if ('hasToolUse' in contextOrCapabilities) {
      return this.getAvailableToolsForCapabilities(contextOrCapabilities as import('./agent').AgentCapabilities);
    }
    return this.registry.getAvailableTools(contextOrCapabilities as ExecutionContext);
  }

  /**
   * Get available tools as ChatTool format for LLM APIs
   */
  public getAvailableChatTools(context: ExecutionContext): import('./chat').ChatTool[] {
    const tools = this.getAvailableTools(context);
    return tools.map(tool => this.convertToChatTool(tool));
  }

  /**
   * Get available tools for agent capabilities (simplified for tests)
   */
  public getAvailableToolsForCapabilities(capabilities: import('./agent').AgentCapabilities): ToolDefinition[] {
    // Create a minimal execution context for filtering
    const context: ExecutionContext = {
      agentId: 'test-agent',
      sessionId: 'test-session',
      user: {
        id: 'test-user',
        permissions: ['read', 'write']
      },
      security: {
        level: capabilities.hasToolUse ? 'ELEVATED' as any : 'RESTRICTED' as any,
        allowDangerous: false
      }
    };
    return this.getAvailableTools(context);
  }

  /**
   * Convert ToolDefinition to ChatTool format
   */
  private convertToChatTool(tool: ToolDefinition): import('./chat').ChatTool {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    };
  }

  /**
   * Validate multiple tool calls in batch
   */
  public validateToolCalls(calls: ChatToolCall[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const validation = this.registry.validateToolCall(call);
      
      if (!validation.valid) {
        errors.push(`Tool call ${i + 1} (${call.name}): ${validation.errors.join(', ')}`);
      }
      
      if (validation.warnings) {
        warnings.push(`Tool call ${i + 1} (${call.name}): ${validation.warnings.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Execute multiple tools in sequence
   */
  public async executeToolCalls(
    calls: ChatToolCall[],
    context: ExecutionContext
  ): Promise<Array<{ call: ChatToolCall; result: ToolResult }>> {
    const results: Array<{ call: ChatToolCall; result: ToolResult }> = [];

    for (const call of calls) {
      try {
        const result = await this.executeTool(call.name, call.parameters, context);
        results.push({ call, result });
      } catch (error) {
        const errorResult: ToolResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
        results.push({ call, result: errorResult });
      }
    }

    return results;
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
   * Get audit log entries
   */
  public getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  public clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Get audit log entries for a specific tool
   */
  public getAuditLogForTool(toolName: string): AuditLogEntry[] {
    return this.auditLog.filter(entry => entry.toolName === toolName);
  }

  /**
   * Get approval log entries
   */
  public getApprovalLog(): Array<{
    timestamp: Date;
    toolName: string;
    parameters: any;
    context: {
      agentId: string;
      sessionId: string;
      userId: string;
      securityLevel: SecurityLevel;
    };
    decision: 'approved' | 'denied';
    riskScore: number;
    riskFactors: string[];
    warnings: string[];
  }> {
    return [...this.approvalLog];
  }

  /**
   * Clear approval log
   */
  public clearApprovalLog(): void {
    this.approvalLog = [];
  }

  /**
   * Get approval log entries for a specific tool
   */
  public getApprovalLogForTool(toolName: string): Array<{
    timestamp: Date;
    toolName: string;
    parameters: any;
    context: {
      agentId: string;
      sessionId: string;
      userId: string;
      securityLevel: SecurityLevel;
    };
    decision: 'approved' | 'denied';
    riskScore: number;
    riskFactors: string[];
    warnings: string[];
  }> {
    return this.approvalLog.filter(entry => entry.toolName === toolName);
  }

  /**
   * Get security statistics
   */
  public getSecurityStats(): {
    totalApprovalRequests: number;
    approvedRequests: number;
    deniedRequests: number;
    averageRiskScore: number;
    highRiskExecutions: number;
    sessionApprovalsActive: number;
  } {
    const totalRequests = this.approvalLog.length;
    const approved = this.approvalLog.filter(entry => entry.decision === 'approved').length;
    const denied = this.approvalLog.filter(entry => entry.decision === 'denied').length;
    const averageRisk = totalRequests > 0 
      ? this.approvalLog.reduce((sum, entry) => sum + entry.riskScore, 0) / totalRequests 
      : 0;
    const highRisk = this.approvalLog.filter(entry => entry.riskScore >= 70).length;
    const activeApprovals = Array.from(this.sessionApprovals.values())
      .reduce((total, set) => total + set.size, 0);

    return {
      totalApprovalRequests: totalRequests,
      approvedRequests: approved,
      deniedRequests: denied,
      averageRiskScore: Math.round(averageRisk * 100) / 100,
      highRiskExecutions: highRisk,
      sessionApprovalsActive: activeApprovals
    };
  }

  /**
   * Export audit data for compliance reporting
   */
  public exportAuditData(): {
    executionLog: AuditLogEntry[];
    approvalLog: Array<{
      timestamp: Date;
      toolName: string;
      parameters: any;
      context: {
        agentId: string;
        sessionId: string;
        userId: string;
        securityLevel: SecurityLevel;
      };
      decision: 'approved' | 'denied';
      riskScore: number;
      riskFactors: string[];
      warnings: string[];
    }>;
    statistics: {
      totalExecutions: number;
      successfulExecutions: number;
      failedExecutions: number;
      totalApprovalRequests: number;
      approvedRequests: number;
      deniedRequests: number;
      averageRiskScore: number;
    };
    exportTimestamp: Date;
  } {
    return {
      executionLog: this.getAuditLog(),
      approvalLog: this.getApprovalLog(),
      statistics: {
        ...this.getExecutionStats(),
        ...this.getSecurityStats()
      },
      exportTimestamp: new Date()
    };
  }

  /**
   * Request user approval for tool execution with enhanced security information
   */
  private async requestUserApproval(
    tool: ToolDefinition,
    parameters: any,
    context: ExecutionContext
  ): Promise<boolean> {
    // Perform risk assessment
    const riskAssessment = this.assessToolRisk(tool, parameters, context);
    
    // Create detailed approval message
    const riskIndicator = this.getRiskIndicator(tool.security.riskLevel);
    const securityWarnings = riskAssessment.warnings.length > 0 
      ? `\n\n⚠️ Security Warnings:\n${riskAssessment.warnings.map(w => `• ${w}`).join('\n')}`
      : '';
    
    const message = `${riskIndicator} Tool Execution Request\n\n` +
      `Tool: ${tool.name}\n` +
      `Description: ${tool.description}\n` +
      `Risk Level: ${tool.security.riskLevel.toUpperCase()}\n` +
      `Category: ${tool.category || 'general'}\n\n` +
      `Parameters:\n${JSON.stringify(parameters, null, 2)}${securityWarnings}\n\n` +
      `Agent: ${context.agentId}\n` +
      `Session: ${context.sessionId}\n\n` +
      `Do you want to allow this tool execution?`;
    
    // Show different UI based on risk level
    let choice: string | undefined;
    
    if (tool.security.riskLevel === 'high') {
      // High risk tools require explicit confirmation
      choice = await vscode.window.showErrorMessage(
        message,
        { modal: true },
        'Allow (High Risk)',
        'Deny'
      );
      
      // Additional confirmation for high-risk tools
      if (choice === 'Allow (High Risk)') {
        const confirmChoice = await vscode.window.showWarningMessage(
          `⚠️ FINAL CONFIRMATION\n\nYou are about to allow a HIGH RISK tool execution. This could potentially:\n• Modify or delete files\n• Execute system commands\n• Access sensitive data\n• Make network requests\n\nAre you absolutely sure?`,
          { modal: true },
          'Yes, I understand the risks',
          'No, cancel'
        );
        choice = confirmChoice === 'Yes, I understand the risks' ? 'Allow' : 'Deny';
      }
    } else if (tool.security.riskLevel === 'medium') {
      choice = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        'Allow',
        'Deny',
        'Always Allow for this Session'
      );
    } else {
      choice = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        'Allow',
        'Deny',
        'Always Allow for this Session'
      );
    }
    
    // Handle session-level approval
    if (choice === 'Always Allow for this Session') {
      this.addSessionApproval(context.sessionId, tool.name);
      return true;
    }
    
    const approved = choice === 'Allow';
    
    // Log approval decision
    this.logApprovalDecision(tool, parameters, context, approved, riskAssessment);
    
    return approved;
  }

  /**
   * Assess the risk of executing a tool with given parameters
   */
  private assessToolRisk(
    tool: ToolDefinition,
    parameters: any,
    context: ExecutionContext
  ): { score: number; warnings: string[]; factors: string[] } {
    const warnings: string[] = [];
    const factors: string[] = [];
    let score = 0;

    // Base risk from tool definition
    switch (tool.security.riskLevel) {
      case 'high':
        score += 70;
        factors.push('High-risk tool category');
        break;
      case 'medium':
        score += 40;
        factors.push('Medium-risk tool category');
        break;
      case 'low':
        score += 10;
        factors.push('Low-risk tool category');
        break;
    }

    // Check for dangerous patterns in parameters
    const paramString = JSON.stringify(parameters).toLowerCase();
    const dangerousPatterns = [
      { pattern: /rm\s+-rf|del\s+\/[sq]|format\s+c:/i, warning: 'Destructive file operations detected', score: 30 },
      { pattern: /shutdown|reboot|halt/i, warning: 'System control commands detected', score: 25 },
      { pattern: /__import__|eval\(|exec\(/i, warning: 'Code execution patterns detected', score: 20 },
      { pattern: /\.\.\/|\.\.\\|\.\.\//g, warning: 'Directory traversal patterns detected', score: 15 },
      { pattern: /password|secret|token|key/i, warning: 'Sensitive data patterns detected', score: 10 },
      { pattern: /localhost|127\.0\.0\.1|192\.168\.|10\.|172\./i, warning: 'Local network access detected', score: 5 }
    ];

    for (const { pattern, warning, score: patternScore } of dangerousPatterns) {
      if (pattern.test(paramString)) {
        warnings.push(warning);
        factors.push(warning);
        score += patternScore;
      }
    }

    // Check file system operations
    if (parameters.path && typeof parameters.path === 'string') {
      if (parameters.path.startsWith('/') || parameters.path.includes('C:\\')) {
        warnings.push('Absolute file path detected - may access system files');
        factors.push('Absolute file path usage');
        score += 15;
      }
      
      const sensitiveFiles = [
        'package.json', 'package-lock.json', '.env', '.git', 'node_modules',
        'config', 'settings', 'credentials', 'secrets'
      ];
      
      if (sensitiveFiles.some(file => parameters.path.toLowerCase().includes(file))) {
        warnings.push('Access to sensitive files or directories detected');
        factors.push('Sensitive file access');
        score += 10;
      }
    }

    // Check web requests
    if (parameters.url && typeof parameters.url === 'string') {
      try {
        const url = new URL(parameters.url);
        if (url.protocol !== 'https:') {
          warnings.push('Non-HTTPS URL detected - data may be transmitted insecurely');
          factors.push('Insecure protocol usage');
          score += 10;
        }
        
        const suspiciousDomains = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co'];
        if (suspiciousDomains.some(domain => url.hostname.includes(domain))) {
          warnings.push('URL shortener detected - destination unknown');
          factors.push('URL shortener usage');
          score += 15;
        }
      } catch {
        warnings.push('Invalid URL format detected');
        factors.push('Invalid URL format');
        score += 5;
      }
    }

    // Check execution context
    if (context.security.level === SecurityLevel.RESTRICTED) {
      warnings.push('Executing in restricted security context');
      factors.push('Restricted security context');
      score += 10;
    }

    // Check permissions
    if (tool.security.permissions && tool.security.permissions.length > 0) {
      const highRiskPermissions = ['filesystem.write', 'system.execute', 'network.request'];
      const hasHighRiskPermissions = tool.security.permissions.some(p => 
        highRiskPermissions.includes(p)
      );
      
      if (hasHighRiskPermissions) {
        factors.push('Requires high-risk permissions');
        score += 10;
      }
    }

    return { score: Math.min(score, 100), warnings, factors };
  }

  /**
   * Get risk indicator emoji based on risk level
   */
  private getRiskIndicator(riskLevel: string): string {
    switch (riskLevel) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  }

  /**
   * Session-level approvals for "Always Allow" functionality
   */
  private sessionApprovals: Map<string, Set<string>> = new Map();

  /**
   * Add a session-level approval for a tool
   */
  private addSessionApproval(sessionId: string, toolName: string): void {
    if (!this.sessionApprovals.has(sessionId)) {
      this.sessionApprovals.set(sessionId, new Set());
    }
    this.sessionApprovals.get(sessionId)!.add(toolName);
  }

  /**
   * Check if a tool has session-level approval
   */
  private hasSessionApproval(sessionId: string, toolName: string): boolean {
    return this.sessionApprovals.get(sessionId)?.has(toolName) || false;
  }

  /**
   * Clear session approvals
   */
  public clearSessionApprovals(sessionId?: string): void {
    if (sessionId) {
      this.sessionApprovals.delete(sessionId);
    } else {
      this.sessionApprovals.clear();
    }
  }

  /**
   * Log approval decision for audit purposes
   */
  private logApprovalDecision(
    tool: ToolDefinition,
    parameters: any,
    context: ExecutionContext,
    approved: boolean,
    riskAssessment: { score: number; warnings: string[]; factors: string[] }
  ): void {
    const approvalEntry = {
      timestamp: new Date(),
      toolName: tool.name,
      parameters: JSON.parse(JSON.stringify(parameters)),
      context: {
        agentId: context.agentId,
        sessionId: context.sessionId,
        userId: context.user.id,
        securityLevel: context.security.level
      },
      decision: (approved ? 'approved' : 'denied') as 'approved' | 'denied',
      riskScore: riskAssessment.score,
      riskFactors: riskAssessment.factors,
      warnings: riskAssessment.warnings
    };

    // Store approval decisions separately from execution log
    this.approvalLog.push(approvalEntry);

    // Keep approval log size manageable
    if (this.approvalLog.length > this.MAX_AUDIT_ENTRIES) {
      this.approvalLog = this.approvalLog.slice(-this.MAX_AUDIT_ENTRIES);
    }
  }

  /**
   * Approval log for tracking user decisions
   */
  private approvalLog: Array<{
    timestamp: Date;
    toolName: string;
    parameters: any;
    context: {
      agentId: string;
      sessionId: string;
      userId: string;
      securityLevel: SecurityLevel;
    };
    decision: 'approved' | 'denied';
    riskScore: number;
    riskFactors: string[];
    warnings: string[];
  }> = [];

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

  /**
   * Log tool execution for audit purposes
   */
  private logExecution(
    toolName: string,
    parameters: any,
    context: ExecutionContext,
    result: 'success' | 'failure' | 'denied',
    error?: string,
    executionTime?: number
  ): void {
    const entry: AuditLogEntry = {
      timestamp: new Date(),
      toolName,
      parameters: JSON.parse(JSON.stringify(parameters)), // Deep copy to avoid mutations
      context: {
        ...context,
        // Don't log sensitive information
        user: { ...context.user }
      },
      result,
      error,
      executionTime: executionTime || 0
    };

    this.auditLog.push(entry);

    // Keep audit log size manageable
    if (this.auditLog.length > this.MAX_AUDIT_ENTRIES) {
      this.auditLog = this.auditLog.slice(-this.MAX_AUDIT_ENTRIES);
    }
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
   * Create git status tool definition
   */
  /**
   * Helper to convert git status to single character
   */
  private static getGitStatusChar(status: number): string {
    // These status values come from the vscode.git extension
    switch (status) {
      case 1: return 'M'; // Modified
      case 2: return 'A'; // Added
      case 3: return 'D'; // Deleted
      case 4: return 'R'; // Renamed
      case 5: return 'C'; // Copied
      case 6: return 'U'; // Updated but unmerged
      default: return '?';
    }
  }

  /**
   * Helper to get status text
   */
  private static getGitStatusText(status: number): string {
    switch (status) {
      case 1: return 'modified';
      case 2: return 'added';
      case 3: return 'deleted';
      case 4: return 'renamed';
      case 5: return 'copied';
      case 6: return 'unmerged';
      default: return 'unknown';
    }
  }

  /**
   * Create git status tool definition
   */
  private static createGitStatusToolDefinition(): ToolDefinition {
    return {
      name: 'git_status',
      description: 'Get the current git status of the workspace',
      category: 'git',
      parameters: {
        type: 'object',
        properties: {
          porcelain: {
            type: 'boolean',
            description: 'Use porcelain format for machine-readable output'
          }
        }
      },
      security: {
        requiresApproval: false,
        allowedInWeb: false,
        riskLevel: 'low',
        permissions: ['git.read']
      },
      executor: async (parameters: { porcelain?: boolean }, context: ExecutionContext): Promise<ToolResult> => {
        try {
          const workspaceUri = context.workspaceUri || vscode.workspace.workspaceFolders?.[0]?.uri;
          if (!workspaceUri) {
            return {
              success: false,
              error: 'No workspace available'
            };
          }

          // Use VS Code's built-in git extension
          const gitExtension = vscode.extensions.getExtension('vscode.git');
          if (!gitExtension) {
            return {
              success: false,
              error: 'Git extension not available'
            };
          }

          const git = gitExtension.exports.getAPI(1);
          const repository = git.getRepository(workspaceUri);
          
          if (!repository) {
            return {
              success: false,
              error: 'No git repository found in workspace'
            };
          }

          const status = repository.state.workingTreeChanges;
          const indexChanges = repository.state.indexChanges;
          const currentBranch = repository.state.HEAD?.name || 'detached HEAD';
          const ahead = repository.state.HEAD?.ahead || 0;
          const behind = repository.state.HEAD?.behind || 0;

          // Use porcelain format if requested
          if (parameters.porcelain) {
            const output: string[] = [];
            
            // Branch info
            output.push(`# branch.oid ${repository.state.HEAD?.commit || 'N/A'}`);
            output.push(`# branch.head ${currentBranch}`);
            output.push(`# branch.upstream ${repository.state.HEAD?.upstream?.name || 'N/A'}`);
            output.push(`# branch.ab +${ahead} -${behind}`);
            
            // Staged changes
            for (const change of indexChanges) {
              const status = this.getGitStatusChar(change.status);
              output.push(`${status} ${change.uri.fsPath}`);
            }
            
            // Unstaged changes
            for (const change of status) {
              const status = this.getGitStatusChar(change.status);
              output.push(` ${status} ${change.uri.fsPath}`);
            }
            
            return {
              success: true,
              data: output.join('\n'),
              metadata: { format: 'porcelain', repository: workspaceUri.fsPath }
            };
          }

          // Default detailed format
          return {
            success: true,
            data: {
              branch: currentBranch,
              ahead,
              behind,
              changes: status.map((change: { uri: { fsPath: string }; status: number }) => ({
                path: change.uri.fsPath,
                status: change.status,
                statusText: this.getGitStatusText(change.status)
              })),
              staged: indexChanges.map((change: { uri: { fsPath: string }; status: number }) => ({
                path: change.uri.fsPath,
                status: change.status,
                statusText: this.getGitStatusText(change.status)
              }))
            },
            metadata: { format: 'detailed', repository: workspaceUri.fsPath }
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to get git status: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      }
    };
  }

  /**
   * Create web request tool definition
   */
  private static createWebRequestToolDefinition(): ToolDefinition {
    return {
      name: 'web_request',
      description: 'Make HTTP requests to web APIs',
      category: 'web',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to make the request to'
          },
          method: {
            type: 'string',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            description: 'HTTP method to use'
          },
          headers: {
            type: 'object',
            description: 'HTTP headers to include'
          },
          body: {
            type: 'string',
            description: 'Request body (for POST, PUT, PATCH)'
          },
          timeout: {
            type: 'number',
            description: 'Request timeout in milliseconds',
            minimum: 1000,
            maximum: 30000
          }
        },
        required: ['url']
      },
      security: {
        requiresApproval: true,
        allowedInWeb: true,
        riskLevel: 'medium',
        permissions: ['web.request']
      },
      executor: async (parameters: { 
        url: string; 
        method?: string; 
        headers?: Record<string, string>; 
        body?: string; 
        timeout?: number 
      }, context: ExecutionContext): Promise<ToolResult> => {
        try {
          const method = parameters.method || 'GET';
          const timeout = parameters.timeout || 10000;
          
          // Basic URL validation
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(parameters.url);
          } catch {
            return {
              success: false,
              error: 'Invalid URL format'
            };
          }

          // Security check - block localhost and private IPs in production
          if (context.security.level !== SecurityLevel.ELEVATED) {
            const hostname = parsedUrl.hostname.toLowerCase();
            if (hostname === 'localhost' || 
                hostname === '127.0.0.1' || 
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') ||
                hostname.startsWith('172.')) {
              return {
                success: false,
                error: 'Access to local/private networks not allowed'
              };
            }
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          try {
            const response = await fetch(parameters.url, {
              method,
              headers: parameters.headers,
              body: method !== 'GET' ? parameters.body : undefined,
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            const responseText = await response.text();
            let responseData: any = responseText;

            // Try to parse as JSON
            try {
              responseData = JSON.parse(responseText);
            } catch {
              // Keep as text if not valid JSON
            }

            // Convert headers to object
            const headers: Record<string, string> = {};
            response.headers.forEach((value, key) => {
              headers[key] = value;
            });

            return {
              success: true,
              data: {
                status: response.status,
                statusText: response.statusText,
                headers,
                data: responseData
              },
              metadata: {
                url: parameters.url,
                method,
                responseSize: responseText.length
              }
            };
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return {
              success: false,
              error: 'Request timed out'
            };
          }
          
          return {
            success: false,
            error: `Web request failed: ${error instanceof Error ? error.message : String(error)}`
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
      executor: async (parameters: { message: string; type?: 'info' | 'warning' | 'error' }): Promise<ToolResult> => {
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
    
    // Register Git tools
    toolManager.registerTool(this.createGitStatusToolDefinition());
    
    // Register Web tools
    toolManager.registerTool(this.createWebRequestToolDefinition());
  }
}