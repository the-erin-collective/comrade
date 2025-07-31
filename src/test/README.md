# Comrade Extension Test Suite

This directory contains a comprehensive test suite for the Comrade VS Code extension, covering unit tests, integration tests, and error scenario testing.

## Test Structure

```
src/test/
├── mocks/                    # Mock data and utilities
│   ├── agents.ts            # Mock agent configurations and instances
│   ├── llm-responses.ts     # Mock LLM responses for consistent testing
│   ├── workspace-data.ts    # Mock workspace contexts and action lists
│   └── session-data.ts      # Mock session configurations and scenarios
├── unit/                    # Unit tests
│   ├── enhanced-registry.test.ts    # Comprehensive AgentRegistry tests
│   ├── enhanced-chat.test.ts        # Comprehensive ChatBridge tests
│   └── error-scenarios.test.ts      # Error handling and recovery tests
├── integration/             # Integration tests
│   ├── workflow.test.ts     # Complete workflow testing
│   └── extension.test.ts    # VS Code extension integration tests
├── suite/                   # Test runner configuration
│   └── index.ts            # Test suite loader
└── runTests.ts             # Test runner entry point
```

## Test Categories

### 1. Unit Tests

#### AgentRegistry Tests (`enhanced-registry.test.ts`)
- Agent loading and configuration validation
- Agent filtering by capabilities and phases
- Availability checking and health monitoring
- Error handling for configuration failures
- Performance testing with large agent sets
- Registry statistics and monitoring

#### ChatBridge Tests (`enhanced-chat.test.ts`)
- Provider-specific error handling (OpenAI, Anthropic, Ollama, Custom)
- Retry and recovery mechanisms with exponential backoff
- Request/response validation
- Streaming support and cancellation
- Performance and resource management
- Provider-specific features (function calling, system messages)

#### Error Scenarios Tests (`error-scenarios.test.ts`)
- Network and connectivity errors (timeouts, DNS, SSL, proxy)
- Authentication and authorization errors (expired keys, permissions, quotas)
- Resource and capacity errors (overload, context length, memory pressure)
- Data corruption and validation errors
- Concurrency and race condition handling
- Recovery mechanisms (retry, circuit breaker, graceful degradation)

### 2. Integration Tests

#### Workflow Tests (`workflow.test.ts`)
- Complete workflow: context → planning → execution
- Context generation failure handling
- Planning iteration and refinement
- Execution with dependency resolution
- Session cancellation during workflow
- Agent assignment and switching
- Error recovery during execution
- Workspace context integration

#### Extension Tests (`extension.test.ts`)
- Extension activation and deactivation
- Command registration and execution
- Agent configuration commands
- Connectivity testing commands
- Personality configuration
- Context analysis commands
- Error recovery commands
- Workspace configuration changes
- Sidebar webview provider registration

## Mock Data System

The test suite uses a comprehensive mock data system to ensure consistent and reliable testing:

### Mock Agents (`mocks/agents.ts`)
- Predefined agent configurations with various capabilities
- Mock agent instances with controllable availability
- Specialized agents for different test scenarios

### Mock LLM Responses (`mocks/llm-responses.ts`)
- Realistic LLM responses for different scenarios
- Error responses for testing failure cases
- Provider-specific response formats

### Mock Workspace Data (`mocks/workspace-data.ts`)
- Sample project structures (React, Node.js, Python)
- Mock dependencies and context summaries
- Action lists for different scenarios

### Mock Session Data (`mocks/session-data.ts`)
- Session requirements for different complexity levels
- Agent mappings for various scenarios
- Session state transition scenarios

## Running Tests

### All Tests
```bash
npm run test:all
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### VS Code Test Runner
```bash
npm test
```

## Test Configuration

### Mocha Configuration
- UI: TDD (Test-Driven Development)
- Timeout: 20 seconds for integration tests, 10 seconds for unit tests
- Color output enabled

### VS Code Test Configuration (`.vscode-test.mjs`)
- Test files: `out/test/**/*.test.js`
- Workspace folder: `./test-workspace`
- Mocha UI: TDD
- Timeout: 20 seconds

## Writing New Tests

### Unit Test Example
```typescript
import * as assert from 'assert';
import * as sinon from 'sinon';
import { YourClass } from '../path/to/class';
import { mockData } from '../mocks';

suite('YourClass Tests', () => {
  let sandbox: sinon.SinonSandbox;
  let instance: YourClass;

  setup(() => {
    sandbox = sinon.createSandbox();
    instance = new YourClass();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should do something', () => {
    // Test implementation
    assert.ok(true);
  });
});
```

### Integration Test Example
```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { createMockSession } from '../mocks/session-data';

suite('Integration Tests', () => {
  test('should complete workflow', async () => {
    const { session } = createMockSession();
    
    try {
      // Test implementation
      assert.ok(true);
    } finally {
      session.dispose();
    }
  });
});
```

## Test Coverage

The test suite aims for comprehensive coverage of:

- ✅ Core functionality (AgentRegistry, ChatBridge, Configuration)
- ✅ Error scenarios and recovery mechanisms
- ✅ Integration workflows
- ✅ VS Code extension integration
- ✅ Mock data consistency
- ✅ Performance and resource management
- ✅ Concurrency and race conditions
- ✅ Provider-specific features

## Continuous Integration

Tests are designed to run in CI environments with:
- No external dependencies (all mocked)
- Deterministic behavior
- Reasonable execution time
- Clear failure reporting

## Debugging Tests

### VS Code Debugging
1. Set breakpoints in test files
2. Run "Extension Tests" debug configuration
3. Tests will pause at breakpoints

### Console Debugging
```typescript
console.log('Debug info:', variable);
```

### Sinon Debugging
```typescript
console.log('Stub call count:', stub.callCount);
console.log('Stub call args:', stub.getCall(0).args);
```

## Best Practices

1. **Use Mocks**: Always use mock data instead of real external services
2. **Clean Setup/Teardown**: Reset state between tests
3. **Descriptive Names**: Use clear, descriptive test names
4. **Single Responsibility**: Each test should test one specific behavior
5. **Error Testing**: Include both success and failure scenarios
6. **Resource Cleanup**: Dispose of resources in teardown/finally blocks
7. **Async Handling**: Properly handle async operations with await
8. **Deterministic**: Tests should produce consistent results