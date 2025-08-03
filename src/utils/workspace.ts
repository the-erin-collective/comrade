import * as vscode from 'vscode';

/**
 * Checks if a workspace is currently open
 */
export function hasWorkspace(): boolean {
  return vscode.workspace.workspaceFolders !== undefined && 
         vscode.workspace.workspaceFolders.length > 0;
}

/**
 * Gets the first available workspace folder, or undefined if none is available
 */
export function getFirstWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
    ? vscode.workspace.workspaceFolders[0]
    : undefined;
}

/**
 * Shows a notification when no workspace is open and provides actions to the user
 */
export function handleNoWorkspace(context: vscode.ExtensionContext): void {
  if (hasWorkspace()) {
    return; // Workspace is available, nothing to do
  }

  const message = 'Comrade requires an open workspace to function fully. ' +
    'Some features will be limited until you open a workspace.';
    
  vscode.window.showWarningMessage(message, 'Open Workspace', 'Open Folder')
    .then(selection => {
      if (selection === 'Open Workspace') {
        vscode.commands.executeCommand('workbench.action.openWorkspace');
      } else if (selection === 'Open Folder') {
        vscode.commands.executeCommand('vscode.openFolder');
      }
    });
}

/**
 * Registers workspace change listeners to handle workspace lifecycle events
 */
export function registerWorkspaceChangeHandlers(
  context: vscode.ExtensionContext,
  onWorkspaceChanged: () => void
): void {
  // Handle workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      onWorkspaceChanged();
    })
  );

  // Handle configuration changes that might affect workspace settings
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('comrade')) {
        onWorkspaceChanged();
      }
    })
  );
}
