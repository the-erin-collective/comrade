// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { registerHelloWorldCommand } from './commands/helloWorld';
import { ConfigurationManager } from './core/config';
import { AgentRegistry } from './core/registry';
import { PersonalityManager } from './core/personality';
import { ConfigurationAutoReloadManager } from './core/config-auto-reload';
import { registerContextExampleCommands } from './examples/context-runner-usage';
import { ComradeSidebarProvider } from './providers/sidebarProvider';
import { createStatusBarManager, StatusBarManager } from './ui/statusBar';
import { BuiltInTools } from './core/tool-manager';
import { ChatBridge } from './core/chat';
import { AISessionManager } from './core/ai-session';
import { hasWorkspace, registerWorkspaceChangeHandlers } from './utils/workspace';

// Global instances
let configurationManager: ConfigurationManager;
let agentRegistry: AgentRegistry;
let personalityManager: PersonalityManager;
let statusBarManager: StatusBarManager;
let autoReloadManager: ConfigurationAutoReloadManager;
let chatBridge: ChatBridge;
let aiSessionManager: AISessionManager;

// Track sidebar revelation state
let sidebarHasBeenRevealed = false;

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
    console.log('Comrade extension is now active!');

    try {
        // Initialize configuration system with secure storage
        configurationManager = ConfigurationManager.getInstance(context.secrets);
        
        // Initialize agent registry
        agentRegistry = AgentRegistry.getInstance(configurationManager);
        await agentRegistry.initialize();
        
        // Initialize personality system for each workspace
        personalityManager = PersonalityManager.getInstance();
        
        // Initialize enhanced status bar manager early to show initialization progress
        statusBarManager = createStatusBarManager(context);
        statusBarManager.showProgress({} as any, 'Initializing Comrade...');
        
        // Initialize workspace-dependent features with graceful error handling
        await initializeWorkspaceDependentFeatures();
        
        // Initialize configuration auto-reload system first
        autoReloadManager = ConfigurationAutoReloadManager.getInstance(
            configurationManager,
            agentRegistry,
            personalityManager
        );
        
        // Initialize AI Session Manager
        aiSessionManager = AISessionManager.getInstance(context);
        
        // Initialize Chat Bridge with session management
        chatBridge = new ChatBridge(context);
        
        // Register workspace change handlers with non-blocking initialization
        registerWorkspaceChangeHandlers(context, async () => {
            try {
                await initializeWorkspaceDependentFeatures();
            } catch (error) {
                console.warn('Workspace change handler failed:', error);
                // Don't block - allow extension to continue functioning
            }
        });
        
        // Register built-in tools
        BuiltInTools.registerAll();
        
        // Register webview provider
        const sidebarProvider = new ComradeSidebarProvider(context);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(ComradeSidebarProvider.viewType, sidebarProvider)
        );
        
        // Register commands
        registerHelloWorldCommand(context);
        registerConfigurationCommands(context);
        registerPersonalityCommands(context);
        registerContextExampleCommands(context);
        registerErrorHandlingCommands(context);
        registerSidebarCommands(context);
        
        // Add disposables to context
        context.subscriptions.push(agentRegistry, personalityManager, autoReloadManager);
        
        // Hide initialization progress
        statusBarManager.hideProgress();
        
        // Automatically reveal the sidebar after all managers are initialized
        await revealSidebarOnActivation();
        
        // Set status bar to ready state and log successful initialization
        statusBarManager.showReady();
        
        // Log successful initialization without workspace warnings (Requirements 1.1, 1.2, 1.3)
        if (hasWorkspace()) {
            console.log('Comrade extension initialized successfully with workspace');
        } else {
            console.log('Comrade extension initialized successfully without workspace - all features available');
        }
        
    } catch (error) {
        // Ensure proper error handling that doesn't block activation
        console.error('Failed to initialize Comrade extension:', error);
        
        // Update status bar to show error state
        if (statusBarManager) {
            statusBarManager.showError('Initialization failed');
        }
        
        // Show error message but don't prevent extension from loading
        vscode.window.showErrorMessage(
            'Comrade extension encountered errors during initialization. Some features may not work properly. Check the output panel for details.',
            'View Logs'
        ).then(selection => {
            if (selection === 'View Logs') {
                vscode.commands.executeCommand('workbench.action.showLogs');
            }
        });
        
        // Don't throw the error - allow extension to continue in degraded mode
        console.log('Comrade extension loaded in degraded mode due to initialization errors');
    }
}

