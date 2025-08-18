import { ValidationUtils, ValidationRules, FormValidation, FormValidationState } from './validation.utils';

describe('ValidationUtils', () => {
  describe('ValidationUtils', () => {
    describe('sanitizeProviderName', () => {
      it('should replace forward slashes with hyphens', () => {
        expect(ValidationUtils.sanitizeProviderName('model/name')).toBe('model-name');
        expect(ValidationUtils.sanitizeProviderName('path/to/model')).toBe('path-to-model');
      });

      it('should replace colons with double underscores', () => {
        expect(ValidationUtils.sanitizeProviderName('model:version')).toBe('model__version');
        expect(ValidationUtils.sanitizeProviderName('host:port')).toBe('host__port');
      });

      it('should remove invalid characters while keeping valid ones', () => {
        expect(ValidationUtils.sanitizeProviderName('model@#$%name')).toBe('modelname');
        expect(ValidationUtils.sanitizeProviderName('valid-name_123')).toBe('valid-name_123');
        expect(ValidationUtils.sanitizeProviderName('Model (Local)')).toBe('Model (Local)');
      });

      it('should normalize whitespace', () => {
        expect(ValidationUtils.sanitizeProviderName('  model   name  ')).toBe('model name');
        expect(ValidationUtils.sanitizeProviderName('model\t\nname')).toBe('model name');
      });

      it('should handle complex cases', () => {
        expect(ValidationUtils.sanitizeProviderName('llama2/7b:latest')).toBe('llama2-7b__latest');
        expect(ValidationUtils.sanitizeProviderName('  model/name:v1.0@test  ')).toBe('model-name__v1.0test');
      });
    });

    describe('validateProviderName', () => {
      it('should validate valid provider names', () => {
        const result1 = ValidationUtils.validateProviderName('OpenAI (Cloud)');
        expect(result1.valid).toBe(true);

        const result2 = ValidationUtils.validateProviderName('Ollama (Local)');
        expect(result2.valid).toBe(true);

        const result3 = ValidationUtils.validateProviderName('Custom-Provider_123');
        expect(result3.valid).toBe(true);
      });

      it('should reject empty or whitespace-only names', () => {
        const result1 = ValidationUtils.validateProviderName('');
        expect(result1.valid).toBe(false);
        expect(result1.error).toContain('required');

        const result2 = ValidationUtils.validateProviderName('   ');
        expect(result2.valid).toBe(false);
        expect(result2.error).toContain('required');
      });

      it('should reject names that are too short', () => {
        const result = ValidationUtils.validateProviderName('A');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('at least 2 characters');
      });

      it('should reject names that are too long', () => {
        const longName = 'A'.repeat(51);
        const result = ValidationUtils.validateProviderName(longName);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('less than 50 characters');
      });

      it('should reject names with invalid characters', () => {
        const result1 = ValidationUtils.validateProviderName('model@name');
        expect(result1.valid).toBe(false);
        expect(result1.error).toContain('can only contain');

        const result2 = ValidationUtils.validateProviderName('model/name');
        expect(result2.valid).toBe(false);
        expect(result2.error).toContain('can only contain');

        const result3 = ValidationUtils.validateProviderName('model:name');
        expect(result3.valid).toBe(false);
        expect(result3.error).toContain('can only contain');
      });
    });

    describe('generateProviderNameFromSelection', () => {
      it('should generate correct names for cloud providers', () => {
        expect(ValidationUtils.generateProviderNameFromSelection('openai', 'cloud')).toBe('OpenAI (Cloud)');
        expect(ValidationUtils.generateProviderNameFromSelection('anthropic', 'cloud')).toBe('Anthropic (Cloud)');
        expect(ValidationUtils.generateProviderNameFromSelection('google', 'cloud')).toBe('Google (Cloud)');
      });

      it('should generate correct names for local network providers', () => {
        expect(ValidationUtils.generateProviderNameFromSelection('ollama', 'local-network')).toBe('Ollama (Local)');
        expect(ValidationUtils.generateProviderNameFromSelection('custom', 'local-network')).toBe('Custom (Local)');
      });

      it('should handle unknown providers gracefully', () => {
        expect(ValidationUtils.generateProviderNameFromSelection('unknown', 'cloud')).toBe('unknown (Cloud)');
        expect(ValidationUtils.generateProviderNameFromSelection('unknown', 'local-network')).toBe('unknown (Local)');
      });

      it('should sanitize generated names', () => {
        // Test with a provider name that would need sanitization
        const result = ValidationUtils.generateProviderNameFromSelection('test/provider:v1', 'cloud');
        expect(result).toBe('test-provider__v1 (Cloud)');
      });
    });

    describe('generateProviderName', () => {
      it('should generate names for local network providers with host type', () => {
        expect(ValidationUtils.generateProviderName('local-network', 'ollama')).toBe('Ollama (Local)');
        expect(ValidationUtils.generateProviderName('local-network', 'custom')).toBe('Custom (Local)');
      });

      it('should generate names for cloud providers', () => {
        expect(ValidationUtils.generateProviderName('cloud')).toBe('Cloud Provider (Cloud)');
      });

      it('should handle unknown types gracefully', () => {
        expect(ValidationUtils.generateProviderName('unknown')).toBe('Provider (unknown)');
      });

      it('should sanitize generated names', () => {
        // Test with endpoint that might contain invalid characters
        const result = ValidationUtils.generateProviderName('local-network', 'test/host:port');
        expect(result).toBe('test-host__port (Local)');
      });
    });
  });

  describe('ValidationRules', () => {
    describe('required', () => {
      it('should validate required fields correctly', () => {
        const rule = ValidationRules.required();
        
        expect(rule.validate('', 'testField').valid).toBe(false);
        expect(rule.validate(null, 'testField').valid).toBe(false);
        expect(rule.validate(undefined, 'testField').valid).toBe(false);
        expect(rule.validate('  ', 'testField').valid).toBe(false);
        expect(rule.validate('value', 'testField').valid).toBe(true);
      });
    });

    describe('stringLength', () => {
      it('should validate string length correctly', () => {
        const rule = ValidationRules.stringLength(2, 10);
        
        expect(rule.validate('a', 'testField').valid).toBe(false);
        expect(rule.validate('ab', 'testField').valid).toBe(true);
        expect(rule.validate('abcdefghijk', 'testField').valid).toBe(false);
        expect(rule.validate('abcdefghij', 'testField').valid).toBe(true);
      });
    });

    describe('range', () => {
      it('should validate numeric range correctly', () => {
        const rule = ValidationRules.range(0, 100);
        
        expect(rule.validate(-1, 'testField').valid).toBe(false);
        expect(rule.validate(0, 'testField').valid).toBe(true);
        expect(rule.validate(50, 'testField').valid).toBe(true);
        expect(rule.validate(100, 'testField').valid).toBe(true);
        expect(rule.validate(101, 'testField').valid).toBe(false);
        expect(rule.validate('not a number', 'testField').valid).toBe(false);
      });
    });

    describe('apiKeyFormat', () => {
      it('should validate OpenAI API key format', () => {
        const rule = ValidationRules.apiKeyFormat('openai');
        
        expect(rule.validate('sk-1234567890123456789012345678901234567890', 'apiKey').valid).toBe(true);
        expect(rule.validate('invalid-key', 'apiKey').valid).toBe(false);
        expect(rule.validate('sk-short', 'apiKey').valid).toBe(false);
      });

      it('should validate Anthropic API key format', () => {
        const rule = ValidationRules.apiKeyFormat('anthropic');
        
        expect(rule.validate('sk-ant-1234567890123456789012345678901234567890', 'apiKey').valid).toBe(true);
        expect(rule.validate('sk-1234567890123456789012345678901234567890', 'apiKey').valid).toBe(false);
        expect(rule.validate('sk-ant-short', 'apiKey').valid).toBe(false);
      });
    });

    describe('urlFormat', () => {
      it('should validate URL format correctly', () => {
        const rule = ValidationRules.urlFormat();
        
        expect(rule.validate('http://localhost:11434', 'endpoint').valid).toBe(true);
        expect(rule.validate('https://api.example.com', 'endpoint').valid).toBe(true);
        expect(rule.validate('invalid-url', 'endpoint').valid).toBe(false);
        expect(rule.validate('ftp://example.com', 'endpoint').valid).toBe(false);
      });
    });
  });

  describe('FormValidation', () => {
    describe('getContextualMessage', () => {
      it('should return contextual messages for different field types', () => {
        expect(FormValidation.getContextualMessage('apiKey', 'required')).toContain('API key is required');
        expect(FormValidation.getContextualMessage('endpoint', 'format')).toContain('valid URL');
        expect(FormValidation.getContextualMessage('temperature', 'range')).toContain('creativity');
      });
    });

    describe('validateStringLength', () => {
      it('should validate string length', () => {
        const result = FormValidation.validateStringLength('test', 'field', 2, 10);
        expect(result.valid).toBe(true);
        
        const shortResult = FormValidation.validateStringLength('a', 'field', 2, 10);
        expect(shortResult.valid).toBe(false);
        expect(shortResult.error).toContain('at least 2 characters');
      });
    });

    describe('validateNumericRange', () => {
      it('should validate numeric range', () => {
        const result = FormValidation.validateNumericRange(5, 'field', 0, 10);
        expect(result.valid).toBe(true);
        
        const outOfRangeResult = FormValidation.validateNumericRange(15, 'field', 0, 10);
        expect(outOfRangeResult.valid).toBe(false);
        expect(outOfRangeResult.error).toContain('at most 10');
      });
    });
  });

  describe('FormValidationState', () => {
    let validationState: FormValidationState;

    beforeEach(() => {
      validationState = new FormValidationState();
    });

    afterEach(() => {
      validationState.clear();
    });

    it('should manage field validation states', () => {
      validationState.setFieldState('testField', {
        isValid: false,
        errors: ['Test error'],
        warnings: [],
        isValidating: false
      });

      const state = validationState.getFieldState('testField');
      expect(state.isValid).toBe(false);
      expect(state.errors).toContain('Test error');
    });

    it('should determine overall form validity', () => {
      validationState.setFieldState('field1', { isValid: true, errors: [], warnings: [], isValidating: false });
      validationState.setFieldState('field2', { isValid: true, errors: [], warnings: [], isValidating: false });
      expect(validationState.isFormValid()).toBe(true);

      validationState.setFieldState('field2', { isValid: false, errors: ['Error'], warnings: [], isValidating: false });
      expect(validationState.isFormValid()).toBe(false);
    });

    it('should collect all form errors', () => {
      validationState.setFieldState('field1', { isValid: false, errors: ['Error 1'], warnings: [], isValidating: false });
      validationState.setFieldState('field2', { isValid: false, errors: ['Error 2'], warnings: [], isValidating: false });
      
      const errors = validationState.getAllErrors();
      expect(errors).toContain('Error 1');
      expect(errors).toContain('Error 2');
    });
  });
});