/**
 * Tool Definition Framework for Comrade VS Code Extension
 * 
 * This module provides the foundation for AI agents to execute tools and functions
 * with proper security validation and parameter checking.
 */

import * as vscode from 'vscode';
import { ChatToolCall } from './chat';

/**
 * JSON Schema definition for tool parameters
 */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

/**
 * Security configuration for tools
 */
export interface ToolSecurity {
  requiresApproval: boolean;
  allowedInWeb: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  permissions?: string[];
}

/**
 * Execution context for tool calls
 */
export interface ExecutionContext {
  agentId: string;
  sessionId: string;
  workspaceUri?: vscode.Uri;
  user: {
    id: string;
    permissions: string[];
  };
  security: {
    level: SecurityLevel;
    allowDangerous: boolean;
  };
}

export enum SecurityLevel {
  RESTRICTED = 'restricted',
  NORMAL = 'normal',
  ELEVATED = 'elevated'
}

/**
 * Result of tool execution
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Validation result for parameters
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Tool executor function type
 */
export type ToolExecutor = (parameters: any, context: ExecutionContext) => Promise<ToolResult>;

/**
 * Complete tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  security: ToolSecurity;
  executor: ToolExecutor;
  category?: string;
  version?: string;
  examples?: Array<{
    description: string;
    parameters: any;
    expectedResult?: any;
  }>;
}

/**
 * Tool registry for managing available tools
 */
export class ToolRegistry {
  private static _instance: ToolRegistry | null = null;
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Get singleton instance
   */
  public static getInstance(): ToolRegistry {
    if (!ToolRegistry._instance) {
      ToolRegistry._instance = new ToolRegistry();
    }
    return ToolRegistry._instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    ToolRegistry._instance = null;
  }

  /**
   * Register a new tool
   */
  public registerTool(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }

    // Validate tool definition
    this.validateToolDefinition(tool);
    
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool
   */
  public unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a tool by name
   */
  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all available tools
   */
  public getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools available for specific capabilities
   */
  public getAvailableTools(context: ExecutionContext): ToolDefinition[] {
    return this.getAllTools().filter(tool => {
      // Check security level
      if (tool.security.riskLevel === 'high' && context.security.level !== SecurityLevel.ELEVATED) {
        return false;
      }

      // Check web environment restrictions
      if (typeof (global as any).window !== 'undefined' && !tool.security.allowedInWeb) {
        return false;
      }

      // Check permissions
      if (tool.security.permissions) {
        const hasAllPermissions = tool.security.permissions.every(permission => 
          context.user.permissions.includes(permission)
        );
        if (!hasAllPermissions) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get tools by category
   */
  public getToolsByCategory(category: string): ToolDefinition[] {
    return this.getAllTools().filter(tool => tool.category === category);
  }

  /**
   * Validate a tool call from AI agent
   */
  public validateToolCall(call: ChatToolCall): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if tool exists
    const tool = this.getTool(call.name);
    if (!tool) {
      errors.push(`Tool '${call.name}' not found`);
      return { valid: false, errors, warnings };
    }

    // Validate call structure
    if (!call.id || typeof call.id !== 'string') {
      errors.push('Tool call must have a valid id');
    }

    if (!call.parameters || typeof call.parameters !== 'object') {
      errors.push('Tool call must have parameters object');
      return { valid: false, errors, warnings };
    }

    // Validate parameters using the tool's schema
    const paramValidation = ParameterValidator.validate(call.parameters, tool.parameters);
    if (!paramValidation.valid) {
      errors.push(...paramValidation.errors);
    }
    if (paramValidation.warnings) {
      warnings.push(...paramValidation.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate tool definition
   */
  private validateToolDefinition(tool: ToolDefinition): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool name is required and must be a string');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new Error('Tool description is required and must be a string');
    }

    if (!tool.parameters || typeof tool.parameters !== 'object') {
      throw new Error('Tool parameters schema is required');
    }

    if (!tool.security || typeof tool.security !== 'object') {
      throw new Error('Tool security configuration is required');
    }

    if (typeof tool.executor !== 'function') {
      throw new Error('Tool executor must be a function');
    }

    // Validate security configuration
    const validRiskLevels = ['low', 'medium', 'high'];
    if (!validRiskLevels.includes(tool.security.riskLevel)) {
      throw new Error(`Invalid risk level: ${tool.security.riskLevel}`);
    }
  }
}

/**
 * Parameter validator using JSON Schema
 */
export class ParameterValidator {
  /**
   * Validate parameters against JSON schema
   */
  public static validate(parameters: any, schema: JSONSchema): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.validateValue(parameters, schema, '', errors, warnings);
    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private static validateValue(
    value: any, 
    schema: JSONSchema, 
    path: string, 
    errors: string[], 
    warnings: string[]
  ): void {
    // Type validation
    if (!this.validateType(value, schema.type)) {
      errors.push(`${path}: Expected ${schema.type}, got ${typeof value}`);
      return;
    }

    // Object validation
    if (schema.type === 'object' && schema.properties) {
      if (typeof value !== 'object' || value === null) {
        errors.push(`${path}: Expected object`);
        return;
      }

      // Check required properties
      if (schema.required) {
        for (const required of schema.required) {
          if (!(required in value)) {
            errors.push(`${path}: Missing required property '${required}'`);
          }
        }
      }

      // Validate properties
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          this.validateValue(value[key], propSchema, `${path}.${key}`, errors, warnings);
        }
      }
    }

    // Array validation
    if (schema.type === 'array' && schema.items) {
      if (!Array.isArray(value)) {
        errors.push(`${path}: Expected array`);
        return;
      }

      value.forEach((item, index) => {
        this.validateValue(item, schema.items!, `${path}[${index}]`, errors, warnings);
      });
    }

    // String validation
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push(`${path}: String too short (minimum ${schema.minLength})`);
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push(`${path}: String too long (maximum ${schema.maxLength})`);
      }
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`${path}: Value must be one of: ${schema.enum.join(', ')}`);
      }
    }

    // Number validation
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push(`${path}: Number too small (minimum ${schema.minimum})`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push(`${path}: Number too large (maximum ${schema.maximum})`);
      }
    }
  }

  private static validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'null':
        return value === null;
      default:
        return false;
    }
  }
}

