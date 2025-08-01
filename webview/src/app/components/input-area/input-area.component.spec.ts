import { TestBed } from '@angular/core/testing';
import { InputAreaComponent } from './input-area.component';
import { By } from '@angular/platform-browser';
import { ContextItem } from '../../models/session.model';

describe('InputAreaComponent', () => {
  let fixture: any;
  let component: InputAreaComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputAreaComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(InputAreaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should update currentMessage on input', () => {
    const textarea = fixture.nativeElement.querySelector('.input-text');
    textarea.value = 'test message';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.currentMessage()).toBe('test message');
  });

  it('should emit messageSubmit on sendMessage', () => {
    spyOn(component.messageSubmit, 'emit');
    component.currentMessage.set('hello');
    component.sendMessage();
    expect(component.messageSubmit.emit).toHaveBeenCalledWith(jasmine.objectContaining({ message: 'hello' }));
  });

  it('should emit contextAdd when addContext is called', () => {
    spyOn(component.contextAdd, 'emit');
    component.addContext('file');
    expect(component.contextAdd.emit).toHaveBeenCalledWith({ type: 'file' });
  });

  it('should emit agentChange on agent change', () => {
    spyOn(component.agentChange, 'emit');
    const event = { target: { value: 'agent1' } } as any;
    component.onAgentChange(event);
    expect(component.agentChange.emit).toHaveBeenCalledWith('agent1');
  });

  it('should emit settingsOpen when showComradeMenu is called', () => {
    spyOn(component.settingsOpen, 'emit');
    component.showComradeMenu();
    expect(component.settingsOpen.emit).toHaveBeenCalled();
  });

  // Add more tests for context item removal, textarea height, etc.
});
