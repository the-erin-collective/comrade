import * as vscode from 'vscode';
import { AIAgentService, AIResponse, ToolCall, AIToolResult } from '../core/ai-agent';

export interface WebviewMessage {
  type: 'updateSession' | 'showProgress' | 'renderMarkdown' | 'updateConfig' | 'showError' | 'showCancellation' | 'hideProgress' | 'showTimeout' | 'restoreSessions' | 'ollamaModelsResult' | 'cloudModelsResult' | 'configUpdateResult' | 'configResult' | 'aiResponse' | 'toolExecution' | 'aiTyping' | 'aiProcessing';
  payload: any;
}

export interface AIResponseMessage extends WebviewMessage {
  type: 'aiResponse';
  payload: {
    sessionId: string;
    response: AIResponse;
    isStreaming?: boolean;
  };
}

export interface ToolExecutionMessage extends WebviewMessage {
  type: 'toolExecution';
  payload: {
    sessionId: string;
    toolCall: ToolCall;
    result?: AIToolResult;
    status: 'started' | 'completed' | 'failed';
  };
}

export interface AITypingMessage extends WebviewMessage {
  type: 'aiTyping';
  payload: {
    sessionId: string;
    isTyping: boolean;
  };
}

export interface AIProcessingMessage extends WebviewMessage {
  type: 'aiProcessing';
  payload: {
    sessionId: string;
    status: 'thinking' | 'executing_tools' | 'generating_response' | 'complete';
    message?: string;
  };
}

export interface ExtensionMessage {
  type: 'sendMessage' | 'switchSession' | 'openConfig' | 'createSession' | 'closeSession' | 'addContext' | 'switchAgent' | 'cancelOperation' | 'retryOperation' | 'extendTimeout' | 'openConfiguration' | 'debug' | 'fetchOllamaModels' | 'fetchCloudModels' | 'updateConfig' | 'getConfig';
  payload: any;
}

