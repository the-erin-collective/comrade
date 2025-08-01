/**
 * Tool Definition Framework for Comrade VS Code Extension
 * 
 * This module provides the foundation for AI agents to execute tools and functions
 * with proper security validation and parameter checking.
 */

import * as vscode from 'vscode';

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

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
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