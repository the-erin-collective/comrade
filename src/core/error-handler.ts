/**
 * Enhanced provider-specific error handling with comprehensive error mapping,
 * retry-after header handling, and context length error suggestions
 */

import { LLMProvider } from './agent';

export interface ErrorContext {
  provider: LLMProvider;
  operation: string;
  retryCount: number;
  timestamp: Date;
  requestId?: string;
  statusCode?: number;
  errorType?: string;
  responseKeys?: string[];
  choiceType?: string;
  choiceValue?: string;
  messageType?: string;
  messageValue?: string;
  messageKeys?: string[];
  responseText?: string;
  contentType?: string;
  choicesLength?: number | string;
}

export interface EnhancedError {
  code: string;
  message: string;
  provider: LLMProvider;
  statusCode?: number;
  retryAfter?: number;
  suggestedFix?: string;
  context?: ErrorContext;
  retryable: boolean;
  originalError?: any;
}

export class ErrorMapper {
  /**
   * Map provider-specific errors to standardized error codes with enhanced context
   */
  static mapProviderError(provider: LLMProvider, error: any, context?: ErrorContext): EnhancedError {
    switch (provider) {
      case 'openai':
        return this.mapOpenAIError(error, context);
      case 'anthropic':
        return this.mapAnthropicError(error, context);
      case 'ollama':
        return this.mapOllamaError(error, context);
      case 'custom':
        return this.mapCustomError(error, context);
      default:
        return this.mapGenericError(error, provider, context);
    }
  }

  /**
   * Map OpenAI-specific errors with comprehensive error codes
   */
  private static mapOpenAIError(error: any, context?: ErrorContext): EnhancedError {
    const statusCode = error.status || error.statusCode;
    const errorData = error.error || error;
    const errorCode = errorData.code || errorData.type;
    const message = errorData.message || error.message || 'Unknown OpenAI error';

    // Extract retry-after header if present
    const retryAfter = this.extractRetryAfter(error);

    // Map specific OpenAI error codes
    const mappedError = this.mapOpenAIErrorCode(errorCode, message, statusCode);
    
    return {
      ...mappedError,
      provider: 'openai',
      statusCode,
      retryAfter,
      context,
      originalError: error,
      suggestedFix: this.getSuggestedFix(mappedError.code, 'openai', { statusCode, retryAfter, message })
    };
  }

  /**
   * Map Anthropic-specific errors with comprehensive error codes
   */
  private static mapAnthropicError(error: any, context?: ErrorContext): EnhancedError {
    const statusCode = error.status || error.statusCode;
    const errorData = error.error || error;
    const errorType = errorData.type;
    const message = errorData.message || error.message || 'Unknown Anthropic error';

    // Extract retry-after header if present
    const retryAfter = this.extractRetryAfter(error);

    // Map Anthropic error types
    const mappedError = this.mapAnthropicErrorType(errorType, message, statusCode);
    
    return {
      ...mappedError,
      provider: 'anthropic',
      statusCode,
      retryAfter,
      context,
      originalError: error,
      suggestedFix: this.getSuggestedFix(mappedError.code, 'anthropic', { statusCode, retryAfter, message })
    };
  }

  /**
   * Map Ollama-specific errors with comprehensive error codes
   */
  private static mapOllamaError(error: any, context?: ErrorContext): EnhancedError {
    const statusCode = error.status || error.statusCode;
    const message = error.error || error.message || 'Unknown Ollama error';

    // Ollama doesn't typically use structured error codes, so we parse the message
    const mappedError = this.mapOllamaErrorMessage(message, statusCode);
    
    return {
      ...mappedError,
      provider: 'ollama',
      statusCode,
      context,
      originalError: error,
      suggestedFix: this.getSuggestedFix(mappedError.code, 'ollama', { statusCode, message })
    };
  }

