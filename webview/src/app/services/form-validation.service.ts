/**
 * Form Validation Service
 * 
 * Provides comprehensive form validation for provider and agent management forms.
 * Integrates with validation utilities and error handling service.
 */

import { Injectable } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn, AsyncValidatorFn } from '@angular/forms';
import { Observable, of, timer } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { ProviderValidation, AgentValidation, FormValidation } from '../utils/validation.utils';
import { ErrorHandlerService } from './error-handler.service';
import { ProviderConfig, ValidationResult } from '../interfaces/provider-agent.interface';

@Injectable({
  providedIn: 'root'
})
export class FormValidationService {

  constructor(private errorHandler: ErrorHandlerService) {}

  /**
   * Provider form validators
   */
  providerValidators = {
    /**
     * Validate provider name
     */
    name: (): ValidatorFn => {
      return (control: AbstractControl): ValidationErrors | null => {
        if (!control.value) {
          return { required: { message: 'Provider name is required' } };
        }

        const result = FormValidation.validateLength(control.value, 'Provider name', 2, 50);
        if (!result.valid) {
          return { length: { message: result.error } };
        }

        if (!/^[a-zA-Z0-9\s\-_]+$/.test(control.value.trim())) {
          return { 
            pattern: { 
              message: 'Provider name can only contain letters, numbers, spaces, hyphens, and underscores' 
            } 
          };
        }

        return null;
      };
    },

    /**
     * Validate API key based on provider type
     */
    apiKey: (providerType: string): ValidatorFn => {
      return (control: AbstractControl): ValidationErrors | null => {
        if (!control.value && providerType === 'cloud') {
          return { required: { message: 'API key is required for cloud providers' } };
        }

        if (control.value) {
          const result = ProviderValidation.validateApiKey(providerType, control.value);
          if (!result.valid) {
            return { format: { message: result.error } };
          }
        }

        return null;
      };
    },

    /**
     * Validate endpoint URL
     */
    endpoint: (): ValidatorFn => {
      return (control: AbstractControl): ValidationErrors | null => {
        if (!control.value) {
          return { required: { message: 'Endpoint is required for local network providers' } };
        }

        const result = ProviderValidation.validateEndpoint(control.value);
        if (!result.valid) {
          return { url: { message: result.error } };
        }

        return null;
      };
    },

    /**
     * Async validator for provider name uniqueness
     */
    uniqueName: (existingProviders: ProviderConfig[], editingId?: string): AsyncValidatorFn => {
      return (control: AbstractControl): Observable<ValidationErrors | null> => {
        if (!control.value) {
          return of(null);
        }

        return timer(300).pipe( // Debounce for 300ms
          switchMap(() => {
            const duplicate = existingProviders.find(p => 
              p.id !== editingId && 
              p.name.toLowerCase() === control.value.trim().toLowerCase()
            );

            if (duplicate) {
              return of({ 
                unique: { 
                  message: 'A provider with this name already exists' 
                } 
              });
            }

            return of(null);
          }),
          catchError(() => of(null))
        );
      };
    },

    /**
     * Async validator for endpoint uniqueness
     */
    uniqueEndpoint: (existingProviders: ProviderConfig[], editingId?: string): AsyncValidatorFn => {
      return (control: AbstractControl): Observable<ValidationErrors | null> => {
        if (!control.value) {
          return of(null);
        }

        return timer(300).pipe( // Debounce for 300ms
          switchMap(() => {
            const duplicate = existingProviders.find(p => 
              p.id !== editingId &&
              p.type === 'local-network' && 
              p.endpoint === control.value.trim()
            );

            if (duplicate) {
              return of({ 
                unique: { 
                  message: 'A provider with this endpoint already exists' 
                } 
              });
            }

            return of(null);
          }),
          catchError(() => of(null))
        );
      };
    }
  };

