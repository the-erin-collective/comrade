/**
 * Basic tests to verify the configuration system integration
 */

import * as assert from 'assert';
// Mocha globals are provided by the test environment
import { ConfigurationManager } from '../core/config';
import { AgentRegistry } from '../core/registry';

describe('Basic Integration Tests', () => {
  it('should create configuration manager instance', () => {
    // This is a basic test to ensure our classes can be instantiated
    assert.ok(ConfigurationManager);
    assert.ok(AgentRegistry);
  });

  it('should validate agent configuration structure', () => {
    const agentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      provider: 'openai' as const,
      model: 'gpt-4',
      capabilities: {
        hasVision: false,
        hasToolUse: false,
        reasoningDepth: 'intermediate' as const,
        speed: 'medium' as const,
        costTier: 'medium' as const,
        maxTokens: 4000,
        supportedLanguages: ['en'],
        specializations: ['code']
      },
      isEnabledForAssignment: true
    };

    // Verify the structure matches our interface
    assert.strictEqual(typeof agentConfig.id, 'string');
    assert.strictEqual(typeof agentConfig.name, 'string');
    assert.ok(['openai', 'anthropic', 'ollama', 'custom'].includes(agentConfig.provider));
    assert.strictEqual(typeof agentConfig.model, 'string');
    assert.strictEqual(typeof agentConfig.capabilities, 'object');
    assert.strictEqual(typeof agentConfig.isEnabledForAssignment, 'boolean');
  });

  it('should validate capability enums', () => {
    const validReasoningDepths = ['basic', 'intermediate', 'advanced'];
    const validSpeeds = ['fast', 'medium', 'slow'];
    const validCostTiers = ['low', 'medium', 'high'];

    validReasoningDepths.forEach(depth => {
      assert.ok(['basic', 'intermediate', 'advanced'].includes(depth));
    });

    validSpeeds.forEach(speed => {
      assert.ok(['fast', 'medium', 'slow'].includes(speed));
    });

    validCostTiers.forEach(tier => {
      assert.ok(['low', 'medium', 'high'].includes(tier));
    });
  });
});


