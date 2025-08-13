/**
 * Integration tests for OllamaAdapter with actual Ollama instance
 * 
 * These tests require a running Ollama instance with at least one model installed.
 * Run manually with: npm run test:integration
 */

import { OllamaAdapter } from '../../core/model-adapters/ollama-adapter';
import { ModelConfig, ChatMessage } from '../../core/model-adapters';

describe('OllamaAdapter Integration Tests', () => {
  let adapter: OllamaAdapter;
  let testConfig: ModelConfig;

  // Skip these tests if Ollama is not available
  const isOllamaAvailable = async (): Promise<boolean> => {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      return response.ok;
    } catch {
      return false;
    }
  };

  beforeEach(async function() {
    // Skip if Ollama is not running
    const available = await isOllamaAvailable();
    if (!available) {
      this.skip();
      return;
    }

    adapter = new OllamaAdapter();
    
    // Get available models and use the first one
    const response = await fetch('http://localhost:11434/api/tags');
    const data = await response.json() as { models?: Array<{ name: string }> };
    const availableModels = data.models || [];
    
    if (availableModels.length === 0) {
      this.skip();
      return;
    }

    testConfig = {
      name: availableModels[0].name,
      provider: 'ollama',
      endpoint: 'http://localhost:11434',
      temperature: 0.1,
      maxTokens: 100
    };
  });

  it('should connect to Ollama and send a simple message', async function() {
    this.timeout(30000); // Allow 30 seconds for model response
    
    await adapter.initialize(testConfig);
    
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Say hello in exactly 3 words.', timestamp: new Date() }
    ];
    
    const prompt = adapter.formatPrompt(messages, []);
    const response = await adapter.sendRequest(prompt);
    
    console.log('Ollama response:', response);
    
    // Basic assertions
    expect(response).toBeDefined();
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });

  it('should maintain conversation context', async function() {
    this.timeout(30000);
    
    await adapter.initialize(testConfig);
    
    // First message
    const messages1: ChatMessage[] = [
      { role: 'user', content: 'My name is Alice.', timestamp: new Date() }
    ];
    
    const prompt1 = adapter.formatPrompt(messages1, []);
    const response1 = await adapter.sendRequest(prompt1);
    
    // Second message referencing the first
    const messages2: ChatMessage[] = [
      { role: 'user', content: 'My name is Alice.', timestamp: new Date() },
      { role: 'assistant', content: response1, timestamp: new Date() },
      { role: 'user', content: 'What is my name?', timestamp: new Date() }
    ];
    
    const prompt2 = adapter.formatPrompt(messages2, []);
    const response2 = await adapter.sendRequest(prompt2);
    
    console.log('Context test - Response 1:', response1);
    console.log('Context test - Response 2:', response2);
    
    // The model should remember the name Alice
    expect(response2.toLowerCase()).toContain('alice');
  });

  it('should handle model capability detection', async function() {
    await adapter.initialize(testConfig);
    
    const capabilities = adapter.getCapabilities();
    
    console.log('Detected capabilities:', capabilities);
    
    expect(capabilities).toBeDefined();
    expect(capabilities.supportsStreaming).toBe(true);
    expect(capabilities.supportsSystemPrompts).toBe(true);
    expect(capabilities.maxContextLength).toBeGreaterThan(0);
  });

  it('should get available models', async function() {
    await adapter.initialize(testConfig);
    
    const models = await adapter.getAvailableModels();
    
    console.log('Available models:', models);
    
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models).toContain(testConfig.name);
  });
});

// Helper function to check if we're in a test environment that supports integration tests
function shouldRunIntegrationTests(): boolean {
  return process.env.RUN_INTEGRATION_TESTS === 'true' || process.env.NODE_ENV === 'integration';
}

// Only run these tests if explicitly requested
if (!shouldRunIntegrationTests()) {
  describe.skip('OllamaAdapter Integration Tests (Skipped)', () => {
    it('should run integration tests when RUN_INTEGRATION_TESTS=true', () => {
      console.log('Integration tests skipped. Set RUN_INTEGRATION_TESTS=true to run.');
    });
  });
}