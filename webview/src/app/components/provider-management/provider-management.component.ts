import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Observable, Subject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { ProviderConfig, ProviderFormData, CloudProvider, LocalNetworkProvider, ConnectionTestResult } from '../../interfaces/provider-agent.interface';
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
import { ValidationService } from '../../services/validation.service';
import { ProviderManagerService } from '../../services/provider-manager.service';
import { ErrorNotificationComponent } from '../error-notification/error-notification.component';
import { ValidationUtils, FormValidationState, ValidationRules, FormValidation, FieldValidationState } from '../../utils/validation.utils';

@Component({
  selector: 'app-provider-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ErrorNotificationComponent],
  template: `
    <div class="provider-management">
      <div class="section-header">
        <h3>Provider Management</h3>
        <p class="section-description">
          Manage AI providers and their connection settings. Providers handle authentication and endpoints for your AI agents.
        </p>
      </div>

      <!-- Error Notifications -->
      <app-error-notification></app-error-notification>

      <!-- Provider Statistics -->
      @if (hasProviders$ | async) {
        <div class="provider-stats-compact">
          @if (providerStats$ | async; as stats) {
            <span class="stats-summary">
              {{ stats.activeProviders }} of {{ stats.totalProviders }} providers active
            </span>
          }
        </div>
      }

      <!-- Add Provider Button -->
      <div class="add-provider-section">
        <button class="primary-btn" (click)="showAddProviderForm()" [disabled]="loading$ | async">
          <span class="icon">+</span>
          Add Provider
        </button>
      </div>

      <!-- Loading State -->
      @if (loading$ | async) {
        <div class="loading-container">
          <div class="loading-spinner"></div>
          <span>Loading providers...</span>
        </div>
      }

      <!-- Error State -->
      @if (error$ | async; as error) {
        <div class="error-container">
          <span class="error-icon">⚠️</span>
          <span class="error-message">{{ error }}</span>
        </div>
      }

      <!-- Provider List -->
      @if (providers$ | async; as providers) {
        @if (providers.length === 0) {
          <div class="empty-state-simple">
            <span class="empty-text">No providers configured</span>
          </div>
        } @else {
          <div class="providers-list">
            @for (provider of providers; track provider.id) {
              <div class="provider-card" [class.inactive]="!provider.isActive">
                <div class="provider-header">
                  <div class="provider-info">
                    <div class="provider-name-row">
                      <h4 class="provider-name">{{ provider.name }}</h4>
                      <div class="provider-badges">
                        <span class="provider-type-badge" [class]="provider.type">
                          {{ getProviderTypeLabel(provider.type) }}
                        </span>
                        <span class="provider-badge" [class]="provider.provider">
                          {{ getProviderLabel(provider.provider) }}
                        </span>
                      </div>
                    </div>
                    <div class="provider-details">
                      @if (provider.type === 'local-network') {
                        <span class="provider-endpoint">{{ getProviderEndpoint(provider) }}</span>
                      }
                      <span class="provider-date">
                        Updated {{ formatDate(provider.updatedAt) }}
                      </span>
                    </div>
                  </div>
                  
                  <div class="provider-controls">
                    <!-- Active/Inactive Toggle -->
                    <label class="toggle-switch" [title]="provider.isActive ? 'Deactivate provider' : 'Activate provider'">
                      <input 
                        type="checkbox" 
                        [checked]="provider.isActive"
                        (change)="toggleProvider(provider.id, $event)"
                        [disabled]="loading$ | async"
                      >
                      <span class="toggle-slider"></span>
                    </label>
                    
                    <!-- Edit Button -->
                    <button 
                      class="icon-btn edit" 
                      (click)="editProvider(provider)" 
                      title="Edit provider"
                      [disabled]="loading$ | async"
                    >
                      <span class="icon">✏️</span>
                    </button>
                    
                    <!-- Delete Button -->
                    <button 
                      class="icon-btn delete" 
                      (click)="deleteProvider(provider)" 
                      title="Delete provider"
                      [disabled]="loading$ | async"
                    >
                      <span class="icon">🗑️</span>
                    </button>
                  </div>
                </div>
                
                <!-- Provider Status -->
                <div class="provider-status">
                  @if (provider.isActive) {
                    <span class="status-indicator active"></span>
                    <span class="status-text">Active</span>
                  } @else {
                    <span class="status-indicator inactive"></span>
                    <span class="status-text">Inactive</span>
                  }
                  
                  <!-- Connection Status (if available) -->
                  <div class="connection-status">
                    <span class="connection-dot unknown"></span>
                    <span class="connection-text">Connection status unknown</span>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      }
    </div>

    <!-- Provider Form Modal -->
    @if (showProviderForm()) {
      <div class="modal-overlay" (click)="closeProviderForm()">
        <form 
          #providerFormElement="ngForm" 
          (ngSubmit)="saveProvider($event)" 
          class="modal-content provider-form" 
          (click)="$event.stopPropagation()"
        >
          <div class="modal-header">
            <h3>{{ editingProvider() ? 'Edit Provider' : 'Add New Provider' }}</h3>
            <button type="button" class="close-btn" (click)="closeProviderForm()">×</button>
          </div>
          
          <div class="modal-body">
            <!-- Success Message -->
            @if (successMessage()) {
              <div class="success-message">
                <span class="success-icon">✅</span>
                <span>{{ successMessage() }}</span>
              </div>
            }

            <!-- Single Focused Error Message -->
            @if (currentError()) {
              <div class="form-errors">
                <div class="error-header">
                  <span class="error-icon">⚠️</span>
                  <span>{{ currentError() }}</span>
                </div>
              </div>
            }

            <!-- Provider Name -->
            <div class="form-group">
              <label for="providerName">Provider Name (Optional)</label>
              <input 
                type="text" 
                id="providerName"
                name="providerName"
                [(ngModel)]="providerForm.name" 
                (input)="onNameInput($event)"
                placeholder="Leave empty to auto-generate based on provider type"
                #nameField="ngModel"
                class="form-input"
                [class.error]="!nameFieldState().isValid"
                [class.validating]="nameFieldState().isValidating"
                [disabled]="savingProvider()"
              >
              @if (nameFieldState().isValidating) {
                <div class="field-validation validating">
                  <span class="loading-spinner-small"></span>
                  <span>Validating...</span>
                </div>
              } @else if (!nameFieldState().isValid) {
                <div class="field-validation error">
                  @for (error of nameFieldState().errors; track error) {
                    <span class="error-text">{{ error }}</span>
                  }
                </div>
              } @else if (nameFieldState().warnings.length > 0) {
                <div class="field-validation warning">
                  @for (warning of nameFieldState().warnings; track warning) {
                    <span class="warning-text">{{ warning }}</span>
                  }
                </div>
              }

            </div>

            <!-- Provider Type Selection -->
            <div class="form-group">
              <label for="providerType">Provider Type</label>
              <select 
                id="providerType"
                name="providerType"
                [(ngModel)]="providerForm.type"
                (ngModelChange)="onProviderTypeChange($event)"
                class="form-select"
                [class.error]="!typeFieldState().isValid"
                required
                [disabled]="savingProvider()"
              >
                <option value="" disabled>Select provider type...</option>
                <option value="cloud">☁️ Cloud Provider</option>
                <option value="local-network">🏠 Local Network</option>
              </select>
              @if (!typeFieldState().isValid) {
                <div class="field-validation error">
                  @for (error of typeFieldState().errors; track error) {
                    <span class="error-text">{{ error }}</span>
                  }
                </div>
              }

            </div>

            <!-- Cloud Provider Configuration -->
            @if (providerForm.type === 'cloud') {
              <div class="form-group">
                <label for="cloudProvider">Cloud Provider</label>
                <select 
                  id="cloudProvider"
                  name="cloudProvider"
                  [(ngModel)]="providerForm.provider" 
                  (ngModelChange)="validateProviderField($event)"
                  required
                  class="form-select"
                  [class.error]="!providerFieldState().isValid"
                  [disabled]="savingProvider()"
                >
                  <option value="" disabled>Select a cloud provider...</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="azure">Azure OpenAI</option>
                </select>
                @if (!providerFieldState().isValid) {
                  <div class="field-validation error">
                    @for (error of providerFieldState().errors; track error) {
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
                    name="apiKey"
                    [(ngModel)]="providerForm.apiKey" 
                    (input)="onApiKeyInput($event)"
                    placeholder="Enter your API key"
                    required
                    class="form-input"
                    [class.error]="!apiKeyFieldState().isValid"
                    [class.validating]="apiKeyFieldState().isValidating"
                    [disabled]="savingProvider()"
                  >
                  <button 
                    type="button" 
                    class="test-connection-btn"
                    (click)="testConnection()"
                    [disabled]="!providerForm.apiKey || testingConnection() || savingProvider() || !apiKeyFieldState().isValid"
                  >
                    @if (testingConnection()) {
                      <span class="loading-spinner-small"></span>
                    } @else {
                      Test
                    }
                  </button>
                </div>
                @if (apiKeyFieldState().isValidating) {
                  <div class="field-validation validating">
                    <span class="loading-spinner-small"></span>
                    <span>Validating API key format...</span>
                  </div>
                } @else if (!apiKeyFieldState().isValid) {
                  <div class="field-validation error">
                    @for (error of apiKeyFieldState().errors; track error) {
                      <span class="error-text">{{ error }}</span>
                    }
                  </div>
                } @else if (apiKeyFieldState().warnings.length > 0) {
                  <div class="field-validation warning">
                    @for (warning of apiKeyFieldState().warnings; track warning) {
                      <span class="warning-text">{{ warning }}</span>
                    }
                  </div>
                }
                @if (connectionTestResult()) {
                  <div class="connection-result" [class.success]="connectionTestResult()?.success" [class.error]="!connectionTestResult()?.success">
                    @if (connectionTestResult()?.success) {
                      <span class="result-icon">✅</span>
                      <span>Connection successful</span>
                    } @else {
                      <span class="result-icon">❌</span>
                      <span>{{ connectionTestResult()?.error || 'Connection failed' }}</span>
                    }
                  </div>
                }
              </div>
            }

            <!-- Local Network Provider Configuration -->
            @if (providerForm.type === 'local-network') {
              <div class="form-group">
                <label for="localHostType">Local Host Type</label>
                <select 
                  id="localHostType"
                  name="localHostType"
                  [(ngModel)]="providerForm.localHostType" 
                  (ngModelChange)="onLocalHostTypeChange($event)"
                  required
                  class="form-select"
                  [class.error]="!localHostTypeFieldState().isValid"
                  [disabled]="savingProvider()"
                >
                  <option value="" disabled>Select host type...</option>
                  <option value="ollama">Ollama</option>
                  <option value="custom">Custom Endpoint</option>
                </select>
                @if (!localHostTypeFieldState().isValid) {
                  <div class="field-validation error">
                    @for (error of localHostTypeFieldState().errors; track error) {
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
                  name="endpoint"
                  [(ngModel)]="providerForm.endpoint" 
                  (input)="onEndpointInput($event)"
                  placeholder="e.g., http://localhost:11434"
                  required
                  class="form-input"
                  [class.error]="!endpointFieldState().isValid"
                  [class.validating]="endpointFieldState().isValidating"
                  [disabled]="savingProvider()"
                >
                @if (endpointFieldState().isValidating) {
                  <div class="field-validation validating">
                    <span class="loading-spinner-small"></span>
                    <span>Validating URL format...</span>
                  </div>
                } @else if (!endpointFieldState().isValid) {
                  <div class="field-validation error">
                    @for (error of endpointFieldState().errors; track error) {
                      <span class="error-text">{{ error }}</span>
                    }
                  </div>
                } @else if (endpointFieldState().warnings.length > 0) {
                  <div class="field-validation warning">
                    @for (warning of endpointFieldState().warnings; track warning) {
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
                  name="localApiKey"
                  [(ngModel)]="providerForm.apiKey" 
                  placeholder="Leave empty if no authentication required"
                  class="form-input"
                  [disabled]="saving()"
                >

              </div>

              <div class="form-group">
                <button 
                  type="button" 
                  class="test-connection-btn secondary"
                  (click)="testConnection()"
                  [disabled]="!providerForm.endpoint || testingConnection() || saving()"
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
            <button 
              type="button" 
              class="secondary-btn" 
              (click)="closeProviderForm()"
              [disabled]="saving()"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              class="primary-btn" 
              [disabled]="savingProvider() || !isFormValid() || currentError()"
            >
              @if (savingProvider()) {
                <span class="loading-spinner-small"></span>
                @if (testingConnectionForSave()) {
                  Testing connection...
                } @else {
                  {{ editingProvider() ? 'Updating...' : 'Adding...' }}
                }
              } @else {
                {{ editingProvider() ? 'Update' : 'Add' }} Provider
              }
            </button>
          </div>
        </form>
      </div>
    }

    <!-- Delete Confirmation Dialog -->
    @if (showDeleteConfirmation()) {
      <div class="modal-overlay" (click)="closeDeleteConfirmation()">
        <div class="modal-content delete-confirmation" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Delete Provider</h3>
            <button type="button" class="close-btn" (click)="closeDeleteConfirmation()">×</button>
          </div>
          
          <div class="modal-body">
            @if (providerToDelete(); as provider) {
              <div class="delete-warning">
                <div class="warning-icon">⚠️</div>
                <div class="warning-content">
                  <h4>Are you sure you want to delete "{{ provider.name }}"?</h4>
                  <p>This action cannot be undone. Deleting this provider will:</p>
                  <ul class="impact-list">
                    <li>Remove the provider configuration permanently</li>
                    <li>Deactivate all agents that depend on this provider</li>
                    <li>Stop any ongoing conversations using agents from this provider</li>
                  </ul>
                  <div class="provider-info-summary">
                    <strong>Provider Details:</strong>
                    <div class="provider-summary">
                      <span class="provider-type-badge" [class]="provider.type">
                        {{ getProviderTypeLabel(provider.type) }}
                      </span>
                      <span class="provider-badge" [class]="provider.provider">
                        {{ getProviderLabel(provider.provider) }}
                      </span>
                      @if (provider.type === 'local-network') {
                        <span class="provider-endpoint-summary">{{ getProviderEndpoint(provider) }}</span>
                      }
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>
          
          <div class="modal-footer">
            <button type="button" class="secondary-btn" (click)="closeDeleteConfirmation()">
              Cancel
            </button>
            <button 
              type="button" 
              class="danger-btn" 
              (click)="confirmDeleteProvider()"
              [disabled]="loading$ | async"
            >
              @if (loading$ | async) {
                <span class="loading-spinner-small"></span>
              }
              Delete Provider
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .provider-management {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .section-header h3 {
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .section-description {
      margin: 0;
      color: var(--text-secondary);
      font-size: 0.875rem;
      line-height: 1.5;
    }

    /* Provider Statistics */
    .provider-stats-compact {
      padding: 0.75rem 1rem;
      background: var(--background-secondary);
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .stats-summary {
      font-size: 0.875rem;
      color: var(--text-secondary);
      font-weight: 500;
    }

    /* Add Provider Section */
    .add-provider-section {
      display: flex;
      justify-content: flex-start;
    }

    .primary-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: var(--primary-color);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .primary-btn:hover:not(:disabled) {
      background: var(--primary-hover);
      transform: translateY(-1px);
    }

    .primary-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .primary-btn .icon {
      font-size: 1rem;
      font-weight: bold;
    }

    /* Loading and Error States */
    .loading-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 2rem;
      justify-content: center;
      color: var(--text-secondary);
    }

    .loading-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--border-color);
      border-top: 2px solid var(--primary-color);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--error-bg, #fee);
      border: 1px solid var(--error-border, #fcc);
      border-radius: 6px;
      color: var(--error-text, #c33);
    }

    .error-icon {
      font-size: 1.25rem;
    }

    /* Empty State */
    .empty-state-simple {
      padding: 1rem;
      text-align: center;
    }

    .empty-text {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    /* Provider List */
    .providers-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .provider-card {
      padding: 1.25rem;
      background: var(--background-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      transition: all 0.2s ease;
    }

    .provider-card:hover {
      border-color: var(--primary-color);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .provider-card.inactive {
      opacity: 0.7;
      background: var(--background-tertiary, var(--background-secondary));
    }

    .provider-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .provider-info {
      flex: 1;
    }

    .provider-name-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.5rem;
    }

    .provider-name {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .provider-badges {
      display: flex;
      gap: 0.5rem;
    }

    .provider-type-badge,
    .provider-badge {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 500;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .provider-type-badge.cloud {
      background: var(--info-bg, #e3f2fd);
      color: var(--info-text, #1976d2);
    }

    .provider-type-badge.local-network {
      background: var(--success-bg, #e8f5e8);
      color: var(--success-text, #2e7d32);
    }

    .provider-badge.openai {
      background: #f0f8ff;
      color: #0066cc;
    }

    .provider-badge.anthropic {
      background: #fff5f0;
      color: #cc4400;
    }

    .provider-badge.google {
      background: #f0fff0;
      color: #009900;
    }

    .provider-badge.azure {
      background: #f0f8ff;
      color: #0078d4;
    }

    .provider-badge.ollama {
      background: #f8f0ff;
      color: #6600cc;
    }

    .provider-badge.custom {
      background: var(--background-tertiary, #f5f5f5);
      color: var(--text-secondary);
    }

    .provider-details {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .provider-endpoint {
      font-family: monospace;
      font-size: 0.875rem;
      color: var(--text-secondary);
      background: var(--background-tertiary, #f5f5f5);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      display: inline-block;
      max-width: fit-content;
    }

    .provider-date {
      font-size: 0.75rem;
      color: var(--text-tertiary, var(--text-secondary));
    }

    /* Provider Controls */
    .provider-controls {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      cursor: pointer;
    }

    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--border-color);
      transition: 0.3s;
      border-radius: 24px;
    }

    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }

    input:checked + .toggle-slider {
      background-color: var(--primary-color);
    }

    input:checked + .toggle-slider:before {
      transform: translateX(20px);
    }

    input:disabled + .toggle-slider {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: none;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .icon-btn:hover:not(:disabled) {
      background: var(--hover-bg);
      border-color: var(--primary-color);
    }

    .icon-btn.edit:hover:not(:disabled) {
      background: var(--info-bg, #e3f2fd);
      border-color: var(--info-color, #1976d2);
    }

    .icon-btn.delete:hover:not(:disabled) {
      background: var(--error-bg, #fee);
      border-color: var(--error-color, #d32f2f);
    }

    .icon-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .icon-btn .icon {
      font-size: 0.875rem;
    }

    /* Provider Status */
    .provider-status {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-indicator.active {
      background: var(--success-color, #4caf50);
    }

    .status-indicator.inactive {
      background: var(--text-tertiary, #999);
    }

    .status-text {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-left: auto;
    }

    .connection-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .connection-dot.unknown {
      background: var(--text-tertiary, #999);
    }

    .connection-dot.connected {
      background: var(--success-color, #4caf50);
    }

    .connection-dot.disconnected {
      background: var(--error-color, #f44336);
    }

    .connection-text {
      font-size: 0.75rem;
      color: var(--text-tertiary, var(--text-secondary));
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }

    .modal-content {
      background: var(--background-color);
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem 1.5rem 0 1.5rem;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 1.5rem;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .modal-header .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--text-secondary);
      padding: 0.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .modal-header .close-btn:hover {
      background: var(--hover-bg);
      color: var(--text-color);
    }

    .modal-body {
      padding: 0 1.5rem;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1.5rem;
      border-top: 1px solid var(--border-color);
      margin-top: 1.5rem;
    }

    /* Form Styles */
    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: var(--text-color);
      font-size: 0.875rem;
    }

    .form-input,
    .form-select {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--background-color);
      color: var(--text-color);
      font-size: 0.875rem;
      transition: border-color 0.2s ease;
    }

    .form-input:focus,
    .form-select:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb, 59, 130, 246), 0.1);
    }

    .form-help {
      display: block;
      margin-top: 0.25rem;
      font-size: 0.75rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .error-text {
      display: block;
      margin-top: 0.25rem;
      font-size: 0.75rem;
      color: var(--error-color, #d32f2f);
    }

    /* Validation states */
    .form-input.error,
    .form-select.error {
      border-color: var(--error-color, #dc3545);
      box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.1);
    }

    .form-input.validating,
    .form-select.validating {
      border-color: var(--warning-color, #ffc107);
    }

    /* Field validation messages */
    .field-validation {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
      font-size: 0.875rem;
      line-height: 1.4;
    }

    .field-validation.error {
      color: var(--error-color, #dc3545);
    }

    .field-validation.warning {
      color: var(--warning-color, #ffc107);
    }

    .field-validation.validating {
      color: var(--text-secondary);
    }

    .field-validation .loading-spinner-small {
      width: 14px;
      height: 14px;
      border-width: 2px;
    }

    .field-validation .error-text {
      margin: 0;
      font-weight: 500;
    }

    .warning-text {
      display: block;
      font-weight: 500;
      color: var(--warning-color, #ffc107);
    }



    /* API Key Input */
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
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      white-space: nowrap;
    }

    .test-connection-btn:hover:not(:disabled) {
      background: var(--primary-hover);
    }

    .test-connection-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .test-connection-btn.secondary {
      background: var(--background-secondary);
      color: var(--text-color);
      border: 1px solid var(--border-color);
    }

    .test-connection-btn.secondary:hover:not(:disabled) {
      background: var(--hover-bg);
      border-color: var(--primary-color);
    }

    .loading-spinner-small {
      width: 14px;
      height: 14px;
      border: 2px solid transparent;
      border-top: 2px solid currentColor;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    /* Connection Test Result */
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
      border: 1px solid var(--success-border, #c8e6c9);
    }

    .connection-result.error {
      background: var(--error-bg, #fee);
      color: var(--error-text, #c33);
      border: 1px solid var(--error-border, #fcc);
    }

    .result-icon {
      font-size: 1rem;
    }

    .model-count {
      font-size: 0.75rem;
      opacity: 0.8;
    }

    /* Button Styles */
    .secondary-btn {
      padding: 0.75rem 1.5rem;
      background: var(--background-secondary);
      color: var(--text-color);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .secondary-btn:hover:not(:disabled) {
      background: var(--hover-bg);
      border-color: var(--primary-color);
    }

    .secondary-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Delete Confirmation Dialog */
    .delete-confirmation {
      max-width: 600px;
    }

    .delete-warning {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
    }

    .warning-icon {
      font-size: 2rem;
      color: var(--warning-color, #ff9800);
      flex-shrink: 0;
    }

    .warning-content {
      flex: 1;
    }

    .warning-content h4 {
      margin: 0 0 1rem 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .warning-content p {
      margin: 0 0 1rem 0;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .impact-list {
      margin: 0 0 1.5rem 0;
      padding-left: 1.5rem;
      color: var(--text-secondary);
    }

    .impact-list li {
      margin-bottom: 0.5rem;
      line-height: 1.4;
    }

    .provider-info-summary {
      padding: 1rem;
      background: var(--background-secondary);
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .provider-info-summary strong {
      display: block;
      margin-bottom: 0.5rem;
      color: var(--text-color);
      font-size: 0.875rem;
    }

    .provider-summary {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .provider-endpoint-summary {
      font-family: monospace;
      font-size: 0.75rem;
      color: var(--text-secondary);
      background: var(--background-tertiary, #f5f5f5);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }

    .danger-btn {
      padding: 0.75rem 1.5rem;
      background: var(--error-color, #d32f2f);
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .danger-btn:hover:not(:disabled) {
      background: var(--error-hover, #b71c1c);
      transform: translateY(-1px);
    }

    .danger-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    /* Success Message */
    .success-message {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--success-bg, #e8f5e8);
      border: 1px solid var(--success-border, #c8e6c9);
      border-radius: 6px;
      color: var(--success-text, #2e7d32);
      margin-bottom: 1.5rem;
    }

    .success-icon {
      font-size: 1.25rem;
    }

    /* Form Errors */
    .form-errors {
      padding: 1rem;
      background: var(--error-bg, #fee);
      border: 1px solid var(--error-border, #fcc);
      border-radius: 6px;
      color: var(--error-text, #c33);
      margin-bottom: 1.5rem;
    }

    .error-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      font-weight: 500;
    }

    .error-icon {
      font-size: 1.125rem;
    }

    .error-list {
      margin: 0;
      padding-left: 1.5rem;
    }

    .error-list li {
      margin-bottom: 0.5rem;
      line-height: 1.4;
    }

    .error-list li:last-child {
      margin-bottom: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProviderManagementComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private store = inject(Store);
  private fb = inject(FormBuilder);
  private errorHandler = inject(ErrorHandlerService);
  private validationService = inject(ValidationService);
  private providerManager = inject(ProviderManagerService);

  ngOnInit(): void {
    // Load providers on component initialization
    this.store.dispatch(ProviderActions.loadProviders());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Observable selectors
  providers$ = this.store.select(selectProviders);
  loading$ = this.store.select(selectProvidersLoading);
  error$ = this.store.select(selectProvidersError);
  activeProviders$ = this.store.select(selectActiveProviders);
  providerStats$ = this.store.select(selectProviderStats);
  hasProviders$ = this.store.select(selectHasProviders);

  // Component state
  showProviderForm = signal(false);
  editingProvider = signal<ProviderConfig | null>(null);
  testingConnection = signal(false);
  connectionTestResult = signal<{ success: boolean; error?: string; availableModels?: string[] } | null>(null);
  showDeleteConfirmation = signal(false);
  providerToDelete = signal<ProviderConfig | null>(null);
  saving = signal(false);
  formErrors = signal<string[]>([]);
  successMessage = signal<string | null>(null);
  currentError = signal<string | null>(null);

  // Provider form data
  providerForm: ProviderFormData = {
    name: '',
    type: 'cloud',
    provider: 'openai',
    apiKey: '',
    endpoint: '',
    localHostType: 'ollama'
  };

  // Real-time validation state
  private validationState = new FormValidationState();
  
  // Field validation states (signals for reactive UI)
  nameFieldState = signal<FieldValidationState>({ isValid: true, errors: [], warnings: [], isValidating: false });
  typeFieldState = signal<FieldValidationState>({ isValid: true, errors: [], warnings: [], isValidating: false });
  providerFieldState = signal<FieldValidationState>({ isValid: true, errors: [], warnings: [], isValidating: false });
  apiKeyFieldState = signal<FieldValidationState>({ isValid: true, errors: [], warnings: [], isValidating: false });
  endpointFieldState = signal<FieldValidationState>({ isValid: true, errors: [], warnings: [], isValidating: false });
  localHostTypeFieldState = signal<FieldValidationState>({ isValid: true, errors: [], warnings: [], isValidating: false });

  // Computed validation state
  isFormValid = computed(() => {
    return this.validationState.isFormValid() && 
           this.nameFieldState().isValid &&
           this.typeFieldState().isValid &&
           this.providerFieldState().isValid &&
           this.apiKeyFieldState().isValid &&
           this.endpointFieldState().isValid &&
           this.localHostTypeFieldState().isValid;
  });

  // Loading states for individual operations
  savingProvider = signal(false);
  testingApiKey = signal(false);
  testingEndpoint = signal(false);
  testingConnectionForSave = signal(false);

  constructor() {
    // Load providers on component initialization
    this.store.dispatch(ProviderActions.loadProviders());
  }

  /**
   * Show the add provider form
   */
  showAddProviderForm(): void {
    this.editingProvider.set(null);
    this.saving.set(false);
    this.clearError();
    this.resetProviderForm();
    this.showProviderForm.set(true);
  }

  /**
   * Edit an existing provider
   */
  editProvider(provider: ProviderConfig): void {
    this.editingProvider.set(provider);
    this.saving.set(false);
    this.clearError();
    this.populateProviderForm(provider);
    this.showProviderForm.set(true);
  }

  /**
   * Toggle provider active/inactive status
   */
  toggleProvider(providerId: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    const isActive = target.checked;
    
    this.store.dispatch(ProviderActions.toggleProvider({ 
      providerId, 
      isActive 
    }));
  }

  /**
   * Show delete confirmation dialog
   */
  deleteProvider(provider: ProviderConfig): void {
    this.providerToDelete.set(provider);
    this.showDeleteConfirmation.set(true);
  }

  /**
   * Confirm provider deletion
   */
  confirmDeleteProvider(): void {
    const provider = this.providerToDelete();
    if (provider) {
      this.store.dispatch(ProviderActions.deleteProvider({ 
        providerId: provider.id 
      }));
    }
    this.closeDeleteConfirmation();
  }

  /**
   * Close delete confirmation dialog
   */
  closeDeleteConfirmation(): void {
    this.showDeleteConfirmation.set(false);
    this.providerToDelete.set(null);
  }

  /**
   * Get display label for provider type
   */
  getProviderTypeLabel(type: 'cloud' | 'local-network'): string {
    return type === 'cloud' ? 'Cloud' : 'Local Network';
  }

  /**
   * Get display label for provider
   */
  getProviderLabel(provider: string): string {
    const labels: Record<string, string> = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'google': 'Google',
      'azure': 'Azure',
      'ollama': 'Ollama',
      'custom': 'Custom'
    };
    return labels[provider] || provider;
  }

  /**
   * Format date for display
   */
  formatDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'today';
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return new Date(date).toLocaleDateString();
    }
  }

  /**
   * Get provider endpoint safely
   */
  getProviderEndpoint(provider: ProviderConfig): string {
    return provider.type === 'local-network' ? (provider as LocalNetworkProvider).endpoint : '';
  }

  /**
   * Reset provider form to default values
   */
  private resetProviderForm(): void {
    this.providerForm = {
      name: '',
      type: 'cloud',
      provider: 'openai',
      endpoint: '',
      apiKey: '',
      localHostType: 'ollama'
    };
    this.connectionTestResult.set(null);
    this.clearError();
    this.clearValidationStates();
  }

  /**
   * Generate a provider name based on provider type and provider
   */
  private generateProviderName(provider: string, type: 'cloud' | 'local-network'): string {
    return ValidationUtils.generateProviderNameFromSelection(provider, type);
  }

  /**
   * Populate provider form with existing provider data
   */
  private populateProviderForm(provider: ProviderConfig): void {
    this.providerForm = {
      name: provider.name,
      type: provider.type,
      provider: provider.provider,
      endpoint: provider.type === 'local-network' ? (provider as LocalNetworkProvider).endpoint : '',
      apiKey: provider.type === 'cloud' ? (provider as CloudProvider).apiKey : (provider as LocalNetworkProvider).apiKey || '',
      localHostType: provider.type === 'local-network' ? (provider as LocalNetworkProvider).localHostType : 'ollama'
    };
    this.connectionTestResult.set(null);
  }

  /**
   * Close provider form
   */
  closeProviderForm(): void {
    this.showProviderForm.set(false);
    this.editingProvider.set(null);
    this.savingProvider.set(false);
    this.clearError();
    this.resetProviderForm();
  }

  /**
   * Handle provider type change
   */
  onProviderTypeChange(type: 'cloud' | 'local-network'): void {
    this.providerForm.type = type;
    
    // Clear any existing errors when changing provider type
    this.clearError();
    
    // Validate the type field
    this.validateTypeField(type);
    
    if (type === 'cloud') {
      this.providerForm.provider = 'openai';
      this.providerForm.endpoint = '';
      this.providerForm.localHostType = undefined;
      
      // Clear endpoint validation since it's not needed for cloud
      this.endpointFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
      this.localHostTypeFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
      
      // Validate provider and API key for cloud
      this.validateProviderField(this.providerForm.provider);
      if (this.providerForm.apiKey) {
        this.validateApiKeyField(this.providerForm.apiKey);
      }
    } else {
      this.providerForm.provider = 'ollama';
      this.providerForm.endpoint = 'http://localhost:11434';
      this.providerForm.localHostType = 'ollama';
      this.providerForm.apiKey = '';
      
      // Clear API key validation since it's not required for local
      this.apiKeyFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
      
      // Validate local network fields
      this.validateProviderField(this.providerForm.provider);
      this.validateLocalHostTypeField(this.providerForm.localHostType);
      this.validateEndpointField(this.providerForm.endpoint);
    }
    
    this.connectionTestResult.set(null);
  }

  /**
   * Handle local host type change
   */
  onLocalHostTypeChange(hostType: string): void {
    this.providerForm.localHostType = hostType as 'ollama' | 'custom';
    
    // Clear any existing errors when changing local host type
    this.clearError();
    
    // Validate the local host type field
    this.validateLocalHostTypeField(hostType);
    
    if (hostType === 'ollama') {
      this.providerForm.provider = 'ollama';
      this.providerForm.endpoint = 'http://localhost:11434';
    } else {
      this.providerForm.provider = 'custom';
      this.providerForm.endpoint = '';
    }
    
    // Validate related fields
    this.validateProviderField(this.providerForm.provider);
    this.validateEndpointField(this.providerForm.endpoint);
    
    this.connectionTestResult.set(null);
  }

  /**
   * Test connection to provider
   */
  testConnection(): void {
    if (this.testingConnection()) {return;}

    this.testingConnection.set(true);
    this.connectionTestResult.set(null);

    // Simulate connection test - in real implementation, this would call the provider service
    setTimeout(() => {
      const isValid = this.validateProviderConfig();
      
      if (isValid) {
        this.connectionTestResult.set({
          success: true,
          availableModels: this.getMockModels()
        });
      } else {
        this.connectionTestResult.set({
          success: false,
          error: 'Invalid configuration or connection failed'
        });
      }
      
      this.testingConnection.set(false);
    }, 2000);
  }

  /**
   * Test connection before saving provider (automatic connection testing)
   */
  private async testConnectionBeforeSave(): Promise<ConnectionTestResult> {
    try {
      this.testingConnectionForSave.set(true);
      
      // Create a temporary provider object for testing
      const tempProvider = this.buildProviderFromForm();
      
      // Use the provider manager service to test the connection
      const result = await this.providerManager.testProviderConnection(tempProvider as ProviderConfig);
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      };
    } finally {
      this.testingConnectionForSave.set(false);
    }
  }

  /**
   * Validate provider configuration
   */
  private validateProviderConfig(): boolean {
    if (this.providerForm.type === 'cloud') {
      return !!(this.providerForm.provider && this.providerForm.apiKey);
    } else {
      return !!(this.providerForm.endpoint && this.providerForm.localHostType);
    }
  }

  /**
   * Get mock models for testing
   */
  private getMockModels(): string[] {
    if (this.providerForm.type === 'cloud') {
      const modelMap: Record<string, string[]> = {
        'openai': ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        'anthropic': ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
        'google': ['gemini-pro', 'gemini-pro-vision'],
        'azure': ['gpt-4', 'gpt-35-turbo']
      };
      return modelMap[this.providerForm.provider] || [];
    } else {
      return ['llama3.2', 'codellama', 'mistral'];
    }
  }

  /**
   * Save provider with proper validation and error handling
   */
  async saveProvider(event?: Event): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Clear previous errors and success messages
    this.clearError();

    // Validate form before submission
    if (!this.validateProviderForm()) {
      return;
    }

    try {
      this.savingProvider.set(true);

      // Auto-generate name if not provided
      if (!this.providerForm.name?.trim()) {
        this.providerForm.name = this.generateProviderName(
          this.providerForm.provider, 
          this.providerForm.type
        );
      }

      const editing = this.editingProvider();
      
      // Automatically test connection before adding/updating provider
      const connectionResult = await this.testConnectionBeforeSave();
      
      if (!connectionResult.success) {
        this.showError(`Could not connect to provider: ${connectionResult.error}`);
        return;
      }
      
      if (editing) {
        // Update existing provider
        await this.updateExistingProvider(editing);
      } else {
        // Add new provider
        await this.addNewProvider();
      }

      // Show success message
      const successMsg = editing ? 
        `Provider "${this.providerForm.name}" updated successfully` : 
        `Provider "${this.providerForm.name}" added successfully`;
      
      this.successMessage.set(successMsg);
      this.errorHandler.addInfo(successMsg, 'Provider Management');

      // Close form after short delay to show success message
      setTimeout(() => {
        this.closeProviderForm();
      }, 1500);

    } catch (error) {
      const isEditing = this.editingProvider();
      const errorMsg = isEditing ? 'Failed to update provider' : 'Failed to add provider';
      this.errorHandler.handleProviderError(error, isEditing ? 'update' : 'add', this.providerForm.name);
      this.showError(errorMsg + ': ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      this.savingProvider.set(false);
    }
  }

  /**
   * Real-time validation methods
   */
  
  /**
   * Validate provider name field in real-time
   */
  async validateNameField(value: string): Promise<void> {
    // Only validate if name is provided (since it's optional)
    if (!value || !value.trim()) {
      this.nameFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
      return;
    }

    // Use the centralized validation logic - show only name validation errors, no unrelated warnings
    const result = ValidationUtils.validateProviderName(value);
    
    this.nameFieldState.set({
      isValid: result.valid,
      errors: result.error ? [result.error] : [],
      warnings: [], // Remove warnings to prevent unrelated Ollama warnings from appearing
      isValidating: false
    });
  }

  /**
   * Validate provider type field
   */
  validateTypeField(value: string): void {
    const rules = [ValidationRules.required()];
    const result = FormValidation.validateFieldRealTime(value, 'providerType', rules);
    
    this.validationState.setFieldState('type', {
      isValid: result.valid,
      errors: result.error ? [result.error] : [],
      warnings: [], // Remove warnings to prevent redundant messages
      isValidating: false
    });
    
    this.typeFieldState.set(this.validationState.getFieldState('type'));
    
    // Clear form-level error if this field becomes valid
    if (result.valid && this.currentError()) {
      this.clearError();
    }
  }

  /**
   * Validate provider selection field
   */
  validateProviderField(value: string): void {
    const rules = [ValidationRules.required()];
    const result = FormValidation.validateFieldRealTime(value, 'provider', rules);
    
    this.validationState.setFieldState('provider', {
      isValid: result.valid,
      errors: result.error ? [result.error] : [],
      warnings: [], // Remove warnings to prevent redundant messages
      isValidating: false
    });
    
    this.providerFieldState.set(this.validationState.getFieldState('provider'));
    
    // Clear form-level error if this field becomes valid
    if (result.valid && this.currentError()) {
      this.clearError();
    }
  }

  /**
   * Validate API key field in real-time
   */
  async validateApiKeyField(value: string): Promise<void> {
    if (this.providerForm.type !== 'cloud') {
      this.apiKeyFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
      return;
    }

    const rules = [
      ValidationRules.required(),
      ValidationRules.apiKeyFormat(this.providerForm.provider)
    ];

    const result = await this.validationState.validateFieldDebounced('apiKey', value, rules);
    const fieldState = this.validationState.getFieldState('apiKey');
    
    // Remove warnings to prevent redundant messages
    this.apiKeyFieldState.set({
      ...fieldState,
      warnings: []
    });
    
    // Clear form-level error if this field becomes valid
    if (fieldState.isValid && this.currentError()) {
      this.clearError();
    }
  }

  /**
   * Validate endpoint field in real-time
   */
  async validateEndpointField(value: string): Promise<void> {
    if (this.providerForm.type !== 'local-network') {
      this.endpointFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
      return;
    }

    const rules = [
      ValidationRules.required(),
      ValidationRules.urlFormat()
    ];

    const result = await this.validationState.validateFieldDebounced('endpoint', value, rules);
    const fieldState = this.validationState.getFieldState('endpoint');
    
    // Remove warnings to prevent redundant messages
    this.endpointFieldState.set({
      ...fieldState,
      warnings: []
    });
    
    // Clear form-level error if this field becomes valid
    if (fieldState.isValid && this.currentError()) {
      this.clearError();
    }
  }

  /**
   * Helper methods for event handling
   */
  onNameInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target) {
      // Clear form-level error when user starts typing
      if (this.currentError()) {
        this.clearError();
      }
      this.validateNameField(target.value);
    }
  }

  onApiKeyInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target) {
      // Clear form-level error when user starts typing
      if (this.currentError()) {
        this.clearError();
      }
      this.validateApiKeyField(target.value);
    }
  }

  onEndpointInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target) {
      // Clear form-level error when user starts typing
      if (this.currentError()) {
        this.clearError();
      }
      this.validateEndpointField(target.value);
    }
  }

  /**
   * Validate local host type field
   */
  validateLocalHostTypeField(value: string): void {
    if (this.providerForm.type !== 'local-network') {
      this.localHostTypeFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
      return;
    }

    const rules = [ValidationRules.required()];
    const result = FormValidation.validateFieldRealTime(value, 'localHostType', rules);
    
    this.validationState.setFieldState('localHostType', {
      isValid: result.valid,
      errors: result.error ? [result.error] : [],
      warnings: [], // Remove warnings to prevent redundant messages
      isValidating: false
    });
    
    this.localHostTypeFieldState.set(this.validationState.getFieldState('localHostType'));
    
    // Clear form-level error if this field becomes valid
    if (result.valid && this.currentError()) {
      this.clearError();
    }
  }

  /**
   * Clear all validation states
   */
  private clearValidationStates(): void {
    this.validationState.clear();
    this.nameFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
    this.typeFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
    this.providerFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
    this.apiKeyFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
    this.endpointFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
    this.localHostTypeFieldState.set({ isValid: true, errors: [], warnings: [], isValidating: false });
  }

  /**
   * Clear current error message
   */
  clearError(): void {
    this.currentError.set(null);
    this.formErrors.set([]);
    this.successMessage.set(null);
  }

  /**
   * Show a single, focused error message
   */
  showError(message: string): void {
    // Clear any existing errors first to prevent multiple simultaneous error messages
    this.clearError();
    this.currentError.set(message);
    this.formErrors.set([message]);
  }

  /**
   * Validate provider form before submission
   */
  private validateProviderForm(): boolean {
    // Clear any existing errors first
    this.clearError();

    // Validate provider type
    if (!this.providerForm.type) {
      this.showError('Provider type is required');
      return false;
    }

    // Type-specific validation
    if (this.providerForm.type === 'cloud') {
      if (!this.providerForm.provider) {
        this.showError('Cloud provider selection is required');
        return false;
      }
      
      if (!this.providerForm.apiKey?.trim()) {
        this.showError('API key is required for cloud providers');
        return false;
      } else {
        // Validate API key format - show only the relevant validation error
        const apiKeyValidation = this.validationService.validateApiKey(
          this.providerForm.apiKey, 
          this.providerForm.provider
        );
        if (!apiKeyValidation.isValid) {
          this.showError(apiKeyValidation.errors[0]); // Show only the first, most relevant error
          return false;
        }
      }
    } else if (this.providerForm.type === 'local-network') {
      if (!this.providerForm.localHostType) {
        this.showError('Local host type is required');
        return false;
      }
      
      if (!this.providerForm.endpoint?.trim()) {
        this.showError('Network address is required for local providers');
        return false;
      } else {
        // Validate endpoint format - show only the relevant validation error
        const endpointValidation = this.validationService.validateEndpoint(this.providerForm.endpoint);
        if (!endpointValidation.isValid) {
          this.showError(endpointValidation.errors[0]); // Show only the first, most relevant error
          return false;
        }
      }
    }

    // Validate name format if provided (name is optional - will be auto-generated if empty)
    if (this.providerForm.name?.trim()) {
      const nameValidation = ValidationUtils.validateProviderName(this.providerForm.name);
      if (!nameValidation.valid) {
        // Show only the name validation error without unrelated Ollama warnings
        this.showError(nameValidation.error!);
        return false;
      }
    }

    return true;
  }

  /**
   * Add new provider
   */
  private async addNewProvider(): Promise<void> {
    await this.providerManager.addProvider(this.providerForm);
  }

  /**
   * Update existing provider
   */
  private async updateExistingProvider(editing: ProviderConfig): Promise<void> {
    const updates: Partial<ProviderConfig> = {
      name: this.providerForm.name,
      isActive: true
    };
    
    if (this.providerForm.type === 'cloud') {
      (updates as Partial<CloudProvider>).apiKey = this.providerForm.apiKey!;
    } else {
      (updates as Partial<LocalNetworkProvider>).endpoint = this.providerForm.endpoint!;
      (updates as Partial<LocalNetworkProvider>).localHostType = this.providerForm.localHostType!;
      if (this.providerForm.apiKey) {
        (updates as Partial<LocalNetworkProvider>).apiKey = this.providerForm.apiKey;
      }
    }
    
    await this.providerManager.updateProvider(editing.id, updates);
  }

  /**
   * Build provider object from form data
   */
  private buildProviderFromForm(): ProviderConfig {
    // Ensure name is set (auto-generate if empty)
    const name = this.providerForm.name?.trim() || 
                 this.generateProviderName(this.providerForm.provider, this.providerForm.type);
    
    const baseProvider = {
      id: this.editingProvider()?.id || `temp-${Date.now()}`, // Use existing ID or temporary ID for testing
      name,
      type: this.providerForm.type,
      provider: this.providerForm.provider,
      isActive: true,
      createdAt: this.editingProvider()?.createdAt || new Date(),
      updatedAt: new Date()
    };

    if (this.providerForm.type === 'cloud') {
      return {
        ...baseProvider,
        type: 'cloud',
        apiKey: this.providerForm.apiKey!
      } as CloudProvider;
    } else {
      return {
        ...baseProvider,
        type: 'local-network',
        endpoint: this.providerForm.endpoint!,
        localHostType: this.providerForm.localHostType!,
        apiKey: this.providerForm.apiKey || undefined
      } as LocalNetworkProvider;
    }
  }
}