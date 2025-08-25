/**
 * Provider and Agent Management Interfaces
 * 
 * This file defines the new provider-agent architecture where providers handle
 * connection details and credentials, while agents are configured to use specific providers.
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
 * Cloud providers use internal endpoints and require API keys
 */
export interface CloudProvider extends Provider {
  type: 'cloud';
  apiKey: string;
  endpoint?: never; // Cloud providers use internal endpoints
}

/**
 * Local network provider configuration
 * Local network providers require endpoints and may have optional API keys
 */
export interface LocalNetworkProvider extends Provider {
  type: 'local-network';
  endpoint: string;
  localHostType: 'ollama' | 'custom';
  apiKey?: string; // Optional for local providers
}

/**
 * Union type for all provider variants
 */
export type ProviderConfig = CloudProvider | LocalNetworkProvider;

/**
 * User preferences for agent behavior
 */
export interface AgentUserPreferences {
  useStreaming: boolean; // User's choice for streaming (only applicable if both modes supported)
  // Future user preferences can be added here
}

/**
 * Updated Agent interface that references providers instead of direct configuration
 */
export interface Agent {
  id: string;
  name: string;
  providerId: string; // Reference to provider instead of direct config
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  systemPrompt?: string;
  capabilities: AgentCapabilities;
  userPreferences: AgentUserPreferences;
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
  // Streaming capabilities
  supportsStreaming: boolean;
  supportsNonStreaming: boolean;
  preferredStreamingMode: 'streaming' | 'non-streaming';
  maxContextLength: number;
  supportedFormats: string[];
}

/**
 * Form data interface for provider creation/editing
 */
export interface ProviderFormData {
  name?: string; // Optional - will be auto-generated if not provided
  type: 'cloud' | 'local-network';
  provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'ollama' | 'custom';
  endpoint?: string;
  apiKey?: string;
  localHostType?: 'ollama' | 'custom';
}

/**
 * Form data interface for agent creation/editing
 */
export interface AgentFormData {
  name: string;
  providerId: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  systemPrompt?: string;
  capabilities?: Partial<AgentCapabilities>;
  userPreferences?: Partial<AgentUserPreferences>;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Provider validation result with additional provider-specific information
 */
export interface ProviderValidationResult extends ValidationResult {
  availableModels?: string[];
  connectionStatus?: 'connected' | 'disconnected' | 'unknown';
  responseTime?: number;
}

/**
 * Agent test result with comprehensive capability detection
 */
export interface AgentTestResult {
  success: boolean;
  responseTime: number;
  error?: string;
  capabilities: {
    supportsStreaming: boolean;
    supportsNonStreaming: boolean;
    preferredStreamingMode: 'streaming' | 'non-streaming';
    hasVision: boolean;
    hasToolUse: boolean;
    maxContextLength: number;
    supportedFormats: string[];
  };
  testDetails: {
    streamingTest: {
      attempted: boolean;
      successful: boolean;
      responseTime?: number;
      error?: string;
    };
    nonStreamingTest: {
      attempted: boolean;
      successful: boolean;
      responseTime?: number;
      error?: string;
    };
  };
}

/**
 * Agent validation result with provider dependency information
 */
export interface AgentValidationResult extends ValidationResult {
  providerStatus?: 'active' | 'inactive' | 'not_found';
  modelAvailable?: boolean;
  estimatedCost?: 'low' | 'medium' | 'high';
  testResult?: AgentTestResult;
}

/**
 * Combined agent with provider information for display purposes
 */
export interface AgentWithProvider {
  agent: Agent;
  provider: ProviderConfig;
}

/**
 * Provider statistics interface
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

/**
 * Agent statistics interface
 */
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
 * Provider connection test result
 */
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