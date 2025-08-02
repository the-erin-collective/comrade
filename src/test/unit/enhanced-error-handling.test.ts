/**
 * Comprehensive tests for enhanced provider-specific error handling
 */

import * as assert from 'assert';
import { ErrorMapper, ErrorRecovery, EnhancedError, ErrorContext } from '../../core/error-handler';
import { LLMProvider } from '../../core/agent';

suite('Enhanced Error Handling Tests', () => {
  
  suite('ErrorMapper - OpenAI Provider', () => {
    test('should map OpenAI rate limit error with retry-after header', () => {
      const error = {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '60' },
        error: {
          message: 'Rate limit exceeded',
          code: 'rate_limit_exceeded'
        }
      };

      const context: ErrorContext = {
        provider: 'openai',
        operation: 'send_message',
        retryCount: 0,
        timestamp: new Date()
      };

      const result = ErrorMapper.mapProviderError('openai', error, context);

      assert.strictEqual(result.code, 'rate_limit_exceeded');
      assert.strictEqual(result.provider, 'openai');
      assert.strictEqual(result.statusCode, 429);
      assert.strictEqual(result.retryAfter, 60);
      assert.strictEqual(result.retryable, true);
      assert.ok(result.suggestedFix?.includes('Wait 60 seconds'));
      assert.ok(result.suggestedFix?.includes('upgrading your OPENAI plan'));
    });

    test('should map OpenAI context length exceeded error with suggestions', () => {
      const error = {
        status: 400,
        error: {
          message: 'This model\'s maximum context length is 4097 tokens. However, your messages resulted in 5000 tokens.',
          code: 'context_length_exceeded'
        }
      };

      const result = ErrorMapper.mapProviderError('openai', error);

      assert.strictEqual(result.code, 'context_length_exceeded');
      assert.strictEqual(result.retryable, false);
      assert.ok(result.suggestedFix?.includes('Current: 5000 tokens'));
      assert.ok(result.suggestedFix?.includes('Maximum: 4097 tokens'));
      assert.ok(result.suggestedFix?.includes('GPT-4 Turbo'));
      assert.ok(result.suggestedFix?.includes('Shortening your message'));
    });

    test('should map OpenAI authentication error', () => {
      const error = {
        status: 401,
        error: {
          message: 'Invalid API key provided',
          code: 'invalid_api_key'
        }
      };

      const result = ErrorMapper.mapProviderError('openai', error);

      assert.strictEqual(result.code, 'invalid_api_key');
      assert.strictEqual(result.retryable, false);
      assert.ok(result.suggestedFix?.includes('Check your OPENAI API key'));
      assert.ok(result.suggestedFix?.includes('valid and has the necessary permissions'));
    });

    test('should map OpenAI quota exceeded error', () => {
      const error = {
        status: 429,
        error: {
          message: 'You exceeded your current quota',
          code: 'insufficient_quota'
        }
      };

      const result = ErrorMapper.mapProviderError('openai', error);

      assert.strictEqual(result.code, 'quota_exceeded');
      assert.strictEqual(result.retryable, false);
      assert.ok(result.suggestedFix?.includes('quota has been exceeded'));
      assert.ok(result.suggestedFix?.includes('billing settings'));
    });

    test('should map OpenAI model not found error', () => {
      const error = {
        status: 404,
        error: {
          message: 'The model `gpt-5` does not exist',
          code: 'model_not_found'
        }
      };

      const result = ErrorMapper.mapProviderError('openai', error);

      assert.strictEqual(result.code, 'model_not_found');
      assert.strictEqual(result.retryable, false);
      assert.ok(result.suggestedFix?.includes('model name'));
      assert.ok(result.suggestedFix?.includes('supported by OPENAI'));
    });

    test('should map OpenAI server error as retryable', () => {
      const error = {
        status: 500,
        error: {
          message: 'Internal server error',
          code: 'server_error'
        }
      };

      const result = ErrorMapper.mapProviderError('openai', error);

      assert.strictEqual(result.code, 'server_error');
      assert.strictEqual(result.retryable, true);
      assert.ok(result.suggestedFix?.includes('server error'));
      assert.ok(result.suggestedFix?.includes('try again in a few moments'));
    });

    test('should handle OpenAI error without structured error code', () => {
      const error = {
        status: 400,
        message: 'This model\'s maximum context length is exceeded'
      };

      const result = ErrorMapper.mapProviderError('openai', error);

      assert.strictEqual(result.code, 'context_length_exceeded');
      assert.strictEqual(result.retryable, false);
    });
  });

  suite('ErrorMapper - Anthropic Provider', () => {
    test('should map Anthropic rate limit error', () => {
      const error = {
        status: 429,
        headers: { 'retry-after': '30' },
        error: {
          type: 'rate_limit_error',
          message: 'Rate limit exceeded'
        }
      };

      const result = ErrorMapper.mapProviderError('anthropic', error);

      assert.strictEqual(result.code, 'rate_limit_exceeded');
      assert.strictEqual(result.provider, 'anthropic');
      assert.strictEqual(result.retryAfter, 30);
      assert.strictEqual(result.retryable, true);
      assert.ok(result.suggestedFix?.includes('Wait 30 seconds'));
    });

    test('should map Anthropic authentication error', () => {
      const error = {
        status: 401,
        error: {
          type: 'authentication_error',
          message: 'Invalid API key'
        }
      };

      const result = ErrorMapper.mapProviderError('anthropic', error);

      assert.strictEqual(result.code, 'invalid_api_key');
      assert.strictEqual(result.retryable, false);
      assert.ok(result.suggestedFix?.includes('ANTHROPIC API key'));
    });

    test('should map Anthropic context length error with Claude-specific suggestions', () => {
      const error = {
        status: 400,
        error: {
          type: 'invalid_request_error',
          message: 'Input is too long. Maximum context length is 200000 tokens.'
        }
      };

      const result = ErrorMapper.mapProviderError('anthropic', error);

      assert.strictEqual(result.code, 'context_length_exceeded');
      assert.strictEqual(result.retryable, false);
      assert.ok(result.suggestedFix?.includes('Claude-3 models'));
      assert.ok(result.suggestedFix?.includes('200K tokens'));
    });

    test('should map Anthropic overloaded error as retryable', () => {
      const error = {
        status: 503,
        error: {
          type: 'overloaded_error',
          message: 'The model is currently overloaded'
        }
      };

      const result = ErrorMapper.mapProviderError('anthropic', error);

      assert.strictEqual(result.code, 'server_overloaded');
      assert.strictEqual(result.retryable, true);
    });

    test('should handle Anthropic error without type field', () => {
      const error = {
        status: 403,
        message: 'Forbidden'
      };

      const result = ErrorMapper.mapProviderError('anthropic', error);

      assert.strictEqual(result.code, 'forbidden');
      assert.strictEqual(result.retryable, false);
    });
  });

  suite('ErrorMapper - Ollama Provider', () => {
    test('should map Ollama model not found error', () => {
      const error = {
        status: 404,
        error: 'model "nonexistent-model" not found'
      };

      const result = ErrorMapper.mapProviderError('ollama', error);

      assert.strictEqual(result.code, 'model_not_found');
      assert.strictEqual(result.retryable, false);
      assert.ok(result.suggestedFix?.includes('model name'));
    });

    test('should map Ollama connection refused error', () => {
      const error = {
        message: 'Connection refused to localhost:11434'
      };

      const result = ErrorMapper.mapProviderError('ollama', error);

      assert.strictEqual(result.code, 'connection_refused');
      assert.strictEqual(result.retryable, true);
      assert.ok(result.suggestedFix?.includes('Ollama server is not running'));
      assert.ok(result.suggestedFix?.includes('ollama serve'));
    });

    test('should map Ollama out of memory error', () => {
      const error = {
        error: 'Out of memory: failed to allocate tensor'
      };

      const result = ErrorMapper.mapProviderError('ollama', error);

      assert.strictEqual(result.code, 'out_of_memory');
      assert.strictEqual(result.retryable, false);
      assert.ok(result.suggestedFix?.includes('ran out of memory'));
      assert.ok(result.suggestedFix?.includes('smaller model'));
    });

    test('should map Ollama timeout error', () => {
      const error = {
        message: 'Request timeout after 30 seconds'
      };

      const result = ErrorMapper.mapProviderError('ollama', error);

      assert.strictEqual(result.code, 'timeout');
      assert.strictEqual(result.retryable, true);
      assert.ok(result.suggestedFix?.includes('timed out'));
    });

    test('should map Ollama context length error with suggestions', () => {
      const error = {
        error: 'Context length exceeded: 4096 tokens'
      };

      const result = ErrorMapper.mapProviderError('ollama', error);

      assert.strictEqual(result.code, 'context_length_exceeded');
      assert.strictEqual(result.retryable, false);
      assert.ok(result.suggestedFix?.includes('larger variant'));
    });
  });

  suite('ErrorMapper - Custom Provider', () => {
    test('should map custom provider error using OpenAI format', () => {
      const error = {
        status: 429,
        headers: { 'retry-after': '45' },
        error: {
          message: 'Rate limit exceeded',
          code: 'rate_limit_exceeded'
        }
      };

      const result = ErrorMapper.mapProviderError('custom', error);

      assert.strictEqual(result.code, 'rate_limit_exceeded');
      assert.strictEqual(result.provider, 'custom');
      assert.strictEqual(result.retryAfter, 45);
      assert.strictEqual(result.retryable, true);
      assert.ok(result.suggestedFix?.includes('CUSTOM plan'));
    });

    test('should handle custom provider with unknown error format', () => {
      const error = {
        status: 500,
        message: 'Unknown custom error'
      };

      const result = ErrorMapper.mapProviderError('custom', error);

      assert.strictEqual(result.provider, 'custom');
      assert.strictEqual(result.retryable, true); // 500 errors are retryable
    });
  });

  suite('ErrorMapper - Generic Errors', () => {
    test('should handle unknown provider', () => {
      const error = {
        message: 'Unknown error'
      };

      const result = ErrorMapper.mapProviderError('unknown' as LLMProvider, error);

      assert.strictEqual(result.code, 'unknown_error');
      assert.strictEqual(result.provider, 'unknown');
      assert.strictEqual(result.retryable, false);
      assert.ok(result.suggestedFix?.includes('provider documentation'));
    });

    test('should extract retry-after from various header formats', () => {
      const testCases = [
        { headers: { 'retry-after': '60' }, expected: 60 },
        { headers: { 'Retry-After': '30' }, expected: 30 },
        { headers: { 'retry-after': 'invalid' }, expected: undefined },
        { headers: {}, expected: undefined },
        { headers: null, expected: undefined }
      ];

      testCases.forEach(({ headers, expected }) => {
        const error = {
          status: 429,
          headers,
          error: { message: 'Rate limit', code: 'rate_limit_exceeded' }
        };

        const result = ErrorMapper.mapProviderError('openai', error);
        assert.strictEqual(result.retryAfter, expected);
      });
    });
  });

  suite('ErrorRecovery', () => {
    test('should identify retryable errors correctly', () => {
      const retryableError: EnhancedError = {
        code: 'rate_limit_exceeded',
        message: 'Rate limit exceeded',
        provider: 'openai',
        retryable: true
      };

      const nonRetryableError: EnhancedError = {
        code: 'invalid_api_key',
        message: 'Invalid API key',
        provider: 'openai',
        retryable: false
      };

      assert.strictEqual(ErrorRecovery.isRetryable(retryableError), true);
      assert.strictEqual(ErrorRecovery.isRetryable(nonRetryableError), false);
    });

    test('should calculate exponential backoff with jitter', () => {
      const baseDelay = 1000;
      const maxDelay = 30000;

      // Test exponential growth
      const delay0 = ErrorRecovery.getRetryDelay(0, baseDelay, maxDelay);
      const delay1 = ErrorRecovery.getRetryDelay(1, baseDelay, maxDelay);
      const delay2 = ErrorRecovery.getRetryDelay(2, baseDelay, maxDelay);

      // Should be approximately baseDelay * 2^attempt, with jitter
      assert.ok(delay0 >= baseDelay * 0.75 && delay0 <= baseDelay * 1.25);
      assert.ok(delay1 >= baseDelay * 2 * 0.75 && delay1 <= baseDelay * 2 * 1.25);
      assert.ok(delay2 >= baseDelay * 4 * 0.75 && delay2 <= baseDelay * 4 * 1.25);

      // Test max delay cap
      const delayLarge = ErrorRecovery.getRetryDelay(10, baseDelay, maxDelay);
      assert.ok(delayLarge <= maxDelay * 1.25); // Allow for jitter
    });

    test('should respect retry-after header', () => {
      const retryAfter = 60; // seconds
      const delay = ErrorRecovery.getRetryDelayWithHeader(0, retryAfter);

      // Should be retry-after in milliseconds plus buffer
      assert.ok(delay >= 60000 && delay <= 60200);
    });

    test('should determine retry eligibility correctly', () => {
      const retryableError: EnhancedError = {
        code: 'server_error',
        message: 'Server error',
        provider: 'openai',
        retryable: true
      };

      const nonRetryableError: EnhancedError = {
        code: 'invalid_api_key',
        message: 'Invalid API key',
        provider: 'openai',
        retryable: false
      };

      const rateLimitError: EnhancedError = {
        code: 'rate_limit_exceeded',
        message: 'Rate limit exceeded',
        provider: 'openai',
        retryable: true
      };

      // Normal retryable error within limits
      assert.strictEqual(ErrorRecovery.shouldRetry(retryableError, 1, 3), true);
      
      // Exceeded max retries
      assert.strictEqual(ErrorRecovery.shouldRetry(retryableError, 3, 3), false);
      
      // Non-retryable error
      assert.strictEqual(ErrorRecovery.shouldRetry(nonRetryableError, 1, 3), false);
      
      // Rate limit error gets extra retries
      assert.strictEqual(ErrorRecovery.shouldRetry(rateLimitError, 4, 3), true);
      assert.strictEqual(ErrorRecovery.shouldRetry(rateLimitError, 5, 3), false);
    });
  });

  suite('Context Length Error Suggestions', () => {
    test('should provide specific suggestions for different providers', () => {
      const contextError = {
        status: 400,
        error: {
          message: 'This model\'s maximum context length is 4097 tokens. However, your messages resulted in 5000 tokens.',
          code: 'context_length_exceeded'
        }
      };

      const openaiResult = ErrorMapper.mapProviderError('openai', contextError);
      const anthropicResult = ErrorMapper.mapProviderError('anthropic', contextError);
      const ollamaResult = ErrorMapper.mapProviderError('ollama', contextError);

      // OpenAI-specific suggestions
      assert.ok(openaiResult.suggestedFix?.includes('GPT-4 Turbo'));
      assert.ok(openaiResult.suggestedFix?.includes('GPT-4o'));

      // Anthropic-specific suggestions
      assert.ok(anthropicResult.suggestedFix?.includes('Claude-3 models'));
      assert.ok(anthropicResult.suggestedFix?.includes('200K tokens'));

      // Ollama-specific suggestions
      assert.ok(ollamaResult.suggestedFix?.includes('larger variant'));

      // Common suggestions for all providers
      [openaiResult, anthropicResult, ollamaResult].forEach(result => {
        assert.ok(result.suggestedFix?.includes('Shortening your message'));
        assert.ok(result.suggestedFix?.includes('Breaking your request'));
        assert.ok(result.suggestedFix?.includes('larger context window'));
      });
    });

    test('should extract token information from error messages', () => {
      const testCases = [
        {
          message: 'Maximum context length is 4097 tokens. Current: 5000 tokens.',
          expectedCurrent: '5000',
          expectedMax: '4097'
        },
        {
          message: 'Context length exceeded: used 8192 tokens, maximum is 4096 tokens',
          expectedCurrent: '8192',
          expectedMax: '4096'
        },
        {
          message: 'Too many tokens: 10000 (max: 8192)',
          expectedCurrent: '10000',
          expectedMax: '8192'
        }
      ];

      testCases.forEach(({ message, expectedCurrent, expectedMax }) => {
        const error = {
          status: 400,
          error: { message, code: 'context_length_exceeded' }
        };

        const result = ErrorMapper.mapProviderError('openai', error);
        
        if (expectedCurrent && expectedMax) {
          assert.ok(result.suggestedFix?.includes(`Current: ${expectedCurrent} tokens`));
          assert.ok(result.suggestedFix?.includes(`Maximum: ${expectedMax} tokens`));
        }
      });
    });
  });

  suite('Error Context Handling', () => {
    test('should preserve error context information', () => {
      const context: ErrorContext = {
        provider: 'openai',
        operation: 'send_message',
        retryCount: 2,
        timestamp: new Date('2024-01-01T12:00:00Z'),
        requestId: 'req-123'
      };

      const error = {
        status: 500,
        error: { message: 'Server error', code: 'server_error' }
      };

      const result = ErrorMapper.mapProviderError('openai', error, context);

      assert.strictEqual(result.context?.provider, 'openai');
      assert.strictEqual(result.context?.operation, 'send_message');
      assert.strictEqual(result.context?.retryCount, 2);
      assert.strictEqual(result.context?.requestId, 'req-123');
      assert.deepStrictEqual(result.context?.timestamp, new Date('2024-01-01T12:00:00Z'));
    });

    test('should handle missing context gracefully', () => {
      const error = {
        status: 429,
        error: { message: 'Rate limit', code: 'rate_limit_exceeded' }
      };

      const result = ErrorMapper.mapProviderError('openai', error);

      assert.strictEqual(result.code, 'rate_limit_exceeded');
      assert.strictEqual(result.provider, 'openai');
      assert.strictEqual(result.context, undefined);
    });
  });
});