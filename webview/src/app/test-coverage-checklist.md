# Angular App Test Coverage Checklist

This checklist tracks missing and recommended tests for the Angular app (webview/src/app/). Check off each item as tests are implemented.

## Highest Priority (Core Functionality)
- [ ] `App` component (already tested)
- [ ] `chat-output` component
- [ ] `input-area` component
- [ ] `error-handler` component
- [ ] `progress-indicator` component
- [ ] `session-tabs` component
- [ ] `session.service` (business logic, signals)
- [ ] `message.service` (business logic, signals)
- [ ] NgRx state: `session.actions`, `session.reducer`, `session.effects`, `session.selectors`

## Medium Priority (Supporting Logic)
- [ ] Any custom pipes (if present)
- [ ] Any additional services or utility files
- [ ] Model logic (e.g., `session.model.ts`)

## Low Priority (Integration/Edge Cases)
- [ ] Integration tests for component interaction
- [ ] Edge case/error handling tests

---

**Instructions:**
- Add a `.spec.ts` file for each unchecked item.
- Mark as checked `[x]` when implemented.
- Update this file as coverage improves.