  /**
   * Agent form validators
   */
  agentValidators = {
    /**
     * Validate agent name
     */
    name: (): ValidatorFn => {
      return (control: AbstractControl): ValidationErrors | null => {
        if (!control.value) {
          return { required: { message: 'Agent name is required' } };
        }

        const result = FormValidation.validateLength(control.value, 'Agent name', 2, 50);
        if (!result.valid) {
          return { length: { message: result.error } };
        }

        if (!/^[a-zA-Z0-9\s\-_]+$/.test(control.value.trim())) {
          return { 
            pattern: { 
              message: 'Agent name can only contain letters, numbers, spaces, hyphens, and underscores' 
            } 
          };
        }

        return null;
      };
    },

    /**
     * Validate temperature value
     */
    temperature: (): ValidatorFn => {
      return (control: AbstractControl): ValidationErrors | null => {
        if (control.value === null || control.value === undefined || control.value === '') {
          return null; // Optional field
        }

        const result = FormValidation.validateRange(control.value, 'Temperature', 0, 2);
        if (!result.valid) {
          return { range: { message: result.error } };
        }

        if (control.value > 1.5) {
          return { 
            warning: { 
              message: 'High temperature values (>1.5) may produce very unpredictable responses' 
            } 
          };
        }

        return null;
      };
    },

    /**
     * Validate max tokens value
     */
    maxTokens: (): ValidatorFn => {
      return (control: AbstractControl): ValidationErrors | null => {
        if (control.value === null || control.value === undefined || control.value === '') {
          return null; // Optional field
        }

        if (!Number.isInteger(Number(control.value)) || Number(control.value) <= 0) {
          return { 
            integer: { 
              message: 'Max tokens must be a positive integer' 
            } 
          };
        }

        const result = FormValidation.validateRange(Number(control.value), 'Max tokens', 1, 100000);
        if (!result.valid) {
          return { range: { message: result.error } };
        }

        if (Number(control.value) < 100) {
          return { 
            warning: { 
              message: 'Very low max tokens (<100) may result in incomplete responses' 
            } 
          };
        }

        return null;
      };
    },

    /**
     * Validate timeout value
     */
    timeout: (): ValidatorFn => {
      return (control: AbstractControl): ValidationErrors | null => {
        if (control.value === null || control.value === undefined || control.value === '') {
          return null; // Optional field
        }

        if (!Number.isInteger(Number(control.value)) || Number(control.value) <= 0) {
          return { 
            integer: { 
              message: 'Timeout must be a positive integer (in milliseconds)' 
            } 
          };
        }

        if (Number(control.value) < 5000) {
          return { 
            warning: { 
              message: 'Very short timeouts (<5s) may cause frequent request failures' 
            } 
          };
        }

        if (Number(control.value) > 300000) {
          return { 
            warning: { 
              message: 'Very long timeouts (>5min) may cause poor user experience' 
            } 
          };
        }

        return null;
      };
    },

    /**
     * Validate system prompt length
     */
    systemPrompt: (): ValidatorFn => {
      return (control: AbstractControl): ValidationErrors | null => {
        if (!control.value) {
          return null; // Optional field
        }

        if (control.value.trim().length > 2000) {
          return { 
            warning: { 
              message: 'Very long system prompts may consume significant token budget' 
            } 
          };
        }

        return null;
      };
    },

    /**
     * Async validator for agent name uniqueness
     */
    uniqueName: (existingAgents: any[], editingId?: string): AsyncValidatorFn => {
      return (control: AbstractControl): Observable<ValidationErrors | null> => {
        if (!control.value) {
          return of(null);
        }

        return timer(300).pipe( // Debounce for 300ms
          switchMap(() => {
            const duplicate = existingAgents.find(a => 
              a.id !== editingId && 
              a.name.toLowerCase() === control.value.trim().toLowerCase()
            );

            if (duplicate) {
              return of({ 
                unique: { 
                  message: 'An agent with this name already exists' 
                } 
              });
            }

            return of(null);
          }),
          catchError(() => of(null))
        );
      };
    }
  };

