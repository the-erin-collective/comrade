/**
 * Model configuration interface for webview
 */
export interface ModelConfig {
  name: string;
  provider: 'ollama' | 'openai' | 'anthropic' | 'huggingface' | 'custom';
  model: string;
  endpoint?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  additionalParams?: Record<string, any>;
}

/**
 * Agent configuration interface
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