import { Injectable, signal } from '@angular/core';

export interface WebviewMessage {
  type: 'updateSession' | 'showProgress' | 'renderMarkdown' | 'updateConfig' | 'showError';
  payload: any;
}

export interface ExtensionMessage {
  type: 'sendMessage' | 'switchSession' | 'openConfig' | 'createSession' | 'closeSession' | 'addContext' | 'switchAgent';
  payload: any;
}

declare const acquireVsCodeApi: () => {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private vscode = acquireVsCodeApi();
  
  // Signals for reactive state management
  public messageReceived = signal<WebviewMessage | null>(null);
  
  constructor() {
    this.setupMessageListener();
  }
  
  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      const message: WebviewMessage = event.data;
      this.messageReceived.set(message);
    });
  }
  
  public sendMessage(message: ExtensionMessage) {
    this.vscode.postMessage(message);
  }
  
  public sendChatMessage(sessionId: string, message: string, contextItems: any[] = []) {
    this.sendMessage({
      type: 'sendMessage',
      payload: { sessionId, message, contextItems }
    });
  }
  
  public switchSession(sessionId: string) {
    this.sendMessage({
      type: 'switchSession',
      payload: { sessionId }
    });
  }
  
  public createSession(type: 'conversation' | 'configuration' = 'conversation') {
    this.sendMessage({
      type: 'createSession',
      payload: { type }
    });
  }
  
  public closeSession(sessionId: string) {
    this.sendMessage({
      type: 'closeSession',
      payload: { sessionId }
    });
  }
  
  public openConfig(type: string) {
    this.sendMessage({
      type: 'openConfig',
      payload: { type }
    });
  }
  
  public addContext(type: string, content?: string) {
    this.sendMessage({
      type: 'addContext',
      payload: { type, content }
    });
  }
  
  public switchAgent(sessionId: string, agentId: string, phase?: string) {
    this.sendMessage({
      type: 'switchAgent',
      payload: { sessionId, agentId, phase }
    });
  }
}