export class ComradeSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'comrade.sidebar';

  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _context: vscode.ExtensionContext;
  private _sessionRestorationSent = false;
  private _aiAgentService: AIAgentService;
  private _activeProcessingSessions: Set<string> = new Set();

  constructor(context: vscode.ExtensionContext) {
    this._extensionUri = context.extensionUri;
    this._context = context;
    this._aiAgentService = new AIAgentService();
    
    // Initialize AI agent with default Ollama configuration
    this._aiAgentService.setModel({
      name: 'Llama 2',
      provider: 'ollama',
      model: 'llama2',
      endpoint: 'http://localhost:11434'
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (message: ExtensionMessage) => {
        this._handleWebviewMessage(message);
      },
      this._context.subscriptions
    );

    // Send session restoration message once after webview is ready
    setTimeout(() => {
      if (!this._sessionRestorationSent) {
        console.log('SidebarProvider: Sending session restoration message (one-time)');
        this._sessionRestorationSent = true;
        this.postMessage({
          type: 'restoreSessions',
          payload: {}
        });
      }
    }, 1500); // Single message after initialization
  }

  /**
   * Handle sending a message from the webview to the AI agent
   * @param payload - The message payload containing session ID and message content
   */
  private async _handleSendMessage(payload: { sessionId: string; message: string; contextItems?: any[] }) {
    const { sessionId, message, contextItems = [] } = payload;
    
    try {
      // Show typing indicator
      this._showAITyping(sessionId, true);
      this._showAIProcessing(sessionId, 'thinking', 'Processing your message...');

      // Add user message to chat history
      this.postMessage({
        type: 'updateSession',
        payload: {
          sessionId,
          message: {
            id: `msg-${Date.now()}`,
            content: message,
            timestamp: new Date().toISOString(),
            sender: 'user'
          }
        }
      });

      // Process any context items if provided
      if (contextItems.length > 0) {
        this._showAIProcessing(sessionId, 'thinking', 'Processing context...');
        // TODO: Process context items and add to conversation
      }

      // Get response from AI
      const response = await this._aiAgentService.sendMessage(sessionId, message);
      
      // Process tool calls if any
      if (response.toolCalls && response.toolCalls.length > 0) {
        await this._processToolCalls(sessionId, response.toolCalls);
      }

      // Send AI response to webview
      this._sendAIResponse(sessionId, response);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process message';
      console.error('Error in _handleSendMessage:', error);
      
      // Show error to user
      this.showError(sessionId, {
        message: errorMessage,
        code: 'message_processing_error',
        recoverable: true,
        suggestedFix: 'Please try again or check your AI model configuration.'
      });
      
    } finally {
      // Clean up
      this._showAITyping(sessionId, false);
      this._showAIProcessing(sessionId, 'complete');
    }
  }

  private _handleWebviewMessage(message: ExtensionMessage) {
    console.log('SidebarProvider: Received webview message:', message.type, message.payload);
    switch (message.type) {
      case 'debug':
        console.log('DEBUG MESSAGE FROM WEBVIEW:', message.payload);
        break;
      case 'sendMessage':
        this._handleSendMessage(message.payload);
        break;
      case 'switchSession':
        this._handleSwitchSession(message.payload);
        break;
      case 'openConfig':
        this._handleOpenConfig(message.payload);
        break;
      case 'createSession':
        this._handleCreateSession(message.payload);
        break;
      case 'closeSession':
        this._handleCloseSession(message.payload);
        break;
      case 'addContext':
        this._handleAddContext(message.payload);
        break;
      case 'switchAgent':
        this._handleSwitchAgent(message.payload);
        break;
      case 'cancelOperation':
        this._handleCancelOperation(message.payload);
        break;
      case 'retryOperation':
        this._handleRetryOperation(message.payload);
        break;
      case 'extendTimeout':
        this._handleExtendTimeout(message.payload);
        break;
      case 'openConfiguration':
        this._handleOpenConfiguration(message.payload);
        break;
      case 'fetchOllamaModels':
        this._handleFetchOllamaModels(message.payload);
        break;
      case 'fetchCloudModels':
        this._handleFetchCloudModels(message.payload);
        break;
      case 'updateConfig':
        this._handleUpdateConfig(message.payload);
        break;
      case 'getConfig':
        this._handleGetConfig(message.payload);
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * Process tool calls from AI responses
   * @param sessionId - The current session ID
   * @param toolCalls - Array of tool calls to process
   * @returns Promise resolving to array of tool execution results
   */
  private async _processToolCalls(sessionId: string, toolCalls: ToolCall[]): Promise<AIToolResult[]> {
    const results: AIToolResult[] = [];
    this._showAIProcessing(sessionId, 'executing_tools', `Executing ${toolCalls.length} tool(s)...`);

    for (const toolCall of toolCalls) {
      const startTime = Date.now();
      try {
        // Show tool execution start
        this.postMessage({
          type: 'toolExecution',
          payload: {
            sessionId,
            toolCall,
            status: 'started'
          }
        });

        // Execute the tool
        const result = await this._aiAgentService.executeToolCall(toolCall);
        results.push(result);

        // Show tool execution result
        this.postMessage({
          type: 'toolExecution',
          payload: {
            sessionId,
            toolCall: {
              ...toolCall,
              result
            },
            status: 'completed',
            result
          }
        });

        // Add tool execution to session history
        this.postMessage({
          type: 'updateSession',
          payload: {
            sessionId,
            message: {
              id: `tool-${toolCall.id}`,
              content: result.success 
                ? `Tool "${toolCall.name}" executed successfully: ${result.output || 'No output'}`
                : `Tool "${toolCall.name}" failed: ${result.error || 'Unknown error'}`,
              timestamp: new Date().toISOString(),
              sender: 'tool',
              toolCall,
              toolResult: result
            }
          }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const errorResult: AIToolResult = {
          success: false,
          error: errorMessage,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: toolCall.name,
            parameters: toolCall.parameters,
            timestamp: new Date()
          }
        };
        
        // Add error to results
        results.push(errorResult);

        // Notify UI of failure
        this.postMessage({
          type: 'toolExecution',
          payload: {
            sessionId,
            toolCall: {
              ...toolCall,
              result: errorResult
            },
            status: 'failed',
            result: errorResult
          }
        });

        // Log error to console
        console.error('Error executing tool call:', error);
      }
    }
    
    return results;
  }

  private _handleSwitchSession(payload: { sessionId: string }) {
    // TODO: Implement session switching logic
    console.log('Switch session:', payload);
  }

  private _handleOpenConfig(payload: { type: string }) {
    // TODO: Implement configuration opening logic
    console.log('Open config:', payload);
  }

  private _handleCreateSession(payload: { type?: string }) {
    // TODO: Implement session creation logic
    const sessionId = Date.now().toString();
    console.log('Create session:', sessionId);

    this.postMessage({
      type: 'updateSession',
      payload: {
        sessionId,
        type: payload.type || 'conversation',
        title: `Session ${sessionId.slice(-4)}`,
        isActive: true
      }
    });
  }

  private _handleCloseSession(payload: { sessionId: string }) {
    // TODO: Implement session closing logic
    console.log('Close session:', payload);
  }

  private _handleAddContext(payload: { type: string; content?: string }) {
    // TODO: Implement context adding logic
    console.log('Add context:', payload);
  }

  private _handleSwitchAgent(payload: { sessionId: string; agentId: string; phase?: string }) {
    // TODO: Implement agent switching logic
    console.log('Switch agent:', payload);
  }

  private _handleCancelOperation(payload: { sessionId: string; operationType?: string }) {
    // TODO: Implement operation cancellation logic
    console.log('Cancel operation:', payload);

    // Send confirmation back to webview
    this.postMessage({
      type: 'hideProgress',
      payload: { sessionId: payload.sessionId }
    });
  }

  private _handleRetryOperation(payload: { sessionId: string; operationType?: string }) {
    // TODO: Implement operation retry logic
    console.log('Retry operation:', payload);
  }

  private _handleExtendTimeout(payload: { sessionId: string; operationType?: string; duration?: number }) {
    // TODO: Implement timeout extension logic
    console.log('Extend timeout:', payload);
  }

  private _handleOpenConfiguration(payload: { type: string; sessionId?: string }) {
    console.log('SidebarProvider: Open configuration request:', payload);
    // Don't open VS Code settings - the webview handles its own settings UI
    // This message is just for logging/tracking purposes
  }

  private async _handleFetchOllamaModels(payload: { networkAddress?: string }) {
    console.log('SidebarProvider: Fetching Ollama models:', payload);
    
    try {
      console.log('SidebarProvider: Executing ollama list command...');
      const models = await this._executeOllamaList();
      console.log('SidebarProvider: Ollama models retrieved:', models);
      this.postMessage({
        type: 'ollamaModelsResult',
        payload: { 
          success: true, 
          models: models,
          networkAddress: payload.networkAddress 
        }
      });
      console.log('SidebarProvider: Sent ollamaModelsResult message to webview');
    } catch (error) {
      console.error('SidebarProvider: Error fetching Ollama models:', error);
      this.postMessage({
        type: 'ollamaModelsResult',
        payload: { 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to fetch Ollama models',
          networkAddress: payload.networkAddress 
        }
      });
      console.log('SidebarProvider: Sent error ollamaModelsResult message to webview');
    }
  }

  private async _handleFetchCloudModels(payload: { provider: string; apiKey: string }) {
    console.log('Fetching cloud models:', payload.provider);
    
    try {
      const models = await this._fetchCloudProviderModels(payload.provider, payload.apiKey);
      this.postMessage({
        type: 'cloudModelsResult',
        payload: { 
          success: true, 
          models: models,
          provider: payload.provider 
        }
      });
    } catch (error) {
      console.error('Error fetching cloud models:', error);
      this.postMessage({
        type: 'cloudModelsResult',
        payload: { 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to fetch models',
          provider: payload.provider 
        }
      });
    }
  }

  public postMessage(message: WebviewMessage) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private async _executeOllamaList(): Promise<string[]> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      console.log('SidebarProvider: Executing "ollama list" command...');
      const { stdout, stderr } = await execAsync('ollama list');
      console.log('SidebarProvider: Command stdout:', stdout);
      console.log('SidebarProvider: Command stderr:', stderr);
      
      const lines = stdout.split('\n').filter((line: string) => line.trim());
      console.log('SidebarProvider: Parsed lines:', lines);
      
      // Skip the header line and extract model names
      const models = lines.slice(1)
        .map((line: string) => {
          const parts = line.trim().split(/\s+/);
          return parts[0]; // First column is the model name
        })
        .filter((name: string) => name && name !== '');
      
      console.log('SidebarProvider: Extracted models:', models);
      return models;
    } catch (error) {
      console.error('SidebarProvider: Error executing ollama list:', error);
      throw new Error('Ollama not found or not running. Please ensure Ollama is installed and running.');
    }
  }

  private async _fetchCloudProviderModels(provider: string, apiKey: string): Promise<string[]> {
    // For now, return mock data. In a real implementation, you'd make actual API calls
    const mockModels: { [key: string]: string[] } = {
      'openai': ['gpt-4', 'gpt-4-turbo', 'gpt-4-vision-preview', 'gpt-3.5-turbo'],
      'anthropic': ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
      'google': ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro'],
      'azure': ['gpt-4', 'gpt-35-turbo', 'gpt-4-vision-preview']
    };
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const models = mockModels[provider] || [];
    console.log(`Mock ${provider} models:`, models);
    return models;
  }

  private async _handleUpdateConfig(payload: { agents: any[]; settings: any }) {
    console.log('SidebarProvider: Updating configuration:', payload);
    
    try {
      // Save agents to VS Code configuration
      if (payload.agents) {
        await vscode.workspace.getConfiguration('comrade').update('agents', payload.agents, vscode.ConfigurationTarget.Global);
        console.log('SidebarProvider: Agents saved to VS Code configuration');
      }
      
      // Save other settings if needed
      if (payload.settings) {
        // You can add more settings here as needed
        console.log('SidebarProvider: Additional settings:', payload.settings);
      }
      
      // Send confirmation back to webview
      this.postMessage({
        type: 'configUpdateResult',
        payload: { success: true }
      });
      
    } catch (error) {
      console.error('SidebarProvider: Error saving configuration:', error);
      this.postMessage({
        type: 'configUpdateResult',
        payload: { success: false, error: error instanceof Error ? error.message : 'Failed to save configuration' }
      });
    }
  }

  private _handleGetConfig(payload: any) {
    console.log('SidebarProvider: Getting current configuration');
    
    try {
      // Get current agents from VS Code configuration
      const config = vscode.workspace.getConfiguration('comrade');
      const agents = config.get('agents', []);
      
      console.log('SidebarProvider: Current agents from config:', agents);
      
      // Send configuration back to webview
      this.postMessage({
        type: 'configResult',
        payload: { 
          success: true,
          agents: agents,
          settings: {
            // Add other settings here if needed
          }
        }
      });
      
    } catch (error) {
      console.error('SidebarProvider: Error getting configuration:', error);
      this.postMessage({
        type: 'configResult',
        payload: { 
          success: false, 
          error: error instanceof Error ? error.message : 'Failed to get configuration',
          agents: []
        }
      });
    }
  }

  /**
   * Show progress with cancellation support
   */
  public showProgress(sessionId: string, message: string, cancellable: boolean = true) {
    this.postMessage({
      type: 'showProgress',
      payload: { sessionId, message, cancellable }
    });
  }

  /**
   * Hide progress indicator
   */
  public hideProgress(sessionId: string) {
    this.postMessage({
      type: 'hideProgress',
      payload: { sessionId }
    });
  }

  /**
   * Show error with recovery options
   */
  public showError(sessionId: string, error: {
    message: string;
    code: string;
    recoverable: boolean;
    suggestedFix?: string;
    configurationLink?: string;
  }) {
    this.postMessage({
      type: 'showError',
      payload: { sessionId, error }
    });
  }

  /**
   * Show timeout dialog
   */
  public showTimeout(sessionId: string, message: string, allowExtension: boolean = true) {
    this.postMessage({
      type: 'showTimeout',
      payload: { sessionId, message, allowExtension }
    });
  }

  /**
   * Show AI typing indicator
   */
  private _showAITyping(sessionId: string, isTyping: boolean) {
    this.postMessage({
      type: 'aiTyping',
      payload: { sessionId, isTyping }
    });
  }

  /**
   * Show AI processing status
   */
  private _showAIProcessing(sessionId: string, status: 'thinking' | 'executing_tools' | 'generating_response' | 'complete', message?: string) {
    this.postMessage({
      type: 'aiProcessing',
      payload: { sessionId, status, message }
    });
  }

  /**
   * Send AI response to webview
   */
  private _sendAIResponse(sessionId: string, response: AIResponse, isStreaming: boolean = false) {
    this.postMessage({
      type: 'aiResponse',
      payload: {
        sessionId,
        response,
        isStreaming
      }
    });

    // Also send as a regular session update for compatibility
    this.postMessage({
      type: 'updateSession',
      payload: {
        sessionId,
        message: {
          id: Date.now().toString(),
          content: response.content,
          timestamp: new Date().toISOString(),
          sender: 'assistant',
          metadata: response.metadata,
          toolCalls: response.toolCalls
        }
      }
    });
  }



  /**
   * Get AI agent service instance (for external access if needed)
   */
  public getAIAgentService(): AIAgentService {
    return this._aiAgentService;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    try {
      // Read the built Angular HTML file
      const fs = require('fs');
      const path = require('path');

      const htmlPath = path.join(this._extensionUri.fsPath, 'out', 'webview', 'browser', 'index.html');
      console.log('Loading HTML from:', htmlPath);
      console.log('Extension mode:', this._context.extensionMode);

      if (!fs.existsSync(htmlPath)) {
        console.error('HTML file not found at:', htmlPath);
        return this._getFallbackHtml(webview);
      }

      let html = fs.readFileSync(htmlPath, 'utf8');
      console.log('HTML loaded, length:', html.length);

      // Convert resource paths to webview URIs - this works for both dev and production
      const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'browser', 'main.js'));
      const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'browser', 'styles.css'));
      const faviconUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'browser', 'favicon.ico'));

      console.log('Script URI:', scriptUri.toString());
      console.log('Style URI:', styleUri.toString());

      // Remove the base href tag that causes issues in webviews
      html = html.replace(/<base href="[^"]*"[^>]*>/i, '');

      // Replace relative paths with webview URIs
      html = html.replace(/href="styles\.css"/g, `href="${styleUri}"`);
      html = html.replace(/src="main\.js"/g, `src="${scriptUri}"`);
      html = html.replace(/href="favicon\.ico"/g, `href="${faviconUri}"`);

      // Generate a nonce for inline scripts
      const nonce = getNonce();

      // Update CSP to allow the webview resources and nonce-based inline scripts
      const cspContent = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; img-src ${webview.cspSource} data:;`;
      html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, `<meta http-equiv="Content-Security-Policy" content="${cspContent}">`);

      // If no CSP exists, add one
      if (!html.includes('Content-Security-Policy')) {
        html = html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${cspContent}">`);
      }

      // Add debugging information based on extension mode
      const debugInfo = this._context.extensionMode === vscode.ExtensionMode.Development
        ? `
        <script nonce="${nonce}">
          console.log('WEBVIEW: Development mode - Basic JavaScript is working!');
          console.log('WEBVIEW: Extension mode:', ${this._context.extensionMode});
          
          // Log all script and link elements
          document.addEventListener('DOMContentLoaded', () => {
            console.log('WEBVIEW: DOM Content Loaded');
            const scripts = document.querySelectorAll('script');
            const links = document.querySelectorAll('link');
            console.log('WEBVIEW: Found', scripts.length, 'script elements');
            console.log('WEBVIEW: Found', links.length, 'link elements');
            
            scripts.forEach((script, index) => {
              console.log('WEBVIEW: Script', index, ':', script.src || 'inline');
            });
            
            links.forEach((link, index) => {
              console.log('WEBVIEW: Link', index, ':', link.href, 'rel:', link.rel);
            });
          });
          
          window.addEventListener('load', () => {
            console.log('WEBVIEW: Window loaded in development mode');
            setTimeout(() => {
              console.log('WEBVIEW: Checking for app-root element...');
              const appRoot = document.querySelector('app-root');
              console.log('WEBVIEW: app-root found:', !!appRoot);
              if (appRoot) {
                console.log('WEBVIEW: app-root innerHTML length:', appRoot.innerHTML.length);
                console.log('WEBVIEW: app-root innerHTML preview:', appRoot.innerHTML.substring(0, 200));
              }
              
              // Check for any JavaScript errors
              console.log('WEBVIEW: Checking for Angular...');
              console.log('WEBVIEW: window.ng available:', !!window.ng);
              console.log('WEBVIEW: document.body.children:', document.body.children.length);
            }, 2000);
          });
          
          // Catch any errors
          window.addEventListener('error', (e) => {
            console.error('WEBVIEW: JavaScript error:', e.error, e.message, e.filename, e.lineno);
          });
          
          window.addEventListener('unhandledrejection', (e) => {
            console.error('WEBVIEW: Unhandled promise rejection:', e.reason);
          });
        </script>`
        : `
        <script nonce="${nonce}">
          console.log('WEBVIEW: Production mode - JavaScript loaded');
        </script>`;

      // Add a simple inline script first to test basic execution
      html = html.replace('<body>', `<body><script nonce="${nonce}">
        console.log('WEBVIEW: Inline script executing immediately!');
        // Acquire VS Code API and store it globally for Angular to use
        if (window.acquireVsCodeApi) {
          const vscode = window.acquireVsCodeApi();
          // Store globally so Angular service can access it
          window.vscodeApi = vscode;
          vscode.postMessage({type: 'debug', payload: 'JavaScript is executing in webview!'});
          console.log('WEBVIEW: VS Code API acquired and stored globally');
        }
      </script>${debugInfo}`);

      // Log a snippet of the processed HTML to verify script injection
      console.log('HTML processed successfully');
      console.log('HTML snippet with debug script:', html.substring(html.indexOf('<body>'), html.indexOf('<body>') + 500));
      return html;
    } catch (error) {
      console.error('Error loading webview HTML:', error);
      return this._getFallbackHtml(webview);
    }
  }

  private _getFallbackHtml(webview: vscode.Webview): string {
    console.log('Using fallback HTML');
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Comrade</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px;
          }
          .welcome {
            text-align: center;
            padding: 32px 16px;
          }
          .welcome h3 {
            margin: 0 0 16px 0;
            font-size: 18px;
          }
          .welcome p {
            margin: 0 0 24px 0;
            color: var(--vscode-descriptionForeground);
          }
          .btn {
            padding: 8px 16px;
            border: none;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
            border-radius: 4px;
            font-size: 14px;
          }
          .btn:hover {
            background: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
        <div class="welcome">
          <h3>Welcome to Comrade!</h3>
          <p>The webview is loading. If you see this message, the Angular app may not have built correctly.</p>
          <button class="btn" onclick="location.reload()">Reload</button>
        </div>
        <script>
          console.log('Fallback HTML loaded');
        </script>
      </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}