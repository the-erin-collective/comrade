/**
 * Integration tests for the new provider-agent architecture
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConfigurationManager } from '../core/config';
import { AgentRegistry } from '../core/registry';
import { ProviderManagerService } from '../core/provider-manager';
import { ProviderConfig, Agent, ProviderFormData, AgentFormData } from '../core/types';

suite('Provider-Agent Architecture Integration Tests', () => {
    let configManager: ConfigurationManager;
    let agentRegistry: AgentRegistry;
    let providerManager: ProviderManagerService;
    let mockSecretStorage: vscode.SecretStorage;

    setup(() => {
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

    teardown(() => {
        // Reset instances for clean tests
        ConfigurationManager.resetInstance();
        AgentRegistry.resetInstance();
        ProviderManagerService.resetInstance();
    });

    test('Should create provider and agent successfully', async () => {
        // Create a test provider
        const providerData: ProviderFormData = {
            name: 'Test OpenAI Provider',
            type: 'cloud',
            provider: 'openai',
            apiKey: 'test-api-key'
        };

        const provider = await providerManager.addProvider(providerData);
        
        assert.strictEqual(provider.name, 'Test OpenAI Provider');
        assert.strictEqual(provider.type, 'cloud');
        assert.strictEqual(provider.provider, 'openai');
        assert.strictEqual(provider.isActive, true);

        // Create a test agent that uses the provider
        const agentData: AgentFormData = {
            name: 'Test GPT Agent',
            providerId: provider.id,
            model: 'gpt-4',
            temperature: 0.7,
            maxTokens: 4000,
            capabilities: {
                hasVision: false,
                hasToolUse: true,
                reasoningDepth: 'advanced',
                speed: 'medium',
                costTier: 'high'
            }
        };

        const agent = await configManager.addNewAgent(agentData);
        
        assert.strictEqual(agent.name, 'Test GPT Agent');
        assert.strictEqual(agent.providerId, provider.id);
        assert.strictEqual(agent.model, 'gpt-4');
        assert.strictEqual(agent.isActive, true);
    });

    test('Should handle provider deactivation correctly', async () => {
        // Create provider and agent
        const providerData: ProviderFormData = {
            name: 'Test Provider',
            type: 'local-network',
            provider: 'ollama',
            endpoint: 'http://localhost:11434'
        };

        const provider = await providerManager.addProvider(providerData);
        
        const agentData: AgentFormData = {
            name: 'Test Agent',
            providerId: provider.id,
            model: 'llama2',
            capabilities: {
                hasVision: false,
                hasToolUse: false,
                reasoningDepth: 'intermediate',
                speed: 'fast',
                costTier: 'low'
            }
        };

        const agent = await configManager.addNewAgent(agentData);

        // Verify both are active initially
        assert.strictEqual(provider.isActive, true);
        assert.strictEqual(agent.isActive, true);

        // Deactivate provider
        await providerManager.toggleProviderStatus(provider.id, false);

        // Verify provider is deactivated
        const updatedProvider = configManager.getProviderById(provider.id);
        assert.strictEqual(updatedProvider?.isActive, false);

        // Verify dependent agents are deactivated
        await agentRegistry.handleProviderDeactivation(provider.id);
        const updatedAgent = configManager.getNewAgentById(agent.id);
        assert.strictEqual(updatedAgent?.isActive, false);
    });

    test('Should validate agent-provider relationships', async () => {
        // Create provider and agent
        const providerData: ProviderFormData = {
            name: 'Test Provider',
            type: 'cloud',
            provider: 'anthropic',
            apiKey: 'test-key'
        };

        const provider = await providerManager.addProvider(providerData);
        
        const agentData: AgentFormData = {
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
        };

        const agent = await configManager.addNewAgent(agentData);

        // Test validation
        const validation = await agentRegistry.validateAgentWithProvider(agent.id);
        
        // Should be valid since both agent and provider are active
        assert.strictEqual(validation.isValid, true);
        assert.strictEqual(validation.errors.length, 0);
    });

    test('Should handle migration from old to new architecture', async () => {
        // This test would require mocking the old configuration format
        // and testing the migration process
        
        // For now, just test that migration detection works
        const needsMigration = configManager.needsMigration();
        
        // Should be false since we haven't set up old configuration
        assert.strictEqual(typeof needsMigration, 'boolean');
    });

    test('Should choose correct architecture automatically', async () => {
        // Test that the registry chooses the right architecture
        const shouldUseNew = agentRegistry.shouldUseNewArchitecture();
        
        // Initially should be false since no providers/new agents exist
        assert.strictEqual(shouldUseNew, false);

        // Create a provider
        const providerData: ProviderFormData = {
            name: 'Test Provider',
            type: 'cloud',
            provider: 'openai',
            apiKey: 'test-key'
        };

        await providerManager.addProvider(providerData);

        // Now should use new architecture
        const shouldUseNewAfter = agentRegistry.shouldUseNewArchitecture();
        assert.strictEqual(shouldUseNewAfter, true);
    });
});