  /**
   * Map custom provider errors (assumes OpenAI-compatible format)
   */
  private static mapCustomError(error: any, context?: ErrorContext): EnhancedError {
    const statusCode = error.status || error.statusCode;
    const errorData = error.error || error;
    const errorCode = errorData.code || errorData.type;
    const message = errorData.message || error.message || 'Unknown custom provider error';

    // Extract retry-after header if present
    const retryAfter = this.extractRetryAfter(error);

    // Use OpenAI mapping as fallback for custom providers
    const mappedError = this.mapOpenAIErrorCode(errorCode, message, statusCode);
    
    return {
      ...mappedError,
      provider: 'custom',
      statusCode,
      retryAfter,
      context,
      originalError: error,
      suggestedFix: this.getSuggestedFix(mappedError.code, 'custom', { statusCode, retryAfter, message })
    };
  }

  /**
   * Map generic errors for unknown providers
   */
  private static mapGenericError(error: any, provider: LLMProvider, context?: ErrorContext): EnhancedError {
    const statusCode = error.status || error.statusCode;
    const message = error.message || 'Unknown error';

    return {
      code: 'unknown_error',
      message,
      provider,
      statusCode,
      context,
      originalError: error,
      retryable: statusCode ? statusCode >= 500 : false,
      suggestedFix: 'Check the provider documentation for error details'
    };
  }

  /**
   * Map OpenAI error codes to standardized codes
   */
  private static mapOpenAIErrorCode(code: string | undefined, message: string, statusCode?: number): { code: string; message: string; retryable: boolean } {
    if (!code) {
      // Fallback to message-based detection
      const messageLower = message.toLowerCase();
      if (messageLower.includes('context length') || messageLower.includes('maximum context')) {
        return { code: 'context_length_exceeded', message, retryable: false };
      }
      if (messageLower.includes('rate limit') || messageLower.includes('too many requests')) {
        return { code: 'rate_limit_exceeded', message, retryable: true };
      }
      if (messageLower.includes('api key') || messageLower.includes('authentication')) {
        return { code: 'invalid_api_key', message, retryable: false };
      }
      if (messageLower.includes('quota') || messageLower.includes('billing')) {
        return { code: 'quota_exceeded', message, retryable: false };
      }
      if (messageLower.includes('model') && messageLower.includes('not found')) {
        return { code: 'model_not_found', message, retryable: false };
      }
      return { code: 'api_error', message, retryable: statusCode ? statusCode >= 500 : false };
    }

    switch (code) {
      case 'context_length_exceeded':
      case 'max_tokens_exceeded':
        return { code: 'context_length_exceeded', message, retryable: false };
      case 'rate_limit_exceeded':
      case 'rate_limit_error':
        return { code: 'rate_limit_exceeded', message, retryable: true };
      case 'invalid_api_key':
      case 'authentication_error':
        return { code: 'invalid_api_key', message, retryable: false };
      case 'invalid_request_error':
        // Check message for more specific error
        if (message.toLowerCase().includes('context length')) {
          return { code: 'context_length_exceeded', message, retryable: false };
        }
        return { code: 'invalid_request', message, retryable: false };
      case 'insufficient_quota':
      case 'quota_exceeded':
        return { code: 'quota_exceeded', message, retryable: false };
      case 'model_not_found':
        return { code: 'model_not_found', message, retryable: false };
      case 'server_error':
      case 'service_unavailable':
      case 'internal_server_error':
        return { code: 'server_error', message, retryable: true };
      case 'timeout':
        return { code: 'timeout', message, retryable: true };
      case 'network_error':
        return { code: 'network_error', message, retryable: true };
      default:
        return { code: code, message, retryable: statusCode ? statusCode >= 500 : false };
    }
  }

