import { Injectable } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { filter, take } from 'rxjs/operators';

export interface WebviewMessage {
  type: 'updateSession' | 'showProgress' | 'renderMarkdown' | 'updateConfig' | 'showError' | 'showCancellation' | 'hideProgress' | 'showTimeout' | 'restoreSessions' | 'ollamaModelsResult' | 'cloudModelsResult' | 'configUpdateResult' | 'configResult' | 'aiResponse' | 'toolExecution' | 'aiTyping' | 'aiProcessing' | 'streamChunk' | 'providerValidationResult' | 'connectionTestResult' | 'agentConfigResult' | 'agentUpdateResult' | 'agentValidationResult' | 'agentAvailabilityResult' | 'agentTestResult';
  payload: any;
}

export interface ExtensionMessage {
  type: 'sendMessage' | 'switchSession' | 'openConfig' | 'createSession' | 'closeSession' | 'addContext' | 'switchAgent' | 'cancelOperation' | 'retryOperation' | 'extendTimeout' | 'openConfiguration' | 'fetchOllamaModels' | 'fetchCloudModels' | 'updateConfig' | 'getConfig' | 'cancelMessage' | 'validateProvider' | 'testProviderConnection' | 'validateAgent' | 'checkAgentAvailability' | 'fetchModelsForProvider' | 'testAgent';
  payload: any;
}

