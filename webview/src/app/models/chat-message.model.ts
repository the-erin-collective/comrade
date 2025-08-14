export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: {
    executionTime?: number;
    [key: string]: any;
  };
}

export type MessageType = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessageMetadata {
  model?: string;
  tokens?: number;
  [key: string]: any;
}

export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'assistant' | 'system' | 'tool';
  timestamp: number | Date;
  type?: MessageType;
  agentId?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  metadata?: ChatMessageMetadata;
  
  // Streaming related properties
  isStreaming?: boolean;
  isComplete?: boolean;
  error?: string;
  
  // For partial updates during streaming
  updateContent?(content: string): void;
  complete?(): void;
  fail?(error: string): void;
}

export interface ConversationSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number | Date;
  updatedAt: number | Date;
  metadata?: {
    model?: string;
    [key: string]: any;
  };
}

export interface Session extends Omit<ConversationSession, 'id' | 'messages'> {
  sessionId: string;
  messages: ChatMessage[];
  state?: 'active' | 'archived' | 'pinned';
  context?: {
    files?: string[];
    workspacePath?: string;
    [key: string]: any;
  };
}
