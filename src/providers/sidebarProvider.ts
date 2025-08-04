import * as vscode from 'vscode';

export interface WebviewMessage {
  type: 'updateSession' | 'showProgress' | 'renderMarkdown' | 'updateConfig' | 'showError' | 'showCancellation' | 'hideProgress' | 'showTimeout';
  payload: any;
}

export interface ExtensionMessage {
  type: 'sendMessage' | 'switchSession' | 'openConfig' | 'createSession' | 'closeSession' | 'addContext' | 'switchAgent' | 'cancelOperation' | 'retryOperation' | 'extendTimeout' | 'openConfiguration';
  payload: any;
}

export class ComradeSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'comrade.sidebar';
  
  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this._extensionUri = context.extensionUri;
    this._context = context;
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
  }

  private _handleWebviewMessage(message: ExtensionMessage) {
    switch (message.type) {
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
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private _handleSendMessage(payload: { sessionId: string; message: string; contextItems?: any[] }) {
    // TODO: Implement message sending logic
    console.log('Send message:', payload);
    
    // Send acknowledgment back to webview
    this.postMessage({
      type: 'updateSession',
      payload: {
        sessionId: payload.sessionId,
        message: {
          id: Date.now().toString(),
          content: payload.message,
          timestamp: new Date().toISOString(),
          sender: 'user'
        }
      }
    });
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
    // TODO: Implement configuration opening logic
    console.log('Open configuration:', payload);
    
    // Open configuration based on type
    switch (payload.type) {
      case 'api':
        vscode.commands.executeCommand('comrade.openApiConfig');
        break;
      case 'agents':
        vscode.commands.executeCommand('comrade.openAgentConfig');
        break;
      case 'mcp':
        vscode.commands.executeCommand('comrade.openMcpConfig');
        break;
      default:
        vscode.commands.executeCommand('comrade.openSettings');
    }
  }

  public postMessage(message: WebviewMessage) {
    if (this._view) {
      this._view.webview.postMessage(message);
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

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'styles.css'));

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <title>Comrade</title>
      </head>
      <body>
        <app-root></app-root>
        <script nonce="${nonce}" src="${scriptUri}"></script>
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