import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export interface WebviewMessage {
  type: 'updateSession' | 'showProgress' | 'renderMarkdown' | 'updateConfig' | 'showError' | 'showCancellation' | 'hideProgress' | 'showTimeout' | 'restoreSessions' | 'ollamaModelsResult' | 'cloudModelsResult' | 'configUpdateResult' | 'configResult';
  payload: any;
}

export interface ExtensionMessage {
  type: 'sendMessage' | 'switchSession' | 'openConfig' | 'createSession' | 'closeSession' | 'addContext' | 'switchAgent' | 'cancelOperation' | 'retryOperation' | 'extendTimeout' | 'openConfiguration' | 'fetchOllamaModels' | 'fetchCloudModels' | 'updateConfig' | 'getConfig';
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
  private vscode: any;
  
  // Use RxJS Subject for proper event-driven messaging
  private messageSubject = new Subject<WebviewMessage>();
  public messages$: Observable<WebviewMessage> = this.messageSubject.asObservable();
  
  constructor() {
    console.log('MessageService constructor called');
    console.log('Window object:', typeof window);
    console.log('acquireVsCodeApi available:', typeof (window as any).acquireVsCodeApi);
    console.log('vscodeApi already available:', typeof (window as any).vscodeApi);
    
    // Check if VS Code API was already acquired globally by the inline script
    if ((window as any).vscodeApi) {
      this.vscode = (window as any).vscodeApi;
      console.log('MessageService: Using existing VS Code API instance:', this.vscode);
    } else {
      // Wait a bit for the inline script to execute and try again
      setTimeout(() => {
        if ((window as any).vscodeApi) {
          this.vscode = (window as any).vscodeApi;
          console.log('MessageService: Found VS Code API after delay:', this.vscode);
        } else {
          console.warn('MessageService: VS Code API not found, using mock');
        }
      }, 100);
      
      // Fallback for development/testing
      this.vscode = {
        postMessage: (message: any) => console.log('Mock postMessage:', message),
        getState: () => ({}),
        setState: (state: any) => console.log('Mock setState:', state)
      };
    }
    
    this.setupMessageListener();
    
    // Test message to verify webview is working
    setTimeout(() => {
      console.log('Testing webview communication...');
      this.sendMessage({
        type: 'openConfiguration',
        payload: { type: 'test', message: 'Webview loaded successfully' }
      });
    }, 1000);
  }
  
  private setupMessageListener() {
    console.log('MessageService: Setting up proper event listener');
    window.addEventListener('message', (event) => {
      const message: WebviewMessage = event.data;
      console.log('MessageService: Received message via event listener:', message.type);
      // Emit the message through the Subject for reactive handling
      this.messageSubject.next(message);
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

  public cancelOperation(sessionId: string, operationType?: string) {
    this.sendMessage({
      type: 'cancelOperation',
      payload: { sessionId, operationType }
    });
  }

  public retryOperation(sessionId: string, operationType?: string) {
    this.sendMessage({
      type: 'retryOperation',
      payload: { sessionId, operationType }
    });
  }

  public extendTimeout(sessionId: string, operationType?: string, duration?: number) {
    this.sendMessage({
      type: 'extendTimeout',
      payload: { sessionId, operationType, duration }
    });
  }

  public openConfiguration(type: string, sessionId?: string) {
    this.sendMessage({
      type: 'openConfiguration',
      payload: { type, sessionId }
    });
  }

  public fetchOllamaModels(networkAddress?: string) {
    this.sendMessage({
      type: 'fetchOllamaModels',
      payload: { networkAddress }
    });
  }

  public fetchCloudModels(provider: string, apiKey: string) {
    this.sendMessage({
      type: 'fetchCloudModels',
      payload: { provider, apiKey }
    });
  }

  public showHistory() {
    // This is a local UI action, so we'll use a different approach
    // We'll emit a custom event that the app component can listen to
    window.dispatchEvent(new CustomEvent('showHistory'));
  }

  public showSettings() {
    // Emit a custom event that the app component can listen to
    window.dispatchEvent(new CustomEvent('showSettings'));
  }
}