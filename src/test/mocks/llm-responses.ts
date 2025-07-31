/**
 * Mock LLM responses for consistent testing
 */

import { ChatResponse, ChatMessage } from '../../core/chat';

export interface MockLLMResponse {
  provider: string;
  scenario: string;
  request: ChatMessage[];
  response: ChatResponse;
}

export const mockLLMResponses: MockLLMResponse[] = [
  // Context generation responses
  {
    provider: 'openai',
    scenario: 'context-generation-success',
    request: [
      { role: 'system', content: 'You are analyzing a workspace...' },
      { role: 'user', content: 'Analyze this React TypeScript project...' }
    ],
    response: {
      content: `# Workspace Analysis

This is a React TypeScript project with the following structure:

## Key Files
- package.json: Contains React 18 dependencies
- src/index.tsx: Main entry point
- src/App.tsx: Root component

## Technologies
- React 18
- TypeScript 4.9
- Webpack 5

## Recommendations
The project follows standard React patterns and is well-structured.`,
      finishReason: 'stop',
      usage: {
        promptTokens: 150,
        completionTokens: 85,
        totalTokens: 235
      },
      metadata: {
        provider: 'openai',
        model: 'gpt-4',
        timestamp: new Date().toISOString()
      }
    }
  },

  // Planning responses
  {
    provider: 'openai',
    scenario: 'planning-success',
    request: [
      { role: 'system', content: 'You are a software development planner...' },
      { role: 'user', content: 'Create a plan to add a user authentication system...' }
    ],
    response: {
      content: `# Implementation Plan: User Authentication System

## Overview
This plan implements a complete user authentication system with login, registration, and session management.

## Action Steps

1. Create authentication service module
2. Implement user registration component
3. Implement login component
4. Add protected route wrapper
5. Create user context provider
6. Add logout functionality
7. Implement session persistence
8. Add form validation
9. Create authentication API endpoints
10. Add error handling and loading states

## Complexity Assessment
This is a moderate complexity task requiring frontend and backend changes.

## Risk Assessment
Medium risk - involves security considerations and state management.`,
      finishReason: 'stop',
      usage: {
        promptTokens: 200,
        completionTokens: 120,
        totalTokens: 320
      },
      metadata: {
        provider: 'openai',
        model: 'gpt-4',
        timestamp: new Date().toISOString()
      }
    }
  },

  // Execution responses
  {
    provider: 'openai',
    scenario: 'file-generation-success',
    request: [
      { role: 'system', content: 'You are generating file content...' },
      { role: 'user', content: 'Create src/components/LoginForm.tsx...' }
    ],
    response: {
      content: `\`\`\`typescript
import React, { useState } from 'react';

interface LoginFormProps {
  onSubmit: (email: string, password: string) => void;
  loading?: boolean;
  error?: string;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSubmit, loading, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(email, password);
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <div className="form-group">
        <label htmlFor="email">Email:</label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      
      <div className="form-group">
        <label htmlFor="password">Password:</label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
};
\`\`\``,
      finishReason: 'stop',
      usage: {
        promptTokens: 100,
        completionTokens: 250,
        totalTokens: 350
      },
      metadata: {
        provider: 'openai',
        model: 'gpt-4',
        timestamp: new Date().toISOString()
      }
    }
  },

  // Error scenarios
  {
    provider: 'openai',
    scenario: 'rate-limit-error',
    request: [
      { role: 'user', content: 'Any request' }
    ],
    response: {
      content: '',
      finishReason: 'error',
      metadata: {
        provider: 'openai',
        model: 'gpt-4',
        timestamp: new Date().toISOString(),
        error: {
          code: 'rate_limit_exceeded',
          message: 'Rate limit exceeded. Please try again later.',
          type: 'rate_limit_error'
        }
      }
    }
  },

  {
    provider: 'openai',
    scenario: 'invalid-api-key',
    request: [
      { role: 'user', content: 'Any request' }
    ],
    response: {
      content: '',
      finishReason: 'error',
      metadata: {
        provider: 'openai',
        model: 'gpt-4',
        timestamp: new Date().toISOString(),
        error: {
          code: 'invalid_api_key',
          message: 'Invalid API key provided.',
          type: 'authentication_error'
        }
      }
    }
  },

  // Anthropic responses
  {
    provider: 'anthropic',
    scenario: 'planning-success',
    request: [
      { role: 'system', content: 'You are a software development planner...' },
      { role: 'user', content: 'Create a plan for implementing a REST API...' }
    ],
    response: {
      content: `# REST API Implementation Plan

## Architecture Overview
We'll implement a RESTful API using Express.js with TypeScript, following industry best practices.

## Implementation Steps

1. Set up Express.js server with TypeScript
2. Configure middleware (CORS, body parser, logging)
3. Implement database connection (MongoDB/PostgreSQL)
4. Create data models and schemas
5. Implement authentication middleware
6. Create CRUD endpoints for each resource
7. Add input validation and sanitization
8. Implement error handling middleware
9. Add API documentation with Swagger
10. Set up testing framework and write tests

## Technical Considerations
- Use proper HTTP status codes
- Implement pagination for list endpoints
- Add rate limiting for security
- Use environment variables for configuration`,
      finishReason: 'stop',
      usage: {
        promptTokens: 180,
        completionTokens: 140,
        totalTokens: 320
      },
      metadata: {
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        timestamp: new Date().toISOString()
      }
    }
  },

  // Ollama responses
  {
    provider: 'ollama',
    scenario: 'basic-code-generation',
    request: [
      { role: 'user', content: 'Create a simple utility function...' }
    ],
    response: {
      content: `Here's a simple utility function:

\`\`\`javascript
function formatDate(date) {
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  return date.toLocaleDateString('en-US', options);
}

// Usage example:
const today = new Date();
console.log(formatDate(today)); // "January 15, 2024"
\`\`\`

This function takes a Date object and returns a formatted string.`,
      finishReason: 'stop',
      usage: {
        promptTokens: 50,
        completionTokens: 80,
        totalTokens: 130
      },
      metadata: {
        provider: 'ollama',
        model: 'llama2',
        timestamp: new Date().toISOString()
      }
    }
  }
];

export function getMockResponse(provider: string, scenario: string): MockLLMResponse | undefined {
  return mockLLMResponses.find(r => r.provider === provider && r.scenario === scenario);
}

export function getMockResponsesByProvider(provider: string): MockLLMResponse[] {
  return mockLLMResponses.filter(r => r.provider === provider);
}

export function getMockResponsesByScenario(scenario: string): MockLLMResponse[] {
  return mockLLMResponses.filter(r => r.scenario === scenario);
}