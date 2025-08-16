import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { MigrationService } from './migration.service';
import { ProviderManagerService } from './provider-manager.service';
import { AgentManagerService } from './agent-manager.service';
import { MessageService } from './message.service';
import { 
  MigrationData, 
  Provider, 
  Agent,
  ValidationResult 
} from '../interfaces/provider-agent.interface';
import { 
  AgentConfig, 
  ExtendedAgentConfig 
} from '../interfaces/model-config.interface';

/**
 * Migration execution status
 */
export interface MigrationStatus {
  isRunning: boolean;
  isComplete: boolean;
  hasErrors: boolean;
  currentStep: string;
  progress: number; // 0-100
  results?: MigrationData;
  report?: string;
}

/**
 * Migration Executor Service
 * 
 * Handles the execution of data migration from the current agent system to the new provider-agent architecture.
 * Provides progress tracking, error handling, and user feedback during the migration process.
 * Executes migration on first load of the new system and validates migrated data.
 */
@Injectable({
  providedIn: 'root'
})
export class MigrationExecutorService {
  
  private migrationStatusSubject = new BehaviorSubject<MigrationStatus>({
    isRunning: false,
    isComplete: false,
    hasErrors: false,
    currentStep: 'Not started',
    progress: 0
  });

  public readonly migrationStatus$: Observable<MigrationStatus> = this.migrationStatusSubject.asObservable();

  constructor(
    private migrationService: MigrationService,
    private providerManager: ProviderManagerService,
    private agentManager: AgentManagerService,
    private messageService: MessageService,
    private store: Store
  ) {
    this.setupMessageHandlers();
  }

  /**
   * Setup message handlers for VS Code extension communication
   */
  private setupMessageHandlers(): void {
    this.messageService.messages$.subscribe(message => {
      switch (message.type) {
        case 'migrationResult':
          this.handleMigrationResult(message.payload);
          break;
        
        case 'legacyConfigData':
          if (message.payload?.legacyAgents) {
            this.executeMigrationWithData(message.payload.legacyAgents);
          }
          break;
      }
    });
  }

  /**
   * Handle migration result from VS Code extension
   */
  private handleMigrationResult(payload: any): void {
    if (payload?.success) {
      this.updateStatus({
        isRunning: false,
        isComplete: true,
        hasErrors: false,
        currentStep: 'Migration completed successfully',
        progress: 100,
        results: payload.migrationData,
        report: payload.report
      });
    } else {
      this.updateStatus({
        isRunning: false,
        isComplete: true,
        hasErrors: true,
        currentStep: `Migration failed: ${payload?.error || 'Unknown error'}`,
        progress: 100
      });
    }
  }

  /**
   * Check if migration is needed and execute if required
   * This is called on first load of the new system
   */
  public async checkAndExecuteMigration(): Promise<boolean> {
    try {
      this.updateStatus({
        isRunning: true,
        isComplete: false,
        hasErrors: false,
        currentStep: 'Checking for existing configuration...',
        progress: 10
      });

      // Check if new system already has data
      const existingProviders = await firstValueFrom(this.providerManager.providers$);
      const existingAgents = await firstValueFrom(this.agentManager.agents$);

      if (existingProviders.length > 0 || existingAgents.length > 0) {
        this.updateStatus({
          isRunning: false,
          isComplete: true,
          hasErrors: false,
          currentStep: 'Migration not needed - new system already has data',
          progress: 100
        });
        return false;
      }

      this.updateStatus({
        currentStep: 'Requesting legacy configuration data...',
        progress: 20
      });

      // Request legacy configuration data from VS Code extension
      this.messageService.sendMessage({
        type: 'getLegacyConfig',
        payload: {}
      });

      return true;
    } catch (error) {
      const errorMessage = `Migration check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.updateStatus({
        isRunning: false,
        isComplete: true,
        hasErrors: true,
        currentStep: errorMessage,
        progress: 100
      });
      console.error(errorMessage, error);
      return false;
    }
  }

  /**
   * Execute migration with provided legacy data
   */
  private async executeMigrationWithData(legacyAgents: AgentConfig[] | ExtendedAgentConfig[]): Promise<void> {
    try {
      if (!legacyAgents || legacyAgents.length === 0) {
        this.updateStatus({
          isRunning: false,
          isComplete: true,
          hasErrors: false,
          currentStep: 'No legacy agents found - migration not needed',
          progress: 100
        });
        return;
      }

      this.updateStatus({
        currentStep: 'Analyzing legacy agent configurations...',
        progress: 30
      });

      // Execute migration
      const migrationData = this.migrationService.migrateAgentConfigurations(legacyAgents);

      this.updateStatus({
        currentStep: 'Validating migration results...',
        progress: 50
      });

      // Validate migration results
      const validation = this.migrationService.validateMigrationResults(migrationData);
      if (!validation.valid) {
        throw new Error(`Migration validation failed: ${validation.error}`);
      }

      this.updateStatus({
        currentStep: 'Saving providers to configuration...',
        progress: 70
      });

      // Save providers and agents through the VS Code extension
      await this.saveMigrationResults(migrationData);

      this.updateStatus({
        currentStep: 'Generating migration report...',
        progress: 90
      });

      // Generate report
      const report = this.migrationService.generateMigrationReport(migrationData);

      this.updateStatus({
        isRunning: false,
        isComplete: true,
        hasErrors: false,
        currentStep: 'Migration completed successfully',
        progress: 100,
        results: migrationData,
        report: report
      });

      console.log('Migration completed successfully:', report);

    } catch (error) {
      const errorMessage = `Migration execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.updateStatus({
        isRunning: false,
        isComplete: true,
        hasErrors: true,
        currentStep: errorMessage,
        progress: 100
      });
      console.error(errorMessage, error);
    }
  }

