# Implementation Plan

- [ ] 1. Set up VS Code extension project structure and basic configuration
  - Create TypeScript VS Code extension using `yo code` generator
  - Configure build scripts, linting (eslint), and formatting (prettier)
  - Set up folder structure: `src/commands/`, `src/core/`, `src/runners/`, `src/providers/`
  - Configure VS Code launch and tasks configuration for development
  - _Requirements: 9.1, 9.2_

- [ ] 2. Implement core data models and interfaces
  - Create TypeScript interfaces for IAgent, AgentConfig, and AgentType enums
  - Implement Session interface and SessionState enum with basic state management
  - Create data models for WorkspaceContext, ActionList, and Action types
  - Define ChatMessage, ChatResponse, and related communication interfaces
  - Add MCP-related interfaces: MCPServerConfig, MCPTool, MCPToolResult
  - _Requirements: 1.1, 8.1, 8.3_

- [ ] 3. Create agent configuration system and VS Code settings integration
  - Define VS Code settings schema in package.json for agent configurations
  - Implement configuration validation and default value handling
  - Create agent configuration loading from VS Code settings
  - Add secure credential storage using VS Code's SecretStorage API
  - _Requirements: 1.1, 1.3, 1.4_

- [ ] 4. Implement ChatBridge for unified LLM communication
  - Create base ChatBridge class with HTTP client functionality
  - Implement OpenAI API integration with proper request/response handling
  - Add Ollama local instance support with endpoint configuration
  - Implement generic OpenAI-compatible endpoint support for custom providers
  - Add connection validation and error handling for different providers
  - _Requirements: 1.2, 1.5_

- [ ] 5. Build AgentRegistry for managing available agents
  - Create AgentRegistry class to register and manage agent instances
  - Implement agent availability checking and validation
  - Add agent selection logic based on configuration and availability
  - Create agent factory methods for different provider types
  - _Requirements: 1.1, 1.2, 1.5_

- [ ] 5.1 Implement MCP Manager for Model Context Protocol integration
  - Create MCPManager class for managing MCP server connections
  - Implement MCP server registration and lifecycle management
  - Add MCP tool discovery and invocation capabilities
  - Implement error handling and graceful degradation for MCP server failures
  - Add automatic reconnection logic for MCP server configuration changes
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 6. Implement personality configuration system
  - Create default `.comrade/personality.md` file with MVP personality content
  - Implement personality file reading and parsing functionality
  - Add personality content injection into all agent prompts
  - Handle missing personality file with built-in defaults
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 7. Create base Runner class and session management
  - Implement BaseRunner abstract class with common functionality
  - Create Session class for operation state management and cancellation
  - Add progress reporting integration with VS Code Progress API
  - Implement error handling base functionality in BaseRunner
  - _Requirements: 3.5, 4.5, 5.5, 6.4_

- [ ] 8. Implement ContextRunner for workspace analysis
  - Create ContextRunner class extending BaseRunner
  - Implement workspace file discovery with .gitignore respect
  - Add file content analysis and summarization logic
  - Implement token limit management and intelligent sampling for large workspaces
  - Generate structured context.json output with workspace information
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 9. Build PlanningRunner for iterative plan generation
  - Create PlanningRunner class extending BaseRunner
  - Implement reactive iterative loop for plan refinement
  - Add workspace context integration and user requirement processing
  - Generate structured action-list.json with executable steps
  - Create human-readable spec.md output for plan documentation
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 10. Implement ExecutionRunner with recovery capabilities
  - Create ExecutionRunner class extending BaseRunner
  - Implement sequential action list processing with progress tracking
  - Add file operation handlers (create, modify, delete files)
  - Implement shell command execution with proper error handling
  - Add basic recovery logic through re-planning on execution failures
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 11. Set up Angular 20 webview project structure
  - Initialize Angular 20 project in `webview/` directory with signals support
  - Configure Angular build pipeline to output single bundle for VS Code webview
  - Set up TypeScript configuration matching extension codebase
  - Configure VS Code theme integration with CSS variables
  - Create basic project structure: components, services, models directories
  - _Requirements: 6.1, 6.2_

