import * as vscode from 'vscode';

export interface WebviewMessage {
  type: 'updateSession' | 'showProgress' | 'renderMarkdown' | 'updateConfig' | 'showError' | 'showCancellation' | 'hideProgress' | 'showTimeout' | 'restoreSessions';
  payload: any;
}

export interface ExtensionMessage {
  type: 'sendMessage' | 'switchSession' | 'openConfig' | 'createSession' | 'closeSession' | 'addContext' | 'switchAgent' | 'cancelOperation' | 'retryOperation' | 'extendTimeout' | 'openConfiguration' | 'debug';
  payload: any;
}

export class ComradeSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'comrade.sidebar';

  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _context: vscode.ExtensionContext;
  private _sessionRestorationSent = false;

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

  private _handleWebviewMessage(message: ExtensionMessage) {
    console.log('Received webview message:', message.type, message.payload);
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
        // Also try to send a message to the extension to confirm JS is working
        if (window.acquireVsCodeApi) {
          const vscode = window.acquireVsCodeApi();
          vscode.postMessage({type: 'debug', payload: 'JavaScript is executing in webview!'});
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