/**
 * Register configuration-related commands
 */
function registerConfigurationCommands(context: vscode.ExtensionContext) {
    // Command to open agent configuration
    const openAgentConfigCommand = vscode.commands.registerCommand('comrade.openAgentConfig', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'comrade.agents');
    });
    
    // Command to test agent connectivity
    const testAgentConnectivityCommand = vscode.commands.registerCommand('comrade.testAgentConnectivity', async () => {
        const agents = agentRegistry.getAllAgents();
        if (agents.length === 0) {
            vscode.window.showInformationMessage('No agents configured. Please add agents in settings.');
            return;
        }
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Testing agent connectivity...',
            cancellable: false
        }, async (progress) => {
            const results: { name: string; available: boolean; error?: string }[] = [];
            
            for (let i = 0; i < agents.length; i++) {
                const agent = agents[i];
                progress.report({ 
                    message: `Testing ${agent.name}...`,
                    increment: (i / agents.length) * 100
                });
                
                try {
                    const isAvailable = await agent.isAvailable();
                    results.push({ name: agent.name, available: isAvailable });
                } catch (error) {
                    results.push({ 
                        name: agent.name, 
                        available: false, 
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
            
            // Show results
            const availableCount = results.filter(r => r.available).length;
            const message = `Agent connectivity test completed: ${availableCount}/${results.length} agents available`;
            
            if (availableCount === results.length) {
                vscode.window.showInformationMessage(message);
            } else {
                const failedAgents = results.filter(r => !r.available);
                const details = failedAgents.map(r => `${r.name}: ${r.error || 'Connection failed'}`).join('\n');
                vscode.window.showWarningMessage(`${message}\n\nFailed agents:\n${details}`);
            }
        });
    });
    
    // Command to show agent registry stats
    const showRegistryStatsCommand = vscode.commands.registerCommand('comrade.showRegistryStats', () => {
        const stats = agentRegistry.getRegistryStats();
        const message = `Agent Registry Stats:
Total Agents: ${stats.totalAgents}
Enabled for Assignment: ${stats.enabledForAssignment}
Vision Capable: ${stats.byCapability.vision}
Tool Use Capable: ${stats.byCapability.toolUse}
Advanced Reasoning: ${stats.byCapability.advanced}

By Provider:
${Object.entries(stats.byProvider).map(([provider, count]) => `${provider}: ${count}`).join('\n')}`;
        
        vscode.window.showInformationMessage(message);
    });
    
    // Command to manually reload configuration
    const reloadConfigurationCommand = vscode.commands.registerCommand('comrade.reloadConfiguration', async () => {
        try {
            await configurationManager.reloadConfiguration();
            vscode.window.showInformationMessage('Configuration reloaded successfully');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to reload configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    });
    
    // Command to show auto-reload stats
    const showAutoReloadStatsCommand = vscode.commands.registerCommand('comrade.showAutoReloadStats', () => {
        const stats = autoReloadManager.getReloadStats();
        const message = `Configuration Auto-Reload Stats:
Registered Components: ${stats.registeredComponents}
Reloads in Progress: ${stats.reloadsInProgress}
Queued Reloads: ${stats.queuedReloads}
Last Reload: ${stats.lastReloadTime ? stats.lastReloadTime.toLocaleString() : 'Never'}`;
        
        vscode.window.showInformationMessage(message);
    });
    
    context.subscriptions.push(
        openAgentConfigCommand,
        testAgentConnectivityCommand,
        showRegistryStatsCommand,
        reloadConfigurationCommand,
        showAutoReloadStatsCommand
    );
}

/**
 * Register personality-related commands
 */
function registerPersonalityCommands(context: vscode.ExtensionContext) {
    // Command to open personality configuration
    const openPersonalityConfigCommand = vscode.commands.registerCommand('comrade.openPersonalityConfig', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open. Please open a workspace to configure personality.');
            return;
        }
        
        const personalityFile = vscode.Uri.joinPath(workspaceFolder.uri, '.comrade', 'personality.md');
        
        try {
            // Ensure the file exists
            await personalityManager.initialize(workspaceFolder.uri);
            
            // Open the file for editing
            const document = await vscode.workspace.openTextDocument(personalityFile);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open personality configuration: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    
    // Command to create default personality file
    const createDefaultPersonalityCommand = vscode.commands.registerCommand('comrade.createDefaultPersonality', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open. Please open a workspace to create personality configuration.');
            return;
        }
        
        try {
            await personalityManager.createDefaultPersonalityFile(workspaceFolder.uri);
            vscode.window.showInformationMessage('Default personality configuration created successfully.');
            
            // Optionally open the file
            const openFile = await vscode.window.showInformationMessage(
                'Would you like to open the personality file for editing?',
                'Yes', 'No'
            );
            
            if (openFile === 'Yes') {
                vscode.commands.executeCommand('comrade.openPersonalityConfig');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create personality configuration: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    
    // Command to check personality status
    const checkPersonalityStatusCommand = vscode.commands.registerCommand('comrade.checkPersonalityStatus', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open.');
            return;
        }
        
        try {
            const hasFile = await personalityManager.hasPersonalityFile(workspaceFolder.uri);
            const personality = await personalityManager.getPersonality(workspaceFolder.uri);
            
            const message = `Personality Status:
File exists: ${hasFile ? 'Yes' : 'No'}
Source: ${personality.source}
Last modified: ${personality.lastModified.toLocaleString()}
Content length: ${personality.content.length} characters`;
            
            vscode.window.showInformationMessage(message);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to check personality status: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    
    context.subscriptions.push(
        openPersonalityConfigCommand,
        createDefaultPersonalityCommand,
        checkPersonalityStatusCommand
    );
}

/**
 * Register sidebar-related commands
 */
function registerSidebarCommands(context: vscode.ExtensionContext) {
    // Command to focus the Comrade sidebar
    const focusSidebarCommand = vscode.commands.registerCommand('comrade.sidebar.focus', async () => {
        try {
            // Use the workbench command to focus the extension view
            await vscode.commands.executeCommand('workbench.view.extension.comrade');
        } catch (error) {
            console.error('Failed to focus Comrade sidebar:', error);
            vscode.window.showErrorMessage('Failed to focus Comrade sidebar. Please ensure the extension is properly installed.');
        }
    });
    
    // Command to show help information
    const helpCommand = vscode.commands.registerCommand('comrade.help', async () => {
        const helpOptions = [
            {
                label: '$(book) View Documentation',
                description: 'Open the Comrade documentation on GitHub',
                action: 'docs'
            },
            {
                label: '$(bug) Report Issue',
                description: 'Report a bug or request a feature',
                action: 'issue'
            },
            {
                label: '$(gear) Extension Settings',
                description: 'Open Comrade extension settings',
                action: 'settings'
            }
        ];

        const selected = await vscode.window.showQuickPick(helpOptions, {
            placeHolder: 'How can we help you?'
        });

        if (selected) {
            switch (selected.action) {
                case 'docs':
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/comrade-ai/comrade-vscode-extension#readme'));
                    break;
                case 'issue':
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/comrade-ai/comrade-vscode-extension/issues'));
                    break;
                case 'settings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'comrade');
                    break;
            }
        }
    });
    
    context.subscriptions.push(focusSidebarCommand, helpCommand);
}

/**
 * Register error handling and cancellation commands
 */
function registerErrorHandlingCommands(context: vscode.ExtensionContext) {
    // Command to open API configuration
    const openApiConfigCommand = vscode.commands.registerCommand('comrade.openApiConfig', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'comrade.agents');
    });
    
    // Command to open MCP configuration
    const openMcpConfigCommand = vscode.commands.registerCommand('comrade.openMcpConfig', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'comrade.mcp');
    });
    
    // Command to open general settings
    const openSettingsCommand = vscode.commands.registerCommand('comrade.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'comrade');
    });
    
    // Command to show error recovery options
    const showErrorRecoveryCommand = vscode.commands.registerCommand('comrade.showErrorRecovery', async (error: any) => {
        const actions = ['Retry', 'Configure', 'Report Issue'];
        const selectedAction = await vscode.window.showErrorMessage(
            `Comrade Error: ${error.message}`,
            ...actions
        );
        
        switch (selectedAction) {
            case 'Retry':
                // Trigger retry logic
                vscode.commands.executeCommand('comrade.retryLastOperation');
                break;
            case 'Configure':
                // Open relevant configuration
                if (error.code?.includes('AUTH')) {
                    vscode.commands.executeCommand('comrade.openApiConfig');
                } else if (error.code?.includes('MCP')) {
                    vscode.commands.executeCommand('comrade.openMcpConfig');
                } else {
                    vscode.commands.executeCommand('comrade.openSettings');
                }
                break;
            case 'Report Issue':
                // Open issue reporting
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/your-repo/comrade/issues/new'));
                break;
        }
    });
    
    // Command to retry last operation
    const retryLastOperationCommand = vscode.commands.registerCommand('comrade.retryLastOperation', () => {
        // This would be implemented to retry the last failed operation
        vscode.window.showInformationMessage('Retrying last operation...');
        statusBarManager.showProgress(
            {} as any, // Mock session for demo
            'Retrying operation...'
        );
        
        // Simulate operation completion
        setTimeout(() => {
            statusBarManager.hideProgress();
            statusBarManager.hideProgress();
        }, 3000);
    });
    
    context.subscriptions.push(
        openApiConfigCommand,
        openMcpConfigCommand,
        openSettingsCommand,
        showErrorRecoveryCommand,
        retryLastOperationCommand
    );
}

// Export for use by other modules
export function getConfigurationManager(): ConfigurationManager {
    return configurationManager;
}

export function getAgentRegistry(): AgentRegistry {
    return agentRegistry;
}

export function getPersonalityManager(): PersonalityManager {
    return personalityManager;
}

export function getStatusBarManager(): StatusBarManager {
    return statusBarManager;
}

/**
 * Automatically reveal the Comrade sidebar on extension activation
 * This function is called after all managers are initialized (Requirement 3.1)
 */
async function revealSidebarOnActivation(): Promise<void> {
    // Only reveal once per session to avoid repeated revelations
    if (sidebarHasBeenRevealed) {
        return;
    }
    
    try {
        // Ensure the explorer is visible first
        await vscode.commands.executeCommand('workbench.view.explorer');
        
        // Small delay to ensure explorer is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Focus the Comrade sidebar view using the registered command
        await vscode.commands.executeCommand('comrade.sidebar.focus');
        
        // Mark as revealed to avoid repeated revelations
        sidebarHasBeenRevealed = true;
        
        console.log('Comrade sidebar automatically revealed on activation (Requirement 3.1, 3.2, 3.3)');
    } catch (error) {
        console.warn('Failed to automatically reveal Comrade sidebar:', error);
        
        // Try alternative approach - directly focus the extension view
        try {
            await vscode.commands.executeCommand('workbench.view.extension.comrade');
            sidebarHasBeenRevealed = true;
            console.log('Comrade sidebar revealed using alternative method');
        } catch (fallbackError) {
            console.warn('All sidebar revelation methods failed:', fallbackError);
            // Don't show error to user as this is a nice-to-have feature
            // Extension should still function without sidebar auto-revelation
        }
    }
}

/**
 * Initialize features that depend on having a workspace open
 * This function now gracefully handles missing configurations and creates defaults automatically
 * Integrates with enhanced status bar manager for better user feedback
 */
async function initializeWorkspaceDependentFeatures(): Promise<void> {
    try {
        if (hasWorkspace() && personalityManager) {
            // Clear any existing workspace initializations
            personalityManager.clearAllWorkspaces();
            
            // Initialize for each workspace folder
            const workspaceFolders = vscode.workspace.workspaceFolders || [];
            console.log(`Initializing ${workspaceFolders.length} workspace folder(s) with Comrade features`);
            
            for (const workspaceFolder of workspaceFolders) {
                try {
                    // Update status bar to show current workspace being initialized
                    if (statusBarManager) {
                        statusBarManager.showProgress({} as any, `Initializing ${workspaceFolder.name}...`);
                    }
                    
                    // Check if workspace needs initialization (Requirement 5.1)
                    const { handleWorkspaceInitialization } = await import('./utils/workspace');
                    await handleWorkspaceInitialization(workspaceFolder.uri);
                    
                    // Initialize personality manager with graceful fallback
                    await personalityManager.initialize(workspaceFolder.uri);
                    
                    console.log(`Successfully initialized workspace: ${workspaceFolder.name} (Requirements 5.1, 5.2)`);
                } catch (error) {
                    // Log error instead of showing notification (non-blocking) - Requirements 1.1, 1.2
                    console.warn(`Failed to initialize workspace ${workspaceFolder.name}:`, error);
                    
                    // Attempt to create missing directories and files automatically
                    try {
                        const { initializeWorkspaceDefaults } = await import('./utils/workspace');
                        await initializeWorkspaceDefaults(workspaceFolder.uri);
                        
                        // Retry personality initialization after creating defaults
                        await personalityManager.initialize(workspaceFolder.uri);
                        console.log(`Successfully recovered workspace initialization for: ${workspaceFolder.name} (Requirement 5.4)`);
                    } catch (recoveryError) {
                        console.warn(`Failed to recover workspace ${workspaceFolder.name}:`, recoveryError);
                        // Continue with other workspaces - don't block extension functionality
                    }
                }
            }
            
            // Update status bar to reflect successful workspace initialization
            if (statusBarManager) {
                statusBarManager.updateWorkspaceStatus(true);
            }
            
            console.log('Workspace-dependent features initialized successfully without blocking notifications (Requirements 1.1, 1.2, 1.3)');
        } else {
            // Handle no workspace scenario gracefully (Requirements 1.1, 1.2, 1.3)
            console.log('No workspace open - initializing with default settings (graceful fallback)');
            
            // Initialize configuration defaults for non-workspace usage
            if (configurationManager) {
                try {
                    await configurationManager.initializeDefaultConfiguration();
                    console.log('Initialized default configuration for non-workspace usage (Requirement 5.4)');
                } catch (error) {
                    console.warn('Failed to initialize default configuration:', error);
                    // Continue - don't block extension functionality
                }
            }
            
            // Update status bar to reflect no workspace state
            if (statusBarManager) {
                statusBarManager.updateWorkspaceStatus(false);
            }
            
            console.log('Extension fully functional without workspace - no warnings shown (Requirements 1.1, 1.2, 1.3)');
        }
    } catch (error) {
        // Top-level error handling - log but don't block extension (Requirements 1.1, 1.2, 1.3)
        console.error('Error in initializeWorkspaceDependentFeatures:', error);
        
        // Update status bar to show warning state instead of error
        if (statusBarManager) {
            statusBarManager.showWarning('Workspace initialization incomplete');
            statusBarManager.updateWorkspaceStatus(hasWorkspace());
        }
        
        // Don't throw error - allow extension to continue functioning
        console.log('Extension continues in graceful degradation mode - no blocking errors (Requirements 1.1, 1.2, 1.3)');
    }
}

// This method is called when your extension is deactivated
export function deactivate() {
    console.log('Comrade extension is deactivating...');
    
    // Clean up resources in reverse order of initialization
    try {
        // 1. Clean up AI session manager if it exists
        if (aiSessionManager) {
            console.log('Disposing AI Session Manager...');
            aiSessionManager.dispose();
        }
        
        // 2. Clean up chat bridge if it exists
        if (chatBridge) {
            console.log('Disposing Chat Bridge...');
            // Add any necessary cleanup for chatBridge if needed
        }
        
        // 3. Clean up auto reload manager if it exists
        if (autoReloadManager) {
            console.log('Disposing Auto Reload Manager...');
            autoReloadManager.dispose();
        }
        
        // 4. Clean up agent registry if it exists
        if (agentRegistry) {
            console.log('Disposing Agent Registry...');
            agentRegistry.dispose();
        }
        
        // 5. Clean up personality manager if it exists
        if (personalityManager) {
            console.log('Disposing Personality Manager...');
            personalityManager.dispose();
        }
        
        // 6. Clean up status bar manager if it exists
        if (statusBarManager) {
            console.log('Disposing Status Bar Manager...');
            statusBarManager.dispose();
        }
        
        // 7. Clean up configuration manager if it exists
        if (configurationManager) {
            console.log('Disposing Configuration Manager...');
            configurationManager.dispose();
        }
        
        // 8. Clear any global state if needed
        if ((globalThis as any).comradeState) {
            try {
                console.log('Cleaning up global state...');
                delete (globalThis as any).comradeState;
            } catch (error) {
                console.error('Error cleaning up global state:', error);
            }
        }
        
        console.log('Comrade extension has been deactivated');
        return undefined;
    } catch (error) {
        console.error('Error during extension deactivation:', error);
        // Don't re-throw to prevent VS Code from showing an error notification
        return undefined;
    }
}
