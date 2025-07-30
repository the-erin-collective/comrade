/**
 * Chat communication interfaces for LLM interactions
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  timeout?: number;
  tools?: ChatTool[];
}

export interface ChatTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ChatResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: ChatToolCall[];
  metadata?: Record<string, any>;
}

export interface ChatToolCall {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export type StreamCallback = (chunk: string, isComplete: boolean) => void;

export interface IChatBridge {
  sendMessage(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamMessage(messages: ChatMessage[], callback: StreamCallback, options?: ChatOptions): Promise<void>;
  validateConnection(): Promise<boolean>;
}