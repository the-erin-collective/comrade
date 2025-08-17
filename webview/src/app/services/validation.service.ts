import { Injectable } from '@angular/core';
import { ProviderFormData } from '../interfaces/provider-agent.interface';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ValidationService {

  /**
   * Validates a complete provider form
   */
  validateProviderForm(formData: ProviderFormData): ValidationResult {
    const errors: string[] = [];

    // Validate required fields
    if (!formData.name || formData.name.trim().length === 0) {
      errors.push('Provider name is required');
    }

    if (!formData.type) {
      errors.push('Provider type is required');
    }

    // Type-specific validation
    if (formData.type === 'cloud') {
      const cloudValidation = this.validateCloudProvider(formData);
      errors.push(...cloudValidation.errors);
    } else if (formData.type === 'local-network') {
      const localValidation = this.validateLocalNetworkProvider(formData);
      errors.push(...localValidation.errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates cloud provider specific fields
   */
  private validateCloudProvider(formData: ProviderFormData): ValidationResult {
    const errors: string[] = [];

    if (!formData.provider) {
      errors.push('Cloud provider selection is required');
    }

    if (!formData.apiKey || formData.apiKey.trim().length === 0) {
      errors.push('API key is required for cloud providers');
    } else {
      const apiKeyValidation = this.validateApiKey(formData.apiKey, formData.provider);
      errors.push(...apiKeyValidation.errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates local network provider specific fields
   */
  private validateLocalNetworkProvider(formData: ProviderFormData): ValidationResult {
    const errors: string[] = [];

    if (!formData.localHostType) {
      errors.push('Local host type is required');
    }

    if (!formData.endpoint || formData.endpoint.trim().length === 0) {
      errors.push('Network address is required for local providers');
    } else {
      const endpointValidation = this.validateEndpoint(formData.endpoint);
      errors.push(...endpointValidation.errors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates API key format for different cloud providers
   */
  validateApiKey(apiKey: string, provider: string): ValidationResult {
    const errors: string[] = [];

    if (!apiKey || apiKey.trim().length === 0) {
      errors.push('API key cannot be empty');
      return { isValid: false, errors };
    }

    const trimmedKey = apiKey.trim();

    switch (provider) {
      case 'openai':
        if (!this.isValidOpenAIKey(trimmedKey)) {
          errors.push('Invalid OpenAI API key format. Should start with "sk-" and be at least 20 characters long');
        }
        break;

      case 'anthropic':
        if (!this.isValidAnthropicKey(trimmedKey)) {
          errors.push('Invalid Anthropic API key format. Should start with "sk-ant-" and be at least 30 characters long');
        }
        break;

      case 'google':
        if (!this.isValidGoogleKey(trimmedKey)) {
          errors.push('Invalid Google API key format. Should be at least 20 characters long');
        }
        break;

      case 'azure':
        if (!this.isValidAzureKey(trimmedKey)) {
          errors.push('Invalid Azure API key format. Should be at least 20 characters long');
        }
        break;

      default:
        // Generic validation for unknown providers
        if (trimmedKey.length < 10) {
          errors.push('API key appears to be too short');
        }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates endpoint URL format
   */
  validateEndpoint(endpoint: string): ValidationResult {
    const errors: string[] = [];

    if (!endpoint || endpoint.trim().length === 0) {
      errors.push('Endpoint URL cannot be empty');
      return { isValid: false, errors };
    }

    const trimmedEndpoint = endpoint.trim();

    // Check if it's a valid URL
    try {
      const url = new URL(trimmedEndpoint);
      
      // Check protocol
      if (!['http:', 'https:'].includes(url.protocol)) {
        errors.push('Endpoint must use HTTP or HTTPS protocol');
      }

      // Check for localhost or IP patterns for local network
      if (this.isLocalEndpoint(url)) {
        // Additional validation for local endpoints
        if (url.port && !this.isValidPort(url.port)) {
          errors.push('Invalid port number');
        }
      }

    } catch (error) {
      errors.push('Invalid URL format. Please include protocol (http:// or https://)');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates agent form data
   */
  validateAgentForm(agentData: any): ValidationResult {
    const errors: string[] = [];

    if (!agentData.name || agentData.name.trim().length === 0) {
      errors.push('Agent name is required');
    }

    if (!agentData.providerId) {
      errors.push('Provider selection is required');
    }

    if (!agentData.model || agentData.model.trim().length === 0) {
      errors.push('Model selection is required');
    }

    // Validate temperature if provided
    if (agentData.temperature !== undefined && agentData.temperature !== null) {
      if (agentData.temperature < 0 || agentData.temperature > 2) {
        errors.push('Temperature must be between 0 and 2');
      }
    }

    // Validate max tokens if provided
    if (agentData.maxTokens !== undefined && agentData.maxTokens !== null) {
      if (agentData.maxTokens < 1 || agentData.maxTokens > 100000) {
        errors.push('Max tokens must be between 1 and 100,000');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates provider name uniqueness
   */
  validateProviderNameUniqueness(name: string, existingProviders: any[], excludeId?: string): ValidationResult {
    const errors: string[] = [];

    if (!name || name.trim().length === 0) {
      errors.push('Provider name is required');
      return { isValid: false, errors };
    }

    const trimmedName = name.trim();
    const isDuplicate = existingProviders.some(provider => 
      provider.name.toLowerCase() === trimmedName.toLowerCase() && 
      provider.id !== excludeId
    );

    if (isDuplicate) {
      errors.push('A provider with this name already exists');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates agent name uniqueness
   */
  validateAgentNameUniqueness(name: string, existingAgents: any[], excludeId?: string): ValidationResult {
    const errors: string[] = [];

    if (!name || name.trim().length === 0) {
      errors.push('Agent name is required');
      return { isValid: false, errors };
    }

    const trimmedName = name.trim();
    const isDuplicate = existingAgents.some(agent => 
      agent.name.toLowerCase() === trimmedName.toLowerCase() && 
      agent.id !== excludeId
    );

    if (isDuplicate) {
      errors.push('An agent with this name already exists');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Private helper methods for API key validation

  private isValidOpenAIKey(key: string): boolean {
    return key.startsWith('sk-') && key.length >= 20;
  }

  private isValidAnthropicKey(key: string): boolean {
    return key.startsWith('sk-ant-') && key.length >= 30;
  }

  private isValidGoogleKey(key: string): boolean {
    // Google API keys are typically 39 characters long
    return key.length >= 20 && /^[A-Za-z0-9_-]+$/.test(key);
  }

  private isValidAzureKey(key: string): boolean {
    // Azure keys are typically 32 characters long, alphanumeric
    return key.length >= 20 && /^[A-Za-z0-9]+$/.test(key);
  }

  private isLocalEndpoint(url: URL): boolean {
    const hostname = url.hostname.toLowerCase();
    return hostname === 'localhost' || 
           hostname === '127.0.0.1' || 
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.') ||
           hostname.startsWith('172.');
  }

  private isValidPort(port: string): boolean {
    const portNum = parseInt(port, 10);
    return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
  }

  /**
   * Sanitizes input to prevent XSS and other security issues
   */
  sanitizeInput(input: string): string {
    if (!input) return '';
    
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, ''); // Remove event handlers
  }

  /**
   * Validates that a model name is reasonable
   */
  validateModelName(modelName: string): ValidationResult {
    const errors: string[] = [];

    if (!modelName || modelName.trim().length === 0) {
      errors.push('Model name is required');
      return { isValid: false, errors };
    }

    const trimmed = modelName.trim();

    // Check for reasonable length
    if (trimmed.length < 2) {
      errors.push('Model name is too short');
    }

    if (trimmed.length > 100) {
      errors.push('Model name is too long');
    }

    // Check for valid characters (alphanumeric, hyphens, underscores, dots)
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
      errors.push('Model name contains invalid characters. Use only letters, numbers, dots, hyphens, and underscores');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates connection test parameters
   */
  validateConnectionTestParams(params: any): ValidationResult {
    const errors: string[] = [];

    if (!params.type) {
      errors.push('Provider type is required for connection test');
    }

    if (params.type === 'cloud') {
      if (!params.provider) {
        errors.push('Cloud provider is required');
      }
      if (!params.apiKey) {
        errors.push('API key is required for cloud provider connection test');
      }
    } else if (params.type === 'local-network') {
      if (!params.endpoint) {
        errors.push('Endpoint is required for local network connection test');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}