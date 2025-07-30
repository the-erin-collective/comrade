// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { registerHelloWorldCommand } from './commands/helloWorld';
import { ConfigurationManager } from './core/config';
import { AgentRegistry } from './core/registry';

// Global instances
let configurationManager: ConfigurationManager;
let agentRegistry: AgentRegistry;

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
    console.log('Comrade extension is now active!');

    try {
        // Initialize configuration system with secure storage
        configurationManager = ConfigurationManager.getInstance(context.secrets);
        
        // Initialize agent registry
        agentRegistry = AgentRegistry.getInstance(configurationManager);
        await agentRegistry.initialize();
        
        // Register commands
        registerHelloWorldCommand(context);
        registerConfigurationCommands(context);
        
        // Add disposables to context
        context.subscriptions.push(agentRegistry);
        
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

// Export for use by other modules
export function getConfigurationManager(): ConfigurationManager {
    return configurationManager;
}

export function getAgentRegistry(): AgentRegistry {
    return agentRegistry;
}

// This method is called when your extension is deactivated
export function deactivate() {
    if (agentRegistry) {
        agentRegistry.dispose();
    }
}
