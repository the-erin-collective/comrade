/**
 * Unit tests for Provider Manager Service
 */

import assert from 'assert';
import * as vscode from 'vscode';
import { ProviderManagerService } from '../../core/provider-manager';
import { 
  ProviderConfig, 
  CloudProvider, 
  LocalNetworkProvider, 
  ProviderFormData,
  ProviderValidationResult,
  ConnectionTestResult
} from '../../core/types';

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
  update: async (key: string, value: any, target?: vscode.ConfigurationTarget) => {
    if (key === 'providers') {
      mockConfiguration._providers = value;
    }
  },
  _providers: [] as ProviderConfig[]
};

// Mock vscode.workspace.getConfiguration
const originalGetConfiguration = vscode.workspace.getConfiguration;
(vscode.workspace as any).getConfiguration = (section?: string) => mockConfiguration;

describe('ProviderManagerService', () => {
  let providerManager: ProviderManagerService;

  beforeEach(() => {
    // Reset singleton instance
    ProviderManagerService.resetInstance();
    providerManager = ProviderManagerService.getInstance(mockSecretStorage as any);
    
    // Reset mock configuration
    mockConfiguration._providers = [];
  });

  afterEach(() => {
    // Restore original configuration
    (vscode.workspace as any).getConfiguration = originalGetConfiguration;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ProviderManagerService.getInstance(mockSecretStorage as any);
      const instance2 = ProviderManagerService.getInstance(mockSecretStorage as any);
      
      assert.strictEqual(instance1, instance2);
    });

    it('should reset instance correctly', () => {
      const instance1 = ProviderManagerService.getInstance(mockSecretStorage as any);
      ProviderManagerService.resetInstance();
      const instance2 = ProviderManagerService.getInstance(mockSecretStorage as any);
      
      assert.notStrictEqual(instance1, instance2);
    });
  });

  describe('Provider CRUD Operations', () => {
    describe('getProviders', () => {
      it('should return empty array when no providers configured', () => {
        const providers = providerManager.getProviders();
        assert.deepStrictEqual(providers, []);
      });

      it('should return configured providers', () => {
        const testProviders: ProviderConfig[] = [
          {
            id: 'provider-1',
            name: 'Test Provider',
            type: 'cloud',
            provider: 'openai',
            apiKey: '',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ];
        
        mockConfiguration._providers = testProviders;
        const providers = providerManager.getProviders();
        
        assert.deepStrictEqual(providers, testProviders);
      });

      it('should handle invalid provider configuration gracefully', () => {
        mockConfiguration._providers = null as any;
        const providers = providerManager.getProviders();
        
        assert.deepStrictEqual(providers, []);
      });
    });

    describe('getActiveProviders', () => {
      it('should return only active providers', () => {
        const testProviders: ProviderConfig[] = [
          {
            id: 'provider-1',
            name: 'Active Provider',
            type: 'cloud',
            provider: 'openai',
            apiKey: '',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          {
            id: 'provider-2',
            name: 'Inactive Provider',
            type: 'cloud',
            provider: 'anthropic',
            apiKey: '',
            isActive: false,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ];
        
        mockConfiguration._providers = testProviders;
        const activeProviders = providerManager.getActiveProviders();
        
        assert.strictEqual(activeProviders.length, 1);
        assert.strictEqual(activeProviders[0].name, 'Active Provider');
      });
    });

    describe('getProviderById', () => {
      it('should return provider by ID', () => {
        const testProvider: ProviderConfig = {
          id: 'provider-1',
          name: 'Test Provider',
          type: 'cloud',
          provider: 'openai',
          apiKey: '',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        mockConfiguration._providers = [testProvider];
        const provider = providerManager.getProviderById('provider-1');
        
        assert.deepStrictEqual(provider, testProvider);
      });

      it('should return null for non-existent provider', () => {
        const provider = providerManager.getProviderById('non-existent');
        assert.strictEqual(provider, null);
      });
    });

    describe('addProvider', () => {
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
        assert.ok(provider.createdAt);
        assert.ok(provider.updatedAt);

        // Verify it was added to configuration
        const providers = providerManager.getProviders();
        assert.strictEqual(providers.length, 1);
        assert.deepStrictEqual(providers[0], provider);
      });

      it('should add local network provider successfully', async () => {
        const providerData: ProviderFormData = {
          name: 'Ollama Provider',
          type: 'local-network',
          provider: 'ollama',
          endpoint: 'http://localhost:11434',
          localHostType: 'ollama'
        };

        const provider = await providerManager.addProvider(providerData);

        assert.ok(provider.id);
        assert.strictEqual(provider.name, 'Ollama Provider');
        assert.strictEqual(provider.type, 'local-network');
        assert.strictEqual(provider.provider, 'ollama');
        assert.strictEqual((provider as LocalNetworkProvider).endpoint, 'http://localhost:11434');
        assert.strictEqual((provider as LocalNetworkProvider).localHostType, 'ollama');
      });

      it('should throw error for invalid provider data', async () => {
        const invalidData: ProviderFormData = {
          name: '',
          type: 'cloud',
          provider: 'openai'
        };

        await assert.rejects(
          providerManager.addProvider(invalidData),
          /Provider validation failed: Provider name is required/
        );
      });

      it('should throw error for missing endpoint in local network provider', async () => {
        const invalidData: ProviderFormData = {
          name: 'Test Provider',
          type: 'local-network',
          provider: 'ollama'
        };

        await assert.rejects(
          providerManager.addProvider(invalidData),
          /Provider validation failed: Endpoint is required for local network providers/
        );
      });
    });

    describe('updateProvider', () => {
      it('should update provider successfully', async () => {
        // First add a provider
        const initialData: ProviderFormData = {
          name: 'Initial Provider',
          type: 'cloud',
          provider: 'openai',
          apiKey: 'initial-key'
        };

        const initialProvider = await providerManager.addProvider(initialData);

        // Update the provider
        const updates: Partial<ProviderFormData> = {
          name: 'Updated Provider',
          apiKey: 'updated-key'
        };

        const updatedProvider = await providerManager.updateProvider(initialProvider.id, updates);

        assert.strictEqual(updatedProvider.name, 'Updated Provider');
        assert.strictEqual(updatedProvider.id, initialProvider.id);
        assert.strictEqual(updatedProvider.createdAt, initialProvider.createdAt);
        assert.notStrictEqual(updatedProvider.updatedAt, initialProvider.updatedAt);
      });

      it('should throw error for non-existent provider', async () => {
        await assert.rejects(
          providerManager.updateProvider('non-existent', { name: 'Updated' }),
          /Provider with ID non-existent not found/
        );
      });

      it('should throw error for invalid update data', async () => {
        // First add a provider
        const initialData: ProviderFormData = {
          name: 'Initial Provider',
          type: 'cloud',
          provider: 'openai',
          apiKey: 'initial-key'
        };

        const initialProvider = await providerManager.addProvider(initialData);

        // Try to update with invalid data
        await assert.rejects(
          providerManager.updateProvider(initialProvider.id, { name: '' }),
          /Provider validation failed: Provider name is required/
        );
      });
    });

    describe('deleteProvider', () => {
      it('should delete provider successfully', async () => {
        // First add a provider
        const providerData: ProviderFormData = {
          name: 'Test Provider',
          type: 'cloud',
          provider: 'openai',
          apiKey: 'test-key'
        };

        const provider = await providerManager.addProvider(providerData);
        assert.strictEqual(providerManager.getProviders().length, 1);

        // Delete the provider
        await providerManager.deleteProvider(provider.id);

        // Verify it was deleted
        assert.strictEqual(providerManager.getProviders().length, 0);
        assert.strictEqual(providerManager.getProviderById(provider.id), null);
      });

      it('should throw error for non-existent provider', async () => {
        await assert.rejects(
          providerManager.deleteProvider('non-existent'),
          /Provider with ID non-existent not found/
        );
      });
    });

    describe('toggleProviderStatus', () => {
      it('should toggle provider status successfully', async () => {
        // First add a provider
        const providerData: ProviderFormData = {
          name: 'Test Provider',
          type: 'cloud',
          provider: 'openai',
          apiKey: 'test-key'
        };

        const provider = await providerManager.addProvider(providerData);
        assert.strictEqual(provider.isActive, true);

        // Toggle to inactive
        const inactiveProvider = await providerManager.toggleProviderStatus(provider.id, false);
        assert.strictEqual(inactiveProvider.isActive, false);
        assert.notStrictEqual(inactiveProvider.updatedAt, provider.updatedAt);

        // Toggle back to active
        const activeProvider = await providerManager.toggleProviderStatus(provider.id, true);
        assert.strictEqual(activeProvider.isActive, true);
      });

      it('should throw error for non-existent provider', async () => {
        await assert.rejects(
          providerManager.toggleProviderStatus('non-existent', false),
          /Provider with ID non-existent not found/
        );
      });
    });
  });

  describe('Provider Validation', () => {
    describe('validateProvider', () => {
      it('should validate provider with basic validation failure', async () => {
        const invalidProvider: ProviderConfig = {
          id: 'test-provider',
          name: '',
          type: 'cloud',
          provider: 'openai',
          apiKey: '',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const result = await providerManager.validateProvider(invalidProvider);

        assert.strictEqual(result.valid, false);
        assert.ok(result.error);
        assert.strictEqual(result.connectionStatus, 'unknown');
      });

      it('should handle validation errors gracefully', async () => {
        const validProvider: ProviderConfig = {
          id: 'test-provider',
          name: 'Test Provider',
          type: 'cloud',
          provider: 'openai',
          apiKey: '',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const result = await providerManager.validateProvider(validProvider);

        // Should fail connection test due to missing API key
        assert.strictEqual(result.valid, false);
        assert.ok(result.error);
        assert.strictEqual(result.connectionStatus, 'disconnected');
      });
    });
  });

  describe('API Key Management', () => {
    it('should store and retrieve API keys', async () => {
      const providerId = 'test-provider';
      const apiKey = 'sk-test-key';

      let storedKey: string | undefined;
      let storedValue: string | undefined;

      // Mock secret storage
      const mockStorage = {
        store: async (key: string, value: string) => {
          storedKey = key;
          storedValue = value;
        },
        get: async (key: string) => {
          if (key === storedKey) {
            return storedValue;
          }
          return undefined;
        },
        delete: async (key: string) => {
          if (key === storedKey) {
            storedKey = undefined;
            storedValue = undefined;
          }
        }
      };

      const manager = ProviderManagerService.getInstance(mockStorage as any);

      // Store API key
      await manager.storeProviderApiKey(providerId, apiKey);
      assert.strictEqual(storedKey, `comrade.provider.${providerId}.apiKey`);
      assert.strictEqual(storedValue, apiKey);

      // Retrieve API key
      const retrievedKey = await manager.getProviderApiKey(providerId);
      assert.strictEqual(retrievedKey, apiKey);
    });
  });

  describe('Form Data Validation', () => {
    it('should validate required fields', () => {
      const testCases = [
        { data: { name: '', type: 'cloud', provider: 'openai' }, error: 'Provider name is required' },
        { data: { name: 'Test', type: 'invalid', provider: 'openai' }, error: 'Invalid provider type' },
        { data: { name: 'Test', type: 'cloud', provider: '' }, error: 'Provider type is required' },
        { data: { name: 'Test', type: 'local-network', provider: 'ollama' }, error: 'Endpoint is required for local network providers' }
      ];

      testCases.forEach(({ data, error }) => {
        assert.throws(() => {
          (providerManager as any).validateProviderData(data);
        }, new RegExp(error));
      });
    });

    it('should pass validation for valid data', () => {
      const validCloudData: ProviderFormData = {
        name: 'Test Provider',
        type: 'cloud',
        provider: 'openai'
      };

      const validLocalData: ProviderFormData = {
        name: 'Test Provider',
        type: 'local-network',
        provider: 'ollama',
        endpoint: 'http://localhost:11434'
      };

      assert.doesNotThrow(() => {
        (providerManager as any).validateProviderData(validCloudData);
      });

      assert.doesNotThrow(() => {
        (providerManager as any).validateProviderData(validLocalData);
      });
    });
  });

  describe('Provider ID Generation', () => {
    it('should generate unique provider IDs', () => {
      const id1 = (providerManager as any).generateProviderId();
      const id2 = (providerManager as any).generateProviderId();

      assert.ok(id1);
      assert.ok(id2);
      assert.notStrictEqual(id1, id2);
      assert.ok(id1.startsWith('provider'));
      assert.ok(id2.startsWith('provider'));
    });
  });

  describe('Provider Creation from Form Data', () => {
    it('should create cloud provider from form data', () => {
      const formData: ProviderFormData = {
        name: 'OpenAI Provider',
        type: 'cloud',
        provider: 'openai',
        apiKey: 'sk-test-key'
      };

      const provider = (providerManager as any).createProviderFromFormData(formData);

      assert.ok(provider.id);
      assert.strictEqual(provider.name, 'OpenAI Provider');
      assert.strictEqual(provider.type, 'cloud');
      assert.strictEqual(provider.provider, 'openai');
      assert.strictEqual(provider.isActive, true);
      assert.ok(provider.createdAt);
      assert.ok(provider.updatedAt);
      assert.strictEqual((provider as CloudProvider).apiKey, '');
    });

    it('should create local network provider from form data', () => {
      const formData: ProviderFormData = {
        name: 'Ollama Provider',
        type: 'local-network',
        provider: 'ollama',
        endpoint: 'http://localhost:11434',
        localHostType: 'ollama',
        apiKey: 'optional-key'
      };

      const provider = (providerManager as any).createProviderFromFormData(formData);

      assert.ok(provider.id);
      assert.strictEqual(provider.name, 'Ollama Provider');
      assert.strictEqual(provider.type, 'local-network');
      assert.strictEqual(provider.provider, 'ollama');
      assert.strictEqual((provider as LocalNetworkProvider).endpoint, 'http://localhost:11434');
      assert.strictEqual((provider as LocalNetworkProvider).localHostType, 'ollama');
      assert.strictEqual((provider as LocalNetworkProvider).apiKey, 'optional-key');
    });

    it('should use default endpoint for local network providers', () => {
      const formData: ProviderFormData = {
        name: 'Ollama Provider',
        type: 'local-network',
        provider: 'ollama',
        localHostType: 'ollama'
      };

      const provider = (providerManager as any).createProviderFromFormData(formData);
      assert.strictEqual((provider as LocalNetworkProvider).endpoint, 'http://localhost:11434');
    });
  });

  describe('Dispose', () => {
    it('should dispose without errors', () => {
      assert.doesNotThrow(() => {
        providerManager.dispose();
      });
    });
  });
});