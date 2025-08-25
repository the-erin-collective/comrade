/**
 * Agent Testing Service
 * 
 * This service tests agent configurations during the add/edit process to:
 * 1. Validate that the agent works
 * 2. Auto-detect streaming vs non-streaming capabilities
 * 3. Determine optimal configuration settings
 */

import { Logger } from './logger';
import { ModelManager } from './model-manager';
import { ModelAdapter, ModelConfig } from './model-adapters';
// AgentConfig is no longer needed - using ModelConfig directly

// Create logger instance
const logger = new Logger({ prefix: 'AgentTester' });



/**
 * Detailed test result for a specific test mode
 */
interface TestModeResult {
  attempted: boolean;
  successful: boolean;
  responseTime?: number;
  responseContent?: string;
  error?: string;
}

/**
 * Comprehensive agent test result
 */
export interface AgentTestResult {
  success: boolean;
  responseTime: number;
  error?: string;
  capabilities: {
    supportsStreaming: boolean;
    supportsNonStreaming: boolean;
    preferredStreamingMode: 'streaming' | 'non-streaming';
    hasVision: boolean;
    hasToolUse: boolean;
    maxContextLength: number;
    supportedFormats: string[];
  };
  testDetails: {
    streamingTest: TestModeResult;
    nonStreamingTest: TestModeResult;
  };
}

/**
 * Agent Testing Service
 */
export class AgentTester {
  private modelManager: ModelManager;
  private testPrompt = "Say 'test successful' and nothing else.";
  private testTimeout = 15000; // 15 seconds per test

  constructor() {
    this.modelManager = new ModelManager();
  }

  /**
   * Test an agent configuration comprehensively
   * 
   * @param config - Agent configuration to test
   * @returns Promise resolving to comprehensive test results
   */
  async testAgent(config: ModelConfig): Promise<AgentTestResult> {
    const overallStartTime = Date.now();
    
    logger.info('Starting comprehensive agent test', {
      model: config.name,
      provider: config.provider
    });

    const result: AgentTestResult = {
      success: false,
      responseTime: 0,
      capabilities: {
        supportsStreaming: false,
        supportsNonStreaming: false,
        preferredStreamingMode: 'non-streaming',
        hasVision: false,
        hasToolUse: false,
        maxContextLength: 4096,
        supportedFormats: ['text']
      },
      testDetails: {
        streamingTest: {
          attempted: false,
          successful: false
        },
        nonStreamingTest: {
          attempted: false,
          successful: false
        }
      }
    };

    try {
      // Create model adapter for testing
      const adapter = await this.createTestAdapter(config);
      
      // Test basic connectivity first
      const isConnected = await this.testBasicConnectivity(adapter);
      if (!isConnected) {
        result.error = 'Failed to establish basic connectivity to the model';
        result.responseTime = Date.now() - overallStartTime;
        return result;
      }

      // Test non-streaming mode first (usually more reliable)
      result.testDetails.nonStreamingTest = await this.testNonStreamingMode(adapter);
      
      // Test streaming mode
      result.testDetails.streamingTest = await this.testStreamingMode(adapter);

      // Analyze results and determine capabilities
      this.analyzeTestResults(result);

      // Get additional capabilities from adapter
      const adapterCapabilities = adapter.getCapabilities();
      result.capabilities.hasToolUse = adapterCapabilities.supportsToolCalling;
      result.capabilities.maxContextLength = adapterCapabilities.maxContextLength;
      result.capabilities.supportedFormats = adapterCapabilities.supportedFormats;

      // Detect vision capabilities (basic heuristic based on model name)
      result.capabilities.hasVision = this.detectVisionCapabilities(config.name);

      result.success = result.capabilities.supportsStreaming || result.capabilities.supportsNonStreaming;
      result.responseTime = Date.now() - overallStartTime;

      logger.info('Agent test completed', {
        model: config.name,
        success: result.success,
        supportsStreaming: result.capabilities.supportsStreaming,
        supportsNonStreaming: result.capabilities.supportsNonStreaming,
        preferredMode: result.capabilities.preferredStreamingMode,
        totalTime: result.responseTime
      });

      return result;

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      result.responseTime = Date.now() - overallStartTime;
      
      logger.error('Agent test failed with exception', {
        model: config.name,
        error: result.error,
        totalTime: result.responseTime
      });

      return result;
    }
  }

