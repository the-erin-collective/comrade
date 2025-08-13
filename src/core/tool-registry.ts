import { Tool, ToolResult, ToolCall } from './types';

/**
 * Registry for managing available tools and their execution
 */
export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    /**
     * Register a tool in the registry
     */
    registerTool(tool: Tool): void {
        if (!tool.name || typeof tool.name !== 'string') {
            throw new Error('Tool name is required and must be a string');
        }
        
        if (!tool.description || typeof tool.description !== 'string') {
            throw new Error('Tool description is required and must be a string');
        }
        
        if (!tool.execute || typeof tool.execute !== 'function') {
            throw new Error('Tool execute function is required');
        }
        
        if (!Array.isArray(tool.parameters)) {
            throw new Error('Tool parameters must be an array');
        }

        this.tools.set(tool.name, tool);
    }

    /**
     * Get a tool by name
     */
    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all registered tools
     */
    getAllTools(): Tool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Execute a tool with the given parameters
     */
    async executeTool(name: string, parameters: Record<string, any>): Promise<ToolResult> {
        const startTime = Date.now();
        
        try {
            const tool = this.getTool(name);
            if (!tool) {
                return {
                    success: false,
                    error: `Tool '${name}' not found`,
                    metadata: {
                        executionTime: Math.max(Date.now() - startTime, 1),
                        toolName: name,
                        parameters,
                        timestamp: new Date()
                    }
                };
            }

            // Validate parameters
            const validationResult = this.validateParameters(tool, parameters);
            if (!validationResult.valid) {
                return {
                    success: false,
                    error: `Parameter validation failed: ${validationResult.error}`,
                    metadata: {
                        executionTime: Math.max(Date.now() - startTime, 1),
                        toolName: name,
                        parameters,
                        timestamp: new Date()
                    }
                };
            }

            // Execute the tool
            const result = await tool.execute(parameters);
            
            return {
                ...result,
                metadata: {
                    ...result.metadata,
                    executionTime: Math.max(Date.now() - startTime, 1),
                    toolName: name,
                    parameters
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                metadata: {
                    executionTime: Math.max(Date.now() - startTime, 1),
                    toolName: name,
                    parameters,
                    timestamp: new Date()
                }
            };
        }
    }

    /**
     * Execute a tool call (from AI response)
     */
    async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
        return this.executeTool(toolCall.name, toolCall.parameters);
    }

    /**
     * Validate tool parameters against the tool's parameter schema
     */
    private validateParameters(tool: Tool, parameters: Record<string, any>): { valid: boolean; error?: string } {
        for (const param of tool.parameters) {
            const value = parameters[param.name];
            
            // Check required parameters
            if (param.required && (value === undefined || value === null)) {
                return {
                    valid: false,
                    error: `Required parameter '${param.name}' is missing`
                };
            }
            
            // Skip validation for optional parameters that are not provided
            if (value === undefined || value === null) {
                continue;
            }
            
            // Type validation
            if (!this.validateParameterType(value, param.type)) {
                return {
                    valid: false,
                    error: `Parameter '${param.name}' must be of type ${param.type}, got ${typeof value}`
                };
            }
            
            // Enum validation
            if (param.enum && !param.enum.includes(value)) {
                return {
                    valid: false,
                    error: `Parameter '${param.name}' must be one of: ${param.enum.join(', ')}`
                };
            }
        }
        
        return { valid: true };
    }

    /**
     * Validate parameter type
     */
    private validateParameterType(value: any, expectedType: string): boolean {
        switch (expectedType) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'array':
                return Array.isArray(value);
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            default:
                return true; // Unknown types pass validation
        }
    }

    /**
     * Get tool schema for AI model consumption
     */
    getToolSchemas(): any[] {
        return this.getAllTools().map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: {
                type: 'object',
                properties: tool.parameters.reduce((props, param) => {
                    props[param.name] = {
                        type: param.type,
                        description: param.description,
                        ...(param.enum && { enum: param.enum })
                    };
                    return props;
                }, {} as Record<string, any>),
                required: tool.parameters.filter(p => p.required).map(p => p.name)
            }
        }));
    }

    /**
     * Clear all registered tools
     */
    clear(): void {
        this.tools.clear();
    }

    /**
     * Get the number of registered tools
     */
    size(): number {
        return this.tools.size;
    }
}