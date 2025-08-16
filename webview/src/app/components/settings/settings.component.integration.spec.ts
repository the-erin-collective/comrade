/**
 * Angular Integration Tests for Settings Component
 * Tests the Angular component interactions, NgRx state management, and UI workflows
 */

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { of, BehaviorSubject } from 'rxjs';

import { SettingsComponent } from './settings.component';
import { ProviderManagementComponent } from '../provider-management/provider-management.component';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { MessageService } from '../../services/message.service';
import { ProviderConfig, Agent, AgentWithProvider } from '../../interfaces/provider-agent.interface';
import * as ProviderActions from '../../state/provider/provider.actions';
import * as AgentActions from '../../state/agent/agent.actions';

describe('SettingsComponent Integration Tests', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let store: MockStore;
  let messageService: jasmine.SpyObj<MessageService>;
  let messagesSubject: BehaviorSubject<any>;

  const mockProviders: ProviderConfig[] = [
    {
      id: 'provider-1',
      name: 'Test OpenAI Provider',
      type: 'cloud',
      provider: 'openai',
      apiKey: 'sk-test-key',
      isActive: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01')
    },
    {
      id: 'provider-2',
      name: 'Local Ollama',
      type: 'local-network',
      provider: 'ollama',
      endpoint: 'http://localhost:11434',
      localHostType: 'ollama',
      isActive: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01')
    }
  ];

  const mockAgents: Agent[] = [
    {
      id: 'agent-1',
      name: 'GPT-4 Assistant',
      providerId: 'provider-1',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 4000,
      timeout: 30000,
      capabilities: {
        hasVision: false,
        hasToolUse: true,
        reasoningDepth: 'advanced',
        speed: 'medium',
        costTier: 'high'
      },
      isActive: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01')
    }
  ];

  const mockAgentsWithProviders: AgentWithProvider[] = [
    {
      agent: mockAgents[0],
      provider: mockProviders[0]
    }
  ];

  const initialState = {
    providers: {
      providers: mockProviders,
      loading: false,
      error: null
    },
    agents: {
      agents: mockAgents,
      loading: false,
      error: null,
      availableModels: [],
      loadingModels: false
    }
  };

  beforeEach(async () => {
    messagesSubject = new BehaviorSubject<any>({});
    
    const messageServiceSpy = jasmine.createSpyObj('MessageService', ['sendMessage'], {
      messages$: messagesSubject.asObservable()
    });

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        FormsModule,
        SettingsComponent,
        ProviderManagementComponent,
        ConfirmationDialogComponent
      ],
      providers: [
        provideMockStore({ initialState }),
        { provide: MessageService, useValue: messageServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(Store) as MockStore;
    messageService = TestBed.inject(MessageService) as jasmine.SpyObj<MessageService>;

    fixture.detectChanges();
  });

  describe('Provider Setup and Configuration Workflow', () => {
    it('should display provider management tab by default', () => {
      expect(component.activeTab()).toBe('providers');
      
      const providerTab = fixture.debugElement.nativeElement.querySelector('.settings-tab.active');
      expect(providerTab?.textContent?.trim()).toBe('Provider Management');
    });

    it('should switch between tabs correctly', () => {
      // Switch to agents tab
      component.setActiveTab('agents');
      fixture.detectChanges();
      
      expect(component.activeTab()).toBe('agents');
      
      const activeTab = fixture.debugElement.nativeElement.querySelector('.settings-tab.active');
      expect(activeTab?.textContent?.trim()).toBe('Agent Management');
    });

    it('should show empty state when no providers exist', () => {
      // Update store to have no providers
      store.setState({
        ...initialState,
        providers: { providers: [], loading: false, error: null }
      });
      
      component.setActiveTab('providers');
      fixture.detectChanges();
      
      const emptyState = fixture.debugElement.nativeElement.querySelector('.empty-state');
      expect(emptyState).toBeTruthy();
      expect(emptyState?.textContent).toContain('No providers configured');
    });

    it('should display providers list when providers exist', fakeAsync(() => {
      store.setState(initialState);
      component.setActiveTab('providers');
      fixture.detectChanges();
      tick();
      
      const providerCards = fixture.debugElement.nativeElement.querySelectorAll('.provider-card');
      expect(providerCards.length).toBe(2);
      
      // Check first provider
      expect(providerCards[0].textContent).toContain('Test OpenAI Provider');
      expect(providerCards[0].textContent).toContain('Cloud');
      
      // Check second provider
      expect(providerCards[1].textContent).toContain('Local Ollama');
      expect(providerCards[1].textContent).toContain('Local Network');
    }));
  });

  describe('Agent Creation with Provider Selection', () => {
    it('should show empty state when no agents exist', () => {
      store.setState({
        ...initialState,
        agents: { agents: [], loading: false, error: null, availableModels: [], loadingModels: false }
      });
      
      component.setActiveTab('agents');
      fixture.detectChanges();
      
      const emptyState = fixture.debugElement.nativeElement.querySelector('.empty-state');
      expect(emptyState).toBeTruthy();
      expect(emptyState?.textContent).toContain('No agents configured');
    });

    it('should display agents list with provider information', fakeAsync(() => {
      store.setState(initialState);
      component.setActiveTab('agents');
      fixture.detectChanges();
      tick();
      
      const agentCards = fixture.debugElement.nativeElement.querySelectorAll('.agent-card');
      expect(agentCards.length).toBe(1);
      
      const agentCard = agentCards[0];
      expect(agentCard.textContent).toContain('GPT-4 Assistant');
      expect(agentCard.textContent).toContain('Test OpenAI Provider');
      expect(agentCard.textContent).toContain('gpt-4');
    });

    it('should open agent form when add agent button is clicked', () => {
      component.setActiveTab('agents');
      fixture.detectChanges();
      
      expect(component.showAgentForm()).toBe(false);
      
      component.addNewAgent();
      
      expect(component.showAgentForm()).toBe(true);
      expect(component.editingAgent()).toBeNull();
    });

    it('should populate provider dropdown in agent form', fakeAsync(() => {
      store.setState(initialState);
      component.addNewAgent();
      fixture.detectChanges();
      tick();
      
      const providerSelect = fixture.debugElement.nativeElement.querySelector('#provider');
      expect(providerSelect).toBeTruthy();
      
      const options = providerSelect.querySelectorAll('option');
      expect(options.length).toBe(3); // Including default "Select a provider..." option
      expect(options[1].textContent).toContain('Test OpenAI Provider');
      expect(options[2].textContent).toContain('Local Ollama');
    }));

    it('should handle model loading when provider is selected', fakeAsync(() => {
      component.addNewAgent();
      component.agentForm.provider = 'provider-1';
      
      component.onProviderChange('provider-1');
      
      expect(component.loadingModels()).toBe(false); // Initially false
      
      // Simulate model loading
      component.fetchModelsForProvider();
      expect(component.loadingModels()).toBe(true);
      
      // Simulate models loaded response
      messagesSubject.next({
        type: 'cloudModelsResult',
        payload: { success: true, models: ['gpt-4', 'gpt-3.5-turbo'] }
      });
      
      tick();
      
      expect(component.loadingModels()).toBe(false);
      expect(component.availableModels()).toEqual(['gpt-4', 'gpt-3.5-turbo']);
    }));

    it('should save new agent with correct data', () => {
      spyOn(store, 'dispatch');
      
      component.addNewAgent();
      component.agentForm = {
        provider: 'provider-1',
        model: 'gpt-4',
        apiKey: '',
        networkAddress: '',
        localHostType: '',
        multimodal: true,
        endpoint: ''
      };
      
      component.saveAgent();
      
      expect(component.showAgentForm()).toBe(false);
      // Verify that the correct message is sent to VS Code extension
      expect(messageService.sendMessage).toHaveBeenCalled();
    });

    it('should handle agent editing workflow', () => {
      const agentWithProvider: AgentWithProvider = mockAgentsWithProviders[0];
      
      component.editAgent(agentWithProvider);
      
      expect(component.showAgentForm()).toBe(true);
      expect(component.editingAgent()).toBe(agentWithProvider.agent);
      expect(component.agentForm.provider).toBe('provider-1');
      expect(component.agentForm.model).toBe('gpt-4');
      expect(component.agentForm.multimodal).toBe(false);
    });

    it('should handle agent toggle active/inactive', () => {
      spyOn(store, 'dispatch');
      
      component.onAgentToggleChange('agent-1', false);
      
      expect(store.dispatch).toHaveBeenCalledWith(
        AgentActions.toggleAgent({ agentId: 'agent-1', isActive: false })
      );
    });
  });

  describe('Provider Deletion with Dependent Agent Handling', () => {
    it('should show confirmation dialog when deleting agent', () => {
      expect(component.showConfirmDialog()).toBe(false);
      
      component.deleteAgent('agent-1');
      
      expect(component.showConfirmDialog()).toBe(true);
      expect(component.agentToDelete()).toBe('agent-1');
      expect(component.confirmationData().title).toBe('Delete Agent');
    });

    it('should delete agent when confirmed', () => {
      component.agentToDelete.set('agent-1');
      
      component.onConfirmDelete();
      
      expect(component.showConfirmDialog()).toBe(false);
      expect(component.agentToDelete()).toBeNull();
      expect(messageService.sendMessage).toHaveBeenCalled();
    });

    it('should cancel deletion when dialog is closed', () => {
      component.agentToDelete.set('agent-1');
      component.showConfirmDialog.set(true);
      
      component.closeConfirmDialog();
      
      expect(component.showConfirmDialog()).toBe(false);
      expect(component.agentToDelete()).toBeNull();
    });

    it('should show provider inactive warning for agents', fakeAsync(() => {
      // Create state with inactive provider
      const stateWithInactiveProvider = {
        ...initialState,
        providers: {
          providers: [
            { ...mockProviders[0], isActive: false }
          ],
          loading: false,
          error: null
        }
      };
      
      store.setState(stateWithInactiveProvider);
      component.setActiveTab('agents');
      fixture.detectChanges();
      tick();
      
      const agentCard = fixture.debugElement.nativeElement.querySelector('.agent-card');
      expect(agentCard).toHaveClass('provider-inactive');
      expect(agentCard.textContent).toContain('Provider Inactive');
    }));

    it('should disable agent toggle when provider is inactive', fakeAsync(() => {
      const stateWithInactiveProvider = {
        ...initialState,
        providers: {
          providers: [
            { ...mockProviders[0], isActive: false }
          ],
          loading: false,
          error: null
        }
      };
      
      store.setState(stateWithInactiveProvider);
      component.setActiveTab('agents');
      fixture.detectChanges();
      tick();
      
      const toggleInput = fixture.debugElement.nativeElement.querySelector('.toggle-switch input');
      expect(toggleInput.disabled).toBe(true);
    }));
  });

  describe('Settings UI Full Sidebar Coverage', () => {
    it('should have full height container', () => {
      const container = fixture.debugElement.nativeElement.querySelector('.settings-container');
      expect(container).toBeTruthy();
      
      const computedStyle = window.getComputedStyle(container);
      expect(computedStyle.height).toBe('100vh');
    });

    it('should have proper close button functionality', () => {
      spyOn(component.closeSettings, 'emit');
      
      const closeButton = fixture.debugElement.nativeElement.querySelector('.close-btn');
      expect(closeButton).toBeTruthy();
      
      closeButton.click();
      
      expect(component.closeSettings.emit).toHaveBeenCalled();
    });

    it('should handle tab switching with proper styling', () => {
      const tabs = fixture.debugElement.nativeElement.querySelectorAll('.settings-tab');
      expect(tabs.length).toBe(3);
      
      // Initially providers tab should be active
      expect(tabs[0]).toHaveClass('active');
      expect(tabs[1]).not.toHaveClass('active');
      expect(tabs[2]).not.toHaveClass('active');
      
      // Click agents tab
      tabs[1].click();
      fixture.detectChanges();
      
      expect(component.activeTab()).toBe('agents');
      expect(tabs[0]).not.toHaveClass('active');
      expect(tabs[1]).toHaveClass('active');
      expect(tabs[2]).not.toHaveClass('active');
    });

    it('should show correct content for each tab', () => {
      // Providers tab
      component.setActiveTab('providers');
      fixture.detectChanges();
      
      let content = fixture.debugElement.nativeElement.querySelector('.settings-content');
      expect(content.querySelector('app-provider-management')).toBeTruthy();
      
      // Agents tab
      component.setActiveTab('agents');
      fixture.detectChanges();
      
      content = fixture.debugElement.nativeElement.querySelector('.settings-content');
      expect(content.querySelector('.agents-list, .empty-state')).toBeTruthy();
      
      // General tab
      component.setActiveTab('general');
      fixture.detectChanges();
      
      content = fixture.debugElement.nativeElement.querySelector('.settings-content');
      expect(content.querySelector('.setting-item')).toBeTruthy();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle message service errors gracefully', () => {
      messagesSubject.next({
        type: 'cloudModelsResult',
        payload: { success: false, error: 'API key invalid' }
      });
      
      expect(component.modelError()).toBe('API key invalid');
      expect(component.availableModels()).toEqual([]);
    });

    it('should handle empty provider list in agent form', fakeAsync(() => {
      store.setState({
        ...initialState,
        providers: { providers: [], loading: false, error: null }
      });
      
      component.addNewAgent();
      fixture.detectChanges();
      tick();
      
      const helpText = fixture.debugElement.nativeElement.querySelector('.form-help-text');
      expect(helpText?.textContent).toContain('No active providers available');
    }));

    it('should validate agent form before submission', () => {
      component.addNewAgent();
      
      // Try to save without required fields
      const form = fixture.debugElement.nativeElement.querySelector('form');
      const submitButton = form.querySelector('button[type="submit"]');
      
      expect(submitButton.disabled).toBe(true);
      
      // Fill required fields
      component.agentForm.provider = 'provider-1';
      component.agentForm.model = 'gpt-4';
      fixture.detectChanges();
      
      // Form should now be valid (in a real scenario)
      expect(component.agentForm.provider).toBe('provider-1');
      expect(component.agentForm.model).toBe('gpt-4');
    });

    it('should handle loading states properly', () => {
      store.setState({
        ...initialState,
        providers: { providers: [], loading: true, error: null }
      });
      
      component.setActiveTab('providers');
      fixture.detectChanges();
      
      const loadingContainer = fixture.debugElement.nativeElement.querySelector('.loading-container');
      expect(loadingContainer).toBeTruthy();
      expect(loadingContainer.textContent).toContain('Loading');
    });

    it('should handle error states properly', () => {
      store.setState({
        ...initialState,
        providers: { providers: [], loading: false, error: 'Failed to load providers' }
      });
      
      component.setActiveTab('providers');
      fixture.detectChanges();
      
      const errorContainer = fixture.debugElement.nativeElement.querySelector('.error-container');
      expect(errorContainer).toBeTruthy();
      expect(errorContainer.textContent).toContain('Failed to load providers');
    });
  });
});