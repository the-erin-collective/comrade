export interface SessionTab {
  id: string;
  title: string;
  type: 'conversation' | 'configuration';
  isActive: boolean;
  lastActivity: Date;
  metadata: Record<string, any>;
}

export interface ConversationSession extends SessionTab {
  type: 'conversation';
  messages: ChatMessage[];
  currentPhase: 'context' | 'planning' | 'execution';
  agentConfig: AgentConfig;
}

export interface ConfigurationSession extends SessionTab {
  type: 'configuration';
  configurationType: ConfigurationType;
  formData: Record<string, any>;
  isDirty: boolean;
}

export interface ChatMessage {
  id: string;
  content: string;
  timestamp: string;
  sender: 'user' | 'agent';
  agentId?: string;
  metadata?: Record<string, any>;
}

export interface AgentConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  capabilities: AgentCapabilities;
}

export interface AgentCapabilities {
  hasVision: boolean;
  hasToolUse: boolean;
  reasoningDepth: 'basic' | 'intermediate' | 'advanced';
  speed: 'fast' | 'medium' | 'slow';
  costTier: 'low' | 'medium' | 'high';
}

export enum ConfigurationType {
  PERSONALITY = 'personality',
  MODEL_SETUP = 'model_setup',
  API_CONNECTIONS = 'api_connections',
  MCP_SERVERS = 'mcp_servers'
}

export interface SessionState {
  sessions: Map<string, SessionTab>;
  activeSessionId: string | null;
  sessionHistory: string[];
}

export interface PhaseAlert {
  message: string;
  actionButton: {
    text: string;
    action: () => void;
  };
  type: 'info' | 'warning' | 'success';
}

export interface ContextItem {
  type: 'file' | 'selection' | 'image' | 'workspace';
  content: string;
  metadata: Record<string, any>;
}