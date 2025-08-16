/**
 * Enhanced Provider Management Component with comprehensive error handling
 * 
 * This component extends the existing provider management with:
 * - Comprehensive form validation
 * - Error handling and user feedback
 * - Connection testing with proper error reporting
 * - Network timeout handling
 */

import { Component, ChangeDetectionStrategy, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, catchError } from 'rxjs/operators';

import { 
  ProviderConfig, 
  ProviderFormData, 
  ConnectionTestResult,
  ValidationResult 
} from '../../interfaces/provider-agent.interface';
import { 
  selectProviders, 
  selectProvidersLoading, 
  selectProvidersError,
  selectActiveProviders,
  selectProviderStats,
  selectHasProviders
} from '../../state/provider/provider.selectors';
import * as ProviderActions from '../../state/provider/provider.actions';
import { ErrorHandlerService } from '../../services/error-handler.service';
import { FormValidationService } from '../../services/form-validation.service';
import { ProviderManagerService } from '../../services/provider-manager.service';
import { ErrorNotificationComponent } from '../error-notification/error-notification.component';

@Component({
  selector: 'app-provider-management-enhanced',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ErrorNotificationComponent],
  template: `
    <div class="provider-management">
      <!-- Error Notifications -->
      <app-error-notification></app-error-notification>

      <!-- Form Validation Errors -->
      @if (formErrors().length > 0) {
        <div class="form-validation-errors">
          <div class="validation-header">
            <span class="validation-icon">❌</span>
            <span class="validation-title">Please fix the following errors:</span>
          </div>
          <ul class="validation-list">
            @for (error of formErrors(); track error) {
              <li>{{ error }}</li>
            }
          </ul>
        </div>
      }

      <!-- Form Validation Warnings -->
      @if (formWarnings().length > 0) {
        <div class="form-validation-warnings">
          <div class="validation-header">
            <span class="validation-icon">⚠️</span>
            <span class="validation-title">Warnings:</span>
          </div>
          <ul class="validation-list">
            @for (warning of formWarnings(); track warning) {
              <li>{{ warning }}</li>
            }
          </ul>
        </div>
      }

      <!-- Provider Form with Enhanced Validation -->
      @if (showProviderForm()) {
        <div class="modal-overlay" (click)="closeProviderForm()">
          <form 
            [formGroup]="providerFormGroup" 
            (ngSubmit)="saveProviderWithValidation()" 
            class="modal-content provider-form" 
            (click)="$event.stopPropagation()"
          >
            <div class="modal-header">
              <h3>{{ editingProvider() ? 'Edit Provider' : 'Add New Provider' }}</h3>
              <button type="button" class="close-btn" (click)="closeProviderForm()">×</button>
            </div>
            
            <div class="modal-body">
              <!-- Provider Name with Real-time Validation -->
              <div class="form-group">
                <label for="providerName">Provider Name</label>
                <input 
                  type="text" 
                  id="providerName"
                  formControlName="name"
                  placeholder="e.g., My OpenAI Provider"
                  class="form-input"
                  [class.error]="hasFieldError('name')"
                  [class.warning]="hasFieldWarning('name')"
                >
                @if (hasFieldError('name')) {
                  <div class="field-errors">
                    @for (error of getFieldErrors('name'); track error) {
                      <span class="error-text">{{ error }}</span>
                    }
                  </div>
                }
                @if (hasFieldWarning('name')) {
                  <div class="field-warnings">
                    @for (warning of getFieldWarnings('name'); track warning) {
                      <span class="warning-text">{{ warning }}</span>
                    }
                  </div>
                }
              </div>

              <!-- Provider Type Selection -->
              <div class="form-group">
                <label>Provider Type</label>
                <div class="provider-type-selection">
                  <label class="radio-option" [class.selected]="providerFormGroup.get('type')?.value === 'cloud'">
                    <input 
                      type="radio" 
                      formControlName="type"
                      value="cloud"
                      (change)="onProviderTypeChange('cloud')"
                    >
                    <div class="radio-content">
                      <div class="radio-header">
                        <span class="radio-icon">☁️</span>
                        <span class="radio-title">Cloud Provider</span>
                      </div>
                      <span class="radio-description">
                        Connect to cloud-based AI services like OpenAI, Anthropic, or Google
                      </span>
                    </div>
                  </label>
                  
                  <label class="radio-option" [class.selected]="providerFormGroup.get('type')?.value === 'local-network'">
                    <input 
                      type="radio" 
                      formControlName="type"
                      value="local-network"
                      (change)="onProviderTypeChange('local-network')"
                    >
                    <div class="radio-content">
                      <div class="radio-header">
                        <span class="radio-icon">🏠</span>
                        <span class="radio-title">Local Network</span>
                      </div>
                      <span class="radio-description">
                        Connect to local AI services like Ollama or custom endpoints
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Cloud Provider Configuration -->
              @if (providerFormGroup.get('type')?.value === 'cloud') {
                <div class="form-group">
                  <label for="cloudProvider">Cloud Provider</label>
                  <select 
                    id="cloudProvider"
                    formControlName="provider"
                    class="form-select"
                    [class.error]="hasFieldError('provider')"
                  >
                    <option value="" disabled>Select a cloud provider...</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                    <option value="azure">Azure OpenAI</option>
                  </select>
                  @if (hasFieldError('provider')) {
                    <div class="field-errors">
                      @for (error of getFieldErrors('provider'); track error) {
                        <span class="error-text">{{ error }}</span>
                      }
                    </div>
                  }
                </div>

                <div class="form-group">
                  <label for="apiKey">API Key</label>
                  <div class="api-key-input">
                    <input 
                      type="password" 
                      id="apiKey"
                      formControlName="apiKey"
                      placeholder="Enter your API key"
                      class="form-input"
                      [class.error]="hasFieldError('apiKey')"
                      [class.warning]="hasFieldWarning('apiKey')"
                    >
                    <button 
                      type="button" 
                      class="test-connection-btn"
                      (click)="testConnectionWithValidation()"
                      [disabled]="!canTestConnection() || testingConnection()"
                    >
                      @if (testingConnection()) {
                        <span class="loading-spinner-small"></span>
                      } @else {
                        Test
                      }
                    </button>
                  </div>
                  @if (hasFieldError('apiKey')) {
                    <div class="field-errors">
                      @for (error of getFieldErrors('apiKey'); track error) {
                        <span class="error-text">{{ error }}</span>
                      }
                    </div>
                  }
                  @if (hasFieldWarning('apiKey')) {
                    <div class="field-warnings">
                      @for (warning of getFieldWarnings('apiKey'); track warning) {
                        <span class="warning-text">{{ warning }}</span>
                      }
                    </div>
                  }
                  @if (connectionTestResult()) {
                    <div class="connection-result" [class.success]="connectionTestResult()?.success" [class.error]="!connectionTestResult()?.success">
                      @if (connectionTestResult()?.success) {
                        <span class="result-icon">✅</span>
                        <span>Connection successful</span>
                        @if (connectionTestResult()?.responseTime) {
                          <span class="response-time">({{ connectionTestResult()!.responseTime }}ms)</span>
                        }
                      } @else {
                        <span class="result-icon">❌</span>
                        <span>{{ connectionTestResult()?.error || 'Connection failed' }}</span>
                      }
                    </div>
                  }
                </div>
              }

              <!-- Local Network Provider Configuration -->
              @if (providerFormGroup.get('type')?.value === 'local-network') {
                <div class="form-group">
                  <label for="localHostType">Local Host Type</label>
                  <select 
                    id="localHostType"
                    formControlName="localHostType"
                    class="form-select"
                    [class.error]="hasFieldError('localHostType')"
                  >
                    <option value="" disabled>Select host type...</option>
                    <option value="ollama">Ollama</option>
                    <option value="custom">Custom Endpoint</option>
                  </select>
                  @if (hasFieldError('localHostType')) {
                    <div class="field-errors">
                      @for (error of getFieldErrors('localHostType'); track error) {
                        <span class="error-text">{{ error }}</span>
                      }
                    </div>
                  }
                </div>

                <div class="form-group">
                  <label for="endpoint">Network Address</label>
                  <input 
                    type="url" 
                    id="endpoint"
                    formControlName="endpoint"
                    placeholder="e.g., http://localhost:11434"
                    class="form-input"
                    [class.error]="hasFieldError('endpoint')"
                    [class.warning]="hasFieldWarning('endpoint')"
                  >
                  <span class="form-help">
                    Enter the full URL including protocol (http:// or https://)
                  </span>
                  @if (hasFieldError('endpoint')) {
                    <div class="field-errors">
                      @for (error of getFieldErrors('endpoint'); track error) {
                        <span class="error-text">{{ error }}</span>
                      }
                    </div>
                  }
                  @if (hasFieldWarning('endpoint')) {
                    <div class="field-warnings">
                      @for (warning of getFieldWarnings('endpoint'); track warning) {
                        <span class="warning-text">{{ warning }}</span>
                      }
                    </div>
                  }
                </div>

                <div class="form-group">
                  <label for="localApiKey">API Key (Optional)</label>
                  <input 
                    type="password" 
                    id="localApiKey"
                    formControlName="apiKey"
                    placeholder="Leave empty if no authentication required"
                    class="form-input"
                    [class.warning]="hasFieldWarning('apiKey')"
                  >
                  <span class="form-help">
                    Most local providers like Ollama don't require an API key
                  </span>
                  @if (hasFieldWarning('apiKey')) {
                    <div class="field-warnings">
                      @for (warning of getFieldWarnings('apiKey'); track warning) {
                        <span class="warning-text">{{ warning }}</span>
                      }
                    </div>
                  }
                </div>

                <div class="form-group">
                  <button 
                    type="button" 
                    class="test-connection-btn secondary"
                    (click)="testConnectionWithValidation()"
                    [disabled]="!canTestConnection() || testingConnection()"
                  >
                    @if (testingConnection()) {
                      <span class="loading-spinner-small"></span>
                      Testing Connection...
                    } @else {
                      Test Connection
                    }
                  </button>
                  @if (connectionTestResult()) {
                    <div class="connection-result" [class.success]="connectionTestResult()?.success" [class.error]="!connectionTestResult()?.success">
                      @if (connectionTestResult()?.success) {
                        <span class="result-icon">✅</span>
                        <span>Connection successful</span>
                        @if (connectionTestResult()?.responseTime) {
                          <span class="response-time">({{ connectionTestResult()!.responseTime }}ms)</span>
                        }
                        @if (connectionTestResult()?.availableModels?.length) {
                          <span class="model-count">({{ connectionTestResult()!.availableModels!.length }} models available)</span>
                        }
                      } @else {
                        <span class="result-icon">❌</span>
                        <span>{{ connectionTestResult()?.error || 'Connection failed' }}</span>
                      }
                    </div>
                  }
                </div>
              }
            </div>
            
            <div class="modal-footer">
              <button type="button" class="secondary-btn" (click)="closeProviderForm()">
                Cancel
              </button>
              <button 
                type="submit" 
                class="primary-btn" 
                [disabled]="!canSaveProvider() || (loading$ | async)"
              >
                @if (loading$ | async) {
                  <span class="loading-spinner-small"></span>
                }
                {{ editingProvider() ? 'Update' : 'Add' }} Provider
              </button>
            </div>
          </form>
        </div>
      }
    </div>
  `,
  styles: [`
    /* Form Validation Styles */
    .form-validation-errors,
    .form-validation-warnings {
      margin-bottom: 1rem;
      padding: 1rem;
      border-radius: 6px;
      border: 1px solid;
    }

    .form-validation-errors {
      background: var(--error-bg, #fee);
      border-color: var(--error-color, #f44336);
      color: var(--error-text, #c33);
    }

    .form-validation-warnings {
      background: var(--warning-bg, #fff3e0);
      border-color: var(--warning-color, #ff9800);
      color: var(--warning-text, #e65100);
    }

    .validation-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      font-weight: 600;
    }

    .validation-icon {
      font-size: 1rem;
    }

    .validation-list {
      margin: 0;
      padding-left: 1.5rem;
    }

    .validation-list li {
      margin-bottom: 0.25rem;
    }

    /* Field Validation Styles */
    .form-input.error,
    .form-select.error {
      border-color: var(--error-color, #f44336);
      background: var(--error-bg, #fee);
    }

    .form-input.warning,
    .form-select.warning {
      border-color: var(--warning-color, #ff9800);
      background: var(--warning-bg, #fff3e0);
    }

    .field-errors,
    .field-warnings {
      margin-top: 0.25rem;
    }

    .error-text {
      display: block;
      font-size: 0.75rem;
      color: var(--error-color, #f44336);
      margin-bottom: 0.125rem;
    }

    .warning-text {
      display: block;
      font-size: 0.75rem;
      color: var(--warning-color, #ff9800);
      margin-bottom: 0.125rem;
    }

    /* Connection Test Result Styles */
    .connection-result {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
      padding: 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
    }

    .connection-result.success {
      background: var(--success-bg, #e8f5e8);
      color: var(--success-text, #2e7d32);
      border: 1px solid var(--success-color, #4caf50);
    }

    .connection-result.error {
      background: var(--error-bg, #fee);
      color: var(--error-text, #c33);
      border: 1px solid var(--error-color, #f44336);
    }

    .result-icon {
      font-size: 1rem;
    }

    .response-time {
      font-size: 0.75rem;
      opacity: 0.8;
    }

    .model-count {
      font-size: 0.75rem;
      font-weight: 500;
    }

    /* Loading Spinner */
    .loading-spinner-small {
      width: 14px;
      height: 14px;
      border: 2px solid transparent;
      border-top: 2px solid currentColor;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Button States */
    .test-connection-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .primary-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Form Layout */
    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text-color);
    }

    .form-input,
    .form-select {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-size: 0.875rem;
      transition: all 0.2s ease;
    }

    .form-input:focus,
    .form-select:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb, 33, 150, 243), 0.2);
    }

    .form-help {
      display: block;
      margin-top: 0.25rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .api-key-input {
      display: flex;
      gap: 0.5rem;
    }

    .api-key-input .form-input {
      flex: 1;
    }

    .test-connection-btn {
      padding: 0.75rem 1rem;
      background: var(--primary-color);
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .test-connection-btn:hover:not(:disabled) {
      background: var(--primary-hover);
    }

    .test-connection-btn.secondary {
      background: var(--background-color);
      color: var(--text-color);
      border: 1px solid var(--border-color);
    }

    .test-connection-btn.secondary:hover:not(:disabled) {
      background: var(--hover-bg);
      border-color: var(--primary-color);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProviderManagementEnhancedComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private fb = inject(FormBuilder);

  // Observable selectors
  providers$ = this.store.select(selectProviders);
  loading$ = this.store.select(selectProvidersLoading);
  error$ = this.store.select(selectProvidersError);

  // Form state
  showProviderForm = signal(false);
  editingProvider = signal<ProviderConfig | null>(null);
  testingConnection = signal(false);
  connectionTestResult = signal<ConnectionTestResult | null>(null);
  
  // Form validation state
  formErrors = signal<string[]>([]);
  formWarnings = signal<string[]>([]);

  // Reactive form
  providerFormGroup: FormGroup;

  constructor(
    private store: Store,
    private errorHandler: ErrorHandlerService,
    private formValidation: FormValidationService,
    private providerManager: ProviderManagerService
  ) {
    this.providerFormGroup = this.createProviderForm();
    this.setupFormValidation();
  }

  ngOnInit(): void {
    // Load providers on init
    this.store.dispatch(ProviderActions.loadProviders());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Create reactive form with validators
   */
  private createProviderForm(): FormGroup {
    return this.fb.group({
      name: ['', [
        Validators.required,
        this.formValidation.providerValidators.name()
      ]],
      type: ['', Validators.required],
      provider: ['', Validators.required],
      apiKey: [''],
      endpoint: [''],
      localHostType: ['']
    });
  }

  /**
   * Setup form validation with real-time feedback
   */
  private setupFormValidation(): void {
    // Watch form changes and validate in real-time
    this.providerFormGroup.valueChanges.pipe(
      takeUntil(this.destroy$),
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(() => {
      this.validateForm();
    });

    // Update validators when provider type changes
    this.providerFormGroup.get('type')?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe((type) => {
      this.updateValidatorsForType(type);
    });

    // Update validators when provider changes
    this.providerFormGroup.get('provider')?.valueChanges.pipe(
      takeUntil(this.destroy$)
    ).subscribe((provider) => {
      this.updateValidatorsForProvider(provider);
    });
  }

  /**
   * Update form validators based on provider type
   */
  private updateValidatorsForType(type: string): void {
    const apiKeyControl = this.providerFormGroup.get('apiKey');
    const endpointControl = this.providerFormGroup.get('endpoint');
    const localHostTypeControl = this.providerFormGroup.get('localHostType');

    if (type === 'cloud') {
      apiKeyControl?.setValidators([
        Validators.required,
        this.formValidation.providerValidators.apiKey(this.providerFormGroup.get('provider')?.value || '')
      ]);
      endpointControl?.clearValidators();
      localHostTypeControl?.clearValidators();
    } else if (type === 'local-network') {
      apiKeyControl?.clearValidators();
      endpointControl?.setValidators([
        Validators.required,
        this.formValidation.providerValidators.endpoint()
      ]);
      localHostTypeControl?.setValidators([Validators.required]);
    }

    apiKeyControl?.updateValueAndValidity();
    endpointControl?.updateValueAndValidity();
    localHostTypeControl?.updateValueAndValidity();
  }

  /**
   * Update API key validator based on provider
   */
  private updateValidatorsForProvider(provider: string): void {
    const apiKeyControl = this.providerFormGroup.get('apiKey');
    const type = this.providerFormGroup.get('type')?.value;

    if (type === 'cloud' && provider) {
      apiKeyControl?.setValidators([
        Validators.required,
        this.formValidation.providerValidators.apiKey(provider)
      ]);
      apiKeyControl?.updateValueAndValidity();
    }
  }

  /**
   * Validate entire form and update error/warning signals
   */
  private async validateForm(): Promise<void> {
    try {
      const formValue = this.providerFormGroup.value;
      const providers = await firstValueFrom(this.providers$);
      const editingId = this.editingProvider()?.id;

      const validation = this.formValidation.validateProviderForm(
        formValue,
        providers,
        editingId
      );

      if (!validation.valid && validation.error) {
        this.formErrors.set([validation.error]);
      } else {
        this.formErrors.set([]);
      }

      this.formWarnings.set(validation.warnings || []);

    } catch (error) {
      this.errorHandler.handleError(error, 'Form Validation');
    }
  }

  /**
   * Check if a field has errors
   */
  hasFieldError(fieldName: string): boolean {
    const control = this.providerFormGroup.get(fieldName);
    return !!(control?.errors && control.touched);
  }

  /**
   * Check if a field has warnings
   */
  hasFieldWarning(fieldName: string): boolean {
    const control = this.providerFormGroup.get(fieldName);
    return this.formValidation.hasWarnings(control!);
  }

  /**
   * Get field errors
   */
  getFieldErrors(fieldName: string): string[] {
    const control = this.providerFormGroup.get(fieldName);
    return control ? this.formValidation.getControlErrors(control) : [];
  }

  /**
   * Get field warnings
   */
  getFieldWarnings(fieldName: string): string[] {
    const control = this.providerFormGroup.get(fieldName);
    return control ? this.formValidation.getControlWarnings(control) : [];
  }

  /**
   * Check if connection can be tested
   */
  canTestConnection(): boolean {
    const type = this.providerFormGroup.get('type')?.value;
    
    if (type === 'cloud') {
      return !!(this.providerFormGroup.get('provider')?.value && 
                this.providerFormGroup.get('apiKey')?.value);
    } else if (type === 'local-network') {
      return !!this.providerFormGroup.get('endpoint')?.value;
    }
    
    return false;
  }

  /**
   * Check if provider can be saved
   */
  canSaveProvider(): boolean {
    return this.providerFormGroup.valid && this.formErrors().length === 0;
  }

  /**
   * Test connection with validation
   */
  async testConnectionWithValidation(): Promise<void> {
    if (!this.canTestConnection()) {
      this.errorHandler.addWarning('Please fill in required fields before testing connection');
      return;
    }

    this.testingConnection.set(true);
    this.connectionTestResult.set(null);

    try {
      // Create temporary provider object for testing
      const formValue = this.providerFormGroup.value;
      const tempProvider: ProviderConfig = {
        id: 'temp-test',
        name: formValue.name || 'Test Provider',
        type: formValue.type,
        provider: formValue.provider,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(formValue.type === 'cloud' ? {
          apiKey: formValue.apiKey
        } : {
          endpoint: formValue.endpoint,
          localHostType: formValue.localHostType,
          ...(formValue.apiKey && { apiKey: formValue.apiKey })
        })
      } as ProviderConfig;

      const result = await this.providerManager.testProviderConnection(tempProvider);
      this.connectionTestResult.set(result);

    } catch (error) {
      this.errorHandler.handleConnectionError(error, undefined, 'connection test');
      this.connectionTestResult.set({
        success: false,
        error: 'Connection test failed due to an unexpected error'
      });
    } finally {
      this.testingConnection.set(false);
    }
  }

  /**
   * Save provider with comprehensive validation
   */
  async saveProviderWithValidation(): Promise<void> {
    if (!this.canSaveProvider()) {
      this.errorHandler.addWarning('Please fix validation errors before saving');
      return;
    }

    try {
      const formValue = this.providerFormGroup.value;
      
      const formValue = this.providerFormGroup.value;
      
      if (this.editingProvider()) {
        await this.providerManager.updateProvider(this.editingProvider()!.id, formValue);
      } else {
        await this.providerManager.addProvider(formValue);
      }

      this.closeProviderForm();
      
    } catch (error) {
      this.errorHandler.handleProviderError(
        error, 
        this.editingProvider() ? 'update' : 'add',
        formValue.name
      );
    }
  }

  /**
   * Handle provider type change
   */
  onProviderTypeChange(type: string): void {
    this.providerFormGroup.patchValue({ type });
    this.updateValidatorsForType(type);
    this.connectionTestResult.set(null);
  }

  /**
   * Close provider form
   */
  closeProviderForm(): void {
    this.showProviderForm.set(false);
    this.editingProvider.set(null);
    this.providerFormGroup.reset();
    this.formErrors.set([]);
    this.formWarnings.set([]);
    this.connectionTestResult.set(null);
  }
}