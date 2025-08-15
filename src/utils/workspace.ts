import * as vscode from 'vscode';
import * as path from 'path';

// Extension context is provided by the extension activation
import * as os from 'os';

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
 * Gets the workspace folder or creates a temporary context for graceful fallback
 * This function ensures the extension can work even without a workspace
 */
export function getWorkspaceFolderOrDefault(): vscode.WorkspaceFolder {
  const workspaceFolder = getFirstWorkspaceFolder();
  
  if (workspaceFolder) {
    return workspaceFolder;
  }

  // Create a temporary workspace context using the user's home directory
  // This allows the extension to function without a workspace
  const tempPath = path.join(os.homedir(), '.comrade-temp');
  return {
    uri: vscode.Uri.file(tempPath),
    name: 'Comrade Temporary Workspace',
    index: 0
  };
}

/**
 * Gets the workspace root path with graceful fallback
 * Returns the workspace path or a temporary path if no workspace is available
 */
export function getWorkspaceRootPath(): string {
  const workspaceFolder = getWorkspaceFolderOrDefault();
  return workspaceFolder.uri.fsPath;
}

/**
 * Gets the workspace URI with graceful fallback
 * Returns the workspace URI or a temporary URI if no workspace is available
 */
export function getWorkspaceUri(): vscode.Uri {
  const workspaceFolder = getWorkspaceFolderOrDefault();
  return workspaceFolder.uri;
}

/**
 * Handles no workspace scenario gracefully without showing warning notifications
 * This function now logs information instead of showing disruptive notifications
 */
export function handleNoWorkspace(_context: vscode.ExtensionContext): void {
  if (hasWorkspace()) {
    return; // Workspace is available, nothing to do
  }

  // Log information instead of showing warning notifications
  console.log('Comrade: No workspace is currently open. Extension will function with default settings.');
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

/**
 * Initialize workspace defaults by creating minimal required configurations
 * This function sets up the .comrade directory and default files without user intervention
 */
export async function initializeWorkspaceDefaults(workspaceUri?: vscode.Uri): Promise<void> {
  const targetUri = workspaceUri || getWorkspaceUri();
  
  try {
    // Create .comrade directory if it doesn't exist
    const comradeDir = vscode.Uri.joinPath(targetUri, '.comrade');
    try {
      await vscode.workspace.fs.stat(comradeDir);
      console.log('Comrade directory already exists at:', comradeDir.fsPath);
    } catch {
      await vscode.workspace.fs.createDirectory(comradeDir);
      console.log('Created .comrade directory at:', comradeDir.fsPath);
    }

    // Initialize personality manager to create default personality file
    try {
      const { PersonalityManager } = await import('../core/personality');
      const personalityManager = PersonalityManager.getInstance();
      await personalityManager.initialize(targetUri);
    } catch (error) {
      console.warn('Failed to initialize personality manager:', error);
      // Continue with initialization even if personality manager fails
    }

    console.log('Workspace defaults initialized successfully');
  } catch (error) {
    console.warn('Failed to initialize workspace defaults:', error);
    // Don't throw error to prevent blocking extension functionality
  }
}

/**
 * Check if workspace has been initialized with Comrade defaults
 */
export async function isWorkspaceInitialized(workspaceUri?: vscode.Uri): Promise<boolean> {
  const targetUri = workspaceUri || getWorkspaceUri();
  const comradeDir = vscode.Uri.joinPath(targetUri, '.comrade');
  
  try {
    await vscode.workspace.fs.stat(comradeDir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handle workspace initialization with user interaction
 * This function implements the requirements for asking user about initialization
 */
export async function handleWorkspaceInitialization(workspaceUri?: vscode.Uri): Promise<void> {
  const targetUri = workspaceUri || getWorkspaceUri();
  
  // Check if workspace is already initialized
  if (await isWorkspaceInitialized(targetUri)) {
    return; // Already initialized, nothing to do
  }

  // Only show initialization prompt if we have a real workspace (not temp)
  if (hasWorkspace()) {
    // Ask user if they want to initialize Comrade in this folder (Requirement 5.1)
    const initializeChoice = await vscode.window.showInformationMessage(
      'Comrade is not initialized in this workspace. Would you like to initialize it with default settings?',
      { modal: false },
      'Initialize',
      'Not Now'
    );

    if (initializeChoice === 'Initialize') {
      try {
        // Initialize workspace defaults (Requirement 5.2)
        await initializeWorkspaceDefaults(targetUri);
        
        // Initialize configuration defaults
        const { ConfigurationManager } = await import('../core/config');
// Get the secret storage from the extension context
        const secretStorage = vscode.extensions.getExtension('comrade')?.exports?.getSecretStorage?.();
        if (!secretStorage) {
          throw new Error('Failed to access secret storage. Make sure the extension is properly activated.');
        }
        const configManager = ConfigurationManager.getInstance(secretStorage);
        if (configManager) {
          await configManager.initializeDefaultConfiguration();
        }

        // Ask user about customization or starting session (Requirement 5.4)
        const nextChoice = await vscode.window.showInformationMessage(
          'Comrade has been initialized with default settings. What would you like to do next?',
          { modal: false },
          'Customize Settings',
          'Begin Session',
          'Done'
        );

        if (nextChoice === 'Customize Settings') {
          await vscode.commands.executeCommand('workbench.action.openSettings', 'comrade');
        } else if (nextChoice === 'Begin Session') {
          // Focus the sidebar to start a new session (Requirement 5.6)
          await vscode.commands.executeCommand('comrade.sidebar.focus');
        }

        console.log('Workspace initialization completed successfully');
      } catch (error) {
        console.error('Failed to initialize workspace:', error);
        vscode.window.showErrorMessage('Failed to initialize Comrade workspace. Please try again.');
      }
    }
  } else {
    // For temporary workspaces, initialize silently
    await initializeWorkspaceDefaults(targetUri);
    console.log('Initialized Comrade defaults for temporary workspace');
  }
}
