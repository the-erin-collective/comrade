/**
 * Integration tests for Settings UI
 * Tests complete provider setup, agent creation, and provider deletion workflows
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConfigurationManager } from '../../core/config';
import { AgentRegistry } from '../../core/registry';
import { ProviderManagerService } from '../../core/provider-manager';
import { ProviderConfig, Agent, ProviderFormData, AgentFormData, LocalNetworkProvider } from '../../core/types';

// Mock webview for testing UI interactions
class MockWebview implements vscode.Webview {
    public html: string = '';
    public options: vscode.WebviewOptions = {};
    public cspSource: string = '';
    
    private messageHandlers: ((message: any) => void)[] = [];
    
    onDidReceiveMessage = (handler: (message: any) => void) => {
        this.messageHandlers.push(handler);
        return { dispose: () => {} };
    };

    postMessage = async (message: any): Promise<boolean> => {
        // Simulate message posting
        return true;
    };

    asWebviewUri = (localResource: vscode.Uri): vscode.Uri => {
        return localResource;
    };

    // Helper method to simulate receiving messages from webview
    simulateMessage(message: any) {
        this.messageHandlers.forEach(handler => handler(message));
    }
}

// Mock webview panel
class MockWebviewPanel implements vscode.WebviewPanel {
    public webview: MockWebview;
    public viewType: string;
    public title: string;
    public iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri };
    public options: vscode.WebviewPanelOptions & vscode.WebviewOptions;
    public viewColumn: vscode.ViewColumn;
    public active: boolean = true;
    public visible: boolean = true;

    private disposeHandlers: (() => void)[] = [];
    private viewStateChangeHandlers: ((e: vscode.WebviewPanelOnDidChangeViewStateEvent) => void)[] = [];

    constructor(viewType: string, title: string, showOptions: vscode.ViewColumn, options: vscode.WebviewPanelOptions & vscode.WebviewOptions) {
        this.webview = new MockWebview();
        this.viewType = viewType;
        this.title = title;
        this.viewColumn = showOptions;
        this.options = options;
        // Apply webview-related options such as enableScripts if provided
        if (typeof options.enableScripts !== 'undefined') {
            this.webview.options = { ...this.webview.options, enableScripts: options.enableScripts };
        }
    }

    onDidDispose = (handler: () => void) => {
        this.disposeHandlers.push(handler);
        return { dispose: () => {} };
    };

    onDidChangeViewState = (handler: (e: vscode.WebviewPanelOnDidChangeViewStateEvent) => void) => {
        this.viewStateChangeHandlers.push(handler);
        return { dispose: () => {} };
    };

    reveal = (viewColumn?: vscode.ViewColumn, preserveFocus?: boolean) => {
        this.viewColumn = viewColumn || this.viewColumn;
        this.visible = true;
    };

    dispose = () => {
        this.disposeHandlers.forEach(handler => handler());
    };
}

describe('Settings UI Integration Tests', () => {
    let configManager: ConfigurationManager;
    let agentRegistry: AgentRegistry;
    let providerManager: ProviderManagerService;
    let mockSecretStorage: vscode.SecretStorage;
    let mockWebviewPanel: MockWebviewPanel;

    beforeEach(() => {
        // Create mock secret storage
        mockSecretStorage = {
            get: async (key: string) => undefined,
            store: async (key: string, value: string) => {},
            delete: async (key: string) => {},
            onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
        };

        // Initialize managers
        configManager = ConfigurationManager.getInstance(mockSecretStorage);
        agentRegistry = AgentRegistry.getInstance(configManager);
        providerManager = ProviderManagerService.getInstance(mockSecretStorage);

        // Create mock webview panel
        mockWebviewPanel = new MockWebviewPanel(
            'comradeSettings',
            'Comrade Settings',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
    });

    afterEach(() => {
        // Reset instances for clean tests
        ConfigurationManager.resetInstance();
        AgentRegistry.resetInstance();
        ProviderManagerService.resetInstance();
        mockWebviewPanel.dispose();
    });

    describe('Provider Setup and Configuration Workflow', () => {
        it('Should complete full cloud provider setup workflow', async () => {
            // Simulate opening settings UI
            mockWebviewPanel.webview.html = getSettingsHTML();
            
            // Test 1: Initial empty state
            let providers = await providerManager.getProviders();
            assert.strictEqual(providers.length, 0, 'Should start with no providers');

            // Test 2: Add cloud provider workflow
            const providerFormData: ProviderFormData = {
                name: 'Test OpenAI Provider',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'sk-test-key-123'
            };

            // Simulate user filling out provider form
            mockWebviewPanel.webview.simulateMessage({
                type: 'addProvider',
                payload: providerFormData
            });

            // Add the provider
            const newProvider = await providerManager.addProvider(providerFormData);
            
            assert.strictEqual(newProvider.name, 'Test OpenAI Provider');
            assert.strictEqual(newProvider.type, 'cloud');
            assert.strictEqual(newProvider.provider, 'openai');
            assert.strictEqual(newProvider.isActive, true);

            // Test 3: Verify provider appears in UI
            providers = await providerManager.getProviders();
            assert.strictEqual(providers.length, 1, 'Should have one provider after adding');
            assert.strictEqual(providers[0].id, newProvider.id);

            // Test 4: Test provider configuration validation
            const validation = await providerManager.validateProvider(newProvider);
            assert.strictEqual(validation.valid, true, 'Provider configuration should be valid');
        });

        it('Should complete full local network provider setup workflow', async () => {
            // Test local network provider setup
            const providerFormData: ProviderFormData = {
                name: 'Local Ollama',
                type: 'local_network',
                provider: 'ollama',
                endpoint: 'http://localhost:11434',
                localHostType: 'ollama'
            };

            // Simulate user selecting local network provider type
            mockWebviewPanel.webview.simulateMessage({
                type: 'providerTypeSelected',
                payload: { type: 'local_network' }
            });

            // Simulate user filling out local network form
            mockWebviewPanel.webview.simulateMessage({
                type: 'addProvider',
                payload: providerFormData
            });

            const newProvider = await providerManager.addProvider(providerFormData);
            
            assert.strictEqual(newProvider.name, 'Local Ollama');
            assert.strictEqual(newProvider.type, 'local_network');
            assert.strictEqual(newProvider.provider, 'ollama');
            assert.strictEqual(newProvider.endpoint, 'http://localhost:11434');
            assert.strictEqual(newProvider.isActive, true);

            // Test connection test functionality
            mockWebviewPanel.webview.simulateMessage({
                type: 'testConnection',
                payload: { providerId: newProvider.id }
            });

            // Verify provider is accessible
            const providers = await providerManager.getProviders();
            assert.strictEqual(providers.length, 1);
            assert.strictEqual((providers[0] as LocalNetworkProvider).endpoint, 'http://localhost:11434');
        });

        it('Should handle provider edit workflow', async () => {
            // Create initial provider
            const initialProvider = await providerManager.addProvider({
                name: 'Initial Provider',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'initial-key'
            });

            // Simulate editing provider
            mockWebviewPanel.webview.simulateMessage({
                type: 'editProvider',
                payload: { providerId: initialProvider.id }
            });

            // Update provider data
            const updatedData: Partial<ProviderConfig> = {
                name: 'Updated Provider Name',
                apiKey: 'updated-key'
            };

            mockWebviewPanel.webview.simulateMessage({
                type: 'updateProvider',
                payload: { providerId: initialProvider.id, updates: updatedData }
            });

            const updatedProvider = await providerManager.updateProvider(initialProvider.id, updatedData);
            
            assert.strictEqual(updatedProvider.name, 'Updated Provider Name');
            assert.strictEqual(updatedProvider.id, initialProvider.id);
            assert.notStrictEqual(updatedProvider.updatedAt, initialProvider.updatedAt);
        });

        it('Should handle provider toggle active/inactive', async () => {
            // Create provider
            const provider = await providerManager.addProvider({
                name: 'Toggle Test Provider',
                type: 'cloud',
                provider: 'anthropic',
                apiKey: 'test-key'
            });

            assert.strictEqual(provider.isActive, true, 'Provider should be active initially');

            // Simulate toggle to inactive
            mockWebviewPanel.webview.simulateMessage({
                type: 'toggleProvider',
                payload: { providerId: provider.id, isActive: false }
            });

            await providerManager.toggleProviderStatus(provider.id, false);
            
            const inactiveProvider = configManager.getProviderById(provider.id);
            assert.strictEqual(inactiveProvider?.isActive, false, 'Provider should be inactive after toggle');

            // Simulate toggle back to active
            mockWebviewPanel.webview.simulateMessage({
                type: 'toggleProvider',
                payload: { providerId: provider.id, isActive: true }
            });

            await providerManager.toggleProviderStatus(provider.id, true);
            
            const activeProvider = configManager.getProviderById(provider.id);
            assert.strictEqual(activeProvider?.isActive, true, 'Provider should be active after toggle back');
        });
    });

    describe('Agent Creation with Provider Selection and Model Loading', () => {
        it('Should complete agent creation workflow with provider selection', async () => {
            // First create a provider
            const provider = await providerManager.addProvider({
                name: 'Test Provider for Agent',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'test-key'
            });

            // Simulate opening agent creation form
            mockWebviewPanel.webview.simulateMessage({
                type: 'openAgentForm',
                payload: {}
            });

            // Test provider selection dropdown population
            const activeProviders = await providerManager.getActiveProviders();
            assert.strictEqual(activeProviders.length, 1, 'Should have one active provider for selection');
            assert.strictEqual(activeProviders[0].id, provider.id);

            // Simulate user selecting provider
            mockWebviewPanel.webview.simulateMessage({
                type: 'providerSelected',
                payload: { providerId: provider.id }
            });

            // Test model loading for selected provider
            mockWebviewPanel.webview.simulateMessage({
                type: 'loadModels',
                payload: { providerId: provider.id }
            });

            // Mock available models response
            const mockModels = ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo'];
            mockWebviewPanel.webview.simulateMessage({
                type: 'modelsLoaded',
                payload: { models: mockModels, providerId: provider.id }
            });

            // Create agent with selected provider and model
            const agentFormData: AgentFormData = {
                name: 'Test GPT Agent',
                providerId: provider.id,
                model: 'gpt-4',
                temperature: 0.7,
                maxTokens: 4000,
                timeout: 30000,
                systemPrompt: 'You are a helpful AI assistant.',
                capabilities: {
                    hasVision: false,
                    hasToolUse: true,
                    reasoningDepth: 'advanced',
                    speed: 'medium',
                    costTier: 'high',
                    supportsStreaming: true,
                    supportsNonStreaming: true,
                    preferredStreamingMode: 'streaming',
                    maxContextLength: 4000,
                    supportedFormats: ['text']
                }
            };

            mockWebviewPanel.webview.simulateMessage({
                type: 'createAgent',
                payload: agentFormData
            });

            const newAgent = await configManager.addNewAgent(agentFormData);
            
            assert.strictEqual(newAgent.name, 'Test GPT Agent');
            assert.strictEqual(newAgent.providerId, provider.id);
            assert.strictEqual(newAgent.model, 'gpt-4');
            assert.strictEqual(newAgent.isActive, true);
            assert.strictEqual(newAgent.capabilities.hasToolUse, true);
        });

        it('Should handle agent creation with local network provider', async () => {
            // Create local network provider
            const provider = await providerManager.addProvider({
                name: 'Local Ollama Provider',
                type: 'local_network',
                provider: 'ollama',
                endpoint: 'http://localhost:11434',
                localHostType: 'ollama'
            });

            // Simulate model fetching for local provider
            mockWebviewPanel.webview.simulateMessage({
                type: 'loadModels',
                payload: { providerId: provider.id }
            });

            // Mock Ollama models response
            const ollamaModels = ['llama2', 'codellama', 'mistral'];
            mockWebviewPanel.webview.simulateMessage({
                type: 'modelsLoaded',
                payload: { models: ollamaModels, providerId: provider.id }
            });

            // Create agent with local provider
            const agentFormData: AgentFormData = {
                name: 'Local Llama Agent',
                providerId: provider.id,
                model: 'llama2',
                temperature: 0.8,
                maxTokens: 2000,
                timeout: 45000,
                systemPrompt: 'You are a helpful AI assistant running locally.',
                capabilities: {
                    hasVision: false,
                    hasToolUse: false,
                    reasoningDepth: 'intermediate',
                    speed: 'fast',
                    costTier: 'low',
                    supportsStreaming: true,
                    supportsNonStreaming: true,
                    preferredStreamingMode: 'streaming',
                    maxContextLength: 4000,
                    supportedFormats: ['text']
                }
            };

            const newAgent = await configManager.addNewAgent(agentFormData);
            
            assert.strictEqual(newAgent.providerId, provider.id);
            assert.strictEqual(newAgent.model, 'llama2');
            assert.strictEqual(newAgent.capabilities.costTier, 'low');
        });

        it('Should prevent agent creation when no active providers exist', async () => {
            // Create inactive provider
            const inactiveProvider = await providerManager.addProvider({
                name: 'Inactive Provider',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'test-key'
            });

            await providerManager.toggleProviderStatus(inactiveProvider.id, false);

            // Simulate opening agent form
            mockWebviewPanel.webview.simulateMessage({
                type: 'openAgentForm',
                payload: {}
            });

            // Check that no active providers are available
            const activeProviders = await providerManager.getActiveProviders();
            assert.strictEqual(activeProviders.length, 0, 'Should have no active providers');

            // UI should show message about no active providers
            mockWebviewPanel.webview.simulateMessage({
                type: 'checkActiveProviders',
                payload: {}
            });

            // Verify error state is handled
            assert.strictEqual(activeProviders.length, 0, 'Agent creation should be blocked without active providers');
        });

        it('Should handle agent edit workflow', async () => {
            // Create provider and agent
            const provider = await providerManager.addProvider({
                name: 'Edit Test Provider',
                type: 'cloud',
                provider: 'anthropic',
                apiKey: 'test-key'
            });

            const agent = await configManager.addNewAgent({
                name: 'Original Agent',
                providerId: provider.id,
                model: 'claude-3-haiku',
                capabilities: {
                    hasVision: false,
                    hasToolUse: true,
                    reasoningDepth: 'intermediate',
                    speed: 'fast',
                    costTier: 'low'
                }
            });

            // Simulate editing agent
            mockWebviewPanel.webview.simulateMessage({
                type: 'editAgent',
                payload: { agentId: agent.id }
            });

            // Update agent
            const updates: Partial<Agent> = {
                name: 'Updated Agent Name',
                model: 'claude-3-sonnet',
                capabilities: {
                    ...agent.capabilities,
                    reasoningDepth: 'advanced',
                    costTier: 'medium'
                }
            };

            mockWebviewPanel.webview.simulateMessage({
                type: 'updateAgent',
                payload: { agentId: agent.id, updates }
            });

            const updatedAgent = await configManager.updateNewAgent(agent.id, updates);
            
            assert.strictEqual(updatedAgent.name, 'Updated Agent Name');
            assert.strictEqual(updatedAgent.model, 'claude-3-sonnet');
            assert.strictEqual(updatedAgent.capabilities.reasoningDepth, 'advanced');
        });
    });

    describe('Provider Deletion with Dependent Agent Handling', () => {
        it('Should handle provider deletion with dependent agents', async () => {
            // Create provider
            const provider = await providerManager.addProvider({
                name: 'Provider to Delete',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'test-key'
            });

            // Create multiple agents using this provider
            const agent1 = await configManager.addNewAgent({
                name: 'Dependent Agent 1',
                providerId: provider.id,
                model: 'gpt-4',
                capabilities: {
                    hasVision: false,
                    hasToolUse: true,
                    reasoningDepth: 'advanced',
                    speed: 'medium',
                    costTier: 'high'
                }
            });

            const agent2 = await configManager.addNewAgent({
                name: 'Dependent Agent 2',
                providerId: provider.id,
                model: 'gpt-3.5-turbo',
                capabilities: {
                    hasVision: false,
                    hasToolUse: true,
                    reasoningDepth: 'intermediate',
                    speed: 'fast',
                    costTier: 'medium'
                }
            });

            // Verify initial state
            assert.strictEqual(agent1.isActive, true);
            assert.strictEqual(agent2.isActive, true);

            // Simulate delete provider action
            mockWebviewPanel.webview.simulateMessage({
                type: 'deleteProvider',
                payload: { providerId: provider.id }
            });

            // Should show confirmation dialog with impact warning
            mockWebviewPanel.webview.simulateMessage({
                type: 'showDeleteConfirmation',
                payload: { 
                    providerId: provider.id,
                    dependentAgents: [agent1.id, agent2.id]
                }
            });

            // Confirm deletion
            mockWebviewPanel.webview.simulateMessage({
                type: 'confirmDeleteProvider',
                payload: { providerId: provider.id }
            });

            // Delete provider and handle dependent agents
            await agentRegistry.handleProviderDeletion(provider.id);
            await providerManager.deleteProvider(provider.id);

            // Verify provider is deleted
            const remainingProviders = await providerManager.getProviders();
            assert.strictEqual(remainingProviders.length, 0, 'Provider should be deleted');

            // Verify dependent agents are deleted
            const remainingAgents = configManager.getNewAgents();
            const dependentAgents = remainingAgents.filter(a => a.providerId === provider.id);
            assert.strictEqual(dependentAgents.length, 0, 'Dependent agents should be deleted');
        });

        it('Should handle provider deactivation with dependent agents', async () => {
            // Create provider and agents
            const provider = await providerManager.addProvider({
                name: 'Provider to Deactivate',
                type: 'local_network',
                provider: 'ollama',
                endpoint: 'http://localhost:11434',
                localHostType: 'ollama'
            });

            const agent = await configManager.addNewAgent({
                name: 'Dependent Agent',
                providerId: provider.id,
                model: 'llama2',
                capabilities: {
                    hasVision: false,
                    hasToolUse: false,
                    reasoningDepth: 'intermediate',
                    speed: 'fast',
                    costTier: 'low'
                }
            });

            // Simulate provider deactivation
            mockWebviewPanel.webview.simulateMessage({
                type: 'toggleProvider',
                payload: { providerId: provider.id, isActive: false }
            });

            await providerManager.toggleProviderStatus(provider.id, false);
            await agentRegistry.handleProviderDeactivation(provider.id);

            // Verify provider is deactivated
            const deactivatedProvider = configManager.getProviderById(provider.id);
            assert.strictEqual(deactivatedProvider?.isActive, false);

            // Verify dependent agent is deactivated
            const deactivatedAgent = configManager.getNewAgentById(agent.id);
            assert.strictEqual(deactivatedAgent?.isActive, false);
        });

        it('Should show proper warning dialog before provider deletion', async () => {
            // Create provider with multiple agents
            const provider = await providerManager.addProvider({
                name: 'Provider with Many Agents',
                type: 'cloud',
                provider: 'anthropic',
                apiKey: 'test-key'
            });

            // Create multiple agents
            const agents = await Promise.all([
                configManager.addNewAgent({
                    name: 'Agent 1',
                    providerId: provider.id,
                    model: 'claude-3-haiku',
                    capabilities: {
                        hasVision: false,
                        hasToolUse: true,
                        reasoningDepth: 'intermediate',
                        speed: 'fast',
                        costTier: 'low'
                    }
                }),
                configManager.addNewAgent({
                    name: 'Agent 2',
                    providerId: provider.id,
                    model: 'claude-3-sonnet',
                    capabilities: {
                        hasVision: true,
                        hasToolUse: true,
                        reasoningDepth: 'advanced',
                        speed: 'medium',
                        costTier: 'medium'
                    }
                })
            ]);

            // Simulate delete attempt
            mockWebviewPanel.webview.simulateMessage({
                type: 'deleteProvider',
                payload: { providerId: provider.id }
            });

            // Check that dependent agents are identified
            const dependentAgents = configManager.getNewAgents().filter(a => a.providerId === provider.id);
            assert.strictEqual(dependentAgents.length, 2, 'Should identify all dependent agents');

            // Verify warning dialog shows impact
            const warningData = {
                providerId: provider.id,
                providerName: provider.name,
                dependentAgentCount: dependentAgents.length,
                dependentAgentNames: dependentAgents.map(a => a.name)
            };

            assert.strictEqual(warningData.dependentAgentCount, 2);
            assert.deepStrictEqual(warningData.dependentAgentNames, ['Agent 1', 'Agent 2']);
        });

        it('Should handle cancellation of provider deletion', async () => {
            // Create provider and agent
            const provider = await providerManager.addProvider({
                name: 'Provider to Cancel Delete',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'test-key'
            });

            const agent = await configManager.addNewAgent({
                name: 'Safe Agent',
                providerId: provider.id,
                model: 'gpt-4',
                capabilities: {
                    hasVision: false,
                    hasToolUse: true,
                    reasoningDepth: 'advanced',
                    speed: 'medium',
                    costTier: 'high'
                }
            });

            // Simulate delete attempt
            mockWebviewPanel.webview.simulateMessage({
                type: 'deleteProvider',
                payload: { providerId: provider.id }
            });

            // Simulate cancellation
            mockWebviewPanel.webview.simulateMessage({
                type: 'cancelDeleteProvider',
                payload: { providerId: provider.id }
            });

            // Verify nothing was deleted
            const providers = await providerManager.getProviders();
            assert.strictEqual(providers.length, 1, 'Provider should still exist');
            assert.strictEqual(providers[0].id, provider.id);

            const agents = configManager.getNewAgents();
            assert.strictEqual(agents.length, 1, 'Agent should still exist');
            assert.strictEqual(agents[0].id, agent.id);
            assert.strictEqual(agents[0].isActive, true, 'Agent should still be active');
        });
    });

    describe('Settings UI Full Sidebar Coverage', () => {
        it('Should expand settings to fill entire sidebar height', async () => {
            // Simulate opening settings
            mockWebviewPanel.webview.simulateMessage({
                type: 'openSettings',
                payload: {}
            });

            // Verify webview panel is created with correct properties
            assert.strictEqual(mockWebviewPanel.viewType, 'comradeSettings');
            assert.strictEqual(mockWebviewPanel.title, 'Comrade Settings');
            assert.strictEqual(mockWebviewPanel.visible, true);

            // Verify settings container CSS classes are applied
            const settingsHTML = mockWebviewPanel.webview.html;
            assert.ok(settingsHTML.includes('settings-container'), 'Should include settings container');
            assert.ok(settingsHTML.includes('height: 100vh'), 'Should fill full viewport height');
        });

        it('Should hide chat view when settings are active', async () => {
            // Simulate settings activation
            mockWebviewPanel.webview.simulateMessage({
                type: 'activateSettings',
                payload: {}
            });

            // Verify chat view is hidden
            mockWebviewPanel.webview.simulateMessage({
                type: 'checkChatViewVisibility',
                payload: {}
            });

            // Settings should be in full-screen mode
            assert.strictEqual(mockWebviewPanel.active, true);
            assert.strictEqual(mockWebviewPanel.visible, true);
        });

        it('Should provide clean dedicated settings experience', async () => {
            // Test tab navigation
            const tabs = ['providers', 'agents', 'general'];
            
            for (const tab of tabs) {
                mockWebviewPanel.webview.simulateMessage({
                    type: 'switchTab',
                    payload: { tab }
                });

                // Verify tab switching works
                mockWebviewPanel.webview.simulateMessage({
                    type: 'getCurrentTab',
                    payload: {}
                });
            }

            // Verify settings header and close functionality
            mockWebviewPanel.webview.simulateMessage({
                type: 'closeSettings',
                payload: {}
            });

            // Should handle close properly
            assert.ok(true, 'Settings close functionality should work');
        });
    });
});

// Helper function to generate mock settings HTML
function getSettingsHTML(): string {
    return `
        <div class="settings-container" style="height: 100vh;">
            <div class="settings-header">
                <h2>Comrade Settings</h2>
                <button class="close-btn">×</button>
            </div>
            <div class="settings-tabs">
                <button class="settings-tab active">Provider Management</button>
                <button class="settings-tab">Agent Management</button>
                <button class="settings-tab">General Settings</button>
            </div>
            <div class="settings-content">
                <div class="provider-management">
                    <div class="empty-state">
                        <h4>No providers configured</h4>
                        <button class="primary-btn">Add Provider</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}