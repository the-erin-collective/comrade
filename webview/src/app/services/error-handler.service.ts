/**
 * Error Handler Service
 * 
 * Centralized error handling service for provider and agent management.
 * Provides consistent error processing, logging, and user notification.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ErrorMessages } from '../utils/validation.utils';

export interface ErrorInfo {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  details?: string;
  timestamp: Date;
  context?: string;
  actions?: ErrorAction[];
  dismissed?: boolean;
}

export interface ErrorAction {
  label: string;
  action: () => void;
  primary?: boolean;
}

export interface ErrorStats {
  totalErrors: number;
  recentErrors: number;
  errorsByType: Record<string, number>;
  errorsByContext: Record<string, number>;
}

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService {
  private readonly MAX_ERRORS = 50;
  private readonly RECENT_ERROR_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  private errorsSubject = new BehaviorSubject<ErrorInfo[]>([]);
  private errorStatsSubject = new BehaviorSubject<ErrorStats>(this.getInitialStats());

  public readonly errors$: Observable<ErrorInfo[]> = this.errorsSubject.asObservable();
  public readonly errorStats$: Observable<ErrorStats> = this.errorStatsSubject.asObservable();

  constructor() {
    // Clean up old errors periodically
    setInterval(() => this.cleanupOldErrors(), 60000); // Every minute
  }

  /**
   * Handle a generic error
   */
  handleError(error: any, context?: string, title?: string): string {
    const errorInfo = this.processError(error, context, title);
    this.addError(errorInfo);
    return errorInfo.id;
  }

  /**
   * Handle provider-specific errors
   */
  handleProviderError(error: any, operation: string, providerName?: string): string {
    const context = `Provider ${operation}${providerName ? ` (${providerName})` : ''}`;
    const title = this.getProviderErrorTitle(operation, error);
    
    const errorInfo = this.processError(error, context, title);
    
    // Add provider-specific actions
    errorInfo.actions = this.getProviderErrorActions(operation, error);
    
    this.addError(errorInfo);
    return errorInfo.id;
  }

  /**
   * Handle agent-specific errors
   */
  handleAgentError(error: any, operation: string, agentName?: string): string {
    const context = `Agent ${operation}${agentName ? ` (${agentName})` : ''}`;
    const title = this.getAgentErrorTitle(operation, error);
    
    const errorInfo = this.processError(error, context, title);
    
    // Add agent-specific actions
    errorInfo.actions = this.getAgentErrorActions(operation, error);
    
    this.addError(errorInfo);
    return errorInfo.id;
  }

  /**
   * Handle validation errors
   */
  handleValidationError(
    errors: string[], 
    warnings?: string[], 
    context?: string
  ): string {
    const errorInfo: ErrorInfo = {
      id: this.generateErrorId(),
      type: 'error',
      title: 'Validation Failed',
      message: ErrorMessages.getValidationSummary(errors, warnings),
      details: this.formatValidationDetails(errors, warnings),
      timestamp: new Date(),
      context: context || 'Form Validation'
    };

    this.addError(errorInfo);
    return errorInfo.id;
  }

  /**
   * Handle network/connection errors
   */
  handleConnectionError(
    error: any, 
    endpoint?: string, 
    operation?: string
  ): string {
    const context = `Connection${operation ? ` (${operation})` : ''}`;
    const title = 'Connection Failed';
    
    const errorInfo = this.processError(error, context, title);
    
    if (endpoint) {
      errorInfo.details = `Endpoint: ${endpoint}\n${errorInfo.details || ''}`;
    }
    
    // Add connection-specific actions
    errorInfo.actions = this.getConnectionErrorActions(endpoint);
    
    this.addError(errorInfo);
    return errorInfo.id;
  }

  /**
   * Add a warning message
   */
  addWarning(message: string, context?: string, details?: string): string {
    const errorInfo: ErrorInfo = {
      id: this.generateErrorId(),
      type: 'warning',
      title: 'Warning',
      message,
      details,
      timestamp: new Date(),
      context
    };

    this.addError(errorInfo);
    return errorInfo.id;
  }

  /**
   * Add an info message
   */
  addInfo(message: string, context?: string, details?: string): string {
    const errorInfo: ErrorInfo = {
      id: this.generateErrorId(),
      type: 'info',
      title: 'Information',
      message,
      details,
      timestamp: new Date(),
      context
    };

    this.addError(errorInfo);
    return errorInfo.id;
  }

  /**
   * Dismiss an error
   */
  dismissError(errorId: string): void {
    const errors = this.errorsSubject.value;
    const errorIndex = errors.findIndex(e => e.id === errorId);
    
    if (errorIndex !== -1) {
      const updatedErrors = [...errors];
      updatedErrors[errorIndex] = { ...updatedErrors[errorIndex], dismissed: true };
      this.errorsSubject.next(updatedErrors);
      this.updateStats();
    }
  }

  /**
   * Clear all errors
   */
  clearAllErrors(): void {
    this.errorsSubject.next([]);
    this.errorStatsSubject.next(this.getInitialStats());
  }

  /**
   * Clear errors by context
   */
  clearErrorsByContext(context: string): void {
    const errors = this.errorsSubject.value;
    const filteredErrors = errors.filter(e => e.context !== context);
    this.errorsSubject.next(filteredErrors);
    this.updateStats();
  }

  /**
   * Get errors by type
   */
  getErrorsByType(type: 'error' | 'warning' | 'info'): ErrorInfo[] {
    return this.errorsSubject.value.filter(e => e.type === type && !e.dismissed);
  }

  /**
   * Get recent errors
   */
  getRecentErrors(): ErrorInfo[] {
    const threshold = new Date(Date.now() - this.RECENT_ERROR_THRESHOLD);
    return this.errorsSubject.value.filter(e => 
      e.timestamp > threshold && !e.dismissed
    );
  }

  /**
   * Check if there are any active errors
   */
  hasActiveErrors(): boolean {
    return this.errorsSubject.value.some(e => e.type === 'error' && !e.dismissed);
  }

  /**
   * Check if there are any active warnings
   */
  hasActiveWarnings(): boolean {
    return this.errorsSubject.value.some(e => e.type === 'warning' && !e.dismissed);
  }

  /**
   * Process raw error into ErrorInfo
   */
  private processError(error: any, context?: string, title?: string): ErrorInfo {
    let message: string;
    let details: string | undefined;

    if (typeof error === 'string') {
      message = ErrorMessages.getUserFriendlyMessage(error);
      details = error !== message ? error : undefined;
    } else if (error instanceof Error) {
      message = ErrorMessages.getUserFriendlyMessage(error.message);
      details = error.stack || error.message;
    } else if (error && typeof error === 'object') {
      message = ErrorMessages.getUserFriendlyMessage(
        error.message || error.error || 'An unknown error occurred'
      );
      details = JSON.stringify(error, null, 2);
    } else {
      message = 'An unknown error occurred';
      details = String(error);
    }

    return {
      id: this.generateErrorId(),
      type: 'error',
      title: title || 'Error',
      message,
      details,
      timestamp: new Date(),
      context
    };
  }

  /**
   * Add error to the list and update stats
   */
  private addError(errorInfo: ErrorInfo): void {
    const errors = this.errorsSubject.value;
    const updatedErrors = [errorInfo, ...errors].slice(0, this.MAX_ERRORS);
    
    this.errorsSubject.next(updatedErrors);
    this.updateStats();
    
    // Log to console for debugging
    console.error(`[${errorInfo.context || 'Unknown'}] ${errorInfo.title}: ${errorInfo.message}`, errorInfo.details);
  }

  /**
   * Update error statistics
   */
  private updateStats(): void {
    const errors = this.errorsSubject.value.filter(e => !e.dismissed);
    const recentThreshold = new Date(Date.now() - this.RECENT_ERROR_THRESHOLD);
    
    const stats: ErrorStats = {
      totalErrors: errors.length,
      recentErrors: errors.filter(e => e.timestamp > recentThreshold).length,
      errorsByType: {},
      errorsByContext: {}
    };

    // Count by type
    errors.forEach(error => {
      stats.errorsByType[error.type] = (stats.errorsByType[error.type] || 0) + 1;
      if (error.context) {
        stats.errorsByContext[error.context] = (stats.errorsByContext[error.context] || 0) + 1;
      }
    });

    this.errorStatsSubject.next(stats);
  }

  /**
   * Clean up old errors
   */
  private cleanupOldErrors(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
    const errors = this.errorsSubject.value;
    const filteredErrors = errors.filter(e => e.timestamp > cutoff);
    
    if (filteredErrors.length !== errors.length) {
      this.errorsSubject.next(filteredErrors);
      this.updateStats();
    }
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get initial stats object
   */
  private getInitialStats(): ErrorStats {
    return {
      totalErrors: 0,
      recentErrors: 0,
      errorsByType: {},
      errorsByContext: {}
    };
  }

  /**
   * Get provider error title based on operation
   */
  private getProviderErrorTitle(operation: string, error: any): string {
    switch (operation.toLowerCase()) {
      case 'add':
      case 'create':
        return 'Failed to Add Provider';
      case 'update':
      case 'edit':
        return 'Failed to Update Provider';
      case 'delete':
      case 'remove':
        return 'Failed to Delete Provider';
      case 'toggle':
        return 'Failed to Toggle Provider';
      case 'validate':
        return 'Provider Validation Failed';
      case 'test':
      case 'connection':
        return 'Connection Test Failed';
      default:
        return 'Provider Operation Failed';
    }
  }

  /**
   * Get agent error title based on operation
   */
  private getAgentErrorTitle(operation: string, error: any): string {
    switch (operation.toLowerCase()) {
      case 'add':
      case 'create':
        return 'Failed to Add Agent';
      case 'update':
      case 'edit':
        return 'Failed to Update Agent';
      case 'delete':
      case 'remove':
        return 'Failed to Delete Agent';
      case 'toggle':
        return 'Failed to Toggle Agent';
      case 'validate':
        return 'Agent Validation Failed';
      default:
        return 'Agent Operation Failed';
    }
  }

  /**
   * Get provider-specific error actions
   */
  private getProviderErrorActions(operation: string, error: any): ErrorAction[] {
    const actions: ErrorAction[] = [];

    // Common retry action
    if (['add', 'update', 'delete', 'toggle'].includes(operation.toLowerCase())) {
      actions.push({
        label: 'Retry',
        action: () => {
          // This would need to be implemented by the calling component
          console.log('Retry action triggered');
        }
      });
    }

    // Connection test action for connection errors
    if (operation.toLowerCase().includes('connection') || operation.toLowerCase().includes('test')) {
      actions.push({
        label: 'Test Again',
        action: () => {
          console.log('Test connection action triggered');
        },
        primary: true
      });
    }

    return actions;
  }

  /**
   * Get agent-specific error actions
   */
  private getAgentErrorActions(operation: string, error: any): ErrorAction[] {
    const actions: ErrorAction[] = [];

    // Common retry action
    if (['add', 'update', 'delete', 'toggle'].includes(operation.toLowerCase())) {
      actions.push({
        label: 'Retry',
        action: () => {
          console.log('Retry action triggered');
        }
      });
    }

    return actions;
  }

  /**
   * Get connection-specific error actions
   */
  private getConnectionErrorActions(endpoint?: string): ErrorAction[] {
    const actions: ErrorAction[] = [];

    if (endpoint) {
      actions.push({
        label: 'Test Connection',
        action: () => {
          console.log('Test connection action triggered for:', endpoint);
        },
        primary: true
      });
    }

    return actions;
  }

  /**
   * Format validation details
   */
  private formatValidationDetails(errors: string[], warnings?: string[]): string {
    let details = '';

    if (errors.length > 0) {
      details += 'Errors:\n';
      errors.forEach((error, index) => {
        details += `${index + 1}. ${error}\n`;
      });
    }

    if (warnings && warnings.length > 0) {
      if (details) details += '\n';
      details += 'Warnings:\n';
      warnings.forEach((warning, index) => {
        details += `${index + 1}. ${warning}\n`;
      });
    }

    return details;
  }
}