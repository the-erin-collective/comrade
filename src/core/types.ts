/**
 * Core type definitions for the AI agent system
 */

// Re-export types from ai-agent.ts for convenience
export { 
  AIResponse, 
  ResponseMetadata, 
  ToolCall, 
  AIToolResult,
  ToolExecutionMetadata,
  AIMessage,
  ConversationContext,
  ModelConfig 
} from './ai-agent';

// Re-export types from conversation-context.ts for convenience
export {
  ConversationContextManager,
  ConversationContextConfig,
  SerializableConversationContext,
  TruncationStrategy,
  createConversationContext,
  createCodingConversationContext
} from './conversation-context';

// Import for alias
import { AIToolResult } from './ai-agent';

// Create alias for consistency
export type ToolResult = AIToolResult;

/**
 * Represents a parameter for a tool
 */
export interface ToolParameter {
  /** Name of the parameter */
  name: string;
  /** Type of the parameter */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Description of the parameter */
  description: string;
  /** Whether the parameter is required */
  required: boolean;
  /** Allowed values for the parameter (for enum-like parameters) */
  enum?: any[];
  /** Default value for the parameter */
  default?: any;
}

/**
 * Represents a tool that can be executed by the AI agent
 */
export interface Tool {
  /** Unique name of the tool */
  name: string;
  /** Description of what the tool does */
  description: string;
  /** Parameters that the tool accepts */
  parameters: ToolParameter[];
  /** Function to execute the tool */
  execute(parameters: Record<string, any>): Promise<ToolResult>;
}

/**
 * Base class for implementing tools
 */
export abstract class BaseTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolParameter[];
  
  abstract execute(parameters: Record<string, any>): Promise<ToolResult>;
  
  /**
   * Validate parameters against the tool's schema
   */
  protected validateParameters(parameters: Record<string, any>): { valid: boolean; error?: string } {
    for (const param of this.parameters) {
      const value = parameters[param.name];
      
      // Check required parameters
      if (param.required && (value === undefined || value === null)) {
        return {
          valid: false,
          error: `Required parameter '${param.name}' is missing`
        };
      }
      
      // Skip validation for optional parameters that are not provided
      if (value === undefined || value === null) {
        continue;
      }
      
      // Type validation
      if (!this.validateParameterType(value, param.type)) {
        return {
          valid: false,
          error: `Parameter '${param.name}' must be of type ${param.type}, got ${typeof value}`
        };
      }
      
      // Enum validation
      if (param.enum && !param.enum.includes(value)) {
        return {
          valid: false,
          error: `Parameter '${param.name}' must be one of: ${param.enum.join(', ')}`
        };
      }
    }
    
    return { valid: true };
  }
  
  /**
   * Validate parameter type
   */
  private validateParameterType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true; // Unknown types pass validation
    }
  }
}