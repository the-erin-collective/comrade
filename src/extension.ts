// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { registerHelloWorldCommand } from './commands/helloWorld';
import { ConfigurationManager } from './core/config';
import { AgentRegistry } from './core/registry';
import { PersonalityManager } from './core/personality';
import { registerContextExampleCommands } from './examples/context-runner-usage';
import { ComradeSidebarProvider } from './providers/sidebarProvider';
import { createStatusBarManager, StatusBarManager } from './ui/statusBar';
import { BuiltInTools } from './core/tool-manager';

// Global instances
let configurationManager: ConfigurationManager;
let agentRegistry: AgentRegistry;
let personalityManager: PersonalityManager;
let statusBarManager: StatusBarManager;

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
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            for (const workspaceFolder of vscode.workspace.workspaceFolders) {
                await personalityManager.initialize(workspaceFolder.uri);
            }
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
        context.subscriptions.push(agentRegistry, personalityManager);
        
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
    
    context.subscriptions.push(
        openAgentConfigCommand,
        testAgentConnectivityCommand,
        showRegistryStatsCommand
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

// This method is called when your extension is deactivated
export function deactivate() {
    if (agentRegistry) {
        agentRegistry.dispose();
    }
    if (personalityManager) {
        personalityManager.dispose();
    }
}
