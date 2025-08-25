# Settings UI Integration Tests

This document describes the comprehensive integration tests for the Settings UI component of the Comrade extension, covering both VS Code extension integration and Angular component testing.

## Overview

The Settings UI integration tests validate the complete workflow of provider and agent management, ensuring that all requirements are met and the user experience is seamless.

## Test Coverage

### 1. Provider Setup and Configuration Workflow

**Test File**: `settings-ui-integration.test.ts`

**Coverage**:
- ✅ Complete cloud provider setup workflow
- ✅ Complete local network provider setup workflow  
- ✅ Provider edit workflow
- ✅ Provider toggle active/inactive
- ✅ Provider form validation
- ✅ Connection testing for both cloud and local providers

**Requirements Covered**:
- 2.2: Provider Management instead of Model Management
- 2.3: Cloud and Local Network provider options
- 2.5: Provider configuration validation
- 2.6: API key validation for cloud providers
- 2.7: Endpoint validation for local providers

### 2. Agent Creation with Provider Selection and Model Loading

**Test File**: `settings-ui-integration.test.ts`, `settings.component.integration.spec.ts`

**Coverage**:
- ✅ Agent creation workflow with provider selection
- ✅ Model loading for selected providers
- ✅ Agent creation with local network providers
- ✅ Prevention of agent creation when no active providers exist
- ✅ Agent edit workflow
- ✅ Dynamic model population from providers

**Requirements Covered**:
- 4.1: Agent configuration based on configured providers
- 4.2: Provider selection dropdown for agents
- 4.3: Dynamic model loading from selected provider
- 4.4: Agent configuration without redundant provider fields

### 3. Provider Deletion with Dependent Agent Handling

**Test File**: `settings-ui-integration.test.ts`, `provider-management.component.integration.spec.ts`

**Coverage**:
- ✅ Provider deletion with dependent agents
- ✅ Provider deactivation with dependent agents
- ✅ Warning dialog before provider deletion
- ✅ Cancellation of provider deletion
- ✅ Impact assessment and user feedback

**Requirements Covered**:
- 3.3: Provider edit and delete functionality
- 3.4: Provider deletion impact on dependent agents
- 3.5: Warning dialog with impact explanation
- 4.6: Cascade operations when providers are deactivated

### 4. Settings UI Full Sidebar Coverage

**Test File**: `settings.component.integration.spec.ts`

**Coverage**:
- ✅ Settings expand to fill entire sidebar height
- ✅ Chat view hidden when settings are active
- ✅ Clean dedicated settings experience
- ✅ Tab navigation functionality
- ✅ Proper modal behavior

**Requirements Covered**:
- 1.1: Settings interface takes up full sidebar space
- 1.2: No chat view elements shown when settings active
- 1.3: Clean, dedicated settings experience

## Test Structure

### VS Code Extension Integration Tests

Located in: `src/test/integration/settings-ui-integration.test.ts`

These tests focus on:
- Backend service integration
- Configuration persistence
- Message passing between extension and webview
- Provider and agent CRUD operations
- Dependency management

### Angular Component Integration Tests

Located in: `webview/src/app/components/*/**.integration.spec.ts`

These tests focus on:
- Component interactions
- NgRx state management
- Form validation
- UI workflows
- User experience flows

## Running the Tests

### Run All Integration Tests

```bash
# Run the comprehensive test suite
node src/test/run-settings-ui-integration-tests.js
```

### Run VS Code Extension Tests Only

```bash
# Run extension integration tests
npm test -- --grep "Settings UI Integration Tests"
```

### Run Angular Component Tests Only

```bash
# Navigate to webview directory
cd webview

# Run Angular integration tests
npm test -- --config=karma.integration.conf.js
```

### Run Tests in CI/CD Environment

```bash
# Set CI environment variable
export CI=true

# Run all tests
node src/test/run-settings-ui-integration-tests.js
```

## Test Data and Mocking

### Mock Data

The tests use comprehensive mock data that represents realistic provider and agent configurations:

```typescript
const mockProviders: ProviderConfig[] = [
  {
    id: 'provider-1',
    name: 'Test OpenAI Provider',
    type: 'cloud',
    provider: 'openai',
    apiKey: 'sk-test-key',
    isActive: true
  },
  {
    id: 'provider-2', 
    name: 'Local Ollama',
    type: 'local-network',
    provider: 'ollama',
    endpoint: 'http://localhost:11434',
    isActive: true
  }
];
```

### Mock Services

