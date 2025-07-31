/**
 * Web compatibility layer for VS Code web environment
 * Provides fallbacks and adaptations for Node.js APIs that aren't available in web
 */

import * as vscode from 'vscode';

/**
 * Environment detection utilities
 */
export class WebCompatibility {
  private static _isWeb: boolean | undefined;

  /**
   * Check if running in VS Code web environment
   */
  public static isWeb(): boolean {
    if (this._isWeb === undefined) {
      // Check for web-specific indicators
      this._isWeb = typeof process === 'undefined' || 
                   process.env.VSCODE_BROWSER === 'true' ||
                   vscode.env.uiKind === vscode.UIKind.Web;
    }
    return this._isWeb;
  }

  /**
   * Check if running in desktop VS Code
   */
  public static isDesktop(): boolean {
    return !this.isWeb();
  }

  /**
   * Get platform-appropriate shell command
   */
  public static getShell(): { shell: string; args: string[] } {
    if (this.isWeb()) {
      // Web environment doesn't support shell commands
      throw new Error('Shell commands are not supported in VS Code web environment');
    }

    const isWindows = process.platform === 'win32';
    return {
      shell: isWindows ? 'cmd' : 'bash',
      args: isWindows ? ['/c'] : ['-c']
    };
  }

  /**
   * Check if file system operations are supported
   */
  public static supportsFileSystem(): boolean {
    // VS Code web supports file system operations through workspace.fs API
    return true;
  }

  /**
   * Check if shell commands are supported
   */
  public static supportsShellCommands(): boolean {
    return this.isDesktop();
  }

  /**
   * Check if network requests are supported
   */
  public static supportsNetworkRequests(): boolean {
    // Network requests are supported in web but may have CORS limitations
    return true;
  }

  /**
   * Get network request limitations for web environment
   */
  public static getNetworkLimitations(): {
    hasCorsRestrictions: boolean;
    requiresHttps: boolean;
    allowedOrigins?: string[];
  } {
    if (this.isWeb()) {
      return {
        hasCorsRestrictions: true,
        requiresHttps: true,
        allowedOrigins: [
          'https://api.openai.com',
          'https://api.anthropic.com',
          'https://api.cohere.ai'
        ]
      };
    }

    return {
      hasCorsRestrictions: false,
      requiresHttps: false
    };
  }

  /**
   * Show web compatibility warning for unsupported features
   */
  public static async showWebCompatibilityWarning(
    feature: string,
    fallback?: string
  ): Promise<void> {
    if (!this.isWeb()) {
      return;
    }

    let message = `${feature} is not available in VS Code web environment.`;
    if (fallback) {
      message += ` ${fallback}`;
    }

    const action = await vscode.window.showWarningMessage(
      message,
      'Learn More',
      'Dismiss'
    );

    if (action === 'Learn More') {
      vscode.env.openExternal(
        vscode.Uri.parse('https://code.visualstudio.com/docs/editor/vscode-web#_extensions')
      );
    }
  }
}

/**
 * Web-compatible file system operations
 */
