# Comrade Extension Test Suite

This directory contains a comprehensive test suite for the Comrade VS Code extension, covering all aspects of the system from unit tests to integration tests.

## Test Structure

### Unit Tests (`unit/`)
- **enhanced-chat.test.ts**: Comprehensive ChatBridge tests with error scenarios and recovery mechanisms
- **enhanced-config.test.ts**: Configuration system tests with validation and persistence
- **enhanced-registry.test.ts**: AgentRegistry tests with capability filtering and error handling
- **error-scenarios.test.ts**: Comprehensive error handling and recovery mechanism tests

### Integration Tests (`integration/`)
- **workflow.test.ts**: Complete workflow tests (context → planning → execution)
- **extension.test.ts**: VS Code extension integration tests

### Mock Data (`mocks/`)
- **agents.ts**: Mock agent configurations and instances
- **llm-responses.ts**: Mock LLM responses for consistent testing
- **workspace-data.ts**: Mock workspace contexts and action lists
- **session-data.ts**: Mock session data and configurations

### Core Tests (Root Level)
- **registry.test.ts**: Basic AgentRegistry functionality
- **config.test.ts**: Basic configuration management
- **chat.test.ts**: Basic ChatBridge functionality
- **personality.test.ts**: Personality system tests
- **runner.test.ts**: Base runner functionality
- **context-runner.test.ts**: Context generation tests
- **planning-runner.test.ts**: Planning runner tests
- **execution-runner.test.ts**: Execution runner tests
- **error-handling.test.ts**: Error handling tests
- **webcompat.test.ts**: Web compatibility tests

## Test Categories

### 1. Unit Tests
Focus on individual components in isolation:
- Agent registry functionality
- Configuration validation and persistence
- Chat bridge communication
- Error handling mechanisms
- Recovery strategies

### 2. Integration Tests
Test complete workflows and component interactions:
- Full context → planning → execution workflows
- VS Code extension lifecycle
- Multi-agent coordination
- Error recovery across phases
- MCP tool integration

### 3. Error Scenario Tests
Comprehensive error handling coverage:
- Network failures and timeouts
- API errors (rate limits, authentication, quotas)
- File system permission errors
- Session cancellation and timeout
- Recovery mechanisms and fallback strategies

### 4. Mock Data and Utilities
Consistent test data and utilities:
- Mock agent configurations with various capabilities
- Predefined LLM responses for different scenarios
- Sample workspace structures and action lists
- Session state management utilities

## Running Tests

### All Tests
```bash
npm run test:all
```

### Comprehensive Test Suite
```bash
npm run test:comprehensive
```

### Individual Test Categories
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Specific test files
npm run test:config
npm run test:chat
npm run test:registry
npm run test:workflow
npm run test:extension
npm run test:error-scenarios
```

### Development Testing
```bash
# Watch mode for continuous testing
npm run test:watch

