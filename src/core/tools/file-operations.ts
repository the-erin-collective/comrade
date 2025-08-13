import * as fs from 'fs';
import * as path from 'path';
import { BaseTool, ToolResult, ToolParameter } from '../types';

/**
 * Tool for reading file contents
 */
export class ReadFileTool extends BaseTool {
  name = 'read_file';
  description = 'Read the contents of a file';
  parameters: ToolParameter[] = [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file to read',
      required: true
    }
  ];

  async execute(parameters: Record<string, any>): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      const validation = this.validateParameters(parameters);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      const filePath = parameters.path as string;
      
      // Basic security check - prevent reading outside workspace
      if (path.isAbsolute(filePath) && !filePath.startsWith(process.cwd())) {
        return {
          success: false,
          error: 'Access denied: Cannot read files outside workspace',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      const content = await fs.promises.readFile(filePath, 'utf-8');
      
      return {
        success: true,
        output: content,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    }
  }
}

/**
 * Tool for writing file contents
 */
export class WriteFileTool extends BaseTool {
  name = 'write_file';
  description = 'Write content to a file';
  parameters: ToolParameter[] = [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file to write',
      required: true
    },
    {
      name: 'content',
      type: 'string',
      description: 'Content to write to the file',
      required: true
    }
  ];

  async execute(parameters: Record<string, any>): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      const validation = this.validateParameters(parameters);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      const filePath = parameters.path as string;
      const content = parameters.content as string;
      
      // Basic security check - prevent writing outside workspace
      if (path.isAbsolute(filePath) && !filePath.startsWith(process.cwd())) {
        return {
          success: false,
          error: 'Access denied: Cannot write files outside workspace',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.promises.mkdir(dir, { recursive: true });
      
      await fs.promises.writeFile(filePath, content, 'utf-8');
      
      return {
        success: true,
        output: `Successfully wrote ${content.length} characters to ${filePath}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    }
  }
}

/**
 * Tool for creating a new file
 */
export class CreateFileTool extends BaseTool {
  name = 'create_file';
  description = 'Create a new file with optional content';
  parameters: ToolParameter[] = [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file to create',
      required: true
    },
    {
      name: 'content',
      type: 'string',
      description: 'Initial content for the file (optional)',
      required: false,
      default: ''
    }
  ];

  async execute(parameters: Record<string, any>): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      const validation = this.validateParameters(parameters);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      const filePath = parameters.path as string;
      const content = parameters.content || '';
      
      // Basic security check - prevent creating outside workspace
      if (path.isAbsolute(filePath) && !filePath.startsWith(process.cwd())) {
        return {
          success: false,
          error: 'Access denied: Cannot create files outside workspace',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      // Check if file already exists
      try {
        await fs.promises.access(filePath);
        return {
          success: false,
          error: `File already exists: ${filePath}`,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      } catch {
        // File doesn't exist, which is what we want
      }

      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.promises.mkdir(dir, { recursive: true });
      
      await fs.promises.writeFile(filePath, content, 'utf-8');
      
      return {
        success: true,
        output: `Successfully created file ${filePath}${content ? ` with ${content.length} characters` : ''}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    }
  }
}

/**
 * Tool for deleting a file
 */
export class DeleteFileTool extends BaseTool {
  name = 'delete_file';
  description = 'Delete a file';
  parameters: ToolParameter[] = [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file to delete',
      required: true
    }
  ];

  async execute(parameters: Record<string, any>): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      const validation = this.validateParameters(parameters);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      const filePath = parameters.path as string;
      
      // Basic security check - prevent deleting outside workspace
      if (path.isAbsolute(filePath) && !filePath.startsWith(process.cwd())) {
        return {
          success: false,
          error: 'Access denied: Cannot delete files outside workspace',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      // Check if file exists and is a file (not directory)
      const stats = await fs.promises.stat(filePath);
      if (!stats.isFile()) {
        return {
          success: false,
          error: `Path is not a file: ${filePath}`,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }
      
      await fs.promises.unlink(filePath);
      
      return {
        success: true,
        output: `Successfully deleted file ${filePath}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    }
  }
}

/**
 * Tool for listing directory contents
 */
export class ListDirectoryTool extends BaseTool {
  name = 'list_directory';
  description = 'List the contents of a directory';
  parameters: ToolParameter[] = [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the directory to list',
      required: true
    },
    {
      name: 'recursive',
      type: 'boolean',
      description: 'Whether to list contents recursively',
      required: false,
      default: false
    }
  ];

  async execute(parameters: Record<string, any>): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      const validation = this.validateParameters(parameters);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      const dirPath = parameters.path as string;
      const recursive = parameters.recursive || false;
      
      // Basic security check - prevent listing outside workspace
      if (path.isAbsolute(dirPath) && !dirPath.startsWith(process.cwd())) {
        return {
          success: false,
          error: 'Access denied: Cannot list directories outside workspace',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      const result = recursive ? 
        await this.listRecursive(dirPath) : 
        await this.listDirectory(dirPath);
      
      return {
        success: true,
        output: JSON.stringify(result, null, 2),
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date()
        }
      };
    }
  }

  private async listDirectory(dirPath: string): Promise<any[]> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: path.join(dirPath, entry.name)
    }));
  }

  private async listRecursive(dirPath: string, maxDepth: number = 10, currentDepth: number = 0): Promise<any[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const result: any[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const item = {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: fullPath
      };

      result.push(item);

      if (entry.isDirectory()) {
        try {
          const children = await this.listRecursive(fullPath, maxDepth, currentDepth + 1);
          result.push(...children);
        } catch (error) {
          // Skip directories we can't read
        }
      }
    }

    return result;
  }
}