export class WebFileSystem {
  /**
   * Check if a file exists (web-compatible)
   */
  public static async exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read file content (web-compatible)
   */
  public static async readFile(uri: vscode.Uri): Promise<string> {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(content).toString('utf8');
    } catch (error) {
      throw new Error(`Failed to read file ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Write file content (web-compatible)
   */
  public static async writeFile(uri: vscode.Uri, content: string): Promise<void> {
    try {
      const buffer = Buffer.from(content, 'utf8');
      await vscode.workspace.fs.writeFile(uri, buffer);
    } catch (error) {
      throw new Error(`Failed to write file ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create directory (web-compatible)
   */
  public static async createDirectory(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(uri);
    } catch (error) {
      // Directory might already exist, check if that's the case
      if (await this.exists(uri)) {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type === vscode.FileType.Directory) {
          return; // Directory already exists, that's fine
        }
      }
      throw new Error(`Failed to create directory ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete file or directory (web-compatible)
   */
  public static async delete(uri: vscode.Uri): Promise<void> {
    try {
      await vscode.workspace.fs.delete(uri, { recursive: true, useTrash: false });
    } catch (error) {
      throw new Error(`Failed to delete ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List directory contents (web-compatible)
   */
  public static async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    try {
      return await vscode.workspace.fs.readDirectory(uri);
    } catch (error) {
      throw new Error(`Failed to read directory ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Web-compatible shell command execution
 */
export class WebShellExecutor {
  /**
   * Execute shell command with web compatibility checks
   */
  public static async executeCommand(
    command: string,
    workingDirectory: string,
    options: {
      timeout?: number;
      showWarning?: boolean;
    } = {}
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    if (WebCompatibility.isWeb()) {
      if (options.showWarning !== false) {
        await WebCompatibility.showWebCompatibilityWarning(
          'Shell command execution',
          'Commands cannot be executed in the web environment. Consider using VS Code desktop for full functionality.'
        );
      }

      // Return mock success result for web environment
      return {
        exitCode: 0,
        stdout: `[WEB MODE] Command would execute: ${command}`,
        stderr: ''
      };
    }

    // Desktop environment - use actual shell execution
    return this.executeDesktopCommand(command, workingDirectory, options.timeout);
  }

  /**
   * Execute command in desktop environment
   */
  private static async executeDesktopCommand(
    command: string,
    workingDirectory: string,
    timeout: number = 300000
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      // Dynamic import to avoid issues in web environment
      const { spawn } = eval('require')('child_process');
      
      const { shell, args } = WebCompatibility.getShell();
      
      const child = spawn(shell, [...args, command], {
        cwd: workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number) => {
        resolve({
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      child.on('error', (error: Error) => {
        reject(error);
      });

      // Set timeout for long-running commands
      const timeoutId = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out: ${command}`));
      }, timeout);

      child.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }

  /**
   * Check if a command is safe to execute in web environment
   */
  public static isWebSafeCommand(command: string): boolean {
    // Commands that could potentially work in web environment
    const webSafeCommands = [
      'echo',
      'cat',
      'ls',
      'pwd',
      'whoami'
    ];

    const commandName = command.trim().split(' ')[0];
    return webSafeCommands.includes(commandName);
  }
}

/**
 * Web-compatible network request utilities
 */
export class WebNetworkUtils {
  /**
   * Make HTTP request with web compatibility considerations
   */
  public static async makeRequest(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    } = {}
  ): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  }> {
    const limitations = WebCompatibility.getNetworkLimitations();
    
    // Check CORS restrictions in web environment
    if (limitations.hasCorsRestrictions) {
      const urlObj = new URL(url);
      const isAllowed = limitations.allowedOrigins?.some(origin => 
        urlObj.origin === origin
      );
      
      if (!isAllowed) {
        throw new Error(
          `CORS restriction: ${urlObj.origin} is not in the allowed origins list. ` +
          'This request may fail in VS Code web environment.'
        );
      }
    }

    // Ensure HTTPS in web environment
    if (limitations.requiresHttps && !url.startsWith('https://')) {
      throw new Error('HTTPS is required for network requests in VS Code web environment');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: await response.text()
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    }
  }

  /**
   * Check if a URL is accessible from web environment
   */
  public static isWebAccessible(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const limitations = WebCompatibility.getNetworkLimitations();
      
      // Check HTTPS requirement
      if (limitations.requiresHttps && urlObj.protocol !== 'https:') {
        return false;
      }

      // Check allowed origins
      if (limitations.allowedOrigins) {
        return limitations.allowedOrigins.includes(urlObj.origin);
      }

      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Web compatibility error types
 */
export class WebCompatibilityError extends Error {
  constructor(
    message: string,
    public readonly feature: string,
    public readonly fallback?: string
  ) {
    super(message);
    this.name = 'WebCompatibilityError';
  }
}

/**
 * Utility function to wrap operations with web compatibility checks
 */
export function withWebCompatibility<T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T>,
  feature: string
): Promise<T> {
  if (WebCompatibility.isWeb()) {
    return fallback();
  }
  return operation();
}