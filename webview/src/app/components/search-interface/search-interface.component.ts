import { Component, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

export interface SearchQuery {
  text?: string;
  roles?: ('user' | 'assistant' | 'system' | 'tool')[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  tools?: string[];
  models?: string[];
  messageLength?: {
    min?: number;
    max?: number;
  };
  tokenCount?: {
    min?: number;
    max?: number;
  };
  successfulToolsOnly?: boolean;
  failedToolsOnly?: boolean;
  caseSensitive?: boolean;
  useRegex?: boolean;
  searchToolParameters?: boolean;
  searchToolResults?: boolean;
  limit?: number;
  sortBy?: 'timestamp' | 'relevance' | 'length';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  id: string;
  conversationId: string;
  message: {
    role: string;
    content: string;
    timestamp: Date;
    toolCalls?: any[];
    toolResults?: any[];
  };
  matches: SearchMatch[];
  relevanceScore: number;
  context: {
    previousMessage?: any;
    nextMessage?: any;
  };
}

export interface SearchMatch {
  type: 'content' | 'tool_name' | 'tool_parameter' | 'tool_result';
  text: string;
  position: {
    start: number;
    end: number;
  };
  highlighted: string;
}

export interface SearchResults {
  results: SearchResult[];
  totalMatches: number;
  query: SearchQuery;
  executionTime: number;
  statistics: {
    conversationsSearched: number;
    messagesSearched: number;
    toolExecutionsSearched: number;
  };
}

@Component({
  selector: 'app-search-interface',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatCheckboxModule,
    MatChipsModule,
    MatCardModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTooltipModule,
    MatPaginatorModule,
    MatAutocompleteModule
  ],
  template: `
    <div class="search-interface">
      <div class="search-header">
        <h3>
          <mat-icon>search</mat-icon>
          Search Conversations
        </h3>
      </div>

      <!-- Search Form -->
      <mat-card class="search-form-card">
        <mat-card-content>
          <!-- Main Search Input -->
          <mat-form-field appearance="outline" class="search-input">
            <mat-label>Search text</mat-label>
            <input 
              matInput 
              [(ngModel)]="searchQuery.text"
              [matAutocomplete]="auto"
              (keyup.enter)="performSearch()"
              placeholder="Enter search terms...">
            <mat-autocomplete #auto="matAutocomplete">
              @for (suggestion of searchSuggestions(); track suggestion) {
                <mat-option [value]="suggestion">{{ suggestion }}</mat-option>
              }
            </mat-autocomplete>
            <button 
              matSuffix 
              mat-icon-button 
              (click)="performSearch()"
              [disabled]="isSearching()">
              <mat-icon>search</mat-icon>
            </button>
          </mat-form-field>

          <!-- Advanced Filters -->
          <mat-expansion-panel class="filters-panel">
            <mat-expansion-panel-header>
              <mat-panel-title>
                <mat-icon>tune</mat-icon>
                Advanced Filters
              </mat-panel-title>
              <mat-panel-description>
                {{ getActiveFiltersCount() }} filters active
              </mat-panel-description>
            </mat-expansion-panel-header>

            <div class="filters-content">
              <!-- Message Roles -->
              <mat-form-field appearance="outline">
                <mat-label>Message Types</mat-label>
                <mat-select [(value)]="searchQuery.roles" multiple>
                  <mat-option value="user">User Messages</mat-option>
                  <mat-option value="assistant">Assistant Messages</mat-option>
                  <mat-option value="system">System Messages</mat-option>
                  <mat-option value="tool">Tool Messages</mat-option>
                </mat-select>
              </mat-form-field>

              <!-- Date Range -->
              <div class="date-range-group">
                <mat-checkbox [(ngModel)]="useDateRange">Filter by Date Range</mat-checkbox>
                @if (useDateRange()) {
                  <div class="date-inputs">
                    <mat-form-field appearance="outline">
                      <mat-label>Start Date</mat-label>
                      <input matInput [matDatepicker]="startPicker" [(ngModel)]="startDate">
                      <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
                      <mat-datepicker #startPicker></mat-datepicker>
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>End Date</mat-label>
                      <input matInput [matDatepicker]="endPicker" [(ngModel)]="endDate">
                      <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
                      <mat-datepicker #endPicker></mat-datepicker>
                    </mat-form-field>
                  </div>
                }
              </div>

              <!-- Tools and Models -->
              <div class="filter-row">
                <mat-form-field appearance="outline">
                  <mat-label>Tools Used</mat-label>
                  <mat-select [(value)]="searchQuery.tools" multiple>
                    @for (tool of availableTools(); track tool) {
                      <mat-option [value]="tool">{{ tool }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Models Used</mat-label>
                  <mat-select [(value)]="searchQuery.models" multiple>
                    @for (model of availableModels(); track model) {
                      <mat-option [value]="model">{{ model }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </div>

              <!-- Message Length -->
              <div class="range-group">
                <span class="range-label">Message Length (characters)</span>
                <div class="range-inputs">
                  <mat-form-field appearance="outline">
                    <mat-label>Min</mat-label>
                    <input matInput type="number" [(ngModel)]="searchQuery.messageLength!.min">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Max</mat-label>
                    <input matInput type="number" [(ngModel)]="searchQuery.messageLength!.max">
                  </mat-form-field>
                </div>
              </div>

              <!-- Search Options -->
              <div class="search-options">
                <mat-checkbox [(ngModel)]="searchQuery.caseSensitive">Case Sensitive</mat-checkbox>
                <mat-checkbox [(ngModel)]="searchQuery.useRegex">Use Regular Expressions</mat-checkbox>
                <mat-checkbox [(ngModel)]="searchQuery.searchToolParameters">Search Tool Parameters</mat-checkbox>
                <mat-checkbox [(ngModel)]="searchQuery.searchToolResults">Search Tool Results</mat-checkbox>
                <mat-checkbox [(ngModel)]="searchQuery.successfulToolsOnly">Successful Tools Only</mat-checkbox>
              </div>

              <!-- Sort Options -->
              <div class="sort-options">
                <mat-form-field appearance="outline">
                  <mat-label>Sort By</mat-label>
                  <mat-select [(value)]="searchQuery.sortBy">
                    <mat-option value="relevance">Relevance</mat-option>
                    <mat-option value="timestamp">Date</mat-option>
                    <mat-option value="length">Message Length</mat-option>
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Sort Order</mat-label>
                  <mat-select [(value)]="searchQuery.sortOrder">
                    <mat-option value="desc">Descending</mat-option>
                    <mat-option value="asc">Ascending</mat-option>
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Results Limit</mat-label>
                  <mat-select [(value)]="searchQuery.limit">
                    <mat-option [value]="10">10 results</mat-option>
                    <mat-option [value]="25">25 results</mat-option>
                    <mat-option [value]="50">50 results</mat-option>
                    <mat-option [value]="100">100 results</mat-option>
                  </mat-select>
                </mat-form-field>
              </div>

              <!-- Action Buttons -->
              <div class="filter-actions">
                <button mat-button (click)="clearFilters()">
                  <mat-icon>clear</mat-icon>
                  Clear Filters
                </button>
                <button mat-raised-button color="primary" (click)="performSearch()" [disabled]="isSearching()">
                  <mat-icon>search</mat-icon>
                  Search
                </button>
              </div>
            </div>
          </mat-expansion-panel>
        </mat-card-content>
      </mat-card>

      <!-- Search Results -->
      @if (isSearching()) {
        <div class="search-loading">
          <mat-spinner diameter="32"></mat-spinner>
          <p>Searching conversations...</p>
        </div>
      } @else if (searchResults()) {
        <div class="search-results">
          <!-- Results Summary -->
          <mat-card class="results-summary">
            <mat-card-content>
              <div class="summary-stats">
                <div class="stat">
                  <span class="stat-value">{{ searchResults()!.totalMatches }}</span>
                  <span class="stat-label">matches found</span>
                </div>
                <div class="stat">
                  <span class="stat-value">{{ searchResults()!.statistics.conversationsSearched }}</span>
                  <span class="stat-label">conversations searched</span>
                </div>
                <div class="stat">
                  <span class="stat-value">{{ searchResults()!.executionTime }}ms</span>
                  <span class="stat-label">search time</span>
                </div>
              </div>
              
              @if (searchResults()!.totalMatches > 0) {
                <div class="results-actions">
                  <button mat-button (click)="exportResults()">
                    <mat-icon>download</mat-icon>
                    Export Results
                  </button>
                </div>
              }
            </mat-card-content>
          </mat-card>

          <!-- Results List -->
          @if (searchResults()!.results.length > 0) {
            <div class="results-list">
              @for (result of searchResults()!.results; track result.id) {
                <mat-card class="result-card">
                  <mat-card-header>
                    <mat-card-title>
                      <mat-icon>{{ getRoleIcon(result.message.role) }}</mat-icon>
                      {{ result.message.role | titlecase }} Message
                      <mat-chip class="relevance-chip">{{ (result.relevanceScore * 100).toFixed(0) }}% match</mat-chip>
                    </mat-card-title>
                    <mat-card-subtitle>
                      {{ result.message.timestamp | date:'medium' }} • 
                      Conversation: {{ result.conversationId }}
                    </mat-card-subtitle>
                  </mat-card-header>
                  
                  <mat-card-content>
                    <div class="message-content">
                      <div [innerHTML]="getHighlightedContent(result)"></div>
                    </div>
                    
                    @if (result.matches.length > 1) {
                      <div class="matches-summary">
                        <span class="matches-count">{{ result.matches.length }} matches:</span>
                        @for (match of result.matches; track match.text) {
                          <mat-chip class="match-chip" [class]="'match-' + match.type">
                            {{ match.type.replace('_', ' ') }}
                          </mat-chip>
                        }
                      </div>
                    }
                    
                    @if (result.context.previousMessage || result.context.nextMessage) {
                      <mat-expansion-panel class="context-panel">
                        <mat-expansion-panel-header>
                          <mat-panel-title>Show Context</mat-panel-title>
                        </mat-expansion-panel-header>
                        
                        <div class="context-content">
                          @if (result.context.previousMessage) {
                            <div class="context-message previous">
                              <div class="context-label">Previous:</div>
                              <div class="context-text">{{ result.context.previousMessage.content | slice:0:200 }}...</div>
                            </div>
                          }
                          
                          @if (result.context.nextMessage) {
                            <div class="context-message next">
                              <div class="context-label">Next:</div>
                              <div class="context-text">{{ result.context.nextMessage.content | slice:0:200 }}...</div>
                            </div>
                          }
                        </div>
                      </mat-expansion-panel>
                    }
                  </mat-card-content>
                  
                  <mat-card-actions>
                    <button mat-button (click)="openConversation(result.conversationId)">
                      <mat-icon>open_in_new</mat-icon>
                      Open Conversation
                    </button>
                    <button mat-button (click)="copyResult(result)">
                      <mat-icon>content_copy</mat-icon>
                      Copy
                    </button>
                  </mat-card-actions>
                </mat-card>
              }
            </div>
          } @else {
            <mat-card class="no-results">
              <mat-card-content>
                <mat-icon>search_off</mat-icon>
                <h3>No Results Found</h3>
                <p>Try adjusting your search terms or filters.</p>
              </mat-card-content>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .search-interface {
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .search-header {
      padding: 16px;
      border-bottom: 1px solid #e0e0e0;
    }

    .search-header h3 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .search-form-card {
      margin: 16px;
      flex-shrink: 0;
    }

    .search-input {
      width: 100%;
      margin-bottom: 16px;
    }

    .filters-panel {
      width: 100%;
    }

    .filters-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px 0;
    }

    .date-range-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .date-inputs {
      display: flex;
      gap: 16px;
    }

    .date-inputs mat-form-field {
      flex: 1;
    }

    .filter-row {
      display: flex;
      gap: 16px;
    }

    .filter-row mat-form-field {
      flex: 1;
    }

    .range-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .range-label {
      font-size: 0.9em;
      color: #666;
    }

    .range-inputs {
      display: flex;
      gap: 16px;
    }

    .range-inputs mat-form-field {
      flex: 1;
    }

    .search-options {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }

    .sort-options {
      display: flex;
      gap: 16px;
    }

    .sort-options mat-form-field {
      flex: 1;
    }

    .filter-actions {
      display: flex;
      justify-content: flex-end;
      gap: 16px;
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .search-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      gap: 16px;
    }

    .search-results {
      flex: 1;
      overflow-y: auto;
      padding: 0 16px 16px;
    }

    .results-summary {
      margin-bottom: 16px;
    }

    .summary-stats {
      display: flex;
      gap: 32px;
      margin-bottom: 16px;
    }

    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .stat-value {
      font-size: 1.5em;
      font-weight: 500;
      color: #333;
    }

    .stat-label {
      font-size: 0.9em;
      color: #666;
    }

    .results-actions {
      display: flex;
      justify-content: flex-end;
    }

    .results-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .result-card {
      border-left: 4px solid #2196f3;
    }

    .relevance-chip {
      margin-left: auto;
      background-color: #4caf50;
      color: white;
      font-size: 0.8em;
    }

    .message-content {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-family: monospace;
      white-space: pre-wrap;
      line-height: 1.4;
    }

    .message-content ::ng-deep mark {
      background-color: #ffeb3b;
      padding: 2px 4px;
      border-radius: 2px;
    }

    .matches-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .matches-count {
      font-size: 0.9em;
      color: #666;
    }

    .match-chip {
      font-size: 0.8em;
      height: 24px;
    }

    .match-chip.match-content {
      background-color: #2196f3;
      color: white;
    }

    .match-chip.match-tool_name {
      background-color: #ff9800;
      color: white;
    }

    .match-chip.match-tool_parameter {
      background-color: #9c27b0;
      color: white;
    }

    .match-chip.match-tool_result {
      background-color: #4caf50;
      color: white;
    }

    .context-panel {
      margin-top: 16px;
    }

    .context-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 0;
    }

    .context-message {
      padding: 12px;
      border-radius: 8px;
      background: #f5f5f5;
    }

    .context-message.previous {
      border-left: 3px solid #2196f3;
    }

    .context-message.next {
      border-left: 3px solid #4caf50;
    }

    .context-label {
      font-size: 0.9em;
      font-weight: 500;
      color: #666;
      margin-bottom: 4px;
    }

    .context-text {
      font-size: 0.9em;
      color: #333;
      line-height: 1.4;
    }

    .no-results {
      text-align: center;
      padding: 48px;
    }

    .no-results mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #ccc;
      margin-bottom: 16px;
    }

    .no-results h3 {
      margin: 0 0 8px 0;
      color: #666;
    }

    .no-results p {
      margin: 0;
      color: #999;
    }
  `]
})
export class SearchInterfaceComponent implements OnInit, OnDestroy {
  searchQuery: SearchQuery = {
    text: '',
    roles: [],
    tools: [],
    models: [],
    messageLength: { min: undefined, max: undefined },
    tokenCount: { min: undefined, max: undefined },
    caseSensitive: false,
    useRegex: false,
    searchToolParameters: true,
    searchToolResults: true,
    limit: 25,
    sortBy: 'relevance',
    sortOrder: 'desc'
  };

