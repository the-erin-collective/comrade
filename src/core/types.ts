/**
 * Shared types for the core extension
 */

// Core validation result interface
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Agent capabilities interface
export interface AgentCapabilities {
  hasVision: boolean;
  hasToolUse: boolean;
  reasoningDepth: 'basic' | 'intermediate' | 'advanced';
  speed: 'fast' | 'medium' | 'slow';
  costTier: 'low' | 'medium' | 'high';
  supportsStreaming: boolean;
  supportsNonStreaming: boolean;
  preferredStreamingMode: 'streaming' | 'non-streaming';
  maxContextLength: number;
  supportedFormats: string[];
}

// Agent user preferences interface
export interface AgentUserPreferences {
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  notifications?: boolean;
  autoSave?: boolean;
}

// Agent interface
export interface Agent {
  id: string;
  name: string;
  providerId: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  systemPrompt: string;
  capabilities: AgentCapabilities;
  userPreferences: AgentUserPreferences;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Re-export model adapter types
export type {
  ModelConfig,
  ModelCapabilities,
  ChatMessage,
  Tool,
  ToolParameter,
  ToolResult,
  ToolCall,
  AIResponse,
  ResponseMetadata,
  ModelAdapter,
  StreamCallback
} from './model-adapters/base-model-adapter';

// Provider interfaces
export interface Provider {
  id: string;
  name: string;
  type: 'cloud' | 'local_network';
  provider: string; // The actual provider type like 'openai', 'anthropic', 'ollama'
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CloudProvider extends Provider {
  type: 'cloud';
  provider: 'openai' | 'anthropic' | 'claude' | string;
  apiKey: string;
  baseUrl?: string;
  region?: string;
}

export interface LocalNetworkProvider extends Provider {
  type: 'local_network';
  provider: 'ollama' | string;
  endpoint: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  apiKey?: string;
  localHostType?: string;
}

export type ProviderConfig = CloudProvider | LocalNetworkProvider;

// Form data interfaces
export interface ProviderFormData {
  name: string;
  type: 'cloud' | 'local_network';
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  region?: string;
  endpoint?: string;
  host?: string;
  port?: number;
  protocol?: 'http' | 'https';
  localHostType?: string;
}

export interface AgentFormData {
  name: string;
  providerId: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  systemPrompt: string;
  capabilities?: AgentCapabilities;
}

// Validation result interfaces
export interface ProviderValidationResult extends ValidationResult {
  provider?: ProviderConfig;
  warnings?: string[];
  connectionStatus?: 'connected' | 'disconnected' | 'unknown';
  responseTime?: number;
  availableModels?: string[];
}

export interface AgentValidationResult extends ValidationResult {
  agent?: Agent;
  warnings?: string[];
  providerStatus?: 'active' | 'inactive' | 'not_found';
}

export interface AgentTestResult {
  success: boolean;
  response?: string;
  error?: string;
  executionTime: number;
}

export interface AgentWithProvider {
  agent: Agent;
  provider: ProviderConfig;
}

export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  latency?: number;
  responseTime?: number;
  availableModels?: string[];
  serverInfo?: any;
}

// Base tool interface for tool implementations
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: any[];
  abstract execute(parameters: Record<string, any>): Promise<any>;

  validateParameters(parameters: Record<string, any>): ValidationResult {
    // Basic validation implementation
    const missing = this.parameters
      .filter(p => p.required && !(p.name in parameters))
      .map(p => p.name);
    
    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required parameters: ${missing.join(', ')}`
      };
    }
    
    return { valid: true };
  }
}

// AI Tool Result interface (extends base ToolResult)
export interface AIToolResult {
  success: boolean;
  output?: string;
  error?: string;
  toolName: string;
  parameters: Record<string, any>;
  metadata: {
    executionTime: number;
    toolName: string;
    parameters: Record<string, any>;
    timestamp: Date;
    stderr?: string;
    exitCode?: number;
    [key: string]: any;
  };
}