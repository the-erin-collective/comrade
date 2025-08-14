import { ChatMessage } from './chat-message.model';

export interface ConversationSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    model?: string;
    [key: string]: any;
  };
}
