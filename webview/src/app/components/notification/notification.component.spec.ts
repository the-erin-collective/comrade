import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DebugElement } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { NotificationComponent } from './notification.component';
import { MessageService, NotificationMessage } from '../../services/message.service';

describe('NotificationComponent', () => {
  let component: NotificationComponent;
  let fixture: ComponentFixture<NotificationComponent>;
  let mockMessageService: jasmine.SpyObj<MessageService>;
  let notificationsSubject: BehaviorSubject<NotificationMessage[]>;

  const mockNotifications: NotificationMessage[] = [
    {
      id: 'test-1',
      type: 'success',
      message: 'Operation completed successfully',
      timestamp: new Date(),
      dismissible: true
    },
    {
      id: 'test-2',
      type: 'error',
      message: 'An error occurred',
      timestamp: new Date(),
      dismissible: true
    },
    {
      id: 'test-3',
      type: 'info',
      message: 'Information message',
      timestamp: new Date(),
      dismissible: false
    }
  ];

  beforeEach(async () => {
    notificationsSubject = new BehaviorSubject<NotificationMessage[]>([]);
    
    const messageServiceSpy = jasmine.createSpyObj('MessageService', [
      'dismissMessage',
      'showSuccess',
      'showError',
      'showInfo',
      'showWarning'
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display notifications from the service', () => {
    notificationsSubject.next(mockNotifications);
    fixture.detectChanges();

    const notificationElements = fixture.debugElement.queryAll(By.css('.notification'));
    expect(notificationElements.length).toBe(3);
  });

  it('should display correct notification content', () => {
    notificationsSubject.next([mockNotifications[0]]);
    fixture.detectChanges();

    const notificationElement = fixture.debugElement.query(By.css('.notification'));
    const messageElement = notificationElement.query(By.css('.notification-message'));
    
    expect(messageElement.nativeElement.textContent.trim()).toBe('Operation completed successfully');
  });

  it('should apply correct CSS classes for notification types', () => {
    notificationsSubject.next([mockNotifications[0], mockNotifications[1]]);
    fixture.detectChanges();

    const notificationElements = fixture.debugElement.queryAll(By.css('.notification'));
    
    expect(notificationElements[0].nativeElement.classList).toContain('notification-success');
    expect(notificationElements[1].nativeElement.classList).toContain('notification-error');
  });

  it('should show close button for dismissible notifications', () => {
    notificationsSubject.next([mockNotifications[0]]);
    fixture.detectChanges();

    const closeButton = fixture.debugElement.query(By.css('.notification-close'));
    expect(closeButton).toBeTruthy();
  });

  it('should not show close button for non-dismissible notifications', () => {
    notificationsSubject.next([mockNotifications[2]]);
    fixture.detectChanges();

    const closeButton = fixture.debugElement.query(By.css('.notification-close'));
    expect(closeButton).toBeFalsy();
  });

  it('should call dismissMessage when close button is clicked', () => {
    notificationsSubject.next([mockNotifications[0]]);
    fixture.detectChanges();

    const closeButton = fixture.debugElement.query(By.css('.notification-close'));
    closeButton.nativeElement.click();

    expect(mockMessageService.dismissMessage).toHaveBeenCalledWith('test-1');
  });

  it('should have proper accessibility attributes', () => {
    notificationsSubject.next([mockNotifications[0]]);
    fixture.detectChanges();

    const notificationElement = fixture.debugElement.query(By.css('.notification'));
    const closeButton = fixture.debugElement.query(By.css('.notification-close'));

    expect(notificationElement.nativeElement.getAttribute('role')).toBe('alert');
    expect(notificationElement.nativeElement.getAttribute('aria-live')).toBe('polite');
    expect(closeButton.nativeElement.getAttribute('aria-label')).toBe('Close notification');
    expect(closeButton.nativeElement.getAttribute('type')).toBe('button');
  });

  it('should set aria-live to assertive for error notifications', () => {
    notificationsSubject.next([mockNotifications[1]]);
    fixture.detectChanges();

    const notificationElement = fixture.debugElement.query(By.css('.notification'));
    expect(notificationElement.nativeElement.getAttribute('aria-live')).toBe('assertive');
  });

  it('should return correct icons for different notification types', () => {
    expect(component.getNotificationIcon('success')).toBe('✓');
    expect(component.getNotificationIcon('error')).toBe('✕');
    expect(component.getNotificationIcon('info')).toBe('ℹ');
    expect(component.getNotificationIcon('warning')).toBe('⚠');
  });

  it('should return correct CSS classes for icons', () => {
    expect(component.getIconClass('success')).toBe('icon-success');
    expect(component.getIconClass('error')).toBe('icon-error');
    expect(component.getIconClass('info')).toBe('icon-info');
    expect(component.getIconClass('warning')).toBe('icon-warning');
  });

  it('should handle empty notifications array', () => {
    notificationsSubject.next([]);
    fixture.detectChanges();

    const notificationElements = fixture.debugElement.queryAll(By.css('.notification'));
    expect(notificationElements.length).toBe(0);
  });

  it('should clean up subscriptions on destroy', () => {
    spyOn(component['destroy$'], 'next');
    spyOn(component['destroy$'], 'complete');

    component.ngOnDestroy();

    expect(component['destroy$'].next).toHaveBeenCalled();
    expect(component['destroy$'].complete).toHaveBeenCalled();
  });
});