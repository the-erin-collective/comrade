// File operation tools
export {
  ReadFileTool,
  WriteFileTool,
  CreateFileTool,
  DeleteFileTool,
  ListDirectoryTool
} from './file-operations';

// Command execution tools
export {
  ExecuteCommandTool
} from './command-execution';

// Workspace navigation tools
export {
  GetWorkingDirectoryTool,
  FindFilesTool,
  GetFileInfoTool,
  CreateDirectoryTool
} from './workspace-navigation';

// Tool registry for easy registration
import { ToolRegistry } from '../tool-registry';
import {
  ReadFileTool,
  WriteFileTool,
  CreateFileTool,
  DeleteFileTool,
  ListDirectoryTool
} from './file-operations';
import { ExecuteCommandTool } from './command-execution';
import {
  GetWorkingDirectoryTool,
  FindFilesTool,
  GetFileInfoTool,
  CreateDirectoryTool
} from './workspace-navigation';

/**
 * Register all built-in tools with a tool registry
 */
export function registerBuiltInTools(registry: ToolRegistry): void {
  // File operations
  registry.registerTool(new ReadFileTool());
  registry.registerTool(new WriteFileTool());
  registry.registerTool(new CreateFileTool());
  registry.registerTool(new DeleteFileTool());
  registry.registerTool(new ListDirectoryTool());

  // Command execution
  registry.registerTool(new ExecuteCommandTool());

  // Workspace navigation
  registry.registerTool(new GetWorkingDirectoryTool());
  registry.registerTool(new FindFilesTool());
  registry.registerTool(new GetFileInfoTool());
  registry.registerTool(new CreateDirectoryTool());
}

/**
 * Get all built-in tool instances
 */
export function getBuiltInTools() {
  return [
    // File operations
    new ReadFileTool(),
    new WriteFileTool(),
    new CreateFileTool(),
    new DeleteFileTool(),
    new ListDirectoryTool(),

    // Command execution
    new ExecuteCommandTool(),

    // Workspace navigation
    new GetWorkingDirectoryTool(),
    new FindFilesTool(),
    new GetFileInfoTool(),
    new CreateDirectoryTool()
  ];
}