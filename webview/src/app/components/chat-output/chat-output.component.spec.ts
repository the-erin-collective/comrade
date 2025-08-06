import { TestBed } from '@angular/core/testing';
import { ChatOutputComponent } from './chat-output.component';
import { ConversationSession, ChatMessage } from '../../models/session.model';

describe('ChatOutputComponent', () => {
  let fixture: any;
  let component: ChatOutputComponent;

  const mockSession: ConversationSession = {
    id: 'session1',
    messages: [
      { id: '1', sender: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      { id: '2', sender: 'agent', content: 'Hi there!', timestamp: new Date().toISOString(), agentId: 'gpt' }
    ],
    type: 'conversation',
    currentPhase: 'context',
    agentConfig: {
      id: '',
      name: '',
      provider: '',
      model: '',
      capabilities: {
        hasVision: false,
        hasToolUse: false,
        reasoningDepth: 'basic',
        speed: 'fast',
        costTier: 'low'
      }
    },
    title: '',
    isActive: false,
    lastActivity: new Date(),
    metadata: {}
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatOutputComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ChatOutputComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render messages when session is provided', () => {
    component.session = mockSession;
    fixture.detectChanges();
    const messages = fixture.nativeElement.querySelectorAll('.chat-message');
    expect(messages.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Hello');
    expect(fixture.nativeElement.textContent).toContain('Hi there!');
  });

  it('should show welcome message if no session or messages', () => {
    fixture.setInput('session', {
      id: 'empty',
      title: 'Empty Session',
      type: 'conversation',
      isActive: false,
      lastActivity: new Date(),
      metadata: {},
      messages: [],
      currentPhase: 'context',
      agentConfig: {
        id: 'agent1',
        name: 'Default Agent',
        provider: 'local',
        model: 'gpt-4',
        capabilities: {
          hasVision: false,
          hasToolUse: false,
          reasoningDepth: 'basic',
          speed: 'fast',
          costTier: 'low',
        }
      }
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Welcome to your new session!');
  });

  it('should render loading message when isLoading is true', () => {
    component.isLoading = true;
    component.loadingMessage = 'Loading...';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading...');
  });

  it('should format time correctly', () => {
    const now = new Date();
    const formatted = component.formatTime(now.toISOString());
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });

  it('should escape HTML if markdown parsing fails', () => {
    const result = component.renderMarkdown('<script>alert(1)</script>');
    expect(result).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  // Add more tests for markdown rendering, scroll behavior, etc.
});
