import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { ProviderManagementComponent } from './provider-management.component';
import { selectProviderStats, selectHasProviders } from '../../state/provider/provider.selectors';

describe('ProviderManagementComponent - Compact Statistics', () => {
  let component: ProviderManagementComponent;
  let fixture: ComponentFixture<ProviderManagementComponent>;
  let store: MockStore;

  const mockProviderStats = {
    totalProviders: 3,
    activeProviders: 2,
    providersByType: {
      cloud: 2,
      'local-network': 1
    },
    providersByProvider: {
      openai: 1,
      anthropic: 1,
      ollama: 1
    }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProviderManagementComponent],
      providers: [
        provideMockStore({
          selectors: [
            { selector: selectHasProviders, value: true },
            { selector: selectProviderStats, value: mockProviderStats }
          ]
        })
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProviderManagementComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(Store) as MockStore;
  });

  it('should display compact provider statistics', () => {
    fixture.detectChanges();

    const statsContainer = fixture.nativeElement.querySelector('.provider-stats-compact');
    expect(statsContainer).toBeTruthy();

    const statsSummary = statsContainer.querySelector('.stats-summary');
    expect(statsSummary).toBeTruthy();
    expect(statsSummary.textContent?.trim()).toBe('2 of 3 providers active');
  });

  it('should not display statistics when no providers exist', () => {
    store.overrideSelector(selectHasProviders, false);
    store.refreshState();
    fixture.detectChanges();

    const statsContainer = fixture.nativeElement.querySelector('.provider-stats-compact');
    expect(statsContainer).toBeFalsy();
  });

  it('should update statistics when provider stats change', () => {
    fixture.detectChanges();

    // Initial state
    let statsSummary = fixture.nativeElement.querySelector('.stats-summary');
    expect(statsSummary.textContent?.trim()).toBe('2 of 3 providers active');

    // Update stats
    const updatedStats = {
      ...mockProviderStats,
      totalProviders: 4,
      activeProviders: 3
    };
    store.overrideSelector(selectProviderStats, updatedStats);
    store.refreshState();
    fixture.detectChanges();

    statsSummary = fixture.nativeElement.querySelector('.stats-summary');
    expect(statsSummary.textContent?.trim()).toBe('3 of 4 providers active');
  });
});