- [ ] 11.1 Create VS Code webview provider and message bridge
  - Implement ComradeSidebarProvider class extending WebviewViewProvider
  - Register webview view provider in package.json and extension activation
  - Create bidirectional message passing interface between extension and webview
  - Implement message protocol for extension ↔ webview communication
  - Add webview HTML template loading and content security policy configuration
  - _Requirements: 6.1, 6.2, 6.11_

- [ ] 11.2 Build Angular session management components
  - Create session-tabs component for tabbed interface with new session and history buttons
  - Implement session switching logic and active tab management
  - Create conversation session and configuration session data models
  - Add session lifecycle management (create, switch, close sessions)
  - Implement session persistence and restoration functionality
  - _Requirements: 6.1, 6.2, 6.11_

- [ ] 11.3 Implement chat output and markdown rendering
  - Create chat-output component for displaying agent responses
  - Integrate markdown rendering library with syntax highlighting support
  - Implement scrollable output area with proper message formatting
  - Add message history display with timestamps and agent identification
  - Create loading states and progress indicators for ongoing operations
  - _Requirements: 6.3, 6.10_

- [ ] 11.4 Build input area with toolbar components
  - Create input-area component with expandable text box (up to half panel height)
  - Implement integrated send button within the input area
  - Create toolbar component below text input with "#", model dropdown, and "Comrade" menu
  - Add context menu functionality for "#" button with file, selection, image, and workspace options
  - Implement model switching dropdown that changes current phase's agent selection
  - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.8_

- [ ] 11.5 Implement configuration screens as session tabs
  - Create personality configuration screen that opens `.comrade/personality.md` for editing
  - Build model setup screen showing existing agent configurations with add/edit/remove options
  - Implement API connections screen for managing LLM provider credentials with secure authentication
  - Create MCP server configuration screen with add/edit/remove capabilities for server connections
  - Add form-based interfaces for all configuration screens loaded as separate session tabs
  - _Requirements: 6.9, 6.10, 6.11, 6.12, 6.13, 6.14_

- [ ] 11.6 Add phase transition and contextual alerts
  - Implement contextual alerts above input box for phase progression
  - Create action buttons for transitioning between context, planning, and execution phases
  - Add progress indicators and status messages during active operations
  - Implement cancellation support with cancel buttons in alerts
  - _Requirements: 6.10, 6.11_

- [ ] 12. Add cancellation support and error handling UI
  - Implement cancellation token support in all runners with progress cancellation buttons
  - Add "Cancel Operation" button in status bar during active operations
  - Create error notification system with actionable error messages and "Retry" buttons
  - Implement error recovery UI with suggested fixes and configuration links
  - Add operation timeout handling with user confirmation dialogs
  - _Requirements: 6.4, 5.3, 5.4_

- [ ] 13. Ensure VS Code web compatibility
  - Test and fix file system operations for web environment compatibility
  - Implement fallbacks for unsupported APIs in VS Code web
  - Add CORS handling and network constraint management
  - Test functionality in vscode.dev and github.dev environments
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 14. Create comprehensive test suite
  - Write unit tests for AgentRegistry, ChatBridge, and configuration system
  - Create integration tests for complete workflow (context → planning → execution)
  - Add mock LLM responses and test data for consistent testing
  - Implement VS Code extension integration tests
  - Test error scenarios and recovery mechanisms
  - _Requirements: 1.5, 3.5, 4.5, 5.5_

- [ ] 15. Build and package extension for distribution
  - Configure VSIX packaging with proper metadata and dependencies
  - Create comprehensive README with installation and usage instructions
  - Add configuration examples for different LLM providers
  - Test installation and basic functionality on clean VS Code instance
  - _Requirements: 1.1, 1.2, 1.3_