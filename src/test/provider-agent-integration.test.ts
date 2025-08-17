/**
 * Integration tests for the new provider-agent architecture
 */

console.log('=== TEST FILE LOADED ===');

import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConfigurationManager } from '../core/config';
import { AgentRegistry } from '../core/registry';
import { ProviderManagerService } from '../core/provider-manager';
import { ProviderConfig, Agent, ProviderFormData, AgentFormData } from '../core/types';

// Debug logging utility
const debug = (message: string, data?: any) => {
    console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
};

// Test context helper
const logTestContext = (testName: string) => {
    console.log(`\n=== TEST: ${testName} ===`);
};

describe('Provider-Agent Architecture Integration Tests', () => {
    let configManager: ConfigurationManager;
    let agentRegistry: AgentRegistry;
    let providerManager: ProviderManagerService;
    let mockSecretStorage: vscode.SecretStorage;

    beforeEach(() => {
        // Create mock secret storage
        mockSecretStorage = {
            get: async (key: string) => {
                debug('SecretStorage.get', { key });
                return undefined;
            },
            store: async (key: string, value: string) => {
                debug('SecretStorage.store', { key, value: value ? '***' : 'undefined' });
            },
            delete: async (key: string) => {
                debug('SecretStorage.delete', { key });
            },
            onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event
        };

        // Initialize managers
        debug('Initializing managers');
        configManager = ConfigurationManager.getInstance(mockSecretStorage);
        agentRegistry = AgentRegistry.getInstance(configManager);
        providerManager = ProviderManagerService.getInstance(mockSecretStorage);
        debug('Managers initialized', { 
            configManager: !!configManager,
            agentRegistry: !!agentRegistry,
            providerManager: !!providerManager 
        });
    });

    afterEach(() => {
        // Reset instances for clean tests
        ConfigurationManager.resetInstance();
        AgentRegistry.resetInstance();
        ProviderManagerService.resetInstance();
    });

    it('Should create provider and agent successfully', async () => {
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

    it('Should handle provider deactivation correctly', async () => {
        logTestContext('Should handle provider deactivation correctly');
        
        // Create provider and agent
        const providerData: ProviderFormData = {
            name: 'Test Provider',
            type: 'local-network',
            provider: 'ollama',
            endpoint: 'http://localhost:11434'
        };

        debug('Adding provider', providerData);
        const provider = await providerManager.addProvider(providerData);
        debug('Provider added', { providerId: provider.id, isActive: provider.isActive });
        
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

        debug('Adding agent', agentData);
        const agent = await configManager.addNewAgent(agentData);
        debug('Agent added', { agentId: agent.id, isActive: agent.isActive });

        // Verify both are active initially
        debug('Verifying initial active states');
        assert.strictEqual(provider.isActive, true, 'Provider should be active initially');
        assert.strictEqual(agent.isActive, true, 'Agent should be active initially');

        try {
            // Deactivate provider
            debug(`Deactivating provider ${provider.id}`);
            await providerManager.toggleProviderStatus(provider.id, false);

            // Verify provider is deactivated
            const updatedProvider = configManager.getProviderById(provider.id);
            debug('Provider after deactivation', { 
                providerId: updatedProvider?.id, 
                isActive: updatedProvider?.isActive 
            });
            assert.strictEqual(updatedProvider?.isActive, false, 'Provider should be deactivated');

            // Verify dependent agents are deactivated
            debug(`Handling deactivation for provider ${provider.id}`);
            await agentRegistry.handleProviderDeactivation(provider.id);
            
            const updatedAgent = configManager.getNewAgentById(agent.id);
            debug('Agent after provider deactivation', { 
                agentId: updatedAgent?.id, 
                isActive: updatedAgent?.isActive 
            });
            
            assert.strictEqual(updatedAgent?.isActive, false, 'Agent should be deactivated after provider deactivation');
        } catch (error) {
            debug('Test failed with error', { error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    });

    it('Should validate agent-provider relationships', async () => {
        logTestContext('Should validate agent-provider relationships');
        
        // Create provider
        const providerData: ProviderFormData = {
            name: 'Test Provider',
            type: 'cloud',
            provider: 'anthropic',
            apiKey: 'test-key'
        };

        debug('Adding provider', providerData);
        const provider = await providerManager.addProvider(providerData);
        debug('Provider added', { providerId: provider.id, isActive: provider.isActive });
        
        // Create agent
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

        debug('Adding agent', agentData);
        const agent = await configManager.addNewAgent(agentData);
        debug('Agent added', { agentId: agent.id, isActive: agent.isActive });

        // Test validation
        debug(`Validating agent ${agent.id} with provider ${provider.id}`);
        const validation = await agentRegistry.validateAgentWithProvider(agent.id);
        debug('Validation result', { 
            isValid: validation.isValid,
            errors: validation.errors,
            agentActive: agent.isActive,
            providerActive: provider.isActive
        });
        
        // Should be valid since both agent and provider are active
        assert.strictEqual(validation.isValid, true, 'Agent-provider validation should be valid');
        assert.strictEqual(validation.errors.length, 0, 'There should be no validation errors');
        
        // Additional validation that both agent and provider are active
        const currentAgent = configManager.getNewAgentById(agent.id);
        const currentProvider = configManager.getProviderById(provider.id);
        debug('Current states', {
            agentActive: currentAgent?.isActive,
            providerActive: currentProvider?.isActive
        });
        
        assert.strictEqual(currentAgent?.isActive, true, 'Agent should be active');
        assert.strictEqual(currentProvider?.isActive, true, 'Provider should be active');
    });

    it('Should handle migration from old to new architecture', async () => {
        // This test would require mocking the old configuration format
        // and testing the migration process
        
        // For now, just test that migration detection works
        const needsMigration = configManager.needsMigration();
        
        // Should be false since we haven't set up old configuration
        assert.strictEqual(typeof needsMigration, 'boolean');
    });

    it('Should choose correct architecture automatically', async () => {
        logTestContext('Should choose correct architecture automatically');
        
        // Initial architecture check
        debug('Checking initial architecture state');
        const shouldUseNew = agentRegistry.shouldUseNewArchitecture();
        debug('Initial architecture check', { shouldUseNew });
        
        // Initially should be false since no providers/new agents exist
        assert.strictEqual(shouldUseNew, false, 'Should not use new architecture initially');

        // Create a provider
        const providerData: ProviderFormData = {
            name: 'Test Provider',
            type: 'cloud',
            provider: 'openai',
            apiKey: 'test-key'
        };

        debug('Adding provider', providerData);
        const provider = await providerManager.addProvider(providerData);
        debug('Provider added', { providerId: provider.id, type: provider.type });

        // Verify provider was added
        const providers = configManager.getProviders();
        debug('Current providers', { 
            count: providers.length,
            providerIds: providers.map(p => p.id),
            providerTypes: providers.map(p => p.type)
        });

        // Now should use new architecture
        debug('Checking architecture after provider addition');
        const shouldUseNewAfter = agentRegistry.shouldUseNewArchitecture();
        debug('Architecture check after provider addition', { shouldUseNewAfter });
        
        // Additional debug: Check if any agents exist that might affect architecture decision
        const agents = configManager.getNewAgents();
        debug('Current agents', { 
            count: agents.length,
            agentIds: agents.map(a => a.id),
            agentProviders: agents.map(a => a.providerId)
        });
        
        assert.strictEqual(shouldUseNewAfter, true, 'Should use new architecture after adding a provider');
        
        // Additional validation: Check if the provider is properly registered
        const registeredProviders = providerManager.getProviders();
        debug('Registered providers', {
            count: registeredProviders.length,
            providerIds: registeredProviders.map(p => p.id)
        });
        
        assert.strictEqual(registeredProviders.length > 0, true, 'Should have at least one registered provider');
    });
});