# Coverage reporting
npm run test:coverage
```

## Test Configuration

### Timeouts
- Unit tests: 15 seconds
- Integration tests: 30 seconds
- Error scenario tests: 20 seconds

### Reporters
- Default: `spec` reporter for detailed output
- Coverage: `nyc` for code coverage analysis

### Environment Variables
- `TEST_GREP`: Filter tests by pattern
- `TEST_RETRIES`: Number of retries for flaky tests

## Test Requirements Coverage

The test suite covers all requirements specified in task 14:

### ✅ Unit Tests for Core Components
- **AgentRegistry**: Capability filtering, availability checking, error handling
- **ChatBridge**: Provider communication, error scenarios, retry mechanisms
- **Configuration System**: Validation, persistence, API key management

### ✅ Integration Tests for Complete Workflows
- **Context → Planning → Execution**: Full workflow with real component interaction
- **Multi-agent Coordination**: Different agents for different phases
- **Error Recovery**: Cross-phase error handling and recovery

### ✅ Mock LLM Responses and Test Data
- **Consistent Responses**: Predefined responses for different scenarios
- **Error Scenarios**: Mock failures for testing error handling
- **Test Data**: Comprehensive mock data for all components

### ✅ VS Code Extension Integration Tests
- **Extension Lifecycle**: Activation, deactivation, command registration
- **Webview Communication**: Message passing and UI integration
- **File System Integration**: Workspace operations and permissions
- **Configuration Integration**: VS Code settings and secret storage

### ✅ Error Scenarios and Recovery Mechanisms
- **Network Errors**: Timeouts, DNS failures, connection issues
- **API Errors**: Rate limits, authentication, quota exceeded
- **System Errors**: File permissions, workspace access
- **Recovery Strategies**: Circuit breaker, exponential backoff, graceful degradation

## Test Quality Metrics

### Coverage Goals
- **Unit Tests**: >90% code coverage for core components
- **Integration Tests**: >80% workflow coverage
- **Error Scenarios**: >95% error path coverage

### Performance Benchmarks
- **Unit Tests**: <100ms per test average
- **Integration Tests**: <5s per test average
- **Total Suite**: <5 minutes execution time

### Reliability Standards
- **Flaky Test Rate**: <1% of total tests
- **False Positive Rate**: <0.1% of test runs
- **Test Isolation**: All tests must be independent

## Mock Data Structure

### Agent Configurations
```typescript
// Basic, intermediate, and advanced capability profiles
// Multiple provider types (OpenAI, Anthropic, Ollama, Custom)
// Various specializations and cost tiers
```

### LLM Responses
```typescript
// Success scenarios for each phase
// Error responses for different failure types
// Streaming responses for real-time testing
```

### Workspace Data
```typescript
// React TypeScript project structure
// Node.js Express API structure
// Python Flask application structure
```

### Session Data
```typescript
// Different complexity levels (simple, moderate, complex)
// Various agent assignment strategies
// Error and recovery scenarios
```

## Best Practices

### Test Organization
1. **Arrange-Act-Assert**: Clear test structure
2. **Descriptive Names**: Tests describe what they verify
3. **Single Responsibility**: Each test verifies one behavior
4. **Proper Cleanup**: All resources cleaned up after tests

### Mock Usage
1. **Consistent Data**: Use shared mock data across tests
2. **Realistic Scenarios**: Mocks reflect real-world conditions
3. **Error Simulation**: Include failure scenarios in mocks
4. **Performance**: Mocks don't introduce unnecessary delays

### Error Testing
1. **Comprehensive Coverage**: Test all error paths
2. **Recovery Verification**: Ensure recovery mechanisms work
3. **User Experience**: Verify error messages are helpful
4. **Monitoring**: Test error tracking and reporting

## Continuous Integration

### Pre-commit Hooks
- Run unit tests before commits
- Lint and format test files
- Validate test coverage thresholds

### CI Pipeline
1. **Fast Feedback**: Unit tests run first
2. **Parallel Execution**: Integration tests run in parallel
3. **Coverage Reporting**: Generate and publish coverage reports
4. **Failure Analysis**: Detailed failure reporting and logs

### Quality Gates
- All tests must pass before merge
- Coverage thresholds must be maintained
- No new flaky tests introduced
- Performance benchmarks met

## Troubleshooting

### Common Issues
1. **Timeout Errors**: Increase timeout for slow operations
2. **Mock Failures**: Verify mock data matches expected format
3. **VS Code API Issues**: Ensure proper mocking of VS Code APIs
4. **Async Test Issues**: Use proper async/await patterns

### Debug Mode
```bash
# Run tests with debug output
DEBUG=* npm run test:unit

# Run specific test with debugging
npm run test:unit -- --grep "specific test name"
```

### Test Isolation
- Each test creates fresh instances
- Singletons are reset between tests
- No shared state between test suites
- Proper cleanup in teardown methods