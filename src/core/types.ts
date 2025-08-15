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
/**
 * P
rovider and Agent Management Types
 * 
 * New provider-agent architecture types for improved configuration management
 */

/**
 * Base provider interface
 */
export interface Provider {
  id: string;
  name: string;
  type: 'cloud' | 'local-network';
  provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'ollama' | 'custom';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Cloud provider configuration
 */
export interface CloudProvider extends Provider {
  type: 'cloud';
  apiKey: string;
  endpoint?: never;
}

/**
 * Local network provider configuration
 */
export interface LocalNetworkProvider extends Provider {
  type: 'local-network';
  endpoint: string;
  localHostType: 'ollama' | 'custom';
  apiKey?: string;
}

/**
 * Union type for all provider variants
 */
export type ProviderConfig = CloudProvider | LocalNetworkProvider;

/**
 * Updated Agent interface that references providers
 */
export interface Agent {
  id: string;
  name: string;
  providerId: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  systemPrompt?: string;
  capabilities: AgentCapabilities;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Agent capabilities interface
 */
export interface AgentCapabilities {
  hasVision: boolean;
  hasToolUse: boolean;
  reasoningDepth: 'basic' | 'intermediate' | 'advanced';
  speed: 'fast' | 'medium' | 'slow';
  costTier: 'low' | 'medium' | 'high';
}

/**
 * Form data interfaces
 */
export interface ProviderFormData {
  name: string;
  type: 'cloud' | 'local-network';
  provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'ollama' | 'custom';
  endpoint?: string;
  apiKey?: string;
  localHostType?: 'ollama' | 'custom';
}

export interface AgentFormData {
  name: string;
  providerId: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  systemPrompt?: string;
  capabilities?: Partial<AgentCapabilities>;
}

/**
 * Validation result interfaces
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

export interface ProviderValidationResult extends ValidationResult {
  availableModels?: string[];
  connectionStatus?: 'connected' | 'disconnected' | 'unknown';
  responseTime?: number;
}

export interface AgentValidationResult extends ValidationResult {
  providerStatus?: 'active' | 'inactive' | 'not_found';
  modelAvailable?: boolean;
  estimatedCost?: 'low' | 'medium' | 'high';
}

/**
 * Combined types for display purposes
 */
export interface AgentWithProvider {
  agent: Agent;
  provider: ProviderConfig;
}

/**
 * Statistics interfaces
 */
export interface ProviderStats {
  totalProviders: number;
  activeProviders: number;
  providersByType: {
    cloud: number;
    'local-network': number;
  };
  providersByProvider: Record<string, number>;
}

export interface AgentStats {
  totalAgents: number;
  activeAgents: number;
  agentsByProvider: Record<string, number>;
  agentsByCapability: {
    vision: number;
    toolUse: number;
    streaming: number;
  };
}

/**
 * Migration and connection test interfaces
 */
export interface MigrationData {
  providersCreated: Provider[];
  agentsUpdated: Agent[];
  errors: string[];
  warnings: string[];
}

export interface ConnectionTestResult {
  success: boolean;
  responseTime?: number;
  error?: string;
  availableModels?: string[];
  serverInfo?: {
    version?: string;
    status?: string;
  };
}