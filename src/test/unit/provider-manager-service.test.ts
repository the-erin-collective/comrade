/**
 * Unit tests for Provider Manager Service
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ProviderManagerService } from '../../core/provider-manager';
import { ProviderConfig, ProviderFormData } from '../../core/types';

// Mock VS Code API
const mockSecretStorage = {
  store: async (key: string, value: string) => {},
  get: async (key: string) => undefined,
  delete: async (key: string) => {}
};

const mockConfiguration = {
  get: (key: string, defaultValue?: any) => {
    if (key === 'providers') {
      return mockConfiguration._providers || [];
    }
    return defaultValue;
  },
  update: async (key: string, value: any) => {
    if (key === 'providers') {
      mockConfiguration._providers = value;
    }
  },
  _providers: [] as ProviderConfig[]
};

describe('ProviderManagerService', () => {
  let providerManager: ProviderManagerService;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock vscode.workspace.getConfiguration
    sandbox.stub(require('vscode').workspace, 'getConfiguration').returns(mockConfiguration);

    // Reset configuration
    mockConfiguration._providers = [];

    // Reset singleton instance
    ProviderManagerService.resetInstance();
    providerManager = ProviderManagerService.getInstance(mockSecretStorage as any);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Provider CRUD Operations', () => {
    it('should add cloud provider successfully', async () => {
      const providerData: ProviderFormData = {
        name: 'OpenAI Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test-key'
      };

      const provider = await providerManager.addProvider(providerData);

      assert.ok(provider.id);
      assert.strictEqual(provider.name, 'OpenAI Provider');
      assert.strictEqual(provider.type, 'cloud');
      assert.strictEqual(provider.provider, 'openai');
      assert.strictEqual(provider.isActive, true);
    });

    it('should add local network provider successfully', async () => {
      const providerData: ProviderFormData = {
        name: 'Ollama Provider',
        type: 'local_network',
        provider: 'ollama',
        endpoint: 'http://localhost:11434',
        localHostType: 'ollama'
      };

      const provider = await providerManager.addProvider(providerData);

      assert.ok(provider.id);
      assert.strictEqual(provider.name, 'Ollama Provider');
      assert.strictEqual(provider.type, 'local_network');
      assert.strictEqual(provider.provider, 'ollama');
    });

    it('should update provider successfully', async () => {
      const initialData: ProviderFormData = {
        name: 'Initial Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'initial-key'
      };

      const initialProvider = await providerManager.addProvider(initialData);

      const updates: Partial<ProviderFormData> = {
        name: 'Updated Provider'
      };

      const updatedProvider = await providerManager.updateProvider(initialProvider.id, updates);

      assert.strictEqual(updatedProvider.name, 'Updated Provider');
      assert.strictEqual(updatedProvider.id, initialProvider.id);
    });

    it('should delete provider successfully', async () => {
      const providerData: ProviderFormData = {
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      };

      const provider = await providerManager.addProvider(providerData);
      assert.strictEqual(providerManager.getProviders().length, 1);

      await providerManager.deleteProvider(provider.id);

      assert.strictEqual(providerManager.getProviders().length, 0);
      assert.strictEqual(providerManager.getProviderById(provider.id), null);
    });

    it('should toggle provider status successfully', async () => {
      const providerData: ProviderFormData = {
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      };

      const provider = await providerManager.addProvider(providerData);
      assert.strictEqual(provider.isActive, true);

      const inactiveProvider = await providerManager.toggleProviderStatus(provider.id, false);
      assert.strictEqual(inactiveProvider.isActive, false);

      const activeProvider = await providerManager.toggleProviderStatus(provider.id, true);
      assert.strictEqual(activeProvider.isActive, true);
    });
  });

  describe('Provider Queries', () => {
    it('should return all providers', async () => {
      const provider1 = await providerManager.addProvider({
        name: 'Provider 1',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'key1'
      });

      const provider2 = await providerManager.addProvider({
        name: 'Provider 2',
        type: 'cloud',
        provider: 'anthropic',
        apiKey: 'key2'
      });

      const providers = providerManager.getProviders();
      assert.strictEqual(providers.length, 2);
    });

    it('should return only active providers', async () => {
      const provider1 = await providerManager.addProvider({
        name: 'Active Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'key1'
      });

      const provider2 = await providerManager.addProvider({
        name: 'Inactive Provider',
        type: 'cloud',
        provider: 'anthropic',
        apiKey: 'key2'
      });

      await providerManager.toggleProviderStatus(provider2.id, false);

      const activeProviders = providerManager.getActiveProviders();
      assert.strictEqual(activeProviders.length, 1);
      assert.strictEqual(activeProviders[0].name, 'Active Provider');
    });

    it('should return provider by ID', async () => {
      const provider = await providerManager.addProvider({
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'test-key'
      });

      const foundProvider = providerManager.getProviderById(provider.id);
      assert.deepStrictEqual(foundProvider, provider);
    });

    it('should return null for non-existent provider', () => {
      const provider = providerManager.getProviderById('non-existent');
      assert.strictEqual(provider, null);
    });
  });

  describe('Provider Validation', () => {
    it('should reject invalid provider data', async () => {
      const invalidData: ProviderFormData = {
        name: '',
        type: 'cloud',
        provider: 'openai'
      };

      await assert.rejects(
        providerManager.addProvider(invalidData),
        /Provider name is required/
      );
    });

    it('should reject local network provider without endpoint', async () => {
      const invalidData: ProviderFormData = {
        name: 'Test Provider',
        type: 'local_network',
        provider: 'ollama'
      };

      await assert.rejects(
        providerManager.addProvider(invalidData),
        /Endpoint is required/
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent provider updates', async () => {
      await assert.rejects(
        providerManager.updateProvider('non-existent', { name: 'Updated' }),
        /not found/
      );
    });

    it('should handle non-existent provider deletions', async () => {
      await assert.rejects(
        providerManager.deleteProvider('non-existent'),
        /not found/
      );
    });

    it('should handle non-existent provider status toggles', async () => {
      await assert.rejects(
        providerManager.toggleProviderStatus('non-existent', false),
        /not found/
      );
    });
  });
});