/**
 * Model configuration interface for webview
 */
export interface ModelConfig {
  name: string;
  provider: 'ollama' | 'openai' | 'anthropic' | 'google' | 'azure' | 'huggingface' | 'custom';
  model: string;
  endpoint?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  additionalParams?: Record<string, any>;
}

/**
 * Legacy Agent configuration interface
 * @deprecated Use Agent interface from provider-agent.interface.ts instead
 * This interface is maintained for backward compatibility during migration
 */
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  modelConfig: ModelConfig;
  systemPrompt?: string;
  capabilities?: {
    hasVision?: boolean;
    supportsToolCalling?: boolean;
    supportsStreaming?: boolean;
  };
}

/**
 * Extended agent configuration that supports both legacy and new provider-based configuration
 * This allows for gradual migration from direct model config to provider references
 */
export interface ExtendedAgentConfig extends AgentConfig {
  // New provider-based fields (optional during migration)
  providerId?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}