  /**
   * Map Anthropic error types to standardized codes
   */
  private static mapAnthropicErrorType(type: string | undefined, message: string, statusCode?: number): { code: string; message: string; retryable: boolean } {
    if (!type) {
      // Fallback to HTTP status code mapping
      return this.mapHttpStatusToError(statusCode || 500, message);
    }

    switch (type) {
      case 'invalid_request_error':
        if (message.toLowerCase().includes('context') || message.toLowerCase().includes('token')) {
          return { code: 'context_length_exceeded', message, retryable: false };
        }
        return { code: 'invalid_request', message, retryable: false };
      case 'authentication_error':
        return { code: 'invalid_api_key', message, retryable: false };
      case 'permission_error':
        return { code: 'forbidden', message, retryable: false };
      case 'not_found_error':
        return { code: 'not_found', message, retryable: false };
      case 'rate_limit_error':
        return { code: 'rate_limit_exceeded', message, retryable: true };
      case 'api_error':
        return { code: 'server_error', message, retryable: true };
      case 'overloaded_error':
        return { code: 'server_overloaded', message, retryable: true };
      default:
        return { code: type, message, retryable: statusCode ? statusCode >= 500 : false };
    }
  }

  /**
   * Map Ollama error messages to standardized codes
   */
  private static mapOllamaErrorMessage(message: string, statusCode?: number): { code: string; message: string; retryable: boolean } {
    const messageLower = message.toLowerCase();

    if (messageLower.includes('model') && messageLower.includes('not found')) {
      return { code: 'model_not_found', message, retryable: false };
    }
    if (messageLower.includes('connection') && messageLower.includes('refused')) {
      return { code: 'connection_refused', message, retryable: true };
    }
    if (messageLower.includes('timeout')) {
      return { code: 'timeout', message, retryable: true };
    }
    if (messageLower.includes('out of memory') || messageLower.includes('oom')) {
      return { code: 'out_of_memory', message, retryable: false };
    }
    if (messageLower.includes('context') && messageLower.includes('length')) {
      return { code: 'context_length_exceeded', message, retryable: false };
    }

    // Fallback to HTTP status code mapping
    return this.mapHttpStatusToError(statusCode || 500, message);
  }

  /**
   * Map HTTP status codes to error information
   */
  private static mapHttpStatusToError(statusCode: number, message: string): { code: string; message: string; retryable: boolean } {
    switch (statusCode) {
      case 400:
        return { code: 'invalid_request', message, retryable: false };
      case 401:
        return { code: 'invalid_api_key', message, retryable: false };
      case 403:
        return { code: 'forbidden', message, retryable: false };
      case 404:
        return { code: 'not_found', message, retryable: false };
      case 429:
        return { code: 'rate_limit_exceeded', message, retryable: true };
      case 500:
        return { code: 'server_error', message, retryable: true };
      case 502:
        return { code: 'bad_gateway', message, retryable: true };
      case 503:
        return { code: 'service_unavailable', message, retryable: true };
      case 504:
        return { code: 'gateway_timeout', message, retryable: true };
      default:
        return { 
          code: statusCode >= 500 ? 'server_error' : 'client_error', 
          message, 
          retryable: statusCode >= 500 
        };
    }
  }

  /**
   * Extract retry-after header from error response
   */
  private static extractRetryAfter(error: any): number | undefined {
    // Check various possible locations for retry-after header
    const headers = error.headers || error.response?.headers;
    if (!headers) return undefined;

    const retryAfter = headers['retry-after'] || headers['Retry-After'];
    if (!retryAfter) {
      return undefined;
    }

    // Parse retry-after value (can be seconds or HTTP date)
    const parsed = parseInt(retryAfter, 10);
    return isNaN(parsed) ? undefined : parsed;
  }

