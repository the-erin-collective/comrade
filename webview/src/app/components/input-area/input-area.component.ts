import { Component, EventEmitter, signal, ViewChild, ElementRef, AfterViewInit, ChangeDetectionStrategy, input, output, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContextItem, PhaseAlert } from '../../models/session.model';

@Component({
  selector: 'app-input-area',
  styleUrls: ['./input-area.component.css'],
  standalone: true,
  template: `
    <div class="input-area">
      <!-- Information Area -->
      <div class="info-area">
        @if (availableAgents().length === 0) {
          <div class="info-message warning">
            <span class="info-icon">⚠️</span>
            <span class="info-text">No active agents available for messaging.</span>
            <button class="info-link" (click)="openAgentSettings()" onclick="console.log('Raw onclick works!')">Configure agents</button>
          </div>
        } @else if (phaseAlert()) {
          <div class="info-message" [class]="phaseAlert()?.type">
            <span class="info-icon">ℹ️</span>
            <span class="info-text">{{ phaseAlert()?.message }}</span>
            @if (phaseAlert()?.actionButton) {
              <button class="info-link" (click)="phaseAlert()!.actionButton!.action()">
                {{ phaseAlert()!.actionButton!.text }}
              </button>
            }
          </div>
        } @else {
          <div class="info-message">
            <span class="info-text">{{ getStatusMessage() }}</span>
          </div>
        }
      </div>

      <!-- Context Items -->
      @if (contextItems().length > 0) {
        <div class="context-items-container">
          @for (item of contextItems(); track $index) {
            <div class="context-item">
              <span class="context-icon">{{ getContextIcon(item.type) }}</span>
              <span class="context-label">{{ getContextLabel(item) }}</span>
              <button class="remove-context-btn" (click)="removeContextItem($index)">
                &times;
              </button>
            </div>
          }
        </div>
      }

      <!-- Input Container -->
      <div class="input-container">
        <!-- Text Input -->
        <div class="input-wrapper">
          <textarea
            #messageInput
            class="input-text"
            [style.height.px]="textareaHeight()"
            placeholder="Ask a question or describe a task..."
            [(ngModel)]="currentMessage"
            (input)="onInputChange($event)"
            (keydown)="onInputKeyDown($event)"
            [disabled]="isLoading() || availableAgents().length === 0"
          ></textarea>
          <button
            class="send-button"
            (click)="sendMessage()"
            [disabled]="!currentMessage() || isLoading() || availableAgents().length === 0"
            title="Send Message"
          >
            <span class="icon">↑</span>
          </button>
        </div>

        <!-- Toolbar -->
        <div class="toolbar">
          <div class="toolbar-left">
            <button class="toolbar-button" (click)="toggleContextMenu()" title="Add Context">
              <span class="icon">#</span>
            </button>
            @if (showContextMenu()) {
              <div class="context-menu">
                <button class="context-menu-item" (click)="addContext('file')">
                  <span class="icon">📄</span> Add File
                </button>
                <button class="context-menu-item" (click)="addContext('selection')">
                  <span class="icon">📝</span> Add Selection
                </button>
                <button class="context-menu-item" (click)="addContext('image')">
                  <span class="icon">🖼️</span> Add Image
                </button>
                <button class="context-menu-item" (click)="addContext('workspace')">
                  <span class="icon">📁</span> Add Workspace
                </button>
              </div>
            }

            <button class="toolbar-button" title="Attach Image">
              <span class="icon">📷</span>
            </button>
          </div>

          <div class="toolbar-center">
            @if (availableAgents().length > 0) {
              <select
                class="agent-select"
                [(ngModel)]="selectedAgent"
                (change)="onAgentChange($event)"
                [disabled]="isLoading()"
              >
                @for (agent of availableAgents(); track agent.id) {
                  <option [value]="agent.id">{{ agent.name }}</option>
                }
              </select>
            } @else {
              <span class="no-agent-text">No active agents available</span>
            }
          </div>

          <div class="toolbar-right">
            <label class="autopilot-toggle">
              <span class="toggle-label">Autopilot</span>
              <input type="checkbox" [(ngModel)]="autopilotEnabled" (change)="onAutopilotToggle($event)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>
  `,
  imports: [CommonModule, FormsModule],
})

export class InputAreaComponent implements AfterViewInit {
  phaseAlert = input<PhaseAlert | null>(null);
  isLoading = input<boolean>(false);
  availableAgents = input<any[]>([]);

  messageSubmit = output<{ message: string; contextItems: ContextItem[] }>();
  agentChange = output<string>();
  contextAdd = output<{ type: string; content?: string }>();
  settingsOpen = output<void>();