/**
 * Security validator for tool execution
 */
export class SecurityValidator {
  /**
   * Check if tool execution is allowed in current context
   */
  public static async validateExecution(
    tool: ToolDefinition, 
    parameters: any, 
    context: ExecutionContext
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check security level
    if (tool.security.riskLevel === 'high' && context.security.level !== SecurityLevel.ELEVATED) {
      errors.push('High-risk tool requires elevated security level');
    }

    // Check web environment
    if (typeof (global as any).window !== 'undefined' && !tool.security.allowedInWeb) {
      errors.push('Tool not allowed in web environment');
    }

    // Check permissions
    if (tool.security.permissions) {
      const missingPermissions = tool.security.permissions.filter(permission => 
        !context.user.permissions.includes(permission)
      );
      if (missingPermissions.length > 0) {
        errors.push(`Missing permissions: ${missingPermissions.join(', ')}`);
      }
    }

    // Check for dangerous parameters
    if (tool.security.riskLevel === 'high') {
      warnings.push('This tool performs potentially dangerous operations');
    }

    // Validate parameters for security issues
    this.validateParameterSecurity(parameters, tool.name, errors, warnings);

    // Additional security checks
    const securityAssessment = this.assessSecurityRisk(tool, parameters, context);
    warnings.push(...securityAssessment.warnings);
    
    if (securityAssessment.blockExecution) {
      errors.push('Execution blocked due to security policy violations');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Assess comprehensive security risk
   */
  public static assessSecurityRisk(
    tool: ToolDefinition,
    parameters: any,
    context: ExecutionContext
  ): {
    riskScore: number;
    warnings: string[];
    blockExecution: boolean;
    riskFactors: string[];
  } {
    const warnings: string[] = [];
    const riskFactors: string[] = [];
    let riskScore = 0;
    let blockExecution = false;

    // Base risk from tool definition
    switch (tool.security.riskLevel) {
      case 'high':
        riskScore += 70;
        riskFactors.push('High-risk tool category');
        break;
      case 'medium':
        riskScore += 40;
        riskFactors.push('Medium-risk tool category');
        break;
      case 'low':
        riskScore += 10;
        riskFactors.push('Low-risk tool category');
        break;
    }

    // Security context assessment
    if (context.security.level === SecurityLevel.RESTRICTED) {
      riskScore += 20;
      riskFactors.push('Restricted security context');
      
      if (tool.security.riskLevel === 'high') {
        blockExecution = true;
        warnings.push('High-risk tools are blocked in restricted mode');
      }
    }

    // Parameter-based risk assessment
    const paramRisk = this.assessParameterRisk(parameters);
    riskScore += paramRisk.score;
    warnings.push(...paramRisk.warnings);
    riskFactors.push(...paramRisk.factors);

    // Environment-based risk
    if (typeof (global as any).window !== 'undefined') {
      // Web environment - additional restrictions
      if (tool.category === 'filesystem' && parameters.path) {
        warnings.push('File system access in web environment may be limited');
        riskScore += 10;
        riskFactors.push('Web environment file access');
      }
    }

    // Permission-based risk
    if (tool.security.permissions) {
      const highRiskPermissions = [
        'filesystem.write', 'system.execute', 'network.request', 
        'vscode.commands', 'git.write'
      ];
      
      const hasHighRiskPerms = tool.security.permissions.some(p => 
        highRiskPermissions.includes(p)
      );
      
      if (hasHighRiskPerms) {
        riskScore += 15;
        riskFactors.push('High-risk permissions required');
      }
    }

    // Time-based risk (rapid successive executions)
    const rapidExecution = this.checkRapidExecution(context.sessionId, tool.name);
    if (rapidExecution) {
      riskScore += 10;
      riskFactors.push('Rapid successive executions detected');
      warnings.push('Multiple rapid executions of this tool detected');
    }

    return {
      riskScore: Math.min(riskScore, 100),
      warnings,
      blockExecution,
      riskFactors
    };
  }

  /**
   * Assess risk from parameters
   */
  private static assessParameterRisk(parameters: any): {
    score: number;
    warnings: string[];
    factors: string[];
  } {
    const warnings: string[] = [];
    const factors: string[] = [];
    let score = 0;

    if (typeof parameters !== 'object' || parameters === null) {
      return { score, warnings, factors };
    }

    const paramString = JSON.stringify(parameters).toLowerCase();

    // Dangerous command patterns
    const dangerousPatterns = [
      { pattern: /rm\s+-rf|del\s+\/[sq]|format\s+c:/i, warning: 'Destructive file operations', score: 30 },
      { pattern: /shutdown|reboot|halt/i, warning: 'System control commands', score: 25 },
      { pattern: /__import__|eval\(|exec\(/i, warning: 'Code execution patterns', score: 20 },
      { pattern: /\.\.\/|\.\.\\|\.\.\//g, warning: 'Directory traversal patterns', score: 15 },
      { pattern: /password|secret|token|key|credential/i, warning: 'Sensitive data patterns', score: 10 }
    ];

    for (const { pattern, warning, score: patternScore } of dangerousPatterns) {
      if (pattern.test(paramString)) {
        warnings.push(warning);
        factors.push(warning);
        score += patternScore;
      }
    }

    // File path analysis
    if (parameters.path && typeof parameters.path === 'string') {
      if (parameters.path.startsWith('/') || /^[a-zA-Z]:\\/.test(parameters.path)) {
        warnings.push('Absolute file path detected');
        factors.push('Absolute file path usage');
        score += 15;
      }

      const sensitiveFiles = [
        'package.json', '.env', '.git', 'node_modules', 'config',
        'settings', 'credentials', 'secrets', 'keys'
      ];

      if (sensitiveFiles.some(file => parameters.path.toLowerCase().includes(file))) {
        warnings.push('Access to sensitive files detected');
        factors.push('Sensitive file access');
        score += 10;
      }
    }

    // URL analysis
    if (parameters.url && typeof parameters.url === 'string') {
      try {
        const url = new URL(parameters.url);
        
        if (url.protocol !== 'https:') {
          warnings.push('Non-HTTPS URL detected');
          factors.push('Insecure protocol');
          score += 10;
        }

        // Check for suspicious domains
        const suspiciousDomains = [
          'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'short.link'
        ];
        
        if (suspiciousDomains.some(domain => url.hostname.includes(domain))) {
          warnings.push('URL shortener detected');
          factors.push('URL shortener usage');
          score += 15;
        }

        // Check for local/private network access
        const hostname = url.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
            hostname.startsWith('172.')) {
          warnings.push('Local/private network access detected');
          factors.push('Local network access');
          score += 5;
        }
      } catch {
        warnings.push('Invalid URL format');
        factors.push('Invalid URL format');
        score += 5;
      }
    }

    return { score, warnings, factors };
  }

  /**
   * Track execution frequency to detect rapid successive calls
   */
  private static executionHistory: Map<string, Date[]> = new Map();

  /**
   * Check for rapid successive executions
   */
  private static checkRapidExecution(sessionId: string, toolName: string): boolean {
    const key = `${sessionId}:${toolName}`;
    const now = new Date();
    const history = this.executionHistory.get(key) || [];
    
    // Clean old entries (older than 1 minute)
    const recentHistory = history.filter(date => 
      now.getTime() - date.getTime() < 60000
    );
    
    // Add current execution
    recentHistory.push(now);
    this.executionHistory.set(key, recentHistory);
    
    // Check if more than 5 executions in the last minute
    return recentHistory.length > 5;
  }

  /**
   * Clear execution history (for testing)
   */
  public static clearExecutionHistory(): void {
    this.executionHistory.clear();
  }

  private static validateParameterSecurity(
    parameters: any, 
    toolName: string, 
    errors: string[], 
    warnings: string[]
  ): void {
    if (typeof parameters === 'object' && parameters !== null) {
      // Check for potentially dangerous patterns
      const dangerousPatterns = [
        /rm\s+-rf/i,
        /del\s+\/[sq]/i,
        /format\s+c:/i,
        /shutdown/i,
        /reboot/i,
        /__import__/i,
        /eval\(/i,
        /exec\(/i
      ];

      const paramString = JSON.stringify(parameters);
      for (const pattern of dangerousPatterns) {
        if (pattern.test(paramString)) {
          warnings.push(`Potentially dangerous pattern detected in parameters for ${toolName}`);
          break;
        }
      }

      // Check for file system operations outside workspace
      if (parameters.path && typeof parameters.path === 'string') {
        if (parameters.path.includes('..') || parameters.path.startsWith('/')) {
          warnings.push('File path may access files outside workspace');
        }
      }
    }
  }
}