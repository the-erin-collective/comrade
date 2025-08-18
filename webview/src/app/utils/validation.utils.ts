/**
 * Validation utilities for provider and agent management
 * 
 * This file contains comprehensive validation functions for provider configurations,
 * agent configurations, form data, and network connections.
 */

import { ProviderConfig, ProviderFormData, AgentFormData, ValidationResult, ConnectionTestResult } from '../interfaces/provider-agent.interface';

/**
 * Interface for validation rules
 */
export interface ValidationRule {
  validate(value: any, fieldName: string, formData?: any): ValidationResult;
}

/**
 * Real-time validation state
 */
export interface FieldValidationState {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  isValidating: boolean;
  lastValidated?: Date;
}

/**
 * Form validation state manager
 */
export class FormValidationState {
  private fieldStates = new Map<string, FieldValidationState>();
  private validationTimeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Set field validation state
   */
  setFieldState(fieldName: string, state: Partial<FieldValidationState>): void {
    const currentState = this.fieldStates.get(fieldName) || {
      isValid: true,
      errors: [],
      warnings: [],
      isValidating: false
    };

    this.fieldStates.set(fieldName, {
      ...currentState,
      ...state,
      lastValidated: new Date()
    });
  }

  /**
   * Get field validation state
   */
  getFieldState(fieldName: string): FieldValidationState {
    return this.fieldStates.get(fieldName) || {
      isValid: true,
      errors: [],
      warnings: [],
      isValidating: false
    };
  }

  /**
   * Validate field with debouncing
   */
  validateFieldDebounced(
    fieldName: string, 
    value: any, 
    validationRules: ValidationRule[], 
    debounceMs: number = 300
  ): Promise<ValidationResult> {
    return new Promise((resolve) => {
      // Clear existing timeout
      const existingTimeout = this.validationTimeouts.get(fieldName);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set validating state immediately
      this.setFieldState(fieldName, { isValidating: true });

      // Set new timeout
      const timeout = setTimeout(() => {
        const result = FormValidation.validateFieldRealTime(value, fieldName, validationRules);
        
        this.setFieldState(fieldName, {
          isValid: result.valid,
          errors: result.error ? [result.error] : [],
          warnings: result.warnings || [],
          isValidating: false
        });

        resolve(result);
      }, debounceMs);

      this.validationTimeouts.set(fieldName, timeout);
    });
  }

  /**
   * Get overall form validity
   */
  isFormValid(): boolean {
    return Array.from(this.fieldStates.values()).every(state => state.isValid);
  }

  /**
   * Get all form errors
   */
  getAllErrors(): string[] {
    const errors: string[] = [];
    this.fieldStates.forEach((state, fieldName) => {
      if (!state.isValid) {
        errors.push(...state.errors);
      }
    });
    return errors;
  }

  /**
   * Clear all validation states
   */
  clear(): void {
    this.fieldStates.clear();
    this.validationTimeouts.forEach(timeout => clearTimeout(timeout));
    this.validationTimeouts.clear();
  }
}

/**
 * Provider validation utilities
 */
export class ProviderValidation {
  