  /**
   * Get all validation errors from a form control
   */
  getControlErrors(control: AbstractControl): string[] {
    if (!control.errors) {
      return [];
    }

    const errors: string[] = [];
    
    Object.keys(control.errors).forEach(key => {
      const error = control.errors![key];
      if (error && error.message) {
        errors.push(error.message);
      } else {
        // Fallback for errors without custom messages
        errors.push(this.getDefaultErrorMessage(key, error));
      }
    });

    return errors;
  }

  /**
   * Get all validation warnings from a form control
   */
  getControlWarnings(control: AbstractControl): string[] {
    if (!control.errors) {
      return [];
    }

    const warnings: string[] = [];
    
    if (control.errors['warning']) {
      warnings.push(control.errors['warning'].message);
    }

    return warnings;
  }

  /**
   * Check if a form control has errors
   */
  hasErrors(control: AbstractControl): boolean {
    return !!(control.errors && Object.keys(control.errors).some(key => key !== 'warning'));
  }

  /**
   * Check if a form control has warnings
   */
  hasWarnings(control: AbstractControl): boolean {
    return !!(control.errors && control.errors['warning']);
  }

  /**
   * Validate entire provider form data
   */
  validateProviderForm(
    formData: any, 
    existingProviders: ProviderConfig[], 
    editingId?: string
  ): ValidationResult {
    try {
      // Basic form validation
      const basicValidation = ProviderValidation.validateProviderForm(formData);
      if (!basicValidation.valid) {
        return basicValidation;
      }

      // Uniqueness validation
      const uniquenessValidation = ProviderValidation.validateProviderUniqueness(
        formData, 
        existingProviders, 
        editingId
      );
      if (!uniquenessValidation.valid) {
        return uniquenessValidation;
      }

      // Combine warnings
      const warnings = [
        ...(basicValidation.warnings || []),
        ...(uniquenessValidation.warnings || [])
      ];

      return {
        valid: true,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      this.errorHandler.handleError(error, 'Provider Form Validation');
      return {
        valid: false,
        error: 'An error occurred during validation'
      };
    }
  }

  /**
   * Validate entire agent form data
   */
  validateAgentForm(
    formData: any, 
    availableProviders: ProviderConfig[], 
    existingAgents: any[], 
    editingId?: string
  ): ValidationResult {
    try {
      // Basic form validation
      const basicValidation = AgentValidation.validateAgentForm(formData, availableProviders);
      if (!basicValidation.valid) {
        return basicValidation;
      }

      // Uniqueness validation
      const uniquenessValidation = AgentValidation.validateAgentUniqueness(
        formData, 
        existingAgents, 
        editingId
      );
      if (!uniquenessValidation.valid) {
        return uniquenessValidation;
      }

      // Combine warnings
      const warnings = [
        ...(basicValidation.warnings || []),
        ...(uniquenessValidation.warnings || [])
      ];

      return {
        valid: true,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      this.errorHandler.handleError(error, 'Agent Form Validation');
      return {
        valid: false,
        error: 'An error occurred during validation'
      };
    }
  }

  /**
   * Get default error message for validation errors without custom messages
   */
  private getDefaultErrorMessage(errorKey: string, errorValue: any): string {
    switch (errorKey) {
      case 'required':
        return 'This field is required';
      case 'email':
        return 'Please enter a valid email address';
      case 'min':
        return `Value must be at least ${errorValue.min}`;
      case 'max':
        return `Value must be at most ${errorValue.max}`;
      case 'minlength':
        return `Must be at least ${errorValue.requiredLength} characters long`;
      case 'maxlength':
        return `Must be less than ${errorValue.requiredLength} characters long`;
      case 'pattern':
        return 'Invalid format';
      case 'url':
        return 'Please enter a valid URL';
      default:
        return 'Invalid value';
    }
  }
}