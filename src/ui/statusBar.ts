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
  showReady(): void;
  showError(message: string): void;
  showWarning(message: string): void;
  dispose(): void;
}

/**
 * Manages status bar items for operation progress and cancellation
 */
export class ComradeStatusBarManager implements StatusBarManager {
  private persistentItem: vscode.StatusBarItem;
  private progressItem: vscode.StatusBarItem;
  private cancelItem: vscode.StatusBarItem;
  private currentSession: ISession | null = null;
  private currentState: 'ready' | 'busy' | 'error' | 'warning' = 'ready';

  constructor(private context: vscode.ExtensionContext) {
    // Create persistent status bar item (highest priority)
    this.persistentItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      101
    );
    
    // Create status bar items
    this.progressItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    
    this.cancelItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );

    // Configure persistent item
    this.persistentItem.text = '$(robot) Comrade';
    this.persistentItem.tooltip = 'Comrade - Click for quick access';
    this.persistentItem.command = 'comrade.statusBar.quickAccess';
    this.persistentItem.show();

    // Configure cancel button
    this.cancelItem.text = '$(stop-circle) Cancel';
    this.cancelItem.tooltip = 'Cancel current operation';
    this.cancelItem.command = 'comrade.cancelOperation';
    this.cancelItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

    // Register commands
    this.registerCommands();
    
    // Initialize in ready state
    this.showReady();
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

    const quickAccessCommand = vscode.commands.registerCommand('comrade.statusBar.quickAccess', async () => {
      const items = [
        {
          label: '$(comment-discussion) Open Chat',
          description: 'Open the Comrade sidebar chat interface',
          command: 'comrade.sidebar.focus'
        },
        {
          label: '$(gear) Settings',
          description: 'Open Comrade settings',
          command: 'workbench.action.openSettings'
        },
        {
          label: '$(question) Help',
          description: 'View Comrade documentation',
          command: 'comrade.help'
        }
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Choose a Comrade action'
      });

      if (selected) {
        if (selected.command === 'comrade.sidebar.focus') {
          // Focus the Comrade sidebar view
          await vscode.commands.executeCommand('workbench.view.extension.comrade');
        } else if (selected.command === 'workbench.action.openSettings') {
          // Open settings filtered to Comrade
          await vscode.commands.executeCommand('workbench.action.openSettings', 'comrade');
        } else if (selected.command === 'comrade.help') {
          // Open help - for now just show a message, can be enhanced later
          vscode.window.showInformationMessage('Comrade Help: Check the README for usage instructions.');
        }
      }
    });

    this.context.subscriptions.push(cancelCommand, quickAccessCommand);
  }

  /**
   * Show progress in status bar with spinner
   */
  public showProgress(session: ISession, message: string): void {
    this.currentSession = session;
    this.currentState = 'busy';
    
    // Update persistent item to show busy state
    this.persistentItem.text = `$(sync~spin) ${message}`;
    this.persistentItem.tooltip = `Comrade: ${message}`;
    
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
    
    // Return to ready state
    this.showReady();
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
   * Show error state in persistent status bar item
   */
  public showError(message: string): void {
    this.currentState = 'error';
    
    this.persistentItem.text = `$(error) ${message}`;
    this.persistentItem.tooltip = `Comrade Error: ${message}`;
    this.persistentItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }

  /**
   * Show error in status bar temporarily (legacy method for compatibility)
   */
  public showTemporaryError(message: string, duration: number = 5000): void {
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
   * Show warning state in persistent status bar item
   */
  public showWarning(message: string): void {
    this.currentState = 'warning';
    
    this.persistentItem.text = `$(warning) ${message}`;
    this.persistentItem.tooltip = `Comrade Warning: ${message}`;
    this.persistentItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  /**
   * Show warning in status bar temporarily (legacy method for compatibility)
   */
  public showTemporaryWarning(message: string, duration: number = 5000): void {
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
   * Show ready state in persistent status bar item
   */
  public showReady(): void {
    this.currentState = 'ready';
    
    this.persistentItem.text = '$(robot) Comrade';
    this.persistentItem.tooltip = 'Comrade - Click for quick access';
    this.persistentItem.backgroundColor = undefined;
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
   * Get current status bar state
   */
  public getCurrentState(): 'ready' | 'busy' | 'error' | 'warning' {
    return this.currentState;
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
    this.persistentItem.dispose();
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