  /**
   * Get suggested fix for specific error codes and providers
   */
  private static getSuggestedFix(code: string, provider: LLMProvider, details: { statusCode?: number; retryAfter?: number; message?: string }): string {
    switch (code) {
      case 'invalid_api_key':
        return `Check your ${provider.toUpperCase()} API key configuration. Ensure it's valid and has the necessary permissions.`;
      
      case 'rate_limit_exceeded':
        const waitTime = details.retryAfter ? `${details.retryAfter} seconds` : 'a few minutes';
        return `Rate limit exceeded. Wait ${waitTime} before retrying, or consider upgrading your ${provider.toUpperCase()} plan for higher limits.`;
      
      case 'context_length_exceeded':
        return this.getContextLengthSuggestion(provider, details.message);
      
      case 'quota_exceeded':
        return `Your ${provider.toUpperCase()} quota has been exceeded. Check your billing settings or upgrade your plan.`;
      
      case 'model_not_found':
        return `The specified model is not available. Check the model name and ensure it's supported by ${provider.toUpperCase()}.`;
      
      case 'server_error':
      case 'server_overloaded':
        return `${provider.toUpperCase()} server error. This is usually temporary - try again in a few moments.`;
      
      case 'connection_refused':
        return provider === 'ollama' 
          ? 'Ollama server is not running. Start Ollama with `ollama serve` or check the endpoint configuration.'
          : `Cannot connect to ${provider.toUpperCase()} server. Check your network connection and endpoint configuration.`;
      
      case 'timeout':
        return 'Request timed out. Try reducing the message length or increasing the timeout setting.';
      
      case 'forbidden':
        return `Access forbidden. Check your ${provider.toUpperCase()} API key permissions and account status.`;
      
      case 'out_of_memory':
        return 'Ollama ran out of memory. Try using a smaller model or reducing the context length.';
      
      default:
        return `Check the ${provider.toUpperCase()} documentation for more information about this error.`;
    }
  }

  /**
   * Get context-specific suggestions for context length errors
   */
  private static getContextLengthSuggestion(provider: LLMProvider, message?: string): string {
    const baseMessage = 'The message is too long for the model\'s context window.';
    
    // Extract token information if available
    const tokenMatch = message?.match(/(\d+)\s*tokens?/i);
    const maxTokenMatch = message?.match(/maximum.*?(\d+)\s*tokens?/i);
    
    let suggestion = baseMessage;
    
    if (tokenMatch && maxTokenMatch) {
      const currentTokens = parseInt(tokenMatch[1]);
      const maxTokens = parseInt(maxTokenMatch[1]);
      const excess = currentTokens - maxTokens;
      suggestion += ` Current: ${currentTokens} tokens, Maximum: ${maxTokens} tokens (${excess} tokens over limit).`;
    }
    
    suggestion += ' Try:';
    suggestion += '\n• Shortening your message or conversation history';
    suggestion += '\n• Using a model with a larger context window';
    suggestion += '\n• Breaking your request into smaller parts';
    
    if (provider === 'openai') {
      suggestion += '\n• Consider using GPT-4 Turbo or GPT-4o for larger context windows';
    } else if (provider === 'anthropic') {
      suggestion += '\n• Consider using Claude-3 models which support up to 200K tokens';
    } else if (provider === 'ollama') {
      suggestion += '\n• Check if a larger variant of your model is available';
    }
    
    return suggestion;
  }
}

export class ErrorRecovery {
  /**
   * Check if an error is retryable
   */
  static isRetryable(error: EnhancedError): boolean {
    return error.retryable;
  }

  /**
   * Get retry delay with exponential backoff and jitter
   */
  static getRetryDelay(attempt: number, baseDelay: number = 1000, maxDelay: number = 30000): number {
    // Exponential backoff: baseDelay * 2^attempt
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    
    // Add jitter (±25% of the delay)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    
    return Math.max(exponentialDelay + jitter, baseDelay);
  }

  /**
   * Get retry delay respecting retry-after header
   */
  static getRetryDelayWithHeader(attempt: number, retryAfter?: number, baseDelay: number = 1000): number {
    if (retryAfter) {
      // Convert seconds to milliseconds and add some buffer
      return (retryAfter * 1000) + 100;
    }
    
    return this.getRetryDelay(attempt, baseDelay);
  }

  /**
   * Check if we should retry based on attempt count and error type
   */
  static shouldRetry(error: EnhancedError, attempt: number, maxRetries: number = 3): boolean {
    if (attempt >= maxRetries) {
      return false;
    }
    
    if (!this.isRetryable(error)) {
      return false;
    }
    
    // Special handling for rate limits - allow more retries
    if (error.code === 'rate_limit_exceeded' && attempt < 5) {
      return true;
    }
    
    return true;
  }
}