  /**
   * Create a model adapter for testing purposes
   */
  private async createTestAdapter(config: ModelConfig): Promise<ModelAdapter> {
    // Create test-optimized config with conservative settings
    const testConfig: ModelConfig = {
      ...config,
      temperature: config.temperature || 0.1, // Low temperature for consistent test results
      maxTokens: config.maxTokens || 50, // Small response for quick tests
      timeout: config.timeout || this.testTimeout
    };

    // Create adapter directly based on provider type
    let adapter: ModelAdapter;
    
    switch (config.provider) {
      case 'ollama':
        const { OllamaAdapter } = await import('./model-adapters/ollama-adapter');
        adapter = new OllamaAdapter();
        break;
      case 'openai':
        // Add OpenAI adapter when available
        throw new Error('OpenAI adapter not yet implemented');
      case 'anthropic':
        // Add Anthropic adapter when available
        throw new Error('Anthropic adapter not yet implemented');
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
    
    await adapter.initialize(testConfig);
    return adapter;
  }

  /**
   * Test basic connectivity without sending actual requests
   */
  private async testBasicConnectivity(adapter: ModelAdapter): Promise<boolean> {
    try {
      logger.debug('Testing basic connectivity');
      
      if ('testConnection' in adapter && typeof adapter.testConnection === 'function') {
        return await adapter.testConnection();
      }
      
      // If no testConnection method, assume connectivity is OK
      return true;
    } catch (error) {
      logger.warn('Basic connectivity test failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Test non-streaming mode
   */
  private async testNonStreamingMode(adapter: ModelAdapter): Promise<TestModeResult> {
    const result: TestModeResult = {
      attempted: true,
      successful: false
    };

    const startTime = Date.now();

    try {
      logger.debug('Testing non-streaming mode');
      
      // Format prompt and send request
      const prompt = adapter.formatPrompt([{
        role: 'user',
        content: this.testPrompt,
        timestamp: new Date()
      }], []);

      const response = await adapter.sendRequest(prompt);
      result.responseTime = Date.now() - startTime;
      result.responseContent = response;
      
      // Check if response is valid
      if (response && response.trim().length > 0) {
        result.successful = true;
        logger.debug('Non-streaming test successful', {
          responseTime: result.responseTime,
          responseLength: response.length
        });
      } else {
        result.error = 'Empty or invalid response';
        logger.warn('Non-streaming test failed: empty response');
      }

    } catch (error) {
      result.responseTime = Date.now() - startTime;
      result.error = error instanceof Error ? error.message : String(error);
      
      logger.warn('Non-streaming test failed', {
        error: result.error,
        responseTime: result.responseTime
      });
    }

    return result;
  }

  /**
   * Test streaming mode
   */
  private async testStreamingMode(adapter: ModelAdapter): Promise<TestModeResult> {
    const result: TestModeResult = {
      attempted: true,
      successful: false
    };

    const startTime = Date.now();

    try {
      logger.debug('Testing streaming mode');
      
      // Check if adapter supports streaming
      if (!adapter.supportsStreaming()) {
        result.attempted = false;
        result.error = 'Adapter does not support streaming';
        return result;
      }

      // Format prompt
      const prompt = adapter.formatPrompt([{
        role: 'user',
        content: this.testPrompt,
        timestamp: new Date()
      }], []);

      let fullResponse = '';
      let chunkCount = 0;

      // Send streaming request
      await adapter.sendStreamingRequest(prompt, (chunk) => {
        if (chunk.content) {
          fullResponse += chunk.content;
          chunkCount++;
        }
      });

      result.responseTime = Date.now() - startTime;
      result.responseContent = fullResponse;

      // Check if streaming response is valid
      if (fullResponse && fullResponse.trim().length > 0 && chunkCount > 0) {
        result.successful = true;
        logger.debug('Streaming test successful', {
          responseTime: result.responseTime,
          responseLength: fullResponse.length,
          chunkCount
        });
      } else {
        result.error = `Invalid streaming response (chunks: ${chunkCount}, length: ${fullResponse.length})`;
        logger.warn('Streaming test failed: invalid response', {
          chunkCount,
          responseLength: fullResponse.length
        });
      }

    } catch (error) {
      result.responseTime = Date.now() - startTime;
      result.error = error instanceof Error ? error.message : String(error);
      
      logger.warn('Streaming test failed', {
        error: result.error,
        responseTime: result.responseTime
      });
    }

    return result;
  }

  /**
   * Analyze test results and determine capabilities
   */
  private analyzeTestResults(result: AgentTestResult): void {
    const { streamingTest, nonStreamingTest } = result.testDetails;

    // Determine what modes are supported
    result.capabilities.supportsStreaming = streamingTest.successful;
    result.capabilities.supportsNonStreaming = nonStreamingTest.successful;

    // Determine preferred mode based on test results
    if (streamingTest.successful && nonStreamingTest.successful) {
      // Both work - prefer the faster one, or streaming if similar performance
      const streamingTime = streamingTest.responseTime || Infinity;
      const nonStreamingTime = nonStreamingTest.responseTime || Infinity;
      
      // Prefer streaming if it's within 20% of non-streaming performance
      if (streamingTime <= nonStreamingTime * 1.2) {
        result.capabilities.preferredStreamingMode = 'streaming';
      } else {
        result.capabilities.preferredStreamingMode = 'non-streaming';
      }
    } else if (streamingTest.successful) {
      result.capabilities.preferredStreamingMode = 'streaming';
    } else if (nonStreamingTest.successful) {
      result.capabilities.preferredStreamingMode = 'non-streaming';
    }

    logger.debug('Test analysis complete', {
      supportsStreaming: result.capabilities.supportsStreaming,
      supportsNonStreaming: result.capabilities.supportsNonStreaming,
      preferredMode: result.capabilities.preferredStreamingMode
    });
  }

  /**
   * Detect vision capabilities based on model name
   */
  private detectVisionCapabilities(modelName: string): boolean {
    const visionModels = [
      'gpt-4-vision', 'gpt-4o', 'gpt-4-turbo',
      'claude-3', 'claude-3.5',
      'gemini-pro-vision', 'gemini-1.5',
      'llava', 'bakllava'
    ];

    const lowerModelName = modelName.toLowerCase();
    return visionModels.some(visionModel => 
      lowerModelName.includes(visionModel.toLowerCase())
    );
  }

  /**
   * Infer provider type from provider ID
   */
  private inferProviderType(providerId: string): string {
    // This is a simplified inference - in practice, you'd look up the provider
    // from your provider registry to get the actual provider type
    if (providerId.includes('ollama')) {return 'ollama';}
    if (providerId.includes('openai')) {return 'openai';}
    if (providerId.includes('anthropic')) {return 'anthropic';}
    if (providerId.includes('google')) {return 'google';}
    return 'custom';
  }
}

/**
 * Singleton instance for global use
 */
export const agentTester = new AgentTester();