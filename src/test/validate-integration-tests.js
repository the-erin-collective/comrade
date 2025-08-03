/**
 * Validation script for integration tests
 * Ensures all integration tests are properly structured and can be executed
 */

const fs = require('fs');
const path = require('path');

const integrationTestsDir = path.join(__dirname, 'integration');
const expectedTests = [
  'anthropic-provider-integration.test.ts',
  'streaming-integration.test.ts', 
  'tool-calling-integration.test.ts',
  'availability-caching-load.test.ts',
  'comprehensive-integration.test.ts'
];

console.log('🔍 Validating integration tests...\n');

// Check if all expected test files exist
const missingTests = [];
const existingTests = [];

expectedTests.forEach(testFile => {
  const testPath = path.join(integrationTestsDir, testFile);
  if (fs.existsSync(testPath)) {
    existingTests.push(testFile);
    console.log(`✅ ${testFile} - Found`);
  } else {
    missingTests.push(testFile);
    console.log(`❌ ${testFile} - Missing`);
  }
});

console.log(`\n📊 Test Files Summary:`);
console.log(`   Found: ${existingTests.length}/${expectedTests.length}`);
console.log(`   Missing: ${missingTests.length}`);

// Validate test structure for existing tests
console.log('\n🔬 Validating test structure...\n');

const requiredImports = [
  'import * as assert from \'assert\'',
  'import * as sinon from \'sinon\''
];

const requiredTestPatterns = [
  /suite\(['"`][^'"`]+['"`],\s*\(\)\s*=>\s*{/,
  /test\(['"`][^'"`]+['"`],\s*async\s*\(\)\s*=>\s*{/,
  /setup\(async\s*\(\)\s*=>\s*{/,
  /teardown\(\(\)\s*=>\s*{/
];

existingTests.forEach(testFile => {
  const testPath = path.join(integrationTestsDir, testFile);
  const content = fs.readFileSync(testPath, 'utf8');
  
  console.log(`📝 Validating ${testFile}:`);
  
  // Check required imports
  const hasRequiredImports = requiredImports.every(importStatement => 
    content.includes(importStatement)
  );
  console.log(`   Imports: ${hasRequiredImports ? '✅' : '❌'}`);
  
  // Check test structure patterns
  const hasValidStructure = requiredTestPatterns.every(pattern => 
    pattern.test(content)
  );
  console.log(`   Structure: ${hasValidStructure ? '✅' : '❌'}`);
  
  // Count test cases
  const testCases = (content.match(/test\(['"`][^'"`]+['"`],\s*async\s*\(\)\s*=>\s*{/g) || []).length;
  console.log(`   Test cases: ${testCases}`);
  
  // Check for async/await usage
  const hasAsyncAwait = content.includes('await ') && content.includes('async ');
  console.log(`   Async/Await: ${hasAsyncAwait ? '✅' : '❌'}`);
  
  // Check for proper cleanup
  const hasCleanup = content.includes('sandbox.restore()') && content.includes('resetInstance()');
  console.log(`   Cleanup: ${hasCleanup ? '✅' : '❌'}`);
  
  console.log('');
});

// Validate test coverage areas
console.log('🎯 Validating test coverage areas...\n');

const coverageAreas = {
  'Anthropic Provider': {
    file: 'anthropic-provider-integration.test.ts',
    requiredTests: [
      'format Anthropic API requests',
      'handle Anthropic system message conversion',
      'handle Anthropic streaming responses',
      'handle Anthropic-specific error codes',
      'validate Anthropic connection'
    ]
  },
  'Streaming': {
    file: 'streaming-integration.test.ts', 
    requiredTests: [
      'handle OpenAI streaming format',
      'handle Anthropic streaming format',
      'handle Ollama streaming format',
      'handle custom provider streaming format',
      'handle streaming errors gracefully'
    ]
  },
  'Tool Calling': {
    file: 'tool-calling-integration.test.ts',
    requiredTests: [
      'register and execute file system tools',
      'handle tool execution with parameter validation',
      'handle tool security approval workflow',
      'handle multiple tool calls in sequence',
      'handle tool execution errors gracefully'
    ]
  },
  'Availability Caching': {
    file: 'availability-caching-load.test.ts',
    requiredTests: [
      'handle high-frequency availability checks efficiently',
      'handle concurrent availability checks',
      'handle cache expiration and refresh under load',
      'handle cache memory usage efficiently',
      'handle cache performance under stress'
    ]
  },
  'Comprehensive Integration': {
    file: 'comprehensive-integration.test.ts',
    requiredTests: [
      'handle complete Anthropic workflow',
      'handle cross-provider streaming with fallback',
      'handle complex tool calling workflow',
      'handle system-wide load and stress testing',
      'validate complete system integration'
    ]
  }
};

Object.entries(coverageAreas).forEach(([area, config]) => {
  const testPath = path.join(integrationTestsDir, config.file);
  
  if (fs.existsSync(testPath)) {
    const content = fs.readFileSync(testPath, 'utf8');
    const foundTests = config.requiredTests.filter(testName => 
      content.includes(testName) || content.toLowerCase().includes(testName.toLowerCase())
    );
    
    console.log(`📋 ${area}:`);
    console.log(`   File: ${config.file}`);
    console.log(`   Required tests: ${config.requiredTests.length}`);
    console.log(`   Found tests: ${foundTests.length}`);
    console.log(`   Coverage: ${Math.round((foundTests.length / config.requiredTests.length) * 100)}%`);
    
    if (foundTests.length < config.requiredTests.length) {
      const missingTests = config.requiredTests.filter(test => !foundTests.includes(test));
      console.log(`   Missing: ${missingTests.join(', ')}`);
    }
    console.log('');
  } else {
    console.log(`❌ ${area}: File ${config.file} not found\n`);
  }
});

// Generate summary report
console.log('📈 Integration Tests Summary Report\n');
console.log('=' .repeat(50));

const totalExpectedTests = Object.values(coverageAreas).reduce((sum, area) => sum + area.requiredTests.length, 0);
let totalFoundTests = 0;

Object.values(coverageAreas).forEach(config => {
  const testPath = path.join(integrationTestsDir, config.file);
  if (fs.existsSync(testPath)) {
    const content = fs.readFileSync(testPath, 'utf8');
    const foundTests = config.requiredTests.filter(testName => 
      content.includes(testName) || content.toLowerCase().includes(testName.toLowerCase())
    );
    totalFoundTests += foundTests.length;
  }
});

console.log(`Test Files: ${existingTests.length}/${expectedTests.length} (${Math.round((existingTests.length / expectedTests.length) * 100)}%)`);
console.log(`Test Coverage: ${totalFoundTests}/${totalExpectedTests} (${Math.round((totalFoundTests / totalExpectedTests) * 100)}%)`);

if (missingTests.length === 0 && totalFoundTests === totalExpectedTests) {
  console.log('\n🎉 All integration tests are properly implemented!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some integration tests need attention.');
  if (missingTests.length > 0) {
    console.log(`Missing files: ${missingTests.join(', ')}`);
  }
  if (totalFoundTests < totalExpectedTests) {
    console.log(`Missing ${totalExpectedTests - totalFoundTests} test cases`);
  }
  process.exit(1);
}