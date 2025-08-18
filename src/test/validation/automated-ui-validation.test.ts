/**
 * Automated validation tests for Settings UI improvements
 * Focuses on testing the core functionality that can be automated
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConfigurationManager } from '../../core/config';
import { AgentRegistry } from '../../core/registry';
import { ProviderManagerService } from '../../core/provider-manager';

describe('Settings UI Automated Validation - Task 10', () => {
    let configManager: ConfigurationManager;
    let agentRegistry: AgentRegistry;
    let providerManager: ProviderManagerService;
    let mockSecretStorage: vscode.SecretStorage;

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
    });

    afterEach(() => {
        // Reset instances for clean tests
        ConfigurationManager.resetInstance();
        AgentRegistry.resetInstance();
        ProviderManagerService.resetInstance();
    });

    describe('Core Functionality Validation', () => {
        it('should validate provider creation workflow', async () => {
            // Test provider creation with all required fields
            const provider = await providerManager.addProvider({
                name: 'Test Provider',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'sk-test-key'
            });

            // Validate provider was created correctly
            assert.ok(provider.id, 'Provider should have an ID');
            assert.strictEqual(provider.name, 'Test Provider');
            assert.strictEqual(provider.type, 'cloud');
            assert.strictEqual(provider.provider, 'openai');
            assert.strictEqual(provider.isActive, true);
            assert.ok(provider.createdAt instanceof Date);
            assert.ok(provider.updatedAt instanceof Date);

            // Validate provider appears in lists
            const allProviders = await providerManager.getProviders();
            assert.strictEqual(allProviders.length, 1);
            assert.strictEqual(allProviders[0].id, provider.id);

            const activeProviders = await providerManager.getActiveProviders();
            assert.strictEqual(activeProviders.length, 1);
            assert.strictEqual(activeProviders[0].id, provider.id);
        });

        it('should validate agent creation with provider dependency', async () => {
            // First create a provider
            const provider = await providerManager.addProvider({
                name: 'Agent Test Provider',
                type: 'cloud',
                provider: 'anthropic',
                apiKey: 'sk-test-key'
            });

            // Verify we have active providers
            const activeProviders = await providerManager.getActiveProviders();
            assert.strictEqual(activeProviders.length, 1, 'Should have one active provider');

            // Create agent
            const agent = await configManager.addNewAgent({
                name: 'Test Agent',
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

            // Validate agent was created correctly
            assert.ok(agent.id, 'Agent should have an ID');
            assert.strictEqual(agent.name, 'Test Agent');
            assert.strictEqual(agent.providerId, provider.id);
            assert.strictEqual(agent.model, 'claude-3-haiku');
            assert.strictEqual(agent.isActive, true);

            // Validate agent appears in lists
            const allAgents = configManager.getNewAgents();
            assert.strictEqual(allAgents.length, 1);
            assert.strictEqual(allAgents[0].id, agent.id);
        });

        it('should validate provider statistics calculation', async () => {
            // Create multiple providers
            const provider1 = await providerManager.addProvider({
                name: 'Provider 1',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'sk-test-key-1'
            });

            const provider2 = await providerManager.addProvider({
                name: 'Provider 2',
                type: 'cloud',
                provider: 'anthropic',
                apiKey: 'sk-test-key-2'
            });

            const provider3 = await providerManager.addProvider({
                name: 'Provider 3',
                type: 'local-network',
                provider: 'ollama',
                endpoint: 'http://localhost:11434'
            });

            // Deactivate one provider
            await providerManager.toggleProviderStatus(provider3.id, false);

            // Validate statistics
            const allProviders = await providerManager.getProviders();
            const activeProviders = await providerManager.getActiveProviders();

            assert.strictEqual(allProviders.length, 3, 'Should have 3 total providers');
            assert.strictEqual(activeProviders.length, 2, 'Should have 2 active providers');

            // Validate compact statistics format
            const statsText = `${activeProviders.length} of ${allProviders.length} providers active`;
            assert.strictEqual(statsText, '2 of 3 providers active');
        });

        it('should validate provider deactivation affects dependent agents', async () => {
            // Create provider and agent
            const provider = await providerManager.addProvider({
                name: 'Deactivation Test Provider',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'sk-test-key'
            });

            const agent = await configManager.addNewAgent({
                name: 'Dependent Agent',
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

            // Verify initial active states
            assert.strictEqual(provider.isActive, true);
            assert.strictEqual(agent.isActive, true);

            // Deactivate provider
            await providerManager.toggleProviderStatus(provider.id, false);
            await agentRegistry.handleProviderDeactivation(provider.id);

            // Verify provider is deactivated
            const deactivatedProvider = configManager.getProviderById(provider.id);
            assert.strictEqual(deactivatedProvider?.isActive, false);

            // Verify dependent agent is deactivated
            const deactivatedAgent = configManager.getNewAgentById(agent.id);
            assert.strictEqual(deactivatedAgent?.isActive, false);
        });

        it('should validate error handling for invalid operations', async () => {
            // Test creating agent without provider
            const activeProviders = await providerManager.getActiveProviders();
            assert.strictEqual(activeProviders.length, 0, 'Should start with no active providers');

            try {
                await configManager.addNewAgent({
                    name: 'Invalid Agent',
                    providerId: 'non-existent-provider',
                    model: 'gpt-4'
                });
                assert.fail('Should not allow agent creation without valid provider');
            } catch (error) {
                assert.ok(error instanceof Error, 'Should throw proper error');
                assert.ok(error.message.length > 0, 'Error should have descriptive message');
            }
        });

        it('should validate provider validation functionality', async () => {
            // Create a provider
            const provider = await providerManager.addProvider({
                name: 'Validation Test Provider',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'sk-test-key'
            });

            // Test provider validation
            const validationResult = await providerManager.validateProvider(provider);
            
            // Validation should return a result object
            assert.ok(typeof validationResult === 'object', 'Should return validation result object');
            assert.ok(typeof validationResult.valid === 'boolean', 'Should have valid property');
            
            if (validationResult.error) {
                assert.ok(typeof validationResult.error === 'string', 'Error should be a string');
            }
        });

        it('should validate complete workflow integration', async () => {
            // Test complete workflow from empty state to working configuration
            
            // Step 1: Verify empty state
            let providers = await providerManager.getProviders();
            let agents = configManager.getNewAgents();
            assert.strictEqual(providers.length, 0, 'Should start with no providers');
            assert.strictEqual(agents.length, 0, 'Should start with no agents');

            // Step 2: Create provider
            const provider = await providerManager.addProvider({
                name: 'Workflow Test Provider',
                type: 'cloud',
                provider: 'anthropic',
                apiKey: 'sk-test-key'
            });

            // Step 3: Verify provider is available for agent creation
            const activeProviders = await providerManager.getActiveProviders();
            assert.strictEqual(activeProviders.length, 1);
            assert.strictEqual(activeProviders[0].id, provider.id);

            // Step 4: Create agent
            const agent = await configManager.addNewAgent({
                name: 'Workflow Test Agent',
                providerId: provider.id,
                model: 'claude-3-sonnet',
                capabilities: {
                    hasVision: true,
                    hasToolUse: true,
                    reasoningDepth: 'advanced',
                    speed: 'medium',
                    costTier: 'medium'
                }
            });

            // Step 5: Verify complete configuration
            providers = await providerManager.getProviders();
            agents = configManager.getNewAgents();
            assert.strictEqual(providers.length, 1);
            assert.strictEqual(agents.length, 1);
            assert.strictEqual(agents[0].providerId, provider.id);

            // Step 6: Test provider-agent relationship
            const agentProvider = configManager.getProviderById(agent.providerId);
            assert.ok(agentProvider, 'Agent should have valid provider reference');
            assert.strictEqual(agentProvider.id, provider.id);
        });

        it('should validate CRUD operations maintain data integrity', async () => {
            // Create provider
            const originalProvider = await providerManager.addProvider({
                name: 'CRUD Test Provider',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'sk-original-key'
            });

            // Read provider
            const retrievedProvider = configManager.getProviderById(originalProvider.id);
            assert.ok(retrievedProvider, 'Should be able to retrieve provider');
            assert.strictEqual(retrievedProvider.name, 'CRUD Test Provider');

            // Update provider
            const updatedProvider = await providerManager.updateProvider(originalProvider.id, {
                name: 'Updated CRUD Test Provider'
            });
            assert.strictEqual(updatedProvider.name, 'Updated CRUD Test Provider');
            assert.strictEqual(updatedProvider.id, originalProvider.id);
            assert.notStrictEqual(updatedProvider.updatedAt, originalProvider.updatedAt);

            // Verify update persisted
            const reRetrievedProvider = configManager.getProviderById(originalProvider.id);
            assert.strictEqual(reRetrievedProvider?.name, 'Updated CRUD Test Provider');

            // Delete provider
            await providerManager.deleteProvider(originalProvider.id);
            const deletedProvider = configManager.getProviderById(originalProvider.id);
            assert.strictEqual(deletedProvider, undefined, 'Provider should be deleted');
        });
    });

    describe('Edge Cases and Error Scenarios', () => {
        it('should handle multiple provider types correctly', async () => {
            // Create different types of providers
            const cloudProvider = await providerManager.addProvider({
                name: 'Cloud Provider',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'sk-test-key'
            });

            const localProvider = await providerManager.addProvider({
                name: 'Local Provider',
                type: 'local-network',
                provider: 'ollama',
                endpoint: 'http://localhost:11434'
            });

            // Verify both providers exist and have correct types
            const allProviders = await providerManager.getProviders();
            assert.strictEqual(allProviders.length, 2);

            const cloudProviderFound = allProviders.find(p => p.type === 'cloud');
            const localProviderFound = allProviders.find(p => p.type === 'local-network');

            assert.ok(cloudProviderFound, 'Should find cloud provider');
            assert.ok(localProviderFound, 'Should find local network provider');
            assert.strictEqual(cloudProviderFound.provider, 'openai');
            assert.strictEqual(localProviderFound.provider, 'ollama');
        });

        it('should handle provider status changes correctly', async () => {
            const provider = await providerManager.addProvider({
                name: 'Status Test Provider',
                type: 'cloud',
                provider: 'anthropic',
                apiKey: 'sk-test-key'
            });

            // Initially active
            assert.strictEqual(provider.isActive, true);

            // Deactivate
            await providerManager.toggleProviderStatus(provider.id, false);
            let updatedProvider = configManager.getProviderById(provider.id);
            assert.strictEqual(updatedProvider?.isActive, false);

            // Reactivate
            await providerManager.toggleProviderStatus(provider.id, true);
            updatedProvider = configManager.getProviderById(provider.id);
            assert.strictEqual(updatedProvider?.isActive, true);
        });

        it('should maintain referential integrity during provider deletion', async () => {
            // Create provider and multiple agents
            const provider = await providerManager.addProvider({
                name: 'Deletion Test Provider',
                type: 'cloud',
                provider: 'openai',
                apiKey: 'sk-test-key'
            });

            const agent1 = await configManager.addNewAgent({
                name: 'Agent 1',
                providerId: provider.id,
                model: 'gpt-4'
            });

            const agent2 = await configManager.addNewAgent({
                name: 'Agent 2',
                providerId: provider.id,
                model: 'gpt-3.5-turbo'
            });

            // Verify initial state
            let agents = configManager.getNewAgents();
            assert.strictEqual(agents.length, 2);
            assert.ok(agents.every(a => a.providerId === provider.id));

            // Delete provider and handle dependent agents
            await agentRegistry.handleProviderDeletion(provider.id);
            await providerManager.deleteProvider(provider.id);

            // Verify provider is deleted
            const deletedProvider = configManager.getProviderById(provider.id);
            assert.strictEqual(deletedProvider, undefined);

            // Verify dependent agents are handled (deleted or deactivated)
            agents = configManager.getNewAgents();
            const dependentAgents = agents.filter(a => a.providerId === provider.id);
            assert.strictEqual(dependentAgents.length, 0, 'No agents should reference deleted provider');
        });
    });
});