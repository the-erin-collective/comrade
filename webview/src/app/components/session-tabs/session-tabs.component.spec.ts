import { TestBed } from '@angular/core/testing';
import { SessionTabsComponent } from './session-tabs.component';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';

describe('SessionTabsComponent', () => {
  let fixture: any;
  let component: SessionTabsComponent;
  let store: jasmine.SpyObj<Store<any>>;

  const mockSessions = [
    { id: '1', title: 'Session 1', isActive: true },
    { id: '2', title: 'Session 2', isActive: false }
  ];

  beforeEach(async () => {
    const storeSpy = jasmine.createSpyObj('Store', ['select', 'dispatch']);
    storeSpy.select.and.returnValue(of(mockSessions));
    await TestBed.configureTestingModule({
      imports: [SessionTabsComponent],
      providers: [{ provide: Store, useValue: storeSpy }],
    }).compileComponents();
    fixture = TestBed.createComponent(SessionTabsComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(Store) as any;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render session tabs', () => {
    fixture.detectChanges();
    const tabs = fixture.nativeElement.querySelectorAll('.session-tab');
    expect(tabs.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Session 1');
    expect(fixture.nativeElement.textContent).toContain('Session 2');
  });

  it('should call switchToSession on tab click', () => {
    spyOn(component, 'switchToSession');
    fixture.detectChanges();
    const tab = fixture.nativeElement.querySelector('.session-tab');
    tab.click();
    expect(component.switchToSession).toHaveBeenCalledWith('1');
  });

  it('should call closeSession on close button click', () => {
    spyOn(component, 'closeSession');
    fixture.detectChanges();
    const closeBtn = fixture.nativeElement.querySelector('.session-tab-close');
    closeBtn.click();
    expect(component.closeSession).toHaveBeenCalled();
  });

  it('should call createNewSession on new button click', () => {
    spyOn(component, 'createNewSession');
    fixture.detectChanges();
    const newBtn = fixture.nativeElement.querySelector('.session-control-btn');
    newBtn.click();
    expect(component.createNewSession).toHaveBeenCalled();
  });

  it('should call showSessionHistory on history button click', () => {
    spyOn(component, 'showSessionHistory');
    fixture.detectChanges();
    const btns = fixture.nativeElement.querySelectorAll('.session-control-btn');
    btns[1].click();
    expect(component.showSessionHistory).toHaveBeenCalled();
  });

  // Add more tests for edge cases and UI as needed
});
