import { TestBed } from '@angular/core/testing';
import { ProgressIndicatorComponent } from './progress-indicator.component';
import { MessageService } from '../../services/message.service';
import { ProgressState } from '../../models/session.model';

class MockMessageService {
  cancelOperation = jasmine.createSpy('cancelOperation');
}

describe('ProgressIndicatorComponent', () => {
  let fixture: any;
  let component: ProgressIndicatorComponent;
  let messageService: MockMessageService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressIndicatorComponent],
      providers: [{ provide: MessageService, useClass: MockMessageService }],
    }).compileComponents();
    fixture = TestBed.createComponent(ProgressIndicatorComponent);
    component = fixture.componentInstance;
    messageService = TestBed.inject(MessageService) as any;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render progress when active', async () => {
    await fixture.componentRef.setInput('progressState', { isActive: true, message: 'Working...', cancellable: false, sessionId: 's1' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Working...');
    expect(fixture.nativeElement.querySelector('.progress-container')).toBeTruthy();
  });

  it('should not render progress when not active', async () => {
    await fixture.componentRef.setInput('progressState', { isActive: false, message: 'Done', cancellable: false, sessionId: 's1' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.progress-container')).toBeFalsy();
  });

  it('should call cancelOperation and emit event', async () => {
    spyOn(component.operationCancelled, 'emit');
    await fixture.componentRef.setInput('progressState', { isActive: true, message: 'Working...', cancellable: true, sessionId: 's2' });
    component.cancelOperation();
    expect(messageService.cancelOperation).toHaveBeenCalledWith('s2');
    expect(component.operationCancelled.emit).toHaveBeenCalled();
  });

  // Add more tests for edge cases and UI as needed
});