  @ViewChild('messageInput', { static: true }) messageInput!: ElementRef<HTMLTextAreaElement>;

  public currentMessage = signal('');
  public selectedAgent = signal('');
  public showContextMenu = signal(false);
  public showSettingsMenu = signal(false);
  public contextItems = signal<ContextItem[]>([]);
  public textareaHeight = signal(40);
  public autopilotEnabled = signal(false);

  constructor() {
    // Auto-select the first available agent when agents become available
    effect(() => {
      const agents = this.availableAgents();
      const currentSelection = this.selectedAgent();
      
      if (agents.length > 0 && !currentSelection) {
        // Auto-select the first agent if none is selected
        this.selectedAgent.set(agents[0].id);
        this.agentChange.emit(agents[0].id);
        console.log('Auto-selected first available agent:', agents[0].name);
      } else if (agents.length > 0 && currentSelection) {
        // Check if the currently selected agent is still available
        const stillAvailable = agents.find(agent => agent.id === currentSelection);
        if (!stillAvailable) {
          // Current agent is no longer available, select the first available one
          this.selectedAgent.set(agents[0].id);
          this.agentChange.emit(agents[0].id);
          console.log('Previously selected agent unavailable, auto-selected:', agents[0].name);
        }
      } else if (agents.length === 0) {
        // No agents available, clear selection
        this.selectedAgent.set('');
      }
    });
  }

  ngAfterViewInit() {
    this.setupClickOutsideHandler();
  }

  private setupClickOutsideHandler() {
    document.addEventListener('click', (event) => {
      if (!event.target || !(event.target as Element).closest('.toolbar-section')) {
        this.showContextMenu.set(false);
        this.showSettingsMenu.set(false);
      }
    });
  }

  public onInputChange(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    this.currentMessage.set(target.value);
    this.adjustTextareaHeight();
  }

  public onInputKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private adjustTextareaHeight() {
    if (this.messageInput) {
      const textarea = this.messageInput.nativeElement;
      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 40), 120);
      this.textareaHeight.set(newHeight);
    }
  }

  public sendMessage() {
    console.log('sendMessage called');
    const message = this.currentMessage().trim();
    if (message && !this.isLoading()) {
      console.log('Emitting message:', message);
      this.messageSubmit.emit({
        message,
        contextItems: this.contextItems()
      });
      this.currentMessage.set('');
      this.contextItems.set([]);
      this.textareaHeight.set(40);

      // Reset textarea height
      if (this.messageInput) {
        this.messageInput.nativeElement.style.height = '40px';
      }
    }
  }

  public toggleContextMenu() {
    console.log('toggleContextMenu called');
    this.showContextMenu.update(show => !show);
    this.showSettingsMenu.set(false);
  }

  public addContext(type: string) {
    this.contextAdd.emit({ type });
    this.showContextMenu.set(false);

    // Add a mock context item for demo
    const contextItems = this.contextItems();
    contextItems.push({
      type: type as any,
      content: `Mock ${type} content`,
      metadata: { timestamp: new Date().toISOString() }
    });
    this.contextItems.set([...contextItems]);
  }

  public removeContextItem(index: number) {
    const items = this.contextItems();
    items.splice(index, 1);
    this.contextItems.set([...items]);
  }

  public onAgentChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const agentId = target.value;
    this.selectedAgent.set(agentId);
    this.agentChange.emit(agentId);
  }

  public showComradeMenu() {
    this.settingsOpen.emit();
  }

  public getContextIcon(type: string): string {
    const icons: Record<string, string> = {
      file: '📄',
      selection: '📝',
      image: '🖼️',
      workspace: '📁'
    };
    return icons[type] || '📎';
  }

  public getContextLabel(item: ContextItem): string {
    switch (item.type) {
      case 'file':
        return item.metadata?.['filename'] || 'File';
      case 'selection':
        return 'Selection';
      case 'image':
        return item.metadata?.['filename'] || 'Image';
      case 'workspace':
        return 'Workspace';
      default:
        return 'Context';
    }
  }

  public getStatusMessage(): string {
    if (this.isLoading()) {
      return 'Processing your request...';
    }
    if (this.availableAgents().length > 0) {
      const agent = this.availableAgents().find(a => a.id === this.selectedAgent());
      return agent ? `Ready with ${agent.name}` : 'Ready to assist';
    }
    return 'Configure and activate agents to get started';
  }

  public openAgentSettings(): void {
    console.log('openAgentSettings called');
    this.settingsOpen.emit();
  }

  public onAutopilotToggle(event: Event): void {
    console.log('onAutopilotToggle called');
    const target = event.target as HTMLInputElement;
    this.autopilotEnabled.set(target.checked);
    // Emit autopilot change event if needed
  }
}