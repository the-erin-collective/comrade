import { TestBed } from '@angular/core/testing';
import { MessageService } from '../../services/message.service';

describe('NotificationSystem', () => {
  let messageService: MessageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MessageService]
    });
    messageService = TestBed.inject(MessageService);
  });

  it('should create notification service', () => {
    expect(messageService).toBeTruthy();
  });

  it('should add notifications', (done) => {
    messageService.showSuccess('Test success message');
    
    messageService.notifications$.subscribe(notifications => {
      if (notifications.length > 0) {
        expect(notifications.length).toBe(1);
        expect(notifications[0].type).toBe('success');
        expect(notifications[0].message).toBe('Test success message');
        expect(notifications[0].dismissible).toBe(true);
        done();
      }
    });
  });

  it('should dismiss notifications', (done) => {
    messageService.showError('Test error message');
    
    let notificationId: string;
    let callCount = 0;
    
    messageService.notifications$.subscribe(notifications => {
      callCount++;
      
      if (callCount === 1) {
        // First call - notification added
        expect(notifications.length).toBe(1);
        notificationId = notifications[0].id;
        
        // Dismiss the notification
        messageService.dismissMessage(notificationId);
      } else if (callCount === 2) {
        // Second call - notification dismissed
        expect(notifications.length).toBe(0);
        done();
      }
    });
  });

  it('should clear error messages', (done) => {
    messageService.showError('Error 1');
    messageService.showInfo('Info message');
    messageService.showError('Error 2');
    
    let callCount = 0;
    
    messageService.notifications$.subscribe(notifications => {
      callCount++;
      
      if (callCount === 3) {
        // All notifications added
        expect(notifications.length).toBe(3);
        
        // Clear error messages
        messageService.clearErrorMessages();
      } else if (callCount === 4) {
        // Error messages cleared
        expect(notifications.length).toBe(1);
        expect(notifications[0].type).toBe('info');
        done();
      }
    });
  });

  it('should generate unique notification IDs', () => {
    messageService.showSuccess('Message 1');
    messageService.showSuccess('Message 2');
    
    messageService.notifications$.subscribe(notifications => {
      if (notifications.length === 2) {
        expect(notifications[0].id).not.toBe(notifications[1].id);
      }
    });
  });
});