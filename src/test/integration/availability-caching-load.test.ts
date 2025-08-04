/**
 * Integration tests for availability caching under load conditions
 * Tests cache performance, concurrency, memory usage, and cache invalidation
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { AgentRegistry } from '../../core/registry';
import { ConfigurationManager } from '../../core/config';
import { mockAgentConfigurations, createMockAgent } from '../mocks/agents';

describe('Availability Caching Load Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let agentRegistry: AgentRegistry;
  let configManager: ConfigurationManager;
  let mockSecretStorage: any;  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    
    mockSecretStorage = {
      store: sandbox.stub(),
      get: sandbox.stub().resolves('test-api-key'),
      delete: sandbox.stub(),
      onDidChange: { dispose: () => {} }
    };

    configManager = ConfigurationManager.getInstance(mockSecretStorage);
    agentRegistry = AgentRegistry.getInstance(configManager);

    // Mock agent configurations
    sandbox.stub(configManager, 'getAllAgents').resolves(
      mockAgentConfigurations.map(createMockAgent)
    );
    
    await agentRegistry.initialize();
  });  afterEach(() => {
    sandbox.restore();
    AgentRegistry.resetInstance();
    ConfigurationManager.resetInstance();
  });

  it('should handle high-frequency availability checks efficiently', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock successful availability response
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: 'Available' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
      })
    });

    const agent = agentRegistry.getAgent('openai-gpt4')!;
    const checkCount = 100;
    const startTime = Date.now();

    // Perform many availability checks rapidly
    const checks = Array.from({ length: checkCount }, () => 
      agent.isAvailable()
    );

    const results = await Promise.all(checks);
    const endTime = Date.now();

    // All checks should succeed
    results.forEach((result, i) => {
      assert.strictEqual(result, true, `Check ${i + 1} should succeed`);
    });

    // Should use caching to reduce API calls
    assert.ok(fetchStub.callCount < checkCount, 'Should cache results to reduce API calls');
    assert.ok(fetchStub.callCount >= 1, 'Should make at least one API call');

    // Should complete quickly due to caching
    const executionTime = endTime - startTime;
    assert.ok(executionTime < 5000, `Should complete quickly (took ${executionTime}ms)`);

    console.log(`Completed ${checkCount} availability checks in ${executionTime}ms with ${fetchStub.callCount} API calls`);
  });

  it('should handle concurrent availability checks from multiple agents', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock different response times for different agents
    fetchStub.callsFake((...args: any[]) => {
      const url = args[0] as string;
      const delay = url.includes('openai') ? 100 : 
                   url.includes('anthropic') ? 150 : 
                   url.includes('ollama') ? 200 : 50;
      
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              choices: [{
                message: { content: 'Available' },
                finish_reason: 'stop'
              }],
              usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
            })
          });
        }, delay);
      });
    });

    const agents = agentRegistry.getAgents();
    const checksPerAgent = 20;
    const startTime = Date.now();

    // Create concurrent checks for all agents
    const allChecks = agents.flatMap(agent => 
      Array.from({ length: checksPerAgent }, () => agent.isAvailable())
    );

    const results = await Promise.all(allChecks);
    const endTime = Date.now();

    // All checks should succeed
    results.forEach((result, i) => {
      assert.strictEqual(result, true, `Concurrent check ${i + 1} should succeed`);
    });

    const totalChecks = agents.length * checksPerAgent;
    const executionTime = endTime - startTime;

    // Should handle concurrency efficiently
    assert.ok(executionTime < 10000, `Should handle concurrency efficiently (took ${executionTime}ms for ${totalChecks} checks)`);
    
    // Should use caching to reduce API calls
    assert.ok(fetchStub.callCount < totalChecks, 'Should cache results across concurrent requests');

    console.log(`Completed ${totalChecks} concurrent checks across ${agents.length} agents in ${executionTime}ms with ${fetchStub.callCount} API calls`);
  });

  it('should handle cache expiration and refresh under load', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    let callCount = 0;
    fetchStub.callsFake(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          choices: [{
            message: { content: `Available ${callCount}` },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
        })
      });
    });

    const agent = agentRegistry.getAgent('openai-gpt4')!;
    
    // Set short cache TTL for testing
    const originalTTL = (agentRegistry as any).cacheTTL;
    (agentRegistry as any).cacheTTL = 100; // 100ms

    try {
      // First batch of checks - should hit cache
      const firstBatch = await Promise.all(
        Array.from({ length: 10 }, () => agent.isAvailable())
      );
      
      const firstCallCount = fetchStub.callCount;
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Second batch - should refresh cache
      const secondBatch = await Promise.all(
        Array.from({ length: 10 }, () => agent.isAvailable())
      );
      
      const secondCallCount = fetchStub.callCount;

      // First batch should all succeed with minimal API calls
      firstBatch.forEach(result => assert.strictEqual(result, true));
      assert.ok(firstCallCount <= 2, 'First batch should use cache');

      // Second batch should succeed with cache refresh
      secondBatch.forEach(result => assert.strictEqual(result, true));
      assert.ok(secondCallCount > firstCallCount, 'Second batch should refresh cache');
      assert.ok(secondCallCount <= firstCallCount + 2, 'Should not make excessive refresh calls');

    } finally {
      (agentRegistry as any).cacheTTL = originalTTL;
    }
  });

  it('should handle cache memory usage efficiently', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: 'Available' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
      })
    });

    // Create many agents to test memory usage
    const manyAgents = Array.from({ length: 100 }, (_, i) => {
      const config = {
        ...mockAgentConfigurations[0],
        id: `test-agent-${i}`,
        name: `Test Agent ${i}`
      };
      return createMockAgent(config);
    });

    // Add agents to registry
    manyAgents.forEach(agent => {
      (agentRegistry as any).agents.set(agent.id, agent);
    });

    const initialMemory = process.memoryUsage().heapUsed;

    // Check availability for all agents multiple times
    const allChecks = manyAgents.flatMap(agent => 
      Array.from({ length: 5 }, () => agent.isAvailable())
    );

    await Promise.all(allChecks);

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be reasonable (less than 50MB for 500 cache entries)
    assert.ok(memoryIncrease < 50 * 1024 * 1024, `Memory usage should be reasonable (increased by ${Math.round(memoryIncrease / 1024 / 1024)}MB)`);

    // Verify cache statistics
    const cacheStats = (agentRegistry as any).getCacheStats?.() || {};
    console.log('Cache statistics:', cacheStats);

    // Should have cached entries for all agents
    assert.ok(cacheStats.totalEntries >= manyAgents.length, 'Should cache entries for all agents');
  });

  it('should handle cache invalidation under load', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    let responseToggle = true;
    fetchStub.callsFake(() => {
      responseToggle = !responseToggle;
      return Promise.resolve({
        ok: responseToggle,
        status: responseToggle ? 200 : 503,
        json: () => Promise.resolve(responseToggle ? {
          choices: [{
            message: { content: 'Available' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
        } : {
          error: {
            message: 'Service unavailable',
            type: 'service_unavailable'
          }
        })
      });
    });

    const agent = agentRegistry.getAgent('openai-gpt4')!;
    
    // Perform checks that will alternate between success and failure
    const results: boolean[] = [];
    for (let i = 0; i < 20; i++) {
      const result = await agent.isAvailable();
      results.push(result);
      
      // Clear cache periodically to test invalidation
      if (i % 5 === 0) {
        (agentRegistry as any).clearCache?.(agent.id);
      }
    }

    // Should handle alternating availability correctly
    const successCount = results.filter(r => r === true).length;
    const failureCount = results.filter(r => r === false).length;

    assert.ok(successCount > 0, 'Should have some successful checks');
    assert.ok(failureCount > 0, 'Should have some failed checks');
    assert.ok(fetchStub.callCount > 10, 'Should make multiple API calls due to cache invalidation');

    console.log(`Handled ${results.length} checks with cache invalidation: ${successCount} successes, ${failureCount} failures, ${fetchStub.callCount} API calls`);
  });

  it('should handle cache performance under stress', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    // Mock slow API responses
    fetchStub.callsFake(() => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              choices: [{
                message: { content: 'Available' },
                finish_reason: 'stop'
              }],
              usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
            })
          });
        }, 100); // 100ms delay to simulate slow API
      });
    });

    const agents = agentRegistry.getAgents();
    const stressTestDuration = 2000; // 2 seconds
    const startTime = Date.now();
    let completedChecks = 0;
    let errors = 0;

    // Continuously perform availability checks for the duration
    const stressTest = async () => {
      while (Date.now() - startTime < stressTestDuration) {
        try {
          const agent = agents[Math.floor(Math.random() * agents.length)];
          await agent.isAvailable();
          completedChecks++;
        } catch (error) {
          errors++;
        }
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };

    // Run multiple concurrent stress tests
    const concurrentTests = Array.from({ length: 5 }, () => stressTest());
    await Promise.all(concurrentTests);

    const endTime = Date.now();
    const actualDuration = endTime - startTime;

    console.log(`Stress test completed: ${completedChecks} checks in ${actualDuration}ms with ${errors} errors and ${fetchStub.callCount} API calls`);

    // Should complete many checks efficiently
    assert.ok(completedChecks > 50, 'Should complete many checks during stress test');
    assert.ok(errors === 0, 'Should not have errors during stress test');
    
    // Should use caching to reduce API calls significantly
    const cacheEfficiency = 1 - (fetchStub.callCount / completedChecks);
    assert.ok(cacheEfficiency > 0.8, `Cache should be highly efficient (${Math.round(cacheEfficiency * 100)}% cache hit rate)`);
  });

  it('should handle cache cleanup and garbage collection', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: 'Available' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
      })
    });

    // Set very short cache TTL for testing cleanup
    const originalTTL = (agentRegistry as any).cacheTTL;
    (agentRegistry as any).cacheTTL = 50; // 50ms

    try {
      const agent = agentRegistry.getAgent('openai-gpt4')!;
      
      // Create many cache entries
      for (let i = 0; i < 20; i++) {
        await agent.isAvailable();
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const initialCacheSize = (agentRegistry as any).getCacheStats?.()?.totalEntries || 0;
      
      // Wait for entries to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Trigger cleanup by making new requests
      await agent.isAvailable();
      
      const finalCacheSize = (agentRegistry as any).getCacheStats?.()?.totalEntries || 0;

      // Cache should have been cleaned up
      assert.ok(finalCacheSize < initialCacheSize, 'Cache should clean up expired entries');
      assert.ok(finalCacheSize > 0, 'Should still have current entries');

      console.log(`Cache cleanup: ${initialCacheSize} -> ${finalCacheSize} entries`);

    } finally {
      (agentRegistry as any).cacheTTL = originalTTL;
    }
  });

  it('should handle cache consistency across multiple registry instances', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    let callCount = 0;
    fetchStub.callsFake(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          choices: [{
            message: { content: `Available ${callCount}` },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
        })
      });
    });

    // Create second registry instance (simulating multiple extension instances)
    const configManager2 = ConfigurationManager.getInstance(mockSecretStorage);
    const agentRegistry2 = AgentRegistry.getInstance(configManager2);
    
    sandbox.stub(configManager2, 'getAllAgents').resolves(
      mockAgentConfigurations.map(createMockAgent)
    );
    
    await agentRegistry2.initialize();

    const agent1 = agentRegistry.getAgent('openai-gpt4')!;
    const agent2 = agentRegistry2.getAgent('openai-gpt4')!;

    // Both registries should share cache state (singleton pattern)
    const result1 = await agent1.isAvailable();
    const result2 = await agent2.isAvailable();

    assert.strictEqual(result1, true, 'First registry should succeed');
    assert.strictEqual(result2, true, 'Second registry should succeed');
    
    // Should share cache between instances
    assert.ok(fetchStub.callCount <= 2, 'Should share cache between registry instances');

    console.log(`Cache consistency test: ${fetchStub.callCount} API calls for 2 registry instances`);
  });

  it('should handle cache performance metrics and monitoring', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    let apiCallCount = 0;
    fetchStub.callsFake(() => {
      apiCallCount++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          choices: [{
            message: { content: 'Available' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
        })
      });
    });

    const agent = agentRegistry.getAgent('openai-gpt4')!;
    const totalChecks = 50;

    // Perform availability checks with some cache hits and misses
    for (let i = 0; i < totalChecks; i++) {
      await agent.isAvailable();
      
      // Occasionally clear cache to create misses
      if (i % 10 === 0 && i > 0) {
        (agentRegistry as any).clearCache?.(agent.id);
      }
    }

    // Get cache statistics
    const stats = (agentRegistry as any).getCacheStats?.() || {};
    
    console.log('Cache performance metrics:', {
      totalChecks,
      apiCalls: apiCallCount,
      cacheHitRate: `${Math.round((1 - apiCallCount / totalChecks) * 100)}%`,
      ...stats
    });

    // Verify metrics are reasonable
    assert.ok(apiCallCount < totalChecks, 'Should have cache hits');
    assert.ok(apiCallCount > 0, 'Should have some cache misses');
    
    if (stats.hitRate !== undefined) {
      assert.ok(stats.hitRate > 0.5, 'Cache hit rate should be reasonable');
      assert.ok(stats.hitRate < 1.0, 'Should have some cache misses for testing');
    }

    if (stats.totalEntries !== undefined) {
      assert.ok(stats.totalEntries > 0, 'Should have cache entries');
    }

    if (stats.averageAge !== undefined) {
      assert.ok(stats.averageAge >= 0, 'Average age should be non-negative');
    }
  });

  it('should handle cache behavior during network failures', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    let networkFailure = false;
    fetchStub.callsFake(() => {
      if (networkFailure) {
        return Promise.reject(new Error('Network failure'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          choices: [{
            message: { content: 'Available' },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
        })
      });
    });

    const agent = agentRegistry.getAgent('openai-gpt4')!;

    // First check should succeed and cache result
    const result1 = await agent.isAvailable();
    assert.strictEqual(result1, true, 'First check should succeed');

    // Enable network failure
    networkFailure = true;

    // Subsequent checks should use cached result
    const result2 = await agent.isAvailable();
    assert.strictEqual(result2, true, 'Should use cached result during network failure');

    // Clear cache and try again - should fail
    (agentRegistry as any).clearCache?.(agent.id);
    
    const result3 = await agent.isAvailable();
    assert.strictEqual(result3, false, 'Should fail when cache is cleared and network is down');

    // Restore network
    networkFailure = false;

    // Should recover
    const result4 = await agent.isAvailable();
    assert.strictEqual(result4, true, 'Should recover when network is restored');

    console.log(`Network failure test: ${fetchStub.callCount} API calls with network simulation`);
  });

  it('should handle cache warming and preloading', async () => {
    const fetchStub = sandbox.stub(global, 'fetch' as any);
    
    fetchStub.resolves({
      ok: true,
      status: 200,
      json: sandbox.stub().resolves({
        choices: [{
          message: { content: 'Available' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
      })
    });

    const agents = agentRegistry.getAgents();
    
    // Warm cache for all agents
    const warmupStart = Date.now();
    const warmupPromises = agents.map(agent => agent.isAvailable());
    await Promise.all(warmupPromises);
    const warmupTime = Date.now() - warmupStart;
    const warmupCalls = fetchStub.callCount;

    // Reset call count
    fetchStub.resetHistory();

    // Now perform many checks - should be fast due to cache
    const testStart = Date.now();
    const testPromises = agents.flatMap(agent => 
      Array.from({ length: 10 }, () => agent.isAvailable())
    );
    await Promise.all(testPromises);
    const testTime = Date.now() - testStart;
    const testCalls = fetchStub.callCount;

    console.log(`Cache warming: warmup took ${warmupTime}ms with ${warmupCalls} calls, test took ${testTime}ms with ${testCalls} calls`);

    // Test phase should be much faster and use fewer API calls
    assert.ok(testTime < warmupTime, 'Cached checks should be faster than initial warmup');
    assert.ok(testCalls < warmupCalls, 'Cached checks should use fewer API calls');
    assert.ok(testCalls === 0, 'Should use only cached results after warmup');
  });
});

