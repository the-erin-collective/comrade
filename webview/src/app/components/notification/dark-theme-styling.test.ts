/**
 * Dark Theme Styling Test for Notification Components
 * 
 * This test verifies that notification components use proper VSCode dark theme variables
 * and maintain proper contrast and readability.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';

import { NotificationComponent } from './notification.component';
import { MessageService, NotificationMessage } from '../../services/message.service';

describe('NotificationComponent - Dark Theme Styling', () => {
  let component: NotificationComponent;
  let fixture: ComponentFixture<NotificationComponent>;
  let mockMessageService: jasmine.SpyObj<MessageService>;
  let notificationsSubject: BehaviorSubject<NotificationMessage[]>;

  const mockNotifications: NotificationMessage[] = [
    {
      id: 'success-1',
      type: 'success',
      message: 'Success notification',
      timestamp: new Date(),
      dismissible: true
    },
    {
      id: 'error-1',
      type: 'error',
      message: 'Error notification',
      timestamp: new Date(),
      dismissible: true
    },
    {
      id: 'info-1',
      type: 'info',
      message: 'Info notification',
      timestamp: new Date(),
      dismissible: true
    },
    {
      id: 'warning-1',
      type: 'warning',
      message: 'Warning notification',
      timestamp: new Date(),
      dismissible: true
    }
  ];

  beforeEach(async () => {
    notificationsSubject = new BehaviorSubject<NotificationMessage[]>([]);
    
    const messageServiceSpy = jasmine.createSpyObj('MessageService', [
      'dismissMessage'
    ]);
    
    messageServiceSpy.notifications$ = notificationsSubject.asObservable();

    await TestBed.configureTestingModule({
      imports: [NotificationComponent],
      providers: [
        { provide: MessageService, useValue: messageServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationComponent);
    component = fixture.componentInstance;
    mockMessageService = TestBed.inject(MessageService) as jasmine.SpyObj<MessageService>;
  });

  describe('VSCode Dark Theme Variables', () => {
    it('should use VSCode notification background variables', () => {
      notificationsSubject.next([mockNotifications[0]]);
      fixture.detectChanges();

      const notificationElement = fixture.debugElement.query(By.css('.notification'));
      const styles = getComputedStyle(notificationElement.nativeElement);
      
      // The component should use CSS variables that reference VSCode theme variables
      const cssText = notificationElement.nativeElement.style.cssText || '';
      const componentStyles = component.constructor.toString();
      
      // Check that VSCode variables are used in the component styles
      expect(componentStyles).toContain('--vscode-notifications-background');
      expect(componentStyles).toContain('--vscode-notifications-foreground');
      expect(componentStyles).toContain('--vscode-notifications-border');
    });

    it('should use proper VSCode icon colors for different notification types', () => {
      notificationsSubject.next(mockNotifications);
      fixture.detectChanges();

      const componentStyles = component.constructor.toString();
      
      // Verify that proper VSCode icon color variables are used
      expect(componentStyles).toContain('--vscode-notificationsInfoIcon-foreground');
      expect(componentStyles).toContain('--vscode-notificationsErrorIcon-foreground');
      expect(componentStyles).toContain('--vscode-notificationsWarningIcon-foreground');
    });

    it('should apply correct border colors for notification types', () => {
      notificationsSubject.next(mockNotifications);
      fixture.detectChanges();

      const notificationElements = fixture.debugElement.queryAll(By.css('.notification'));
      
      // Check that different notification types have appropriate CSS classes
      expect(notificationElements[0].nativeElement.classList).toContain('notification-success');
      expect(notificationElements[1].nativeElement.classList).toContain('notification-error');
      expect(notificationElements[2].nativeElement.classList).toContain('notification-info');
      expect(notificationElements[3].nativeElement.classList).toContain('notification-warning');
    });

    it('should use VSCode hover background for close button', () => {
      notificationsSubject.next([mockNotifications[0]]);
      fixture.detectChanges();

      const componentStyles = component.constructor.toString();
      
      // Verify that VSCode hover background variable is used
      expect(componentStyles).toContain('--vscode-toolbar-hoverBackground');
    });

    it('should use VSCode focus border for accessibility', () => {
      notificationsSubject.next([mockNotifications[0]]);
      fixture.detectChanges();

      const componentStyles = component.constructor.toString();
      
      // Verify that VSCode focus border variable is used
      expect(componentStyles).toContain('--vscode-focusBorder');
    });
  });

  describe('Dark Theme Contrast and Readability', () => {
    it('should provide proper fallback colors for dark theme', () => {
      const componentStyles = component.constructor.toString();
      
      // Check that fallback colors are appropriate for dark theme
      expect(componentStyles).toContain('#2d2d30'); // Dark background fallback
      expect(componentStyles).toContain('#cccccc'); // Light text fallback
      expect(componentStyles).toContain('#454545'); // Border fallback
    });

    it('should use consistent dark theme colors across all notification types', () => {
      notificationsSubject.next(mockNotifications);
      fixture.detectChanges();

      const componentStyles = component.constructor.toString();
      
      // All notification types should use the same background variable
      const backgroundMatches = componentStyles.match(/--vscode-notifications-background/g);
      expect(backgroundMatches).toBeTruthy();
      expect(backgroundMatches!.length).toBeGreaterThan(3); // Used multiple times
    });

    it('should maintain proper shadow for dark theme', () => {
      notificationsSubject.next([mockNotifications[0]]);
      fixture.detectChanges();

      const componentStyles = component.constructor.toString();
      
      // Should use darker shadow appropriate for dark theme
      expect(componentStyles).toContain('rgba(0, 0, 0, 0.3)');
    });
  });

  describe('Animation and Visual Effects', () => {
    it('should include slide-in animation', () => {
      const componentStyles = component.constructor.toString();
      
      // Check for animation keyframes
      expect(componentStyles).toContain('slideIn');
      expect(componentStyles).toContain('@keyframes');
    });

    it('should have proper hover effects for dark theme', () => {
      notificationsSubject.next([mockNotifications[0]]);
      fixture.detectChanges();

      const componentStyles = component.constructor.toString();
      
      // Should include hover effects
      expect(componentStyles).toContain(':hover');
      expect(componentStyles).toContain('opacity');
    });
  });

  describe('Accessibility in Dark Theme', () => {
    it('should maintain proper ARIA attributes', () => {
      notificationsSubject.next([mockNotifications[1]]);
      fixture.detectChanges();

      const notificationElement = fixture.debugElement.query(By.css('.notification'));
      
      expect(notificationElement.nativeElement.getAttribute('role')).toBe('alert');
      expect(notificationElement.nativeElement.getAttribute('aria-live')).toBe('assertive');
    });

    it('should have accessible close button styling', () => {
      notificationsSubject.next([mockNotifications[0]]);
      fixture.detectChanges();

      const closeButton = fixture.debugElement.query(By.css('.notification-close'));
      
      expect(closeButton.nativeElement.getAttribute('aria-label')).toBe('Close notification');
      expect(closeButton.nativeElement.getAttribute('title')).toBe('Close notification');
    });
  });
});