- **MockWebview**: Simulates VS Code webview API
- **MockWebviewPanel**: Simulates webview panel behavior
- **MockStore**: NgRx store for Angular component testing
- **MockMessageService**: Simulates message passing

## Test Scenarios

### Scenario 1: First-Time User Setup

1. User opens settings (empty state)
2. User adds first cloud provider (OpenAI)
3. User tests connection
4. User creates first agent using the provider
5. User verifies agent appears in agent list

### Scenario 2: Multi-Provider Environment

1. User has existing cloud provider
2. User adds local network provider (Ollama)
3. User creates agents for both providers
4. User toggles providers active/inactive
5. User verifies dependent agents are affected

### Scenario 3: Provider Deletion Impact

1. User has provider with multiple dependent agents
2. User attempts to delete provider
3. System shows warning with impact assessment
4. User confirms deletion
5. System removes provider and dependent agents

### Scenario 4: Error Handling

1. User enters invalid API key
2. System shows validation error
3. User tests connection with invalid credentials
4. System shows connection failure
5. User corrects configuration and succeeds

## Assertions and Validations

### UI State Assertions

```typescript
// Verify settings fill full sidebar
expect(container.style.height).toBe('100vh');

// Verify provider list display
expect(providerCards.length).toBe(2);
expect(providerCards[0].textContent).toContain('Test OpenAI Provider');

// Verify form validation
expect(submitButton.disabled).toBe(true);
```

### Service Integration Assertions

```typescript
// Verify provider creation
assert.strictEqual(newProvider.name, 'Test OpenAI Provider');
assert.strictEqual(newProvider.type, 'cloud');
assert.strictEqual(newProvider.isActive, true);

// Verify dependency management
assert.strictEqual(dependentAgents.length, 0);
```

### NgRx State Assertions

```typescript
// Verify store dispatch
expect(store.dispatch).toHaveBeenCalledWith(
  ProviderActions.addProvider({ provider: jasmine.any(Object) })
);

// Verify state updates
expect(component.showProviderForm()).toBe(false);
```

## Performance Considerations

### Test Execution Time

- Extension integration tests: ~30-60 seconds
- Angular component tests: ~45-90 seconds
- Total execution time: ~2-3 minutes

### Memory Usage

- Tests use mock data to minimize memory footprint
- Cleanup procedures ensure no memory leaks
- Parallel execution where possible

## Debugging Integration Tests

### Enable Debug Mode

```bash
# Run with debug output
DEBUG=true node src/test/run-settings-ui-integration-tests.js
```

### Common Issues

1. **Timeout Errors**: Increase timeout values in test configuration
2. **Mock Data Issues**: Verify mock data matches interface definitions
3. **State Management**: Ensure proper cleanup between tests
4. **Async Operations**: Use proper async/await patterns

### Debug Tools

- VS Code debugger integration
- Chrome DevTools for Angular tests
- Console logging with debug flags
- Test result JSON reports

## Continuous Integration

### GitHub Actions Configuration

```yaml
- name: Run Settings UI Integration Tests
  run: |
    npm install
    cd webview && npm install && cd ..
    node src/test/run-settings-ui-integration-tests.js
```

### Test Reports

Tests generate comprehensive reports:
- Console output with pass/fail summary
- JSON report for CI/CD integration
- Coverage reports for Angular components
- Requirements traceability matrix

## Maintenance

### Adding New Tests

1. Identify new requirements or features
2. Add test cases to appropriate test files
3. Update mock data if needed
4. Update documentation
5. Verify test coverage

### Updating Existing Tests

1. Review failing tests after code changes
2. Update assertions to match new behavior
3. Maintain backward compatibility where possible
4. Update mock data to reflect changes

## Troubleshooting

### Common Test Failures

1. **Provider Creation Fails**: Check mock secret storage implementation
2. **Angular Component Tests Fail**: Verify NgRx store configuration
3. **UI Assertions Fail**: Check CSS selectors and DOM structure
4. **Async Test Issues**: Ensure proper use of fakeAsync and tick()

### Resolution Steps

1. Check test logs for specific error messages
2. Verify mock data and service configurations
3. Run individual test suites to isolate issues
4. Use debugger to step through test execution
5. Check for timing issues in async operations

## Contributing

When adding new integration tests:

1. Follow existing test patterns and structure
2. Include comprehensive assertions
3. Add proper error handling
4. Update documentation
5. Ensure tests are deterministic and reliable
6. Add appropriate mock data and services