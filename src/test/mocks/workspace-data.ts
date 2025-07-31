/**
 * Mock workspace data for testing
 */

import { WorkspaceContext, FileNode, DependencyInfo, ContextSummary, ActionList, Action, ActionType, ActionStatus } from '../../core/workspace';

export const mockFileStructures: Record<string, FileNode[]> = {
  'react-typescript': [
    {
      path: 'package.json',
      type: 'file',
      size: 1250,
      language: 'json',
      summary: 'Package configuration with React 18, TypeScript, and testing dependencies'
    },
    {
      path: 'tsconfig.json',
      type: 'file',
      size: 450,
      language: 'json',
      summary: 'TypeScript configuration with strict mode and React JSX'
    },
    {
      path: 'src',
      type: 'directory',
      children: [
        {
          path: 'src/index.tsx',
          type: 'file',
          size: 200,
          language: 'typescript',
          summary: 'React application entry point with root rendering'
        },
        {
          path: 'src/App.tsx',
          type: 'file',
          size: 800,
          language: 'typescript',
          summary: 'Main App component with routing and state management'
        },
        {
          path: 'src/components',
          type: 'directory',
          children: [
            {
              path: 'src/components/Header.tsx',
              type: 'file',
              size: 400,
              language: 'typescript',
              summary: 'Header component with navigation'
            },
            {
              path: 'src/components/Footer.tsx',
              type: 'file',
              size: 300,
              language: 'typescript',
              summary: 'Footer component with links'
            }
          ]
        },
        {
          path: 'src/hooks',
          type: 'directory',
          children: [
            {
              path: 'src/hooks/useAuth.ts',
              type: 'file',
              size: 600,
              language: 'typescript',
              summary: 'Custom hook for authentication state management'
            }
          ]
        },
        {
          path: 'src/utils',
          type: 'directory',
          children: [
            {
              path: 'src/utils/api.ts',
              type: 'file',
              size: 500,
              language: 'typescript',
              summary: 'API utility functions and HTTP client configuration'
            }
          ]
        }
      ]
    },
    {
      path: 'public',
      type: 'directory',
      children: [
        {
          path: 'public/index.html',
          type: 'file',
          size: 600,
          language: 'html',
          summary: 'HTML template with React root element'
        }
      ]
    }
  ],

  'node-express': [
    {
      path: 'package.json',
      type: 'file',
      size: 900,
      language: 'json',
      summary: 'Node.js package with Express, TypeScript, and database dependencies'
    },
    {
      path: 'src',
      type: 'directory',
      children: [
        {
          path: 'src/server.ts',
          type: 'file',
          size: 400,
          language: 'typescript',
          summary: 'Express server setup with middleware configuration'
        },
        {
          path: 'src/routes',
          type: 'directory',
          children: [
            {
              path: 'src/routes/auth.ts',
              type: 'file',
              size: 800,
              language: 'typescript',
              summary: 'Authentication routes with login/register endpoints'
            },
            {
              path: 'src/routes/users.ts',
              type: 'file',
              size: 600,
              language: 'typescript',
              summary: 'User management CRUD endpoints'
            }
          ]
        },
        {
          path: 'src/models',
          type: 'directory',
          children: [
            {
              path: 'src/models/User.ts',
              type: 'file',
              size: 500,
              language: 'typescript',
              summary: 'User model with Mongoose schema'
            }
          ]
        }
      ]
    }
  ],

  'python-flask': [
    {
      path: 'requirements.txt',
      type: 'file',
      size: 200,
      language: 'text',
      summary: 'Python dependencies including Flask, SQLAlchemy, and testing libraries'
    },
    {
      path: 'app.py',
      type: 'file',
      size: 600,
      language: 'python',
      summary: 'Flask application factory with blueprint registration'
    },
    {
      path: 'models',
      type: 'directory',
      children: [
        {
          path: 'models/__init__.py',
          type: 'file',
          size: 100,
          language: 'python',
          summary: 'Models package initialization'
        },
        {
          path: 'models/user.py',
          type: 'file',
          size: 400,
          language: 'python',
          summary: 'User model with SQLAlchemy ORM'
        }
      ]
    }
  ]
};

export const mockDependencies: Record<string, DependencyInfo[]> = {
  'react-typescript': [
    { name: 'react', version: '^18.2.0', type: 'npm', isDev: false },
    { name: 'react-dom', version: '^18.2.0', type: 'npm', isDev: false },
    { name: 'typescript', version: '^4.9.5', type: 'npm', isDev: true },
    { name: '@types/react', version: '^18.0.28', type: 'npm', isDev: true },
    { name: '@types/react-dom', version: '^18.0.11', type: 'npm', isDev: true },
    { name: 'react-router-dom', version: '^6.8.1', type: 'npm', isDev: false },
    { name: 'axios', version: '^1.3.4', type: 'npm', isDev: false },
    { name: '@testing-library/react', version: '^14.0.0', type: 'npm', isDev: true },
    { name: 'jest', version: '^29.5.0', type: 'npm', isDev: true }
  ],

  'node-express': [
    { name: 'express', version: '^4.18.2', type: 'npm', isDev: false },
    { name: 'typescript', version: '^4.9.5', type: 'npm', isDev: true },
    { name: '@types/express', version: '^4.17.17', type: 'npm', isDev: true },
    { name: 'mongoose', version: '^7.0.3', type: 'npm', isDev: false },
    { name: 'bcryptjs', version: '^2.4.3', type: 'npm', isDev: false },
    { name: 'jsonwebtoken', version: '^9.0.0', type: 'npm', isDev: false },
    { name: 'cors', version: '^2.8.5', type: 'npm', isDev: false },
    { name: 'dotenv', version: '^16.0.3', type: 'npm', isDev: false }
  ],

  'python-flask': [
    { name: 'Flask', version: '2.2.3', type: 'pip', isDev: false },
    { name: 'SQLAlchemy', version: '2.0.7', type: 'pip', isDev: false },
    { name: 'Flask-SQLAlchemy', version: '3.0.3', type: 'pip', isDev: false },
    { name: 'Flask-Migrate', version: '4.0.4', type: 'pip', isDev: false },
    { name: 'pytest', version: '7.2.2', type: 'pip', isDev: true },
    { name: 'pytest-flask', version: '1.2.0', type: 'pip', isDev: true }
  ]
};

