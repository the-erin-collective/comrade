/**
 * Model Adapter System
 * 
 * This module provides the foundation for integrating with different AI models
 * through a unified interface. It includes:
 * 
 * - Base interfaces and types for model adapters
 * - Abstract base class with common functionality
 * - Model capability detection and validation utilities
 * - Concrete adapter implementations (Ollama, etc.)
 */

export * from './base-model-adapter';
export * from './abstract-model-adapter';
export * from './model-capability-detector';
export * from './ollama-adapter';
export * from './huggingface-adapter';

// Re-export commonly used types for convenience
export type {
  ModelAdapter,
  ModelConfig,
  ModelCapabilities,
  ChatMessage,
  Tool,
  ToolCall,
  ToolResult,
  AIResponse,
  ResponseMetadata
} from './base-model-adapter';