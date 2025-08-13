import * as fs from 'fs';
import * as path from 'path';
import { BaseTool, ToolResult, ToolParameter } from '../types';

/**
 * Tool for getting current working directory
 */
export class GetWorkingDirectoryTool extends BaseTool {
  name = 'get_working_directory';
  description = 'Get the current working directory';
  parameters: ToolParameter[] = [];

  async execute(parameters: Record<string, any>): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      const cwd = process.cwd();
      
      return {
        success: true,
        output: cwd,
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
 * Tool for finding files by pattern
 */
export class FindFilesTool extends BaseTool {
  name = 'find_files';
  description = 'Find files matching a pattern in the workspace';
  parameters: ToolParameter[] = [
    {
      name: 'pattern',
      type: 'string',
      description: 'File pattern to search for (supports glob patterns like *.js, **/*.ts)',
      required: true
    },
    {
      name: 'directory',
      type: 'string',
      description: 'Directory to search in (defaults to current working directory)',
      required: false
    },
    {
      name: 'maxResults',
      type: 'number',
      description: 'Maximum number of results to return (default: 100)',
      required: false,
      default: 100
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

      const pattern = parameters.pattern as string;
      const directory = parameters.directory || process.cwd();
      const maxResults = parameters.maxResults || 100;

      // Basic security check
      if (path.isAbsolute(directory) && !directory.startsWith(process.cwd())) {
        return {
          success: false,
          error: 'Access denied: Cannot search outside workspace',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      const results = await this.findFiles(directory, pattern, maxResults);
      
      return {
        success: true,
        output: JSON.stringify(results, null, 2),
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

  private async findFiles(directory: string, pattern: string, maxResults: number): Promise<any[]> {
    const results: any[] = [];
    const regex = this.globToRegex(pattern);

    await this.searchDirectory(directory, regex, results, maxResults);
    
    return results.slice(0, maxResults);
  }

  private async searchDirectory(dir: string, regex: RegExp, results: any[], maxResults: number): Promise<void> {
    if (results.length >= maxResults) {
      return;
    }

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (results.length >= maxResults) {
          break;
        }

        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(process.cwd(), fullPath);

        if (entry.isFile()) {
          if (regex.test(entry.name) || regex.test(relativePath)) {
            results.push({
              name: entry.name,
              path: relativePath,
              fullPath: fullPath,
              type: 'file'
            });
          }
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          // Recursively search subdirectories (skip hidden directories)
          await this.searchDirectory(fullPath, regex, results, maxResults);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  private globToRegex(pattern: string): RegExp {
    // Simple glob to regex conversion
    let regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    // Handle ** for recursive directory matching
    regexPattern = regexPattern.replace(/\.\*\.\*/g, '.*');

    return new RegExp(regexPattern, 'i');
  }
}

/**
 * Tool for getting file information
 */
export class GetFileInfoTool extends BaseTool {
  name = 'get_file_info';
  description = 'Get detailed information about a file or directory';
  parameters: ToolParameter[] = [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file or directory',
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
      
      // Basic security check
      if (path.isAbsolute(filePath) && !filePath.startsWith(process.cwd())) {
        return {
          success: false,
          error: 'Access denied: Cannot access files outside workspace',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      const stats = await fs.promises.stat(filePath);
      const info: any = {
        path: filePath,
        name: path.basename(filePath),
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        permissions: {
          readable: !!(stats.mode & parseInt('444', 8)),
          writable: !!(stats.mode & parseInt('222', 8)),
          executable: !!(stats.mode & parseInt('111', 8))
        }
      };

      // Add additional info for files
      if (stats.isFile()) {
        const ext = path.extname(filePath);
        info.extension = ext;
        info.basename = path.basename(filePath, ext);
      }
      
      return {
        success: true,
        output: JSON.stringify(info, null, 2),
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
 * Tool for creating directories
 */
export class CreateDirectoryTool extends BaseTool {
  name = 'create_directory';
  description = 'Create a new directory';
  parameters: ToolParameter[] = [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the directory to create',
      required: true
    },
    {
      name: 'recursive',
      type: 'boolean',
      description: 'Create parent directories if they do not exist',
      required: false,
      default: true
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
      const recursive = parameters.recursive !== false; // Default to true
      
      // Basic security check
      if (path.isAbsolute(dirPath) && !dirPath.startsWith(process.cwd())) {
        return {
          success: false,
          error: 'Access denied: Cannot create directories outside workspace',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      await fs.promises.mkdir(dirPath, { recursive });
      
      return {
        success: true,
        output: `Successfully created directory: ${dirPath}`,
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