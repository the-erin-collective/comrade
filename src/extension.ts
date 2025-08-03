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
import { hasWorkspace, handleNoWorkspace, registerWorkspaceChangeHandlers } from './utils/workspace';

// Global instances
let configurationManager: ConfigurationManager;
let agentRegistry: AgentRegistry;
let personalityManager: PersonalityManager;
let statusBarManager: StatusBarManager;
let autoReloadManager: ConfigurationAutoReloadManager;

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
        await initializeWorkspaceDependentFeatures();
        
        // Initialize configuration auto-reload system
        autoReloadManager = ConfigurationAutoReloadManager.getInstance(
            configurationManager,
            agentRegistry,
            personalityManager
        );
        
        // Register workspace change handlers
        registerWorkspaceChangeHandlers(context, async () => {
            await initializeWorkspaceDependentFeatures();
        });
        
        // Handle case where no workspace is open
        if (!hasWorkspace()) {
            handleNoWorkspace(context);
        }
        
        // Initialize status bar manager
        statusBarManager = createStatusBarManager(context);
        
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
        
        // Add disposables to context
        context.subscriptions.push(agentRegistry, personalityManager, autoReloadManager);
        
        console.log('Comrade extension initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Comrade extension:', error);
        vscode.window.showErrorMessage('Failed to initialize Comrade extension. Please check the logs.');
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
 * Initialize features that depend on having a workspace open
 */
async function initializeWorkspaceDependentFeatures(): Promise<void> {
    if (hasWorkspace() && personalityManager) {
        // Clear any existing workspace initializations
        personalityManager.clearAllWorkspaces();
        
        // Initialize for each workspace folder
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        for (const workspaceFolder of workspaceFolders) {
            try {
                await personalityManager.initialize(workspaceFolder.uri);
            } catch (error) {
                console.error(`Failed to initialize workspace ${workspaceFolder.name}:`, error);
                vscode.window.showErrorMessage(
                    `Failed to initialize workspace '${workspaceFolder.name}': ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
        
        // Update status bar
        if (statusBarManager) {
            statusBarManager.updateWorkspaceStatus(true);
        }
    } else if (statusBarManager) {
        statusBarManager.updateWorkspaceStatus(false);
    }
}

// This method is called when your extension is deactivated
export function deactivate(): Thenable<void> | undefined {
    const disposables: { dispose(): any }[] = [];
    const cleanupPromises: Promise<void>[] = [];
    
    try {
        // Log deactivation
        console.log('Comrade extension is deactivating...');
        
        // VS Code automatically disposes context subscriptions

        // 2. Clean up managers in reverse order of initialization
        const managers = [
            { name: 'StatusBarManager', instance: statusBarManager },
            { name: 'ConfigurationAutoReloadManager', instance: autoReloadManager },
            { name: 'PersonalityManager', instance: personalityManager },
            { name: 'AgentRegistry', instance: agentRegistry },
            { name: 'ConfigurationManager', instance: configurationManager }
        ];

        for (const { name, instance } of managers) {
            if (instance) {
                try {
                    if (typeof instance.dispose === 'function') {
                        console.log(`Disposing ${name}...`);
                        instance.dispose();
                    }
                } catch (error) {
                    console.error(`Error disposing ${name}:`, error);
                }
            }
        }

        // 3. Clear any global state if needed
        if ((globalThis as any).comradeState) {
            try {
                delete (globalThis as any).comradeState;
            } catch (error) {
                console.error('Error cleaning up global state:', error);
            }
        }

        console.log('Comrade extension has been deactivated');
        
    } catch (error) {
        console.error('Error during extension deactivation:', error);
        // Re-throw to ensure VS Code is aware of the error
        throw error;
    } finally {
        // Ensure we clean up even if an error occurred
        for (const disposable of disposables) {
            try {
                disposable.dispose();
            } catch (error) {
                console.error('Error during final cleanup:', error);
            }
        }
        
        // Wait for any pending cleanup promises
        if (cleanupPromises.length > 0) {
            return Promise.all(cleanupPromises)
                .then(() => {})
                .catch(error => {
                    console.error('Error during async cleanup:', error);
                });
        }
    }
}