export const mockContextSummaries: Record<string, ContextSummary> = {
  'react-typescript': {
    totalFiles: 8,
    totalLines: 450,
    primaryLanguages: ['typescript', 'json', 'html'],
    frameworks: ['React', 'React Router'],
    description: 'A React TypeScript application with component-based architecture, custom hooks, and API integration. Uses modern React patterns with TypeScript for type safety.'
  },

  'node-express': {
    totalFiles: 6,
    totalLines: 320,
    primaryLanguages: ['typescript', 'json'],
    frameworks: ['Express.js', 'Mongoose'],
    description: 'A Node.js Express API server with TypeScript, featuring authentication routes, user management, and MongoDB integration using Mongoose ODM.'
  },

  'python-flask': {
    totalFiles: 4,
    totalLines: 180,
    primaryLanguages: ['python', 'text'],
    frameworks: ['Flask', 'SQLAlchemy'],
    description: 'A Python Flask web application with SQLAlchemy ORM for database operations and modular blueprint architecture.'
  }
};

export function createMockWorkspaceContext(projectType: keyof typeof mockFileStructures): WorkspaceContext {
  return {
    timestamp: new Date().toISOString(),
    workspaceRoot: `/test/workspace/${projectType}`,
    fileStructure: mockFileStructures[projectType],
    dependencies: mockDependencies[projectType] || [],
    summary: mockContextSummaries[projectType],
    tokenCount: Math.floor(Math.random() * 2000) + 1000 // Random token count between 1000-3000
  };
}

export const mockActionLists: Record<string, ActionList> = {
  'add-authentication': {
    version: '1.0',
    timestamp: new Date().toISOString(),
    actions: [
      {
        id: 'auth_1',
        type: ActionType.CREATE_FILE,
        description: 'Create authentication service module',
        parameters: {
          filePath: 'src/services/auth.ts',
          language: 'typescript'
        },
        dependencies: [],
        status: ActionStatus.PENDING
      },
      {
        id: 'auth_2',
        type: ActionType.CREATE_FILE,
        description: 'Create login component',
        parameters: {
          filePath: 'src/components/LoginForm.tsx',
          language: 'typescript'
        },
        dependencies: ['auth_1'],
        status: ActionStatus.PENDING
      },
      {
        id: 'auth_3',
        type: ActionType.CREATE_FILE,
        description: 'Create registration component',
        parameters: {
          filePath: 'src/components/RegisterForm.tsx',
          language: 'typescript'
        },
        dependencies: ['auth_1'],
        status: ActionStatus.PENDING
      },
      {
        id: 'auth_4',
        type: ActionType.MODIFY_FILE,
        description: 'Update App.tsx to include authentication routes',
        parameters: {
          filePath: 'src/App.tsx',
          language: 'typescript'
        },
        dependencies: ['auth_2', 'auth_3'],
        status: ActionStatus.PENDING
      },
      {
        id: 'auth_5',
        type: ActionType.INSTALL_DEPENDENCY,
        description: 'Install JWT library for token handling',
        parameters: {
          packageName: 'jsonwebtoken',
          packageManager: 'npm'
        },
        dependencies: [],
        status: ActionStatus.PENDING
      }
    ],
    metadata: {
      totalActions: 5,
      estimatedDuration: 45,
      complexity: 'moderate',
      riskLevel: 'medium'
    }
  },

  'setup-testing': {
    version: '1.0',
    timestamp: new Date().toISOString(),
    actions: [
      {
        id: 'test_1',
        type: ActionType.INSTALL_DEPENDENCY,
        description: 'Install testing dependencies',
        parameters: {
          packageName: '@testing-library/react @testing-library/jest-dom',
          packageManager: 'npm',
          isDev: true
        },
        dependencies: [],
        status: ActionStatus.PENDING
      },
      {
        id: 'test_2',
        type: ActionType.CREATE_FILE,
        description: 'Create test setup file',
        parameters: {
          filePath: 'src/setupTests.ts',
          language: 'typescript'
        },
        dependencies: ['test_1'],
        status: ActionStatus.PENDING
      },
      {
        id: 'test_3',
        type: ActionType.CREATE_FILE,
        description: 'Create App component test',
        parameters: {
          filePath: 'src/App.test.tsx',
          language: 'typescript'
        },
        dependencies: ['test_2'],
        status: ActionStatus.PENDING
      },
      {
        id: 'test_4',
        type: ActionType.RUN_COMMAND,
        description: 'Run initial test suite',
        parameters: {
          command: 'npm test',
          workingDirectory: '.'
        },
        dependencies: ['test_3'],
        status: ActionStatus.PENDING
      }
    ],
    metadata: {
      totalActions: 4,
      estimatedDuration: 20,
      complexity: 'simple',
      riskLevel: 'low'
    }
  }
};

export function createMockActionList(scenario: keyof typeof mockActionLists): ActionList {
  return JSON.parse(JSON.stringify(mockActionLists[scenario])); // Deep clone
}