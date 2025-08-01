# Angular Test Templates (v20+)

Use these as starting points for your own `.spec.ts` files. Replace placeholder names/types with your actual code.

---

## 1. Component Test Template
```ts
import { TestBed } from '@angular/core/testing';
import { MyComponent } from './my-component';

describe('MyComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyComponent], // Standalone component
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(MyComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render expected content', () => {
    const fixture = TestBed.createComponent(MyComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('expected text');
  });

  // Add more tests for input(), output(), signals, and events
});
```

---

## 2. Service Test Template
```ts
import { TestBed } from '@angular/core/testing';
import { MyService } from './my-service';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // Add tests for signals, business logic, and side effects
});
```

---

## 3. NgRx State Test Template
```ts
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Observable, of } from 'rxjs';
import { MyEffects } from './my.effects';
import * as MyActions from './my.actions';
import * as MySelectors from './my.selectors';

describe('NgRx State', () => {
  let store: MockStore;
  let actions$: Observable<any>;
  let effects: MyEffects;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideMockStore({ initialState: {} }),
        provideMockActions(() => actions$),
        MyEffects,
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(MyEffects);
  });

  it('should select state', () => {
    store.overrideSelector(MySelectors.selectSomething, 'value');
    store.refreshState();
    store.select(MySelectors.selectSomething).subscribe(val => {
      expect(val).toBe('value');
    });
  });

  // Add tests for actions, reducers, and effects
});
```

---

## 4. Integration Test Template
```ts
import { TestBed } from '@angular/core/testing';
import { ParentComponent } from './parent.component';
import { ChildComponent } from './child.component';

describe('Integration: Parent & Child', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParentComponent, ChildComponent],
    }).compileComponents();
  });

  it('should pass data from parent to child', () => {
    const fixture = TestBed.createComponent(ParentComponent);
    fixture.detectChanges();
    // Query child and assert data flow
  });

  // Add more integration scenarios
});
```
