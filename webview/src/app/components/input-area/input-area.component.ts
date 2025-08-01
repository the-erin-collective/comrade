import { Component, EventEmitter, signal, ViewChild, ElementRef, AfterViewInit, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContextItem, PhaseAlert } from '../../models/session.model';

@Component({
  selector: 'app-input-area',
  styleUrls: ['./input-area.component.css'],
  standalone: true,
  template: `
    <div class="input-area">
      @if (phaseAlert()) {
        <div class="phase-alert" [class]="phaseAlert()?.type">
          <span class="alert-message">{{ phaseAlert()?.message }}</span>
          @if (phaseAlert()?.actionButton) {
            <button class="alert-action-btn" (click)="phaseAlert()!.actionButton!.action()">
              {{ phaseAlert()!.actionButton!.text }}
            </button>
          }
          @if (phaseAlert()?.dismissible) {
            <button class="alert-dismiss-btn" (click)="phaseAlert()!.actionButton!.action()">
              &times;
            </button>
          }
        </div>
      }

      <div class="context-items-container" [@slideIn] *ngIf="contextItems().length > 0">
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

      <div class="input-container">
        <div class="toolbar-section left-toolbar">
          <button class="toolbar-button" (click)="toggleContextMenu()" title="Add Context">
            <span class="icon">📎</span>
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
        </div>

        <textarea
          #messageInput
          class="input-text"
          [style.height.px]="textareaHeight()"
          placeholder="Type your message..."
          [(ngModel)]="currentMessage"
          (input)="onInputChange($event)"
          (keydown)="onInputKeyDown($event)"
          [disabled]="isLoading()"
        ></textarea>

        <div class="toolbar-section right-toolbar">
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
          }
          <button
            class="toolbar-button send-button"
            (click)="sendMessage()"
            [disabled]="!currentMessage() || isLoading()"
            title="Send Message"
          >
            <span class="icon">🚀</span>
          </button>
          <button
            class="toolbar-button settings-button"
            (click)="showComradeMenu()"
            title="Comrade Menu"
          >
            <span class="icon">⚙️</span>
          </button>
        </div>
      </div>
    </div>
  `,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  public textareaHeight = signal(60);

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
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 60), 200);
      this.textareaHeight.set(newHeight);
    }
  }

  public sendMessage() {
    const message = this.currentMessage().trim();
    if (message && !this.isLoading()) {
      this.messageSubmit.emit({
        message,
        contextItems: this.contextItems()
      });
      this.currentMessage.set('');
      this.contextItems.set([]);
      this.textareaHeight.set(60);

      // Reset textarea height
      if (this.messageInput) {
        this.messageInput.nativeElement.style.height = '60px';
      }
    }
  }

  public toggleContextMenu() {
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
}