import { ValidationRules, FormValidation, FormValidationState } from './validation.utils';

describe('ValidationUtils', () => {
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