export interface NotificationMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  timestamp: Date;
  dismissible: boolean;
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
  
  // Notification system
  private notificationsSubject = new BehaviorSubject<NotificationMessage[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();
  
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
      
      // Handle streaming chunks
      if (message.type === 'streamChunk' && message.payload?.messageId) {
        const callback = this.streamingCallbacks.get(message.payload.messageId);
        if (callback) {
          // Call the streaming callback with the chunk
          callback({
            content: message.payload.content || '',
            isComplete: message.payload.done || false,
            error: message.payload.error
          });
          
          // If this is the final chunk, clean up the callback
          if (message.payload.done || message.payload.error) {
            this.streamingCallbacks.delete(message.payload.messageId);
          }
        }
        return; // Don't emit stream chunks through the main subject
      }
      
      // Emit the message through the Subject for reactive handling
      this.messageSubject.next(message);
    });
  }
  
  public sendMessage(message: ExtensionMessage) {
    this.vscode.postMessage(message);
  }
  
  private streamingCallbacks = new Map<string, (chunk: { content: string; isComplete: boolean; error?: string }) => void>();

  /**
   * Send a chat message with optional streaming support
   * @param sessionId The session ID
   * @param message The message to send
   * @param contextItems Optional context items
   * @param onChunk Optional callback for streaming chunks
   */
  public sendChatMessage(
    sessionId: string, 
    message: string, 
    contextItems: any[] = [],
    onChunk?: (chunk: { content: string; isComplete: boolean; error?: string }) => void
  ): string {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // If streaming is requested, register the callback
    if (onChunk) {
      this.streamingCallbacks.set(messageId, onChunk);
      
      // Set up a timeout to clean up the callback if no response is received
      setTimeout(() => {
        if (this.streamingCallbacks.has(messageId)) {
          this.streamingCallbacks.delete(messageId);
        }
      }, 300000); // 5 minute timeout
    }
    
    this.sendMessage({
      type: 'sendMessage',
      payload: { 
        sessionId, 
        message, 
        contextItems,
        messageId,
        stream: !!onChunk // Indicate to the extension that we want to stream
      }
    });
    
    return messageId;
  }
  
  /**
   * Cancel an ongoing streaming message
   * @param messageId The ID of the message to cancel
   */
  public cancelStreamingMessage(messageId: string): void {
    this.sendMessage({
      type: 'cancelMessage',
      payload: { messageId }
    });
    
    // Clean up the callback
    this.streamingCallbacks.delete(messageId);
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

  /**
   * Check if there are any active agents available for messaging
   * @returns Promise that resolves with availability status
   */
  public checkAgentAvailability(): Promise<{ hasActiveAgents: boolean; activeAgentCount: number; error?: string }> {
    return new Promise((resolve) => {
      // Set up a one-time message listener for the availability result
      const subscription = this.messages$.pipe(
        filter(message => message.type === 'agentAvailabilityResult'),
        take(1)
      ).subscribe(message => {
        resolve(message.payload);
      });

      // Send availability check request
      this.sendMessage({
        type: 'checkAgentAvailability',
        payload: {}
      });

      // Cleanup subscription after timeout
      setTimeout(() => {
        subscription.unsubscribe();
        resolve({
          hasActiveAgents: false,
          activeAgentCount: 0,
          error: 'Agent availability check timeout'
        });
      }, 5000); // 5 second timeout
    });
  }

  /**
   * Send a chat message with agent availability validation
   * @param sessionId The session ID
   * @param message The message to send
   * @param contextItems Optional context items
   * @param onChunk Optional callback for streaming chunks
   * @param validateAgents Whether to validate agent availability before sending (default: true)
   */
  public async sendChatMessageWithValidation(
    sessionId: string, 
    message: string, 
    contextItems: any[] = [],
    onChunk?: (chunk: { content: string; isComplete: boolean; error?: string }) => void,
    validateAgents: boolean = true
  ): Promise<{ messageId?: string; error?: string }> {
    
    // Check agent availability if validation is enabled
    if (validateAgents) {
      try {
        const availability = await this.checkAgentAvailability();
        
        if (!availability.hasActiveAgents) {
          return {
            error: availability.error || 'No active agents are configured. Please configure at least one active agent in the settings to send messages.'
          };
        }
      } catch (error) {
        return {
          error: 'Failed to check agent availability. Please try again or check your configuration.'
        };
      }
    }

    // If validation passes or is disabled, send the message normally
    const messageId = this.sendChatMessage(sessionId, message, contextItems, onChunk);
    return { messageId };
  }

  /**
   * Show a success notification
   */
  showSuccess(message: string): void {
    this.addNotification('success', message);
  }
  
  /**
   * Show an error notification
   */
  showError(message: string): void {
    this.addNotification('error', message);
  }
  
  /**
   * Show an info notification
   */
  showInfo(message: string): void {
    this.addNotification('info', message);
  }
  
  /**
   * Show a warning notification
   */
  showWarning(message: string): void {
    this.addNotification('warning', message);
  }
  
  /**
   * Dismiss a notification by ID
   */
  dismissMessage(messageId: string): void {
    const currentNotifications = this.notificationsSubject.value;
    const updatedNotifications = currentNotifications.filter(notification => notification.id !== messageId);
    this.notificationsSubject.next(updatedNotifications);
  }
  
  /**
   * Clear all error messages
   */
  clearErrorMessages(): void {
    const currentNotifications = this.notificationsSubject.value;
    const updatedNotifications = currentNotifications.filter(notification => notification.type !== 'error');
    this.notificationsSubject.next(updatedNotifications);
  }
  
  /**
   * Clear all notifications
   */
  clearAllNotifications(): void {
    this.notificationsSubject.next([]);
  }
  
  /**
   * Add a notification to the list
   */
  private addNotification(type: NotificationMessage['type'], message: string): void {
    const newNotification: NotificationMessage = {
      id: this.generateNotificationId(),
      type,
      message,
      timestamp: new Date(),
      dismissible: true
    };
    
    const currentNotifications = this.notificationsSubject.value;
    this.notificationsSubject.next([...currentNotifications, newNotification]);
    
    // Auto-dismiss success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => this.dismissMessage(newNotification.id), 5000);
    }
  }
  
  /**
   * Test an agent configuration before adding it
   * @param agentConfig The agent configuration to test
   * @param testConfig Optional test configuration
   * @returns Promise that resolves with test results
   */
  public testAgent(agentConfig: any, testConfig?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // Set up a one-time message listener for the test result
      const subscription = this.messages$.pipe(
        filter(message => message.type === 'agentTestResult'),
        take(1)
      ).subscribe(message => {
        if (message.payload.success) {
          resolve(message.payload.result);
        } else {
          reject(new Error(message.payload.error || 'Agent test failed'));
        }
      });

      // Send test request
      this.sendMessage({
        type: 'testAgent',
        payload: { agentConfig, testConfig }
      });

      // Cleanup subscription after timeout
      setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('Agent test timeout - the test took too long to complete'));
      }, 60000); // 60 second timeout for agent testing
    });
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}