  /**
   * Validate provider form data before submission
   */
  static validateProviderForm(data: ProviderFormData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Name validation (optional - will be auto-generated if empty)
    if (data.name?.trim()) {
      if (data.name.trim().length < 2) {
        errors.push('Provider name must be at least 2 characters long');
      } else if (data.name.trim().length > 50) {
        errors.push('Provider name must be less than 50 characters');
      } else if (!/^[a-zA-Z0-9\s\-_]+$/.test(data.name.trim())) {
        errors.push('Provider name can only contain letters, numbers, spaces, hyphens, and underscores');
      }
    }

    // Type validation
    if (!data.type) {
      errors.push('Provider type is required');
    } else if (!['cloud', 'local-network'].includes(data.type)) {
      errors.push('Invalid provider type');
    }

    // Provider selection validation
    if (!data.provider) {
      errors.push('Provider selection is required');
    } else if (!['openai', 'anthropic', 'google', 'azure', 'ollama', 'custom'].includes(data.provider)) {
      errors.push('Invalid provider selection');
    }

    // Cloud provider specific validation
    if (data.type === 'cloud') {
      if (!data.apiKey?.trim()) {
        errors.push('API key is required for cloud providers');
      } else {
        const apiKeyValidation = this.validateApiKey(data.provider, data.apiKey);
        if (!apiKeyValidation.valid) {
          errors.push(apiKeyValidation.error!);
        }
        if (apiKeyValidation.warnings) {
          warnings.push(...apiKeyValidation.warnings);
        }
      }

      // Endpoint should not be provided for cloud providers
      if (data.endpoint) {
        warnings.push('Endpoint is not needed for cloud providers and will be ignored');
      }
    }

    // Local network provider specific validation
    if (data.type === 'local-network') {
      if (!data.endpoint?.trim()) {
        errors.push('Endpoint is required for local network providers');
      } else {
        const endpointValidation = this.validateEndpoint(data.endpoint);
        if (!endpointValidation.valid) {
          errors.push(endpointValidation.error!);
        }
        if (endpointValidation.warnings) {
          warnings.push(...endpointValidation.warnings);
        }
      }

      if (!data.localHostType) {
        errors.push('Local host type is required for local network providers');
      } else if (!['ollama', 'custom'].includes(data.localHostType)) {
        errors.push('Invalid local host type');
      }

      // API key validation for local providers (optional but should be valid if provided)
      if (data.apiKey?.trim()) {
        const apiKeyValidation = this.validateApiKey(data.provider, data.apiKey);
        if (!apiKeyValidation.valid) {
          warnings.push(`API key format warning: ${apiKeyValidation.error}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate API key format based on provider
   */
  static validateApiKey(provider: string, apiKey: string): ValidationResult {
    const trimmedKey = apiKey.trim();
    const warnings: string[] = [];

    if (!trimmedKey) {
      return { valid: false, error: 'API key cannot be empty' };
    }

    switch (provider) {
      case 'openai':
        if (!trimmedKey.startsWith('sk-')) {
          return { valid: false, error: 'OpenAI API keys must start with "sk-"' };
        }
        if (trimmedKey.length < 20) {
          return { valid: false, error: 'OpenAI API key appears to be too short' };
        }
        if (trimmedKey.length > 200) {
          return { valid: false, error: 'OpenAI API key appears to be too long' };
        }
        break;

      case 'anthropic':
        if (!trimmedKey.startsWith('sk-ant-')) {
          return { valid: false, error: 'Anthropic API keys must start with "sk-ant-"' };
        }
        if (trimmedKey.length < 30) {
          return { valid: false, error: 'Anthropic API key appears to be too short' };
        }
        break;

      case 'google':
        // Google API keys are typically 39 characters long
        if (trimmedKey.length < 20) {
          return { valid: false, error: 'Google API key appears to be too short' };
        }
        if (!/^[A-Za-z0-9_-]+$/.test(trimmedKey)) {
          return { valid: false, error: 'Google API key contains invalid characters' };
        }
        break;

      case 'azure':
        // Azure OpenAI keys are typically 32 characters
        if (trimmedKey.length < 20) {
          return { valid: false, error: 'Azure API key appears to be too short' };
        }
        if (!/^[A-Za-z0-9]+$/.test(trimmedKey)) {
          return { valid: false, error: 'Azure API key should only contain alphanumeric characters' };
        }
        break;

      case 'ollama':
        // Ollama typically doesn't require API keys
        warnings.push('Ollama typically does not require an API key');
        break;

      case 'custom':
        // For custom providers, we can't validate the format
        if (trimmedKey.length < 8) {
          warnings.push('API key appears to be quite short for a custom provider');
        }
        break;
    }

    return { 
      valid: true, 
      warnings: warnings.length > 0 ? warnings : undefined 
    };
  }

  /**
   * Validate endpoint URL format
   */
  static validateEndpoint(endpoint: string): ValidationResult {
    const trimmedEndpoint = endpoint.trim();
    const warnings: string[] = [];

    if (!trimmedEndpoint) {
      return { valid: false, error: 'Endpoint cannot be empty' };
    }

    try {
      const url = new URL(trimmedEndpoint);
      
      // Check protocol
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { valid: false, error: 'Endpoint must use HTTP or HTTPS protocol' };
      }

      // Warn about HTTP in production
      if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)) {
        warnings.push('Using HTTP for non-local endpoints is not secure. Consider using HTTPS.');
      }

      // Check for common localhost patterns
      if (['localhost', '127.0.0.1'].includes(url.hostname)) {
        // Common Ollama port
        if (url.port === '11434') {
          warnings.push('This appears to be an Ollama endpoint. Make sure Ollama is running.');
        }
      }

      // Check for trailing slash
      if (url.pathname !== '/' && url.pathname.endsWith('/')) {
        warnings.push('Endpoint has a trailing slash which may cause issues with some providers');
      }

    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }

    return { 
      valid: true, 
      warnings: warnings.length > 0 ? warnings : undefined 
    };
  }

  /**
   * Validate provider configuration for uniqueness
   */
  static validateProviderUniqueness(
    formData: ProviderFormData, 
    existingProviders: ProviderConfig[], 
    editingProviderId?: string
  ): ValidationResult {
    const warnings: string[] = [];

    // Check for duplicate names (only if name is provided)
    if (formData.name?.trim()) {
      const trimmedName = formData.name.trim();
      const duplicateName = existingProviders.find(p => 
        p.id !== editingProviderId && 
        p.name.toLowerCase() === trimmedName.toLowerCase()
      );
      
      if (duplicateName) {
        return { valid: false, error: 'A provider with this name already exists' };
      }
    }

    // Check for duplicate endpoints (for local network providers)
    if (formData.type === 'local-network' && formData.endpoint) {
      const duplicateEndpoint = existingProviders.find(p => 
        p.id !== editingProviderId &&
        p.type === 'local-network' && 
        p.endpoint === formData.endpoint?.trim()
      );
      
      if (duplicateEndpoint) {
        return { valid: false, error: 'A provider with this endpoint already exists' };
      }
    }

    // Check for duplicate API keys (warning only, as keys might be shared in some cases)
    if (formData.apiKey) {
      const duplicateApiKey = existingProviders.find(p => 
        p.id !== editingProviderId &&
        'apiKey' in p && 
        p.apiKey === formData.apiKey?.trim()
      );
      
      if (duplicateApiKey) {
        warnings.push('This API key is already used by another provider. This may cause conflicts.');
      }
    }

    return { 
      valid: true, 
      warnings: warnings.length > 0 ? warnings : undefined 
    };
  }
}

/**
 * Agent validation utilities
 */
export class AgentValidation {
  
  /**
   * Validate agent form data before submission
   */
  static validateAgentForm(data: AgentFormData, availableProviders: ProviderConfig[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Name validation
    if (!data.name?.trim()) {
      errors.push('Agent name is required');
    } else if (data.name.trim().length < 2) {
      errors.push('Agent name must be at least 2 characters long');
    } else if (data.name.trim().length > 50) {
      errors.push('Agent name must be less than 50 characters');
    } else if (!/^[a-zA-Z0-9\s\-_]+$/.test(data.name.trim())) {
      errors.push('Agent name can only contain letters, numbers, spaces, hyphens, and underscores');
    }

    // Provider validation
    if (!data.providerId) {
      errors.push('Provider selection is required');
    } else {
      const provider = availableProviders.find(p => p.id === data.providerId);
      if (!provider) {
        errors.push('Selected provider not found');
      } else if (!provider.isActive) {
        errors.push('Selected provider is not active');
      }
    }

    // Model validation
    if (!data.model?.trim()) {
      errors.push('Model selection is required');
    } else if (data.model.trim().length > 100) {
      errors.push('Model name is too long');
    }

    // Temperature validation
    if (data.temperature !== undefined) {
      if (typeof data.temperature !== 'number' || isNaN(data.temperature)) {
        errors.push('Temperature must be a valid number');
      } else if (data.temperature < 0 || data.temperature > 2) {
        errors.push('Temperature must be between 0 and 2');
      } else if (data.temperature > 1.5) {
        warnings.push('High temperature values (>1.5) may produce very unpredictable responses');
      }
    }

    // Max tokens validation
    if (data.maxTokens !== undefined) {
      if (!Number.isInteger(data.maxTokens) || data.maxTokens <= 0) {
        errors.push('Max tokens must be a positive integer');
      } else if (data.maxTokens > 100000) {
        errors.push('Max tokens cannot exceed 100,000');
      } else if (data.maxTokens < 100) {
        warnings.push('Very low max tokens (<100) may result in incomplete responses');
      }
    }

    // Timeout validation
    if (data.timeout !== undefined) {
      if (!Number.isInteger(data.timeout) || data.timeout <= 0) {
        errors.push('Timeout must be a positive integer (in milliseconds)');
      } else if (data.timeout < 5000) {
        warnings.push('Very short timeouts (<5s) may cause frequent request failures');
      } else if (data.timeout > 300000) {
        warnings.push('Very long timeouts (>5min) may cause poor user experience');
      }
    }

    // System prompt validation
    if (data.systemPrompt && data.systemPrompt.trim().length > 2000) {
      warnings.push('Very long system prompts may consume significant token budget');
    }

    return {
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate agent configuration for uniqueness
   */
  static validateAgentUniqueness(
    formData: AgentFormData, 
    existingAgents: any[], 
    editingAgentId?: string
  ): ValidationResult {
    // Check for duplicate names
    const duplicateName = existingAgents.find(a => 
      a.id !== editingAgentId && 
      a.name.toLowerCase() === formData.name.trim().toLowerCase()
    );
    
    if (duplicateName) {
      return { valid: false, error: 'An agent with this name already exists' };
    }

    return { valid: true };
  }
}

/**
 * Network and connection validation utilities
 */
export class NetworkValidation {
  
  /**
   * Validate network connectivity to an endpoint
   */
  static async validateEndpointConnectivity(endpoint: string, timeout: number = 10000): Promise<ConnectionTestResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const startTime = Date.now();
      
      // For web context, we can't directly test connectivity, but we can validate the URL
      const url = new URL(endpoint);
      const responseTime = Date.now() - startTime;
      
      clearTimeout(timeoutId);
      
      return {
        success: true,
        responseTime,
        serverInfo: {
          status: 'unknown' // In web context, we can't determine actual connectivity
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      };
    }
  }

  /**
   * Validate API key by attempting a simple API call
   */
  static async validateApiKeyConnectivity(
    provider: string, 
    apiKey: string, 
    endpoint?: string
  ): Promise<ConnectionTestResult> {
    // In the web context, we can't directly make API calls due to CORS
    // This validation would need to be handled by the VS Code extension
    return {
      success: false,
      error: 'API key validation must be performed by the extension backend'
    };
  }
}

/**
 * Form validation utilities
 */
export class FormValidation {
  
  /**
   * Sanitize and clean form input
   */
  static sanitizeInput(input: string): string {
    return input.trim().replace(/\s+/g, ' ');
  }

  /**
   * Validate required fields
   */
  static validateRequired(value: any, fieldName: string): ValidationResult {
    if (value === null || value === undefined || value === '') {
      return { valid: false, error: `${fieldName} is required` };
    }
    
    if (typeof value === 'string' && !value.trim()) {
      return { valid: false, error: `${fieldName} cannot be empty` };
    }
    
    return { valid: true };
  }

  /**
   * Validate field in real-time with debouncing
   */
  static validateFieldRealTime(
    value: any, 
    fieldName: string, 
    validationRules: ValidationRule[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of validationRules) {
      const result = rule.validate(value, fieldName);
      if (!result.valid && result.error) {
        errors.push(result.error);
      }
      if (result.warnings) {
        warnings.push(...result.warnings);
      }
    }

    return {
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate string length (static method for backward compatibility)
   */
  static validateStringLength(
    value: string, 
    fieldName: string, 
    min?: number, 
    max?: number
  ): ValidationResult {
    const length = value?.trim().length || 0;
    
    if (min !== undefined && length < min) {
      return { valid: false, error: `${fieldName} must be at least ${min} characters long` };
    }
    
    if (max !== undefined && length > max) {
      return { valid: false, error: `${fieldName} must be less than ${max} characters long` };
    }
    
    return { valid: true };
  }

  /**
   * Validate numeric range (static method for backward compatibility)
   */
  static validateNumericRange(
    value: number, 
    fieldName: string, 
    min?: number, 
    max?: number
  ): ValidationResult {
    if (typeof value !== 'number' || isNaN(value)) {
      return { valid: false, error: `${fieldName} must be a valid number` };
    }
    
    if (min !== undefined && value < min) {
      return { valid: false, error: `${fieldName} must be at least ${min}` };
    }
    
    if (max !== undefined && value > max) {
      return { valid: false, error: `${fieldName} must be at most ${max}` };
    }
    
    return { valid: true };
  }

  /**
   * Get contextual validation message based on field and error type
   */
  static getContextualMessage(fieldName: string, errorType: string, value?: any): string {
    const messages: Record<string, Record<string, string>> = {
      'apiKey': {
        'required': 'API key is required to connect to this provider',
        'format': 'Please check your API key format - it should match the provider\'s requirements',
        'invalid': 'This API key format doesn\'t match the selected provider'
      },
      'endpoint': {
        'required': 'Network address is required to connect to your local service',
        'format': 'Please enter a valid URL (e.g., http://localhost:11434)',
        'invalid': 'Please check the URL format and ensure it includes the protocol (http:// or https://)'
      },
      'providerType': {
        'required': 'Please select whether you want to use a cloud service or local network'
      },
      'provider': {
        'required': 'Please select which AI service you want to use'
      },
      'model': {
        'required': 'Please select or enter a model name for this agent',
        'invalid': 'Model name should only contain letters, numbers, dots, hyphens, and underscores'
      },
      'temperature': {
        'range': 'Temperature controls creativity - use 0.0 for consistent responses, up to 2.0 for very creative ones'
      },
      'maxTokens': {
        'range': 'Max tokens controls response length - typical values are 1000-4000 for most use cases'
      }
    };

    return messages[fieldName]?.[errorType] || `Please check the ${fieldName} field`;
  }
}

/**
 * Common validation rules
 */
export class ValidationRules {
  
  /**
   * Required field validation rule
   */
  static required(): ValidationRule {
    return {
      validate(value: any, fieldName: string): ValidationResult {
        if (value === null || value === undefined || value === '') {
          return { 
            valid: false, 
            error: FormValidation.getContextualMessage(fieldName, 'required')
          };
        }
        
        if (typeof value === 'string' && !value.trim()) {
          return { 
            valid: false, 
            error: FormValidation.getContextualMessage(fieldName, 'required')
          };
        }
        
        return { valid: true };
      }
    };
  }

  /**
   * String length validation rule
   */
  static stringLength(min?: number, max?: number): ValidationRule {
    return {
      validate(value: any, fieldName: string): ValidationResult {
        if (typeof value !== 'string') {
          return { valid: true }; // Skip if not string
        }

        const length = value.trim().length;
        
        if (min !== undefined && length < min) {
          return { 
            valid: false, 
            error: `${fieldName} must be at least ${min} characters long`
          };
        }
        
        if (max !== undefined && length > max) {
          return { 
            valid: false, 
            error: `${fieldName} must be less than ${max} characters long`
          };
        }
        
        return { valid: true };
      }
    };
  }

  /**
   * Numeric range validation rule
   */
  static range(min?: number, max?: number): ValidationRule {
    return {
      validate(value: any, fieldName: string): ValidationResult {
        if (value === null || value === undefined || value === '') {
          return { valid: true }; // Skip if empty (use required rule separately)
        }

        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        
        if (typeof numValue !== 'number' || isNaN(numValue)) {
          return { 
            valid: false, 
            error: `${fieldName} must be a valid number`
          };
        }
        
        if (min !== undefined && numValue < min) {
          return { 
            valid: false, 
            error: FormValidation.getContextualMessage(fieldName, 'range') || `${fieldName} must be at least ${min}`
          };
        }
        
        if (max !== undefined && numValue > max) {
          return { 
            valid: false, 
            error: FormValidation.getContextualMessage(fieldName, 'range') || `${fieldName} must be at most ${max}`
          };
        }
        
        return { valid: true };
      }
    };
  }

  /**
   * API key format validation rule
   */
  static apiKeyFormat(provider: string): ValidationRule {
    return {
      validate(value: any, fieldName: string): ValidationResult {
        if (!value || typeof value !== 'string') {
          return { valid: true }; // Skip if empty (use required rule separately)
        }

        return ProviderValidation.validateApiKey(provider, value);
      }
    };
  }

  /**
   * URL format validation rule
   */
  static urlFormat(): ValidationRule {
    return {
      validate(value: any, fieldName: string): ValidationResult {
        if (!value || typeof value !== 'string') {
          return { valid: true }; // Skip if empty (use required rule separately)
        }

        return ProviderValidation.validateEndpoint(value);
      }
    };
  }

  /**
   * Model name format validation rule
   */
  static modelNameFormat(): ValidationRule {
    return {
      validate(value: any, fieldName: string): ValidationResult {
        if (!value || typeof value !== 'string') {
          return { valid: true }; // Skip if empty (use required rule separately)
        }

        const trimmed = value.trim();
        
        if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
          return { 
            valid: false, 
            error: FormValidation.getContextualMessage(fieldName, 'invalid')
          };
        }
        
        return { valid: true };
      }
    };
  }

  /**
   * Conditional validation rule - only validate if condition is met
   */
  static conditional(condition: (formData: any) => boolean, rule: ValidationRule): ValidationRule {
    return {
      validate(value: any, fieldName: string, formData?: any): ValidationResult {
        if (!condition(formData)) {
          return { valid: true }; // Skip validation if condition not met
        }
        
        return rule.validate(value, fieldName, formData);
      }
    };
  }
}

/**
 * Error message utilities
 */
export class ErrorMessages {
  
  /**
   * Get user-friendly error message for common error types
   */
  static getUserFriendlyMessage(error: string): string {
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes('network') || errorLower.includes('connection')) {
      return 'Network connection failed. Please check your internet connection and try again.';
    }
    
    if (errorLower.includes('timeout')) {
      return 'Request timed out. The server may be busy or unreachable.';
    }
    
    if (errorLower.includes('unauthorized') || errorLower.includes('401')) {
      return 'Authentication failed. Please check your API key and try again.';
    }
    
    if (errorLower.includes('forbidden') || errorLower.includes('403')) {
      return 'Access denied. Your API key may not have the required permissions.';
    }
    
    if (errorLower.includes('not found') || errorLower.includes('404')) {
      return 'Resource not found. Please check the endpoint URL and try again.';
    }
    
    if (errorLower.includes('rate limit') || errorLower.includes('429')) {
      return 'Rate limit exceeded. Please wait a moment before trying again.';
    }
    
    if (errorLower.includes('server error') || errorLower.includes('500')) {
      return 'Server error occurred. Please try again later.';
    }
    
    // Return original error if no friendly message is available
    return error;
  }

  /**
   * Get validation error summary
   */
  static getValidationSummary(errors: string[], warnings?: string[]): string {
    let summary = '';
    
    if (errors.length > 0) {
      summary += `${errors.length} error${errors.length > 1 ? 's' : ''} found: ${errors.join(', ')}`;
    }
    
    if (warnings && warnings.length > 0) {
      if (summary) summary += ' ';
      summary += `${warnings.length} warning${warnings.length > 1 ? 's' : ''}: ${warnings.join(', ')}`;
    }
    
    return summary;
  }
}