  /**
   * Save migration results through VS Code extension
   */
  private async saveMigrationResults(migrationData: MigrationData): Promise<void> {
    // Send migration data to VS Code extension for persistence
    this.messageService.sendMessage({
      type: 'saveMigrationResults',
      payload: {
        providers: migrationData.providersCreated,
        agents: migrationData.agentsUpdated
      }
    });

    // Also update the local state
    if (migrationData.providersCreated.length > 0) {
      // Load providers into state
      this.providerManager.loadProviders();
    }

    if (migrationData.agentsUpdated.length > 0) {
      // Load agents into state
      this.agentManager.loadAgents();
    }
  }

  /**
   * Force execute migration (for manual migration)
   */
  public async forceMigration(): Promise<void> {
    this.updateStatus({
      isRunning: true,
      isComplete: false,
      hasErrors: false,
      currentStep: 'Starting forced migration...',
      progress: 0
    });

    // Request legacy configuration data
    this.messageService.sendMessage({
      type: 'getLegacyConfig',
      payload: { force: true }
    });
  }

  /**
   * Reset migration status
   */
  public resetMigrationStatus(): void {
    this.updateStatus({
      isRunning: false,
      isComplete: false,
      hasErrors: false,
      currentStep: 'Not started',
      progress: 0
    });
  }

  /**
   * Get current migration status
   */
  public getCurrentStatus(): MigrationStatus {
    return this.migrationStatusSubject.value;
  }

  /**
   * Check if migration is needed based on current system state
   */
  public async isMigrationNeeded(): Promise<boolean> {
    try {
      const existingProviders = await firstValueFrom(this.providerManager.providers$);
      const existingAgents = await firstValueFrom(this.agentManager.agents$);
      
      // Migration is needed if new system has no data
      return existingProviders.length === 0 && existingAgents.length === 0;
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Validate current system configuration
   */
  public async validateCurrentConfiguration(): Promise<ValidationResult> {
    try {
      const providers = await firstValueFrom(this.providerManager.providers$);
      const agents = await firstValueFrom(this.agentManager.agents$);
      
      const errors: string[] = [];
      const warnings: string[] = [];

      // Validate providers
      for (const provider of providers) {
        if (!provider.id || !provider.name) {
          errors.push(`Provider missing required fields: ${provider.name || 'unnamed'}`);
        }
      }

      // Validate agents
      for (const agent of agents) {
        if (!agent.id || !agent.name || !agent.providerId) {
          errors.push(`Agent missing required fields: ${agent.name || 'unnamed'}`);
        }
        
        // Check if agent's provider exists
        const providerExists = providers.some(p => p.id === agent.providerId);
        if (!providerExists) {
          errors.push(`Agent ${agent.name} references non-existent provider: ${agent.providerId}`);
        }
      }

      // Check for orphaned agents (agents with inactive providers)
      const inactiveProviderIds = providers.filter(p => !p.isActive).map(p => p.id);
      const orphanedAgents = agents.filter(a => inactiveProviderIds.includes(a.providerId) && a.isActive);
      
      if (orphanedAgents.length > 0) {
        warnings.push(`${orphanedAgents.length} active agents are using inactive providers`);
      }

      return {
        valid: errors.length === 0,
        error: errors.length > 0 ? errors.join('; ') : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      return {
        valid: false,
        error: `Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get migration statistics
   */
  public getMigrationStatistics(): Observable<MigrationStatistics> {
    return new Observable(observer => {
      const status = this.getCurrentStatus();
      
      const stats: MigrationStatistics = {
        isComplete: status.isComplete,
        hasErrors: status.hasErrors,
        providersCreated: status.results?.providersCreated.length || 0,
        agentsUpdated: status.results?.agentsUpdated.length || 0,
        errorsCount: status.results?.errors.length || 0,
        warningsCount: status.results?.warnings.length || 0,
        migrationDate: status.isComplete ? new Date() : undefined
      };
      
      observer.next(stats);
      observer.complete();
    });
  }

  /**
   * Update migration status
   */
  private updateStatus(updates: Partial<MigrationStatus>): void {
    const currentStatus = this.migrationStatusSubject.value;
    const newStatus = { ...currentStatus, ...updates };
    this.migrationStatusSubject.next(newStatus);
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.migrationStatusSubject.complete();
  }
}

/**
 * Migration statistics interface
 */
export interface MigrationStatistics {
  isComplete: boolean;
  hasErrors: boolean;
  providersCreated: number;
  agentsUpdated: number;
  errorsCount: number;
  warningsCount: number;
  migrationDate?: Date;
}