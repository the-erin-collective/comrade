/**
 * Status bar integration for showing operation progress and cancellation
 */

import * as vscode from 'vscode';
import { ISession } from '../core/session';

export interface StatusBarManager {
  showProgress(session: ISession, message: string): void;
  hideProgress(): void;
  showCancellationButton(session: ISession): void;
  hideCancellationButton(): void;
  updateWorkspaceStatus(hasWorkspace: boolean): void;
  dispose(): void;
}

/**
 * Manages status bar items for operation progress and cancellation
 */
export class ComradeStatusBarManager implements StatusBarManager {
  private progressItem: vscode.StatusBarItem;
  private cancelItem: vscode.StatusBarItem;
  private currentSession: ISession | null = null;

  constructor(private context: vscode.ExtensionContext) {
    // Create status bar items
    this.progressItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    
    this.cancelItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );

    // Configure cancel button
    this.cancelItem.text = '$(stop-circle) Cancel';
    this.cancelItem.tooltip = 'Cancel current operation';
    this.cancelItem.command = 'comrade.cancelOperation';
    this.cancelItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

    // Register commands
    this.registerCommands();
  }

  private registerCommands() {
    const cancelCommand = vscode.commands.registerCommand('comrade.cancelOperation', () => {
      if (this.currentSession) {
        this.currentSession.cancel();
        this.hideProgress();
        this.hideCancellationButton();
        
        vscode.window.showInformationMessage('Operation cancelled');
      }
    });

    this.context.subscriptions.push(cancelCommand);
  }

  /**
   * Show progress in status bar with spinner
   */
  public showProgress(session: ISession, message: string): void {
    this.currentSession = session;
    
    this.progressItem.text = `$(sync~spin) ${message}`;
    this.progressItem.tooltip = `Comrade: ${message}`;
    this.progressItem.show();

    // Show cancellation button if operation is cancellable
    this.showCancellationButton(session);
  }

  /**
   * Hide progress indicator
   */
  public hideProgress(): void {
    this.progressItem.hide();
    this.currentSession = null;
  }

  /**
   * Show cancellation button in status bar
   */
  public showCancellationButton(session: ISession): void {
    this.currentSession = session;
    this.cancelItem.show();
  }

  /**
   * Hide cancellation button
   */
  public hideCancellationButton(): void {
    this.cancelItem.hide();
  }

  /**
   * Update progress message
   */
  public updateProgress(message: string): void {
    if (this.progressItem.text) {
      this.progressItem.text = `$(sync~spin) ${message}`;
      this.progressItem.tooltip = `Comrade: ${message}`;
    }
  }

  /**
   * Show error in status bar temporarily
   */
  public showError(message: string, duration: number = 5000): void {
    const originalText = this.progressItem.text;
    const originalTooltip = this.progressItem.tooltip;
    const originalBackground = this.progressItem.backgroundColor;

    this.progressItem.text = `$(error) ${message}`;
    this.progressItem.tooltip = `Comrade Error: ${message}`;
    this.progressItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.progressItem.show();

    // Restore original state after duration
    setTimeout(() => {
      this.progressItem.text = originalText;
      this.progressItem.tooltip = originalTooltip;
      this.progressItem.backgroundColor = originalBackground;
      
      if (!originalText) {
        this.progressItem.hide();
      }
    }, duration);
  }

  /**
   * Show warning in status bar temporarily
   */
  public showWarning(message: string, duration: number = 5000): void {
    const originalText = this.progressItem.text;
    const originalTooltip = this.progressItem.tooltip;
    const originalBackground = this.progressItem.backgroundColor;

    this.progressItem.text = `$(warning) ${message}`;
    this.progressItem.tooltip = `Comrade Warning: ${message}`;
    this.progressItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.progressItem.show();

    // Restore original state after duration
    setTimeout(() => {
      this.progressItem.text = originalText;
      this.progressItem.tooltip = originalTooltip;
      this.progressItem.backgroundColor = originalBackground;
      
      if (!originalText) {
        this.progressItem.hide();
      }
    }, duration);
  }

  /**
   * Show success message in status bar temporarily
   */
  public showSuccess(message: string, duration: number = 3000): void {
    const originalText = this.progressItem.text;
    const originalTooltip = this.progressItem.tooltip;

    this.progressItem.text = `$(check) ${message}`;
    this.progressItem.tooltip = `Comrade: ${message}`;
    this.progressItem.backgroundColor = undefined;
    this.progressItem.show();

    // Restore original state after duration
    setTimeout(() => {
      this.progressItem.text = originalText;
      this.progressItem.tooltip = originalTooltip;
      
      if (!originalText) {
        this.progressItem.hide();
      }
    }, duration);
  }

  /**
   * Update workspace status
   */
  public updateWorkspaceStatus(_hasWorkspace: boolean): void {
    // Implementation for updating workspace status
    // This is a placeholder - implement based on actual requirements
  }

  /**
   * Dispose of status bar items
   */
  public dispose(): void {
    this.progressItem.dispose();
    this.cancelItem.dispose();
  }
}

/**
 * Create and configure status bar manager
 */
export function createStatusBarManager(context: vscode.ExtensionContext): StatusBarManager {
  const manager = new ComradeStatusBarManager(context);
  
  // Register for disposal
  context.subscriptions.push({
    dispose: () => manager.dispose()
  });

  return manager;
}