  searchResults = signal<SearchResults | null>(null);
  searchSuggestions = signal<string[]>([]);
  availableTools = signal<string[]>([]);
  availableModels = signal<string[]>([]);
  isSearching = signal(false);

  useDateRange = signal(false);
  startDate: Date | null = null;
  endDate: Date | null = null;

  ngOnInit(): void {
    this.loadAvailableOptions();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  async performSearch(): Promise<void> {
    if (!this.searchQuery.text?.trim() && this.getActiveFiltersCount() === 0) {
      return;
    }

    this.isSearching.set(true);
    try {
      // Prepare search query
      const query = { ...this.searchQuery };
      
      if (this.useDateRange() && this.startDate && this.endDate) {
        query.dateRange = {
          start: this.startDate,
          end: this.endDate
        };
      }

      const results = await this.requestSearch(query);
      this.searchResults.set(results);
      
      // Update search suggestions
      if (query.text) {
        this.updateSearchSuggestions(query.text);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      this.isSearching.set(false);
    }
  }

  clearFilters(): void {
    this.searchQuery = {
      text: this.searchQuery.text, // Keep search text
      roles: [],
      tools: [],
      models: [],
      messageLength: {},
      tokenCount: {},
      caseSensitive: false,
      useRegex: false,
      searchToolParameters: true,
      searchToolResults: true,
      limit: 25,
      sortBy: 'relevance',
      sortOrder: 'desc'
    };
    
    this.useDateRange.set(false);
    this.startDate = null;
    this.endDate = null;
  }

  getActiveFiltersCount(): number {
    let count = 0;
    
    if (this.searchQuery.roles?.length) count++;
    if (this.searchQuery.tools?.length) count++;
    if (this.searchQuery.models?.length) count++;
    if (this.searchQuery.messageLength?.min || this.searchQuery.messageLength?.max) count++;
    if (this.searchQuery.tokenCount?.min || this.searchQuery.tokenCount?.max) count++;
    if (this.useDateRange() && this.startDate && this.endDate) count++;
    if (this.searchQuery.caseSensitive) count++;
    if (this.searchQuery.useRegex) count++;
    if (!this.searchQuery.searchToolParameters) count++;
    if (!this.searchQuery.searchToolResults) count++;
    if (this.searchQuery.successfulToolsOnly) count++;
    if (this.searchQuery.failedToolsOnly) count++;
    
    return count;
  }

  getRoleIcon(role: string): string {
    const icons: Record<string, string> = {
      user: 'person',
      assistant: 'smart_toy',
      system: 'settings',
      tool: 'build'
    };
    return icons[role] || 'message';
  }

  getHighlightedContent(result: SearchResult): string {
    let content = result.message.content;
    
    // Apply highlighting from matches
    for (const match of result.matches) {
      if (match.type === 'content') {
        content = match.highlighted;
        break;
      }
    }
    
    return content;
  }

  openConversation(conversationId: string): void {
    const vscode = (window as any).acquireVsCodeApi();
    vscode.postMessage({
      type: 'openConversation',
      conversationId
    });
  }

  async copyResult(result: SearchResult): Promise<void> {
    try {
      await navigator.clipboard.writeText(result.message.content);
    } catch (error) {
      console.error('Failed to copy result:', error);
    }
  }

  async exportResults(): Promise<void> {
    if (!this.searchResults()) return;

    try {
      const vscode = (window as any).acquireVsCodeApi();
      vscode.postMessage({
        type: 'exportSearchResults',
        results: this.searchResults()
      });
    } catch (error) {
      console.error('Failed to export search results:', error);
    }
  }

  private async loadAvailableOptions(): Promise<void> {
    try {
      const options = await this.requestAvailableOptions();
      this.availableTools.set(options.tools);
      this.availableModels.set(options.models);
    } catch (error) {
      console.error('Failed to load available options:', error);
    }
  }

  private async updateSearchSuggestions(query: string): Promise<void> {
    try {
      const suggestions = await this.requestSearchSuggestions(query);
      this.searchSuggestions.set(suggestions);
    } catch (error) {
      console.error('Failed to get search suggestions:', error);
    }
  }

  private async requestSearch(query: SearchQuery): Promise<SearchResults> {
    return new Promise((resolve, reject) => {
      const vscode = (window as any).acquireVsCodeApi();
      const messageId = Date.now().toString();

      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'searchResponse' && message.messageId === messageId) {
          window.removeEventListener('message', handleMessage);
          if (message.success) {
            resolve(message.results);
          } else {
            reject(new Error(message.error));
          }
        }
      };

      window.addEventListener('message', handleMessage);

      vscode.postMessage({
        type: 'searchConversations',
        messageId,
        query
      });

      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        reject(new Error('Search request timed out'));
      }, 30000);
    });
  }

  private async requestAvailableOptions(): Promise<{ tools: string[]; models: string[] }> {
    return new Promise((resolve, reject) => {
      const vscode = (window as any).acquireVsCodeApi();
      const messageId = Date.now().toString();

      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'availableOptionsResponse' && message.messageId === messageId) {
          window.removeEventListener('message', handleMessage);
          if (message.success) {
            resolve(message.options);
          } else {
            reject(new Error(message.error));
          }
        }
      };

      window.addEventListener('message', handleMessage);

      vscode.postMessage({
        type: 'getAvailableOptions',
        messageId
      });

      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        reject(new Error('Available options request timed out'));
      }, 10000);
    });
  }

  private async requestSearchSuggestions(query: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const vscode = (window as any).acquireVsCodeApi();
      const messageId = Date.now().toString();

      const handleMessage = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'searchSuggestionsResponse' && message.messageId === messageId) {
          window.removeEventListener('message', handleMessage);
          if (message.success) {
            resolve(message.suggestions);
          } else {
            reject(new Error(message.error));
          }
        }
      };

      window.addEventListener('message', handleMessage);

      vscode.postMessage({
        type: 'getSearchSuggestions',
        messageId,
        query
      });

      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        reject(new Error('Search suggestions request timed out'));
      }, 5000);
    });
  }
}