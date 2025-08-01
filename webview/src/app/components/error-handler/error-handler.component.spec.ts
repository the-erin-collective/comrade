import { TestBed } from '@angular/core/testing';
import { ErrorHandlerComponent } from './error-handler.component';
import { MessageService } from '../../services/message.service';
import { ErrorState, TimeoutState } from '../../models/session.model';

class MockMessageService {
  retryOperation = jasmine.createSpy('retryOperation');
  openConfiguration = jasmine.createSpy('openConfiguration');
  extendTimeout = jasmine.createSpy('extendTimeout');
  cancelOperation = jasmine.createSpy('cancelOperation');
}

describe('ErrorHandlerComponent', () => {
  let fixture: any;
  let component: ErrorHandlerComponent;
  let messageService: MockMessageService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ErrorHandlerComponent],
      providers: [{ provide: MessageService, useClass: MockMessageService }],
    }).compileComponents();
    fixture = TestBed.createComponent(ErrorHandlerComponent);
    component = fixture.componentInstance;
    messageService = TestBed.inject(MessageService) as any;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit errorDismissed when dismissError is called', () => {
    spyOn(component.errorDismissed, 'emit');
    component.dismissError();
    expect(component.errorDismissed.emit).toHaveBeenCalled();
  });

  it('should call retryOperation and emit events', () => {
    spyOn(component.errorDismissed, 'emit');
    spyOn(component.operationRetried, 'emit');
    component.errorState.set({ recoverable: true, sessionId: 's1', message: 'err' } as ErrorState);
    component.retryOperation();
    expect(messageService.retryOperation).toHaveBeenCalledWith('s1');
    expect(component.errorDismissed.emit).toHaveBeenCalled();
    expect(component.operationRetried.emit).toHaveBeenCalled();
  });

  it('should call openConfiguration and emit event', () => {
    spyOn(component.configurationOpened, 'emit');
    component.errorState.set({ configurationLink: 'config', sessionId: 's2', message: 'err' } as ErrorState);
    component.openConfiguration();
    expect(messageService.openConfiguration).toHaveBeenCalled();
    expect(component.configurationOpened.emit).toHaveBeenCalled();
  });

  it('should call extendTimeout and emit event', () => {
    spyOn(component.timeoutExtended, 'emit');
    component.timeoutState.set({ allowExtension: true, sessionId: 's3', message: 'timeout' } as TimeoutState);
    component.extendTimeout();
    expect(messageService.extendTimeout).toHaveBeenCalledWith('s3');
    expect(component.timeoutExtended.emit).toHaveBeenCalled();
  });

  it('should call cancelOperation and emit event', () => {
    spyOn(component.operationCancelled, 'emit');
    component.timeoutState.set({ sessionId: 's4', message: 'timeout' } as TimeoutState);
    component.cancelOperation();
    expect(messageService.cancelOperation).toHaveBeenCalledWith('s4');
    expect(component.operationCancelled.emit).toHaveBeenCalled();
  });

  // Add more tests for template rendering and edge cases as needed
});
