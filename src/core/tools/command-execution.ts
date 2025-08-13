import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool, ToolResult, ToolParameter } from '../types';

const execAsync = promisify(exec);

/**
 * Tool for executing shell commands with safety validations
 */
export class ExecuteCommandTool extends BaseTool {
  name = 'execute_command';
  description = 'Execute a shell command with safety validations';
  parameters: ToolParameter[] = [
    {
      name: 'command',
      type: 'string',
      description: 'The command to execute',
      required: true
    },
    {
      name: 'workingDirectory',
      type: 'string',
      description: 'Working directory for command execution (optional)',
      required: false
    },
    {
      name: 'timeout',
      type: 'number',
      description: 'Timeout in milliseconds (default: 30000)',
      required: false,
      default: 30000
    }
  ];

  // List of dangerous commands that should be blocked
  private readonly dangerousCommands = [
    'rm -rf /',
    'rm -rf *',
    'format',
    'del /s /q',
    'shutdown',
    'reboot',
    'halt',
    'poweroff',
    'init 0',
    'init 6',
    'dd if=',
    'mkfs',
    'fdisk',
    'parted',
    'chmod 777',
    'chown -R',
    'sudo rm',
    'sudo dd',
    'sudo mkfs',
    'sudo fdisk',
    'curl | sh',
    'wget | sh',
    'curl | bash',
    'wget | bash'
  ];

  // List of allowed safe commands
  private readonly allowedCommands = [
    'ls', 'dir', 'pwd', 'cd', 'cat', 'type', 'echo', 'grep', 'find', 'which', 'where',
    'git', 'npm', 'yarn', 'node', 'python', 'pip', 'mvn', 'gradle', 'make',
    'docker ps', 'docker images', 'docker logs', 'kubectl get', 'kubectl describe',
    'ps', 'top', 'htop', 'df', 'du', 'free', 'uptime', 'whoami', 'id',
    'curl -s', 'wget -q', 'ping', 'nslookup', 'dig', 'netstat', 'ss',
    'test', 'jest', 'mocha', 'vitest', 'pytest', 'junit',
    'tsc', 'eslint', 'prettier', 'black', 'flake8', 'mypy'
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

      const command = parameters.command as string;
      const workingDirectory = parameters.workingDirectory as string;
      const timeout = parameters.timeout || 30000;

      // Safety validation
      const safetyCheck = this.validateCommandSafety(command);
      if (!safetyCheck.safe) {
        return {
          success: false,
          error: `Command blocked for safety: ${safetyCheck.reason}`,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters,
            timestamp: new Date()
          }
        };
      }

      // Validate working directory if provided
      if (workingDirectory) {
        const dirValidation = this.validateWorkingDirectory(workingDirectory);
        if (!dirValidation.valid) {
          return {
            success: false,
            error: dirValidation.error,
            metadata: {
              executionTime: Date.now() - startTime,
              toolName: this.name,
              parameters,
              timestamp: new Date()
            }
          };
        }
      }

      // Execute command
      const options: any = {
        timeout,
        maxBuffer: 1024 * 1024 // 1MB buffer
      };

      if (workingDirectory) {
        options.cwd = workingDirectory;
      }

      const { stdout, stderr } = await execAsync(command, options);
      
      return {
        success: true,
        output: (stdout?.toString() || stderr?.toString() || 'Command executed successfully'),
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date(),
          stderr: stderr?.toString() || undefined
        }
      };
    } catch (error: any) {
      let errorMessage = 'Unknown error occurred';
      
      if (error.code === 'ETIMEDOUT') {
        errorMessage = `Command timed out after ${parameters.timeout || 30000}ms`;
      } else if (error.signal) {
        errorMessage = `Command terminated with signal: ${error.signal}`;
      } else if (error.code) {
        errorMessage = `Command failed with exit code ${error.code}: ${error.stderr || error.message}`;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters,
          timestamp: new Date(),
          exitCode: error.code,
          signal: error.signal,
          stderr: error.stderr?.toString()
        }
      };
    }
  }

  /**
   * Validate command safety
   */
  private validateCommandSafety(command: string): { safe: boolean; reason?: string } {
    const lowerCommand = command.toLowerCase().trim();

    // Check for dangerous commands
    for (const dangerous of this.dangerousCommands) {
      if (lowerCommand.includes(dangerous.toLowerCase())) {
        return {
          safe: false,
          reason: `Contains dangerous pattern: ${dangerous}`
        };
      }
    }

    // Check for pipe to shell execution
    if (lowerCommand.includes('| sh') || lowerCommand.includes('| bash') || 
        lowerCommand.includes('|sh') || lowerCommand.includes('|bash')) {
      return {
        safe: false,
        reason: 'Pipe to shell execution is not allowed'
      };
    }

    // Check for command chaining with dangerous operators
    if (lowerCommand.includes('&&') || lowerCommand.includes('||') || lowerCommand.includes(';')) {
      // Allow simple command chaining for safe operations
      const parts = lowerCommand.split(/[;&|]+/);
      for (const part of parts) {
        const trimmedPart = part.trim();
        if (trimmedPart && !this.isCommandAllowed(trimmedPart)) {
          return {
            safe: false,
            reason: `Command chaining contains unsafe command: ${trimmedPart}`
          };
        }
      }
    }

    // Check if command starts with an allowed pattern
    if (!this.isCommandAllowed(lowerCommand)) {
      return {
        safe: false,
        reason: 'Command not in allowed list. Only safe development commands are permitted.'
      };
    }

    return { safe: true };
  }

  /**
   * Check if a command is in the allowed list
   */
  private isCommandAllowed(command: string): boolean {
    const lowerCommand = command.toLowerCase().trim();
    
    return this.allowedCommands.some(allowed => {
      const lowerAllowed = allowed.toLowerCase();
      return lowerCommand.startsWith(lowerAllowed) || 
             lowerCommand === lowerAllowed ||
             (lowerAllowed.includes(' ') && lowerCommand.startsWith(lowerAllowed.split(' ')[0]));
    });
  }

  /**
   * Validate working directory
   */
  private validateWorkingDirectory(workingDirectory: string): { valid: boolean; error?: string } {
    // Basic security check - prevent execution outside workspace
    if (workingDirectory.startsWith('/') && !workingDirectory.startsWith(process.cwd())) {
      return {
        valid: false,
        error: 'Access denied: Cannot execute commands outside workspace'
      };
    }

    // Prevent directory traversal
    if (workingDirectory.includes('..')) {
      return {
        valid: false,
        error: 'Directory traversal not allowed in working directory'
      };
    }

    return { valid: true };
  }
}